import claudeLogo from "../../../../../plugins/provider-claude-code/icons/claude-code.svg";
import codexLogo from "../../../../../plugins/provider-codex/icons/codex.svg";

const claude = { id: "claude-code", name: "Claude Code", signInName: "Claude", logoUrl: claudeLogo };
const codex = { id: "codex", name: "Codex", signInName: "Codex", logoUrl: codexLogo };

export function guidanceAgentChoices() {
  return /Mac/i.test(navigator.platform) ? [claude, codex] : [codex, claude];
}
