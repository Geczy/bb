import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import { nativeGuidanceFixture } from "./native-fixture-selection";
import { guidanceAgentChoices } from "./native-agent-fixture";
import "./native-guidance.css";

const tasks = [
  { title: "Fix the failing composer tests", source: "CI run #1842", detail: "3 failed tests: composer focus, queued reply, and draft recovery." },
  { title: "Keep the draft when reconnecting", source: "composer.tsx:84", detail: "TODO: restore the unsent draft after reconnecting." },
];
const jobs = ["Fix a bug in an existing repo", "Start a new app"];

function Source({ label, detail }: { label: string; detail: string }) {
  return <Popover>
    <PopoverTrigger asChild><button className="rounded-sm text-xs text-muted-foreground hover:underline" aria-label={`View source: ${label}`}>{label}</button></PopoverTrigger>
    <PopoverContent side="top" mobileTitle="Source">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      <p className="mt-2 text-xs text-subtle-foreground">Illustrative fixture</p>
    </PopoverContent>
  </Popover>;
}

export default function NativeGuidanceFixtureSurface({ selection, onDraft }: {
  selection: NonNullable<typeof nativeGuidanceFixture>;
  onDraft?: (text: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [agent, setAgent] = useState(() => guidanceAgentChoices()[0]);
  const [showAgents, setShowAgents] = useState(false);
  const { kind } = selection;
  if (dismissed) return null;
  const event = (action: string) => window.dispatchEvent(new CustomEvent("bb:guidance-prototype-action", { detail: { ...selection, action } }));
  const dismiss = () => { setDismissed(true); event("dismiss"); };
  const accept = () => { setAccepted(true); event("accept"); };
  const draft = (text: string) => { onDraft?.(text); event("draft"); };

  if (kind === "reading") return <div data-guidance-prototype="reading" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
    <Icon name="Spinner" className="size-4 animate-spin" />Finding a good first task in bb…
  </div>;

  if (kind === "suggestions" || kind === "jobs") return <div data-guidance-prototype="suggestions" className="mt-4 flex flex-col gap-3">
    {(kind === "jobs" ? jobs.map(title => ({ title, source: null, detail: "" })) : tasks).map((task, index) => <div key={task.title} className="group px-1 py-1">
      <button
        className={`flex min-h-11 w-full items-center gap-4 rounded-sm text-left text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === 0 ? "font-semibold" : "font-normal"}`}
        onClick={() => draft(task.title)}
      >
        <span className="min-w-0 flex-1">{task.title}</span>
        {index === 0 ? <span className="flex items-center gap-1.5 text-sm font-semibold">Start<Icon name="ArrowRight" className="size-4" /></span> : <Icon name="ArrowRight" className="size-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />}
      </button>
      {task.source && <Source label={task.source} detail={task.detail} />}
    </div>)}
    {kind === "jobs" && <button className="self-start rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => draft("Review a pull request")}>Review a pull request</button>}
  </div>;

  if (kind === "no-agent") return <div data-guidance-prototype="no-agent" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4" role="alert">
    <div className="flex flex-wrap items-center gap-3">
      <Icon name="AlertCircle" className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{accepted ? "Waiting for sign-in. Your draft is kept." : "Your draft is kept."}</p></div>
      <Button onClick={accept}>{`Sign in to ${agent.signInName}`}</Button>
    </div>
    <button className="mt-2 rounded-sm text-xs text-muted-foreground hover:text-foreground" aria-expanded={showAgents} onClick={() => setShowAgents(!showAgents)}>Use another agent</button>
    {showAgents && <div className="mt-2 flex gap-4">{guidanceAgentChoices().filter(choice => choice.id !== agent.id).map(choice => <button key={choice.id} className="rounded-sm text-xs text-muted-foreground hover:text-foreground" onClick={() => { setAgent(choice); setAccepted(false); setShowAgents(false); }}>{choice.name}</button>)}</div>}
  </div>;

  if (kind === "hint") return <div data-guidance-prototype="hint" className="guidance-hint flex w-full flex-wrap items-center gap-3 rounded-t-lg border border-border bg-state-hover px-3 py-2.5">
    <Icon name={accepted ? "CircleCheck" : "BellDot"} className="size-4 shrink-0" />
    <span className="min-w-0 flex-1 text-sm">{accepted ? "Notifications on" : "Get notified when this needs you"}</span>
    {!accepted && <><Button size="sm" onClick={accept}>Turn on</Button><button className="min-h-8 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground" onClick={dismiss}>Not now</button></>}
  </div>;

  if (kind === "plugin-install" || kind === "plugin-build") {
    const install = kind === "plugin-install";
    return <div data-guidance-prototype="plugin-next-step" className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
      <span className="pt-1.5" aria-hidden>↳</span>
      <div className="min-w-0 flex-1 pt-1.5">
        <p>{install ? "Post this summary to #eng" : "Send failing CI runs to your team channel"}<span className="text-xs"> · {install ? "Slack (BB Community)" : "Start from Hooks"}</span></p>
        {install && <p className="mt-1 text-xs text-subtle-foreground">By Maya Chen · Reviewed</p>}
        {accepted && <p className="mt-1 text-xs" role="status">Preview only. {install ? "Nothing installed." : "No build started."}</p>}
      </div>
      <Button size="sm" onClick={accept}>{install ? "Install" : "Build it"}</Button>
      <button aria-label="Dismiss suggestion" className="flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-state-hover" onClick={dismiss}><Icon name="X" className="size-3" /></button>
    </div>;
  }

  const day2 = kind === "day2";
  return <div data-guidance-prototype="next-step" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
    <span aria-hidden>↳</span>
    <span className="min-w-0 flex-1">{accepted ? day2 ? "Runs once tomorrow at 9:00" : "Started the 3 related test fixes" : day2 ? "Triage last night's CI failures by 9:00 tomorrow" : "Also fix the 3 related failing tests"}</span>
    {!accepted && !day2 && <Source label="CI run #1842" detail={tasks[0].detail} />}
    {accepted ? <button className="min-h-8 rounded-sm text-xs hover:text-foreground hover:underline" onClick={() => setAccepted(false)}>Undo</button> : <>
      <Button size="sm" onClick={accept}>{day2 ? "Schedule" : "Start"}</Button>
      <button aria-label="Dismiss suggestion" className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-state-hover" onClick={dismiss}><Icon name="X" className="size-3" /></button>
    </>}
  </div>;
}
