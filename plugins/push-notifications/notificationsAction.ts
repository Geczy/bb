import { useCallback, useMemo, useState } from "react";
import {
  experimental_THREAD_ACTION_GROUPS,
  experimental_useRpcKeyedQuery,
  useRpc,
  useSettings,
  type PluginThreadActionDataInput,
  type PluginThreadActionRegistration,
} from "@get-bb/plugin-sdk/app";
import { type pushNotificationsRpcContract } from "./contract.js";
import {
  NOTIFICATION_LEVEL_LABELS,
  notificationLevelSchema,
  ownNotificationLevelSchema,
  resolveThreadNotifications,
  UNSET_THREAD_NOTIFICATIONS,
  type NotificationDefaults,
  type NotificationLevel,
  type OwnNotificationLevel,
  type ThreadNotificationInputs,
  type ThreadNotifications,
} from "./preferences.js";

export interface ThreadNotificationsData {
  levels: ReadonlyMap<string, ThreadNotificationInputs>;
  defaults: NotificationDefaults | null;
  setLevel(threadId: string, level: OwnNotificationLevel): Promise<void>;
}

function parseDefaults(
  values: Record<string, string | number | boolean> | undefined,
): NotificationDefaults | null {
  const defaultLevel = notificationLevelSchema.safeParse(values?.defaultLevel);
  const childLevel = ownNotificationLevelSchema.safeParse(values?.childLevel);
  if (!defaultLevel.success || !childLevel.success) return null;
  return { defaultLevel: defaultLevel.data, childLevel: childLevel.data };
}

function useThreadNotificationsData({
  threadIds,
}: PluginThreadActionDataInput): ThreadNotificationsData {
  const rpc = useRpc<typeof pushNotificationsRpcContract>();
  const { values } = useSettings();
  const query = experimental_useRpcKeyedQuery<ThreadNotificationInputs>({
    method: "threadNotifications.keyed",
    keys: threadIds,
  });
  const nextLevels = useMemo(
    () =>
      new Map(
        Object.entries(query.data ?? {}).filter(
          ([, inputs]) =>
            inputs.own !== "inherit" || inputs.ancestorCap !== null,
        ),
      ),
    [query.data],
  );
  const [levels, setLevels] = useState(nextLevels);
  const [lastLevels, setLastLevels] = useState(nextLevels);
  if (lastLevels !== nextLevels) {
    setLastLevels(nextLevels);
    if (
      nextLevels.size !== levels.size ||
      [...nextLevels].some(([id, inputs]) => levels.get(id) !== inputs)
    )
      setLevels(nextLevels);
  }
  const setLevel = useCallback(
    async (threadId: string, level: OwnNotificationLevel) => {
      const saved = await rpc.call("threadNotifications.set", {
        threadId,
        level,
      });
      setLevels((current) => new Map(current).set(threadId, saved));
    },
    [rpc],
  );

  const defaultsKey = JSON.stringify(parseDefaults(values));
  const defaults = useMemo(
    () => JSON.parse(defaultsKey) as NotificationDefaults | null,
    [defaultsKey],
  );

  return useMemo(
    () => ({ levels, defaults, setLevel }),
    [defaults, levels, setLevel],
  );
}

const LEVEL_ICONS: Record<NotificationLevel, string> = {
  all: "push-notifications/ringing",
  "input-only": "BellDot",
  muted: "push-notifications/off",
};

function capHint(row: ThreadNotifications): string | undefined {
  if (row.source === "parent") return "Limited by a parent thread";
  if (row.source === "ancestor") return "Limited by an ancestor thread";
  return undefined;
}

export const notificationsThreadAction: PluginThreadActionRegistration<ThreadNotificationsData> =
  {
    id: "notifications",
    title: "Notifications",
    icon: "BellDot",
    group: experimental_THREAD_ACTION_GROUPS.state,
    order: 50,
    useData: useThreadNotificationsData,
    item: ({ thread, data }) => {
      if (thread.archivedAt !== null) return null;
      const stored = data.levels.get(thread.id) ?? UNSET_THREAD_NOTIFICATIONS;
      const resolved =
        data.defaults === null
          ? null
          : resolveThreadNotifications(
              stored,
              { parentThreadId: thread.parentThreadId },
              data.defaults,
            );
      const hint = resolved === null ? undefined : capHint(resolved);
      return {
        label: "Notifications",
        ...(resolved === null
          ? {}
          : { detail: NOTIFICATION_LEVEL_LABELS[resolved.effective] }),
        icon: resolved === null ? "BellDot" : LEVEL_ICONS[resolved.effective],
        choices: {
          ...(hint === undefined ? {} : { hint }),
          items: ownNotificationLevelSchema.options.map((id) => ({
            id,
            label: NOTIFICATION_LEVEL_LABELS[id],
            selected: id === stored.own,
          })),
        },
        run: async ({ value }) => {
          const level = ownNotificationLevelSchema.safeParse(value);
          if (!level.success) return;
          await data.setLevel(thread.id, level.data);
        },
      };
    },
  };
