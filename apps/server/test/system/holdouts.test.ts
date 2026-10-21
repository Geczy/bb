import { getAppSettings, setAppSettings } from "@bb/db";
import { describe, expect, it, vi } from "vitest";
import { registerHostRpcResponder } from "../helpers/host-rpc.js";
import {
  seedHostSession,
  seedPrimaryHost,
  seedProjectWithSource,
} from "../helpers/seed.js";
import { withTestHarness } from "../helpers/test-app.js";
import { readJson } from "../helpers/json.js";

const path = "/api/v1/system/holdouts/app_aa_check/exposure";

describe("holdout interfaces", () => {
  it("lists persisted assignments and rejects unregistered keys and app-submitted exposure telemetry", async () => {
    await withTestHarness(async (harness) => {
      expect(
        await readJson(await harness.app.request("/api/v1/system/holdouts")),
      ).toEqual({ assignments: harness.deps.holdouts.list() });
      expect(
        (
          await harness.app.request(
            "/api/v1/system/holdouts/unknown/exposure",
            { method: "POST" },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await harness.app.request("/api/v1/system/telemetry/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "holdout_exposed",
              properties: { holdout: "app_aa_check", arm: "test" },
            }),
          })
        ).status,
      ).toBe(400);
    });
  });

  it("requires finished setup, an imported project and a ready agent, then exposes once across clients", async () => {
    await withTestHarness(async (harness) => {
      const capture = vi.fn();
      harness.deps.telemetry = { capture, setEnabled: vi.fn() };
      const expose = async () =>
        readJson(await harness.app.request(path, { method: "POST" }));
      expect(await expose()).toEqual({ exposed: false });
      setAppSettings(harness.db, {
        ...getAppSettings(harness.db),
        onboardingCompletedAt: new Date().toISOString(),
      });
      expect(await expose()).toEqual({ exposed: false });
      const { host, session } = seedHostSession(harness.deps);
      seedPrimaryHost(harness.deps, host.id);
      seedProjectWithSource(harness.deps, { hostId: host.id });
      let ready = false;
      registerHostRpcResponder(harness, {
        hostId: host.id,
        sessionId: session.id,
        handle: (request) => {
          if (request.command.type !== "provider.health")
            throw new Error(`Unexpected ${request.command.type}`);
          return {
            ok: true,
            result: {
              supported: true,
              health: {
                status: ready ? "ready" : "not_installed",
                statusMessage: null,
                accountEmail: null,
                planLabel: null,
                installedVersion: null,
                minimumSupportedVersion: null,
                canInstall: false,
                canUpdate: false,
                loginCommand: null,
              },
            },
          };
        },
      });
      expect(await expose()).toEqual({ exposed: false });
      ready = true;
      const results = await Promise.all(Array.from({ length: 8 }, expose));
      expect(
        results.filter(
          (result) =>
            JSON.stringify(result) === JSON.stringify({ exposed: true }),
        ),
      ).toHaveLength(1);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith({
        name: "holdout_exposed",
        properties: {
          holdout: "app_aa_check",
          arm: harness.deps.holdouts.arm("app_aa_check"),
        },
      });
    });
  });
});
