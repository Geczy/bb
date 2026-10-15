import { useMemo, useState } from "react";
import type { PermissionMode, PromptTextMention } from "@bb/domain";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { PromptBoxInternal } from "@/components/promptbox/PromptBoxInternal";
import { NewThreadPromptBoxUI } from "@/components/promptbox/NewThreadPromptBox";
import { ExecutionControls } from "@/components/promptbox/ExecutionControls";
import { ConversationMessageContent } from "@/components/thread/timeline/ConversationMessageContent";
import { HOST_IDS, STORY_PROJECTS, STORY_PROJECT_SOURCES, STORY_WORKTREE_OPTIONS, makeHost, useInteractiveExecutionControls, makeAttachmentsConfig, makeExecutionControlsProps, makeTypeaheadConfig } from "../../../.ladle/story-fixtures";
import { withCreateAutomationPrompt } from "../../../../../plugins/automations/composer";
import { MobilePairingCard } from "../../../../../plugins/connect/retention-pairing.prototype";
import { SidebarNudge } from "./sidebar-nudge";
import { InlineConfirmation } from "./inline-confirmation";
import { SuggestionCard, SuggestionTile } from "./suggestion-card";
import { TipsGallery, TipsHiddenNotice } from "./tips-gallery";
import { PluginBrowseCard, PluginCatalogIconChip, PluginCatalogInstallControl } from "./plugin-catalog-card";
import { childTip, queueTip, pluginTip, type TipView } from "./tip-fixtures";

export default { title: "Retention", meta: { modelPickerCatalog: { environmentIds: ["env_story_reuse"] } } };

type Moment = "automation" | "notifications" | "phone" | "reply" | "running" | "new-thread";

function Composer({ value, onChange, onSubmit, running, onStop, focusKey, newThread }: {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  running: boolean;
  onStop(): void;
  focusKey: number;
  newThread: boolean;
}) {
  const [mentions, setMentions] = useState<PromptTextMention[]>([]);
  const typeahead = useMemo(() => makeTypeaheadConfig(), []);
  const attachments = useMemo(() => makeAttachmentsConfig(), []);
  const execution = useInteractiveExecutionControls(makeExecutionControlsProps());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [worktree, setWorktree] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionMode>("auto");
  if (newThread) return <NewThreadPromptBoxUI
    id="retention-new-thread-composer"
    value={value}
    mentionRanges={mentions}
    onChange={(next, ranges) => { onChange(next); setMentions(ranges); }}
    onSubmit={onSubmit}
    isSubmitting={false}
    disabled={false}
    history={{ currentDraft: { text: value, mentions, attachments: [] }, entries: [], onSelectEntry: entry => onChange(entry.text) }}
    typeahead={typeahead}
    attachments={attachments}
    mentionMenuPlacement="top"
    project={{ projects: STORY_PROJECTS, value: projectId, onChange: setProjectId }}
    modeConfig={{
      environment: { value: `host:${HOST_IDS.local}:local`, sources: STORY_PROJECT_SOURCES, host: makeHost({ id: HOST_IDS.local }), isLocal: true },
      worktree: { options: STORY_WORKTREE_OPTIONS, value: worktree, onChange: setWorktree },
      permission: { value: permission, supported: true, onChange: setPermission, options: [{ value: "accept-edits", label: "Accept Edits" }, { value: "auto", label: "Approve for me" }, { value: "full", label: "Full Access", tone: "warning" }] },
    }}
    execution={execution}
  />;
  return <PromptBoxInternal
    id="retention-composer"
    value={value}
    mentionRanges={mentions}
    onChange={(next, ranges) => { onChange(next); setMentions(ranges); }}
    onSubmit={onSubmit}
    placeholder={running ? "Add a follow-up…" : "What would you like to do next?"}
    typeahead={typeahead}
    attachments={attachments}
    mentionMenuPlacement="top"
    footerStart={<ExecutionControls {...execution} />}
    focusEndKey={focusKey}
    submission={{ isRunning: running, onStop, label: running ? "Queue follow-up" : "Send", title: running ? "Queue follow-up" : "Send", swapSubmitActions: running, onModifierSubmit: running ? onSubmit : undefined }}
    suppressPluginComposerCustomizations
  />;
}

function AssistantMessage({ children }: { children: string }) {
  return <ConversationMessageContent role="assistant" id="retention-reply" threadId="retention-thread" turnId="retention-turn" text={children} timestamp={0} attachments={null} showActions mobileActionDisplay="inline" streaming={false} />;
}

function Prototype({ moment, control = false }: { moment: Moment; control?: boolean }) {
  const [draft, setDraft] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [result, setResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<"pair" | "web" | "plugin" | null>(null);
  const [installed, setInstalled] = useState(false);
  const [running, setRunning] = useState(moment === "running");
  const [sent, setSent] = useState<string[]>([]);
  const [queued, setQueued] = useState<string | null>(null);
  const [pairExpiry, setPairExpiry] = useState(() => Date.now() + 300_000);
  const [notificationChoice, setNotificationChoice] = useState(false);
  const [previewTip, setPreviewTip] = useState<string | null>(null);
  const newThread = moment === "new-thread";
  const tip = moment === "reply" ? childTip : moment === "running" ? queueTip : pluginTip;
  const isH2 = moment === "reply" || moment === "running" || newThread;
  const h1Visible = !control && !hidden && !isH2;
  function fill(text: string) { setDraft(current => current.trim() ? `${current}\n\n${text}` : text); setFocusKey(n => n + 1); }
  function activate(t: TipView) {
    if (t.id === "browse-plugins") { setPanel("plugin"); return; }
    fill(t.action.prompt);
    setResult({ id: t.id, ok: true, text: "Added to the composer" });
  }
  function submit() {
    if (!draft.trim()) return;
    if (running) setQueued(draft);
    else setSent(current => [...current, draft]);
    setDraft("");
  }
  const nudge = h1Visible && moment === "notifications" ? <SidebarNudge
    icon={<Icon name="BellDot" className="size-4" />}
    action={notificationChoice ? undefined : { label: "Notify me", onAction: () => setNotificationChoice(true) }}
    onDismiss={() => setHidden(true)} dismissLabel="Not now"
  >{notificationChoice ? <InlineConfirmation>Notifications on</InlineConfirmation> : "Tell me when a thread needs me, even when I’m in another tab."}</SidebarNudge> : null;
  return <div className="flex h-screen flex-col bg-background text-foreground" data-retention-story={moment}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
      <span>Prototype · {control ? "Control" : "Treatment"} · {newThread ? "New thread" : moment === "running" ? "Turn running" : moment === "reply" ? "First reply" : "First thread finished"}</span>
      <span className="hidden sm:inline">Local interactions only</span>
    </div>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar p-3 md:flex">
        <div className="px-3 py-3 text-lg font-semibold">bb</div>
        <div className="px-3 py-4 text-xs text-subtle-foreground">Release workspace</div>
        <div className="flex items-center gap-2 rounded-lg bg-state-hover px-3 py-2 text-sm"><Icon name={newThread ? "Plus" : "MessageSquare"} className="size-4" /><span>{newThread ? "New thread" : "Weekly release summary"}</span></div>
        <div className="flex-1" />
        {nudge}
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4 text-sm font-medium">{newThread ? "New thread" : "Weekly release summary"}</header>
        <div className={`mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 ${newThread ? "pt-16" : "pt-8"}`}>
          {!newThread && <>
            <ConversationMessageContent role="user" initiator="user" senderThreadId={null} senderThreadTitle={null} senderIsPluginSideChat={false} systemMessageKind="unlabeled" systemMessageSubject={null} text="Summarize this week’s merged pull requests. Flag anything we should check before the release." timestamp={0} attachments={null} mentions={[]} turnRequest={{ isGrouped: false, kind: "message", status: "accepted" }} />
            <AssistantMessage>{moment === "reply" ? "I’ll group the changes by what users will notice, then check the release notes against the merged pull requests." : moment === "running" ? "The release summary is drafted. I’m checking the remaining pull requests for missing notes and rollout risks." : "The release summary is ready.\n\n- **Shipped:** faster thread search and clearer approval requests.\n- **Check before release:** one database migration needs a rollback note.\n- **Next step:** confirm the migration owner, then share the summary with the team."}</AssistantMessage>
            <div className="flex items-center gap-2 text-xs text-subtle-foreground"><Icon name={running ? "Spinner" : "CircleCheck"} className={`size-3.5 ${running ? "animate-spin" : ""}`} />{running ? "Checking merged pull requests…" : moment === "reply" ? "First reply" : "Finished"}</div>
          </>}
          {sent.map((text, index) => <div key={index} className="space-y-3 rounded-lg border border-border p-4"><p className="text-sm whitespace-pre-wrap">{text}</p><InlineConfirmation>Request sent in this preview</InlineConfirmation></div>)}
          {h1Visible && moment === "automation" && <SuggestionCard leading={<SuggestionTile><Icon name="Repeat" className="size-4" /></SuggestionTile>} title="Have this ready tomorrow" description="Turn this release check into a scheduled run." trailing={<Icon name="ChevronRight" className="size-4" />} onSelect={() => { fill(withCreateAutomationPrompt({ text: "summarize merged pull requests and flag release risks every weekday at 9am. Ask me which timezone to use before saving.", mentions: [], attachments: [] }).text); setResult({ id: "automation", ok: true, text: "Schedule request added below" }); }} meta={result?.id === "automation" ? <InlineConfirmation>{result.text}</InlineConfirmation> : undefined} />}
          {h1Visible && moment === "phone" && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-medium">Keep this thread with you</h2><p className="mt-1 text-xs text-muted-foreground">Read the result or reply from your phone.</p></div><Button variant="ghost" size="icon" aria-label="Not now" onClick={() => setHidden(true)}><Icon name="X" className="size-4" /></Button></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setPanel("pair")}>Pair mobile app</Button><Button size="sm" variant="outline" onClick={() => setPanel("web")}>Use phone browser</Button></div>
            {panel === "pair" && <><MobilePairingCard payload={{ code: "DEMO-ONLY", serverUrl: "https://preview.invalid", apex: "https://preview.invalid", expiresAt: pairExpiry }} dashboardHost="getbb.app" minting={false} onRenew={() => setPairExpiry(Date.now() + 300_000)} /><p className="text-xs text-subtle-foreground">Preview code · does not pair a device.</p></>}
            {panel === "web" && <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-sm">Open your bb web address on your phone.</p><p className="break-all font-mono text-xs">https://your-bb.getbb.app</p><p className="text-xs text-subtle-foreground">Sign in with the same account to continue this thread. This preview uses an example address.</p><Button size="sm" variant="outline" onClick={() => setResult({ id: "phone", ok: true, text: "This thread would open on your phone" })}>Preview arrival</Button>{result?.id === "phone" && <InlineConfirmation>{result.text}</InlineConfirmation>}</div>}
          </section>}
          <div className="md:hidden">{nudge}</div>
          {queued && <div className="space-y-2 rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Queued follow-up</p><p className="text-sm">{queued}</p><Button size="sm" variant="ghost" onClick={() => { setDraft(queued); setQueued(null); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setQueued(null)}>Remove</Button></div>}
          <Composer newThread={newThread} value={draft} onChange={setDraft} onSubmit={submit} running={running} onStop={() => setRunning(false)} focusKey={focusKey} />
          {!control && isH2 && (hidden ? <TipsHiddenNotice onUndo={() => setHidden(false)} /> : <div className="[&>div]:mt-0"><TipsGallery tips={[tip]} result={result} onPreview={setPreviewTip} onActivate={activate} onDismiss={() => setHidden(true)} /><span className="sr-only" aria-live="polite">{previewTip ? tip.action.label : ""}</span></div>)}
          {panel === "plugin" && <section className="space-y-3"><PluginBrowseCard title="Browser Automation" description="Let an agent open pages, use forms, and check your work in a browser." leading={<PluginCatalogIconChip compact entry={{ icon: "Globe", iconUrl: null, iconTinted: false }} />} byline="By bb" openLabel="About Browser Automation" onOpen={() => setResult({ id: "plugin", ok: true, text: "Adds browser tools to your agents. Browser sessions are started when you ask." })} footerAction={<PluginCatalogInstallControl displayName="Browser Automation" showLabel {...(installed ? { installed: true, included: false, onUninstall: () => setInstalled(false) } : { installed: false, disabled: false, onInstall: () => setInstalled(true) })} />} />{result?.id === "plugin" && <p className="text-xs text-muted-foreground">{result.text}</p>}{installed && <InlineConfirmation>Installed in this preview</InlineConfirmation>}</section>}
          {running && <Button className="self-start" size="sm" variant="ghost" onClick={() => { setRunning(false); if (queued) { setSent(current => [...current, queued]); setQueued(null); } }}>Preview turn finishing</Button>}
        </div>
      </main>
    </div>
  </div>;
}

export const H1aAutomation = () => <Prototype moment="automation" />;
export const H1aControl = () => <Prototype moment="automation" control />;
export const H1bNotifications = () => <Prototype moment="notifications" />;
export const H1bControl = () => <Prototype moment="notifications" control />;
export const H1cPhone = () => <Prototype moment="phone" />;
export const H1cControl = () => <Prototype moment="phone" control />;
export const H2FirstReply = () => <Prototype moment="reply" />;
export const H2FirstReplyControl = () => <Prototype moment="reply" control />;
export const H2Running = () => <Prototype moment="running" />;
export const H2RunningControl = () => <Prototype moment="running" control />;
export const H2NewThread = () => <Prototype moment="new-thread" />;
export const H2NewThreadControl = () => <Prototype moment="new-thread" control />;
