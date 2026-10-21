import { defaultFeatureFlags } from "@bb/domain";
import { describe, expect, it } from "vitest";
import {
  resolveWorkOrigin,
  workOriginTelemetryProperty,
} from "../../src/services/threads/work-origin.js";

describe("resolveWorkOrigin", () => {
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
    [{ origin: "sdk", originPluginId: null, initiator: "system" }, "system"],
  ] as const)("maps %o to %s", (args, expected) => {
    expect(resolveWorkOrigin(args)).toBe(expected);
  });
});

describe("workOriginTelemetryProperty", () => {
  it("is empty while the flag is off", () => {
    expect(defaultFeatureFlags.workOriginTelemetry).toBe(false);
    expect(workOriginTelemetryProperty(defaultFeatureFlags, "person")).toEqual(
      {},
    );
  });

  it("sends the fixed value when the flag is on", () => {
    expect(
      workOriginTelemetryProperty(
        { ...defaultFeatureFlags, workOriginTelemetry: true },
        "automation",
      ),
    ).toEqual({ work_origin: "automation" });
  });
});
