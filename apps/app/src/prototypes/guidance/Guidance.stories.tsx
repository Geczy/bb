import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Switch } from "@bb/shared-ui/switch";
import { Popover, PopoverAnchor, PopoverContent } from "@bb/shared-ui/popover";
import { Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { PageShell } from "@/components/ui/page-shell";
import { SettingsSection, SettingsWithControl } from "@/components/ui/settings-section";
import { ConversationMessageContent } from "@/components/thread/timeline/ConversationMessageContent";
import { ThreadStatusGlyph } from "@/components/thread/ThreadStatusGlyph";
import { AppToastContent } from "@/components/ui/app-toast";
import { ThreadQrCode } from "../../../../../plugins/connect/guidance-qr.prototype";
import { Composer } from "./composer";
import { InlineConfirmation } from "./inline-confirmation";
import { Hint, SuggestionCard, type Evidence } from "./suggestion-card";

export default { title: "guidance", meta: { modelPickerCatalog: { environmentIds: ["env_story_reuse"] } } };

type Kind = "jobs" | "reading" | "ci" | "todo" | "commit" | "agent" | "parallel" | "recurring" | "connect" | "integration" | "instructions" | "notifications" | "phone" | "attention" | "settings";
type Stage = "suggested" | "accepted" | "installing" | "dismissed" | "denied" | "code" | "landing" | "signed-out" | "off";
const jobs = ["Fix a bug in an existing repo", "Start a new app", "Review a pull request"];
const parallelTasks = ["Fix the composer focus test", "Fix the queued reply test", "Fix the sidebar refresh test"];
const threadUrl = "https://brsbl-bbox--61001.getbb.app/?story=guidance--phone-landing&mode=preview&theme=light";

const suggestions: Partial<Record<Kind, { title: string; why: string; action: string; evidence: Evidence }>> = {
  ci: { title: "Fix the failing composer tests", why: "The latest CI run has 3 failures in the composer suite.", action: "Fix tests", evidence: { label: "CI run #1842", title: "CI · Run #1842", text: "composer.test.tsx · 3 failed, 42 passed\n\nKeeps focus after send — expected textbox to be focused.\nQueues a reply — expected 1 queued message.\nRestores draft — expected previous text.\n\nmain · 12 minutes ago" } },
  todo: { title: "Keep the draft when reconnecting", why: "A TODO in the composer marks a gap in draft recovery.", action: "Keep the draft", evidence: { label: "composer.tsx:84", title: "src/composer.tsx · line 84", text: "TODO: restore the unsent draft after reconnecting.\n\nThe draft is currently cleared when the connection resets.\nFound while reading the repository." } },
  commit: { title: "Review the new reconnect behavior", why: "The latest change touches how browser sessions recover.", action: "Review change", evidence: { label: "Commit d4ef105bc", title: "Reconnect Browser automation to the resolved server", text: "d4ef105bc · #5526\n\nRe-resolve the server before reconnecting Browser automation.\nCheck that an existing page stays reachable after switching servers.\n\nSource: recent repository history." } },
  parallel: { title: "Also fix the 3 related failing tests", why: "They fail independently of the draft fix. I can work on them at the same time.", action: "Fix all 3", evidence: { label: "CI run #1842", title: "Related failures · CI run #1842", text: "Composer focus · failed\nQueued reply · failed\nSidebar refresh · failed\n\nThe draft recovery fix is complete. These three failures are in separate test files." } },
  recurring: { title: "Triage failures each morning?", why: "CI failed 6 times this week on flaky tests.", action: "Run weekday triage", evidence: { label: "6 CI runs this week", title: "CI failures · This week", text: "Mon 09:12 · composer focus\nMon 15:40 · queued reply\nTue 10:03 · sidebar refresh\nWed 08:56 · composer focus\nThu 11:21 · queued reply\nFri 09:04 · composer focus\n\nEach passed on retry with no code change.\nProposed schedule: weekdays at 9:00, Europe/Paris." } },
  connect: { title: "Post this summary to #eng when it’s done", why: "You asked to share release updates with the team. Installs Slack.", action: "Connect Slack", evidence: { label: "Your message", title: "Release summary · Your message", text: "“Summarize the release and share it with #eng when it’s ready.”\n\nSlack isn’t connected to this bb yet." } },
  integration: { title: "Send failing CI runs to your team channel", why: "Build your own connection with run links and failing test names. Starts from Hooks in BB Community.", action: "Build this", evidence: { label: "Your CI request", title: "CI failures · Your message", text: "“Send failed CI runs to our team webhook with run links and failing test names.”\n\nNo existing match handles this exact job. Hooks is the closest community template: it already sends webhooks and stores credentials. Start from its source to build your own plugin." } },
  instructions: { title: "Remember how you like PR descriptions written", why: "You’ve asked for the same format in your last 3 reviews.", action: "Remember this", evidence: { label: "3 review messages", title: "Your PR description preferences", text: "“Lead with the problem and resulting behavior.”\n“Keep it short; include what you checked.”\n“Again, problem first, then behavior and verification.”\n\nProposed instruction: Start with the problem and resulting behavior. Keep descriptions short and include relevant verification." } },
};

function Message({ text, user = false }: { text: string; user?: boolean }) {
  return user ? <ConversationMessageContent role="user" initiator="user" senderThreadId={null} senderThreadTitle={null} senderIsPluginSideChat={false} systemMessageKind="unlabeled" systemMessageSubject={null} text={text} timestamp={0} attachments={null} mentions={[]} turnRequest={{ isGrouped: false, kind: "message", status: "accepted" }} /> : <ConversationMessageContent role="assistant" id="guidance-reply" threadId="guidance-thread" turnId="guidance-turn" text={text} timestamp={0} attachments={null} showActions mobileActionDisplay="inline" streaming={false} />;
}

function Frame({ title, threadTitle, empty, running, waiting, children, onNew, onSettings, threads, onOpenThread }: {
  title: string;
  threadTitle: string;
  empty: boolean;
  running: boolean;
  waiting: boolean;
  children: ReactNode;
  onNew(): void;
  onSettings(): void;
  threads: string[];
  onOpenThread(title: string): void;
}) {
  return <div className="h-dvh bg-background text-foreground" data-guidance-story>
    <SidebarProvider defaultOpen className="h-full">
      <Sidebar>
        <div className="flex h-12 items-center px-4 text-sm font-semibold">bb</div>
        <SidebarContent className="px-2">
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton onClick={onNew} isActive={empty}><Icon name="Plus" /><span>New thread</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
          {!empty && <div className="mt-5">
            <p className="px-2 pb-2 text-xs text-subtle-foreground">bb</p>
            <SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive onClick={() => onOpenThread(threadTitle)}><ThreadStatusGlyph indicator={waiting ? "waiting-for-input" : running ? "runtime" : "none"} /><span className="truncate">{threadTitle}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
            {threads.length > 0 && <SidebarMenu className="ml-3 w-auto border-l border-border pl-2">{threads.map(item => <SidebarMenuItem key={item}><SidebarMenuButton onClick={() => onOpenThread(item)}><ThreadStatusGlyph indicator="runtime" /><span className="truncate">{item}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>}
          </div>}
        </SidebarContent>
        <SidebarFooter className="p-2"><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={onSettings}><Icon name="Settings" /><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <AppPageHeader center={<><SidebarTrigger /><span className="truncate text-sm">{title}</span></>} />
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 md:px-5 md:pt-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  </div>;
}

function Guidance({ kind, initial = "suggested" }: { kind: Kind; initial?: Stage }) {
  const [stage, setStage] = useState(initial);
  const [draft, setDraft] = useState(initial === "signed-out" ? "Review https://github.com/get-bb/bb/pull/5526" : "");
  const [hidden, setHidden] = useState(initial === "dismissed" || initial === "denied");
  const [settings, setSettings] = useState(kind === "settings" || initial === "denied");
  const [enabled, setEnabled] = useState(initial !== "off");
  const [started, setStarted] = useState(kind === "integration" && initial === "accepted" ? "Send failing CI runs to your team channel" : "");
  const [sent, setSent] = useState("");
  const [reading, setReading] = useState(kind === "reading");
  const [stopped, setStopped] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState(true);
  const [queued, setQueued] = useState("");
  const newThread = ["jobs", "reading", "ci", "todo", "commit", "agent"].includes(kind) && !started;
  const running = !stopped && (Boolean(started) || kind === "notifications" || (kind === "parallel" && stage === "accepted"));
  const waiting = (kind === "phone" || kind === "attention") && !sent;
  const threadTitle = started || (newThread ? "New thread" : ["parallel", "recurring"].includes(kind) ? "Fix draft recovery" : kind === "instructions" ? "Review the pull request" : kind === "integration" ? "CI failure alerts" : "Release summary");
  const title = settings ? "Settings" : threadTitle;
  const suggestion = suggestions[kind];
  const threads = kind === "parallel" && stage === "accepted" ? parallelTasks : [];

  useEffect(() => {
    if (!reading) return;
    const timer = setTimeout(() => setReading(false), 30_000);
    return () => clearTimeout(timer);
  }, [reading]);

  useEffect(() => {
    if (stage !== "installing" || initial === "installing") return;
    const timer = setTimeout(() => setStage("accepted"), 1600);
    return () => clearTimeout(timer);
  }, [stage, initial]);

  useEffect(() => {
    if (kind !== "notifications" || stage !== "accepted" || initial === "accepted") return;
    const timer = setTimeout(() => setHidden(true), 3000);
    return () => clearTimeout(timer);
  }, [kind, stage, initial]);

  function start(text: string) { setStarted(text); setDraft(""); setHidden(true); setStopped(false); setSettings(false); }
  function submit() {
    if (!draft.trim()) return;
    if (kind === "agent") { setStage("signed-out"); return; }
    if (newThread) { start(draft); return; }
    if (running) { setQueued(draft); setDraft(""); return; }
    setSent(draft); setDraft(""); setHidden(true);
  }
  function accept() {
    if (!suggestion) return;
    if (["ci", "todo", "commit", "integration"].includes(kind)) { start(suggestion.title); return; }
    setStage(kind === "connect" ? "installing" : "accepted");
  }
  function undo() { setStage("suggested"); setHidden(false); }

  let hint: ReactNode = null;
  if (!hidden && enabled && !settings) {
    if (reading) hint = <Hint action="Stop reading" onAction={() => setReading(false)} onDismiss={() => setReading(false)}>Reading bb: README · 30 commits · CI</Hint>;
    if (kind === "agent" && stage === "signed-out") hint = <Popover open={authOpen} onOpenChange={setAuthOpen}><PopoverAnchor asChild><div><Hint action="Sign in" onAction={() => setAuthOpen(true)} onDismiss={() => setHidden(true)}>Sign in to Claude to run this</Hint></div></PopoverAnchor><PopoverContent side="top" mobileTitle="Sign in to Claude"><p className="text-sm font-medium">Sign in to Claude</p><p className="mt-2 text-xs text-muted-foreground">Continue in your browser, then return to send your draft.</p><p className="mt-2 text-xs text-subtle-foreground">Sign-in handoff preview. Your draft stays here.</p></PopoverContent></Popover>;
    if (kind === "notifications") hint = stage === "accepted" ? <div className="mb-2 px-1"><InlineConfirmation>Notifications on</InlineConfirmation></div> : <Hint action="Turn on" onAction={() => setStage("accepted")} onDismiss={() => setHidden(true)}>Get notified when this needs you</Hint>;
    if (kind === "phone" && stage !== "landing") hint = <Popover open={stage === "code"} onOpenChange={open => setStage(open ? "code" : "suggested")}><PopoverAnchor asChild><div><Hint action="Show code" onAction={() => setStage("code")} onDismiss={() => { setHidden(true); setStage("dismissed"); }}>Answer this from your phone</Hint></div></PopoverAnchor><PopoverContent side="top" align="start" className="w-56" mobileTitle="Open this thread"><ThreadQrCode url={threadUrl} /><p className="mt-3 text-center text-xs text-muted-foreground">Scan to open this thread</p><a className="mt-2 block text-center text-xs underline underline-offset-4" href={threadUrl}>Open Release summary</a></PopoverContent></Popover>;
  }

  const composer = <div>{hint}{queued && <div className="mb-2 flex items-center gap-3 px-1 text-xs text-muted-foreground"><Icon name="Clock" className="size-3.5" /><span className="min-w-0 flex-1 truncate">Queued: {queued}</span><button onClick={() => { setDraft(queued); setQueued(""); }}>Edit</button><button onClick={() => setQueued("")}>Remove</button></div>}<Composer autoFocus={initial !== "code" && initial !== "landing"} noProject={kind === "jobs" || kind === "agent"} claude={kind === "agent"} newThread={Boolean(newThread)} value={draft} onChange={setDraft} onSubmit={submit} running={running} onStop={() => setStopped(true)} focusKey={0} /></div>;

  return <Frame title={title} threadTitle={threadTitle} empty={Boolean(newThread) || kind === "settings"} running={running} waiting={waiting} threads={threads} onOpenThread={start} onSettings={() => setSettings(true)} onNew={() => { window.location.href = "?story=guidance--first-thread-no-project&mode=preview"; }}>
    {settings ? <PageShell contentClassName="gap-6 pt-8">
      <SettingsSection title="Guidance"><SettingsWithControl label="Suggestions" description="Show useful next steps and hints while you work."><Switch aria-label="Suggestions" checked={enabled} onCheckedChange={setEnabled} /></SettingsWithControl></SettingsSection>
      {stage === "denied" && <SettingsSection title="Notifications"><p className="text-sm">Notifications are blocked in your browser.</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Open this site’s browser settings and allow notifications, then reload bb.</p></SettingsSection>}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => { setSettings(false); setHidden(!enabled || initial === "dismissed" || initial === "denied"); }}>Back to thread</Button>
    </PageShell> : newThread ? <PageShell contentClassName="justify-center gap-5 min-h-full pb-12">
      <h1 className="text-xl font-medium">What would you like to do?</h1>
      {(kind === "jobs" || (kind === "agent" && stage !== "signed-out")) && <div className="flex flex-col items-start gap-1">{jobs.map((job, index) => <Button key={job} variant="ghost" className="h-auto py-2 text-sm font-normal" onClick={() => setDraft(index === 0 ? "Help me fix a bug in " : index === 1 ? "Help me build " : "Review https://github.com/get-bb/bb/pull/")}><Icon name={index === 0 ? "Bug" : index === 1 ? "Plus" : "GitPullRequest"} className="mr-2 size-4 text-muted-foreground" />{job}</Button>)}</div>}
      {suggestion && !hidden && enabled && <SuggestionCard {...suggestion} onAccept={accept} onDismiss={() => setHidden(true)} />}
      {composer}
    </PageShell> : <PageShell contentClassName="gap-6 pt-7" footer={composer}>
      <Message user text={started || (kind === "integration" ? "Send failed CI runs to our team webhook with run links and failing test names." : waiting ? "Summarize the release and share it with #eng when it’s ready." : kind === "instructions" ? "Review this PR. Keep the description short: problem, resulting behavior, and what you checked." : ["parallel", "recurring"].includes(kind) ? "Fix the draft getting lost when I reconnect." : "Summarize the release and share it with #eng when it’s ready.")} />
      <Message text={started && kind === "integration" ? "I’m starting from Hooks in BB Community to build your own plugin. I’ll add CI failure filtering, run links, and failing test names, then show you the result before connecting your channel." : started ? "I’ll read the relevant files and work through this. I’ll ask if I need a decision from you." : waiting ? "The release summary is ready. One change needs your decision before I share it.\n\nShould I include the draft recovery fix in this release, or hold it for the next one?" : kind === "notifications" ? "I’m checking the merged pull requests against the release notes. There are 18 changes to review; I’ll flag anything that needs your input." : kind === "integration" ? "There isn’t an existing connection for this exact job. Hooks already handles webhooks and credentials; I can use its source as a starting point." : kind === "instructions" ? "The PR description now leads with the problem and resulting behavior, followed by the checks. It’s ready for review." : ["parallel", "recurring"].includes(kind) ? "The unsent draft now survives a reconnect. The change is ready for review.\n\nI also found three independent test failures in the latest CI run." : "The release summary is ready.\n\n- Drafts survive a reconnect.\n- Approval requests are clearer.\n- Thread search is faster.\n\nThe summary is ready to share with #eng."} />
      <div className="flex items-center gap-2 text-xs text-subtle-foreground"><ThreadStatusGlyph indicator={waiting ? "waiting-for-input" : running ? "runtime" : "none"} />{waiting ? "Needs your input" : running ? "Working…" : "Finished"}</div>
      {sent && <><Message user text={sent} /><InlineConfirmation>Reply sent</InlineConfirmation></>}
      {suggestion && !hidden && enabled && stage === "suggested" && <SuggestionCard {...suggestion} onAccept={accept} onDismiss={() => { setHidden(true); setStage("dismissed"); }} />}
      {kind === "parallel" && stage === "accepted" && !started && <div className="border-l border-border pl-4"><p className="mb-2 text-xs text-subtle-foreground">Running under this thread</p>{parallelTasks.map(task => <button key={task} onClick={() => start(task)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-state-hover"><ThreadStatusGlyph indicator="runtime" /><span>{task}</span><Icon name="ChevronRight" className="ml-auto size-3.5 text-subtle-foreground" /></button>)}</div>}
      {!started && stage === "installing" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon name="Loading" className="size-3.5 animate-spin" />Installing Slack…</div>}
      {!started && stage === "accepted" && ["recurring", "connect", "instructions"].includes(kind) && <div className="flex items-center gap-2"><InlineConfirmation>{kind === "recurring" ? "Runs weekdays at 9:00" : kind === "connect" ? "Slack installed" : "Saved"}</InlineConfirmation><span className="text-xs text-subtle-foreground">·</span><button onClick={undo} className="text-xs text-muted-foreground underline underline-offset-4">Undo</button>{kind === "recurring" && <span className="text-xs text-subtle-foreground">Europe/Paris</span>}</div>}
    </PageShell>}
    {kind === "attention" && notice && <div className="fixed right-4 top-4 z-50" data-attention><AppToastContent title="Release summary needs your input" description="Include the draft recovery fix in this release?" tone="message" action={{ label: "Open thread", onClick: () => { setNotice(false); setSettings(false); } }} onDismiss={() => setNotice(false)} /></div>}
  </Frame>;
}

export const FirstThreadNoProject = () => <Guidance kind="jobs" />;
export const FirstThreadReadingRepo = () => <Guidance kind="reading" />;
export const FirstThreadGroundedCi = () => <Guidance kind="ci" />;
export const FirstThreadGroundedTodo = () => <Guidance kind="todo" />;
export const FirstThreadGroundedCommit = () => <Guidance kind="commit" />;
export const FirstThreadAgentNotReady = () => <Guidance kind="agent" />;
export const FirstThreadSignIn = () => <Guidance kind="agent" initial="signed-out" />;
export const NextStepParallel = () => <Guidance kind="parallel" />;
export const ParallelRunning = () => <Guidance kind="parallel" initial="accepted" />;
export const NextStepRecurring = () => <Guidance kind="recurring" />;
export const RecurringAccepted = () => <Guidance kind="recurring" initial="accepted" />;
export const NextStepConnectTool = () => <Guidance kind="connect" />;
export const ToolInstalling = () => <Guidance kind="connect" initial="installing" />;
export const ToolConnected = () => <Guidance kind="connect" initial="accepted" />;
export const NextStepBuildIntegration = () => <Guidance kind="integration" />;
export const IntegrationBuilding = () => <Guidance kind="integration" initial="accepted" />;
export const NextStepReuseInstructions = () => <Guidance kind="instructions" />;
export const InstructionsSaved = () => <Guidance kind="instructions" initial="accepted" />;
export const NotificationsHint = () => <Guidance kind="notifications" />;
export const NotificationsGranted = () => <Guidance kind="notifications" initial="accepted" />;
export const NotificationsDenied = () => <Guidance kind="notifications" initial="denied" />;
export const PhoneHint = () => <Guidance kind="phone" />;
export const PhoneCode = () => <Guidance kind="phone" initial="code" />;
export const PhoneLanding = () => <Guidance kind="phone" initial="landing" />;
export const AttentionNeedsInput = () => <Guidance kind="attention" />;
export const Dismissed = () => <Guidance kind="parallel" initial="dismissed" />;
export const SuggestionsOn = () => <Guidance kind="settings" />;
export const SuggestionsOff = () => <Guidance kind="settings" initial="off" />;
