import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

const { changes } = vi.hoisted(() => ({
  changes: [] as Array<(event: string, file: string) => void>,
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  watch: (
    _root: string,
    _options: unknown,
    callback: (event: string, file: string) => void,
  ) => {
    changes.push(callback);
    return { close() {}, on() {} };
  },
}));

it("reapplies edited active CSS without a catalog viewer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "theme-watch-parity-"));
  const file = join(directory, "theme-a", "theme.css");
  await mkdir(join(directory, "theme-a"));
  await writeFile(file, ":root { --canvas: #ffffff; }");
  const apply = vi.fn(async () => {});
  const host = createFakePluginHost({
    pluginId: "theme-preview",
    sdk: {
      theme: {
        catalog: async () => ({
          active: { themeId: "theme-a" },
          custom: ["theme-a"],
          dir: directory,
        }),
        set: apply,
      },
      plugins: { list: async () => ({ plugins: [] }) },
    },
  });
  try {
    await plugin(host.bb);
    await host.harness.callRpc("themeCatalog", {});
    host.harness.behavior.runService("theme-watch");
    await vi.waitFor(() => expect(changes.length).toBe(1));
    await writeFile(file, ":root { --canvas: #dddddd; --primary: #abcdef; }");
    changes[0]!("change", join(basename(directory), "theme-a", "theme.css"));
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith("theme-a"));
    expect(host.harness.inspection.rpcInvalidations).toContain(null);
  } finally {
    await host.harness.dispose();
    changes.length = 0;
    await rm(directory, { recursive: true, force: true });
  }
});
