import { defaultFeatureFlags } from "@bb/domain";
import type { ProviderCliInstallEvent } from "@bb/host-daemon-contract";
import { describe, expect, it, vi } from "vitest";
import { captureAgentInstallTelemetry } from "../../src/services/system/agent-install-telemetry.js";
import type { TelemetryService } from "../../src/services/system/telemetry.js";

function installEvents(
  provider: string,
  command: string,
  success: boolean,
): ProviderCliInstallEvent[] {
  return [
    { type: "started", provider, command },
    { type: "output", provider, stream: "stdout", text: "C:\\Users\\me\n" },
    {
      type: "completed",
      provider,
      exitCode: success ? 0 : 1,
      signal: null,
      success,
    },
  ];
}

function capture(args: {
  enabled: boolean;
  providerId: string;
  actionKind?: "install" | "update";
  events: ProviderCliInstallEvent[];
}) {
  const spy = vi.fn<TelemetryService["capture"]>();
  captureAgentInstallTelemetry({
    telemetry: { capture: spy, setEnabled: () => {} },
    featureFlags: {
      ...defaultFeatureFlags,
      agentInstallTelemetry: args.enabled,
    },
    providerId: args.providerId,
    actionKind: args.actionKind ?? "install",
    events: args.events,
  });
  return spy.mock.calls.map(([event]) => event);
}

describe("agent_install telemetry", () => {
  it("is off by default and sends nothing", () => {
    expect(defaultFeatureFlags.agentInstallTelemetry).toBe(false);
    expect(
      capture({
        enabled: defaultFeatureFlags.agentInstallTelemetry,
        providerId: "pi",
        events: installEvents("pi", "npm install -g pkg@latest", true),
      }),
    ).toEqual([]);
  });

  it("sends only enum properties for each install method when switched on", () => {
    expect(
      capture({
        enabled: true,
        providerId: "pi",
        events: installEvents(
          "pi",
          "'C:\\Program Files\\bb\\bb.exe' 'C:\\Program Files\\bb\\resources\\node_modules\\npm\\bin\\npm-cli.js' install --global",
          false,
        ),
      }),
    ).toEqual([
      {
        name: "agent_install",
        properties: { agent: "pi", method: "bundled-npm", outcome: "started" },
      },
      {
        name: "agent_install",
        properties: { agent: "pi", method: "bundled-npm", outcome: "failed" },
      },
    ]);
    expect(
      capture({
        enabled: true,
        providerId: "pi",
        events: installEvents("pi", "npm.cmd install -g pkg@latest", true),
      }),
    ).toContainEqual({
      name: "agent_install",
      properties: { agent: "pi", method: "npm", outcome: "succeeded" },
    });
    expect(
      capture({
        enabled: true,
        providerId: "codex",
        events: installEvents("codex", "sh -c 'curl -fsSL x | sh'", true),
      }),
    ).toContainEqual({
      name: "agent_install",
      properties: { agent: "codex", method: "native", outcome: "succeeded" },
    });
  });

  it("ignores updates and providers outside the enum", () => {
    expect(
      capture({
        enabled: true,
        providerId: "pi",
        actionKind: "update",
        events: installEvents("pi", "npm install -g pkg@latest", true),
      }),
    ).toEqual([]);
    expect(
      capture({
        enabled: true,
        providerId: "custom-acp",
        events: installEvents("custom-acp", "npm install -g x", true),
      }),
    ).toEqual([]);
  });
});
