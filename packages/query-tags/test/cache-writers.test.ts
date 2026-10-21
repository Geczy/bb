import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CORE_TAG_SCOPE,
  TaggedQueryClient,
  optimisticQueryUpdate,
  runTaggedMutation,
  runTaggedRead,
  taggedQueryOptions,
  type TaggedMutationOutcome,
} from "../src/index.js";

type Row = { id: string; pinnedAt: number | null; status: string };
const queryKey = ["rows"];
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

const clients = [
  ["QueryClient", QueryClient],
  ["TaggedQueryClient", TaggedQueryClient],
] as const;
let Client: typeof QueryClient = TaggedQueryClient;

async function setup(rows: Row[]) {
  const client = new Client({
    defaultOptions: { queries: { retry: false } },
  });
  let server = rows;
  const observer = new QueryObserver<Row[]>(client, {
    queryKey,
    ...taggedQueryOptions(client, queryKey, {
      scope: CORE_TAG_SCOPE,
      tagsOf: () => ["rows"],
    }),
    queryFn: () =>
      runTaggedRead(client, queryKey, async () => structuredClone(server)),
  });
  disposers.push(
    observer.subscribe(() => {}),
    () => client.clear(),
  );
  await observer.refetch();
  return {
    client,
    rows: () => client.getQueryData<Row[]>(queryKey),
    setServer(next: Row[]) {
      server = next;
    },
    refetch: () => observer.refetch(),
  };
}

function pin(client: QueryClient, id: string, pinnedAt: number) {
  let fail!: (error: Error) => void;
  let accept!: () => void;
  const write = runTaggedMutation(
    async () => {},
    () =>
      new Promise<TaggedMutationOutcome<undefined>>((resolve, reject) => {
        fail = reject;
        accept = () => resolve({ result: undefined, invalidated: [] });
      }),
    {
      client,
      optimistic: [
        optimisticQueryUpdate<Row[]>(queryKey, (rows) =>
          rows.map((row) => (row.id === id ? { ...row, pinnedAt } : row)),
        ),
      ],
    },
  ).catch(() => {});
  return {
    fail: async () => {
      fail(new Error("refused"));
      await write;
    },
    accept: async () => {
      accept();
      await write;
    },
  };
}

const patch = (id: string, change: Partial<Row>) => (rows?: Row[]) =>
  rows?.map((row) => (row.id === id ? { ...row, ...change } : row));

describe.each(clients)("%s", (_name, ClientClass) => {
  beforeEach(() => {
    Client = ClientClass;
  });
  afterEach(() => {
    Client = TaggedQueryClient;
  });

  it("rolls back a prediction under an unrelated cache write", async () => {
    const cache = await setup([{ id: "a", pinnedAt: null, status: "idle" }]);
    const write = pin(cache.client, "a", 100);
    cache.client.setQueryData(queryKey, patch("a", { status: "running" }));
    expect(cache.rows()).toEqual([
      { id: "a", pinnedAt: 100, status: "running" },
    ]);

    await write.fail();

    expect(cache.rows()).toEqual([
      { id: "a", pinnedAt: null, status: "running" },
    ]);
  });

  it("keeps a foreign write to the predicted field after rollback", async () => {
    const cache = await setup([{ id: "a", pinnedAt: null, status: "idle" }]);
    const write = pin(cache.client, "a", 100);
    cache.client.setQueryData(queryKey, patch("a", { pinnedAt: 200 }));

    await write.fail();

    expect(cache.rows()).toEqual([{ id: "a", pinnedAt: 200, status: "idle" }]);
  });

  it("rolls back a prediction under a restored snapshot taken while it was visible", async () => {
    const cache = await setup([
      { id: "a", pinnedAt: null, status: "idle" },
      { id: "b", pinnedAt: null, status: "idle" },
    ]);
    const write = pin(cache.client, "a", 100);
    const snapshot = cache.rows();
    cache.client.setQueryData<Row[]>(queryKey, (rows) =>
      rows?.filter((row) => row.id !== "b"),
    );
    cache.client.setQueryData(queryKey, snapshot);

    await write.fail();

    expect(cache.rows()).toEqual([
      { id: "a", pinnedAt: null, status: "idle" },
      { id: "b", pinnedAt: null, status: "idle" },
    ]);
  });
});

describe("TaggedQueryClient", () => {
  it("rolls back a prediction under writes that add and remove rows", async () => {
    const cache = await setup([
      { id: "a", pinnedAt: null, status: "idle" },
      { id: "b", pinnedAt: null, status: "idle" },
    ]);
    const write = pin(cache.client, "a", 100);
    cache.client.setQueryData<Row[]>(queryKey, (rows) =>
      rows?.filter((row) => row.id !== "b"),
    );
    cache.client.setQueryData<Row[]>(queryKey, (rows) => [
      { id: "c", pinnedAt: null, status: "idle" },
      ...(rows ?? []).map((row) => ({ ...row, status: "running" })),
    ]);

    await write.fail();

    expect(cache.rows()).toEqual([
      { id: "c", pinnedAt: null, status: "idle" },
      { id: "a", pinnedAt: null, status: "running" },
    ]);
  });

  it("replaces an accepted prediction with the next confirmed read", async () => {
    const cache = await setup([{ id: "a", pinnedAt: null, status: "idle" }]);
    const write = pin(cache.client, "a", 100);
    cache.client.setQueryData(queryKey, patch("a", { status: "running" }));
    await write.accept();
    cache.setServer([{ id: "a", pinnedAt: 150, status: "running" }]);

    await cache.refetch();

    expect(cache.rows()).toEqual([
      { id: "a", pinnedAt: 150, status: "running" },
    ]);
  });
});
