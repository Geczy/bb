import { afterEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  type FakePluginHarness,
} from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../api";
import { tasksRpcContract } from "../shared/contract";
import { publishThreadsChanged } from "../delegate";

const harnesses: FakePluginHarness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
});
function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  harnesses.push(harness);
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({
    name: "Review",
    prefix: "REV",
    color: "blue",
  });
  async function membership(input: unknown) {
    return tasksRpcContract.taskMembership.output.parse(
      await harness.callRpc("taskMembership", input),
    );
  }
  return { bb, harness, store, project, membership };
}

describe("task membership and keyed invalidation", () => {
  it.each([
    {
      name: "plain title",
      read: {},
      patch: { title: "Needle" },
      invalidated: false,
    },
    {
      name: "searched title",
      read: { search: "Needle" },
      patch: { title: "Needle" },
      invalidated: true,
    },
    {
      name: "searched description",
      read: { search: "Needle" },
      patch: { description: "Needle" },
      invalidated: true,
    },
    {
      name: "plain priority",
      read: {},
      patch: { priority: "urgent" },
      invalidated: false,
    },
    {
      name: "filtered priority",
      read: { priorities: ["urgent"] },
      patch: { priority: "urgent" },
      invalidated: true,
    },
    {
      name: "sorted priority",
      read: { sort: "priority" },
      patch: { priority: "urgent" },
      invalidated: false,
    },
    {
      name: "plain due date",
      read: {},
      patch: { dueDate: "2027-01-01" },
      invalidated: false,
    },
    {
      name: "sorted due date",
      read: { sort: "due" },
      patch: { dueDate: "2027-01-01" },
      invalidated: false,
    },
    {
      name: "priority sort tie breaker",
      read: { sort: "priority" },
      patch: { dueDate: "2027-01-01" },
      invalidated: false,
    },
    {
      name: "manual status order",
      read: {},
      patch: { status: "done" },
      invalidated: false,
    },
    {
      name: "filtered status",
      read: { statuses: ["done"] },
      patch: { status: "done" },
      invalidated: true,
    },
  ])(
    "refreshes membership only for relevant changes: $name",
    async ({ read, patch, invalidated }) => {
      const { harness, store, project, membership } = setup();
      const task = store.tasks.createTask({
        projectId: project.id,
        title: "Original",
        status: "todo",
      });
      const { sort, ...filters } = { sort: undefined, ...read };
      const input = { projectId: project.id, ...filters };
      if (sort !== undefined)
        await expect(
          harness.callRpc("taskMembership", { ...input, sort }),
        ).rejects.toThrow();
      const before = await membership(input);
      const tags = harness.rpcTags.get("taskMembership") ?? [];
      harness.rpcInvalidations.length = 0;
      await harness.callRpc("updateTask", { taskId: task.id, ...patch });
      const affected = harness.rpcInvalidations.some(
        (changes) =>
          changes === null || changes.some((tag) => tags.includes(tag)),
      );
      expect(affected).toBe(invalidated);
      const after = await membership(input);
      expect(after.keys).toEqual([task.id]);
      if (!invalidated) expect(after).toEqual(before);
      expect(harness.rpcInvalidations.flat()).toContain(`task:${task.id}`);
    },
  );

  it("keeps filtered membership and keyed labels current when labels are added and removed", async () => {
    const { harness, store, project, membership } = setup();
    const label = store.tasks.createLabel({
      projectId: project.id,
      name: "Bug",
      color: "red",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Issue",
    });
    const input = { projectId: project.id, labelIds: [label.id] };
    expect((await membership(input)).keys).toEqual([]);
    const tags = harness.rpcTags.get("taskMembership") ?? [];
    for (const labelIds of [[label.id], []]) {
      harness.rpcInvalidations.length = 0;
      await harness.callRpc("updateTask", { taskId: task.id, labelIds });
      expect(
        harness.rpcInvalidations
          .flat()
          .some((tag) => tag !== null && tags.includes(tag)),
      ).toBe(true);
      expect((await membership(input)).keys).toEqual(
        labelIds.length ? [task.id] : [],
      );
      expect(
        tasksRpcContract.getTasksKeyed.output.parse(
          await harness.callRpc("getTasksKeyed", { keys: [task.id] }),
        )[task.id]?.labelIds,
      ).toEqual(labelIds);
    }
  });

  it("promotes children into top-level membership when a parent is deleted", async () => {
    const { harness, store, project, membership } = setup();
    const parent = store.tasks.createTask({
      projectId: project.id,
      title: "Parent",
    });
    const child = store.tasks.createTask({
      projectId: project.id,
      title: "Child",
      parentTaskId: parent.id,
    });
    expect(
      (await membership({ projectId: project.id, parentTaskId: null })).keys,
    ).toEqual([parent.id]);
    await harness.callRpc("deleteTask", { taskId: parent.id });
    expect(
      (await membership({ projectId: project.id, parentTaskId: null })).keys,
    ).toEqual([child.id]);
    expect(harness.rpcInvalidations.flat()).toContain(`task:${child.id}`);
  });

  it("tags filtered membership and invalidates parents and active lists", async () => {
    const { bb, harness, store, project, membership } = setup();
    const parent = store.tasks.createTask({
      projectId: project.id,
      title: "Parent",
    });
    const child = store.tasks.createTask({
      projectId: project.id,
      title: "Child",
      parentTaskId: parent.id,
    });
    expect((await membership({ parentTaskId: parent.id })).keys).toEqual([
      child.id,
    ]);
    expect(harness.rpcTags.get("taskMembership")).toContain(
      `subtasks:${parent.id}`,
    );
    await harness.callRpc("updateTask", {
      taskId: child.id,
      title: "Updated child",
    });
    expect(harness.rpcInvalidations.flat()).not.toContain(
      `subtasks:${parent.id}`,
    );
    await membership({ projectId: project.id, activeOnly: true });
    expect(harness.rpcTags.get("taskMembership")).toContain(
      "active-membership",
    );
    publishThreadsChanged(bb, child.id);
    expect(harness.rpcInvalidations.flat()).toContain("active-membership");
  });

  it("invalidates both parent memberships when a subtask is moved", async () => {
    const { harness, store, project } = setup();
    const first = store.tasks.createTask({
      projectId: project.id,
      title: "First",
    });
    const second = store.tasks.createTask({
      projectId: project.id,
      title: "Second",
    });
    const child = store.tasks.createTask({
      projectId: project.id,
      title: "Child",
      parentTaskId: first.id,
    });
    await harness.callRpc("updateTask", {
      taskId: child.id,
      parentTaskId: second.id,
    });
    expect(harness.rpcInvalidations.flat()).toEqual(
      expect.arrayContaining([
        `subtasks:${first.id}`,
        `subtasks:${second.id}`,
        `task:${child.id}`,
      ]),
    );
    expect(store.tasks.getTask(child.id)?.parentTaskId).toBe(second.id);
  });

  it("refreshes keyed task rows after project prefix and label changes", async () => {
    const { harness, store, project } = setup();
    const label = store.tasks.createLabel({
      projectId: project.id,
      name: "Bug",
      color: "red",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Task",
    });
    await harness.callRpc("updateTask", {
      taskId: task.id,
      labelIds: [label.id],
    });
    await harness.callRpc("getTasksKeyed", { keys: [task.id] });
    const tags =
      harness.experimental_rpcKeyTags.get("getTasksKeyed")?.[task.id] ?? [];
    await harness.callRpc("renameProjectPrefix", {
      projectId: project.id,
      prefix: "NEW",
    });
    await harness.callRpc("deleteLabel", { labelId: label.id });
    expect(
      harness.rpcInvalidations
        .flat()
        .some((tag) => tag !== null && tags.includes(tag)),
    ).toBe(true);
    const rows = tasksRpcContract.getTasksKeyed.output.parse(
      await harness.callRpc("getTasksKeyed", { keys: [task.id] }),
    );
    expect(rows[task.id]).toMatchObject({ key: "NEW-1", labelIds: [] });
  });

  it("returns null for deleted keyed rows and isolates row dependencies", async () => {
    const { harness, store, project } = setup();
    const first = store.tasks.createTask({
      projectId: project.id,
      title: "First",
    });
    const second = store.tasks.createTask({
      projectId: project.id,
      title: "Second",
    });
    const read = async () =>
      tasksRpcContract.getTasksKeyed.output.parse(
        await harness.callRpc("getTasksKeyed", { keys: [first.id, second.id] }),
      );
    expect((await read())[first.id]?.title).toBe("First");
    await harness.callRpc("deleteTask", { taskId: first.id });
    expect(await read()).toMatchObject({
      [first.id]: null,
      [second.id]: { title: "Second" },
    });
    const changes = harness.rpcInvalidations.flat();
    expect(changes).toContain(`task:${first.id}`);
    expect(changes).not.toContain(`task:${second.id}`);
  });
});

it("keeps batched metadata scoped to each task and omits descriptions from summaries", async () => {
  const { harness, store, project } = setup();
  const first = store.tasks.createTask({
    projectId: project.id,
    title: "First",
    description: "Full Markdown remains in detail reads",
  });
  const second = store.tasks.createTask({
    projectId: project.id,
    title: "Second",
  });
  for (const task of [first, second]) {
    store.tasks.createAttachment({
      taskId: task.id,
      fileName: task.title,
      mime: "text/plain",
      sizeBytes: 1,
      blobPath: `blobs/${task.id}`,
      isImage: false,
    });
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId: `thr_${task.id}`,
      presetName: "Attached",
      title: task.title,
      liveStatus: "working",
    });
  }
  const keys = [second.id, "missing", first.id];
  const threads = tasksRpcContract.getTaskThreadsKeyed.output.parse(
    await harness.callRpc("getTaskThreadsKeyed", { keys }),
  );
  const attachments = tasksRpcContract.getTaskAttachmentsKeyed.output.parse(
    await harness.callRpc("getTaskAttachmentsKeyed", { keys }),
  );
  for (const task of [first, second]) {
    expect(threads[task.id]).toEqual(store.tasks.listTaskThreads(task.id));
    expect(attachments[task.id]?.map((entry) => entry.fileName)).toEqual([
      task.title,
    ]);
  }
  expect(threads.missing).toEqual([]);
  expect(attachments.missing).toEqual([]);
  const summaries = tasksRpcContract.getTasksKeyed.output.parse(
    await harness.callRpc("getTasksKeyed", { keys }),
  );
  expect(summaries[first.id]).not.toHaveProperty("description");
  expect(
    tasksRpcContract.getTask.output.parse(
      await harness.callRpc("getTask", { taskId: first.id }),
    ).task?.description,
  ).toBe(first.description);
});
