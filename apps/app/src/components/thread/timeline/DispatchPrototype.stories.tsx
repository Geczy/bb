/**
 * Prototype only (Dispatch sign-off): comms channels.
 *
 * The thread's main tab is the user ↔ this agent. Every agent the thread talks
 * with gets its own tab holding that two-way conversation: messages this thread
 * sent, messages it got back, and the counterpart's completion results. Rows are
 * bb's real timeline rows (ThreadTimelineRows / GeneratedConversationMessage),
 * so sender names, results, and delivery states render exactly as core renders
 * them today. Fixture: the real 🧰 Ops Tools org, with shortened message text.
 * Nothing here changes production code.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TimelineRow } from "@bb/server-contract";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { CONTEXT_INACTIVE_TEXT_CLASS, CONTEXT_SELECTION_SURFACE_CLASS } from "@bb/shared-ui/context-selection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThreadTimelineRows } from "@/components/thread/timeline";
import { threadListQueryKey } from "@/hooks/queries/query-keys";
import { conversationRow } from "@/test/fixtures/thread-timeline-rows";
import { makeThreadListEntry } from "../../../../.ladle/story-fixtures";

export default { title: "prototype/Dispatch channels" };

const PROJECT = "proj_bb_plugins";
const SELF = "thr_6a86uy5ftb";

// ── The real Ops Tools org ──────────────────────────────────────────────────

interface Counterpart {
  id: string;
  title: string;
  relation: "report" | "peer lead";
  /** Has activity the user hasn't seen in this tab. */
  unread?: boolean;
  /** The counterpart is waiting on the user. */
  needsYou?: string;
}

const COUNTERPARTS: readonly Counterpart[] = [
  { id: "thr_hvp9f88gmv", title: "Dispatch", relation: "report", unread: true },
  { id: "thr_kw2dvwhadi", title: "Pinned links", relation: "report" },
  { id: "thr_hrf6shzab6", title: "Content calendar", relation: "report", unread: true },
  { id: "thr_bwtj2hhcif", title: "Action cards", relation: "report" },
  { id: "thr_bnjgw7w7hx", title: "Image carousel", relation: "report", needsYou: "Which carousel file format should #418 accept: PNG only, or PNG and WebP?" },
  { id: "thr_sz2twxjkai", title: "Moss viewer", relation: "report" },
  { id: "thr_bdgvzaiafa", title: "🎯 Growth", relation: "peer lead", unread: true },
  { id: "thr_3x4zf7xx8z", title: "🧭 Strategy & Fundraising", relation: "peer lead" },
];
const TITLES = new Map<string, string>([
  [SELF, "🧰 Ops Tools"],
  ...COUNTERPARTS.map((entry) => [entry.id, entry.title] as const),
]);

function storyQueryClient(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(
    threadListQueryKey({} as never),
    [...TITLES].map(([id, title]) =>
      makeThreadListEntry({ id, projectId: PROJECT, title, titleFallback: title }),
    ) as never,
  );
  return client;
}

// ── Messages: persisted facts only ──────────────────────────────────────────

/**
 * out: this thread → counterpart (agent message, shows "Message from 🧰 Ops Tools").
 * in: counterpart → this thread (agent message).
 * result: the counterpart's completion notice (system child-completed).
 * attention: the counterpart is blocked on the user (child-needs-attention).
 */
interface ChannelMessage {
  dir: "out" | "in" | "result" | "attention";
  minute: number;
  text: string;
  /** Persisted turn-request state: pending (queued) or rejected (not delivered). */
  status?: "pending" | "rejected";
  steer?: boolean;
}

const CHANNELS: Record<string, readonly ChannelMessage[]> = {
  thr_hvp9f88gmv: [
    { dir: "out", minute: 0, text: "Dispatch is now Ops Tools P0. Present the completed mockups and the build decision to brsbl in your thread; keep the #396 changes queued." },
    { dir: "result", minute: 14, text: "The Dispatch build decision and the PR #396 merge decision are now with you in this thread. Nothing changes on my side until then." },
    { dir: "out", minute: 31, text: "brsbl's answers: Dispatch build NOT YET — redo the mockups as Ladle stories with real bb components. #396 KEEP OPEN — run one e2e dry run on the exact head." },
    { dir: "result", minute: 52, text: "The e2e run is done, and CI on head `900b52882` is still running. Next I'll start the Dispatch Ladle stories, then send the #396 report once CI finishes." },
    { dir: "out", minute: 58, steer: true, text: "Scope correction from brsbl: think of these as comms channels — one tab per agent this thread talks with. The goal is separating comms." },
  ],
  thr_hrf6shzab6: [
    { dir: "result", minute: 3, text: "Rerunning the flaky Inline Action Cards job. Merge and plugin update follow once it's green." },
    { dir: "result", minute: 11, text: "PR #420 is merged. Your installed plugin updates as soon as `main`'s CI republishes the install ref." },
    { dir: "out", minute: 16, text: "Finish the plugin update, then clean up everything this task created." },
    { dir: "result", minute: 40, text: "Content Calendar 0.1.3 from PR #420 is now running in your installed bb, and the calendar is synced." },
  ],
  thr_bnjgw7w7hx: [
    { dir: "out", minute: 5, text: "Add `--carousel-file` to the CLI and keep #418 one PR." },
    { dir: "result", minute: 46, text: "`--carousel-file` is pushed on #418 at `d7f288e7`, and the branch has `main` merged in. CI is queued on GitHub." },
    { dir: "attention", minute: 49, text: "Image carousel is waiting on you: which carousel file format should #418 accept — PNG only, or PNG and WebP?" },
  ],
  thr_kw2dvwhadi: [
    { dir: "out", minute: 1, text: "Show a GitHub PR pin's state beside its icon." },
    { dir: "result", minute: 9, text: "Built and installed: PR pins now show open, merged, or closed beside the icon. PR #390 is green." },
  ],
  thr_bwtj2hhcif: [
    { dir: "out", minute: 20, text: "Drive #419 to green and report once." },
    { dir: "result", minute: 54, text: "CI is still running on `fb40a1a`. I'll report when it finishes." },
    { dir: "out", minute: 56, status: "pending", text: "When it's green, attach full-window before/after screenshots of the exact head." },
  ],
  thr_sz2twxjkai: [
    { dir: "out", minute: 2, text: "Clean up the Moss Viewer demo setup." },
    { dir: "result", minute: 24, text: "The Moss Viewer demo setup is cleaned up. The only thing left to remove was a closed terminal record." },
  ],
  thr_bdgvzaiafa: [
    { dir: "in", minute: 50, text: "Rule from the user: a passing QA run (qa-agent, right browsers for the change) on the exact PR head is a hard gate before any merge is proposed or done. Pass it to your reports." },
    { dir: "in", minute: 51, text: "Addition to the merge rule: after QA passes, the user signs off on full-window before/after screenshots of the exact PR head." },
    { dir: "out", minute: 52, text: "Passed to all six reports, quoting the user." },
    { dir: "in", minute: 57, text: "Growth: CHANGES NEEDED on Delegation skills at `900b52882`. 1. Model tiers by role. 2. Report target and org chart in the worker template." },
  ],
  thr_3x4zf7xx8z: [
    { dir: "in", minute: 57, text: "Strategy & Fundraising review of delegation skills @ `900b52882`: CHANGES NEEDED (3 blocking, 1 small). collect-results and report-results: sign off." },
    { dir: "out", minute: 59, status: "rejected", text: "Thanks — folding your four items into one list for Dispatch." },
  ],
};

const BASE = 1_791_836_000_000;
const at = (minute: number) => BASE + minute * 60_000;

function channelRows(counterpartId: string): TimelineRow[] {
  return (CHANNELS[counterpartId] ?? []).map((message, index) => {
    const id = `${counterpartId}_${index}`;
    if (message.dir === "result" || message.dir === "attention") {
      return conversationRow({
        id,
        role: "user",
        initiator: "system",
        systemMessageKind: message.dir === "result" ? "child-completed" : "child-needs-attention",
        systemMessageSubject: { kind: "thread", threadId: counterpartId, threadName: TITLES.get(counterpartId) ?? counterpartId },
        createdAt: at(message.minute),
        text: message.text,
      });
    }
    return conversationRow({
      id,
      role: "user",
      initiator: "agent",
      senderThreadId: message.dir === "out" ? SELF : counterpartId,
      createdAt: at(message.minute),
      text: message.text,
      turnRequest: {
        isGrouped: false,
        kind: message.steer ? "steer" : "message",
        status: message.status ?? "accepted",
      },
    });
  });
}

const MAIN_ROWS: readonly TimelineRow[] = [
  conversationRow({ id: "m1", role: "user", initiator: "user", createdAt: at(0), text: "ok P0 is getting Dispatch operational to make it easier to run these org structures effectively" }),
  conversationRow({ id: "m2", role: "assistant", createdAt: at(1), text: "Dispatch is P0. I've told the Dispatch lead to put the mockups and the build decision in front of you, with the #396 changes queued behind it." }),
  conversationRow({ id: "m3", role: "user", initiator: "user", createdAt: at(30), text: "i need mockups that look like bb these are disconnected from the code base/ use stories" }),
  conversationRow({ id: "m4", role: "assistant", createdAt: at(31), text: "Passed to Dispatch: Ladle stories with real bb components, light mode. #396 stays open until the e2e dry run is done." }),
];

// ── Shared chrome ───────────────────────────────────────────────────────────

function AppFrame({ children, width = 1440 }: { children: ReactNode; width?: number }) {
  const client = useMemo(storyQueryClient, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SidebarProvider>
          <div className="flex h-[1000px] overflow-hidden border border-border bg-background text-foreground" style={{ width }}>
            <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
              <SidebarContent className="gap-1 px-2 py-3">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton><Icon name="SquarePen" aria-hidden />New thread</SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <p className="px-2 pt-4 pb-1 text-xs text-muted-foreground">Threads</p>
                <SidebarMenu>
                  {["🎯 Growth", "🧭 Strategy & Fundraising"].map((title) => (
                    <SidebarMenuItem key={title}><SidebarMenuButton><span className="truncate">{title}</span></SidebarMenuButton></SidebarMenuItem>
                  ))}
                  <SidebarMenuItem><SidebarMenuButton isActive><span className="truncate">🧰 Ops Tools</span></SidebarMenuButton></SidebarMenuItem>
                  {COUNTERPARTS.filter((entry) => entry.relation === "report").map((entry) => (
                    <SidebarMenuItem key={entry.id}>
                      <SidebarMenuButton style={{ paddingLeft: 22 }}><span className="truncate">{entry.title}</span></SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarContent>
            </aside>
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ThreadHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <p className="truncate text-sm font-semibold">🧰 Ops Tools</p>
    </header>
  );
}

/** Activity marks reuse the sidebar's dot idiom: grey for new, attention for needs-you. */
function ActivityDot({ entry }: { entry: Counterpart }) {
  if (entry.needsYou) return <span className="size-1.5 shrink-0 rounded-full bg-attention" aria-label="Needs you" />;
  if (entry.unread) return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-label="New activity" />;
  return null;
}

function Conversation({ rows, fill }: { rows: readonly TimelineRow[]; fill?: boolean }) {
  const expanded = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  return (
    <div className={fill ? "w-full min-w-0 px-4 py-4 [container-type:normal]" : "mx-auto w-full max-w-[760px] px-6 py-6"}>
      <ThreadTimelineRows
        projectId={PROJECT}
        threadRuntimeDisplayStatus="idle"
        workspaceRootPath={undefined}
        initialExpanded={expanded}
        timelineRows={rows}
      />
    </div>
  );
}

function ChannelHeading({ entry }: { entry: Counterpart }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-6 pt-5 text-sm">
      <span className="font-semibold">🧰 Ops Tools ↔ {entry.title}</span>
      <span className="text-muted-foreground">· {entry.relation === "report" ? "your report" : "peer lead"}</span>
      <span className="flex-1" />
      <Button size="sm" variant="ghost"><Icon name="ExternalLink" className="size-3.5" aria-hidden />Open {entry.title}</Button>
    </div>
  );
}

/** Option for the main tab: one line per counterpart waiting on the user. */
function NeedsYouNotices({ onOpen }: { onOpen: (id: string) => void }) {
  const waiting = COUNTERPARTS.filter((entry) => entry.needsYou);
  if (waiting.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-2 px-6 pt-5">
      {waiting.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="size-1.5 shrink-0 rounded-full bg-attention" aria-hidden />
          <span className="font-medium">{entry.title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.needsYou}</span>
          <Button size="sm" variant="outline" onClick={() => onOpen(entry.id)}>Open channel</Button>
        </div>
      ))}
    </div>
  );
}

// ── Channel tabs in the thread header ───────────────────────────────────────
// The title is the first tab (the user ↔ this agent). Channel tabs follow it in
// the same header row, styled like bb's split-pane focus tab
// (CONTEXT_SELECTION_SURFACE_CLASS / CONTEXT_INACTIVE_TEXT_CLASS). Tabs that
// don't fit move into a "More" menu, and the active tab always stays visible.

const TAB_CLASS = "-my-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm transition-colors";

function HeaderTab({ label, active, onSelect, entry, title }: { label: string; active: boolean; onSelect: () => void; entry?: Counterpart; title?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(TAB_CLASS, active ? CONTEXT_SELECTION_SURFACE_CLASS : CONTEXT_INACTIVE_TEXT_CLASS, !active && "hover:text-foreground", title && "font-normal")}
    >
      {label}
      {entry ? <ActivityDot entry={entry} /> : null}
    </button>
  );
}

function ChannelHeader({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(COUNTERPARTS.length);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const fit = () => {
      const widths = [...measure.children].map((child) => (child as HTMLElement).offsetWidth + 4);
      const moreWidth = 96;
      const header = row.closest("header");
      const available = (header?.clientWidth ?? row.clientWidth) - 48;
      let used = widths[0] ?? 0; // the title tab
      let count = 0;
      for (let index = 1; index < widths.length; index += 1) {
        const remaining = widths.length - 1 - index;
        if (used + widths[index]! + (remaining > 0 ? moreWidth : 0) > available) break;
        used += widths[index]!;
        count += 1;
      }
      setVisibleCount(count);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row.closest("header") ?? row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, []);

  let visible = COUNTERPARTS.slice(0, visibleCount);
  const activeEntry = COUNTERPARTS.find((entry) => entry.id === active);
  if (activeEntry && !visible.includes(activeEntry)) {
    visible = [...visible.slice(0, Math.max(0, visible.length - 1)), activeEntry];
  }
  const hidden = COUNTERPARTS.filter((entry) => !visible.includes(entry));
  const hiddenNeedsYou = hidden.some((entry) => entry.needsYou);
  const hiddenUnread = hidden.some((entry) => entry.unread);

  return (
    <AppPageHeader
      center={
        <div ref={rowRef} role="tablist" aria-label="Channels" className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <HeaderTab label="🧰 Ops Tools" title active={active === "main"} onSelect={() => onSelect("main")} />
          {visible.map((entry) => (
            <HeaderTab key={entry.id} label={entry.title} entry={entry} active={active === entry.id} onSelect={() => onSelect(entry.id)} />
          ))}
          {hidden.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn(TAB_CLASS, CONTEXT_INACTIVE_TEXT_CLASS, "hover:text-foreground")}>
                  {hidden.length} more
                  {hiddenNeedsYou ? <span className="size-1.5 rounded-full bg-attention" aria-label="Needs you" /> : hiddenUnread ? <span className="size-1.5 rounded-full bg-muted-foreground" aria-label="New activity" /> : null}
                  <Icon name="ChevronDown" className="size-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((entry) => (
                  <DropdownMenuItem key={entry.id} onSelect={() => onSelect(entry.id)}>
                    <span className="flex-1">{entry.title}</span>
                    <ActivityDot entry={entry} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {/* Off-screen copy used only to measure each tab's natural width. */}
          <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
            <span className={TAB_CLASS}>🧰 Ops Tools</span>
            {COUNTERPARTS.map((entry) => (
              <span key={entry.id} className={TAB_CLASS}>{entry.title}<span className="size-1.5" /></span>
            ))}
          </div>
        </div>
      }
    />
  );
}

function ThreadWithHeaderChannels({ initial, notices, width = 1440 }: { initial: string; notices: boolean; width?: number }) {
  const [tab, setTab] = useState(initial);
  const entry = COUNTERPARTS.find((candidate) => candidate.id === tab);
  return (
    <AppFrame width={width}>
      <ChannelHeader active={tab} onSelect={setTab} />
      <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">
        {entry ? (
          <>
            <ChannelHeading entry={entry} />
            <Conversation rows={channelRows(entry.id)} />
          </>
        ) : (
          <>
            {notices ? <NeedsYouNotices onOpen={setTab} /> : null}
            <Conversation rows={MAIN_ROWS} />
          </>
        )}
      </div>
    </AppFrame>
  );
}

export function HeaderMainChannel() {
  return <ThreadWithHeaderChannels initial="main" notices />;
}

export function HeaderDispatchChannel() {
  return <ThreadWithHeaderChannels initial="thr_hvp9f88gmv" notices />;
}

export function HeaderPeerLeadChannel() {
  return <ThreadWithHeaderChannels initial="thr_bdgvzaiafa" notices />;
}

export function HeaderNeedsYouChannel() {
  return <ThreadWithHeaderChannels initial="thr_bnjgw7w7hx" notices />;
}

/** Overflow at a narrower window: the active tab stays visible, the rest fold into "N more". */
export function HeaderOverflowNarrow() {
  return <ThreadWithHeaderChannels initial="thr_3x4zf7xx8z" notices width={1000} />;
}

