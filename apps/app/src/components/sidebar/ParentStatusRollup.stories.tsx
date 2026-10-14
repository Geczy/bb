import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Story } from "@ladle/react";
import type { ThreadListIndicatorKind } from "@bb/client-core";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@bb/shared-ui/hover-card";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_STATUS_GLYPH_BOX_CLASS,
  SIDEBAR_STATUS_ICON_CLASS,
  SIDEBAR_WORKING_STATUS_COLOR_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "@bb/shared-ui/sidebar-row-classes";
import { ThreadStatusGlyph } from "@/components/thread/ThreadStatusGlyph";

export default { title: "prototypes/Parent status rollup" };

type Attention = "needs-input" | "error" | "unread";
type Activity = Extract<
  ThreadListIndicatorKind,
  "runtime" | "workflow" | "background-agent"
>;

interface Row {
  title: string;
  depth: number;
  parent?: "collapsed" | "expanded";
  today: ThreadListIndicatorKind;
  activity?: Activity;
  attention?: Attention;
  fromChild?: boolean;
  count?: number;
  tooltip?: string;
}

type Marker = "none" | "dot" | "count";

interface Scenario {
  name: string;
  rows: Row[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "Child needs approval, parent collapsed",
    rows: [
      {
        title: "Release 0.48",
        depth: 0,
        parent: "collapsed",
        today: "waiting-for-input",
        attention: "needs-input",
        fromChild: true,
        tooltip: "Sign macOS build needs approval",
      },
    ],
  },
  {
    name: "Child errored, parent collapsed",
    rows: [
      {
        title: "Migrate settings storage",
        depth: 0,
        parent: "collapsed",
        today: "none",
        attention: "error",
        fromChild: true,
        tooltip: "Backfill script failed",
      },
    ],
  },
  {
    name: "Grandchild waiting, parent expanded",
    rows: [
      {
        title: "Plugin catalog refresh",
        depth: 0,
        parent: "expanded",
        today: "none",
        attention: "needs-input",
        fromChild: true,
        tooltip: "Catalog screenshots needs input",
      },
      {
        title: "Catalog assets",
        depth: 1,
        parent: "collapsed",
        today: "waiting-for-input",
        attention: "needs-input",
        fromChild: true,
        tooltip: "Catalog screenshots needs input",
      },
      { title: "Catalog descriptions", depth: 1, today: "none" },
    ],
  },
  {
    name: "Parent idle, children running, parent expanded",
    rows: [
      {
        title: "Fix flaky composer tests",
        depth: 0,
        parent: "expanded",
        today: "none",
        activity: "runtime",
      },
      {
        title: "Bisect timeline test",
        depth: 1,
        today: "runtime",
        activity: "runtime",
      },
      {
        title: "Audit fake timers",
        depth: 1,
        today: "runtime",
        activity: "runtime",
      },
    ],
  },
  {
    name: "Parent running while a child waits, parent collapsed",
    rows: [
      {
        title: "Ship onboarding tips",
        depth: 0,
        parent: "collapsed",
        today: "waiting-for-input",
        activity: "runtime",
        attention: "needs-input",
        fromChild: true,
        tooltip: "Copy review needs input",
      },
    ],
  },
  {
    name: "Parent's own error plus a child waiting, parent collapsed",
    rows: [
      {
        title: "Nightly packaging",
        depth: 0,
        parent: "collapsed",
        today: "unread-error",
        attention: "needs-input",
        fromChild: true,
        tooltip: "Notarize build needs approval · This thread errored",
      },
    ],
  },
  {
    name: "Child finished and the parent took over",
    rows: [
      {
        title: "Write release notes",
        depth: 0,
        parent: "expanded",
        today: "runtime",
        activity: "runtime",
      },
      { title: "Collect merged PRs", depth: 1, today: "none" },
    ],
  },
];

function Chevron({ parent }: { parent: Row["parent"] }) {
  if (!parent) return <span className="size-5 shrink-0" />;
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
      <Icon
        name="ChevronRight"
        className={cn("size-3", parent === "expanded" && "rotate-90")}
        aria-hidden="true"
      />
    </span>
  );
}

function GlyphSlot({ children }: { children?: ReactNode }) {
  return (
    <span
      className={cn(
        "relative",
        SIDEBAR_ROW_GLYPH_SLOT_CLASS,
        SIDEBAR_STATUS_GLYPH_BOX_CLASS,
      )}
    >
      {children}
    </span>
  );
}

const MARKER_TONE: Record<Attention, string> = {
  "needs-input": "bg-attention",
  error: "bg-destructive",
  unread: "bg-muted-foreground/60",
};

function AttentionGlyph({
  attention,
  fromChild,
  count,
  marker,
}: {
  attention: Attention;
  fromChild: boolean;
  count: number;
  marker: Marker;
}) {
  const glyph =
    attention === "needs-input" ? (
      <Icon
        name="CircleQuestion"
        className={cn("text-attention", SIDEBAR_STATUS_ICON_CLASS)}
      />
    ) : (
      <ThreadStatusGlyph
        indicator={attention === "error" ? "unread-error" : "unread-success"}
      />
    );
  const showCount = marker === "count" && count >= 2;
  const showDot = !showCount && marker !== "none" && fromChild;
  return (
    <>
      {glyph}
      {showCount ? (
        <span
          className={cn(
            "absolute -top-1.5 -right-2 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-2xs leading-none font-medium text-sidebar tabular-nums ring-2 ring-sidebar",
            MARKER_TONE[attention],
          )}
        >
          {count}
        </span>
      ) : null}
      {showDot ? (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-[5px] rounded-full ring-2 ring-sidebar",
            MARKER_TONE[attention],
          )}
        />
      ) : null}
    </>
  );
}

function SidebarRow({
  row,
  variant,
  marker,
}: {
  row: Row;
  variant: "today" | "proposed";
  marker: Marker;
}) {
  return (
    <div
      className={cn(
        SIDEBAR_ROW_BASE_CLASS,
        SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
        "h-8 pr-2",
      )}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(row.depth) }}
    >
      <Chevron parent={row.parent} />
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      {variant === "today" ? (
        <GlyphSlot>
          <ThreadStatusGlyph indicator={row.today} />
        </GlyphSlot>
      ) : (
        <span className="flex items-center gap-1.5">
          <GlyphSlot>
            {row.activity ? <ThreadStatusGlyph indicator={row.activity} /> : null}
          </GlyphSlot>
          <span title={row.tooltip}>
            <GlyphSlot>
              {row.attention ? (
                <AttentionGlyph
                  attention={row.attention}
                  fromChild={row.fromChild ?? false}
                  count={row.count ?? 1}
                  marker={marker}
                />
              ) : null}
            </GlyphSlot>
          </span>
        </span>
      )}
    </div>
  );
}

function Column({
  label,
  rows,
  variant,
  marker,
}: {
  label: string;
  rows: Row[];
  variant: "today" | "proposed";
  marker: Marker;
}) {
  return (
    <div className="flex w-72 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
        {rows.map((row) => (
          <SidebarRow
            key={row.title}
            row={row}
            variant={variant}
            marker={marker}
          />
        ))}
      </div>
    </div>
  );
}

export const TodayVsProposed: Story<{ childMarker: boolean }> = ({
  childMarker,
}) => (
  <div className="flex flex-col gap-6 p-6">
    {SCENARIOS.map((scenario) => (
      <section key={scenario.name} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">{scenario.name}</h3>
        <div className="flex gap-6">
          <Column
            label="Today"
            rows={scenario.rows}
            variant="today"
            marker="none"
          />
          <Column
            label="Proposed"
            rows={scenario.rows}
            variant="proposed"
            marker={childMarker ? "dot" : "none"}
          />
        </div>
      </section>
    ))}
  </div>
);
TodayVsProposed.args = { childMarker: true };

const FAMILY_TOOLTIP =
  "Draft announcement needs approval · Update pricing page failed";

const FAMILY_CHILDREN: Row[] = [
  {
    title: "Draft announcement",
    depth: 1,
    today: "waiting-for-input",
    attention: "needs-input",
    tooltip: "Needs approval",
  },
  {
    title: "Update pricing page",
    depth: 1,
    today: "none",
    attention: "error",
    tooltip: "Failed",
  },
  {
    title: "Record demo clip",
    depth: 1,
    today: "runtime",
    activity: "runtime",
  },
];

const FAMILY_STATES: { name: string; rows: Row[] }[] = [
  {
    name: "Collapsed",
    rows: [
      {
        title: "Launch week prep",
        depth: 0,
        parent: "collapsed",
        today: "waiting-for-input",
        activity: "runtime",
        attention: "needs-input",
        fromChild: true,
        count: 2,
        tooltip: FAMILY_TOOLTIP,
      },
    ],
  },
  {
    name: "Expanded",
    rows: [
      {
        title: "Launch week prep",
        depth: 0,
        parent: "expanded",
        today: "none",
        activity: "runtime",
        attention: "needs-input",
        fromChild: true,
        count: 2,
        tooltip: FAMILY_TOOLTIP,
      },
      ...FAMILY_CHILDREN,
    ],
  },
];

export const ParentWithThreeChildren: Story = () => (
  <div className="flex flex-col gap-6 p-6">
    <p className="max-w-3xl text-sm text-muted-foreground">
      Launch week prep is idle. Its children: Draft announcement needs
      approval, Update pricing page failed, Record demo clip is running.
    </p>
    {FAMILY_STATES.map((state) => (
      <section key={state.name} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">{state.name}</h3>
        <div className="flex gap-6">
          <Column label="Today" rows={state.rows} variant="today" marker="none" />
          <Column
            label="Proposed · dot"
            rows={state.rows}
            variant="proposed"
            marker="dot"
          />
          <Column
            label="Proposed · count"
            rows={state.rows}
            variant="proposed"
            marker="count"
          />
        </div>
      </section>
    ))}
  </div>
);

type ChildState = "needs-input" | "error" | "running" | "idle";

interface Family {
  title: string;
  own: ThreadListIndicatorKind;
  ownLabel: string;
  todayCollapsed: ThreadListIndicatorKind;
  children: { title: string; state: ChildState }[];
}

const FAMILIES: Family[] = [
  {
    title: "Launch week prep",
    own: "runtime",
    ownLabel: "Parent is working",
    todayCollapsed: "waiting-for-input",
    children: [
      { title: "Draft announcement", state: "needs-input" },
      { title: "Update pricing page", state: "error" },
      { title: "Record demo clip", state: "running" },
    ],
  },
  {
    title: "Nightly packaging",
    own: "unread-success",
    ownLabel: "Parent finished, unread",
    todayCollapsed: "waiting-for-input",
    children: [
      { title: "Notarize build", state: "needs-input" },
      { title: "Upload symbols", state: "running" },
      { title: "Smoke test", state: "idle" },
    ],
  },
  {
    title: "Docs refresh",
    own: "none",
    ownLabel: "Parent is idle",
    todayCollapsed: "runtime",
    children: [
      { title: "Rewrite CLI guide", state: "running" },
      { title: "Screenshot pass", state: "running" },
      { title: "Link check", state: "idle" },
    ],
  },
  {
    title: "Onboarding tips",
    own: "none",
    ownLabel: "Parent is idle",
    todayCollapsed: "waiting-for-input",
    children: [
      { title: "Tip copy review", state: "needs-input" },
      { title: "Event naming", state: "needs-input" },
      { title: "Tips carousel", state: "error" },
      { title: "Analytics wiring", state: "running" },
    ],
  },
];

const CHILD_STATE_ORDER: ChildState[] = [
  "needs-input",
  "error",
  "running",
  "idle",
];

const CHILD_LABEL: Record<ChildState, string> = {
  "needs-input": "needs input",
  error: "failed",
  running: "running",
  idle: "idle",
};

function familyTooltip(family: Family): string {
  return family.children
    .filter((child) => child.state !== "idle")
    .map((child) => `${child.title} ${CHILD_LABEL[child.state]}`)
    .join(" · ");
}

function sortedChildren(family: Family) {
  return [...family.children].sort(
    (a, b) =>
      CHILD_STATE_ORDER.indexOf(a.state) - CHILD_STATE_ORDER.indexOf(b.state),
  );
}

function needsAction(state: ChildState) {
  return state === "needs-input" || state === "error";
}

const CHILD_DOT_CLASS: Record<ChildState, string> = {
  "needs-input": "bg-attention",
  error: "bg-destructive",
  running: "border border-muted-foreground/60 animate-pulse",
  idle: "",
};

function ChildDots({ family }: { family: Family }) {
  const visible = sortedChildren(family).filter(
    (child) => child.state !== "idle",
  );
  return (
    <span
      className="flex items-center gap-[3px]"
      title={familyTooltip(family)}
      aria-label={familyTooltip(family)}
    >
      {visible.map((child) => (
        <span
          key={child.title}
          className={cn("size-1.5 rounded-full", CHILD_DOT_CLASS[child.state])}
        />
      ))}
    </span>
  );
}

function ChildMiniIcons({ family }: { family: Family }) {
  const active = sortedChildren(family).filter(
    (child) => child.state !== "idle",
  );
  const anyRunning = active.some((child) => child.state === "running");
  const actionable = active.filter((child) => needsAction(child.state));
  return (
    <span
      className="flex items-center gap-0.5"
      title={familyTooltip(family)}
      aria-label={familyTooltip(family)}
    >
      {actionable.map((child) =>
        child.state === "needs-input" ? (
          <Icon
            key={child.title}
            name="CircleQuestion"
            className="size-3 text-attention"
          />
        ) : (
          <Icon
            key={child.title}
            name="CircleX"
            className="size-3 text-destructive"
          />
        ),
      )}
      {anyRunning ? (
        <Icon
          name="Loading"
          className="size-3 animate-spin text-muted-foreground/50 motion-reduce:animate-none"
        />
      ) : null}
    </span>
  );
}

function ChildKindIcons({
  family,
  includeRunning,
}: {
  family: Family;
  includeRunning: boolean;
}) {
  const kinds = new Set(family.children.map((child) => child.state));
  return (
    <span
      className="flex items-center gap-0.5"
      title={familyTooltip(family)}
      aria-label={familyTooltip(family)}
    >
      {kinds.has("needs-input") ? (
        <Icon name="CircleQuestion" className="size-3 text-attention" />
      ) : null}
      {kinds.has("error") ? (
        <Icon name="CircleX" className="size-3 text-destructive" />
      ) : null}
      {includeRunning && kinds.has("running") ? (
        <Icon
          name="Loading"
          className="size-3 animate-spin text-muted-foreground/50 motion-reduce:animate-none"
        />
      ) : null}
    </span>
  );
}

function ChildChevron({ family }: { family: Family }) {
  const actionable = family.children.filter((child) =>
    needsAction(child.state),
  );
  const worst = sortedChildren(family)[0]?.state ?? "idle";
  const tone =
    worst === "needs-input"
      ? "text-attention"
      : worst === "error"
        ? "text-destructive"
        : "text-subtle-foreground";
  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center",
        tone,
      )}
      title={familyTooltip(family)}
      aria-label={familyTooltip(family)}
    >
      <Icon
        name="ChevronRight"
        className={cn("size-3", worst === "running" && "animate-pulse")}
      />
      {actionable.length > 0 ? (
        <span
          className={cn(
            "absolute -top-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-2xs leading-none font-medium text-sidebar tabular-nums ring-2 ring-sidebar",
            worst === "error" ? "bg-destructive" : "bg-attention",
          )}
        >
          {actionable.length}
        </span>
      ) : null}
    </span>
  );
}

type FamilyVariant =
  | "today"
  | "chevron"
  | "dots"
  | "mini"
  | "kinds"
  | "kinds-no-running";

function OwnGlyph({ indicator, label }: { indicator: ThreadListIndicatorKind; label: string }) {
  return (
    <span title={label}>
      <GlyphSlot>
        <ThreadStatusGlyph indicator={indicator} />
      </GlyphSlot>
    </span>
  );
}

function FamilyRows({
  family,
  variant,
  expanded,
}: {
  family: Family;
  variant: FamilyVariant;
  expanded: boolean;
}) {
  const rowClass = cn(
    SIDEBAR_ROW_BASE_CLASS,
    SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    "h-8 pr-2",
  );
  const leading =
    variant === "chevron" && !expanded ? (
      <ChildChevron family={family} />
    ) : (
      <Chevron parent={expanded ? "expanded" : "collapsed"} />
    );
  const parentIndicator =
    variant === "today" && !expanded ? family.todayCollapsed : family.own;
  return (
    <>
      <div
        className={rowClass}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      >
        {leading}
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        {!expanded && variant === "dots" ? <ChildDots family={family} /> : null}
        {!expanded && variant === "mini" ? (
          <ChildMiniIcons family={family} />
        ) : null}
        {!expanded && (variant === "kinds" || variant === "kinds-no-running") ? (
          <ChildKindIcons
            family={family}
            includeRunning={variant === "kinds"}
          />
        ) : null}
        <OwnGlyph indicator={parentIndicator} label={family.ownLabel} />
      </div>
      {expanded
        ? family.children.map((child) => (
            <div
              key={child.title}
              className={rowClass}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <GlyphSlot>
                {child.state === "needs-input" && variant === "today" ? (
                  <ThreadStatusGlyph indicator="waiting-for-input" />
                ) : child.state === "needs-input" ? (
                  <Icon
                    name="CircleQuestion"
                    className={cn("text-attention", SIDEBAR_STATUS_ICON_CLASS)}
                  />
                ) : child.state === "error" && variant === "today" ? null : child.state === "error" ? (
                  <ThreadStatusGlyph indicator="unread-error" />
                ) : child.state === "running" ? (
                  <ThreadStatusGlyph indicator="runtime" />
                ) : null}
              </GlyphSlot>
            </div>
          ))
        : null}
    </>
  );
}

const FAMILY_VARIANTS: { variant: FamilyVariant; label: string }[] = [
  { variant: "today", label: "Today" },
  { variant: "chevron", label: "A · Chevron carries children" },
  { variant: "dots", label: "B · One dot per busy child" },
  { variant: "mini", label: "C · Mini icons for children" },
];

export const ParentVsChildren: Story = () => (
  <div className="flex flex-col gap-6 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      The rightmost icon is always the parent&apos;s own status. Children are
      summarised separately, only while the parent is collapsed. Expanded,
      the parent shows only its own state. Hover for details.
    </p>
    {[false, true].map((expanded) => (
      <section key={String(expanded)} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {expanded ? "Expanded" : "Collapsed"}
        </h3>
        <div className="flex gap-4">
          {FAMILY_VARIANTS.map(({ variant, label }) => (
            <div key={variant} className="flex w-64 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
                {FAMILIES.map((family) => (
                  <FamilyRows
                    key={family.title}
                    family={family}
                    variant={variant}
                    expanded={expanded}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

const RECOMMENDED_VARIANTS: { variant: FamilyVariant; label: string }[] = [
  { variant: "today", label: "Today" },
  { variant: "kinds", label: "Rec · one icon per kind" },
  { variant: "kinds-no-running", label: "Rec · needs-you only" },
];

export const Recommended: Story = () => (
  <div className="flex flex-col gap-6 p-6">
    <p className="max-w-3xl text-sm text-muted-foreground">
      Rightmost icon: the parent&apos;s own status. Small icons before it: what
      its children are doing, one icon per kind, shown only while collapsed.
      Hover for which child is which.
    </p>
    {[false, true].map((expanded) => (
      <section key={String(expanded)} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {expanded ? "Expanded" : "Collapsed"}
        </h3>
        <div className="flex gap-4">
          {RECOMMENDED_VARIANTS.map(({ variant, label }) => (
            <div key={variant} className="flex w-64 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
                {FAMILIES.map((family) => (
                  <FamilyRows
                    key={family.title}
                    family={family}
                    variant={variant}
                    expanded={expanded}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

interface SummaryStyle {
  label: string;
  running: "spinner" | "ring";
  capsule: boolean;
  placement: "trailing" | "inline";
}

const ITERATION_STYLES: SummaryStyle[] = [
  {
    label: "v1 · current rec",
    running: "spinner",
    capsule: false,
    placement: "trailing",
  },
  {
    label: "v2 · running as a ring",
    running: "ring",
    capsule: false,
    placement: "trailing",
  },
  {
    label: "v3 · ring, grouped in a capsule",
    running: "ring",
    capsule: true,
    placement: "trailing",
  },
  {
    label: "v5 · spinner, grouped in a capsule",
    running: "spinner",
    capsule: true,
    placement: "trailing",
  },
  {
    label: "v4 · capsule beside the title",
    running: "ring",
    capsule: true,
    placement: "inline",
  },
];

function ChildSummary({
  family,
  style,
}: {
  family: Family;
  style: SummaryStyle;
}) {
  const kinds = new Set(family.children.map((child) => child.state));
  const icons = [
    kinds.has("needs-input") ? (
      <Icon
        key="needs-input"
        name="CircleQuestion"
        className="size-3 text-attention"
      />
    ) : null,
    kinds.has("error") ? (
      <Icon key="error" name="CircleX" className="size-3 text-destructive" />
    ) : null,
    kinds.has("running") ? (
      style.running === "spinner" ? (
        <Icon
          key="running"
          name="Loading"
          className="size-3 animate-spin text-muted-foreground/50 motion-reduce:animate-none"
        />
      ) : (
        <span
          key="running"
          className="inline-flex size-3 items-center justify-center"
        >
          <span className="size-2 rounded-full border-[1.5px] border-muted-foreground/60 motion-safe:animate-pulse" />
        </span>
      )
    ) : null,
  ].filter(Boolean);
  if (icons.length === 0) return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5",
        style.capsule && "h-4 rounded-full bg-sidebar-accent px-1",
      )}
      title={familyTooltip(family)}
      aria-label={familyTooltip(family)}
    >
      {icons}
    </span>
  );
}

function IterationRow({
  family,
  style,
}: {
  family: Family;
  style: SummaryStyle;
}) {
  return (
    <div
      className={cn(
        SIDEBAR_ROW_BASE_CLASS,
        SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
        "h-8 pr-2",
      )}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
    >
      <Chevron parent="collapsed" />
      {style.placement === "inline" ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate">{family.title}</span>
          <ChildSummary family={family} style={style} />
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{family.title}</span>
          <span className="mr-1">
            <ChildSummary family={family} style={style} />
          </span>
        </>
      )}
      <OwnGlyph indicator={family.own} label={family.ownLabel} />
    </div>
  );
}

const LONG_TITLE_FAMILY: Family = {
  ...FAMILIES[0]!,
  title: "Coordinate the launch week announcement and pricing work",
};

export const Iteration: Story = () => (
  <div className="flex flex-col gap-6 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      All rows collapsed. Rightmost icon: the parent&apos;s own status. Small
      icons: its children, one per kind (needs you, failed, running). The last
      row has a long title to test truncation.
    </p>
    <div className="flex flex-wrap gap-4">
      {ITERATION_STYLES.map((style) => (
        <div key={style.label} className="flex w-64 flex-col gap-1">
          <span className="text-xs text-muted-foreground">{style.label}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {[...FAMILIES, LONG_TITLE_FAMILY].map((family) => (
              <IterationRow key={family.title} family={family} style={style} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const V6_FAMILIES: Family[] = [
  FAMILIES[0]!,
  FAMILIES[1]!,
  {
    ...FAMILIES[2]!,
    children: [
      { title: "Rewrite CLI guide", state: "running" },
      { title: "Screenshot pass", state: "running" },
      { title: "Changelog draft", state: "running" },
      { title: "Link check", state: "idle" },
    ],
  },
  FAMILIES[3]!,
  {
    title: "Release 0.48",
    own: "runtime",
    ownLabel: "Parent is working",
    todayCollapsed: "waiting-for-input",
    children: [
      { title: "Sign macOS build", state: "needs-input" },
      { title: "Sign Windows build", state: "needs-input" },
      { title: "Notarize", state: "needs-input" },
      { title: "Upload Linux", state: "error" },
      { title: "Upload symbols", state: "error" },
      { title: "Smoke test macOS", state: "running" },
      { title: "Smoke test Windows", state: "running" },
    ],
  },
];

const SUMMARY_KINDS: Exclude<ChildState, "idle">[] = [
  "needs-input",
  "error",
  "running",
];

const KIND_HEADING: Record<Exclude<ChildState, "idle">, string> = {
  "needs-input": "Needs you",
  error: "Failed",
  running: "Running",
};

function KindIcon({ kind }: { kind: Exclude<ChildState, "idle"> }) {
  if (kind === "needs-input") {
    return <Icon name="CircleQuestion" className="size-3 text-attention" />;
  }
  if (kind === "error") {
    return <Icon name="CircleX" className="size-3 text-destructive" />;
  }
  return (
    <Icon
      name="Loading"
      className="size-3 animate-spin text-muted-foreground/50 motion-reduce:animate-none"
    />
  );
}

function countsByKind(family: Family) {
  return SUMMARY_KINDS.map((kind) => ({
    kind,
    children: family.children.filter((child) => child.state === kind),
  })).filter((group) => group.children.length > 0);
}

function CountedCapsule({ family }: { family: Family }) {
  const groups = countsByKind(family);
  if (groups.length === 0) return null;
  return (
    <span className="flex h-4 shrink-0 cursor-default items-center gap-1.5 rounded-full bg-sidebar-accent px-1">
      {groups.map(({ kind, children }) => (
        <span key={kind} className="flex items-center gap-0.5">
          <KindIcon kind={kind} />
          {children.length >= 2 ? (
            <span className="text-2xs leading-none text-muted-foreground tabular-nums">
              {children.length}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

function ChildrenCard({ family }: { family: Family }) {
  return (
    <div className="flex flex-col gap-2">
      {countsByKind(family).map(({ kind, children }) => (
        <div key={kind} className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <KindIcon kind={kind} />
            {KIND_HEADING[kind]} · {children.length}
          </span>
          {children.map((child) => (
            <button
              key={child.title}
              type="button"
              className="truncate rounded-sm px-1 py-0.5 text-left text-sm hover:bg-state-hover"
            >
              {child.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function V6Row({
  family,
  version,
  cardOpen,
}: {
  family: Family;
  version: "v5" | "v6";
  cardOpen: boolean;
}) {
  return (
    <div
      className={cn(
        SIDEBAR_ROW_BASE_CLASS,
        SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
        "h-8 pr-2",
      )}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
    >
      <Chevron parent="collapsed" />
      <span className="min-w-0 flex-1 truncate">{family.title}</span>
      <span className="mr-1">
        {version === "v5" ? (
          <ChildSummary family={family} style={ITERATION_STYLES[3]!} />
        ) : (
          <HoverCard
            openDelay={150}
            closeDelay={100}
            {...(cardOpen ? { open: true } : {})}
          >
            <HoverCardTrigger asChild>
              <span>
                <CountedCapsule family={family} />
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              side="right"
              align="start"
              sideOffset={36}
              className="w-56 p-2"
            >
              <ChildrenCard family={family} />
            </HoverCardContent>
          </HoverCard>
        )}
      </span>
      <OwnGlyph indicator={family.own} label={family.ownLabel} />
    </div>
  );
}

export const V6: Story<{ showCard: boolean }> = ({ showCard }) => (
  <div className="flex flex-col gap-6 p-6">
    <p className="max-w-3xl text-sm text-muted-foreground">
      All rows collapsed. Capsule: children by kind, most urgent first, with a
      count when two or more share a kind. Rightmost icon: the parent&apos;s
      own status. Hover a v6 capsule for the children card.
    </p>
    <div className="flex gap-6">
      {(["v5", "v6"] as const).map((version) => (
        <div key={version} className="flex w-64 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {version === "v5" ? "v5 · presence only" : "v6 · counts + card"}
          </span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {V6_FAMILIES.map((family) => (
              <V6Row
                key={family.title}
                family={family}
                version={version}
                cardOpen={
                  showCard &&
                  version === "v6" &&
                  family.title === "Release 0.48"
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);
V6.args = { showCard: false };

type LayoutVariant = "lead" | "split" | "peek";

const V7_FAMILIES: Family[] = [
  V6_FAMILIES[0]!,
  V6_FAMILIES[2]!,
  V6_FAMILIES[4]!,
];

function ChildCounts({ family }: { family: Family }) {
  const groups = countsByKind(family);
  if (groups.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {groups.map(({ kind, children }) => (
        <span key={kind} className="flex items-center gap-0.5">
          <KindIcon kind={kind} />
          {children.length >= 2 ? (
            <span className="text-2xs leading-none text-muted-foreground tabular-nums">
              {children.length}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

function ChildGlyph({ state }: { state: ChildState }) {
  if (state === "needs-input") {
    return (
      <Icon
        name="CircleQuestion"
        className={cn("text-attention", SIDEBAR_STATUS_ICON_CLASS)}
      />
    );
  }
  if (state === "error") return <ThreadStatusGlyph indicator="unread-error" />;
  if (state === "running") return <ThreadStatusGlyph indicator="runtime" />;
  return null;
}

const V7_ROW_CLASS = cn(
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  "h-8 pr-2",
);

function LeadLayout({ family, expanded }: { family: Family; expanded: boolean }) {
  return (
    <>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      >
        <Chevron parent={expanded ? "expanded" : "collapsed"} />
        <OwnGlyph indicator={family.own} label={family.ownLabel} />
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        {!expanded ? <ChildCounts family={family} /> : null}
      </div>
      {expanded
        ? family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <GlyphSlot>
                <ChildGlyph state={child.state} />
              </GlyphSlot>
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
            </div>
          ))
        : null}
    </>
  );
}

function SplitLayout({
  family,
  expanded,
}: {
  family: Family;
  expanded: boolean;
}) {
  return (
    <>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      >
        <Chevron parent={expanded ? "expanded" : "collapsed"} />
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        {!expanded && countsByKind(family).length > 0 ? (
          <span className="flex h-5 items-center gap-1.5 rounded-full bg-sidebar-accent pr-0.5 pl-1.5">
            <ChildCounts family={family} />
            <span className="h-3 w-px bg-border" />
            <OwnGlyph indicator={family.own} label={family.ownLabel} />
          </span>
        ) : (
          <span className="pr-0.5">
            <OwnGlyph indicator={family.own} label={family.ownLabel} />
          </span>
        )}
      </div>
      {expanded
        ? family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <span className="pr-0.5">
                <GlyphSlot>
                  <ChildGlyph state={child.state} />
                </GlyphSlot>
              </span>
            </div>
          ))
        : null}
    </>
  );
}

function PeekLayout({ family, expanded }: { family: Family; expanded: boolean }) {
  const childPadding = getSidebarThreadRowPaddingLeft(1);
  const guideLeft = getSidebarThreadRowPaddingLeft(0) + 10;
  return (
    <>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      >
        <Chevron parent={expanded ? "expanded" : "collapsed"} />
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        <OwnGlyph indicator={family.own} label={family.ownLabel} />
      </div>
      {!expanded && countsByKind(family).length > 0 ? (
        <div className="relative -mt-1 flex h-5 items-center pb-1" style={{ paddingLeft: childPadding }}>
          <span
            className="absolute top-0 bottom-1.5 w-px bg-border"
            style={{ left: guideLeft }}
          />
          <ChildCounts family={family} />
        </div>
      ) : null}
      {expanded
        ? family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: childPadding }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <GlyphSlot>
                <ChildGlyph state={child.state} />
              </GlyphSlot>
            </div>
          ))
        : null}
    </>
  );
}

const LAYOUTS: { variant: LayoutVariant; label: string; rule: string }[] = [
  {
    variant: "lead",
    label: "v7a · own status leads",
    rule: "Left of the title is this thread. Right is what's under it.",
  },
  {
    variant: "split",
    label: "v7b · one split pill",
    rule: "Children | parent in one pill, parent always at the far right.",
  },
  {
    variant: "peek",
    label: "v7c · children peek line",
    rule: "Children's summary sits where the children would be.",
  },
];

function LayoutRows({
  variant,
  family,
  expanded,
}: {
  variant: LayoutVariant;
  family: Family;
  expanded: boolean;
}) {
  if (variant === "lead") return <LeadLayout family={family} expanded={expanded} />;
  if (variant === "split") return <SplitLayout family={family} expanded={expanded} />;
  return <PeekLayout family={family} expanded={expanded} />;
}

export const V7Layouts: Story = () => (
  <div className="flex flex-col gap-6 p-6">
    {[false, true].map((expanded) => (
      <section key={String(expanded)} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {expanded ? "Expanded" : "Collapsed"}
        </h3>
        <div className="flex gap-6">
          {LAYOUTS.map(({ variant, label, rule }) => (
            <div key={variant} className="flex w-64 flex-col gap-1">
              <span className="text-xs text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{rule}</span>
              <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
                {V7_FAMILIES.map((family) => (
                  <LayoutRows
                    key={family.title}
                    variant={variant}
                    family={family}
                    expanded={expanded}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

function makeChildren(counts: Partial<Record<ChildState, number>>) {
  return CHILD_STATE_ORDER.flatMap((state) =>
    Array.from({ length: counts[state] ?? 0 }, (_, index) => ({
      title: `${CHILD_LABEL[state]} child ${index + 1}`,
      state,
    })),
  );
}

interface SampleFamily extends Family {
  note: string;
}

function sample(
  note: string,
  title: string,
  own: ThreadListIndicatorKind,
  counts: Partial<Record<ChildState, number>>,
): SampleFamily {
  return {
    note,
    title,
    own,
    ownLabel: `Parent: ${own}`,
    todayCollapsed: own,
    children: makeChildren(counts),
  };
}

const SAMPLE_FAMILIES: SampleFamily[] = [
  sample("1 child running, parent idle", "Fix login redirect", "none", { running: 1 }),
  sample("1 child needs you, parent idle", "Rename settings keys", "none", { "needs-input": 1 }),
  sample("2 children: 1 failed, 1 idle", "Migrate storage", "none", { error: 1, idle: 1 }),
  sample("3 mixed, parent working", "Launch week prep", "runtime", { "needs-input": 1, error: 1, running: 1 }),
  sample("4 all running, parent idle", "Docs refresh", "none", { running: 4 }),
  sample("7 mixed, parent working", "Release 0.48", "runtime", { "needs-input": 3, error: 2, running: 2 }),
  sample("12 children: 1 needs you, 11 idle", "Triage community issues", "unread-success", { "needs-input": 1, idle: 11 }),
  sample("20 children: 5 running, 15 idle", "Bulk plugin catalog refresh", "runtime", { running: 5, idle: 15 }),
  sample("Parent itself needs you, 2 running", "Pricing page copy", "waiting-for-input", { running: 2 }),
  sample("Parent itself failed, 1 child needs you", "Nightly packaging", "unread-error", { "needs-input": 1, idle: 2 }),
  sample("5 children all idle, parent finished", "Write release notes", "unread-success", { idle: 5 }),
  sample("Long title, 3 mixed", "Coordinate the launch week announcement and pricing", "runtime", { "needs-input": 2, error: 1, running: 1 }),
];

type V6Iteration = "v6" | "slots" | "joined" | "marked" | "columns";

const V6_ITERATIONS: { id: V6Iteration; label: string; change: string }[] = [
  { id: "v6", label: "v6", change: "Baseline: capsule hugs its contents." },
  {
    id: "slots",
    label: "v6.1 · fixed slots",
    change: "Each kind always sits in the same spot, so ? ✕ ⟳ line up down the list.",
  },
  {
    id: "joined",
    label: "v6.2 · slots + joined to parent",
    change: "Children | parent in one pill, so it reads as one family readout.",
  },
  {
    id: "marked",
    label: "v6.3 · slots + child-thread mark",
    change: "The child-threads icon opens the capsule: 'these are the children'.",
  },
  {
    id: "columns",
    label: "v6.4 · columns + divider",
    change: "No capsule. Children's kinds in fixed columns, a hairline, then the parent.",
  },
];

function SampleOwnGlyph({ family }: { family: Family }) {
  if (family.own === "waiting-for-input") {
    return (
      <span title={family.ownLabel}>
        <GlyphSlot>
          <Icon
            name="CircleQuestion"
            className={cn("text-attention", SIDEBAR_STATUS_ICON_CLASS)}
          />
        </GlyphSlot>
      </span>
    );
  }
  return <OwnGlyph indicator={family.own} label={family.ownLabel} />;
}

function SlottedCounts({ family }: { family: Family }) {
  const groups = new Map(
    countsByKind(family).map((group) => [group.kind, group.children.length]),
  );
  return (
    <span className="flex shrink-0 items-center">
      {SUMMARY_KINDS.map((kind) => {
        const count = groups.get(kind) ?? 0;
        return (
          <span key={kind} className="flex w-[22px] items-center gap-0.5">
            {count > 0 ? (
              <>
                <KindIcon kind={kind} />
                {count >= 2 ? (
                  <span className="text-2xs leading-none text-muted-foreground tabular-nums">
                    {count}
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function V6IterationRow({
  family,
  iteration,
}: {
  family: Family;
  iteration: V6Iteration;
}) {
  const hasBusyChildren = countsByKind(family).length > 0;
  const own = <SampleOwnGlyph family={family} />;
  let trailing: ReactNode;
  if (iteration === "v6") {
    trailing = (
      <>
        <span className="mr-1">
          <CountedCapsule family={family} />
        </span>
        {own}
      </>
    );
  } else if (iteration === "slots") {
    trailing = (
      <>
        <span
          className={cn(
            "mr-1 flex h-4 items-center rounded-full pl-1",
            hasBusyChildren && "bg-sidebar-accent",
          )}
        >
          {hasBusyChildren ? <SlottedCounts family={family} /> : <span className="w-[66px]" />}
        </span>
        {own}
      </>
    );
  } else if (iteration === "joined") {
    trailing = (
      <span
        className={cn(
          "flex h-5 items-center gap-1 rounded-full pr-0.5 pl-1",
          hasBusyChildren && "bg-sidebar-accent",
        )}
      >
        {hasBusyChildren ? (
          <>
            <SlottedCounts family={family} />
            <span className="h-3 w-px bg-border" />
          </>
        ) : (
          <span className="w-[71px]" />
        )}
        {own}
      </span>
    );
  } else if (iteration === "columns") {
    trailing = (
      <span className="flex items-center gap-1">
        <span className="flex w-[66px] justify-end">
          {hasBusyChildren ? <SlottedCounts family={family} /> : null}
        </span>
        <span
          className={cn("h-3.5 w-px", hasBusyChildren ? "bg-border" : "bg-transparent")}
        />
        {own}
      </span>
    );
  } else {
    trailing = (
      <>
        <span
          className={cn(
            "mr-1 flex h-4 items-center gap-1 rounded-full pl-1",
            hasBusyChildren && "bg-sidebar-accent",
          )}
        >
          {hasBusyChildren ? (
            <>
              <Icon name="ChildThread" className="size-3 text-muted-foreground/70" />
              <SlottedCounts family={family} />
            </>
          ) : (
            <span className="w-[82px]" />
          )}
        </span>
        {own}
      </>
    );
  }
  return (
    <div
      className={V7_ROW_CLASS}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      title={familyTooltip(family)}
    >
      <Chevron parent="collapsed" />
      <span className="min-w-0 flex-1 truncate">{family.title}</span>
      {trailing}
    </div>
  );
}

export const V6Iterations: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-5xl text-sm text-muted-foreground">
      Twelve representative collapsed parents (left column describes each). In
      every version the rightmost icon is the parent&apos;s own status; the
      capsule summarises its children by kind, with a count when two or more
      share a kind.
    </p>
    <div className="flex gap-4">
      <div className="flex w-56 flex-col gap-1">
        <span className="text-xs text-foreground">Case</span>
        <span className="h-8" />
        <div className="p-1">
          {SAMPLE_FAMILIES.map((family) => (
            <div
              key={family.title}
              className="flex h-8 items-center text-xs text-muted-foreground"
            >
              {family.note}
            </div>
          ))}
        </div>
      </div>
      {V6_ITERATIONS.map(({ id, label, change }) => (
        <div key={id} className="flex w-64 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-8 text-xs text-muted-foreground">{change}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {SAMPLE_FAMILIES.map((family) => (
              <V6IterationRow key={family.title} family={family} iteration={id} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const INTERACTIVE_FAMILIES: Family[] = [
  V6_FAMILIES[0]!,
  V6_FAMILIES[2]!,
  V6_FAMILIES[4]!,
  {
    title: "Pricing page copy",
    own: "waiting-for-input",
    ownLabel: "Parent needs you",
    todayCollapsed: "waiting-for-input",
    children: [
      { title: "Competitor price scan", state: "running" },
      { title: "Tier comparison table", state: "running" },
    ],
  },
  {
    title: "Nightly packaging",
    own: "unread-error",
    ownLabel: "Parent failed",
    todayCollapsed: "unread-error",
    children: [
      { title: "Notarize build", state: "needs-input" },
      { title: "Upload symbols", state: "idle" },
      { title: "Smoke test", state: "idle" },
    ],
  },
  {
    title: "Write release notes",
    own: "unread-success",
    ownLabel: "Parent finished, unread",
    todayCollapsed: "unread-success",
    children: [
      { title: "Collect merged PRs", state: "idle" },
      { title: "Draft highlights", state: "idle" },
    ],
  },
];

const PILL_SLOT_WIDTH: Record<Exclude<ChildState, "idle">, number> = {
  "needs-input": 20,
  error: 20,
  running: 12,
};

const PILL_CHILDREN_WIDTH = Object.values(PILL_SLOT_WIDTH).reduce(
  (total, width) => total + width,
  0,
);

function PillChildSlots({ family }: { family: Family }) {
  const counts = new Map(
    countsByKind(family).map((group) => [group.kind, group.children.length]),
  );
  return (
    <span className="flex shrink-0 items-center">
      {SUMMARY_KINDS.map((kind) => {
        const count = counts.get(kind) ?? 0;
        return (
          <span
            key={kind}
            className="flex items-center gap-0.5"
            style={{ width: PILL_SLOT_WIDTH[kind] }}
          >
            {count > 0 ? (
              <>
                <KindIcon kind={kind} />
                {count >= 2 && kind !== "running" ? (
                  <span className="text-2xs leading-none text-muted-foreground tabular-nums">
                    {count}
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function FamilyPill({
  family,
  expanded,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  onToggle: () => void;
}) {
  const showChildren = !expanded && countsByKind(family).length > 0;
  const label = expanded
    ? `${family.ownLabel}. Collapse child threads`
    : `${family.ownLabel}. ${familyTooltip(family) || "No busy child threads"}. Expand child threads`;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="flex h-5 shrink-0 cursor-pointer items-center rounded-full bg-sidebar-accent pr-0.5 pl-1 outline-none ring-sidebar-ring hover:bg-state-hover focus-visible:ring-2"
    >
      <span
        className="flex items-center overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: showChildren ? PILL_CHILDREN_WIDTH + 9 : 0,
          opacity: showChildren ? 1 : 0,
        }}
      >
        <PillChildSlots family={family} />
        <span className="mx-1 h-3 w-px shrink-0 bg-border" />
      </span>
      <SampleOwnGlyph family={family} />
    </button>
  );
}

function InteractiveFamily({
  family,
  expanded,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
        onClick={onToggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        <FamilyPill family={family} expanded={expanded} onToggle={onToggle} />
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <span className="pr-0.5">
                <GlyphSlot>
                  <ChildGlyph state={child.state} />
                </GlyphSlot>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const V6Interactive: Story<{ expandAll: boolean }> = ({
  expandAll,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Click a row or its pill. Collapsed, the pill shows the children by kind,
        a divider, then the parent&apos;s own status. Expanding folds the
        children out of the pill and into their own rows, whose icons line up
        with the parent&apos;s.
      </p>
      <div className="w-72 rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
        {INTERACTIVE_FAMILIES.map((family) => {
          const isExpanded = expanded[family.title] ?? expandAll;
          return (
            <InteractiveFamily
              key={family.title}
              family={family}
              expanded={isExpanded}
              onToggle={() =>
                setExpanded((current) => ({
                  ...current,
                  [family.title]: !isExpanded,
                }))
              }
            />
          );
        })}
      </div>
    </div>
  );
};
V6Interactive.args = { expandAll: false };

type PillDensity = "worst" | "dots" | "full";

const DOT_TONE: Record<Exclude<ChildState, "idle">, string> = {
  "needs-input": "bg-attention",
  error: "bg-destructive",
  running: "border border-muted-foreground/60",
};

function PillWorstSlot({ family }: { family: Family }) {
  const worst = countsByKind(family)[0];
  return (
    <span className="flex w-3 items-center justify-center">
      {worst ? <KindIcon kind={worst.kind} /> : null}
    </span>
  );
}

function PillDotSlots({ family }: { family: Family }) {
  const kinds = new Set(countsByKind(family).map((group) => group.kind));
  return (
    <span className="flex items-center gap-1">
      {SUMMARY_KINDS.map((kind) => (
        <span
          key={kind}
          className={cn(
            "size-1.5 rounded-full",
            kinds.has(kind) ? DOT_TONE[kind] : "bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

const DENSITY_WIDTH: Record<PillDensity, number> = {
  worst: 12,
  dots: 26,
  full: PILL_CHILDREN_WIDTH,
};

function DisclosurePill({
  family,
  expanded,
  density,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  density: PillDensity;
  onToggle: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasBusyChildren = countsByKind(family).length > 0;
  const showChildren = !expanded && hasBusyChildren;
  const level: PillDensity = revealed ? "full" : density;
  const label = expanded
    ? `${family.ownLabel}. Collapse child threads`
    : `${family.ownLabel}. ${familyTooltip(family) || "No busy child threads"}. Expand child threads`;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="flex h-5 shrink-0 cursor-pointer items-center rounded-full bg-sidebar-accent pr-0.5 pl-1 outline-none ring-sidebar-ring hover:bg-state-hover focus-visible:ring-2"
    >
      <span
        className="flex items-center justify-end overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: showChildren ? DENSITY_WIDTH[level] + 9 : 0,
          opacity: showChildren ? 1 : 0,
        }}
      >
        {level === "full" ? (
          <PillChildSlots family={family} />
        ) : level === "dots" ? (
          <PillDotSlots family={family} />
        ) : (
          <PillWorstSlot family={family} />
        )}
        <span className="mx-1 h-3 w-px shrink-0 bg-border" />
      </span>
      <SampleOwnGlyph family={family} />
    </button>
  );
}

function DisclosureFamily({
  family,
  expanded,
  density,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  density: PillDensity;
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
        onClick={onToggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        <DisclosurePill
          family={family}
          expanded={expanded}
          density={density}
          onToggle={onToggle}
        />
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <span className="pr-0.5">
                <GlyphSlot>
                  <ChildGlyph state={child.state} />
                </GlyphSlot>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DENSITY_OPTIONS: { density: PillDensity; label: string; rule: string }[] = [
  {
    density: "worst",
    label: "A · Most urgent only",
    rule: "Default: one icon for the most urgent child kind. Hover: every kind with counts. Click: expand.",
  },
  {
    density: "dots",
    label: "B · Dots",
    rule: "Default: a dot per kind present (amber, red, ring). Hover: icons with counts. Click: expand.",
  },
  {
    density: "full",
    label: "C · Full",
    rule: "Default: every kind with counts. Hover: same. Click: expand.",
  },
];

function DisclosureList({ density }: { density: PillDensity }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {INTERACTIVE_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? false;
        return (
          <DisclosureFamily
            key={family.title}
            family={family}
            density={density}
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const V6Disclosure: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      Progressive disclosure on the v6.2 pill. Every option: rightmost icon is
      the parent&apos;s own status; hover the pill to reveal all child kinds
      with counts; click the row or pill to expand the children into their own
      rows.
    </p>
    <div className="flex gap-6">
      {DENSITY_OPTIONS.map(({ density, label, rule }) => (
        <div key={density} className="flex w-72 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-12 text-xs text-muted-foreground">{rule}</span>
          <DisclosureList density={density} />
        </div>
      ))}
    </div>
  </div>
);

type ActionDefault = "dots" | "dots-ring" | "badge";

const ACTION_KINDS = ["needs-input", "error"] as const;

function ActionDots({
  family,
  withRunning,
}: {
  family: Family;
  withRunning: boolean;
}) {
  const kinds = new Set(countsByKind(family).map((group) => group.kind));
  const slots: Exclude<ChildState, "idle">[] = withRunning
    ? [...ACTION_KINDS, "running"]
    : [...ACTION_KINDS];
  return (
    <span className="flex items-center gap-1">
      {slots.map((kind) => (
        <span
          key={kind}
          className={cn(
            "size-1.5 rounded-full",
            kinds.has(kind) ? DOT_TONE[kind] : "bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

function ActionPill({
  family,
  expanded,
  mode,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  mode: ActionDefault;
  onToggle: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const groups = countsByKind(family);
  const hasBusyChildren = groups.length > 0;
  const worstAction = groups.find((group) =>
    (ACTION_KINDS as readonly string[]).includes(group.kind),
  );
  const open = revealed && !expanded && hasBusyChildren;
  const defaultWidth = mode === "badge" ? 0 : mode === "dots" ? 16 : 26;
  const label = expanded
    ? `${family.ownLabel}. Collapse child threads`
    : `${family.ownLabel}. ${familyTooltip(family) || "No busy child threads"}. Expand child threads`;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-5 shrink-0 cursor-pointer items-center rounded-full pr-0.5 pl-1 outline-none ring-sidebar-ring transition-colors duration-200 focus-visible:ring-2",
        open ? "bg-sidebar-accent" : "bg-transparent",
      )}
    >
      <span
        className="flex items-center justify-end overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: expanded
            ? 0
            : open
              ? PILL_CHILDREN_WIDTH + 9
              : defaultWidth + (defaultWidth > 0 ? 4 : 0),
        }}
      >
        {open ? (
          <>
            <PillChildSlots family={family} />
            <span className="mx-1 h-3 w-px shrink-0 bg-border" />
          </>
        ) : mode === "badge" ? null : (
          <span className="mr-1">
            <ActionDots family={family} withRunning={mode === "dots-ring"} />
          </span>
        )}
      </span>
      <span className="relative">
        <SampleOwnGlyph family={family} />
        {mode === "badge" && !open && !expanded && worstAction ? (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-sidebar",
              DOT_TONE[worstAction.kind],
            )}
          />
        ) : null}
      </span>
    </button>
  );
}

function ActionFamily({
  family,
  expanded,
  mode,
  onToggle,
}: {
  family: Family;
  expanded: boolean;
  mode: ActionDefault | "today";
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
        onClick={onToggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        {mode === "today" ? (
          <span className="pr-0.5">
            <GlyphSlot>
              <ThreadStatusGlyph
                indicator={expanded ? family.own : family.todayCollapsed}
              />
            </GlyphSlot>
          </span>
        ) : (
          <ActionPill
            family={family}
            expanded={expanded}
            mode={mode}
            onToggle={onToggle}
          />
        )}
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <span className="pr-0.5">
                <GlyphSlot>
                  {mode === "today" ? (
                    child.state === "needs-input" ? (
                      <ThreadStatusGlyph indicator="waiting-for-input" />
                    ) : child.state === "running" ? (
                      <ThreadStatusGlyph indicator="runtime" />
                    ) : null
                  ) : (
                    <ChildGlyph state={child.state} />
                  )}
                </GlyphSlot>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ACTION_OPTIONS: {
  mode: ActionDefault | "today";
  label: string;
  rule: string;
}[] = [
  {
    mode: "today",
    label: "Today",
    rule: "One glyph. Child errors are hidden; waiting children show a grey ?.",
  },
  {
    mode: "dots",
    label: "B1 · Action dots",
    rule: "Default: parent glyph, plus an amber or red dot only when a child needs you. Hover: full breakdown. Click: expand.",
  },
  {
    mode: "dots-ring",
    label: "B2 · Action dots + running ring",
    rule: "B1, plus a faint ring when children are running.",
  },
  {
    mode: "badge",
    label: "B3 · Badge on the parent glyph",
    rule: "Default: the most urgent child need as a corner dot on the parent's glyph. No extra width. Hover: full breakdown.",
  },
];

function ActionList({ mode }: { mode: ActionDefault | "today" }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {INTERACTIVE_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? false;
        return (
          <ActionFamily
            key={family.title}
            family={family}
            mode={mode}
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const V6ActionFirst: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-5xl text-sm text-muted-foreground">
      Action-first, minimal by default. Collapsed rows look close to today: the
      parent&apos;s glyph, plus a small signal only when a child needs you.
      Hover the right edge of a row for the full breakdown; click to expand.
    </p>
    <div className="flex gap-5">
      {ACTION_OPTIONS.map(({ mode, label, rule }) => (
        <div key={mode} className="flex w-64 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-16 text-xs text-muted-foreground">{rule}</span>
          <ActionList mode={mode} />
        </div>
      ))}
    </div>
  </div>
);

type RefinedState = "needs-input" | "error" | "unread" | "running" | "idle";
type RefinedOwn = RefinedState | "none";

interface RefinedFamily {
  title: string;
  own: RefinedOwn;
  children: { title: string; state: RefinedState }[];
}

const REFINED_PRIORITY: RefinedState[] = [
  "needs-input",
  "error",
  "unread",
  "running",
  "idle",
];

const REFINED_LABEL: Record<RefinedOwn, string> = {
  "needs-input": "needs you",
  error: "failed",
  unread: "finished, unread",
  running: "working",
  idle: "idle",
  none: "idle",
};

const REFINED_FAMILIES: RefinedFamily[] = [
  {
    title: "Launch week prep",
    own: "running",
    children: [
      { title: "Draft announcement", state: "needs-input" },
      { title: "Update pricing page", state: "error" },
      { title: "Record demo clip", state: "running" },
    ],
  },
  {
    title: "Docs refresh",
    own: "none",
    children: [
      { title: "Rewrite CLI guide", state: "running" },
      { title: "Screenshot pass", state: "running" },
      { title: "Link check", state: "idle" },
    ],
  },
  {
    title: "Changelog cleanup",
    own: "none",
    children: [
      { title: "Group fixes by area", state: "unread" },
      { title: "Trim duplicate entries", state: "idle" },
    ],
  },
  {
    title: "Triage community issues",
    own: "unread",
    children: [
      { title: "Label new bugs", state: "idle" },
      { title: "Dedupe sync reports", state: "needs-input" },
      { title: "Close stale questions", state: "unread" },
    ],
  },
  {
    title: "Pricing page copy",
    own: "needs-input",
    children: [
      { title: "Competitor price scan", state: "unread" },
      { title: "Tier comparison table", state: "running" },
    ],
  },
  {
    title: "Nightly packaging",
    own: "error",
    children: [
      { title: "Upload symbols", state: "idle" },
      { title: "Notarize build", state: "needs-input" },
      { title: "Smoke test", state: "idle" },
    ],
  },
  {
    title: "Write release notes",
    own: "unread",
    children: [
      { title: "Collect merged PRs", state: "idle" },
      { title: "Draft highlights", state: "idle" },
    ],
  },
];

function RefinedGlyph({ state }: { state: RefinedOwn }) {
  if (state === "needs-input") {
    return (
      <Icon
        name="CircleQuestion"
        className={cn("text-attention", SIDEBAR_STATUS_ICON_CLASS)}
      />
    );
  }
  if (state === "error") return <ThreadStatusGlyph indicator="unread-error" />;
  if (state === "unread") return <ThreadStatusGlyph indicator="unread-success" />;
  if (state === "running") return <ThreadStatusGlyph indicator="runtime" />;
  return null;
}

const REFINED_BADGE_TONE: Partial<Record<RefinedState, string>> = {
  "needs-input": "bg-attention",
  error: "bg-destructive",
  unread: "bg-muted-foreground/60",
};

function refinedChildSignal(family: RefinedFamily) {
  return REFINED_PRIORITY.find((state) =>
    family.children.some((child) => child.state === state),
  );
}

function refinedTooltip(family: RefinedFamily) {
  const parts = REFINED_PRIORITY.filter((state) => state !== "idle").flatMap(
    (state) => {
      const count = family.children.filter((child) => child.state === state)
        .length;
      return count > 0 ? [`${count} ${REFINED_LABEL[state]}`] : [];
    },
  );
  return `This thread ${REFINED_LABEL[family.own]}. Child threads: ${parts.join(", ") || "all idle"}.`;
}

function RefinedFamilyGlyph({ family }: { family: RefinedFamily }) {
  const signal = refinedChildSignal(family);
  const badgeTone = signal ? REFINED_BADGE_TONE[signal] : undefined;
  const childrenRunning = family.children.some(
    (child) => child.state === "running",
  );
  let center: ReactNode = <RefinedGlyph state={family.own} />;
  if (family.own === "none") {
    if (!badgeTone && !childrenRunning) return null;
    center = (
      <Icon
        name="ChildThread"
        className={cn(
          SIDEBAR_STATUS_ICON_CLASS,
          childrenRunning
            ? ["animate-shine-icon", SIDEBAR_WORKING_STATUS_COLOR_CLASS]
            : "text-muted-foreground/60",
        )}
      />
    );
  }
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      {center}
      {badgeTone ? (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-sidebar",
            badgeTone,
          )}
        />
      ) : null}
    </span>
  );
}

const REFINED_SUMMARY: RefinedState[] = ["needs-input", "error", "unread", "running"];

function RefinedBreakdown({ family }: { family: RefinedFamily }) {
  return (
    <span className="flex items-center gap-1.5">
      {REFINED_SUMMARY.map((state) => {
        const count = family.children.filter((child) => child.state === state)
          .length;
        if (count === 0) return null;
        return (
          <span key={state} className="flex items-center gap-0.5">
            <GlyphSlot>
              <RefinedGlyph state={state} />
            </GlyphSlot>
            {count >= 2 ? (
              <span className="text-2xs leading-none text-subtle-foreground tabular-nums -ml-px">
                {count}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function RefinedFamilyRows({
  family,
  expanded,
  order,
  onToggle,
}: {
  family: RefinedFamily;
  expanded: boolean;
  order: "kept" | "action-first";
  onToggle: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const open = revealed && !expanded && refinedChildSignal(family) !== "idle";
  const children =
    order === "kept"
      ? family.children
      : [...family.children].sort(
          (a, b) =>
            REFINED_PRIORITY.indexOf(a.state) - REFINED_PRIORITY.indexOf(b.state),
        );
  return (
    <div className="relative">
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
        onClick={onToggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onMouseEnter={() => setRevealed(true)}
          onMouseLeave={() => setRevealed(false)}
          onFocus={() => setRevealed(true)}
          onBlur={() => setRevealed(false)}
          aria-expanded={expanded}
          aria-label={refinedTooltip(family)}
          title={refinedTooltip(family)}
          className={cn(
            "flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-full pr-0.5 pl-1 outline-none ring-sidebar-ring transition-colors duration-200 focus-visible:ring-2",
            open ? "bg-sidebar-accent" : "bg-transparent",
          )}
        >
          {open ? (
            <>
              <RefinedBreakdown family={family} />
              <span className="h-3 w-px shrink-0 bg-border" />
            </>
          ) : null}
          <GlyphSlot>
            <RefinedFamilyGlyph family={family} />
          </GlyphSlot>
        </button>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="relative overflow-hidden">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-2 w-px bg-border"
            style={{ left: getSidebarThreadRowPaddingLeft(0) + 10 }}
          />
          {children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="size-5 shrink-0" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  child.state === "idle" && "text-muted-foreground",
                )}
              >
                {child.title}
              </span>
              <span className="pr-0.5">
                <GlyphSlot>
                  <RefinedGlyph state={child.state} />
                </GlyphSlot>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RefinedList({
  order,
  expandAll,
}: {
  order: "kept" | "action-first";
  expandAll: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {REFINED_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? expandAll;
        return (
          <RefinedFamilyRows
            key={family.title}
            family={family}
            order={order}
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const B3Refined: Story<{ expandAll: boolean }> = ({ expandAll }) => (
  <div className="flex flex-col gap-4 p-6">
    <div className="flex max-w-4xl flex-col gap-1 text-sm text-muted-foreground">
      <span>
        The glyph is the parent&apos;s own state; the corner dot is its
        children&apos;s most urgent signal (amber needs you, red failed, grey
        finished unread). An idle parent with busy children shows the
        child-threads icon as the dot&apos;s host, shimmering while children
        run. The glyph never changes on hover or expand.
      </span>
      <span>
        Hover the glyph: the breakdown appears beside it, using the same
        glyphs as the rows. Click the row to expand: children appear under a
        guide line, each with its own state. Idle children are dimmed.
      </span>
    </div>
    <div className="flex gap-6">
      {(
        [
          ["kept", "Expanded order: as created"],
          ["action-first", "Expanded order: needs you first"],
        ] as const
      ).map(([order, label]) => (
        <div key={order} className="flex w-72 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <RefinedList order={order} expandAll={expandAll} />
        </div>
      ))}
    </div>
  </div>
);
B3Refined.args = { expandAll: false };

const FLOW_PREVIEW_LIMIT = 6;
const FLIGHT_MS = 320;

interface Flight {
  title: string;
  state: RefinedState;
  from: { x: number; y: number };
  to: { x: number; y: number } | null;
}

function relativeOrigin(element: Element, origin: Element) {
  const rect = element.getBoundingClientRect();
  const base = origin.getBoundingClientRect();
  return { x: rect.left - base.left, y: rect.top - base.top };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type PreviewMode = "single" | "runs" | "kinds";

interface PreviewGroup {
  key: string;
  state: RefinedState;
  titles: string[];
}

const PREVIEW_GROUP_LIMIT = 5;

function previewGroups(family: RefinedFamily, mode: PreviewMode) {
  const busy = family.children.filter((child) => child.state !== "idle");
  if (mode === "single") {
    return busy.map((child) => ({
      key: child.title,
      state: child.state,
      titles: [child.title],
    }));
  }
  if (mode === "kinds") {
    const groups: PreviewGroup[] = [];
    for (const child of busy) {
      const existing = groups.find((group) => group.state === child.state);
      if (existing) existing.titles.push(child.title);
      else groups.push({ key: child.state, state: child.state, titles: [child.title] });
    }
    return groups;
  }
  const runs: PreviewGroup[] = [];
  for (const child of busy) {
    const last = runs[runs.length - 1];
    if (last && last.state === child.state) last.titles.push(child.title);
    else runs.push({ key: child.title, state: child.state, titles: [child.title] });
  }
  return runs;
}

function FlowFamily({
  family,
  expanded,
  onToggle,
  mode = "single",
  glyph,
}: {
  family: RefinedFamily;
  expanded: boolean;
  onToggle: () => void;
  mode?: PreviewMode;
  glyph?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [launched, setLaunched] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const previewRefs = useRef(new Map<string, HTMLSpanElement>());
  const childGlyphRefs = useRef(new Map<string, HTMLSpanElement>());
  const busy = family.children.filter((child) => child.state !== "idle");
  const groups = previewGroups(family, mode);
  const limit = mode === "single" ? FLOW_PREVIEW_LIMIT : PREVIEW_GROUP_LIMIT;
  const preview =
    groups.length > limit ? groups.slice(0, limit - 1) : groups;
  const overflow = groups
    .slice(preview.length)
    .reduce((total, group) => total + group.titles.length, 0);
  const groupOf = new Map(
    preview.flatMap((group) => group.titles.map((title) => [title, group.key])),
  );
  const open = revealed && !expanded && busy.length > 0;

  const toggle = () => {
    const wrapper = wrapperRef.current;
    const glyph = glyphRef.current;
    if (!expanded && wrapper && glyph && !prefersReducedMotion()) {
      const glyphOrigin = relativeOrigin(glyph, wrapper);
      setFlights(
        busy.map((child) => {
          const groupKey = groupOf.get(child.title);
          const previewIcon =
            open && groupKey ? previewRefs.current.get(groupKey) : undefined;
          return {
            title: child.title,
            state: child.state,
            from: previewIcon
              ? relativeOrigin(previewIcon, wrapper)
              : glyphOrigin,
            to: null,
          };
        }),
      );
      setLaunched(false);
    }
    onToggle();
  };

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!expanded || !flights || flights.some((flight) => flight.to) || !wrapper) {
      return;
    }
    setFlights(
      flights.map((flight) => {
        const target = childGlyphRefs.current.get(flight.title);
        return {
          ...flight,
          to: target ? relativeOrigin(target, wrapper) : flight.from,
        };
      }),
    );
  }, [expanded, flights]);

  const flightsReady = flights?.every((flight) => flight.to) ?? false;

  useLayoutEffect(() => {
    if (!flightsReady) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setLaunched(true)),
    );
    const done = window.setTimeout(() => setFlights(null), FLIGHT_MS + 80);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [flightsReady]);

  const inFlight = flights !== null;

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
        onClick={toggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{family.title}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          onMouseEnter={() => setRevealed(true)}
          onMouseLeave={() => setRevealed(false)}
          onFocus={() => setRevealed(true)}
          onBlur={() => setRevealed(false)}
          aria-expanded={expanded}
          aria-label={refinedTooltip(family)}
          title={refinedTooltip(family)}
          className={cn(
            "flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-full pr-0.5 pl-1 outline-none ring-sidebar-ring transition-colors duration-200 focus-visible:ring-2",
            open ? "bg-sidebar-accent" : "bg-transparent",
          )}
        >
          {open ? (
            <>
              <span className="flex items-center gap-0.5">
                {preview.map((group) => (
                  <span key={group.key} className="flex items-center gap-0.5">
                    <span
                      ref={(element) => {
                        if (element) previewRefs.current.set(group.key, element);
                        else previewRefs.current.delete(group.key);
                      }}
                    >
                      <GlyphSlot>
                        <RefinedGlyph state={group.state} />
                      </GlyphSlot>
                    </span>
                    {group.titles.length >= 2 ? (
                      <span className="text-2xs leading-none text-subtle-foreground tabular-nums -ml-px">
                        {group.titles.length}
                      </span>
                    ) : null}
                  </span>
                ))}
                {overflow > 0 ? (
                  <span className="text-2xs leading-none text-subtle-foreground tabular-nums -ml-px">
                    +{overflow}
                  </span>
                ) : null}
              </span>
              <span className="h-3 w-px shrink-0 bg-border" />
            </>
          ) : null}
          <span ref={glyphRef}>
            <GlyphSlot>{glyph ?? <RefinedFamilyGlyph family={family} />}</GlyphSlot>
          </span>
        </button>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="relative overflow-hidden">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-2 w-px bg-border"
            style={{ left: getSidebarThreadRowPaddingLeft(0) + 10 }}
          />
          {family.children.map((child) => (
            <div
              key={child.title}
              className={V7_ROW_CLASS}
              style={{ paddingLeft: getSidebarThreadRowPaddingLeft(1) }}
            >
              <span className="size-5 shrink-0" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  child.state === "idle" && "text-muted-foreground",
                )}
              >
                {child.title}
              </span>
              <span
                className="pr-0.5"
                ref={(element) => {
                  if (element) childGlyphRefs.current.set(child.title, element);
                  else childGlyphRefs.current.delete(child.title);
                }}
                style={{ opacity: inFlight ? 0 : 1 }}
              >
                <GlyphSlot>
                  <RefinedGlyph state={child.state} />
                </GlyphSlot>
              </span>
            </div>
          ))}
        </div>
      </div>
      {flights?.map((flight) => {
        const target = flight.to ?? flight.from;
        const at = launched ? target : flight.from;
        return (
          <span
            key={flight.title}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 z-10"
            style={{
              transform: `translate(${at.x}px, ${at.y}px)`,
              transition: launched
                ? `transform ${FLIGHT_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                : "none",
            }}
          >
            <GlyphSlot>
              <RefinedGlyph state={flight.state} />
            </GlyphSlot>
          </span>
        );
      })}
    </div>
  );
}

export const B3Flow: Story = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex max-w-2xl flex-col gap-1 text-sm text-muted-foreground">
        <span>
          Hover a glyph: one icon per busy child, left to right in sidebar
          order (top to bottom). Click: each icon flies down into its
          child&apos;s row. Collapsed, the glyph is the parent&apos;s state and
          the corner dot its children&apos;s most urgent signal.
        </span>
      </div>
      <div className="w-72 rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
        {REFINED_FAMILIES.map((family) => {
          const isExpanded = expanded[family.title] ?? false;
          return (
            <FlowFamily
              key={family.title}
              family={family}
              expanded={isExpanded}
              onToggle={() =>
                setExpanded((current) => ({
                  ...current,
                  [family.title]: !isExpanded,
                }))
              }
            />
          );
        })}
      </div>
    </div>
  );
};

function children(
  prefix: string,
  states: RefinedState[],
): { title: string; state: RefinedState }[] {
  return states.map((state, index) => ({
    title: `${prefix} ${index + 1}`,
    state,
  }));
}

const MANY_FAMILIES: RefinedFamily[] = [
  REFINED_FAMILIES[0]!,
  {
    title: "Release 0.48",
    own: "running",
    children: children("Release step", [
      "needs-input",
      "needs-input",
      "error",
      "needs-input",
      "running",
      "running",
      "error",
    ]),
  },
  {
    title: "Review plugin PRs",
    own: "none",
    children: children("Review PR", Array.from({ length: 12 }, () => "running")),
  },
  {
    title: "Bulk plugin catalog refresh",
    own: "running",
    children: children("Catalog entry", [
      "running",
      "idle",
      "needs-input",
      "running",
      "idle",
      "idle",
      "error",
      "running",
      "unread",
      "idle",
      "needs-input",
      "running",
      "idle",
      "unread",
      "idle",
      "running",
      "idle",
      "idle",
      "error",
      "idle",
    ]),
  },
  REFINED_FAMILIES[3]!,
];

const PREVIEW_MODES: { mode: PreviewMode; label: string; rule: string }[] = [
  {
    mode: "runs",
    label: "Runs in sidebar order",
    rule: "Neighbouring children with the same state merge into one icon with a count. Left to right always matches top to bottom. Up to 5 groups, then +N.",
  },
  {
    mode: "kinds",
    label: "Kinds by first appearance",
    rule: "One icon per state with a count, ordered by where that state first appears. At most four icons; a group's icons fan out to several rows on click.",
  },
];

function ManyList({ mode }: { mode: PreviewMode }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {MANY_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? false;
        return (
          <FlowFamily
            key={family.title}
            family={family}
            mode={mode}
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const B3ManyChildren: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-3xl text-sm text-muted-foreground">
      Families with 3, 7, 12 and 20 children. Hover a glyph for the preview;
      click to watch each icon fly to its child&apos;s row.
    </p>
    <div className="flex gap-6">
      {PREVIEW_MODES.map(({ mode, label, rule }) => (
        <div key={mode} className="flex w-80 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-16 text-xs text-muted-foreground">{rule}</span>
          <ManyList mode={mode} />
        </div>
      ))}
    </div>
  </div>
);

type UnreadOption = "current" | "title" | "leading";

const UNREAD_FAMILIES: RefinedFamily[] = [
  REFINED_FAMILIES[3]!,
  REFINED_FAMILIES[6]!,
  {
    title: "Audit plugin permissions",
    own: "unread",
    children: [
      { title: "Scan manifests", state: "running" },
      { title: "Diff against policy", state: "idle" },
    ],
  },
  {
    title: "Sync design tokens",
    own: "unread",
    children: [
      { title: "Export Figma variables", state: "error" },
      { title: "Map to theme.css", state: "idle" },
    ],
  },
  REFINED_FAMILIES[2]!,
  REFINED_FAMILIES[0]!,
];

const UNREAD_OPTIONS: { option: UnreadOption; label: string; rule: string }[] = [
  {
    option: "current",
    label: "Current",
    rule: "Parent unread is the small grey dot in the glyph slot, so a child badge lands on a dot.",
  },
  {
    option: "title",
    label: "A · Unread as a brighter title",
    rule: "Parent unread brightens and weights the title. The glyph slot hosts the child-threads icon and its badge.",
  },
  {
    option: "leading",
    label: "B · Unread dot before the title",
    rule: "Parent unread moves to a dot before the title, like Mail. The glyph slot hosts the child-threads icon and its badge.",
  },
];

function UnreadRow({
  family,
  option,
}: {
  family: RefinedFamily;
  option: UnreadOption;
}) {
  const parentUnread = family.own === "unread";
  const glyphFamily: RefinedFamily =
    option !== "current" && parentUnread ? { ...family, own: "none" } : family;
  return (
    <div
      className={V7_ROW_CLASS}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      title={refinedTooltip(family)}
    >
      <Chevron parent="collapsed" />
      {option === "leading" ? (
        <span className="flex w-2 shrink-0 items-center justify-center">
          {parentUnread ? (
            <span className="size-1.5 rounded-full bg-muted-foreground" />
          ) : null}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          option === "title" &&
            (parentUnread ? "font-medium text-foreground" : "text-muted-foreground"),
        )}
      >
        {family.title}
      </span>
      <span className="pr-0.5">
        <GlyphSlot>
          <RefinedFamilyGlyph family={glyphFamily} />
        </GlyphSlot>
      </span>
    </div>
  );
}

export const UnreadParent: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      The first four parents are unread themselves. Rows: unread parent with a
      child that needs you, unread parent with idle children, unread parent with
      a running child, unread parent with a failed child, then two read
      parents for comparison.
    </p>
    <div className="flex gap-6">
      {UNREAD_OPTIONS.map(({ option, label, rule }) => (
        <div key={option} className="flex w-72 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-12 text-xs text-muted-foreground">{rule}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {UNREAD_FAMILIES.map((family) => (
              <UnreadRow key={family.title} family={family} option={option} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

type SlotOption = "current" | "priority" | "bigger";

function slotOwnerIsChildren(family: RefinedFamily) {
  if (family.own !== "unread") return false;
  return family.children.some(
    (child) =>
      child.state === "needs-input" ||
      child.state === "error" ||
      child.state === "running",
  );
}

function SlotGlyph({
  family,
  option,
}: {
  family: RefinedFamily;
  option: SlotOption;
}) {
  if (option === "priority" && slotOwnerIsChildren(family)) {
    return <RefinedFamilyGlyph family={{ ...family, own: "none" }} />;
  }
  if (option === "priority" && family.own === "unread") {
    return <RefinedGlyph state="unread" />;
  }
  if (option === "bigger" && family.own === "unread") {
    const signal = refinedChildSignal(family);
    const badgeTone = signal ? REFINED_BADGE_TONE[signal] : undefined;
    return (
      <span className="relative inline-flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-muted-foreground/70" />
        {badgeTone ? (
          <span
            className={cn(
              "absolute top-0 right-0 size-1.5 rounded-full ring-2 ring-sidebar",
              badgeTone,
            )}
          />
        ) : null}
      </span>
    );
  }
  return <RefinedFamilyGlyph family={family} />;
}

const SLOT_OPTIONS: { option: SlotOption; label: string; rule: string }[] = [
  {
    option: "current",
    label: "Current",
    rule: "The badge sits on bb's 5px unread dot. A running child under an unread parent is invisible.",
  },
  {
    option: "priority",
    label: "P · Urgent child takes the slot",
    rule: "Today's sidebar order: needs you, failed and running outrank 'finished, unread'. The parent's dot returns once the child is handled.",
  },
  {
    option: "bigger",
    label: "S · Bigger parent unread dot",
    rule: "Parent rows draw the unread dot at 8px so the badge has something to sit on. Same dot, same place.",
  },
];

function SlotList({
  option,
  expandAll,
}: {
  option: SlotOption;
  expandAll: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {UNREAD_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? expandAll;
        return (
          <FlowFamily
            key={family.title}
            family={family}
            mode="kinds"
            glyph={<SlotGlyph family={family} option={option} />}
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const UnreadSlot: Story<{ expandAll: boolean }> = ({ expandAll }) => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      One status slot per row; the unread indicator stays the dot. First four
      parents are unread: with a child that needs you, with idle children,
      with a running child, with a failed child. Then two read parents. Hover
      a glyph for the breakdown; click a row to expand it.
    </p>
    <div className="flex gap-6">
      {SLOT_OPTIONS.map(({ option, label, rule }) => (
        <div key={option} className="flex w-72 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-12 text-xs text-muted-foreground">{rule}</span>
          <SlotList option={option} expandAll={expandAll} />
        </div>
      ))}
    </div>
  </div>
);
UnreadSlot.args = { expandAll: false };

const OWNER_RANK: Partial<Record<RefinedOwn, number>> = {
  "needs-input": 0,
  error: 1,
  running: 2,
  unread: 3,
};

function slotOwner(family: RefinedFamily): "parent" | "children" | "none" {
  const parentRank = OWNER_RANK[family.own];
  const childRank = Math.min(
    ...family.children.map((child) => OWNER_RANK[child.state] ?? Infinity),
  );
  if (parentRank === undefined && childRank === Infinity) return "none";
  if (parentRank !== undefined && parentRank <= childRank) return "parent";
  return "children";
}

function OwnerGlyph({ family }: { family: RefinedFamily }) {
  const owner = slotOwner(family);
  if (owner === "parent") return <RefinedGlyph state={family.own} />;
  if (owner === "children") {
    return <RefinedFamilyGlyph family={{ ...family, own: "none" }} />;
  }
  return null;
}

const OWNER_FAMILIES: RefinedFamily[] = [
  REFINED_FAMILIES[0]!,
  REFINED_FAMILIES[4]!,
  REFINED_FAMILIES[5]!,
  REFINED_FAMILIES[1]!,
  ...UNREAD_FAMILIES.slice(0, 5),
];

function OwnerList({
  strict,
  expandAll,
}: {
  strict: boolean;
  expandAll: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {OWNER_FAMILIES.map((family) => {
        const isExpanded = expanded[family.title] ?? expandAll;
        return (
          <FlowFamily
            key={family.title}
            family={family}
            mode="kinds"
            glyph={
              strict ? (
                <OwnerGlyph family={family} />
              ) : (
                <SlotGlyph family={family} option="priority" />
              )
            }
            expanded={isExpanded}
            onToggle={() =>
              setExpanded((current) => ({
                ...current,
                [family.title]: !isExpanded,
              }))
            }
          />
        );
      })}
    </div>
  );
}

export const OneOwner: Story<{ expandAll: boolean }> = ({ expandAll }) => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-4xl text-sm text-muted-foreground">
      One slot. The parent&apos;s normal glyph means the parent&apos;s own state;
      the child-threads icon means the state is about its children. Order:
      needs you, failed, running, unread; the parent wins ties. Hover for the
      breakdown, click to expand.
    </p>
    <div className="flex gap-6">
      {(
        [
          [false, "P · Badges on the parent's glyph", "Parent glyph keeps a corner badge for children; child-threads icon only when the parent is idle or merely unread."],
          [true, "One owner", "The slot shows either the parent's glyph (no badge) or the child-threads icon (with badge or shimmer), whichever is more urgent."],
        ] as const
      ).map(([strict, label, rule]) => (
        <div key={label} className="flex w-72 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="h-12 text-xs text-muted-foreground">{rule}</span>
          <OwnerList strict={strict} expandAll={expandAll} />
        </div>
      ))}
    </div>
  </div>
);
OneOwner.args = { expandAll: false };

interface TreeNode {
  title: string;
  own: RefinedOwn;
  children?: TreeNode[];
}

function flattenDescendants(node: TreeNode): { title: string; state: RefinedState }[] {
  return (node.children ?? []).flatMap((child) => [
    { title: child.title, state: child.own === "none" ? ("idle" as const) : child.own },
    ...flattenDescendants(child),
  ]);
}

function kindsByFirstAppearance(items: { state: RefinedState }[]) {
  const groups: { state: RefinedState; count: number }[] = [];
  for (const item of items) {
    if (item.state === "idle") continue;
    const existing = groups.find((group) => group.state === item.state);
    if (existing) existing.count += 1;
    else groups.push({ state: item.state, count: 1 });
  }
  return groups;
}

function TreeRow({
  node,
  depth,
  path,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  path: string;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = hasChildren && (expanded[path] ?? false);
  const flat = flattenDescendants(node);
  const family: RefinedFamily = { title: node.title, own: node.own, children: flat };
  const kinds = kindsByFirstAppearance(flat);
  const open = revealed && hasChildren && kinds.length > 0;
  const glyph = hasChildren ? (
    <SlotGlyph family={family} option="priority" />
  ) : (
    <RefinedGlyph state={node.own} />
  );
  return (
    <div>
      <div
        className={V7_ROW_CLASS}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth) }}
        onClick={hasChildren ? () => onToggle(path) : undefined}
        title={hasChildren ? refinedTooltip(family) : `This thread ${REFINED_LABEL[node.own]}`}
      >
        {hasChildren ? (
          <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
            <Icon
              name="ChevronRight"
              className={cn("size-3 transition-transform duration-200", isExpanded && "rotate-90")}
            />
          </span>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !hasChildren && node.own === "none" && "text-muted-foreground",
          )}
        >
          {node.title}
        </span>
        <span
          className={cn(
            "flex h-5 shrink-0 items-center gap-1 rounded-full pr-0.5 pl-1 transition-colors duration-200",
            open ? "bg-sidebar-accent" : "bg-transparent",
          )}
          onMouseEnter={() => setRevealed(true)}
          onMouseLeave={() => setRevealed(false)}
        >
          {open ? (
            <>
              <span className="flex items-center gap-2 pr-1">
                {kinds.map((group) => (
                  <span key={group.state} className="relative flex items-center">
                    <GlyphSlot>
                      <RefinedGlyph state={group.state} />
                    </GlyphSlot>
                    {group.count >= 2 ? (
                      <span className="absolute -top-1.5 left-[13px] text-2xs leading-none text-subtle-foreground tabular-nums">
                        {group.count}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
              <span className="h-3 w-px shrink-0 bg-border" />
            </>
          ) : null}
          <GlyphSlot>{glyph}</GlyphSlot>
        </span>
      </div>
      {isExpanded ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-2 w-px bg-border"
            style={{ left: getSidebarThreadRowPaddingLeft(depth) + 10 }}
          />
          {node.children!.map((child, index) => (
            <TreeRow
              key={`${child.title}-${index}`}
              node={child}
              depth={depth + 1}
              path={`${path}/${index}`}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function leaf(title: string, own: RefinedOwn = "none"): TreeNode {
  return { title, own };
}

function spread(
  prefix: string,
  counts: Partial<Record<RefinedOwn, number>>,
  total: number,
): TreeNode[] {
  const busy = (Object.entries(counts) as [RefinedOwn, number][]).flatMap(
    ([state, count]) => Array.from({ length: count }, () => state),
  );
  const order = busy.map((_, index) => busy[(index * 7) % busy.length]!);
  const states: RefinedOwn[] = Array.from({ length: total }, () => "none");
  order.forEach((state, index) => {
    states[Math.floor((index * total) / order.length)] = state;
  });
  return states.map((state, index) => leaf(`${prefix} ${index + 1}`, state));
}

const OWN_ROWS: [RefinedOwn, string][] = [
  ["none", "Idle"],
  ["running", "Working"],
  ["needs-input", "Needs you"],
  ["error", "Failed"],
  ["unread", "Unread"],
];

const CHILD_COLUMNS: [RefinedOwn, string][] = [
  ["none", "children idle"],
  ["needs-input", "child needs you"],
  ["error", "child failed"],
  ["unread", "child unread"],
  ["running", "child running"],
];

const MATRIX: TreeNode[] = OWN_ROWS.flatMap(([own, ownLabel]) =>
  CHILD_COLUMNS.map(([childState, childLabel]) => ({
    title: `${ownLabel} · ${childLabel}`,
    own,
    children: [leaf("Child A", childState), leaf("Child B")],
  })),
);

const REALISTIC: TreeNode[] = [
  {
    title: "Ship v0.48 release",
    own: "running",
    children: [
      {
        title: "Build pipeline",
        own: "none",
        children: [
          leaf("Sign macOS build", "needs-input"),
          leaf("Sign Windows build", "running"),
          leaf("Notarize", "error"),
        ],
      },
      { title: "Release notes", own: "unread", children: [leaf("Collect merged PRs"), leaf("Draft highlights")] },
      { title: "QA sweep", own: "running", children: spread("QA case", { running: 4, "needs-input": 1, unread: 2, error: 1 }, 12) },
    ],
  },
  {
    title: "Growth",
    own: "none",
    children: [
      {
        title: "Acquisition",
        own: "unread",
        children: [
          {
            title: "Google Ads",
            own: "none",
            children: [leaf("Keyword research", "needs-input"), leaf("Ad copy variants", "running")],
          },
          leaf("Comparison pages", "unread"),
        ],
      },
      { title: "Onboarding", own: "running", children: [leaf("First-run tips"), leaf("Empty states")] },
    ],
  },
  {
    title: "Bulk plugin catalog refresh",
    own: "running",
    children: spread("Catalog entry", { "needs-input": 3, error: 2, running: 10, unread: 5 }, 50),
  },
  {
    title: "Deep chain",
    own: "none",
    children: [
      {
        title: "Level 1",
        own: "none",
        children: [
          {
            title: "Level 2",
            own: "running",
            children: [{ title: "Level 3", own: "none", children: [leaf("Level 4 leaf", "error")] }],
          },
        ],
      },
    ],
  },
  {
    title: "Coordinate the launch week announcement, pricing page and demo video",
    own: "needs-input",
    children: [leaf("Pricing page", "running"), leaf("Demo video", "unread")],
  },
  { title: "Single child", own: "none", children: [leaf("Only child", "running")] },
  { title: "All quiet", own: "none", children: [leaf("Done A"), leaf("Done B"), leaf("Done C")] },
  { title: "Plain thread, no children", own: "unread" },
  { title: "Plain thread, working", own: "running" },
];

function TreeList({ nodes, expandAll, prefix }: { nodes: TreeNode[]; expandAll: boolean; prefix: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const resolved = (path: string) => expanded[path] ?? expandAll;
  const proxy = new Proxy(expanded, {
    get: (_, key: string) => resolved(key),
  });
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
      {nodes.map((node, index) => (
        <TreeRow
          key={`${node.title}-${index}`}
          node={node}
          depth={0}
          path={`${prefix}/${index}`}
          expanded={proxy}
          onToggle={(path) =>
            setExpanded((current) => ({ ...current, [path]: !resolved(path) }))
          }
        />
      ))}
    </div>
  );
}

export const StressTest: Story<{ expandAll: boolean }> = ({ expandAll }) => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-5xl text-sm text-muted-foreground">
      Option P. Glyph = the parent&apos;s own state; corner badge = its
      descendants&apos; most urgent signal (amber needs you, red failed, grey
      unread); the child-threads icon hosts the badge when the parent is idle
      or merely unread, shimmering when descendants run. Signals roll up from
      any depth. Hover a glyph for the breakdown of all descendants; click a
      row to expand.
    </p>
    <div className="flex gap-6">
      <div className="flex w-80 flex-col gap-1">
        <span className="text-xs text-foreground">Every parent × child combination</span>
        <TreeList nodes={MATRIX} expandAll={expandAll} prefix="matrix" />
      </div>
      <div className="flex w-80 flex-col gap-1">
        <span className="text-xs text-foreground">Realistic nested sidebar</span>
        <TreeList nodes={REALISTIC} expandAll={expandAll} prefix="real" />
      </div>
    </div>
  </div>
);
StressTest.args = { expandAll: false };

type CountStyle = "superscript" | "inline-faint" | "actionable-only" | "none";

const COUNT_STYLES: { style: CountStyle; label: string }[] = [
  { style: "superscript", label: "Superscript (current)" },
  { style: "inline-faint", label: "Inline, faint" },
  { style: "actionable-only", label: "Counts only on needs you / failed" },
  { style: "none", label: "No counts (tooltip has them)" },
];

function CountSampleRow({ node, style }: { node: TreeNode; style: CountStyle }) {
  const flat = flattenDescendants(node);
  const family: RefinedFamily = { title: node.title, own: node.own, children: flat };
  const kinds = kindsByFirstAppearance(flat);
  return (
    <div
      className={cn(V7_ROW_CLASS, "bg-sidebar-accent/40")}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
      title={refinedTooltip(family)}
    >
      <Chevron parent="collapsed" />
      <span className="min-w-0 flex-1 truncate">{node.title}</span>
      <span className="flex h-5 shrink-0 items-center gap-1 rounded-full bg-sidebar-accent pr-0.5 pl-1">
        <span
          className={cn(
            "flex items-center",
            style === "superscript" ? "gap-2 pr-1" : "gap-1",
          )}
        >
          {kinds.map((group) => {
            const showCount =
              group.count >= 2 &&
              (style === "superscript" ||
                style === "inline-faint" ||
                (style === "actionable-only" &&
                  (group.state === "needs-input" || group.state === "error")));
            return (
              <span key={group.state} className="relative flex items-center">
                <GlyphSlot>
                  <RefinedGlyph state={group.state} />
                </GlyphSlot>
                {showCount && style === "superscript" ? (
                  <span className="absolute -top-1.5 left-[13px] text-2xs leading-none text-subtle-foreground tabular-nums">
                    {group.count}
                  </span>
                ) : null}
                {showCount && style !== "superscript" ? (
                  <span className="text-2xs leading-none text-muted-foreground/50 tabular-nums">
                    {group.count}
                  </span>
                ) : null}
              </span>
            );
          })}
        </span>
        <span className="h-3 w-px shrink-0 bg-border" />
        <GlyphSlot>
          <SlotGlyph family={family} option="priority" />
        </GlyphSlot>
      </span>
    </div>
  );
}

export const CountTreatments: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-2xl text-sm text-muted-foreground">
      Hover state forced open on the same rows, so only the count treatment
      changes.
    </p>
    <div className="flex flex-col gap-5">
      {COUNT_STYLES.map(({ style, label }) => (
        <div key={style} className="flex w-80 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {[REALISTIC[2]!, REALISTIC[0]!].map((node) => (
              <CountSampleRow key={node.title} node={node} style={style} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const HOVER_INTENT_MS = 300;
const HOVER_GRACE_MS = 150;
const ANNOUNCE_MS = 1600;

function isActionable(state: RefinedState) {
  return state === "needs-input" || state === "error";
}

interface QuietFlight {
  key: string;
  state: RefinedState;
  from: { x: number; y: number };
  to: { x: number; y: number } | null;
}

function pathsToState(node: TreeNode, path: string, state: RefinedState): string[] {
  const paths: string[] = [];
  (node.children ?? []).forEach((child, index) => {
    const childPath = `${path}/${index}`;
    const deeper = flattenDescendants(child).some((item) => item.state === state);
    if (child.own === state || deeper) {
      if (!paths.includes(path)) paths.push(path);
    }
    if (deeper) paths.push(...pathsToState(child, childPath, state));
  });
  return paths;
}

const REVEAL_FLASH_MS = 1600;

interface RevealViewport {
  scroller: () => HTMLElement | null;
  report: (
    state: RefinedState,
    above: HTMLElement[],
    below: HTMLElement[],
  ) => void;
  pillOrigin: (direction: "above" | "below") => { x: number; y: number } | null;
}

const RevealViewportContext = createContext<RevealViewport | null>(null);

function flashRow(target: HTMLElement) {
  const row = target.closest<HTMLElement>("div.h-8");
  if (!row) return;
  row.style.transition = "background-color 150ms";
  row.style.backgroundColor = "var(--color-sidebar-accent)";
  window.setTimeout(() => {
    row.style.backgroundColor = "";
  }, 1200);
}

function scrollToTarget(scroller: HTMLElement, target: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  scroller.scrollBy({
    top: rect.top - box.top - box.height / 2 + rect.height / 2,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function QuietRow({
  node,
  depth,
  path,
  expanded,
  onToggle,
  announce,
  highlight = null,
  onReveal,
  actionChip = false,
}: {
  node: TreeNode;
  depth: number;
  path: string;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  announce: Record<string, number>;
  highlight?: RefinedState | null;
  onReveal: (paths: string[]) => void;
  actionChip?: boolean;
}) {
  const [rowHover, setRowHover] = useState(false);
  const [revealKind, setRevealKind] = useState<RefinedState | null>(null);
  const [pendingReveal, setPendingReveal] = useState<{
    state: RefinedState;
    from: { x: number; y: number };
  } | null>(null);
  const revealTargets = useRef<HTMLElement[]>([]);
  const childrenRef = useRef<HTMLDivElement>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const viewport = useContext(RevealViewportContext);
  const cycle = useRef<{ state: RefinedState; index: number } | null>(null);
  const reveal = (state: RefinedState) => {
    const scroller = viewport?.scroller();
    const container = childrenRef.current;
    if (scroller && container && isExpanded && cycle.current?.state === state) {
      const targets = [
        ...container.querySelectorAll<HTMLElement>(`[data-flight-state="${state}"]`),
      ];
      if (targets.length > 0) {
        cycle.current = { state, index: (cycle.current.index + 1) % targets.length };
        const target = targets[cycle.current.index]!;
        scrollToTarget(scroller, target);
        flashRow(target);
        return;
      }
    }
    cycle.current = { state, index: 0 };
    const wrapper = wrapperRef.current;
    const kindIcon = kindRefs.current.get(state);
    if (wrapper && kindIcon && !prefersReducedMotion()) {
      setPendingReveal({ state, from: relativeOrigin(kindIcon, wrapper) });
    }
    onReveal(pathsToState(node, path, state));
    setRevealKind(state);
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setRevealKind(null), REVEAL_FLASH_MS);
  };
  const [hovering, setHovering] = useState(false);
  const [hoveredKind, setHoveredKind] = useState<RefinedState | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [flights, setFlights] = useState<QuietFlight[] | null>(null);
  const [launched, setLaunched] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const kindRefs = useRef(new Map<RefinedState, HTMLSpanElement>());
  const childRefs = useRef(new Map<number, HTMLSpanElement>());
  const hoverTimer = useRef<number | undefined>(undefined);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = hasChildren && (expanded[path] ?? false);
  const flat = flattenDescendants(node);
  const family: RefinedFamily = { title: node.title, own: node.own, children: flat };
  const allKinds = kindsByFirstAppearance(flat);
  const kinds = actionChip
    ? allKinds.filter((group) => isActionable(group.state))
    : allKinds;
  const worthShowing = hasChildren;
  const idleCount = flat.filter((item) => item.state === "idle").length;
  const visible = actionChip
    ? hasChildren && kinds.length > 0 && (rowHover || announcing)
    : worthShowing && (hovering || announcing);
  const childHighlight =
    (isExpanded && visible ? hoveredKind : null) ?? revealKind ?? highlight;
  const rowHighlighted =
    highlight !== null &&
    (node.own === highlight || flat.some((item) => item.state === highlight));
  const announceKey = announce[path] ?? 0;

  useLayoutEffect(() => {
    if (announceKey === 0) return;
    setAnnouncing(true);
    const timer = window.setTimeout(() => setAnnouncing(false), ANNOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [announceKey]);

  const startHover = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovering(true), HOVER_INTENT_MS);
  };
  const endHover = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovering(false), HOVER_GRACE_MS);
  };

  const flyingChildren = (node.children ?? [])
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => !child.children?.length && child.own !== "none");

  const toggle = () => {
    const wrapper = wrapperRef.current;
    const glyph = glyphRef.current;
    if (wrapper && glyph && !prefersReducedMotion() && flyingChildren.length > 0) {
      const glyphAt = relativeOrigin(glyph, wrapper);
      if (!isExpanded) {
        setFlights(
          flyingChildren.map(({ child, index }) => {
            const state = child.own as RefinedState;
            const kindIcon = visible ? kindRefs.current.get(state) : undefined;
            return {
              key: String(index),
              state,
              from: kindIcon ? relativeOrigin(kindIcon, wrapper) : glyphAt,
              to: null,
            };
          }),
        );
      } else {
        setFlights(
          flyingChildren.flatMap(({ child, index }) => {
            const target = childRefs.current.get(index);
            return target
              ? [{ key: String(index), state: child.own as RefinedState, from: relativeOrigin(target, wrapper), to: glyphAt }]
              : [];
          }),
        );
      }
      setLaunched(false);
    }
    setHovering(false);
    onToggle(path);
  };

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!isExpanded || !flights || flights.every((flight) => flight.to) || !wrapper) return;
    setFlights(
      flights.map((flight) => {
        const target = childRefs.current.get(Number(flight.key));
        return { ...flight, to: target ? relativeOrigin(target, wrapper) : flight.from };
      }),
    );
  }, [isExpanded, flights]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const container = childrenRef.current;
    if (!pendingReveal || !wrapper || !container) return;
    const targets = [
      ...container.querySelectorAll<HTMLElement>(
        `[data-flight-state="${pendingReveal.state}"]`,
      ),
    ];
    setPendingReveal(null);
    if (targets.length === 0) return;
    const reveal = pendingReveal;
    const plan = () => {
      const scroller = viewport?.scroller();
      const box = scroller?.getBoundingClientRect();
      const placed = targets.map((target) => {
        const rect = target.getBoundingClientRect();
        const where: "visible" | "above" | "below" = !box
          ? "visible"
          : rect.bottom <= box.top
            ? "above"
            : rect.top >= box.bottom
              ? "below"
              : "visible";
        return { target, where };
      });
      viewport?.report(
        reveal.state,
        placed.filter((item) => item.where === "above").map((item) => item.target),
        placed.filter((item) => item.where === "below").map((item) => item.target),
      );
      const glyph = glyphRef.current;
      const base = wrapper.getBoundingClientRect();
      const fromRect = kindRefs.current.get(reveal.state)?.getBoundingClientRect() ??
        glyph?.getBoundingClientRect();
      const from = fromRect
        ? { x: fromRect.left - base.left, y: fromRect.top - base.top }
        : reveal.from;
      const visibleTargets = placed.filter((item) => item.where === "visible");
      revealTargets.current = visibleTargets.map((item) => item.target);
      for (const item of visibleTargets) item.target.style.visibility = "hidden";
      setFlights(
        placed.flatMap((item, index) => {
          if (item.where === "visible") {
            return [{ key: `reveal-${index}`, state: reveal.state, from, to: relativeOrigin(item.target, wrapper) }];
          }
          const pill = viewport?.pillOrigin(item.where);
          return pill
            ? [{ key: `reveal-${index}`, state: reveal.state, from, to: { x: pill.x - base.left, y: pill.y - base.top } }]
            : [];
        }),
      );
      setLaunched(false);
    };
    const scroller = viewport?.scroller();
    const box = scroller?.getBoundingClientRect();
    const anyVisible =
      !box ||
      targets.some((target) => {
        const rect = target.getBoundingClientRect();
        return rect.bottom > box.top && rect.top < box.bottom;
      });
    if (scroller && !anyVisible) {
      scrollToTarget(scroller, targets[0]!);
      window.setTimeout(plan, prefersReducedMotion() ? 0 : 380);
    } else {
      plan();
    }
  }, [pendingReveal, expanded]);

  const flightsReady = flights?.every((flight) => flight.to) ?? false;
  useLayoutEffect(() => {
    if (!flightsReady) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setLaunched(true)));
    const done = window.setTimeout(() => {
      setFlights(null);
      for (const target of revealTargets.current) target.style.visibility = "";
      revealTargets.current = [];
    }, FLIGHT_MS + 80);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [flightsReady]);

  const expanding =
    flights !== null &&
    isExpanded &&
    !flights.some((flight) => flight.key.startsWith("reveal-"));
  const badgeFamily: RefinedFamily = actionChip
    ? {
        ...family,
        children: flat.map((item) =>
          item.state === "unread" ? { ...item, state: "idle" as const } : item,
        ),
      }
    : family;
  const glyph = hasChildren ? (
    <SlotGlyph family={badgeFamily} option="priority" />
  ) : (
    <RefinedGlyph state={node.own} />
  );
  const chipWidth = kinds.length * 26 + 8;

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          V7_ROW_CLASS,
          "transition-colors duration-150",
          rowHighlighted && "bg-sidebar-accent",
        )}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth) }}
        onClick={hasChildren ? toggle : undefined}
        onMouseEnter={actionChip ? () => setRowHover(true) : undefined}
        onMouseLeave={actionChip ? () => setRowHover(false) : undefined}
        title={hasChildren ? refinedTooltip(family) : `This thread ${REFINED_LABEL[node.own]}`}
      >
        {hasChildren ? (
          <span className="inline-flex size-5 shrink-0 items-center justify-center text-subtle-foreground">
            <Icon
              name="ChevronRight"
              className={cn("size-3 transition-transform duration-200", isExpanded && "rotate-90")}
            />
          </span>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !hasChildren && node.own === "none" && "text-muted-foreground",
          )}
          style={
            actionChip && rowHover
              ? { paddingRight: 44 + (kinds.length > 0 ? chipWidth : 0) }
              : undefined
          }
        >
          {node.title}
        </span>
        {actionChip ? (
          <span className="relative flex shrink-0 items-center pr-0.5">
            <span ref={glyphRef} style={{ opacity: rowHover ? 0 : 1 }}>
              <GlyphSlot>{glyph}</GlyphSlot>
            </span>
            <span
              className="absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-0.5"
              style={{ opacity: rowHover ? 1 : 0, pointerEvents: rowHover ? "auto" : "none" }}
            >
              {kinds.length > 0 ? (
                <span
                  className="mr-0.5 flex h-6 items-center gap-1 rounded-md px-1 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
                  style={{
                    transformOrigin: "right center",
                    transform: visible ? "none" : "translateX(10px) scale(0.5)",
                    opacity: visible ? 1 : 0,
                  }}
                >
                  {kinds.map((group) => (
                    <button
                      type="button"
                      key={group.state}
                      aria-label={`Show ${group.count} ${REFINED_LABEL[group.state]}`}
                      title={`Show ${group.count} ${REFINED_LABEL[group.state]}`}
                      onMouseEnter={() => setHoveredKind(group.state)}
                      onMouseLeave={() => setHoveredKind(null)}
                      onClick={(event) => {
                        event.stopPropagation();
                        reveal(group.state);
                      }}
                      className="relative flex h-6 w-6 cursor-pointer items-center justify-start rounded-md pl-0.5 hover:bg-state-hover"
                    >
                      <span
                        ref={(element) => {
                          if (element) kindRefs.current.set(group.state, element);
                          else kindRefs.current.delete(group.state);
                        }}
                      >
                        <GlyphSlot>
                          <RefinedGlyph state={group.state} />
                        </GlyphSlot>
                      </span>
                      <span className="absolute bottom-0.5 left-[15px] text-2xs leading-none text-muted-foreground tabular-nums">
                        {group.count}
                      </span>
                    </button>
                  ))}
                </span>
              ) : null}
              <span className="inline-flex size-6 items-center justify-center rounded-md text-subtle-foreground hover:bg-state-hover">
                <Icon name="Archive" className="size-4" />
              </span>
              <span className="inline-flex size-6 items-center justify-center rounded-md text-subtle-foreground hover:bg-state-hover">
                <Icon name="MoreHorizontal" className="size-4" />
              </span>
            </span>
          </span>
        ) : (
        <span
          className="flex shrink-0 items-center pr-0.5"
          onMouseEnter={startHover}
          onMouseLeave={endHover}
        >
          <span
            aria-hidden={!visible}
            className="-my-1.5 flex items-center justify-end overflow-hidden py-1.5 transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none"
            style={{ maxWidth: visible ? 220 : 0, opacity: visible ? 1 : 0 }}
          >
            <span className="flex items-center gap-2.5 pr-2.5">
              {kinds.map((group) => (
                <span
                  key={group.state}
                  onMouseEnter={() => setHoveredKind(group.state)}
                  onMouseLeave={() => setHoveredKind(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    reveal(group.state);
                  }}
                  className={cn(
                    "relative flex cursor-pointer items-center rounded-sm transition-colors hover:bg-state-hover",
                    isExpanded && hoveredKind === group.state && "bg-state-hover",
                    !isActionable(group.state) && "opacity-60",
                  )}
                >
                  <span
                    ref={(element) => {
                      if (element) kindRefs.current.set(group.state, element);
                      else kindRefs.current.delete(group.state);
                    }}
                  >
                    <GlyphSlot>
                      <RefinedGlyph state={group.state} />
                    </GlyphSlot>
                  </span>
                  <span className="absolute -bottom-1 left-[13px] text-2xs leading-none text-muted-foreground tabular-nums">
                    {group.count}
                  </span>
                </span>
              ))}
              {idleCount > 0 ? (
                <span className="relative flex items-center opacity-60">
                  <Icon
                    name="ChildThread"
                    className={cn(SIDEBAR_STATUS_ICON_CLASS, "text-muted-foreground")}
                  />
                  <span className="absolute -bottom-1 left-[13px] text-2xs leading-none text-muted-foreground tabular-nums">
                    {idleCount}
                  </span>
                </span>
              ) : null}
            </span>
          </span>
          <span ref={glyphRef} data-flight-state={depth > 0 ? node.own : undefined}>
            <GlyphSlot>{glyph}</GlyphSlot>
          </span>
        </span>
        )}
      </div>
      {isExpanded ? (
        <div ref={childrenRef} className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-2 w-px bg-border"
            style={{ left: getSidebarThreadRowPaddingLeft(depth) + 10 }}
          />
          {node.children!.map((child, index) =>
            child.children?.length ? (
              <QuietRow
                key={`${child.title}-${index}`}
                node={child}
                depth={depth + 1}
                path={`${path}/${index}`}
                expanded={expanded}
                onToggle={onToggle}
                announce={announce}
                highlight={childHighlight}
                onReveal={onReveal}
                actionChip={actionChip}
              />
            ) : (
              <div
                key={`${child.title}-${index}`}
                className={cn(
                  V7_ROW_CLASS,
                  "transition-colors duration-150",
                  childHighlight !== null &&
                    child.own === childHighlight &&
                    "bg-sidebar-accent",
                )}
                style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth + 1) }}
              >
                <span className="size-5 shrink-0" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    child.own === "none" && "text-muted-foreground",
                  )}
                >
                  {child.title}
                </span>
                <span
                  className="pr-0.5"
                  ref={(element) => {
                    if (element) childRefs.current.set(index, element);
                    else childRefs.current.delete(index);
                  }}
                  style={{ opacity: expanding ? 0 : 1 }}
                  data-flight-state={child.own}
                >
                  <GlyphSlot>
                    <RefinedGlyph state={child.own} />
                  </GlyphSlot>
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}
      {flights?.map((flight) => {
        const target = flight.to ?? flight.from;
        const at = launched ? target : flight.from;
        return (
          <span
            key={flight.key}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 z-10"
            style={{
              transform: `translate(${at.x}px, ${at.y}px)`,
              transition: launched
                ? `transform ${FLIGHT_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                : "none",
            }}
          >
            <GlyphSlot>
              <RefinedGlyph state={flight.state} />
            </GlyphSlot>
          </span>
        );
      })}
    </div>
  );
}

const QUIET_NODES: TreeNode[] = [
  REALISTIC[0]!,
  {
    title: "Docs refresh",
    own: "none",
    children: [
      leaf("Rewrite CLI guide", "running"),
      leaf("Screenshot pass", "running"),
      leaf("Link check"),
    ],
  },
  REALISTIC[2]!,
  REALISTIC[4]!,
  REALISTIC[5]!,
  REALISTIC[6]!,
  REALISTIC[8]!,
];

export const QuietFlow: Story = () => {
  const [nodes, setNodes] = useState(QUIET_NODES);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [announce, setAnnounce] = useState<Record<string, number>>({});
  const docsPath = "quiet/1";
  const triggerNeedsYou = () => {
    setNodes((current) =>
      current.map((node, index) =>
        index === 1
          ? {
              ...node,
              children: node.children!.map((child) =>
                child.title === "Link check" ? { ...child, own: "needs-input" } : child,
              ),
            }
          : node,
      ),
    );
    setAnnounce((current) => ({ ...current, [docsPath]: (current[docsPath] ?? 0) + 1 }));
  };
  const reset = () => {
    setNodes(QUIET_NODES);
    setAnnounce({});
  };
  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="max-w-4xl text-sm text-muted-foreground">
        Quiet: rest on a glyph ~300ms to see the breakdown, which unfolds out of
        the glyph with no capsule. Every row with child threads shows it; a
        family with only idle children shows a muted child-threads count.
        Every kind always shows its count, idle children included, so the
        hint looks the same however many children there are. Running and
        unread are faint. Counts are subscripts: metadata on each status, the
        way the corner badge is a superscript on the parent. Click flies icons
        into the rows; collapsing flies them back. Expanded, hover an icon in
        the breakdown to highlight the rows (and collapsed sub-parents) with
        that state; click one to unfurl every thread with that state. The
        button simulates a child newly needing you.
      </p>
      <div className="flex gap-6">
        <div className="flex w-80 flex-col gap-1">
          <span className="text-xs text-foreground">Current P</span>
          <TreeList nodes={QUIET_NODES} expandAll={false} prefix="current" />
        </div>
        <div className="flex w-80 flex-col gap-1">
          <span className="text-xs text-foreground">Quiet</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {nodes.map((node, index) => (
              <QuietRow
                key={`${node.title}-${index}`}
                node={node}
                depth={0}
                path={`quiet/${index}`}
                expanded={expanded}
                onToggle={(path) =>
                  setExpanded((current) => ({ ...current, [path]: !current[path] }))
                }
                announce={announce}
                onReveal={(paths) =>
                  setExpanded((current) => ({
                    ...current,
                    ...Object.fromEntries(paths.map((item) => [item, true])),
                  }))
                }
              />
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={triggerNeedsYou}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-state-hover"
            >
              Simulate: a Docs refresh child needs you
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-state-hover"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

type AttachedCount =
  | "faint"
  | "matched"
  | "inside"
  | "chip"
  | "left-faint"
  | "left-matched";

const COUNT_TEXT_TONE: Partial<Record<RefinedState, string>> = {
  "needs-input": "text-attention",
  error: "text-destructive",
};

const COUNT_CHIP_TONE: Partial<Record<RefinedState, string>> = {
  "needs-input": "bg-attention/15",
  error: "bg-destructive/15",
};

function CountedKind({
  state,
  count,
  style,
  iconRef,
}: {
  state: RefinedState;
  count: number;
  style: AttachedCount;
  iconRef?: (element: HTMLSpanElement | null) => void;
}) {
  const counted = isActionable(state) && count >= 2;
  if (!counted) {
    return (
      <span
        ref={iconRef}
        className={cn("flex items-center", !isActionable(state) && "opacity-50")}
      >
        <GlyphSlot>
          <RefinedGlyph state={state} />
        </GlyphSlot>
      </span>
    );
  }
  if (style === "inside") {
    return (
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full border-[1.5px] text-2xs leading-none font-semibold tabular-nums",
          state === "needs-input" ? "border-attention text-attention" : "border-destructive text-destructive",
        )}
      >
        {count}
      </span>
    );
  }
  const number = (
    <span
      className={cn(
        "text-xs leading-none tabular-nums",
        style === "faint" || style === "left-faint"
          ? "text-2xs text-muted-foreground/50"
          : ["font-medium", COUNT_TEXT_TONE[state]],
      )}
    >
      {count}
    </span>
  );
  const icon = (
    <span ref={iconRef}>
      <GlyphSlot>
        <RefinedGlyph state={state} />
      </GlyphSlot>
    </span>
  );
  const left = style === "left-faint" || style === "left-matched";
  return (
    <span
      className={cn(
        "flex items-center",
        left ? "gap-0.5" : "gap-px",
        style === "chip" && ["h-4 rounded-full pr-1", COUNT_CHIP_TONE[state]],
      )}
    >
      {left ? number : icon}
      {left ? icon : number}
    </span>
  );
}

const ATTACHED_STYLES: { style: AttachedCount; label: string }[] = [
  { style: "faint", label: "Current: faint grey number" },
  { style: "matched", label: "A · Number in the icon's colour, tight" },
  { style: "inside", label: "B · Number replaces the glyph inside the circle" },
  { style: "chip", label: "C · Icon + number in a tinted chip" },
  { style: "left-faint", label: "D · Number flush left, faint" },
  { style: "left-matched", label: "E · Number flush left, icon colour" },
];

export const CountAttachment: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-2xl text-sm text-muted-foreground">
      Quiet breakdown forced open on the same rows; only the count treatment
      changes. Counts appear only on needs you / failed when two or more.
    </p>
    <div className="flex flex-col gap-5">
      {ATTACHED_STYLES.map(({ style, label }) => (
        <div key={style} className="flex w-80 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {[REALISTIC[2]!, REALISTIC[0]!].map((node) => {
              const flat = flattenDescendants(node);
              const family: RefinedFamily = { title: node.title, own: node.own, children: flat };
              return (
                <div
                  key={node.title}
                  className={V7_ROW_CLASS}
                  style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
                >
                  <Chevron parent="collapsed" />
                  <span className="min-w-0 flex-1 truncate">{node.title}</span>
                  <span className="flex shrink-0 items-center pr-0.5">
                    <span className="flex items-center gap-1 pr-1.5">
                      {kindsByFirstAppearance(flat).map((group) => (
                        <CountedKind
                          key={group.state}
                          state={group.state}
                          count={group.count}
                          style={style}
                        />
                      ))}
                    </span>
                    <GlyphSlot>
                      <SlotGlyph family={family} option="priority" />
                    </GlyphSlot>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

interface EdgePill {
  state: RefinedState;
  targets: HTMLElement[];
}

function EdgePillButton({
  direction,
  pill,
  onJump,
}: {
  direction: "above" | "below";
  pill: EdgePill;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className={cn(
        "absolute right-2 z-20 flex h-5 items-center gap-1 rounded-full border border-sidebar-border bg-sidebar px-1.5 shadow-sm",
        direction === "above" ? "top-1.5" : "bottom-1.5",
      )}
      aria-label={`${pill.targets.length} more ${REFINED_LABEL[pill.state]} ${direction === "above" ? "above" : "below"}`}
    >
      <Icon
        name="ChevronRight"
        className={cn(
          "size-3 text-muted-foreground",
          direction === "above" ? "-rotate-90" : "rotate-90",
        )}
      />
      <span className={cn("text-xs leading-none font-medium tabular-nums", COUNT_TEXT_TONE[pill.state] ?? "text-muted-foreground")}>
        {pill.targets.length}
      </span>
      <GlyphSlot>
        <RefinedGlyph state={pill.state} />
      </GlyphSlot>
    </button>
  );
}

const OFFSCREEN_NODES: TreeNode[] = [
  QUIET_NODES[1]!,
  REALISTIC[2]!,
  REALISTIC[0]!,
  REALISTIC[1]!,
  REALISTIC[4]!,
  REALISTIC[5]!,
];

export const OffscreenReveal: Story = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pills, setPills] = useState<{ above: EdgePill | null; below: EdgePill | null }>({
    above: null,
    below: null,
  });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const watched = [...(pills.above?.targets ?? []), ...(pills.below?.targets ?? [])];
    if (!scroller || watched.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
        if (seen.length === 0) return;
        setPills((current) => {
          const prune = (pill: EdgePill | null) => {
            if (!pill) return null;
            const targets = pill.targets.filter((target) => !seen.includes(target));
            return targets.length > 0 ? { ...pill, targets } : null;
          };
          return { above: prune(current.above), below: prune(current.below) };
        });
        for (const target of seen) flashRow(target as HTMLElement);
      },
      { root: scroller, threshold: 0.9 },
    );
    for (const target of watched) observer.observe(target);
    return () => observer.disconnect();
  }, [pills]);

  const viewport: RevealViewport = {
    scroller: () => scrollerRef.current,
    report: (state, above, below) =>
      setPills({
        above: above.length > 0 ? { state, targets: above } : null,
        below: below.length > 0 ? { state, targets: below } : null,
      }),
    pillOrigin: (direction) => {
      const box = scrollerRef.current?.getBoundingClientRect();
      if (!box) return null;
      return {
        x: box.right - 34,
        y: direction === "above" ? box.top + 8 : box.bottom - 24,
      };
    },
  };

  const jump = (direction: "above" | "below") => {
    const scroller = scrollerRef.current;
    const pill = pills[direction];
    if (!scroller || !pill) return;
    const target = direction === "below" ? pill.targets[0]! : pill.targets[pill.targets.length - 1]!;
    scrollToTarget(scroller, target);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        A short sidebar. Rest on a family&apos;s glyph, then click an icon in
        the hint. Matches on screen get flying copies. Off-screen matches fly to
        an edge pill; click it to scroll to the next one. The pill counts down
        as rows come into view. If no match is on screen, the list scrolls to
        the first one first. Click the same hint icon again to jump to the
        next match.
      </p>
      <RevealViewportContext.Provider value={viewport}>
        <div className="relative w-80 rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground">
          {pills.above ? (
            <EdgePillButton direction="above" pill={pills.above} onJump={() => jump("above")} />
          ) : null}
          {pills.below ? (
            <EdgePillButton direction="below" pill={pills.below} onJump={() => jump("below")} />
          ) : null}
          <div ref={scrollerRef} className="h-[360px] overflow-y-auto p-1">
            {OFFSCREEN_NODES.map((node, index) => (
              <QuietRow
                key={`${node.title}-${index}`}
                node={node}
                depth={0}
                path={`offscreen/${index}`}
                expanded={expanded}
                onToggle={(path) =>
                  setExpanded((current) => ({ ...current, [path]: !current[path] }))
                }
                announce={{}}
                onReveal={(paths) =>
                  setExpanded((current) => ({
                    ...current,
                    ...Object.fromEntries(paths.map((item) => [item, true])),
                  }))
                }
              />
            ))}
          </div>
        </div>
      </RevealViewportContext.Provider>
    </div>
  );
};

type HintCollapse = "all" | "action-rest" | "action-running-rest" | "worst-rest";

interface HintItem {
  key: string;
  icon: ReactNode;
  count: number;
  quiet: boolean;
}

function SubscriptItem({ item }: { item: HintItem }) {
  return (
    <span className={cn("relative flex items-center", item.quiet && "opacity-60")}>
      {item.icon}
      <span className="absolute -bottom-1 left-[13px] text-2xs leading-none text-muted-foreground tabular-nums">
        {item.count}
      </span>
    </span>
  );
}

function restIcon(running: boolean) {
  return (
    <Icon
      name="ChildThread"
      className={cn(
        SIDEBAR_STATUS_ICON_CLASS,
        running
          ? ["animate-shine-icon", SIDEBAR_WORKING_STATUS_COLOR_CLASS]
          : "text-muted-foreground",
      )}
    />
  );
}

function hintItems(flat: { state: RefinedState }[], mode: HintCollapse): HintItem[] {
  const count = (state: RefinedState) => flat.filter((item) => item.state === state).length;
  const glyph = (state: RefinedState) => (
    <GlyphSlot>
      <RefinedGlyph state={state} />
    </GlyphSlot>
  );
  const kind = (state: RefinedState): HintItem[] =>
    count(state) > 0
      ? [{ key: state, icon: glyph(state), count: count(state), quiet: !isActionable(state) }]
      : [];
  const rest = (states: RefinedState[]): HintItem[] => {
    const total = states.reduce((sum, state) => sum + count(state), 0);
    return total > 0
      ? [{ key: "rest", icon: restIcon(states.includes("running") && count("running") > 0), count: total, quiet: true }]
      : [];
  };
  if (mode === "all") {
    return [
      ...kind("needs-input"),
      ...kind("error"),
      ...kind("running"),
      ...kind("unread"),
      ...(count("idle") > 0
        ? [{ key: "idle", icon: restIcon(false), count: count("idle"), quiet: true }]
        : []),
    ];
  }
  if (mode === "action-rest") {
    return [...kind("needs-input"), ...kind("error"), ...rest(["running", "unread", "idle"])];
  }
  if (mode === "action-running-rest") {
    return [...kind("needs-input"), ...kind("error"), ...kind("running"), ...rest(["unread", "idle"])];
  }
  const worst = (["needs-input", "error"] as RefinedState[]).find((state) => count(state) > 0);
  return [
    ...(worst ? kind(worst) : []),
    ...rest((["needs-input", "error", "running", "unread", "idle"] as RefinedState[]).filter((state) => state !== worst)),
  ];
}

const HINT_MODES: { mode: HintCollapse; label: string; rule: string }[] = [
  { mode: "all", label: "Current · every kind (up to 5)", rule: "Needs you, failed, running, unread, idle." },
  {
    mode: "action-rest",
    label: "A · Act-on kinds + everything else (up to 3)",
    rule: "Needs you and failed get their own icons. Everything else is one child-threads icon with a total, shimmering if any are running.",
  },
  {
    mode: "action-running-rest",
    label: "B · Act-on kinds + running + the rest (up to 4)",
    rule: "Keeps running separate so 'where is work' stays explicit; unread and idle merge.",
  },
  {
    mode: "worst-rest",
    label: "C · Most urgent + everything else (up to 2)",
    rule: "Only the most urgent kind gets an icon; everything else is one total.",
  },
];

const HINT_SAMPLE_NODES: TreeNode[] = [
  REALISTIC[2]!,
  REALISTIC[0]!,
  QUIET_NODES[1]!,
  REALISTIC[5]!,
  REALISTIC[6]!,
];

export const HintCollapseOptions: Story = () => (
  <div className="flex flex-col gap-4 p-6">
    <p className="max-w-3xl text-sm text-muted-foreground">
      The hover hint forced open on the same rows; only how many icons it uses
      changes. Counts are subscripts.
    </p>
    <div className="flex flex-col gap-5">
      {HINT_MODES.map(({ mode, label, rule }) => (
        <div key={mode} className="flex w-96 flex-col gap-1">
          <span className="text-xs text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{rule}</span>
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
            {HINT_SAMPLE_NODES.map((node) => {
              const flat = flattenDescendants(node);
              const family: RefinedFamily = { title: node.title, own: node.own, children: flat };
              return (
                <div
                  key={node.title}
                  className={V7_ROW_CLASS}
                  style={{ paddingLeft: getSidebarThreadRowPaddingLeft(0) }}
                >
                  <Chevron parent="collapsed" />
                  <span className="min-w-0 flex-1 truncate">{node.title}</span>
                  <span className="flex shrink-0 items-center pr-0.5">
                    <span className="flex items-center gap-2.5 pr-2.5">
                      {hintItems(flat, mode).map((item) => (
                        <SubscriptItem key={item.key} item={item} />
                      ))}
                    </span>
                    <GlyphSlot>
                      <SlotGlyph family={family} option="priority" />
                    </GlyphSlot>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const CHIP_NODES: TreeNode[] = [
  REALISTIC[0]!,
  QUIET_NODES[1]!,
  REALISTIC[2]!,
  REALISTIC[1]!,
  REALISTIC[4]!,
  REALISTIC[6]!,
  REALISTIC[8]!,
];

export const ActionChipFlow: Story = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex max-w-2xl flex-col gap-1 text-sm text-muted-foreground">
        <span>
          Rest: the parent&apos;s glyph, with a corner dot only when something
          under it needs you (amber needs input, red failed).
        </span>
        <span>
          Hover the row: today&apos;s quick action and ⋯ menu appear in place
          of the glyph, and the dot unfolds into a chip of just the things to
          act on, with subscript counts.
        </span>
        <span>
          Click a chip icon: those threads unfurl, the icons fly to them, and
          they flash. The chip stays on hover as a breadcrumb.
        </span>
      </div>
      <div className="w-80 rounded-lg border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground">
        {CHIP_NODES.map((node, index) => (
          <QuietRow
            key={`${node.title}-${index}`}
            node={node}
            depth={0}
            path={`chip/${index}`}
            expanded={expanded}
            actionChip
            onToggle={(path) =>
              setExpanded((current) => ({ ...current, [path]: !current[path] }))
            }
            announce={{}}
            onReveal={(paths) =>
              setExpanded((current) => ({
                ...current,
                ...Object.fromEntries(paths.map((item) => [item, true])),
              }))
            }
          />
        ))}
      </div>
    </div>
  );
};
