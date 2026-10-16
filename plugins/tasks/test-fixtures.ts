import { z } from "zod";
import type { Task } from "./shared/contract.js";

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "01HZZZZZZZZZZZZZZZZZZZZZT1",
    projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    number: 1,
    key: "TSK-1",
    title: "Test task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: null,
    parentTaskId: null,
    position: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    labelIds: [],
    ...overrides,
  };
}

export function rpcInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(
      `expected an RPC input object, got ${JSON.stringify(input)}`,
    );
  }
  return Object.fromEntries(Object.entries(input));
}

export function createMemoryStorage(
  initialEntries: Record<string, string> = {},
): Storage {
  const entries = new Map(Object.entries(initialEntries));
  return {
    get length() {
      return entries.size;
    },
    clear: () => {
      entries.clear();
    },
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
  };
}

export function liveTaskRpcFixtures(
  handlers: Record<string, ((input: never) => unknown) | undefined>,
) {
  const rows = new Map<string, Task>();
  let membershipPending:
    | Promise<{ keys: string[]; openCount: number }>
    | undefined;
  const invoke = async (method: string, input: unknown) =>
    handlers[method]?.(input as never);
  return {
    ...Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        (input: unknown) => handler?.(input as never),
      ]),
    ),
    taskMembership(input: unknown) {
      membershipPending = (async () => {
        const result = (await invoke("listTasks", input)) as
          | { tasks: Task[] }
          | undefined;
        const tasks = result?.tasks ?? [];
        for (const task of tasks) rows.set(task.id, task);
        const closed = (task: Task) =>
          task.status === "done" || task.status === "canceled";
        const open = tasks.filter((task) => !closed(task));
        return {
          keys: [...open, ...tasks.filter(closed)].map((task) => task.id),
          openCount: open.length,
        };
      })();
      return membershipPending;
    },
    async getTasksKeyed(input: unknown) {
      await membershipPending?.catch(() => undefined);
      const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
      return Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => {
            const result = (await invoke("getTask", { taskId: key })) as
              | { task: Task | null }
              | undefined;
            return [
              key,
              result === undefined ? (rows.get(key) ?? null) : result.task,
            ];
          }),
        ),
      );
    },
    async getTaskThreadsKeyed(input: unknown) {
      const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
      return Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => {
            const result = (await invoke("listTaskThreads", {
              taskId: key,
            })) as { taskThreads: unknown[] } | undefined;
            return [key, result?.taskThreads ?? []];
          }),
        ),
      );
    },
    async getTaskAttachmentsKeyed(input: unknown) {
      const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
      return Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => {
            const result = (await invoke("listAttachments", {
              taskId: key,
            })) as { attachments: unknown[] } | undefined;
            return [key, result?.attachments ?? []];
          }),
        ),
      );
    },
    async getLabelsKeyed(input: unknown) {
      const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
      return Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => {
            const result = (await invoke("listLabels", { projectId: key })) as
              | { labels: unknown[] }
              | undefined;
            return [key, result?.labels ?? []];
          }),
        ),
      );
    },
  };
}
