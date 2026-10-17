import type Database from "better-sqlite3";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";

const workerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const Database = require(workerData.modulePath);
const db = new Database(workerData.databasePath, { fileMustExist: true, timeout: 0 });
db.pragma("synchronous = NORMAL");
db.pragma("wal_autocheckpoint = 0");
const timer = setInterval(() => db.pragma("wal_checkpoint(PASSIVE)"), 1000);
parentPort.on("message", () => {
  clearInterval(timer);
  db.close();
  parentPort.close();
});
parentPort.postMessage("ready");
`;

export function startBackgroundCheckpoint(
  sqlite: Database.Database,
  onError: (error: Error) => void,
): () => void {
  if (sqlite.memory || sqlite.name === "") return () => {};

  const autoCheckpoint: unknown = sqlite.pragma("wal_autocheckpoint", {
    simple: true,
  });
  if (typeof autoCheckpoint !== "number") {
    throw new Error("Invalid SQLite auto-checkpoint threshold");
  }
  let stopped = false;
  let failed = false;
  const fail = (error: Error) => {
    if (stopped || failed) return;
    failed = true;
    if (sqlite.open) {
      sqlite.pragma(`wal_autocheckpoint = ${autoCheckpoint}`);
    }
    onError(error);
  };

  let worker: Worker;
  try {
    worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve("better-sqlite3"),
        databasePath: resolve(sqlite.name),
      },
    });
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
    return () => {};
  }
  worker.once("message", (message: unknown) => {
    if (message === "ready" && !stopped && !failed && sqlite.open) {
      sqlite.pragma("wal_autocheckpoint = 0");
    }
  });
  worker.once("error", fail);
  worker.once("exit", (code) => {
    fail(new Error(`SQLite checkpoint worker exited (${code})`));
  });
  worker.unref();

  return () => {
    stopped = true;
    worker.postMessage("close");
  };
}
