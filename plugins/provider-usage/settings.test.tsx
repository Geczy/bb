import { usageRpcTags } from "./testing/rpc-tags.js";
// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin, {
  providerUsageRpcContract,
  type UsageRequest,
} from "./server.js";
import { UsageSettings, UsageSettingsContent } from "./settings.js";
import type { UsageMachine, UsageProvider } from "./usage-schema.js";

installTestPluginRuntime();

function account(id: string, providerId = "codex"): UsageProvider {
  return {
    id,
    providerId,
    accountLabel: `${id}@example.com`,
    displayName: providerId === "codex" ? "Codex" : "Claude Code",
    logoUrl: null,
    icon: null,
    strings: { iconTint: null },
    signInHint: "Sign in again.",
    expiredHint: "Session expired.",
    usage: {
      status: "ok",
      accountEmail: `${id}@example.com`,
      planLabel: "Max (20x)",
      windows: [
        {
          label: "Weekly limit",
          usedPercent: 42,
          resetsAt: new Date(Date.now() + 3600_000).toISOString(),
          cost: null,
        },
      ],
    },
  };
}
const machine = (id: string, providers: UsageProvider[]): UsageMachine => ({
  id,
  displayName: id === "source:pool" ? "Account Pooler" : "My machine",
  status: "connected",
  error: null,
  providers,
});

afterEach(() => cleanup());

function renderContent(
  props: Partial<Parameters<typeof UsageSettingsContent>[0]>,
) {
  return renderToStaticMarkup(
    <UsageSettingsContent
      machines={[]}
      selectedId={null}
      loading={false}
      error={false}
      onSelect={() => {}}
      onRefresh={() => {}}
      {...props}
    />,
  );
}

describe("UsageSettings live reads", () => {
  it.each([true, false])(
    "measures only the selected source and forwards forced refresh (pool=%s)",
    async (pool) => {
      const machines = [
        machine("host", [account("local")]),
        ...(pool
          ? [
              machine("source:pool", [
                account("first"),
                account("second", "claude-code"),
              ]),
            ]
          : []),
      ];
      const slot = renderSlot<{}, typeof providerUsageRpcContract>(
        { component: UsageSettings },
        {},
        {
          rpc: { getUsage: () => ({ machines }) },
          experimental_rpcTags: usageRpcTags,
        },
      );
      const selected = pool ? "source:pool" : "host";
      await waitFor(() =>
        expect(
          slot.rpcCalls.some((call) => {
            const input = call.input as UsageRequest;
            return (
              input.machineIds?.[0] === selected && input.providerIds.length > 0
            );
          }),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          slot
            .getByRole("button", { name: "Reload usage data" })
            .hasAttribute("disabled"),
        ).toBe(false),
      );
      fireEvent.click(slot.getByRole("button", { name: "Reload usage data" }));
      await waitFor(() =>
        expect(
          slot.rpcCalls.some((call) => {
            const input = call.input as UsageRequest;
            return (
              input.force &&
              input.machineIds?.[0] === selected &&
              input.maxAgeMs === 0
            );
          }),
        ).toBe(true),
      );
    },
  );

  it("keeps an empty enabled pool selected without fetching host measurements", async () => {
    const machines = [
      machine("host", [account("local")]),
      machine("source:pool", []),
    ];
    const slot = renderSlot<{}, typeof providerUsageRpcContract>(
      { component: UsageSettings },
      {},
      {
        rpc: { getUsage: () => ({ machines }) },
        experimental_rpcTags: usageRpcTags,
      },
    );
    await slot.findByText("Account Pooler");
    expect(
      slot.rpcCalls.every(
        (call) => (call.input as UsageRequest).providerIds.length === 0,
      ),
    ).toBe(true);
  });

  it("keeps measured accounts and surfaces a friendly error when forced reload fails", async () => {
    let failed = false;
    const slot = renderSlot<{}, typeof providerUsageRpcContract>(
      { component: UsageSettings },
      {},
      {
        experimental_rpcTags: usageRpcTags,
        rpc: {
          getUsage: () => {
            if (failed) throw new Error("private transport detail");
            return { machines: [machine("source:pool", [account("first")])] };
          },
        },
      },
    );
    await slot.findByText("first@example.com");
    await waitFor(() =>
      expect(
        slot
          .getByRole("button", { name: "Reload usage data" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    failed = true;
    fireEvent.click(slot.getByRole("button", { name: "Reload usage data" }));
    await slot.findByText(/Showing last update/);
    expect(slot.getByText("first@example.com")).toBeTruthy();
    expect(slot.queryByText("private transport detail")).toBeNull();
    failed = false;
    await slot.experimental_invalidateRpc(["usage"]);
    await waitFor(() =>
      expect(slot.queryByText(/Showing last update/)).toBeNull(),
    );
    expect(slot.getByText("first@example.com")).toBeTruthy();
  });
});

describe("UsageSettingsContent", () => {
  it("groups the selected source's accounts with icons, labels and reset times", () => {
    const html = renderContent({
      machines: [
        machine("host", [account("local")]),
        machine("source:pool", [
          account("first"),
          account("second"),
          account("third", "claude-code"),
        ]),
      ],
    });
    expect(html.match(/<h3[^>]*>Codex<\/h3>/g)).toHaveLength(2);
    expect(html).toContain("first@example.com");
    expect(html).toContain("second@example.com");
    expect(html).not.toContain("local@example.com");
    expect(html.match(/Resets in/g)).toHaveLength(3);
  });

  it("renders loading before any source is known", () => {
    expect(renderContent({ loading: true })).toContain("Loading usage…");
  });

  it("shows pending measurements without inventing usage, then reports an unavailable account gracefully", () => {
    const resource = { ...account("pending"), usage: null };
    const pending = renderContent({
      machines: [machine("source:pool", [resource])],
      loading: true,
    });
    expect(pending).toContain("Loading usage…");
    expect(pending).not.toContain("0% used");
    const failed = renderContent({
      machines: [
        {
          ...machine("source:pool", [resource]),
          error: "Some usage could not be refreshed.",
        },
      ],
    });
    expect(failed).toContain("Couldn’t load usage.");
    expect(failed).toContain("Usage unavailable.");
    expect(failed).not.toContain("Showing the last");
  });

  it("keeps authentication and plans without limits distinct from loading and errors", () => {
    const first = account("signed-out");
    first.usage = { status: "unauthenticated" };
    const second = account("expired");
    second.usage = { status: "expired" };
    const third = account("unlimited");
    third.usage = {
      status: "ok",
      accountEmail: "unlimited@example.com",
      planLabel: null,
      windows: [],
    };
    const html = renderContent({
      machines: [machine("source:pool", [first, second, third])],
    });
    expect(html).toContain("Sign in again.");
    expect(html).toContain("Session expired.");
    expect(html).toContain("No usage limits reported for this plan.");
    expect(html).not.toContain("0% used");
  });
});

it("reloads inventory-only settings through server invalidations", async () => {
  let name = "Original";
  const host = createFakePluginHost({
    pluginId: "provider-usage",
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () => [
          makeHostResponse({ id: "first", name, status: "connected" }),
          makeHostResponse({
            id: "second",
            name: "Second",
            status: "connected",
          }),
        ],
      },
      providers: { list: async () => [] },
      plugins: { experimental_discoverRpc: async () => [] },
    },
  });
  plugin(host.bb);
  const slot = renderSlot<{}, typeof providerUsageRpcContract>(
    { component: UsageSettings },
    {},
    {
      rpc: {
        getUsage: async (input) =>
          providerUsageRpcContract.getUsage.output.parse(
            await host.harness.callRpc("getUsage", input),
          ),
      },
      experimental_rpcTags: usageRpcTags,
    },
  );
  const stop = host.harness.experimental_onRpcInvalidation((tags) => {
    void slot.experimental_invalidateRpc(tags ?? undefined);
  });
  try {
    await slot.findByText("Original");
    name = "Renamed";
    fireEvent.click(
      await slot.findByRole("button", { name: "Reload usage data" }),
    );
    await slot.findByText("Renamed");
    expect(slot.queryByText("Original")).toBeNull();
  } finally {
    stop();
    slot.unmount();
    await host.harness.dispose();
  }
});
