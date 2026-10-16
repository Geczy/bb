import { expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import { usageListMethod, usageFetchMethod } from "./usage-source-contract.js";

it("lists cheaply, fetches only the selected source/provider, preserves failed measurements, and evicts removed resources", async () => {
  let enabled = true;
  let failure = false;
  let hasWork = true;
  const rpc = vi.fn(async ({ pluginId, method, input }) => {
    if (method === usageListMethod)
      return pluginId === "pool"
        ? {
            label: "Account Pooler",
            resources: [
              {
                id: "claude",
                providerId: "claude-code",
                label: "claude@example.com",
                scope: { kind: "shared" },
              },
              {
                id: "personal",
                providerId: "codex",
                label: "personal@example.com",
                scope: { kind: "shared" },
              },
              ...(hasWork
                ? [
                    {
                      id: "work",
                      providerId: "codex",
                      label: "work@example.com",
                      scope: { kind: "shared" },
                    },
                  ]
                : []),
            ],
          }
        : {
            resources: [
              {
                id: "host",
                providerId: "codex",
                label: "Codex",
                scope: { kind: "host", hostId: "host", hostName: "Machine" },
              },
            ],
          };
    if (failure) throw new Error("Upstream failed");
    return {
      observedAt: 123,
      usage: {
        status: "ok",
        accountEmail: `${input.resourceId}@example.com`,
        planLabel: null,
        windows: [
          {
            id: "week",
            label: "Weekly",
            usedPercent: 42,
            resetsAt: null,
            model: null,
            cost: null,
          },
        ],
      },
    };
  });
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({
            id: "host",
            name: "Machine",
            status: "connected",
          }),
        ],
      },
      providers: {
        list: async () => [
          { id: "codex", displayName: "Codex", logoUrl: "/codex.svg" },
          {
            id: "claude-code",
            displayName: "Claude Code",
            logoUrl: "/claude.svg",
          },
        ],
      },
      plugins: {
        experimental_discoverRpc: async () =>
          enabled
            ? [
                {
                  pluginId: "pool",
                  displayName: "Account Pooler",
                  method: usageListMethod,
                },
                {
                  pluginId: "local",
                  displayName: "Codex",
                  method: usageListMethod,
                },
              ]
            : [],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  const request = {
    force: false,
    machineIds: null,
    providerIds: [],
    maxAgeMs: 60_000,
  };
  try {
    const listed = await host.harness.behavior.callRpc("getUsage", request);
    expect(listed).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          providers: [
            { providerId: "codex", usage: null },
            { providerId: "codex", usage: null },
            { providerId: "claude-code", usage: null },
          ],
        },
      ],
    });
    expect(
      rpc.mock.calls.every(([args]) => args.method === usageListMethod),
    ).toBe(true);
    const target = {
      ...request,
      machineIds: ["source:pool"],
      providerIds: ["codex"],
    };
    await host.harness.behavior.callRpc("getUsage", target);
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .map(([args]) => [
          args.pluginId,
          args.input.resourceId,
          args.input.refresh,
        ]),
    ).toEqual([
      ["pool", "personal", false],
      ["pool", "work", false],
    ]);
    await host.harness.behavior.callRpc("getUsage", target);
    expect(
      rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
    ).toHaveLength(2);
    failure = true;
    expect(
      await host.harness.behavior.callRpc("getUsage", {
        ...target,
        force: true,
      }),
    ).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          error: "Some usage could not be refreshed.",
          providers: [
            { usage: { status: "ok" } },
            { usage: { status: "ok" } },
            { usage: null },
          ],
        },
      ],
    });
    failure = false;
    hasWork = false;
    expect(
      await host.harness.behavior.callRpc("getUsage", {
        ...target,
        force: true,
      }),
    ).toMatchObject({
      machines: [
        { id: "host" },
        {
          id: "source:pool",
          error: null,
          providers: [{ id: "pool:personal" }, { id: "pool:claude" }],
        },
      ],
    });
    await host.harness.behavior.callRpc("getUsage", {
      ...target,
      providerIds: ["claude-code"],
    });
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .at(-1)?.[0].input.resourceId,
    ).toBe("claude");
    await host.harness.behavior.callRpc("getUsage", {
      ...target,
      machineIds: null,
    });
    expect(
      rpc.mock.calls
        .filter(([args]) => args.method === usageFetchMethod)
        .at(-1)?.[0].pluginId,
    ).toBe("local");
    enabled = false;
    expect(
      await host.harness.behavior.callRpc("getUsage", {
        ...request,
        force: true,
      }),
    ).toMatchObject({ machines: [{ id: "host", providers: [] }] });
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

it("keeps an unconfigured shared group without hosts or measurement requests", async () => {
  const rpc = vi.fn(async () => ({ label: "Account Pooler", resources: [] }));
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: { list: async () => [] },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "pool", displayName: "Pool", method: usageListMethod },
        ],
        callRpc: rpc,
      },
    },
  });
  plugin(host.bb);
  try {
    await expect(
      host.harness.behavior.callRpc("getUsage", {
        force: false,
        machineIds: null,
        providerIds: [],
        maxAgeMs: 0,
      }),
    ).resolves.toEqual({
      machines: [
        {
          id: "source:pool",
          displayName: "Account Pooler",
          status: "connected",
          providers: [],
          error: null,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

it("collapses known account observations per machine, preserves unknown identities, and normalizes display labels", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host", status: "connected" }),
        ],
      },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () => [
          { pluginId: "adapter", displayName: "Adapter" },
          { pluginId: "custom", displayName: "Custom" },
        ],
        callRpc: async ({ pluginId, method }) =>
          method === usageListMethod
            ? {
                resources: [
                  {
                    id: "account",
                    providerId: "codex",
                    accountKey: null,
                    label: "same@example.com",
                    scope: { kind: "host", hostId: "host", hostName: "Host" },
                  },
                  {
                    id: "unknown",
                    providerId: "other",
                    accountKey: null,
                    label: "same@example.com",
                    scope: { kind: "host", hostId: "host", hostName: "Host" },
                  },
                ],
              }
            : {
                accountKey: "issuer:account:1",
                observedAt: 123,
                usage: {
                  status: "ok",
                  accountEmail: "same@example.com",
                  planLabel: "max",
                  plan: { id: "max", multiplier: 20 },
                  windows: [
                    {
                      id: "week",
                      kind: "weekly",
                      label: "168 hour window",
                      model: null,
                      resetsAt: null,
                      cost: null,
                      usedPercent: pluginId === "adapter" ? 42 : 81,
                    },
                  ],
                },
              },
      },
    },
  });
  try {
    plugin(bb);
    const snapshot = await harness.behavior.callRpc("getUsage", {
      force: false,
      machineIds: ["host"],
      providerIds: ["codex"],
      maxAgeMs: 0,
    });
    expect(snapshot).toMatchObject({
      machines: [
        {
          providers: [
            {
              id: "adapter:account",
              usage: {
                planLabel: "Max (20x)",
                windows: [{ label: "Weekly limit", usedPercent: 42 }],
              },
            },
            { id: "adapter:unknown", usage: null },
            { id: "custom:unknown", usage: null },
          ],
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("81");
  } finally {
    await harness.lifecycle.dispose();
  }
});

it.each([60_000, 120_000])(
  "refreshes watched measurements every %i ms",
  async (maxAgeMs) => {
    vi.useFakeTimers();
    const rpc = vi.fn(async ({ method, input }) => {
      if (method === usageListMethod)
        return {
          resources: ["healthy", "failed"].map((id) => ({
            id,
            providerId: "codex",
            label: id,
            scope: { kind: "shared" },
          })),
        };
      if (input.resourceId === "failed") throw new Error("Unavailable");
      return {
        observedAt: Date.now(),
        usage: {
          status: "ok",
          accountEmail: null,
          planLabel: null,
          windows: [],
        },
      };
    });
    const { bb, harness } = createFakePluginHost({
      pluginId: "provider-usage",
      sdk: {
        system: { config: async () => ({ primaryHostId: null }) },
        hosts: { list: async () => [] },
        providers: { list: async () => [] },
        plugins: {
          experimental_discoverRpc: async () => [
            {
              pluginId: "source",
              displayName: "Source",
              method: usageListMethod,
            },
          ],
          callRpc: rpc,
        },
      },
    });
    let release: (() => void) | undefined;
    const input = {
      force: false,
      machineIds: ["source:source"],
      providerIds: ["codex"],
      maxAgeMs,
    };
    try {
      plugin(bb);
      await harness.callRpc("getUsage", input);
      await harness.callRpc("getUsage", { ...input, providerIds: [] });
      expect(harness.rpcTags.get("getUsage")).toEqual(["inventory"]);
      harness.rpcInvalidations.length = 0;
      rpc.mockClear();
      release = harness.holdRpcWatch("getUsage", { input });
      await vi.advanceTimersByTimeAsync(maxAgeMs - 1);
      expect(harness.rpcInvalidations).toEqual([]);
      expect(
        rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
      ).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.rpcInvalidations).toEqual([
        ["usage:all", "usage:source:source"],
      ]);
      expect(
        rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
      ).toHaveLength(2);
      await harness.callRpc("getUsage", input);
      expect(
        rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
      ).toHaveLength(3);
      expect(harness.rpcInvalidations).toHaveLength(1);
      release();
      await vi.advanceTimersByTimeAsync(maxAgeMs * 2);
      expect(
        rpc.mock.calls.filter(([args]) => args.method === usageFetchMethod),
      ).toHaveLength(3);
    } finally {
      release?.();
      await harness.dispose();
      vi.useRealTimers();
    }
  },
);

it("retries an uncached failed measurement on the next read", async () => {
  let attempts = 0;
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: { list: async () => [] },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () => [
          {
            pluginId: "source",
            displayName: "Source",
            method: usageListMethod,
          },
        ],
        callRpc: async ({ method }) => {
          if (method === usageListMethod)
            return {
              resources: [
                {
                  id: "account",
                  providerId: "codex",
                  label: "Account",
                  scope: { kind: "shared" },
                },
              ],
            };
          if (++attempts === 1) throw new Error("Unavailable");
          return {
            observedAt: Date.now(),
            usage: {
              status: "ok",
              accountEmail: null,
              planLabel: null,
              windows: [],
            },
          };
        },
      },
    },
  });
  plugin(host.bb);
  const request = {
    force: false,
    machineIds: null,
    providerIds: ["codex"],
    maxAgeMs: 60_000,
  };
  try {
    expect(await host.harness.callRpc("getUsage", request)).toMatchObject({
      machines: [
        {
          providers: [{ usage: null }],
          error: "Some usage could not be refreshed.",
        },
      ],
    });
    expect(await host.harness.callRpc("getUsage", request)).toMatchObject({
      machines: [{ providers: [{ usage: { status: "ok" } }], error: null }],
    });
    expect(attempts).toBe(2);
  } finally {
    await host.harness.dispose();
  }
});

it("invalidates inventory on host changes even without sources", async () => {
  let connected = true;
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({
            id: "host",
            name: "Machine",
            status: connected ? "connected" : "disconnected",
          }),
        ],
      },
      providers: { list: async () => [] },
      plugins: { experimental_discoverRpc: async () => [] },
    },
  });
  plugin(host.bb);
  const service = host.harness.runService("usage-inventories");
  try {
    const input = {
      force: false,
      machineIds: null,
      providerIds: [],
      maxAgeMs: 60_000,
    };
    await host.harness.callRpc("getUsage", input);
    host.harness.rpcInvalidations.length = 0;
    connected = false;
    host.harness.sdk.emitRealtime("host:changed", {
      type: "changed",
      entity: "host",
      id: "host",
      changes: ["host-disconnected"],
    });
    expect(host.harness.rpcInvalidations).toContainEqual(["inventory"]);
    expect(await host.harness.callRpc("getUsage", input)).toMatchObject({
      machines: [{ status: "disconnected" }],
    });
  } finally {
    service.controller.abort();
    await service.done;
    await host.harness.dispose();
  }
});
