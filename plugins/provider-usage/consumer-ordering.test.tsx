// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ExperimentalSidebarFooterDisclosureProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { UsageSettings } from "./settings.js";
import { type UsageSnapshot } from "./usage-schema.js";
import { providerUsageRpcContract, type UsageRequest } from "./server.js";
import { usageRpcTags } from "./testing/rpc-tags.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
const snapshot = (
  percent: number,
  status: "connected" | "disconnected" = "connected",
  ids = ["account"],
): UsageSnapshot => ({
  machines: [
    {
      id: "host",
      displayName: "Pool",
      status,
      error: null,
      providers: ids.map((id) => ({
        id,
        providerId: "codex",
        accountLabel: `${id}@example.com`,
        displayName: "Codex",
        logoUrl: null,
        icon: null,
        strings: { iconTint: null },
        signInHint: "Sign in.",
        expiredHint: "Expired.",
        usage: {
          status: "ok",
          accountEmail: `${id}@example.com`,
          planLabel: null,
          windows: [
            {
              label: "Weekly limit",
              usedPercent: percent,
              resetsAt: null,
              cost: null,
            },
          ],
        },
      })),
    },
  ],
});
async function renderConsumer(
  kind: "settings" | "footer",
  getUsage: (request: UsageRequest) => Promise<UsageSnapshot>,
) {
  const app = await loadPluginApp(() => import("./app.js"));
  const item = app.experimentalSidebarFooterItems[0];
  if (item?.kind !== "disclosure") throw new Error("missing disclosure");
  const options = {
    pluginId: `usage-${kind}`,
    rpc: { getUsage },
    experimental_rpcTags: usageRpcTags,
  };
  const slot =
    kind === "settings"
      ? renderSlot<{}, typeof providerUsageRpcContract>(
          { component: UsageSettings },
          {},
          options,
        )
      : renderSlot<
          ExperimentalSidebarFooterDisclosureProps,
          typeof providerUsageRpcContract
        >(item, { dismiss: vi.fn() }, options);
  const button = () =>
    slot.getByRole("button", {
      name:
        kind === "settings"
          ? /Reload(ing)? usage data/
          : "Reload provider usage",
    });
  await slot.findAllByText(kind === "settings" ? "42% used" : "42%");
  await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
  return {
    slot,
    button,
    value: (percent: number) =>
      kind === "settings" ? `${percent}% used` : `${percent}%`,
  };
}

it.each(["settings", "footer"] as const)(
  "%s shows host status updates even with cached measurements",
  async (kind) => {
    let disconnected = false;
    let resolve!: (value: UsageSnapshot) => void;
    const pending = new Promise<UsageSnapshot>((done) => {
      resolve = done;
    });
    const { slot } = await renderConsumer(kind, async (input) => {
      if (disconnected && input.providerIds.length > 0) return pending;
      return snapshot(42, disconnected ? "disconnected" : "connected");
    });
    disconnected = true;
    void slot.experimental_invalidateRpc(["inventory"]);
    await slot.findByText(/offline/i);
    await act(async () => resolve(snapshot(42, "disconnected")));
  },
);

it.each(["settings", "footer"] as const)(
  "%s applies inventory removals while measurements are pending",
  async (kind) => {
    let updating = false;
    let resolve!: (value: UsageSnapshot) => void;
    const pending = new Promise<UsageSnapshot>((done) => {
      resolve = done;
    });
    const { slot } = await renderConsumer(kind, async (input) => {
      if (updating && input.providerIds.length > 0) return pending;
      return snapshot(
        42,
        "connected",
        updating ? ["account"] : ["account", "removed"],
      );
    });
    expect(slot.getByText("removed@example.com")).toBeTruthy();
    updating = true;
    void slot.experimental_invalidateRpc(["inventory"]);
    await waitFor(() =>
      expect(slot.queryByText("removed@example.com")).toBeNull(),
    );
    await act(async () => resolve(snapshot(42)));
  },
);

it.each(["settings", "footer"] as const)(
  "%s publishes the forced response before follow-up reads finish",
  async (kind) => {
    const { slot, button, value } = await renderConsumer(kind, async (input) =>
      snapshot(input.force ? 81 : 42),
    );
    fireEvent.click(button());
    await slot.findByText(value(81));
  },
);

it.each(["settings", "footer"] as const)(
  "%s retains a successful forced measurement when the inventory reread succeeds but measurements fail",
  async (kind) => {
    let refreshed = false;
    const { slot, button, value } = await renderConsumer(
      kind,
      async (input) => {
        if (input.force) refreshed = true;
        else if (refreshed && input.providerIds.length > 0)
          throw new Error("Measurement read unavailable");
        return snapshot(refreshed ? 81 : 42);
      },
    );
    fireEvent.click(button());
    await slot.findByText(value(81));
    void slot.experimental_invalidateRpc(["inventory"]);
    await slot.findByText(/Showing last update/);
    expect(slot.getByText(value(81))).toBeTruthy();
    expect(slot.queryByText(value(42))).toBeNull();
  },
);

it("orders repeated footer retries and retains the first success if the second fails", async () => {
  let resolve!: (value: UsageSnapshot) => void;
  const pending = new Promise<UsageSnapshot>((done) => {
    resolve = done;
  });
  let forces = 0;
  const { slot, value } = await renderConsumer("footer", async (input) => {
    if (input.force) {
      if (++forces === 1) return pending;
      throw new Error("Second refresh failed");
    }
    const initial = snapshot(42);
    initial.machines[0]!.error = "Some usage could not be refreshed.";
    return initial;
  });
  fireEvent.click(slot.getByRole("button", { name: "Retry" }));
  fireEvent.click(slot.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(forces).toBe(1));
  await act(async () => resolve(snapshot(81)));
  await waitFor(() => expect(forces).toBe(2));
  await slot.findByText(/Showing last update/);
  expect(slot.getByText(value(81))).toBeTruthy();
});

it.each(["settings", "footer"] as const)(
  "%s ignores an old forced failure after switching to a newly discovered source",
  async (kind) => {
    let reject!: (error: Error) => void;
    const pending = new Promise<UsageSnapshot>((_resolve, fail) => {
      reject = fail;
    });
    let switched = false;
    const { slot, button, value } = await renderConsumer(
      kind,
      async (input) => {
        if (input.force) return pending;
        const initial = snapshot(42);
        if (!switched) return initial;
        const next = snapshot(81, "connected", ["next"]);
        next.machines[0]!.id = "source:next";
        return { machines: [...initial.machines, ...next.machines] };
      },
    );
    fireEvent.click(button());
    switched = true;
    void slot.experimental_invalidateRpc(["inventory"]);
    await slot.findByText("next@example.com");
    await act(async () => reject(new Error("Previous source unavailable")));
    expect(slot.queryByText(/Showing last update/)).toBeNull();
    expect(slot.getByText(value(81))).toBeTruthy();
    await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
  },
);

it.each(["settings", "footer"] as const)(
  "%s forgets a removed account's measurement if its ID is re-added during a pending refresh",
  async (kind) => {
    let stage = "initial";
    let resolve!: (value: UsageSnapshot) => void;
    const pending = new Promise<UsageSnapshot>((done) => {
      resolve = done;
    });
    const { slot, value } = await renderConsumer(kind, async (input) => {
      if (stage !== "initial" && input.providerIds.length > 0) return pending;
      const data = snapshot(
        42,
        "connected",
        stage === "removed" ? ["account"] : ["account", "reused"],
      );
      const reused = data.machines[0]!.providers.find(
        (provider) => provider.id === "reused",
      );
      if (reused)
        reused.usage =
          stage === "initial"
            ? {
                status: "ok",
                accountEmail: "reused@example.com",
                planLabel: null,
                windows: [
                  {
                    label: "Weekly limit",
                    usedPercent: 27,
                    resetsAt: null,
                    cost: null,
                  },
                ],
              }
            : null;
      return data;
    });
    expect(slot.getByText(value(27))).toBeTruthy();
    stage = "removed";
    void slot.experimental_invalidateRpc(["inventory"]);
    await waitFor(() =>
      expect(slot.queryByText("reused@example.com")).toBeNull(),
    );
    stage = "re-added";
    void slot.experimental_invalidateRpc(["inventory"]);
    await slot.findByText("reused@example.com");
    expect(slot.queryByText(value(27))).toBeNull();
    await act(async () =>
      resolve(snapshot(42, "connected", ["account", "reused"])),
    );
  },
);

it.each(["settings", "footer"] as const)(
  "%s clears a measurement error when usage recovers without an inventory refresh",
  async (kind) => {
    let recovered = false;
    const { slot, button, value } = await renderConsumer(
      kind,
      async (input) => {
        const data = snapshot(recovered ? 81 : 42);
        if (input.force)
          data.machines[0]!.error = "Some usage could not be refreshed.";
        return data;
      },
    );
    fireEvent.click(button());
    await slot.findByText(/Showing last update/);
    recovered = true;
    void slot.experimental_invalidateRpc(["usage"]);
    await slot.findByText(value(81));
    await waitFor(() =>
      expect(slot.queryByText(/Showing last update/)).toBeNull(),
    );
  },
);

it.each(["settings", "footer"] as const)(
  "%s accepts current host status from a successful measurement read when inventory fails",
  async (kind) => {
    let changed = false;
    const { slot } = await renderConsumer(kind, async (input) => {
      if (changed && input.providerIds.length === 0)
        throw new Error("Inventory unavailable");
      return snapshot(42, changed ? "disconnected" : "connected");
    });
    changed = true;
    void slot.experimental_invalidateRpc(["inventory"]);
    await slot.findByText(/offline/i);
  },
);
