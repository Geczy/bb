import { ClaudeIcon, GrokIcon, OpenAiIcon } from "./icons";
import { ChevronRight } from "./mock-icons";

export type WalkProvider = "claude" | "codex" | "grok";

export type WalkMessage = {
  role: "user" | "agent" | "tool" | "event";
  text: string;
};

export const PROVIDER_LABEL: Record<WalkProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
};

export function ProviderMark({ provider }: { provider: WalkProvider }) {
  if (provider === "claude") return <ClaudeIcon className="pw-prov-ic" />;
  if (provider === "grok") return <GrokIcon className="pw-prov-ic" />;
  return <OpenAiIcon className="pw-prov-ic" />;
}

export function WalkLine({
  message,
  delay,
}: {
  message: WalkMessage;
  delay: number;
}) {
  const style = { animationDelay: `${delay}s` };
  if (message.role === "user") {
    return (
      <div className="msg-user pw-msg" style={style}>
        {message.text}
      </div>
    );
  }
  if (message.role === "tool") {
    return (
      <div className="msg-step pw-msg pw-tool" style={style}>
        <ChevronRight className="step-chev" />
        {message.text}
      </div>
    );
  }
  if (message.role === "event") {
    return (
      <div className="pw-msg pw-event" style={style}>
        {message.text}
      </div>
    );
  }
  return (
    <div className="msg-say pw-msg" style={style}>
      {message.text}
    </div>
  );
}
