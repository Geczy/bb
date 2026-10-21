import { setAiServiceSelection } from "@bb/db";
import { runTextTask } from "../../../src/services/ai/ai-tasks.js";
import { registerFakeAiService } from "../../helpers/ai-services.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSystemProviderInfos } from "../../../src/services/system/execution-options.js";
import {
  type TestAppHarness,
  withTestHarness,
} from "../../helpers/test-app.js";

const HOST_SOURCE = `
  export default {
    experimental_apiVersion: 1,
    contract: {},
    handlers: {},
  };
`;

const REGISTER_AI_SERVICE_SOURCE = (id: string): string => `
  export default function plugin(bb: any) {
    bb.experimental_aiServices.register({
      id: ${JSON.stringify(id)},
      displayName: "Acme AI",
      complete: async (prompt) => prompt.toUpperCase(),
      transcribe: async (audio) => "heard " + audio.name,
      status: async () => ({ ready: false, message: "Add an API key" }),
    });
  }
`;

const REGISTER_AI_SERVICE_AND_PROVIDER_SOURCE = (
  id: string,
  order: "service-first" | "provider-first",
): string => {
  const service = `
    bb.experimental_aiServices.register({
      id: ${JSON.stringify(id)},
      displayName: "Acme AI",
      complete: async () => "reply",
    });`;
  const provider = `
    bb.providers.register({
      id: ${JSON.stringify(id)},
      displayName: "Acme Agent",
      icon: "./icons/agent.svg",
      maintenance: { health: true, usage: true, installation: false },
      capabilities: {
        supportsServiceTier: false,
        supportsNativeUserQuestion: false,
        fork: "tip",
        supportsManualCompaction: false,
        supportsThreadArchive: false,
        supportsThreadRename: false,
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["low", "medium", "high"],
      },
      composerActions: ["plan"],
    });`;
  return `
  export default function plugin(bb: any) {
    ${order === "service-first" ? service + provider : provider + service}
  }
`;
};

async function writePlugin(
  dir: string,
  options: { name: string; serverSource: string; withHost?: boolean },
): Promise<string> {
  const withHost = options.withHost ?? true;
  const rootDir = join(dir, options.name);
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({
      name: options.name,
      version: "0.1.0",
      bb: {
        name: "AI service fixture",
        description: "AI service registration fixture.",
        branding: { icon: "Zap" },
        server: "./server.ts",
        ...(withHost ? { host: "./host.ts" } : {}),
      },
    }),
  );
  await writeFile(join(rootDir, "server.ts"), options.serverSource);
  if (withHost) {
    await writeFile(join(rootDir, "host.ts"), HOST_SOURCE);
  }
  return rootDir;
}

const ACME_AI = { pluginId: "acme-ai", serviceId: "acme-ai" };

async function withPluginHarness(
  run: (harness: TestAppHarness, workDir: string) => Promise<void>,
): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "bb-plugin-ai-service-test-"));
  try {
    await withTestHarness((harness) => run(harness, workDir));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

describe("bb.experimental_aiServices.register (server)", () => {
  it("lands the service when the load commits and removes it when the plugin is disabled", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-acme-ai",
        serverSource: REGISTER_AI_SERVICE_SOURCE("acme-ai"),
        withHost: false,
      });
      const entry = await harness.pluginService.installPath(rootDir);
      expect(entry.status).toBe("running");
      const service = harness.deps.aiServices.get(ACME_AI);
      expect(service).toMatchObject({
        id: "acme-ai",
        displayName: "Acme AI",
        pluginId: "acme-ai",
        builtin: false,
      });
      const signal = new AbortController().signal;
      await expect(service?.complete?.("hi", { signal })).resolves.toBe("HI");
      await expect(
        service?.transcribe?.(new File(["a"], "clip.webm"), {
          signal,
          hint: null,
        }),
      ).resolves.toBe("heard clip.webm");
      await expect(harness.deps.aiServices.status(ACME_AI)).resolves.toEqual({
        ready: false,
        message: "Add an API key",
      });
      await harness.pluginService.setEnabled("acme-ai", false);
      expect(harness.deps.aiServices.get(ACME_AI)).toBeNull();
    });
  });

  it("fails the load of a plugin whose service answers nothing", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-empty-ai",
        serverSource: `
          export default function plugin(bb: any) {
            bb.experimental_aiServices.register({ id: "empty-ai", displayName: "Empty" });
          }
        `,
        withHost: false,
      });
      const entry = await harness.pluginService.installPath(rootDir);
      expect(entry.status).toBe("error");
      expect(entry.statusDetail).toContain(
        'AI service "empty-ai" must declare complete, transcribe, or both',
      );
      expect(
        harness.deps.aiServices.get({
          pluginId: "empty-ai",
          serviceId: "empty-ai",
        }),
      ).toBeNull();
    });
  });

  it("fails the load on the host build error for a plugin that registers only an AI service", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const rootDir = await writePlugin(workDir, {
        name: "bb-plugin-broken-host-ai",
        serverSource: REGISTER_AI_SERVICE_SOURCE("broken-host-ai"),
      });
      await writeFile(
        join(rootDir, "host.ts"),
        'import "missing-host-runtime";\n',
      );
      const entry = await harness.pluginService.installPath(rootDir);
      expect(entry.status).toBe("error");
      expect(entry.statusDetail).toContain("Could not resolve");
      expect(
        harness.deps.aiServices.get({
          pluginId: "broken-host-ai",
          serviceId: "broken-host-ai",
        }),
      ).toBeNull();
      expect(harness.deps.aiServices.list()).toEqual([]);
    });
  });

  it.each(["service-first", "provider-first"] as const)(
    "keeps the provider listed as unavailable when the host entry of a plugin that also registers an AI service fails to build (%s)",
    async (order) => {
      await withPluginHarness(async (harness, workDir) => {
        const id = `dual-${order}`;
        const rootDir = await writePlugin(workDir, {
          name: `bb-plugin-${id}`,
          serverSource: REGISTER_AI_SERVICE_AND_PROVIDER_SOURCE(id, order),
        });
        await writeFile(
          join(rootDir, "host.ts"),
          'import "missing-host-runtime";\n',
        );
        const entry = await harness.pluginService.installPath(rootDir);
        expect(entry.status).toBe("error");
        expect(entry.statusDetail).toContain("Could not resolve");
        expect(harness.deps.providerRegistry.get(id)?.info).toEqual(
          expect.objectContaining({
            id,
            displayName: "Acme Agent",
            available: false,
          }),
        );
        expect(
          (await listSystemProviderInfos(harness.deps, {})).find(
            (provider) => provider.id === id,
          ),
        ).toEqual(expect.objectContaining({ available: false }));
        expect(
          harness.deps.aiServices.get({ pluginId: entry.id, serviceId: id }),
        ).toBeNull();
        expect(harness.deps.aiServices.list()).toEqual([]);

        await writeFile(join(rootDir, "host.ts"), HOST_SOURCE);
        await harness.pluginService.reload(entry.id);
        expect(
          harness.pluginService.list().find((plugin) => plugin.id === entry.id)
            ?.status,
        ).toBe("running");
        expect(harness.deps.providerRegistry.get(id)?.info.available).toBe(
          true,
        );
        expect(
          harness.deps.providerRegistry
            .list()
            .filter((provider) => provider.info.id === id),
        ).toHaveLength(1);
        expect(
          harness.deps.aiServices.get({ pluginId: entry.id, serviceId: id })
            ?.displayName,
        ).toBe("Acme AI");

        await harness.pluginService.setEnabled(entry.id, false);
        expect(harness.deps.providerRegistry.get(id)).toBeNull();
        expect(
          harness.deps.aiServices.get({ pluginId: entry.id, serviceId: id }),
        ).toBeNull();
      });
    },
  );

  it("lets two plugins register the same service id without shadowing each other", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const first = await harness.pluginService.installPath(
        await writePlugin(workDir, {
          name: "bb-plugin-first-ai",
          serverSource: REGISTER_AI_SERVICE_SOURCE("codex"),
        }),
      );
      const second = await harness.pluginService.installPath(
        await writePlugin(workDir, {
          name: "bb-plugin-second-ai",
          serverSource: REGISTER_AI_SERVICE_SOURCE("codex"),
        }),
      );
      expect(first.status).toBe("running");
      expect(second.status).toBe("running");
      expect(
        harness.deps.aiServices
          .list()
          .map((service) => [service.pluginId, service.id]),
      ).toEqual([
        ["first-ai", "codex"],
        ["second-ai", "codex"],
      ]);

      await harness.pluginService.setEnabled("first-ai", false);
      expect(
        harness.deps.aiServices.get({
          pluginId: "second-ai",
          serviceId: "codex",
        })?.pluginId,
      ).toBe("second-ai");
    });
  });

  it("fails the load of a plugin that registers one id twice", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const entry = await harness.pluginService.installPath(
        await writePlugin(workDir, {
          name: "bb-plugin-twice-ai",
          serverSource: `
            export default function plugin(bb: any) {
              const complete = async () => "reply";
              bb.experimental_aiServices.register({ id: "twice", displayName: "Twice", complete });
              bb.experimental_aiServices.register({ id: "twice", displayName: "Twice again", complete });
            }
          `,
          withHost: false,
        }),
      );
      expect(entry.status).toBe("error");
      expect(entry.statusDetail).toContain(
        'AI service "twice" is already registered by this plugin.',
      );
      expect(harness.deps.aiServices.list()).toEqual([]);
    });
  });

  it("fails the load of a plugin whose service id is a selection mode", async () => {
    await withPluginHarness(async (harness, workDir) => {
      const entry = await harness.pluginService.installPath(
        await writePlugin(workDir, {
          name: "bb-plugin-reserved-ai",
          serverSource: REGISTER_AI_SERVICE_SOURCE("automatic"),
          withHost: false,
        }),
      );
      expect(entry.status).toBe("error");
      expect(entry.statusDetail).toContain(
        'AI service id "automatic" is reserved',
      );
    });
  });
});

describe.each(["core", "plugin"] as const)(
  "AI text task contract through %s",
  (surface) => {
    it.each(["thread-title", "commit-message"] as const)(
      "honors selection, cleanup, fallback and cancellation for %s",
      async (task) => {
        await withPluginHarness(async (harness, workDir) => {
          const rootDir = await writePlugin(workDir, {
            name: "bb-plugin-text-runner",
            withHost: false,
            serverSource: `export default function plugin(bb) {
          bb.http.route("POST", "/run", async context => {
            const input = await context.req.json();
            const signal = input.cancel ? AbortSignal.abort() : undefined;
            const result = await bb.experimental_aiServices.experimental_runTextTask({
              task: input.task, prompt: input.prompt, ...(signal ? { signal } : {}),
            });
            return context.json(result);
          });
        }`,
          });
          expect(
            (await harness.pluginService.installPath(rootDir)).status,
          ).toBe("running");
          const run = async (cancel = false) => {
            if (surface === "core")
              return runTextTask(harness.deps, {
                task,
                prompt: "  prompt bytes  ",
                label: "test",
                ...(cancel ? { signal: AbortSignal.abort() } : {}),
              });
            const response = await harness.app.request(
              "/api/v1/plugins/text-runner/http/run",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  task,
                  prompt: "  prompt bytes  ",
                  cancel,
                }),
              },
            );
            expect(response.status).toBe(200);
            return response.json();
          };
          const failing = registerFakeAiService(harness.deps.aiServices, {
            pluginId: "bb-ai",
            id: "failed",
            complete: async () => {
              throw new Error("no quota");
            },
          });
          const fallback = registerFakeAiService(harness.deps.aiServices, {
            pluginId: "backup",
            id: "text",
            complete: async () => 'Title: "Clean reply"',
          });
          expect(await run()).toMatchObject({
            ok: true,
            value: "Clean reply",
            service: { pluginId: "backup", id: "text" },
          });
          expect(fallback.completeCalls[0]?.prompt).toBe("  prompt bytes  ");
          setAiServiceSelection(harness.db, task, {
            mode: "service",
            pluginId: "bb-ai",
            serviceId: "failed",
          });
          expect(await run()).toMatchObject({ ok: false, reason: "failed" });
          expect(fallback.completeCalls).toHaveLength(1);
          setAiServiceSelection(harness.db, task, { mode: "off" });
          expect(await run()).toMatchObject({ ok: false, reason: "off" });
          expect(failing.completeCalls).toHaveLength(2);
          setAiServiceSelection(harness.db, task, { mode: "automatic" });
          expect(await run(true)).toMatchObject({
            ok: false,
            reason: "cancelled",
          });
          expect(failing.completeCalls).toHaveLength(2);
        });
      },
    );
  },
);
