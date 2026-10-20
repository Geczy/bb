import type { FeatureFlags } from "@bb/domain";
import type { ProviderCliInstallEvent } from "@bb/host-daemon-contract";
import type { TelemetryService } from "./telemetry.js";

type AgentInstallMethod = "native" | "bundled-npm" | "npm";

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
  isBuiltinProvider: () => boolean;
  actionKind: "install" | "update";
  events: readonly ProviderCliInstallEvent[];
}): void {
  if (!args.featureFlags.agentInstallTelemetry) return;
  if (args.actionKind !== "install" || !args.isBuiltinProvider()) return;
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
      properties: { agent: args.providerId, method, outcome },
    });
  }
}
