// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import type {
  PluginThreadAction,
  PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import serverPlugin from "./server.js";
import { pushNotificationsRpcContract } from "./contract.js";
import type { ThreadNotificationInputs } from "./preferences.js";
import type { ThreadNotificationsData } from "./notificationsAction.js";

const app = await loadPluginApp(() => import("./app.js"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("device notification settings", () => {
  it("requests permission only on a click and uses the server test route", async () => {
    const requestPermission = vi.fn(async () => "granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("isSecureContext", true);
    const view = renderSlot(
      app.settingsSections[0]!,
      {},
      {
        settings: { webEnabled: true },
        rpc: { "notifications.test": () => ({ ok: true }) },
      },
    );
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(
      await view.findByRole("button", { name: "Allow notifications" }),
    );
    fireEvent.click(
      await view.findByRole("button", { name: "Send test notification" }),
    );
    await waitFor(() =>
      expect(view.inspection.rpcCalls).toEqual([
        { method: "notifications.test", input: { channel: "web" } },
      ]),
    );
  });

  it("explains denied permission without prompting repeatedly", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    vi.stubGlobal("isSecureContext", true);
    const view = renderSlot(
      app.settingsSections[0]!,
      {},
      { settings: { webEnabled: true } },
    );
    expect(await view.findByText(/Notifications are blocked/)).toBeTruthy();
    expect(view.queryByRole("button")).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

const { useBbNavigate, useSdk } = await import("@get-bb/plugin-sdk/app");
const { notificationsThreadAction } = await import("./notificationsAction.js");

function makeTarget(
  overrides: Partial<PluginThreadActionTarget> = {},
): PluginThreadActionTarget {
  return {
    id: "thr_top",
    projectId: "proj_test",
    parentThreadId: null,
    archivedAt: null,
    pinnedAt: null,
    sectionId: null,
    isUnread: false,
    status: "idle",
    environment: null,
    ...overrides,
  };
}

type ItemFor = (thread: PluginThreadActionTarget) => PluginThreadAction | null;

function Probe({
  threadIds,
  onItem,
}: {
  threadIds: readonly string[];
  onItem(item: ItemFor, data: ThreadNotificationsData): void;
}) {
  const data = notificationsThreadAction.useData!({ threadIds });
  const sdk = useSdk();
  const navigate = useBbNavigate();
  useLayoutEffect(() => {
    onItem(
      (thread) =>
        notificationsThreadAction.item({ thread, data, sdk, navigate }),
      data,
    );
  });
  return null;
}

function renderNotifications(
  stored: Record<string, ThreadNotificationInputs>,
  threadIds: readonly string[],
) {
  let itemFor: ItemFor | null = null;
  let actionData: ThreadNotificationsData | null = null;
  const onItem = (next: ItemFor, data: ThreadNotificationsData) => {
    itemFor = next;
    actionData = data;
  };
  let current = stored;
  let held: Promise<void> | null = null;
  let readError: Error | null = null;
  const listInput =
    pushNotificationsRpcContract["threadNotifications.keyed"].input;
  const view = renderSlot(
    { component: Probe },
    { threadIds, onItem },
    {
      settings: { defaultLevel: "all", childLevel: "input-only" },
      experimental_rpcTags: (_method, input) => ({
        tags: [],
        keyTags: Object.fromEntries(
          listInput.parse(input).keys.map((key) => [key, [`thread:${key}`]]),
        ),
      }),
      rpc: {
        "threadNotifications.keyed": async (input) => {
          if (readError) throw readError;
          const threads = Object.fromEntries(
            listInput
              .parse(input)
              .keys.map((id) => [
                id,
                current[id] ?? { own: "inherit", ancestorCap: null },
              ]),
          );
          await held;
          return threads;
        },
        "threadNotifications.set": (input) => {
          const { threadId, level } =
            pushNotificationsRpcContract["threadNotifications.set"].input.parse(
              input,
            );
          const row = { own: level, ancestorCap: null };
          current = { ...current, [threadId]: row };
          queueMicrotask(() => {
            void view.experimental_invalidateRpc([`thread:${threadId}`]);
          });
          return row;
        },
      },
    },
  );
  const item = (overrides: Partial<PluginThreadActionTarget> = {}) =>
    itemFor?.(makeTarget(overrides)) ?? null;
  const summary = (overrides: Partial<PluginThreadActionTarget> = {}) => {
    const action = item(overrides);
    return action === null
      ? null
      : {
          detail: action.detail ?? null,
          icon: action.icon,
          hint: action.choices?.hint ?? null,
          selected:
            action.choices?.items.find((choice) => choice.selected)?.id ?? null,
        };
  };
  return {
    view,
    item,
    summary,
    show(ids: readonly string[]) {
      view.rerender(<Probe threadIds={ids} onItem={onItem} />);
    },
    data: () => actionData,
    listCalls: () =>
      view.inspection.rpcCalls
        .filter((call) => call.method === "threadNotifications.keyed")
        .map((call) => ({ threadIds: listInput.parse(call.input).keys })),
    change(next: Record<string, ThreadNotificationInputs>) {
      current = { ...current, ...next };
    },
    restore(next: Record<string, ThreadNotificationInputs>) {
      current = next;
    },
    failReads() {
      readError = new Error("Read unavailable");
    },
    holdReads() {
      let release = () => {};
      held = new Promise((resolve) => {
        release = () => {
          held = null;
          resolve();
        };
      });
      return async () => {
        release();
        await act(async () => {});
      };
    },
  };
}

describe("thread notifications action", () => {
  it("resolves each shown thread's level and hint", async () => {
    const { summary, listCalls } = renderNotifications(
      {
        thr_top: { own: "muted", ancestorCap: null },
        thr_child: {
          own: "inherit",
          ancestorCap: { level: "muted", threadId: "thr_top" },
        },
        thr_grandchild: {
          own: "inherit",
          ancestorCap: { level: "muted", threadId: "thr_top" },
        },
      },
      ["thr_child", "thr_grandchild", "thr_new", "thr_other", "thr_top"],
    );
    await waitFor(() => expect(summary()?.selected).toBe("muted"));
    expect(summary()).toEqual({
      detail: "Muted",
      icon: "push-notifications/off",
      hint: null,
      selected: "muted",
    });
    expect(summary({ id: "thr_child", parentThreadId: "thr_top" })).toEqual({
      detail: "Muted",
      icon: "push-notifications/off",
      hint: "Limited by a parent thread",
      selected: "inherit",
    });
    expect(
      summary({ id: "thr_grandchild", parentThreadId: "thr_child" }),
    ).toEqual({
      detail: "Muted",
      icon: "push-notifications/off",
      hint: "Limited by an ancestor thread",
      selected: "inherit",
    });
    expect(summary({ id: "thr_other", parentThreadId: "thr_top" })).toEqual({
      detail: "Needs input only",
      icon: "BellDot",
      hint: null,
      selected: "inherit",
    });
    expect(summary({ id: "thr_new" })).toEqual({
      detail: "All activity",
      icon: "push-notifications/ringing",
      hint: null,
      selected: "inherit",
    });
    expect(summary({ id: "thr_unshown" })).toEqual({
      detail: "All activity",
      icon: "push-notifications/ringing",
      hint: null,
      selected: "inherit",
    });
    expect(summary({ archivedAt: 1 })).toBeNull();
    expect(listCalls()).toEqual([
      {
        threadIds: [
          "thr_child",
          "thr_grandchild",
          "thr_new",
          "thr_other",
          "thr_top",
        ],
      },
    ]);
  });

  it("fetches only ids it has not loaded, once each, and none for an empty list", async () => {
    const { show, listCalls, change } = renderNotifications({}, []);
    await act(async () => {});
    expect(listCalls()).toEqual([]);
    show(["thr_a", "thr_b"]);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    show(["thr_a", "thr_b", "thr_c"]);
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    show(["thr_a"]);
    show(["thr_a", "thr_b", "thr_c"]);
    await act(async () => {});
    const many = Array.from({ length: 600 }, (_, index) => `thr_${index}`);
    show(many);
    await waitFor(() => expect(listCalls()).toHaveLength(4));
    expect(listCalls().slice(0, 2)).toEqual([
      { threadIds: ["thr_a", "thr_b"] },
      { threadIds: ["thr_c"] },
    ]);
    const requested = listCalls()
      .slice(2)
      .flatMap((call) => call.threadIds);
    expect(requested).toHaveLength(many.length);
    expect(new Set(requested)).toEqual(new Set(many));
  });

  it("keeps action data stable when additional rows use the existing defaults", async () => {
    const { view, show, summary, listCalls, holdReads, change, data } =
      renderNotifications({ thr_top: { own: "muted", ancestorCap: null } }, [
        "thr_top",
      ]);
    await waitFor(() => expect(summary()?.selected).toBe("muted"));
    const loaded = data();
    const release = holdReads();
    show(["thr_top", "thr_default"]);
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await release();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(data()).toBe(loaded);
    expect(summary({ id: "thr_default" })?.selected).toBe("inherit");
    change({ thr_default: { own: "input-only", ancestorCap: null } });
    await view.experimental_invalidateRpc(["thread:thr_default"]);
    await waitFor(() =>
      expect(summary({ id: "thr_default" })?.selected).toBe("input-only"),
    );
    expect(data()).not.toBe(loaded);
  });

  it("shows an unarchived thread's stored level without a reload", async () => {
    const { show, summary, change } = renderNotifications(
      { thr_top: { own: "muted", ancestorCap: null } },
      [],
    );
    expect(summary({ archivedAt: 1 })).toBeNull();
    show(["thr_top"]);
    await waitFor(() => expect(summary()?.selected).toBe("muted"));
  });

  it("applies its own write, realtime rows, and a reload after reconnecting", async () => {
    const { view, item, summary, restore, listCalls, change } =
      renderNotifications({}, ["thr_top"]);
    await waitFor(() => expect(summary()?.selected).toBe("inherit"));

    await act(() => item()!.run({ value: "muted", requestRename: () => {} }));
    expect(
      view.inspection.rpcCalls.filter(
        (call) => call.method === "threadNotifications.set",
      ),
    ).toEqual([
      {
        method: "threadNotifications.set",
        input: { threadId: "thr_top", level: "muted" },
      },
    ]);
    await waitFor(() => expect(summary()?.selected).toBe("muted"));

    change({ thr_top: { own: "inherit", ancestorCap: null } });
    await view.experimental_invalidateRpc(
      Object.keys({ thr_top: { own: "inherit", ancestorCap: null } }).map(
        (id) => `thread:${id}`,
      ),
    );
    await waitFor(() => expect(summary()?.selected).toBe("inherit"));

    const beforeReconnect = listCalls().length;
    restore({ thr_top: { own: "all", ancestorCap: null } });
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await view.behavior.setRealtimeConnectionState("connected");
    await waitFor(() => expect(summary()?.selected).toBe("all"));
    expect(listCalls()).toHaveLength(beforeReconnect + 1);
  });

  it("keeps a level cleared to Default when a read from before the clear lands", async () => {
    const muted = { own: "muted", ancestorCap: null } as const;
    const { view, show, item, summary, restore, listCalls, holdReads, change } =
      renderNotifications({ thr_a: muted, thr_b: muted }, []);
    const release = holdReads();
    show(["thr_a", "thr_b"]);
    await waitFor(() => expect(listCalls()).toHaveLength(1));

    restore({ thr_b: muted });
    await act(() =>
      item({ id: "thr_a" })!.run({ value: "inherit", requestRename: () => {} }),
    );
    restore({});
    change({ thr_b: { own: "inherit", ancestorCap: null } });
    await view.experimental_invalidateRpc(
      Object.keys({ thr_b: { own: "inherit", ancestorCap: null } }).map(
        (id) => `thread:${id}`,
      ),
    );
    await release();

    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(summary({ id: "thr_a" })?.selected).toBe("inherit");
    expect(summary({ id: "thr_b" })?.selected).toBe("inherit");
  });

  it("applies a parent's change to its children on screen through a keyed refresh", async () => {
    const { view, summary, listCalls, change } = renderNotifications({}, [
      "thr_child",
      "thr_top",
    ]);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    const child = { id: "thr_child", parentThreadId: "thr_top" };
    expect(summary(child)?.detail).toBe("Needs input only");

    change({
      thr_top: { own: "muted", ancestorCap: null },
      thr_child: {
        own: "inherit",
        ancestorCap: { level: "muted", threadId: "thr_top" },
      },
    });
    await view.experimental_invalidateRpc(
      Object.keys({
        thr_top: { own: "muted", ancestorCap: null },
        thr_child: {
          own: "inherit",
          ancestorCap: { level: "muted", threadId: "thr_top" },
        },
      }).map((id) => `thread:${id}`),
    );
    await waitFor(() =>
      expect(summary(child)).toMatchObject({
        detail: "Muted",
        hint: "Limited by a parent thread",
      }),
    );
    await waitFor(() => expect(summary()?.selected).toBe("muted"));
    expect(listCalls()).toHaveLength(2);
  });

  it("sends no request for rows already seen, including reads still in flight", async () => {
    const { view, show, summary, listCalls, holdReads, change } =
      renderNotifications({}, []);
    const release = holdReads();
    show(["thr_a", "thr_b"]);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    show(["thr_b", "thr_c"]);
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    change({ thr_b: { own: "muted", ancestorCap: null } });
    await view.experimental_invalidateRpc(
      Object.keys({ thr_b: { own: "muted", ancestorCap: null } }).map(
        (id) => `thread:${id}`,
      ),
    );
    await release();

    await waitFor(() =>
      expect(summary({ id: "thr_b" })?.selected).toBe("muted"),
    );
    show(["thr_c"]);
    show(["thr_a", "thr_b", "thr_c"]);
    await act(async () => {});
    expect(listCalls()).toEqual([
      { threadIds: ["thr_a", "thr_b"] },
      { threadIds: ["thr_c"] },
      { threadIds: ["thr_b"] },
    ]);
  });

  it("updates rows held off screen and fetches rows it never held when shown", async () => {
    const muted = { own: "muted", ancestorCap: null } as const;
    const { view, show, summary, listCalls, change } = renderNotifications(
      { thr_a: muted, thr_b: muted, thr_new: muted },
      ["thr_a", "thr_b"],
    );
    await waitFor(() =>
      expect(summary({ id: "thr_b" })?.selected).toBe("muted"),
    );
    show(["thr_a"]);

    change({
      thr_b: { own: "all", ancestorCap: null },
      thr_new: { own: "all", ancestorCap: null },
    });
    await view.experimental_invalidateRpc(
      Object.keys({
        thr_b: { own: "all", ancestorCap: null },
        thr_new: { own: "all", ancestorCap: null },
      }).map((id) => `thread:${id}`),
    );
    show(["thr_a", "thr_b", "thr_new"]);
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await waitFor(() =>
      expect(summary({ id: "thr_new" })?.selected).toBe("all"),
    );
    expect(summary({ id: "thr_b" })?.selected).toBe("all");
    expect(listCalls()).toEqual([
      { threadIds: ["thr_a", "thr_b"] },
      { threadIds: ["thr_b", "thr_new"] },
    ]);
  });

  it("refetches threads that were off screen during a reconnect when they return", async () => {
    const { view, show, summary, restore, listCalls, change } =
      renderNotifications(
        {
          thr_a: { own: "muted", ancestorCap: null },
          thr_b: { own: "muted", ancestorCap: null },
          thr_c: { own: "muted", ancestorCap: null },
        },
        ["thr_a", "thr_b", "thr_c"],
      );
    await waitFor(() =>
      expect(summary({ id: "thr_c" })?.selected).toBe("muted"),
    );
    show(["thr_a"]);

    restore({
      thr_a: { own: "muted", ancestorCap: null },
      thr_b: { own: "all", ancestorCap: null },
    });
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await view.behavior.setRealtimeConnectionState("connected");
    await waitFor(() => expect(listCalls()).toHaveLength(2));

    show(["thr_a", "thr_b", "thr_c"]);
    await waitFor(() => expect(summary({ id: "thr_b" })?.selected).toBe("all"));
    expect(summary({ id: "thr_c" })?.selected).toBe("inherit");
    expect(summary({ id: "thr_a" })?.selected).toBe("muted");
    expect(listCalls()).toEqual([
      { threadIds: ["thr_a", "thr_b", "thr_c"] },
      { threadIds: ["thr_a"] },
      { threadIds: ["thr_b", "thr_c"] },
    ]);
  });
});

it("keeps a successfully saved notification level when its reread fails", async () => {
  const probe = renderNotifications(
    { thr_top: { own: "all", ancestorCap: null } },
    ["thr_top"],
  );
  await waitFor(() => expect(probe.summary()?.detail).toBe("All activity"));
  probe.failReads();
  await act(async () => {
    await probe.data()!.setLevel("thr_top", "muted");
  });
  await waitFor(() => expect(probe.listCalls().length).toBeGreaterThan(1));
  expect(probe.summary()?.detail).toBe("Muted");
});

async function renderServerNotifications(
  failInitially = false,
  ids = ["thr_a_default", "thr_z_explicit"],
) {
  const metadata = new Map<string, Record<string, unknown>>([
    ["thr_z_explicit", { notifications: { own: "muted" } }],
  ]);
  let failReads = failInitially;
  const server = createFakePluginHost({
    pluginId: "push-notifications",
    sdk: {
      threads: {
        experimental_listAncestors: async ({ threadIds }) => ({
          threads: threadIds.map((threadId) => ({ threadId, ancestorIds: [] })),
        }),
        experimental_listDescendants: async ({ threadIds }) => ({
          threads: threadIds.map((threadId) => ({
            threadId,
            descendantIds: [],
          })),
        }),
        experimental_listPluginMetadata: async ({ threadIds }) => {
          if (failReads) throw new Error("Notification read failed");
          return {
            threads: threadIds.flatMap((threadId) =>
              metadata.has(threadId)
                ? [{ threadId, metadata: metadata.get(threadId)! }]
                : [],
            ),
          };
        },
        updatePluginMetadata: async ({ threadId, set, remove }) => {
          const next = { ...metadata.get(threadId), ...set };
          for (const key of remove ?? []) delete next[key];
          metadata.set(threadId, next);
          return next;
        },
      },
    },
  });
  await serverPlugin(server.bb);
  let itemFor: ItemFor | null = null;
  const contract = pushNotificationsRpcContract["threadNotifications.keyed"];
  const view = renderSlot(
    { component: Probe },
    {
      threadIds: ids,
      onItem: (next: ItemFor) => {
        itemFor = next;
      },
    },
    {
      settings: { defaultLevel: "all", childLevel: "input-only" },
      experimental_rpcTags: () => ({
        tags: [],
        keyTags:
          server.harness.inspection.experimental_rpcKeyTags.get(
            "threadNotifications.keyed",
          ) ?? {},
      }),
      rpc: {
        "threadNotifications.keyed": async (input) =>
          contract.output.parse(
            await server.harness.callRpc(
              "threadNotifications.keyed",
              contract.input.parse(input),
            ),
          ),
      },
    },
  );
  const unsubscribe = server.harness.inspection.experimental_onRpcInvalidation(
    (tags) => {
      void view.experimental_invalidateRpc(tags ?? undefined);
    },
  );
  return {
    view,
    item: (id = "thr_a_default") => itemFor?.(makeTarget({ id })) ?? null,
    fail(value: boolean) {
      failReads = value;
    },
    async reset() {
      await server.harness.callRpc("threadNotifications.set", {
        threadId: "thr_z_explicit",
        level: "inherit",
      });
    },
    async dispose() {
      unsubscribe();
      view.lifecycle.unmount();
      await server.harness.dispose();
    },
  };
}

it("loads mixed default and explicit rows through the real keyed handler", async () => {
  const probe = await renderServerNotifications();
  try {
    await waitFor(() =>
      expect(probe.item("thr_z_explicit")?.detail).toBe("Muted"),
    );
    expect(
      probe.item()?.choices?.items.find((choice) => choice.selected)?.id,
    ).toBe("inherit");
  } finally {
    await probe.dispose();
  }
});

it.each([false, true])(
  "offers Retry for real keyed read errors with cached rows: %s",
  async (cached) => {
    const probe = await renderServerNotifications(!cached, ["thr_z_explicit"]);
    try {
      if (cached) {
        await waitFor(() =>
          expect(probe.item("thr_z_explicit")?.detail).toBe("Muted"),
        );
        probe.fail(true);
        await act(async () => {
          await probe.view.experimental_invalidateRpc([
            "thread:thr_z_explicit",
          ]);
        });
      }
      await waitFor(() =>
        expect(probe.item("thr_z_explicit")?.choices?.hint).toContain(
          "Notification read failed",
        ),
      );
      if (cached) expect(probe.item("thr_z_explicit")?.detail).toBe("Muted");
      else {
        expect(probe.item("thr_z_explicit")?.detail).toBe(
          "Notifications unavailable",
        );
        expect(
          probe
            .item("thr_z_explicit")
            ?.choices?.items.map((choice) => choice.label),
        ).toEqual(["Retry"]);
      }
      const retry = probe
        .item("thr_z_explicit")
        ?.choices?.items.find((choice) => choice.label === "Retry");
      expect(retry).toBeDefined();
      probe.fail(false);
      await act(async () => {
        await probe
          .item("thr_z_explicit")!
          .run({ value: retry!.id, requestRename: () => {} });
      });
      await waitFor(() =>
        expect(probe.item("thr_z_explicit")?.choices?.hint ?? "").not.toContain(
          "Notification read failed",
        ),
      );
      expect(probe.item("thr_z_explicit")?.detail).toBe("Muted");
    } finally {
      await probe.dispose();
    }
  },
);

it("clears an override removed on another client through the real keyed handler", async () => {
  const probe = await renderServerNotifications(false, ["thr_z_explicit"]);
  try {
    await waitFor(() =>
      expect(probe.item("thr_z_explicit")?.detail).toBe("Muted"),
    );
    await act(async () => {
      await probe.reset();
    });
    await waitFor(() =>
      expect(
        probe
          .item("thr_z_explicit")
          ?.choices?.items.find((choice) => choice.selected)?.id,
      ).toBe("inherit"),
    );
  } finally {
    await probe.dispose();
  }
});
