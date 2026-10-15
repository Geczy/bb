// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../server";
import { tasksRpcContract } from "../shared/contract";

it("bounds live board reads for 1,000 tasks and overlapping views", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  const db = bb.storage.database();
  let statements = 0;
  let databaseMs = 0;
  const prepare = db.prepare.bind(db);
  const spy = vi.spyOn(db, "prepare").mockImplementation((sql) => {
    const statement = prepare(sql);
    return new Proxy(statement, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const start = performance.now();
          try {
            return Reflect.apply(value, target, args);
          } finally {
            if (["all", "get", "run"].includes(String(property))) {
              statements++;
              databaseMs += performance.now() - start;
            }
          }
        };
      },
    });
  });
  const records: Array<{ method: string; bytes: number; keys: number }> = [];
  const results: Record<string, unknown> = {};
  const metadata = new Map<
    string,
    {
      tags: readonly string[];
      keyTags: Record<string, readonly string[]>;
      providedKeyed: Record<
        string,
        {
          result: Record<string, import("@get-bb/plugin-sdk").JsonValue>;
          keyTags: Record<string, string[]>;
          whileWatched: boolean;
        }
      >;
    }
  >();
  let pendingRead = Promise.resolve();
  let releaseColdRows!: () => void;
  const coldRowsReady = new Promise<void>((resolve) => {
    releaseColdRows = resolve;
  });
  let waitingForColdRows = false;
  try {
    await plugin(bb);
    const { project } = tasksRpcContract.createProject.output.parse(
      await harness.callRpc("createProject", {
        name: "Performance",
        prefix: "PERF",
        color: "blue",
      }),
    );
    let taskId = "";
    for (let index = 0; index < 1_000; index++) {
      const result = tasksRpcContract.createTask.output.parse(
        await harness.callRpc("createTask", {
          projectId: project.id,
          title: `Performance task ${index}`,
          description: "Synthetic task description. ".repeat(20),
          status: "todo",
        }),
      );
      if (result.ok && index === 0) taskId = result.task.id;
    }
    const app = await loadPluginApp(() => import("../app"));
    const options = {
      pluginId: "tasks",
      rpc: Object.fromEntries(
        Object.keys(tasksRpcContract).map((method) => [
          method,
          (
            input: unknown,
            context?: { experimental_warmKeyedMethods: readonly string[] },
          ) => {
            const read = pendingRead.then(async () => {
              if (method === "getTasksKeyed") {
                waitingForColdRows = true;
                await coldRowsReady;
              }
              const result = await harness.callRpc(method, input, context);
              metadata.set(JSON.stringify([method, input]), {
                tags: harness.rpcTags.get(method) ?? [],
                keyTags: harness.experimental_rpcKeyTags.get(method) ?? {},
                providedKeyed:
                  harness.experimental_rpcProvidedKeyed.get(method) ?? {},
              });
              const keys =
                typeof input === "object" &&
                input !== null &&
                "keys" in input &&
                Array.isArray(input.keys)
                  ? input.keys.length
                  : 0;
              records.push({
                method,
                bytes: Buffer.byteLength(
                  JSON.stringify({
                    result,
                    ...metadata.get(JSON.stringify([method, input])),
                  }),
                ),
                keys,
              });
              return result;
            });
            pendingRead = read.then(
              () => {},
              () => {},
            );
            return read;
          },
        ]),
      ),
      experimental_rpcTags: (method: string, input: unknown) =>
        metadata.get(JSON.stringify([method, input])) ?? { tags: [] },
    };
    const reset = () => {
      records.length = 0;
      statements = 0;
      databaseMs = 0;
      return performance.now();
    };
    const record = (name: string, started: number) => {
      results[name] = {
        requests: records.length,
        bytes: records.reduce((sum, entry) => sum + entry.bytes, 0),
        statements,
        databaseMs,
        renderMs: performance.now() - started,
        methods: records.map((entry) => entry.method),
      };
    };
    let started = reset();
    const board = renderSlot(
      app.navPanels[0]!,
      { subPath: `${project.id}?view=board` },
      options,
    );
    const stop = harness.experimental_onRpcInvalidation((tags) => {
      void board.experimental_invalidateRpc(tags ?? undefined);
    });
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    await waitFor(
      () => {
        expect(waitingForColdRows).toBe(true);
        expect(board.container.querySelector("[data-task-key]")).not.toBeNull();
      },
      { timeout: 15_000 },
    );
    expect(records.some((entry) => entry.method === "getTasksKeyed")).toBe(false);
    await act(async () => releaseColdRows());
    await board.findByText("Performance task 999", {}, { timeout: 15_000 });
    await settle();
    record("coldBoard", started);
    const coldBytes = records.reduce((sum, entry) => sum + entry.bytes, 0);
    const coldStatements = statements;
    const coldRows = records.filter(
      (entry) => entry.method === "getTasksKeyed",
    );
    const membershipBytes = records
      .filter((entry) => entry.method === "taskMembership")
      .reduce((sum, entry) => sum + entry.bytes, 0);
    started = reset();
    await act(async () => {
      await harness.callRpc("updateTask", {
        taskId,
        title: "Edited performance task",
      });
    });
    await board.findByText("Edited performance task");
    await settle();
    record("titleEdit", started);
    const titleReads = [...records];
    started = reset();
    await act(async () => {
      await harness.callRpc("updateTask", { taskId, status: "in_progress" });
    });
    await waitFor(() =>
      expect(records.some((entry) => entry.method === "getTasksKeyed")).toBe(
        true,
      ),
    );
    await settle();
    record("statusChange", started);
    const statusBytes = records.reduce((sum, entry) => sum + entry.bytes, 0);
    started = reset();
    const list = renderSlot(
      app.navPanels[0]!,
      { subPath: `${project.id}?view=list` },
      options,
    );
    await list.findByText("Edited performance task", {}, { timeout: 15_000 });
    await settle();
    record("overlappingList", started);
    const overlapRows = records.filter(
      (entry) => entry.method === "getTasksKeyed",
    );
    stop();
    writeFileSync(
      join(tmpdir(), "bb-tasks-live-performance.json"),
      JSON.stringify(results, null, 2),
    );
    expect(coldStatements).toBeLessThan(100);
    expect(coldRows.reduce((sum, entry) => sum + entry.keys, 0)).toBe(975);
    expect(coldRows.every((entry) => entry.keys <= 500)).toBe(true);
    expect(membershipBytes).toBeLessThan(100_000);
    expect(
      records
        .filter((entry) => entry.method === "taskMembership")
        .reduce((sum, entry) => sum + entry.bytes, 0),
    ).toBeLessThan(40_000);
    expect(coldBytes).toBeLessThan(800_000);
    expect(
      titleReads.filter((entry) => entry.method === "taskMembership"),
    ).toHaveLength(0);
    expect(
      titleReads
        .filter((entry) => entry.method === "getTasksKeyed")
        .map((entry) => entry.keys),
    ).toEqual([1]);
    expect(overlapRows).toHaveLength(0);
    expect(statusBytes).toBeLessThan(coldBytes / 4);
  } finally {
    releaseColdRows();
    cleanup();
    spy.mockRestore();
    await harness.dispose();
  }
}, 60_000);
