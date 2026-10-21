import {
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
  type InfiniteData,
} from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import {
  CORE_TAG_SCOPE,
  optimisticQueriesUpdate,
  optimisticQueryUpdate,
  runTaggedMutation,
  runTaggedRead,
  taggedQueryOptions,
  TaggedQueryClient,
  type TaggedMutationOutcome,
  type TaggedOptimisticUpdate,
} from "../src/index.js";

type Row = { id: string; pinnedAt: number | null; status: string };
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

function client() {
  const result = new TaggedQueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  disposers.push(() => result.clear());
  return result;
}

function write(client: QueryClient, optimistic: TaggedOptimisticUpdate[]) {
  let settle!: (outcome: TaggedMutationOutcome<number> | Error) => void;
  const done = runTaggedMutation(
    async () => {},
    () =>
      new Promise<TaggedMutationOutcome<number>>((resolve, reject) => {
        settle = (outcome) =>
          outcome instanceof Error ? reject(outcome) : resolve(outcome);
      }),
    { client, optimistic },
  ).catch(() => {});
  return {
    accept: async (pinnedAt: number) => {
      settle({ result: pinnedAt, invalidated: [] });
      await done;
    },
    fail: async () => {
      settle(new Error("refused"));
      await done;
    },
  };
}

const pinRows = (id: string, predicted: number) =>
  optimisticQueriesUpdate<Row[], number>(["rows"], (rows, result) =>
    rows.map((row) =>
      row.id === id ? { ...row, pinnedAt: result?.value ?? predicted } : row,
    ),
  );

function observe(client: QueryClient, queryKey: string[], rows: () => Row[]) {
  const observer = new QueryObserver<Row[]>(client, {
    queryKey,
    ...taggedQueryOptions(client, queryKey, {
      scope: CORE_TAG_SCOPE,
      tagsOf: () => [],
    }),
    queryFn: () =>
      runTaggedRead(client, queryKey, async () => structuredClone(rows())),
  });
  disposers.push(observer.subscribe(() => {}));
  return observer;
}

it("predicts on matching reads that load while the write is pending", async () => {
  const cache = client();
  const server: Row[] = [{ id: "a", pinnedAt: null, status: "idle" }];
  await observe(cache, ["rows", "first"], () => server).refetch();
  const pending = write(cache, [pinRows("a", 100)]);

  await observe(cache, ["rows", "late"], () => server).refetch();
  expect(cache.getQueryData<Row[]>(["rows", "late"])?.[0]?.pinnedAt).toBe(100);

  await pending.fail();
  expect(cache.getQueryData<Row[]>(["rows", "late"])?.[0]?.pinnedAt).toBeNull();
  expect(
    cache.getQueryData<Row[]>(["rows", "first"])?.[0]?.pinnedAt,
  ).toBeNull();
});

it("shows the acknowledged value in place of the prediction", async () => {
  const cache = client();
  const server: Row[] = [{ id: "a", pinnedAt: null, status: "idle" }];
  await observe(cache, ["rows", "first"], () => server).refetch();
  const pending = write(cache, [pinRows("a", 100)]);

  await pending.accept(250);

  expect(cache.getQueryData<Row[]>(["rows", "first"])?.[0]?.pinnedAt).toBe(250);
});

it("keeps writes to a cache without a read and settles to the acknowledged value", async () => {
  const cache = new QueryClient();
  disposers.push(() => cache.clear());
  cache.setQueryData<Row[]>(
    ["rows"],
    [{ id: "a", pinnedAt: null, status: "idle" }],
  );
  const failed = write(cache, [pinRows("a", 100)]);
  cache.setQueryData<Row[]>(["rows"], (rows) =>
    rows?.map((row) => ({ ...row, status: "running" })),
  );
  await failed.fail();
  expect(cache.getQueryData(["rows"])).toEqual([
    { id: "a", pinnedAt: null, status: "running" },
  ]);

  const accepted = write(cache, [pinRows("a", 100)]);
  await accepted.accept(300);
  cache.setQueryData<Row[]>(["rows"], (rows) =>
    rows?.map((row) => ({ ...row, status: "idle" })),
  );
  expect(cache.getQueryData(["rows"])).toEqual([
    { id: "a", pinnedAt: 300, status: "idle" },
  ]);
});

it("releases an accepted infinite-list prediction only after every page is reread", async () => {
  const cache = client();
  const queryKey = ["rows", "pages"];
  const pages: Row[][] = [
    [{ id: "a", pinnedAt: null, status: "idle" }],
    [{ id: "b", pinnedAt: null, status: "idle" }],
  ];
  const observer = new InfiniteQueryObserver<
    Row[],
    Error,
    InfiniteData<Row[], number>,
    string[],
    number
  >(cache, {
    queryKey,
    ...taggedQueryOptions(cache, queryKey, {
      scope: CORE_TAG_SCOPE,
      tagsOf: () => [],
    }),
    queryFn: ({ pageParam }) =>
      runTaggedRead(cache, queryKey, async () =>
        structuredClone(pages[pageParam] ?? []),
      ),
    initialPageParam: 0,
    getNextPageParam: (_last, all) => (all.length < 2 ? all.length : undefined),
  });
  disposers.push(observer.subscribe(() => {}));
  await observer.refetch();
  const pinnedAt = () =>
    cache
      .getQueryData<InfiniteData<Row[]>>(queryKey)
      ?.pages.flat()
      .map((row) => row.pinnedAt);
  const pending = write(cache, [
    optimisticQueryUpdate<InfiniteData<Row[]>, number>(
      queryKey,
      (data, result) => ({
        ...data,
        pages: data.pages.map((page) =>
          page.map((row) =>
            row.id === "a" ? { ...row, pinnedAt: result?.value ?? 100 } : row,
          ),
        ),
      }),
    ),
  ]);
  await pending.accept(200);

  await observer.fetchNextPage();
  expect(pinnedAt()).toEqual([200, null]);

  pages[0] = [{ id: "a", pinnedAt: 400, status: "idle" }];
  await observer.refetch();
  expect(pinnedAt()).toEqual([400, null]);
});

it("leaves predictions alone when an observer selects from the query", async () => {
  const cache = client();
  const queryKey = ["rows", "selected"];
  const server: Row[] = [{ id: "a", pinnedAt: null, status: "idle" }];
  await observe(cache, queryKey, () => server).refetch();
  const selected = new QueryObserver<Row[], Error, string[]>(cache, {
    queryKey,
    ...taggedQueryOptions(cache, queryKey, {
      scope: CORE_TAG_SCOPE,
      tagsOf: () => [],
    }),
    enabled: false,
    select: (rows) => rows.map((row) => `${row.id}:${row.pinnedAt}`),
  });
  disposers.push(selected.subscribe(() => {}));
  const pending = write(cache, [pinRows("a", 100)]);
  expect(selected.getCurrentResult().data).toEqual(["a:100"]);

  await pending.fail();

  expect(cache.getQueryData(queryKey)).toEqual(server);
  expect(selected.getCurrentResult().data).toEqual(["a:null"]);
});
