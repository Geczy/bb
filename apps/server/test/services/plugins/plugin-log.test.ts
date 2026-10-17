import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import {
  appendPluginLogLine,
  flushPluginLogs,
  readPluginLogTail,
} from "../../../src/services/plugins/plugin-log.js";

vi.mock("node:fs", { spy: true });

const dirs: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "plugin-log-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await flushPluginLogs();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
  vi.clearAllMocks();
});

test("persists a burst of all log levels in order without synchronous filesystem IO", async () => {
  const dir = await tempDir();
  vi.clearAllMocks();
  const levels = ["debug", "info", "warn", "error"] as const;
  for (let i = 0; i < 2000; i++) {
    appendPluginLogLine(
      dir,
      "one",
      levels[i % levels.length],
      `line ${i} 🐝\nnext`,
    );
  }
  const lines = await readPluginLogTail(dir, "one", 3000);
  expect(lines.map((line) => JSON.parse(line))).toEqual(
    Array.from({ length: 2000 }, (_, i) => ({
      ts: expect.any(Number),
      level: levels[i % levels.length],
      message: `line ${i} 🐝\nnext`,
    })),
  );
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.statSync).not.toHaveBeenCalled();
  expect(fs.appendFileSync).not.toHaveBeenCalled();
});

test("serializes tail snapshots with rotation and counts UTF-8 bytes at the existing threshold", async () => {
  const dir = await tempDir();
  const logs = join(dir, "plugins", "one", "logs");
  await mkdir(logs, { recursive: true });
  const seed = "x".repeat(5 * 1024 * 1024 - 1) + "\n";
  await writeFile(join(logs, "plugin.log"), seed);
  await writeFile(join(logs, "plugin.log.1"), "older\n");
  appendPluginLogLine(dir, "one", "debug", "🐝");
  const beforeRotation = readPluginLogTail(dir, "one", 1);
  appendPluginLogLine(dir, "one", "info", "after rotation");
  const afterRotation = readPluginLogTail(dir, "one", 2);
  expect(
    (await beforeRotation).map((line) => JSON.parse(line).message),
  ).toEqual(["🐝"]);
  expect((await afterRotation).map((line) => JSON.parse(line).message)).toEqual(
    ["🐝", "after rotation"],
  );
  expect(await readFile(join(logs, "plugin.log.1"), "utf8")).toBe(
    seed + (await beforeRotation)[0] + "\n",
  );
  expect((await readFile(join(logs, "plugin.log"), "utf8")).trim()).toBe(
    (await afterRotation)[1],
  );
});

test("drains all plugins and accepts subsequent writes after an idle drain", async () => {
  const dir = await tempDir();
  for (const id of ["one", "two"])
    appendPluginLogLine(dir, id, "error", "shutdown");
  await flushPluginLogs();
  for (const id of ["one", "two"]) {
    expect(
      JSON.parse(
        await readFile(join(dir, "plugins", id, "logs", "plugin.log"), "utf8"),
      ).message,
    ).toBe("shutdown");
    appendPluginLogLine(dir, id, "warn", "next");
  }
  await flushPluginLogs();
  expect(
    (await readPluginLogTail(dir, "one", 1)).map(
      (line) => JSON.parse(line).message,
    ),
  ).toEqual(["next"]);
  expect(await readPluginLogTail(dir, "missing", 10)).toEqual([]);
  expect(await readPluginLogTail(dir, "one", 0)).toEqual([]);
});

test("preserves line boundaries through multiple rotations in one queued burst", async () => {
  const dir = await tempDir();
  const message = "🐝".repeat(512 * 1024);
  for (let i = 0; i < 7; i++)
    appendPluginLogLine(dir, "one", "debug", `${i}:${message}`);
  const lines = await readPluginLogTail(dir, "one", 10);
  expect(lines.map((line) => JSON.parse(line).message)).toEqual(
    [3, 4, 5, 6].map((i) => `${i}:${message}`),
  );
});

test("continues appending when rotation cannot replace the archive", async () => {
  const dir = await tempDir();
  const logs = join(dir, "plugins", "one", "logs");
  await mkdir(join(logs, "plugin.log.1"), { recursive: true });
  await writeFile(join(logs, "plugin.log"), "x".repeat(5 * 1024 * 1024) + "\n");
  appendPluginLogLine(dir, "one", "warn", "still recorded");
  expect(
    (await readPluginLogTail(dir, "one", 1)).map(
      (line) => JSON.parse(line).message,
    ),
  ).toEqual(["still recorded"]);
});

test("keeps pending logs alive until natural process exit", async () => {
  const dir = await tempDir();
  const source = new URL(
    "../../../src/services/plugins/plugin-log.ts",
    import.meta.url,
  ).href;
  await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    `import { appendPluginLogLine } from ${JSON.stringify(source)};
     for (let i = 0; i < 2000; i++) appendPluginLogLine(${JSON.stringify(dir)}, "one", "debug", String(i));`,
  ]);
  const lines = (
    await readFile(join(dir, "plugins", "one", "logs", "plugin.log"), "utf8")
  )
    .trim()
    .split("\n");
  expect(lines.map((line) => JSON.parse(line).message)).toEqual(
    Array.from({ length: 2000 }, (_, i) => String(i)),
  );
});

test.each(["throw new Error('fatal plugin failure')", "process.exit(23)"])(
  "preserves queued logs when a child terminates with %s",
  async (terminate) => {
    const dir = await tempDir();
    const source = new URL(
      "../../../src/services/plugins/plugin-log.ts",
      import.meta.url,
    ).href;
    const logs = join(dir, "plugins", "one", "logs");
    await mkdir(logs, { recursive: true });
    const seed = "x".repeat(5 * 1024 * 1024) + "\n";
    await writeFile(join(logs, "plugin.log"), seed);
    await expect(
      promisify(execFile)(process.execPath, [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { appendPluginLogLine } from ${JSON.stringify(source)};
         setImmediate(() => {
           for (let i = 0; i < 2000; i++) appendPluginLogLine(${JSON.stringify(dir)}, "one", "error", String(i));
           ${terminate};
         });`,
      ]),
    ).rejects.toMatchObject({ code: terminate.startsWith("throw") ? 1 : 23 });
    const lines = (await readFile(join(logs, "plugin.log"), "utf8"))
      .trim()
      .split("\n");
    expect(lines.map((line) => JSON.parse(line).message)).toEqual(
      Array.from({ length: 2000 }, (_, i) => String(i)),
    );
    expect(await readFile(join(logs, "plugin.log.1"), "utf8")).toBe(seed);
  },
);

test("does not replay a submitted batch when exiting before its completion callback", async () => {
  const dir = await tempDir();
  const source = new URL(
    "../../../src/services/plugins/plugin-log.ts",
    import.meta.url,
  ).href;
  await expect(
    promisify(execFile)(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `import fs from 'node:fs/promises';
       import { syncBuiltinESMExports } from 'node:module';
       const appendFile = fs.appendFile;
       fs.appendFile = async (...args) => {
         await appendFile(...args);
         process.exit(24);
       };
       syncBuiltinESMExports();
       const { appendPluginLogLine } = await import(${JSON.stringify(source)});
       for (let i = 0; i < 2000; i++) appendPluginLogLine(${JSON.stringify(dir)}, "one", "error", String(i));`,
    ]),
  ).rejects.toMatchObject({ code: 24 });
  const lines = (
    await readFile(join(dir, "plugins", "one", "logs", "plugin.log"), "utf8")
  )
    .trim()
    .split("\n");
  expect(lines.map((line) => JSON.parse(line).message)).toEqual(
    Array.from({ length: 2000 }, (_, i) => String(i)),
  );
});
