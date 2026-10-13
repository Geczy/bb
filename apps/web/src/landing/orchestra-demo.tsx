import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";
import MessageMultiple01Icon from "@hugeicons/core-free-icons/MessageMultiple01Icon";
import SentIcon from "@hugeicons/core-free-icons/SentIcon";
import UserIcon from "@hugeicons/core-free-icons/UserIcon";
import { HugeiconsIcon } from "@hugeicons/react";

import { useCycle } from "./landing-blocks";
import { Spinner } from "./mock-icons";
import {
  PROVIDER_LABEL,
  ProviderMark,
  type WalkProvider,
} from "./agent-thread-mock";

type OrchestraThread = {
  title: string;
  provider: WalkProvider;
  child: boolean;
  startAt: number;
  doneAt: number;
};

type OrchestraEntry =
  | { kind: "user" | "say"; text: string; at: number }
  | {
      kind: "to" | "from";
      target: string;
      text: string;
      at: number;
    }
  | { kind: "group"; count: number; at: number };

export type Orchestra = {
  label: string;
  lead: { title: string; provider: WalkProvider };
  threads: OrchestraThread[];
  feed: OrchestraEntry[];
};

const MESSAGE_LABEL = {
  to: { label: "Message to", icon: SentIcon },
  from: { label: "Message from", icon: BubbleChatIcon },
} as const;

function FeedEntry({ entry }: { entry: OrchestraEntry }) {
  const style = { animationDelay: `${entry.at}s` };
  if (entry.kind === "user") {
    return (
      <div className="msg-user pw-msg" style={style}>
        {entry.text}
      </div>
    );
  }
  if (entry.kind === "say") {
    return (
      <div className="msg-say pw-msg" style={style}>
        {entry.text}
      </div>
    );
  }
  if (entry.kind === "group") {
    return (
      <div className="orch-msg-head orch-group pw-msg" style={style}>
        <HugeiconsIcon icon={MessageMultiple01Icon} className="orch-msg-ic" />
        Agent conversation
        <span className="orch-group-count">{entry.count} messages</span>
      </div>
    );
  }
  const { label, icon } = MESSAGE_LABEL[entry.kind];
  return (
    <div className="orch-msg pw-msg" style={style}>
      <div className="orch-msg-head">
        <HugeiconsIcon icon={icon} className="orch-msg-ic" />
        {label}
        <span className="orch-pill">
          <HugeiconsIcon icon={UserIcon} className="orch-pill-ic" />
          {entry.target}
        </span>
      </div>
      <div className="orch-msg-body">{entry.text}</div>
    </div>
  );
}

function SidebarRow({ thread }: { thread: OrchestraThread }) {
  return (
    <div
      className={thread.child ? "orch-row is-child" : "orch-row"}
      style={{ animationDelay: `${thread.startAt}s` }}
    >
      <ProviderMark provider={thread.provider} />
      <span className="orch-row-body">
        <span className="orch-row-title">{thread.title}</span>
        <span className="orch-row-prov">{PROVIDER_LABEL[thread.provider]}</span>
      </span>
      <span className="orch-row-stat" aria-hidden>
        <span
          className="orch-run"
          style={{ animationDelay: `${thread.doneAt}s` }}
        >
          <Spinner className="orch-spin" />
        </span>
        <span
          className="orch-done"
          style={{ animationDelay: `${thread.doneAt}s` }}
        />
      </span>
    </div>
  );
}

export function OrchestraDemo({ orchestra }: { orchestra: Orchestra }) {
  const last = Math.max(
    ...orchestra.feed.map((entry) => entry.at),
    ...orchestra.threads.map((thread) => thread.doneAt),
  );
  const { cycle, leaving } = useCycle((last + 4) * 1000, 500);
  return (
    <div
      className={leaving ? "orch leaving" : "orch"}
      key={cycle}
      aria-label={orchestra.label}
    >
      <div className="orch-sidebar">
        <div className="orch-sidebar-head">Threads</div>
        {orchestra.threads.map((thread) => (
          <SidebarRow key={thread.title} thread={thread} />
        ))}
      </div>
      <div className="orch-main">
        <div className="pw-window-bar">
          <span className="pw-window-title">{orchestra.lead.title}</span>
          <span className="pw-window-prov">
            <ProviderMark provider={orchestra.lead.provider} />
            {PROVIDER_LABEL[orchestra.lead.provider]}
          </span>
        </div>
        <div className="pw-feed orch-feed">
          {orchestra.feed.map((entry, i) => (
            <FeedEntry key={`${entry.kind}-${i}`} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
