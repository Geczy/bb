import type {
  FeatureFlags,
  ThreadCreateOrigin,
  ThreadTurnInitiator,
} from "@bb/domain";
import type { StartedBy } from "../system/telemetry.js";

const AUTOMATIONS_PLUGIN_ID = "automations";

export function resolveStartedBy(args: {
  origin: ThreadCreateOrigin | null;
  originPluginId: string | null;
  initiator: ThreadTurnInitiator;
}): StartedBy {
  if (args.origin === "plugin") {
    return args.originPluginId === AUTOMATIONS_PLUGIN_ID
      ? "automation"
      : "plugin";
  }
  if (args.initiator === "agent") return "agent";
  if (args.initiator === "system") return "bb";
  return "person";
}

export function startedByTelemetryProperty(
  featureFlags: FeatureFlags,
  startedBy: StartedBy,
): { started_by?: StartedBy } {
  return featureFlags.startedByTelemetry ? { started_by: startedBy } : {};
}
