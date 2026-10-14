import {
  useEffect,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import { z } from "zod";
import type { ExperimentalBadge } from "@get-bb/plugin-sdk";
import { cn } from "@bb/shared-ui/lib/utils";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import type { PluginNavPanelSlot } from "@/lib/plugin-slots";

export type RailBadges = ReadonlyMap<string, ExperimentalBadge>;

type UseRailBadge = NonNullable<PluginNavPanelSlot["experimental_useBadge"]>;

interface RailBadgeSourceProps {
  itemId: string;
  setBadges: Dispatch<SetStateAction<RailBadges>>;
}

const MAX_DRAWN_COUNT = 9;

const railBadgeSchema = z
  .object({
    count: z.number().int().positive().optional(),
    label: z.string().trim().min(1),
  })
  .strict()
  .nullable();

function withBadge(
  badges: RailBadges,
  itemId: string,
  badge: ExperimentalBadge | null,
): RailBadges {
  const current = badges.get(itemId);
  if (badge === null) {
    if (current === undefined) return badges;
    const next = new Map(badges);
    next.delete(itemId);
    return next;
  }
  if (current?.count === badge.count && current?.label === badge.label) {
    return badges;
  }
  return new Map(badges).set(itemId, badge);
}

const railBadgeSources = new WeakMap<
  UseRailBadge,
  ComponentType<RailBadgeSourceProps>
>();

function railBadgeSource(
  useRailBadge: UseRailBadge,
): ComponentType<RailBadgeSourceProps> {
  const cached = railBadgeSources.get(useRailBadge);
  if (cached) return cached;
  function RailBadgeSource({ itemId, setBadges }: RailBadgeSourceProps) {
    const parsed = railBadgeSchema.safeParse(useRailBadge());
    if (!parsed.success) {
      throw new Error(
        `experimental_useBadge returned an invalid badge: ${parsed.error.message}`,
      );
    }
    const count = parsed.data?.count;
    const label = parsed.data?.label;
    useEffect(() => {
      setBadges((badges) =>
        withBadge(
          badges,
          itemId,
          label === undefined
            ? null
            : { ...(count === undefined ? {} : { count }), label },
        ),
      );
      return () => setBadges((badges) => withBadge(badges, itemId, null));
    }, [count, itemId, label, setBadges]);
    return null;
  }
  railBadgeSources.set(useRailBadge, RailBadgeSource);
  return RailBadgeSource;
}

export function RailBadgeSources({
  panels,
  setBadges,
}: {
  panels: readonly { itemId: string; panel: PluginNavPanelSlot }[];
  setBadges: Dispatch<SetStateAction<RailBadges>>;
}) {
  return panels.map(({ itemId, panel }) => {
    const useRailBadge = panel.experimental_useBadge;
    if (useRailBadge === undefined) return null;
    const Source = railBadgeSource(useRailBadge);
    return (
      <PluginSlotMount
        key={`${panel.pluginId}/${panel.id}/${panel.generation}`}
        pluginId={panel.pluginId}
        slotKind="navPanelBadge"
        slotId={panel.id}
        crashFallback={null}
      >
        <Source itemId={itemId} setBadges={setBadges} />
      </PluginSlotMount>
    );
  });
}

export function railBadgeAccessibleLabel(
  label: string,
  badge: ExperimentalBadge | undefined,
): string {
  return badge === undefined ? label : `${label}, ${badge.label}`;
}

export function RailBadgeMark({
  count,
  className,
}: {
  count: number | undefined;
  className?: string;
}) {
  if (count === undefined) {
    return (
      <span
        aria-hidden="true"
        data-nav-rail-badge="dot"
        className={cn("size-1.5 rounded-full bg-primary", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-nav-rail-badge="count"
      className={cn(
        "flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-2xs leading-none font-medium tabular-nums text-primary-foreground",
        className,
      )}
    >
      {count > MAX_DRAWN_COUNT ? `${MAX_DRAWN_COUNT}+` : count}
    </span>
  );
}
