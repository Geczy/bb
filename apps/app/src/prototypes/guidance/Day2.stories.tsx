import { useState } from "react";
import { AppToastContent } from "@/components/ui/app-toast";
import { PageShell } from "@/components/ui/page-shell";
import { Composer } from "./composer";
import { Frame, Message } from "./story-frame";
import { InlineConfirmation } from "./inline-confirmation";
import { SuggestionCard } from "./suggestion-card";

export default {
  title: "guidance/Day 2",
  meta: { modelPickerCatalog: { environmentIds: ["env_story_reuse"] } },
};

type Day2State = "offer" | "scheduled" | "result";

const resultTitle = "Overnight CI triage";
const resultText = `**2 flaky tests, 1 real failure.**

I compared last night’s failed runs with their retries. No code was changed.

| Finding | Evidence | What to do |
| --- | --- | --- |
| Composer focus · flaky | Run #1843 passed on retry at the same commit | Track the intermittent focus timeout |
| Queued reply · flaky | Run #1844 passed on retry at the same commit | Track the intermittent queue timeout |
| Draft recovery · real failure | Run #1845 failed on both attempts | Fix the draft cleared during reconnect |

The draft recovery failure reproduces consistently: reconnecting before the draft save completes loses the last edit. Start there.`;

function Day2({ initial }: { initial: Day2State }) {
  const [state, setState] = useState(initial);
  const [dismissed, setDismissed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [notification, setNotification] = useState(initial === "result");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const title = resultOpen ? resultTitle : "Review CI failures";

  function openResult() {
    setResultOpen(true);
    setNotification(false);
    setDraft("");
    setReply("");
  }

  return <Frame
    title={title}
    threadTitle={title}
    empty={false}
    running={false}
    waiting={false}
    threads={[]}
    onNew={() => { window.location.href = "?story=guidance--first-thread-no-project&theme=light"; }}
    onSettings={() => { window.location.href = "?story=guidance--suggestions-on&theme=light"; }}
    onOpenThread={() => {}}
  >
    <PageShell
      contentClassName="gap-6 pt-7"
      footer={<Composer
        newThread={false}
        value={draft}
        onChange={setDraft}
        onSubmit={() => {
          if (!draft.trim()) return;
          setReply(draft);
          setDraft("");
          setDismissed(true);
        }}
        running={false}
        onStop={() => {}}
        focusKey={resultOpen ? 1 : 0}
      />}
    >
      <p className="text-xs text-subtle-foreground">{resultOpen ? "Tuesday, 20 October · 09:00" : "Monday, 19 October · 17:42"}</p>
      <Message user text={resultOpen ? "Triage last night’s CI failures. Separate flaky tests from real failures and tell me what to fix first." : "Check why CI failed today and tell me what needs fixing before I finish for the day."} />
      <Message text={resultOpen ? resultText : "Today’s CI review is complete. The build failure came from a missing fixture; that fix is ready for review.\n\nThe test suite also failed in run #1842. The nightly run will give us another result to compare."} />
      <p className="text-xs text-subtle-foreground">Finished</p>
      {!resultOpen && state === "offer" && !dismissed && <SuggestionCard
        title="Have last night's CI failures triaged by 9:00 tomorrow"
        why="Today’s test failures need a second look. I’ll compare the overnight runs and flag what needs fixing."
        evidence={{
          label: "CI run #1842",
          title: "CI · Run #1842 · Monday, 19 October",
          text: "3 test failures: composer focus, queued reply, draft recovery.\n\nThe next nightly run is at 02:00. Compare its failures with retries to separate flaky tests from real failures.\n\nOne run tomorrow at 09:00 · Europe/Paris. Read and report only; no code changes.",
        }}
        action="Schedule it"
        onAccept={() => setState("scheduled")}
        onDismiss={() => setDismissed(true)}
      />}
      {!resultOpen && state === "scheduled" && <div className="flex flex-wrap items-center gap-2">
        <InlineConfirmation>Runs once tomorrow at 9:00</InlineConfirmation>
        <span className="text-xs text-subtle-foreground">·</span>
        <button className="text-xs text-muted-foreground underline underline-offset-4" onClick={() => setState("offer")}>Undo</button>
        <span className="text-xs text-subtle-foreground">Europe/Paris</span>
      </div>}
      {!resultOpen && initial === "result" && <button onClick={openResult} className="self-start text-sm text-muted-foreground underline underline-offset-4">Open overnight CI triage</button>}
      {reply && <><Message user text={reply} /><InlineConfirmation>Reply sent</InlineConfirmation></>}
    </PageShell>
    {notification && <div className="fixed right-4 top-4 z-50" data-day2-notification>
      <AppToastContent
        title="CI triage is ready: 2 flaky, 1 real failure"
        description="Overnight CI triage · Ready at 09:00"
        tone="message"
        action={{ label: "Open thread", onClick: openResult }}
        onDismiss={() => setNotification(false)}
      />
    </div>}
  </Frame>;
}

export const Day2Offer = () => <Day2 initial="offer" />;
export const Day2Scheduled = () => <Day2 initial="scheduled" />;
export const Day2Result = () => <Day2 initial="result" />;
