import { defaultFeatureFlags } from "@bb/domain";
import { describe, expect, it } from "vitest";
import {
  resolveStartedBy,
  startedByTelemetryProperty,
} from "../../src/services/threads/started-by.js";

describe("resolveStartedBy", () => {
  it.each([
    [
      { origin: "plugin", originPluginId: "automations", initiator: "user" },
      "automation",
    ],
    [
      { origin: "plugin", originPluginId: "scheduled-send", initiator: "user" },
      "plugin",
    ],
    [
      { origin: "plugin", originPluginId: "automations", initiator: "agent" },
      "automation",
    ],
    [{ origin: "app", originPluginId: null, initiator: "user" }, "person"],
    [{ origin: "cli", originPluginId: null, initiator: "agent" }, "agent"],
    [{ origin: "sdk", originPluginId: null, initiator: "system" }, "bb"],
    [{ origin: null, originPluginId: null, initiator: "user" }, "person"],
  ] as const)("maps %o to %s", (args, expected) => {
    expect(resolveStartedBy(args)).toBe(expected);
  });
});

describe("startedByTelemetryProperty", () => {
  it("is empty while the flag is off", () => {
    expect(defaultFeatureFlags.startedByTelemetry).toBe(false);
    expect(startedByTelemetryProperty(defaultFeatureFlags, "person")).toEqual(
      {},
    );
  });

  it("sends the fixed value when the flag is on", () => {
    expect(
      startedByTelemetryProperty(
        { ...defaultFeatureFlags, startedByTelemetry: true },
        "automation",
      ),
    ).toEqual({ started_by: "automation" });
  });
});
