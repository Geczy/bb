import type { BbPluginApi } from "@get-bb/plugin-sdk";

type AutomationSignalKind = "automations-changed" | "automation-runs-changed";

export function publishAutomationChange(
  bb: { rpc: Pick<BbPluginApi["rpc"], "experimental_invalidate"> },
  projectId: string,
  kinds: AutomationSignalKind | AutomationSignalKind[],
): void {
  const changed = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  const [first, ...rest] = [
    ...(changed.has("automations-changed")
      ? ["automations", `automations:${projectId}`]
      : []),
    ...(changed.has("automation-runs-changed") ? [`runs:${projectId}`] : []),
  ];
  if (first !== undefined) bb.rpc.experimental_invalidate([first, ...rest]);
}
