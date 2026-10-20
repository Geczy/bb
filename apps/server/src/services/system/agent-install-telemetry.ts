import type { FeatureFlags } from "@bb/domain";
import type { ProviderCliInstallEvent } from "@bb/host-daemon-contract";
import type { TelemetryService } from "./telemetry.js";

type AgentInstallAgent = "claude-code" | "codex" | "pi";
type AgentInstallMethod = "native" | "bundled-npm" | "npm";

const AGENT_BY_PROVIDER_ID: Readonly<Record<string, AgentInstallAgent>> = {
  "claude-code": "claude-code",
  codex: "codex",
  pi: "pi",
};

function installMethod(displayCommand: string): AgentInstallMethod {
  if (/npm-cli\.js/u.test(displayCommand)) return "bundled-npm";
  return /^'?(?:[^'\s]*[\\/])?(?:npm|bun)(?:\.cmd|\.exe)?'?(?:\s|$)/iu.test(
    displayCommand,
  )
    ? "npm"
    : "native";
}

export function captureAgentInstallTelemetry(args: {
  telemetry: TelemetryService;
  featureFlags: FeatureFlags;
  providerId: string;
  actionKind: "install" | "update";
  events: readonly ProviderCliInstallEvent[];
}): void {
  if (!args.featureFlags.agentInstallTelemetry) return;
  if (args.actionKind !== "install") return;
  const agent = AGENT_BY_PROVIDER_ID[args.providerId];
  if (agent === undefined) return;
  const started = args.events.find((event) => event.type === "started");
  if (started === undefined) return;
  const method = installMethod(started.command);
  const succeeded = args.events.some(
    (event) => event.type === "completed" && event.success,
  );
  for (const outcome of [
    "started",
    succeeded ? "succeeded" : "failed",
  ] as const) {
    args.telemetry.capture({
      name: "agent_install",
      properties: { agent, method, outcome },
    });
  }
}
