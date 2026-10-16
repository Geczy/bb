import { afterEach, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import {
  usageFetchMethod,
  usageListMethod,
  type UsageMeasurement,
  type UsageResourceList,
} from "./usage-source-contract.js";

const source = {
  pluginId: "source",
  displayName: "Source",
  method: usageListMethod,
};
const inventory: UsageResourceList = {
  resources: [
    {
      accountKey: null,
      id: "account",
      providerId: "codex",
      label: "Account",
      scope: { kind: "shared" },
    },
  ],
};
const measured = (percent: number): UsageMeasurement => ({
  accountKey: null,
  observedAt: Date.now(),
  usage: {
    status: "ok",
    plan: null,
    accountEmail: null,
    planLabel: null,
    windows: [
      {
        kind: "weekly",
        id: "week",
        label: "Weekly",
        usedPercent: percent,
        resetsAt: null,
        model: null,
        cost: null,
      },
    ],
  },
});
const request = {
  force: false,
  machineIds: ["source:source"],
  providerIds: ["codex"],
  maxAgeMs: 60_000,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  options: {
    discover?: () => Promise<(typeof source)[]>;
    list?: () => Promise<UsageResourceList>;
    fetch?: () => Promise<UsageMeasurement>;
    hosts?: () => Promise<[]>;
  } = {},
) {
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: { list: options.hosts ?? (async () => []) },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: options.discover ?? (async () => [source]),
        callRpc: async ({ method }) =>
          method === usageListMethod
            ? (options.list?.() ?? inventory)
            : (options.fetch?.() ?? measured(42)),
      },
    },
  });
  plugin(host.bb);
  return host.harness;
}
const hosts: ReturnType<typeof setup>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  vi.useRealTimers();
});
function emitInventory(host: ReturnType<typeof setup>) {
  host.sdk.emitRealtime("plugin:changed", {
    type: "changed",
    entity: "plugin",
    id: "source",
    tags: null,
  });
}

it.each(["removed", "in-flight success", "in-flight failure"])(
  "does not resurrect measurements after a resource is removed and re-added (%s)",
  async (phase) => {
    const delayed = deferred<UsageMeasurement>();
    let current = inventory;
    let fetches = 0;
    const host = setup({
      list: async () => current,
      fetch: async () => {
        fetches++;
        if (phase !== "removed" && fetches === 1) return delayed.promise;
        return measured(fetches * 10);
      },
    });
    hosts.push(host);
    const first = host.callRpc("getUsage", request);
    await vi.waitFor(() => expect(fetches).toBe(1));
    if (phase === "removed") await first;
    current = { label: "Empty", resources: [] };
    host.rpcInvalidations.length = 0;
    emitInventory(host);
    await vi.waitFor(() =>
      expect(host.rpcInvalidations).toContainEqual(["inventory"]),
    );
    current = inventory;
    host.rpcInvalidations.length = 0;
    emitInventory(host);
    await vi.waitFor(() =>
      expect(host.rpcInvalidations).toContainEqual(["inventory"]),
    );
    delayed.resolve(
      phase === "in-flight failure"
        ? {
            accountKey: null,
            observedAt: Date.now(),
            usage: {
              status: "error",
              message: "Unavailable",
              plan: null,
              accountEmail: null,
              planLabel: null,
            },
          }
        : measured(99),
    );
    const initial = await first;
    if (phase === "in-flight failure")
      expect(initial).toMatchObject({ machines: [{ error: null }] });
    const result = await host.callRpc("getUsage", request);
    expect(fetches).toBe(2);
    expect(result).toMatchObject({
      machines: [
        {
          error: null,
          providers: [{ usage: { windows: [{ usedPercent: 20 }] } }],
        },
      ],
    });
  },
);

it("waits for sources added while inventory reconciliation is awaiting an earlier source", async () => {
  let discovered = [source];
  let current = inventory;
  const late = deferred<UsageResourceList>();
  const firstList = deferred<UsageResourceList>();
  let lists = 0;
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: { list: async () => [] },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () => discovered,
        callRpc: async ({ pluginId, method }) => {
          if (method === usageFetchMethod) return measured(42);
          if (pluginId === "late") return late.promise;
          if (++lists === 2) return firstList.promise;
          return current;
        },
      },
    },
  });
  plugin(host.bb);
  hosts.push(host.harness);
  await host.harness.callRpc("getUsage", request);
  const service = host.harness.runService("usage-inventories");
  await vi.waitFor(() =>
    expect(
      host.harness.sdk.callsTo("plugins.experimental_discoverRpc").length,
    ).toBeGreaterThan(1),
  );
  const forced = host.harness.callRpc("getUsage", { ...request, force: true });
  await vi.waitFor(() => expect(lists).toBe(2));
  discovered = [source, { ...source, pluginId: "late" }];
  host.harness.sdk.emitRealtime("system:changed", {
    type: "changed",
    entity: "system",
    changes: ["plugins-changed"],
  });
  await vi.waitFor(() =>
    expect(
      host.harness.sdk
        .callsTo("plugins.callRpc")
        .some(([args]) => (args as { pluginId: string }).pluginId === "late"),
    ).toBe(true),
  );
  let settled = false;
  void forced.then(() => {
    settled = true;
  });
  current = { ...inventory, label: "Updated" };
  firstList.resolve(current);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  late.resolve({ label: "Late", resources: [] });
  expect(await forced).toMatchObject({
    machines: [{ id: "source:source" }, { id: "source:late" }],
  });
  service.controller.abort();
  await service.done;
});

it("publishes discovery-watch errors while preserving the last inventory and recovers on retry", async () => {
  vi.useFakeTimers();
  let failed = false;
  const host = setup({
    discover: async () => {
      if (failed) throw new Error("Discovery unavailable");
      return [source];
    },
  });
  hosts.push(host);
  await host.callRpc("getUsage", request);
  const service = host.runService("usage-inventories");
  await vi.advanceTimersByTimeAsync(0);
  host.rpcInvalidations.length = 0;
  failed = true;
  host.sdk.emitRealtime("system:changed", {
    type: "changed",
    entity: "system",
    changes: ["plugins-changed"],
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(host.rpcInvalidations).toContainEqual(["inventory"]);
  await expect(host.callRpc("getUsage", request)).rejects.toThrow(
    "Discovery unavailable",
  );
  failed = false;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await host.callRpc("getUsage", request)).toMatchObject({
    machines: [{ providers: [{ usage: { status: "ok" } }] }],
  });
  service.controller.abort();
  await service.done;
});

it("settles an initial inventory read when the plugin is disposed", async () => {
  const host = setup({ list: () => new Promise(() => {}) });
  const read = host.callRpc("getUsage", request);
  const outcome = read.then(
    () => "success",
    () => "aborted",
  );
  await vi.waitFor(() =>
    expect(host.sdk.callsTo("plugins.callRpc")).toHaveLength(1),
  );
  await host.dispose();
  expect(
    await Promise.race([
      outcome,
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]),
  ).toBe("aborted");
});

it("waits for an unwarmed source discovered while the inventory TTL is still fresh", async () => {
  let discovered = [source];
  let waiting = false;
  const next = deferred<UsageResourceList>();
  const host = setup({
    discover: async () => discovered,
    list: async () => (waiting ? next.promise : inventory),
  });
  hosts.push(host);
  await host.callRpc("getUsage", request);
  const service = host.runService("usage-inventories");
  await vi.waitFor(() =>
    expect(
      host.sdk.callsTo("plugins.experimental_discoverRpc").length,
    ).toBeGreaterThan(1),
  );
  waiting = true;
  discovered = [{ ...source, pluginId: "new" }];
  host.sdk.emitRealtime("system:changed", {
    type: "changed",
    entity: "system",
    changes: ["plugins-changed"],
  });
  await vi.waitFor(() =>
    expect(
      host.sdk
        .callsTo("plugins.callRpc")
        .some(([args]) => (args as { pluginId: string }).pluginId === "new"),
    ).toBe(true),
  );
  let settled = false;
  const read = host
    .callRpc("getUsage", { ...request, providerIds: [] })
    .then((result) => {
      settled = true;
      return result;
    });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  next.resolve({ label: "New", resources: [] });
  expect(await read).toMatchObject({ machines: [{ id: "source:new" }] });
  service.controller.abort();
  await service.done;
});

it("finishes listing with an error at the original 45-second source deadline", async () => {
  vi.useFakeTimers();
  const host = setup({ list: () => new Promise(() => {}) });
  hosts.push(host);
  let result: unknown;
  void host.callRpc("getUsage", request).then((value) => {
    result = value;
  });
  await vi.advanceTimersByTimeAsync(45_000);
  expect(result).toMatchObject({
    machines: [
      { id: "source:source", error: "Usage resources could not be listed." },
    ],
  });
});

it("joins a pending forced reconciliation even when the previous inventory is fresh", async () => {
  const next = deferred<(typeof source)[]>();
  let discoveries = 0;
  const host = setup({
    discover: async () => (++discoveries === 1 ? [source] : next.promise),
  });
  hosts.push(host);
  await host.callRpc("getUsage", request);
  const forced = host.callRpc("getUsage", { ...request, force: true });
  await vi.waitFor(() => expect(discoveries).toBe(2));
  let settled = false;
  const read = host
    .callRpc("getUsage", { ...request, providerIds: [] })
    .then((result) => {
      settled = true;
      return result;
    });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  next.resolve([]);
  expect(await read).toEqual({ machines: [] });
  expect(await forced).toEqual({ machines: [] });
});

it("keeps a new incarnation's pending fetch when an older fetch finishes", async () => {
  const old = deferred<UsageMeasurement>();
  const current = deferred<UsageMeasurement>();
  let listed = inventory;
  let fetches = 0;
  const host = setup({
    list: async () => listed,
    fetch: async () => (++fetches === 1 ? old.promise : current.promise),
  });
  hosts.push(host);
  const first = host.callRpc("getUsage", request);
  await vi.waitFor(() => expect(fetches).toBe(1));
  listed = { label: "Empty", resources: [] };
  host.rpcInvalidations.length = 0;
  emitInventory(host);
  await vi.waitFor(() =>
    expect(host.rpcInvalidations).toContainEqual(["inventory"]),
  );
  listed = inventory;
  host.rpcInvalidations.length = 0;
  emitInventory(host);
  await vi.waitFor(() =>
    expect(host.rpcInvalidations).toContainEqual(["inventory"]),
  );
  const second = host.callRpc("getUsage", request);
  await vi.waitFor(() => expect(fetches).toBe(2));
  old.resolve(measured(99));
  await first;
  const third = host.callRpc("getUsage", request);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(fetches).toBe(2);
  current.resolve(measured(81));
  for (const read of [second, third])
    expect(await read).toMatchObject({
      machines: [
        {
          error: null,
          providers: [{ usage: { windows: [{ usedPercent: 81 }] } }],
        },
      ],
    });
});
