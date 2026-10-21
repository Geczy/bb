import type {
  FeatureFlags,
  ThreadCreateOrigin,
  ThreadTurnInitiator,
} from "@bb/domain";
import type { WorkOrigin } from "../system/telemetry.js";

const AUTOMATIONS_PLUGIN_ID = "automations";

export function resolveWorkOrigin(args: {
  origin: ThreadCreateOrigin;
  originPluginId: string | null;
  initiator: ThreadTurnInitiator;
}): WorkOrigin {
  if (args.origin === "plugin") {
    return args.originPluginId === AUTOMATIONS_PLUGIN_ID
      ? "automation"
      : "plugin";
  }
  if (args.initiator === "agent") return "agent";
  if (args.initiator === "system") return "system";
  return "person";
}

export function workOriginTelemetryProperty(
  featureFlags: FeatureFlags,
  workOrigin: WorkOrigin,
): { work_origin?: WorkOrigin } {
  return featureFlags.workOriginTelemetry ? { work_origin: workOrigin } : {};
}
