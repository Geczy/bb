import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";

const PLUGIN_LOG_MAX_BYTES = 5 * 1024 * 1024;
const PLUGIN_LOG_BATCH_BYTES = 64 * 1024;
const PLUGIN_LOG_FILE = "plugin.log";
const PLUGIN_LOG_ROTATED_FILE = "plugin.log.1";

type PluginLogLevel = "debug" | "info" | "warn" | "error";
type LogOperation =
  | string
  | { tail: number; resolve: (lines: string[]) => void };
type LogQueue = { operations: LogOperation[]; done: Promise<void> };
const queues = new Map<string, LogQueue>();

function pluginLogsDir(dataDir: string, pluginId: string): string {
  return join(dataDir, "plugins", pluginId, "logs");
}

function enqueue(dir: string, operation: LogOperation): void {
  const existing = queues.get(dir);
  if (existing) {
    existing.operations.push(operation);
    return;
  }
  const operations = [operation];
  const done = new Promise<void>((resolve) => {
    setImmediate(() => {
      void drain(dir, operations).finally(() => {
        resolve();
      });
    });
  });
  queues.set(dir, { operations, done });
}

async function drain(dir: string, operations: LogOperation[]): Promise<void> {
  const file = join(dir, PLUGIN_LOG_FILE);
  let size: number | undefined;
  while (operations.length > 0) {
    const first = operations[0];
    if (typeof first !== "string") {
      operations.shift();
      first.resolve(await readLogFiles(dir, first.tail));
      continue;
    }
    let count = 0;
    try {
      if (size === undefined) {
        await mkdir(dir, { recursive: true });
        size = await stat(file).then(
          (value) => value.size,
          () => 0,
        );
      }
      if (size > PLUGIN_LOG_MAX_BYTES) {
        try {
          await rename(file, join(dir, PLUGIN_LOG_ROTATED_FILE));
          size = 0;
        } catch {}
      }
      let bytes = 0;
      while (count < operations.length) {
        const line = operations[count];
        if (typeof line !== "string") break;
        bytes += Buffer.byteLength(line);
        count++;
        if (
          bytes >= PLUGIN_LOG_BATCH_BYTES ||
          size + bytes > PLUGIN_LOG_MAX_BYTES
        )
          break;
      }
      await appendFile(file, operations.slice(0, count).join(""), "utf8");
      size += bytes;
    } catch {
      size = undefined;
    }
    operations.splice(0, Math.max(count, 1));
  }
  queues.delete(dir);
}

export function appendPluginLogLine(
  dataDir: string,
  pluginId: string,
  level: PluginLogLevel,
  message: string,
): void {
  const line = JSON.stringify({ ts: Date.now(), level, message });
  enqueue(pluginLogsDir(dataDir, pluginId), `${line}\n`);
}

export async function flushPluginLogs(): Promise<void> {
  while (queues.size > 0) {
    await Promise.all([...queues.values()].map((queue) => queue.done));
  }
}

async function readLogFiles(dir: string, tail: number): Promise<string[]> {
  const lines: string[] = [];
  for (const name of [PLUGIN_LOG_ROTATED_FILE, PLUGIN_LOG_FILE]) {
    try {
      for (const line of (await readFile(join(dir, name), "utf8")).split(
        "\n",
      )) {
        if (line.length > 0) lines.push(line);
      }
    } catch {}
  }
  return tail <= 0 ? [] : lines.slice(-tail);
}

export function readPluginLogTail(
  dataDir: string,
  pluginId: string,
  tail: number,
): Promise<string[]> {
  return new Promise((resolve) => {
    enqueue(pluginLogsDir(dataDir, pluginId), { tail, resolve });
  });
}
