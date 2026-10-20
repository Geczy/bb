import { useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import { nativeGuidanceFixture } from "./native-fixture-selection";
import "./native-guidance.css";

const tasks = [
  { title: "Fix the failing composer tests", source: "CI run #1842", detail: "3 failed tests: composer focus, queued reply, and draft recovery." },
  { title: "Keep the draft when reconnecting", source: "composer.tsx:84", detail: "TODO: restore the unsent draft after reconnecting." },
  { title: "Review the new reconnect behavior", source: "Commit d4ef105bc", detail: "Re-resolve the server before reconnecting Browser automation." },
];
const jobs = ["Fix a bug in an existing repo", "Start a new app", "Review a pull request"];

function Source({ label, detail }: { label: string; detail: string }) {
  return <Popover><PopoverTrigger asChild><button className="rounded-sm text-xs text-muted-foreground hover:underline" aria-label={`View source: ${label}`}>{label}</button></PopoverTrigger><PopoverContent side="top" mobileTitle="Source"><p className="text-sm font-medium">{label}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p><p className="mt-2 text-xs text-subtle-foreground">Illustrative fixture</p></PopoverContent></Popover>;
}

export default function NativeGuidanceFixtureSurface({ selection, onDraft }: {
  selection: NonNullable<typeof nativeGuidanceFixture>;
  onDraft?: (text: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { kind } = selection;
  if (dismissed) return null;
  const event = (action: string) => window.dispatchEvent(new CustomEvent("bb:guidance-prototype-action", { detail: { ...selection, action } }));
  const dismiss = () => { setDismissed(true); event("dismiss"); };
  const accept = () => { setAccepted(true); event("accept"); };

  if (kind === "reading") return <div data-guidance-prototype="reading" className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Icon name="Spinner" className="size-3.5 animate-spin" />Reading bb: README · 30 commits · CI</div>;

  if (kind === "suggestions" || kind === "jobs") return <div data-guidance-prototype="suggestions" className="mt-3 flex flex-col">
    {(kind === "jobs" ? jobs.map(title => ({ title, source: null, detail: "" })) : tasks).map(task => <div key={task.title} className="group flex min-h-9 flex-wrap items-center gap-x-1.5 rounded-md px-1">
      <button className="min-h-8 rounded-sm text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onDraft?.(task.title); event("draft"); }}>{task.title}</button>
      {task.source && <><span className="text-xs text-muted-foreground">·</span><Source label={task.source} detail={task.detail} /></>}
      <Icon name="ArrowRight" className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />
    </div>)}
  </div>;

  if (kind === "no-agent") return <div data-guidance-prototype="no-agent" className="mb-3 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3" role="alert"><Icon name="AlertCircle" className="size-5 shrink-0 text-warning" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Sign in to Claude to run this</p><p className="mt-1 text-xs text-muted-foreground">{accepted ? "Waiting for sign-in. Your draft is still here." : "Your draft is kept. You can edit it while you sign in."}</p></div><Button size="sm" onClick={accept}>{accepted ? "Open sign-in" : "Sign in"}</Button></div>;

  if (kind === "hint") return <div data-guidance-prototype="hint" className="guidance-hint flex w-full flex-wrap items-center gap-3 rounded-t-lg border border-border bg-state-hover px-3 py-2.5">
    <Icon name={accepted ? "CircleCheck" : "BellDot"} className="size-4 shrink-0" />
    <span className="min-w-0 flex-1 text-sm">{accepted ? "Notifications on" : "Get notified when this needs you"}</span>
    {!accepted && <><Button size="sm" onClick={accept}>Turn on</Button><Button variant="ghost" size="sm" onClick={dismiss}>Not now</Button></>}
  </div>;

  const day2 = kind === "day2";
  return <div data-guidance-prototype="next-step" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
    <span aria-hidden>↳</span><span>{accepted ? day2 ? "Runs once tomorrow at 9:00" : "Started the 3 related test fixes" : day2 ? "Triage last night's CI failures by 9:00 tomorrow" : "Also fix the 3 related failing tests"}</span>
    {!accepted && !day2 && <><span>·</span><Source label="CI run #1842" detail={tasks[0].detail} /></>}
    <span>·</span><button className="min-h-6 rounded-sm font-medium hover:text-foreground hover:underline" onClick={() => accepted ? setAccepted(false) : accept()}>{accepted ? "Undo" : day2 ? "Schedule" : "Start"}</button>
    {!accepted && <button aria-label="Dismiss suggestion" className="flex size-6 items-center justify-center rounded-sm hover:bg-state-hover" onClick={dismiss}><Icon name="X" className="size-3" /></button>}
  </div>;
}
