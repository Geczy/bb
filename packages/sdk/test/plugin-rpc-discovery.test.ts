import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createBbSdk } from "../src/core.js";
import { createHttpTransport } from "../src/transport-http.js";

it("discovers published methods with filters and calls using a copied response schema", async () => {
  const requests: string[] = [];
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: async (input) => {
        const url = String(input);
        requests.push(url);
        return Response.json(
          url.includes("/rpc?")
            ? [
                {
                  pluginId: "pool",
                  displayName: "Pool",
                  method: "usage.v1.get",
                  registrationDescription: "Shared accounts",
                  methodDescription: null,
                  inputSchema: { type: "null" },
                  outputSchema: { type: "object" },
                },
              ]
            : { ok: true, result: { percent: 42 } },
        );
      },
    }),
  });
  const [source] = await sdk.plugins.experimental_discoverRpc({
    pluginId: "pool",
    method: "usage.v1.get",
  });
  expect(source?.registrationDescription).toBe("Shared accounts");
  expect(requests[0]).toContain("pluginId=pool&method=usage.v1.get");
  await expect(
    sdk.plugins.callRpc({
      pluginId: "pool",
      method: "usage.v1.get",
      input: null,
      outputSchema: z.object({ percent: z.number() }),
    }),
  ).resolves.toEqual({ percent: 42 });
  await expect(
    sdk.plugins.callRpc({
      pluginId: "pool",
      method: "usage.v1.get",
      input: null,
      outputSchema: z.object({ percent: z.string() }),
    }),
  ).rejects.toThrow();
});

it("omits absent and explicitly undefined discovery filters", async () => {
  const urls: URL[] = [];
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: async (input) => {
        urls.push(new URL(String(input)));
        return Response.json([]);
      },
    }),
  });
  await sdk.plugins.experimental_discoverRpc();
  await sdk.plugins.experimental_discoverRpc({
    method: undefined,
    pluginId: undefined,
  });
  await sdk.plugins.experimental_discoverRpc({
    pluginId: "pool",
    method: undefined,
  });
  expect(urls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
    {},
    {},
    { pluginId: "pool" },
  ]);
});

it("cancels an in-flight discovery request when its signal aborts", async () => {
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    }),
  });
  const controller = new AbortController();
  const discovery = sdk.plugins.experimental_discoverRpc({
    method: "usage.v1.get",
    signal: controller.signal,
  });
  controller.abort(new Error("unmounted"));
  await expect(discovery).rejects.toThrow("unmounted");
});

it("watches discovery changes over its subscribed socket and releases it on abort", async () => {
  const sent: string[] = [];
  let methods: {
    pluginId: string;
    displayName: string;
    method: string;
    registrationDescription: null;
    methodDescription: null;
    inputSchema: { type: string };
    outputSchema: { type: string };
  }[] = [];
  const socket: import("../src/transport.js").BbRealtimeSocket = {
    readyState: 0,
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    send: (data) => sent.push(data),
    close: vi.fn(),
  };
  const fetchMethods = vi.fn(async () => Response.json(methods));
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: fetchMethods,
      websocket: () => {
        queueMicrotask(() => {
          socket.readyState = 1;
          socket.onopen?.();
        });
        return socket;
      },
    }),
  });
  const controller = new AbortController();
  const changed = vi.fn();
  const stop = sdk.plugins.experimental_watchDiscovery({
    method: "usage",
    onChange: changed,
    signal: controller.signal,
  });
  try {
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([]));
    expect(sent.map((value) => JSON.parse(value))).toContainEqual({
      type: "subscribe",
      target: { kind: "system" },
    });
    const before = fetchMethods.mock.calls.length;
    socket.onmessage?.({
      data: JSON.stringify({
        type: "changed",
        entity: "system",
        changes: ["plugins-changed"],
      }),
    });
    await vi.waitFor(() =>
      expect(fetchMethods.mock.calls.length).toBeGreaterThan(before),
    );
    expect(changed).toHaveBeenCalledTimes(1);
    methods = [
      {
        pluginId: "source",
        displayName: "Source",
        method: "usage",
        registrationDescription: null,
        methodDescription: null,
        inputSchema: { type: "null" },
        outputSchema: { type: "number" },
      },
    ];
    socket.onmessage?.({
      data: JSON.stringify({
        type: "changed",
        entity: "system",
        changes: ["plugins-changed"],
      }),
    });
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith(methods));
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    controller.abort();
    stop();
  }
  expect(socket.close).toHaveBeenCalledTimes(1);
  const noRead = vi.fn();
  sdk.plugins.experimental_watchRpc({
    pluginId: "source",
    method: "usage",
    input: null,
    outputSchema: z.number(),
    onChange: noRead,
    signal: controller.signal,
  });
  expect(noRead).not.toHaveBeenCalled();
});

it("refreshes watched keyed results for per-key tags and replaces their dependencies", async () => {
  const socket: import("../src/transport.js").BbRealtimeSocket = {
    readyState: 0,
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    send: vi.fn(),
    close: vi.fn(),
  };
  let value = 1;
  const fetchRead = vi.fn(async () =>
    Response.json({
      ok: true,
      result: { a: value },
      tags: ["shared"],
      keyTags: { a: [`item:${value}`] },
    }),
  );
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: fetchRead,
      websocket: () => {
        queueMicrotask(() => {
          socket.readyState = 1;
          socket.onopen?.();
        });
        return socket;
      },
    }),
  });
  const controller = new AbortController();
  const changed = vi.fn();
  sdk.plugins.experimental_watchRpc({
    pluginId: "source",
    method: "byKey",
    input: { keys: ["a"] },
    outputSchema: z.record(z.string(), z.number()),
    onChange: changed,
    signal: controller.signal,
  });
  const invalidate = (tag: string) =>
    socket.onmessage?.({
      data: JSON.stringify({
        type: "changed",
        entity: "plugin",
        id: "source",
        tags: [tag],
      }),
    });
  try {
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith({ a: 1 }));
    value = 2;
    invalidate("item:1");
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith({ a: 2 }));
    const reads = fetchRead.mock.calls.length;
    invalidate("item:1");
    invalidate("unrelated");
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchRead).toHaveBeenCalledTimes(reads);
    value = 3;
    invalidate("shared");
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith({ a: 3 }));
    value = 4;
    invalidate("item:3");
    await vi.waitFor(() => expect(changed).toHaveBeenLastCalledWith({ a: 4 }));
  } finally {
    controller.abort();
  }
});

it("does not close a failed watch socket recursively while it is already closing", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const socket: import("../src/transport.js").BbRealtimeSocket = {
    readyState: 0,
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    send: vi.fn(),
    close: vi.fn(() => {
      socket.onerror?.();
      socket.readyState = 3;
      socket.onclose?.();
    }),
  };
  const sdk = createBbSdk({
    transport: createHttpTransport({
      baseUrl: "http://bb.test",
      runtime: "node",
      fetch: async () => Response.json({ ok: true, result: 1 }),
      websocket: () => socket,
    }),
  });
  const controller = new AbortController();
  const stop = sdk.plugins.experimental_watchRpc({
    pluginId: "source",
    method: "read",
    input: null,
    outputSchema: z.number(),
    signal: controller.signal,
    onChange: vi.fn(),
  });
  try {
    expect(() => socket.onerror?.()).not.toThrow();
    expect(socket.close).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  } finally {
    controller.abort();
    stop();
    log.mockRestore();
  }
});
