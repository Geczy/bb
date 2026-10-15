// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createRpcQueryHooks,
  invalidateRpcQueries,
  type RpcQueryHost,
} from "../../internal/rpc-query-host.js";
import { defineRpcContract } from "../../rpc-contract.js";

const contract = defineRpcContract({
  read: { input: z.object({ id: z.string() }), output: z.number() },
});
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

function setup(call: RpcQueryHost["call"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  clients.push(queryClient);
  const release = vi.fn();
  const host: RpcQueryHost = {
    pluginId: "producer",
    queryClient,
    call: vi.fn(call),
    subscribeRead: vi.fn(() => release),
  };
  const hooks = createRpcQueryHooks(() => host);
  return { host, hooks, queryClient, release };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("tagged RPC query ownership", () => {
  it("fills a cold keyed view from its list read and keeps warm refreshes IDs-only", async () => {
    const listContract = defineRpcContract({
      list: {
        input: z.null(),
        output: z.object({ keys: z.array(z.string()) }),
      },
    });
    let value = 1;
    const { hooks, host, queryClient } = setup(
      async (_plugin, method, _input, _signal, warm) =>
        method === "list"
          ? {
              result: { keys: ["a"] },
              tags: ["membership"],
              ...(warm?.includes("keyed")
                ? {}
                : {
                    providedKeyed: {
                      keyed: {
                        result: { a: value },
                        keyTags: { a: ["item:a"] },
                        whileWatched: true,
                      },
                    },
                  }),
            }
          : {
              result: { a: value },
              keyTags: { a: ["item:a"] },
              whileWatched: true,
            },
    );
    const mounted = renderHook(() => {
      const list = hooks.experimental_useRpcQuery<typeof listContract, "list">({
        method: "list",
        input: null,
      });
      const rows = hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: list.data?.keys ?? [],
      });
      return { list, rows };
    });
    await waitFor(() =>
      expect(mounted.result.current.rows.data).toEqual({ a: 1 }),
    );
    expect(vi.mocked(host.call).mock.calls.map((call) => call[1])).toEqual([
      "list",
    ]);
    expect(
      vi
        .mocked(host.subscribeRead)
        .mock.calls.some((call) => call[1] === "keyed" && call[3]),
    ).toBe(true);
    await act(async () => mounted.result.current.list.refetch());
    expect(vi.mocked(host.call).mock.calls.at(-1)?.[4]).toEqual(["keyed"]);
    expect(vi.mocked(host.call).mock.calls.map((call) => call[1])).toEqual([
      "list",
      "list",
    ]);
    value = 2;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() =>
      expect(mounted.result.current.rows.data).toEqual({ a: 2 }),
    );
    expect(vi.mocked(host.call).mock.calls.map((call) => call[1])).toEqual([
      "list",
      "list",
      "keyed",
    ]);
  });

  it("merges separately arriving list seeds before a keyed view subscribes", async () => {
    const { hooks, host } = setup(async (_plugin, _method, input) => {
      const { id } = z.object({ id: z.string() }).parse(input);
      return {
        result: 1,
        tags: ["membership"],
        providedKeyed: {
          keyed: {
            result: { [id]: id === "a" ? 1 : 2 },
            keyTags: { [id]: [`item:${id}`] },
            whileWatched: false,
          },
        },
      };
    });
    const first = renderHook(() =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
    );
    await waitFor(() => expect(first.result.current.data).toBe(1));
    await act(async () => {});
    const second = renderHook(() =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "b" },
      }),
    );
    await waitFor(() => expect(second.result.current.data).toBe(1));
    await act(async () => {});
    const rows = renderHook(() =>
      hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: ["a", "b"],
      }),
    );
    expect(rows.result.current.data).toEqual({ a: 1, b: 2 });
    expect(host.call).toHaveBeenCalledTimes(2);
  });

  it("keeps an independently loaded keyed value when a cold seed arrives later", async () => {
    const seed = deferred<void>();
    const { hooks, host } = setup(async (_plugin, method) => {
      if (method === "keyed")
        return { result: { a: 2 }, keyTags: { a: ["item:a"] } };
      await seed.promise;
      return {
        result: 1,
        providedKeyed: {
          keyed: {
            result: { a: 1 },
            keyTags: { a: ["item:a"] },
            whileWatched: false,
          },
        },
      };
    });
    const list = renderHook(() =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
    );
    await waitFor(() => expect(host.call).toHaveBeenCalledTimes(1));
    const rows = renderHook(() =>
      hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: ["a"],
      }),
    );
    await waitFor(() => expect(rows.result.current.data).toEqual({ a: 2 }));
    await act(async () => seed.resolve());
    await waitFor(() => expect(list.result.current.data).toBe(1));
    expect(rows.result.current.data).toEqual({ a: 2 });
  });

  it("rejects supplied rows overtaken by an invalidation outside the list's tags", async () => {
    const listContract = defineRpcContract({
      list: {
        input: z.null(),
        output: z.object({ keys: z.array(z.string()) }),
      },
    });
    const next = deferred<{
      result: { keys: string[] };
      tags: string[];
      providedKeyed: Record<
        string,
        {
          result: Record<string, number>;
          keyTags: Record<string, string[]>;
          whileWatched: boolean;
        }
      >;
    }>();
    let reads = 0;
    const { hooks, queryClient } = setup(async (_plugin, method) =>
      method === "keyed"
        ? { result: { a: 2 }, keyTags: { a: ["item:a"] } }
        : ++reads === 1
          ? { result: { keys: [] }, tags: ["membership"] }
          : next.promise,
    );
    const seen: number[] = [];
    const mounted = renderHook(() => {
      const list = hooks.experimental_useRpcQuery<typeof listContract, "list">({
        method: "list",
        input: null,
      });
      const rows = hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: list.data?.keys ?? [],
      });
      if (rows.data?.a !== undefined) seen.push(rows.data.a);
      return { list, rows };
    });
    await waitFor(() =>
      expect(mounted.result.current.list.data).toEqual({ keys: [] }),
    );
    let refresh: Promise<void>;
    act(() => {
      refresh = mounted.result.current.list.refetch();
    });
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await act(async () => {
      next.resolve({
        result: { keys: ["a"] },
        tags: ["membership"],
        providedKeyed: {
          keyed: {
            result: { a: 1 },
            keyTags: { a: ["item:a"] },
            whileWatched: false,
          },
        },
      });
      await refresh;
    });
    await waitFor(() =>
      expect(mounted.result.current.rows.data).toEqual({ a: 2 }),
    );
    expect(seen).not.toContain(1);
  });

  it("shares identical reads and refreshes matching tags across consumers", async () => {
    let value = 1;
    const { host, hooks, queryClient, release } = setup(async () => ({
      result: value,
      tags: ["item:a"],
    }));
    const mounted = renderHook(() => [
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
    ]);
    await waitFor(() =>
      expect(mounted.result.current.map((query) => query.data)).toEqual([1, 1]),
    );
    expect(host.call).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()[0]?.getObserversCount()).toBe(
      1,
    );
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:b"]));
    expect(host.call).toHaveBeenCalledTimes(1);
    value = 2;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() =>
      expect(mounted.result.current.map((query) => query.data)).toEqual([2, 2]),
    );
    expect(host.call).toHaveBeenCalledTimes(2);
    mounted.unmount();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("drops an overtaken first result and coalesces changes into one trailing read", async () => {
    const first = deferred<{ result: number; tags: string[] }>();
    let calls = 0;
    const { host, hooks, queryClient } = setup(async () =>
      ++calls === 1 ? first.promise : { result: 2, tags: ["item:a"] },
    );
    const mounted = renderHook(() =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
    );
    await waitFor(() => expect(host.call).toHaveBeenCalledTimes(1));
    act(() => {
      for (let i = 0; i < 20; i++)
        invalidateRpcQueries(queryClient, "producer", ["item:a"]);
    });
    await act(async () => first.resolve({ result: 1, tags: ["item:a"] }));
    await waitFor(() => expect(mounted.result.current.data).toBe(2));
    expect(host.call).toHaveBeenCalledTimes(2);
  });

  it("retains the last result on failure and keeps caches separate between clients", async () => {
    let failing = false;
    const first = setup(async () => {
      if (failing) throw new Error("offline");
      return { result: 1, tags: ["item:a"] };
    });
    const second = setup(async () => ({ result: 7, tags: ["item:a"] }));
    const mounted = renderHook(() => [
      first.hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
      second.hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
      }),
    ]);
    await waitFor(() =>
      expect(mounted.result.current.map((query) => query.data)).toEqual([1, 7]),
    );
    failing = true;
    act(() => invalidateRpcQueries(first.queryClient, "producer", null));
    await waitFor(() =>
      expect(mounted.result.current[0]?.error?.message).toBe("offline"),
    );
    expect(mounted.result.current.map((query) => query.data)).toEqual([1, 7]);
    expect(second.host.call).toHaveBeenCalledTimes(1);
  });

  it("batches overlapping keys and re-reads only matching or missing keys", async () => {
    let value = 1;
    const batches: string[][] = [];
    const { hooks, queryClient, host, release } = setup(
      async (_plugin, _method, input) => {
        const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
        batches.push(keys);
        return {
          result: Object.fromEntries(keys.map((key) => [key, value])),
          tags: [],
          keyTags: Object.fromEntries(
            keys.map((key) => [key, [`item:${key}`]]),
          ),
        };
      },
    );
    const mounted = renderHook(
      ({ keys }) => [
        hooks.experimental_useRpcKeyedQuery<number>({ method: "keyed", keys }),
        hooks.experimental_useRpcKeyedQuery<number>({
          method: "keyed",
          keys: ["b"],
        }),
      ],
      { initialProps: { keys: ["a", "b"] } },
    );
    await waitFor(() =>
      expect(mounted.result.current[0]?.data).toEqual({ a: 1, b: 1 }),
    );
    expect(batches).toEqual([["a", "b"]]);
    const heldReads = vi.mocked(host.subscribeRead).mock.calls.length;
    mounted.rerender({ keys: ["b", "a"] });
    expect(release).not.toHaveBeenCalled();
    expect(host.subscribeRead).toHaveBeenCalledTimes(heldReads);
    value = 2;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() =>
      expect(mounted.result.current[0]?.data).toEqual({ a: 2, b: 1 }),
    );
    expect(batches.at(-1)).toEqual(["a"]);
    const loaded = mounted.result.current[0]?.data;
    mounted.rerender({ keys: ["a", "b", "c"] });
    expect(mounted.result.current[0]?.data).toBe(loaded);
    await waitFor(() =>
      expect(mounted.result.current[0]?.data).toEqual({ a: 2, b: 1, c: 2 }),
    );
    expect(batches.at(-1)).toEqual(["c"]);
  });

  it("keeps cached rows across a single view's subscription handoff", async () => {
    const batches: string[][] = [];
    const { hooks } = setup(async (_plugin, _method, input) => {
      const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
      batches.push(keys);
      return { result: Object.fromEntries(keys.map((key) => [key, 1])) };
    });
    const mounted = renderHook(
      ({ keys }) =>
        hooks.experimental_useRpcKeyedQuery<number>({ method: "keyed", keys }),
      { initialProps: { keys: ["a", "b"] } },
    );
    await waitFor(() =>
      expect(mounted.result.current.data).toEqual({ a: 1, b: 1 }),
    );
    mounted.rerender({ keys: ["a"] });
    mounted.rerender({ keys: ["a", "b", "c"] });
    await waitFor(() =>
      expect(mounted.result.current.data).toEqual({ a: 1, b: 1, c: 1 }),
    );
    expect(batches).toEqual([["a", "b"], ["c"]]);
  });

  it("restores cached keyed rows and refreshes changes received while unobserved", async () => {
    const next = deferred<{
      result: Record<string, number>;
      tags: string[];
      keyTags: Record<string, string[]>;
    }>();
    let reads = 0;
    const { hooks, queryClient } = setup(async (_plugin, method) => {
      if (method === "read") return { result: 0, tags: [] };
      if (++reads > 1) return next.promise;
      return { result: { a: 1 }, tags: [], keyTags: { a: ["item:a"] } };
    });
    renderHook(() =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "anchor" },
      }),
    );
    const mount = () =>
      renderHook(() =>
        hooks.experimental_useRpcKeyedQuery<number>({
          method: "keyed",
          keys: ["a"],
        }),
      );
    const first = mount();
    await waitFor(() => expect(first.result.current.data).toEqual({ a: 1 }));
    await act(async () => {});
    first.unmount();
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    const second = mount();
    expect(second.result.current.data).toEqual({ a: 1 });
    await waitFor(() => expect(reads).toBe(2));
    await act(async () =>
      next.resolve({ result: { a: 2 }, tags: [], keyTags: { a: ["item:a"] } }),
    );
    await waitFor(() => expect(second.result.current.data).toEqual({ a: 2 }));
  });

  it("releases dormant keyed invalidation metadata while retaining rows for immediate return", async () => {
    let value = 1;
    const { hooks, queryClient } = setup(async () => ({
      result: { a: value },
      tags: ["items"],
      keyTags: { a: ["item:a"] },
    }));
    const mount = () =>
      renderHook(() =>
        hooks.experimental_useRpcKeyedQuery<number>({
          method: "keyed",
          keys: ["a"],
        }),
      );
    const first = mount();
    await waitFor(() => expect(first.result.current.data).toEqual({ a: 1 }));
    first.unmount();
    await act(async () => {});
    const cached = queryClient.getQueryCache().getAll()[0]?.state.data;
    expect(cached).toEqual({
      result: { a: 1 },
      tags: [],
      keyTags: {},
      whileWatched: false,
    });
    expect(await queryClient.getQueryCache().getAll()[0]?.promise).toEqual(
      cached,
    );
    value = 2;
    const second = mount();
    expect(second.result.current.data).toEqual({ a: 1 });
    await waitFor(() => expect(second.result.current.data).toEqual({ a: 2 }));
    value = 3;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() => expect(second.result.current.data).toEqual({ a: 3 }));
  });

  it("keeps a shared read active when another consumer disables or leaves", async () => {
    let value = 1;
    const { hooks, queryClient } = setup(async () => ({
      result: value,
      tags: ["item:a"],
    }));
    const read = (enabled: boolean) =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
        enabled,
      });
    const first = renderHook(({ enabled }) => read(enabled), {
      initialProps: { enabled: true },
    });
    const second = renderHook(() => read(true));
    await waitFor(() => expect(second.result.current.data).toBe(1));
    first.rerender({ enabled: false });
    value = 2;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() => expect(second.result.current.data).toBe(2));
    first.unmount();
    value = 3;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
    await waitFor(() => expect(second.result.current.data).toBe(3));
  });

  it.each(["normal", "keyed"] as const)(
    "revalidates cached %s reads after the last consumer leaves",
    async (kind) => {
      let value = 1;
      const { hooks, host } = setup(async (_plugin, _method, input) => ({
        result:
          kind === "normal"
            ? value
            : Object.fromEntries(
                z
                  .object({ keys: z.array(z.string()) })
                  .parse(input)
                  .keys.map((key) => [key, value]),
              ),
        tags: ["item:a"],
      }));
      const read = () =>
        kind === "normal"
          ? hooks.experimental_useRpcQuery<typeof contract, "read">({
              method: "read",
              input: { id: "a" },
            }).data
          : hooks.experimental_useRpcKeyedQuery<number>({
              method: "keyed",
              keys: ["a"],
            }).data?.a;
      const first = renderHook(read);
      await waitFor(() => expect(first.result.current).toBe(1));
      first.unmount();
      await act(async () => {});
      value = 2;
      const second = renderHook(read);
      await waitFor(() => expect(second.result.current).toBe(2));
      expect(host.call).toHaveBeenCalledTimes(2);
    },
  );

  it("drops a keyed response invalidated while its batch is running", async () => {
    const pending = deferred<{
      result: Record<string, number>;
      tags: string[];
      keyTags: Record<string, string[]>;
    }>();
    let calls = 0;
    const { hooks, queryClient } = setup(async () =>
      ++calls === 1
        ? pending.promise
        : { result: { a: 2 }, tags: [], keyTags: { a: ["item:a"] } },
    );
    const mounted = renderHook(() =>
      hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: ["a"],
      }),
    );
    await waitFor(() => expect(calls).toBe(1));
    act(() => {
      for (let i = 0; i < 10; i++)
        invalidateRpcQueries(queryClient, "producer", ["item:a"]);
    });
    await act(async () =>
      pending.resolve({
        result: { a: 1 },
        tags: [],
        keyTags: { a: ["item:a"] },
      }),
    );
    await waitFor(() => expect(mounted.result.current.data).toEqual({ a: 2 }));
    expect(calls).toBe(2);
  });

  it("splits a large board into bounded batches", async () => {
    const batches: number[] = [];
    const first = deferred<void>();
    let version = 1;
    const { hooks, queryClient } = setup(async (_plugin, _method, input) => {
      const { keys } = z
        .object({ keys: z.array(z.string()).max(500) })
        .parse(input);
      batches.push(keys.length);
      if (batches.length === 1) await first.promise;
      return {
        result: Object.fromEntries(
          keys.map((key) => [key, `${key}:${version}`]),
        ),
        tags: [],
        keyTags: Object.fromEntries(keys.map((key) => [key, [`item:${key}`]])),
      };
    });
    const keys = Array.from({ length: 1001 }, (_, index) => String(index));
    const mounted = renderHook(() =>
      hooks.experimental_useRpcKeyedQuery<string>({ method: "keyed", keys }),
    );
    await waitFor(() => expect(batches).toEqual([500, 500, 1]));
    await waitFor(() =>
      expect(Object.keys(mounted.result.current.data ?? {})).toHaveLength(501),
    );
    expect(mounted.result.current.isLoading).toBe(true);
    await act(async () => first.resolve());
    await waitFor(() =>
      expect(Object.keys(mounted.result.current.data ?? {})).toHaveLength(1001),
    );
    expect(batches).toEqual([500, 500, 1]);
    version = 2;
    act(() => invalidateRpcQueries(queryClient, "producer", ["item:0"]));
    await waitFor(() => expect(mounted.result.current.data?.["0"]).toBe("0:2"));
    expect(batches).toEqual([500, 500, 1, 1]);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    expect(queryClient.getQueryCache().getAll()[0]?.getObserversCount()).toBe(
      1,
    );
  });
});

it("only enables producer interest when a response advertises whileWatched", async () => {
  let interested = false;
  const { host, hooks, queryClient } = setup(async () => ({
    result: 1,
    tags: ["item:a"],
    whileWatched: interested,
  }));
  const mounted = renderHook(() =>
    hooks.experimental_useRpcQuery<typeof contract, "read">({
      method: "read",
      input: { id: "a" },
    }),
  );
  await waitFor(() => expect(mounted.result.current.data).toBe(1));
  expect(host.subscribeRead).toHaveBeenLastCalledWith(
    "producer",
    "read",
    [{ input: { id: "a" } }],
    false,
  );
  interested = true;
  act(() => invalidateRpcQueries(queryClient, "producer", null));
  await waitFor(() =>
    expect(host.subscribeRead).toHaveBeenLastCalledWith(
      "producer",
      "read",
      [{ input: { id: "a" } }],
      true,
    ),
  );
  interested = false;
  act(() => invalidateRpcQueries(queryClient, "producer", null));
  await waitFor(() =>
    expect(host.subscribeRead).toHaveBeenLastCalledWith(
      "producer",
      "read",
      [{ input: { id: "a" } }],
      false,
    ),
  );
});

it("serves newly observed keys while an earlier batch is still pending", async () => {
  const slow = deferred<{ result: Record<string, number>; tags: string[] }>();
  const { hooks } = setup(async (_plugin, _method, input) => {
    const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
    return keys.includes("slow")
      ? slow.promise
      : { result: { fast: 2 }, tags: [] };
  });
  const mounted = renderHook(
    ({ keys }) =>
      hooks.experimental_useRpcKeyedQuery<number>({ method: "keyed", keys }),
    { initialProps: { keys: ["slow"] } },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  mounted.rerender({ keys: ["fast"] });
  await waitFor(() => expect(mounted.result.current.data).toEqual({ fast: 2 }));
  expect(mounted.result.current.isLoading).toBe(false);
  await act(async () => slow.resolve({ result: { slow: 1 }, tags: [] }));
});

it("combines new keys from overlapping views before issuing a read", async () => {
  const batches: string[][] = [];
  const { hooks } = setup(async (_plugin, _method, input) => {
    const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
    batches.push(keys);
    return {
      result: Object.fromEntries(keys.map((key) => [key, key])),
      tags: [],
    };
  });
  const mounted = renderHook(() => [
    hooks.experimental_useRpcKeyedQuery({ method: "keyed", keys: ["a", "b"] }),
    hooks.experimental_useRpcKeyedQuery({ method: "keyed", keys: ["b", "c"] }),
  ]);
  await waitFor(() =>
    expect(mounted.result.current[1]?.data).toEqual({ b: "b", c: "c" }),
  );
  expect(batches).toEqual([["a", "b", "c"]]);
});

it.each([
  undefined,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  new Date(),
  { value: undefined },
  Array(1),
  () => 1,
])("rejects non-JSON RPC result %j", async (result) => {
  const { hooks } = setup(async () => ({ result, tags: [] }));
  const mounted = renderHook(() =>
    hooks.experimental_useRpcQuery<typeof contract, "read">({
      method: "read",
      input: { id: "a" },
    }),
  );
  await waitFor(() =>
    expect(mounted.result.current.error?.message).toContain(
      "RPC result must be a JSON value",
    ),
  );
  expect(mounted.result.current.data).toBeUndefined();
});

it("does not retain query entries or observers for empty keyed views", async () => {
  const { hooks, host, queryClient } = setup(async () => ({
    result: { a: 1 },
    tags: [],
  }));
  const initialKeys: string[] = [];
  const mounted = renderHook(
    ({ keys }) =>
      hooks.experimental_useRpcKeyedQuery<number>({ method: "keyed", keys }),
    { initialProps: { keys: initialKeys } },
  );
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(host.call).not.toHaveBeenCalled();
  mounted.rerender({ keys: ["a"] });
  await waitFor(() => expect(mounted.result.current.data).toEqual({ a: 1 }));
  expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  mounted.rerender({ keys: [] });
  expect(mounted.result.current.data).toEqual({});
  expect(queryClient.getQueryCache().getAll()[0]?.getObserversCount()).toBe(0);
});

it("keeps disabled normal reads dormant and refreshes their cached value when enabled", async () => {
  const first = deferred<{ result: number; tags: string[] }>();
  let calls = 0;
  const { hooks, host, queryClient } = setup(async () =>
    ++calls === 1 ? first.promise : { result: 2, tags: ["item:a"] },
  );
  const mounted = renderHook(
    ({ enabled }) =>
      hooks.experimental_useRpcQuery<typeof contract, "read">({
        method: "read",
        input: { id: "a" },
        enabled,
      }),
    { initialProps: { enabled: false } },
  );
  expect(mounted.result.current.isLoading).toBe(false);
  expect(host.call).not.toHaveBeenCalled();
  mounted.rerender({ enabled: true });
  expect(mounted.result.current.isLoading).toBe(true);
  await act(async () => first.resolve({ result: 1, tags: ["item:a"] }));
  await waitFor(() => expect(mounted.result.current.data).toBe(1));
  mounted.rerender({ enabled: false });
  act(() => invalidateRpcQueries(queryClient, "producer", ["item:a"]));
  expect(host.call).toHaveBeenCalledTimes(1);
  expect(mounted.result.current.data).toBe(1);
  mounted.rerender({ enabled: true });
  await waitFor(() => expect(mounted.result.current.data).toBe(2));
  expect(host.call).toHaveBeenCalledTimes(2);
});
