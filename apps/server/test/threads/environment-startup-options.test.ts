import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  ensurePersonalProject,
  environments,
  getEnvironment,
  getPreparingEnvironment,
  getThread,
  listEvents,
} from "@bb/db";
import { encodeClientTurnRequestIdNumber, type JsonValue } from "@bb/domain";
import { createBbSdk } from "@bb/sdk/core";
import { createHttpTransport } from "@bb/sdk/node";
import { createDeferredPromise } from "@bb/test-helpers";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { resolveThreadEnvironmentPlacement } from "../../src/services/threads/thread-environment-placement.js";
import { advanceThreadProvisioning } from "../../src/services/threads/thread-provisioning.js";
import {
  clearAllThreadProvisionSchedules,
  createThreadStartup,
  saveThreadProvisionContext,
} from "../../src/services/threads/thread-startup-store.js";
import { sweepProviderLifecycles } from "../../src/services/environments/environment-engine.js";
import { setPluginEnvironmentProviderBridge } from "../../src/services/plugins/plugin-environment-provider-registry.js";
import {
  registerTestHostRpcCapture,
  reportNextEnvironmentAttachSuccess,
  waitForQueuedCommand,
} from "../helpers/commands.js";
import { seedEnvironment, seedHostSession, seedProjectWithSource, seedThread } from "../helpers/seed.js";
import { withTestHarness } from "../helpers/test-app.js";

interface StartupCase {
  name: string;
  providerId: string;
  inputs: JsonValue | null;
  recorded: boolean;
  reuseId?: boolean;
}

const cases: StartupCase[] = [
  { name: "new worktree from default branch", providerId: "git-worktree", inputs: {}, recorded: false },
  { name: "new worktree from named branch", providerId: "git-worktree", inputs: { branch: { kind: "named", name: "release" } }, recorded: false },
  { name: "unrecorded existing worktree", providerId: "git-worktree", inputs: { kind: "existing", path: "/tmp/startup-workspace" }, recorded: false },
  { name: "recorded existing worktree with original new-worktree inputs", providerId: "git-worktree", inputs: { kind: "existing", path: "/tmp/startup-workspace" }, recorded: true },
  { name: "worktree reused by environment ID", providerId: "git-worktree", inputs: {}, recorded: true, reuseId: true },
  { name: "new personal workspace", providerId: "personal-workspace", inputs: null, recorded: false },
  { name: "personal workspace reused by environment ID", providerId: "personal-workspace", inputs: null, recorded: true, reuseId: true },
  { name: "new project checkout", providerId: "project-checkout", inputs: {}, recorded: false },
  { name: "project checkout adopting prior branch selection", providerId: "project-checkout", inputs: {}, recorded: true },
  { name: "project checkout reused by explicit path", providerId: "project-checkout", inputs: { path: "/tmp/startup-workspace" }, recorded: true },
];

afterEach(() => {
  clearAllThreadProvisionSchedules();
  setPluginEnvironmentProviderBridge(undefined);
});

describe("environment startup options", () => {
  it.each(cases)("preserves $name during lifecycle sweeps", async (scenario) => {
    await withTestHarness(async (harness) => {
      const { host, session } = seedHostSession(harness.deps);
      registerTestHostRpcCapture(harness, { hostId: host.id, sessionId: session.id });
      const project = scenario.providerId === "personal-workspace"
        ? ensurePersonalProject(harness.db)
        : seedProjectWithSource(harness.deps, { hostId: host.id, path: "/tmp/startup-workspace" }).project;
      const creationStarted = createDeferredPromise<void>();
      const releaseCreation = createDeferredPromise<void>();
      const pluginId = `environment-${scenario.providerId}`;
      const sdk = createBbSdk({
        transport: createHttpTransport({
          baseUrl: "http://localhost",
          runtime: "node",
          fetch: async (input, init) => harness.app.fetch(new Request(input, init)),
        }),
      });
      const fake = createFakePluginHost({
        pluginId,
        sdk,
        experimental_callHostRpc: async ({ method }) => {
          if (method === "inspectCheckout") return { isGitRepo: false };
          if (method === "remove") return { status: "removed" };
          if (method === "removeWorkspace") return { removed: true };
          creationStarted.resolve();
          await releaseCreation.promise;
          if (method === "create") return { status: "created", path: "/tmp/startup-workspace", baseBranch: "main" };
          if (method === "resolveExistingWorktree") return { status: "resolved", path: "/tmp/startup-workspace", branch: "main" };
          if (method === "createWorkspace") return { path: "/tmp/startup-workspace" };
          if (method === "attach") return { status: "attached", path: "/tmp/startup-workspace", branchName: "main" };
          throw new Error(`Unexpected host method: ${method}`);
        },
      });
      try {
        const module = z.object({ default: z.custom<(bb: BbPluginApi) => Promise<void>>((value) => typeof value === "function") }).parse(
          await import(new URL(`../../../../plugins/${pluginId}/server.ts`, import.meta.url).href),
        );
        await module.default(fake.bb);
        const provider = fake.harness.registrations.environmentProviders.get(scenario.providerId);
        if (provider === undefined) throw new Error("Provider not registered");
        const record = { pluginId, provider };
        setPluginEnvironmentProviderBridge({
          listEnvironmentProviders: () => [record],
          getEnvironmentProvider: (id) => id === provider.id ? record : undefined,
          invokeProvider: async (_id, _label, run) => ({ ok: true, value: await run() }),
          decisionTimeoutMs: 10_000,
        });
        const existing = scenario.recorded ? seedEnvironment(harness.deps, {
          hostId: host.id,
          projectId: project.id,
          path: "/tmp/startup-workspace",
          providerOwnsPath: scenario.providerId !== "project-checkout",
          environmentProviderId: provider.id,
          environmentProviderPluginId: pluginId,
          environmentProviderInstanceKey: "original-thread",
          environmentProviderSelection: {
            machine: { type: "existing", hostId: host.id },
            inputs: scenario.providerId === "project-checkout"
              ? { branch: { kind: "new", baseBranch: "release" } }
              : scenario.providerId === "git-worktree" ? { branch: { kind: "named", name: "release" } } : null,
          },
        }) : null;
        if (existing !== null && scenario.providerId !== "project-checkout") {
          harness.db.update(environments).set({ retireAt: Date.now() - 1 }).where(eq(environments.id, existing.id)).run();
        }
        const placement = await resolveThreadEnvironmentPlacement(harness.deps, {
          projectId: project.id,
          requestedEnvironment: scenario.reuseId && existing !== null
            ? { type: "reuse", environmentId: existing.id }
            : { type: "provider", environmentProviderId: provider.id, machine: { type: "existing", hostId: host.id }, inputs: scenario.inputs },
        });
        const thread = seedThread(harness.deps, { projectId: project.id, environmentId: placement.environmentId, status: "starting" });
        saveThreadProvisionContext({
          db: harness.db,
          replace: true,
          threadId: thread.id,
          context: createThreadStartup({
            clientRequestId: encodeClientTurnRequestIdNumber({ value: 1 }),
            environmentIntent: placement.environmentIntent,
            execution: null,
            fork: null,
            input: [],
            seedWithoutRun: true,
            titleProvided: true,
          }),
        });
        await advanceThreadProvisioning(harness.deps, { threadId: thread.id });
        if (placement.environmentIntent.type === "provider") {
          await creationStarted.promise;
          await sweepProviderLifecycles(harness.deps);
          expect(getThread(harness.db, thread.id)?.status).toBe("starting");
          expect(getPreparingEnvironment(harness.db, thread.id)?.status).toBe("creating");
          releaseCreation.resolve();
          if (existing === null) {
            await waitForQueuedCommand(harness, ({ command }) => command.type === "environment.attach" && command.initiator?.threadId === thread.id);
            await sweepProviderLifecycles(harness.deps);
            expect(getThread(harness.db, thread.id)?.status).toBe("starting");
            await reportNextEnvironmentAttachSuccess(harness, thread.id);
          }
        }
        await expect.poll(async () => {
          await advanceThreadProvisioning(harness.deps, { threadId: thread.id });
          return getThread(harness.db, thread.id)?.status;
        }).toBe("idle");
        await sweepProviderLifecycles(harness.deps);
        const environmentId = getThread(harness.db, thread.id)?.environmentId;
        expect(environmentId).toBeTruthy();
        expect(getEnvironment(harness.db, environmentId!)).toMatchObject({ status: "ready", teardownStatus: null, retireAt: null });
        if (existing !== null) expect(environmentId).toBe(existing.id);
        expect(listEvents(harness.db, { threadId: thread.id }).filter((event) => event.type === "system/error")).toEqual([]);
        expect(fake.harness.experimental_hostRpcCalls.filter((call) => call.method === "remove" || call.method === "removeWorkspace")).toEqual([]);
      } finally {
        releaseCreation.resolve();
        await fake.harness.lifecycle.dispose();
      }
    });
  });
});
