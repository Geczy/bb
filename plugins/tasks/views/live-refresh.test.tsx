// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { tasksRpcContract } from "../shared/contract";
import { createTasksServer } from "../test-server";

const app = await loadPluginApp(() => import("../app"));

const disposals: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposals.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function setup(sdk?: Parameters<typeof createTasksServer>[0]) {
  const server = await createTasksServer(sdk);
  disposals.push(() => server.harness.dispose());
  const { project } = tasksRpcContract.createProject.output.parse(
    await server.harness.callRpc("createProject", {
      name: "Parity",
      prefix: "PAR",
      color: "blue",
    }),
  );
  return {
    ...server,
    project,
    async createTask(input: { title: string; status?: string }) {
      const result = tasksRpcContract.createTask.output.parse(
        await server.harness.callRpc("createTask", {
          projectId: project.id,
          ...input,
        }),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.task;
    },
    live<
      Slot extends {
        experimental_invalidateRpc(tags?: readonly string[]): Promise<void>;
      },
    >(slot: Slot): Slot {
      disposals.push(server.connect(slot));
      return slot;
    },
  };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

function directiveProps(key: string) {
  return {
    attributes: { key },
    source: `::task{key="${key}"}`,
    message: {
      id: "msg_1",
      threadId: "thr_1",
      turnId: "turn_1",
      projectId: null,
    },
    openWorkspaceFile: null,
  };
}

describe("board and list row loading", () => {
  it("shows a failed row batch above the partial board and recovers on Retry", async () => {
    const server = await setup();
    for (let index = 0; index < 26; index++)
      await server.createTask({ title: `Task ${index}`, status: "todo" });
    server.fail("getTasksKeyed", "row transport failed");
    const slot = server.live(
      renderSlot(
        app.navPanels[0]!,
        {
          subPath: `${server.project.id}?view=board`,
        },
        server.options,
      ),
    );

    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toContain(
      "Failed to load the board: row transport failed",
    );
    expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength(25);

    server.recover("getTasksKeyed");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength(
        26,
      ),
    );
    expect(slot.queryByRole("alert")).toBeNull();
  });

  it("shows open tasks before closed ones while the remaining rows load", async () => {
    const server = await setup();
    for (let index = 0; index < 25; index++)
      await server.createTask({ title: `Closed ${index}`, status: "done" });
    await server.createTask({ title: "Open task", status: "todo" });
    const release = server.hold("getTasksKeyed");
    try {
      const slot = server.live(
        renderSlot(
          app.navPanels[0]!,
          {
            subPath: `${server.project.id}?view=list`,
          },
          server.options,
        ),
      );
      await slot.findByText("Open task");
    } finally {
      release();
    }
  });
});

describe("task embed card", () => {
  it("keeps the card and offers Retry when a refresh fails", async () => {
    const server = await setup();
    const task = await server.createTask({ title: "Embedded task" });
    const slot = server.live(
      renderSlot(
        app.messageDirectives[0]!,
        directiveProps(task.key),
        server.options,
      ),
    );
    await slot.findByText("Embedded task");

    server.fail("getTaskByKey", "lookup failed");
    await act(async () => {
      await server.harness.callRpc("updateTask", {
        taskId: task.id,
        title: "Renamed embed",
      });
    });
    const retry = await slot.findByRole("button", { name: "Retry" });
    expect(slot.getByText("Embedded task")).toBeTruthy();

    server.recover("getTaskByKey");
    fireEvent.click(retry);
    await slot.findByText("Renamed embed");
    expect(slot.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("task detail", () => {
  it("keeps the previous activity when the comment attachments fail to refresh", async () => {
    const server = await setup();
    const task = await server.createTask({ title: "Activity task" });
    await server.harness.callRpc("createComment", {
      taskId: task.id,
      body: "First comment",
      notify: false,
    });
    const slot = server.live(
      renderSlot(
        app.navPanels[0]!,
        {
          subPath: `task/${task.key}`,
        },
        server.options,
      ),
    );
    await slot.findByText("First comment");

    const db = server.bb.storage.database();
    const prepare = db.prepare.bind(db);
    let attachmentsFail = true;
    vi.spyOn(db, "prepare").mockImplementation((sql) => {
      if (
        attachmentsFail &&
        sql.includes("JOIN comments ON comments.id = attachments.comment_id")
      )
        throw new Error("attachment query failed");
      return prepare(sql);
    });
    await act(async () => {
      await server.harness.callRpc("createComment", {
        taskId: task.id,
        body: "Second comment",
        notify: false,
      });
    });
    await slot.findByText(/attachment query failed/);
    expect(slot.queryByText("Second comment")).toBeNull();
    expect(slot.getByText("First comment")).toBeTruthy();
    const alert = slot.getByRole("alert");

    attachmentsFail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await slot.findByText("Second comment");
    expect(slot.queryByRole("alert")).toBeNull();
  });

  it("refreshes pull requests when the window regains focus", async () => {
    const server = await setup({
      threads: {
        get: async ({ threadId }: { threadId: string }) =>
          makeThreadResponse({ id: threadId, environmentId: "env_1" }),
      },
      environments: {
        pullRequest: async () => ({ outcome: "absent" as const }),
      },
    });
    const task = await server.createTask({ title: "PR task" });
    await server.harness.callRpc("taskThreadsAttach", {
      taskId: task.id,
      threadId: "thr_linked00",
    });
    const slot = server.live(
      renderSlot(
        app.navPanels[0]!,
        {
          subPath: `task/${task.key}`,
        },
        server.options,
      ),
    );
    await slot.findByRole("textbox", { name: "Task title" });
    const lookups = () =>
      server.harness.sdk.callsTo("environments.pullRequest").length;
    await waitFor(() => expect(lookups()).toBeGreaterThan(0));
    await settle();
    const before = lookups();

    fireEvent.focus(window);
    await waitFor(() => expect(lookups()).toBe(before + 1));
  });

  it("keeps an edited task mounted when its project prefix is renamed", async () => {
    const server = await setup();
    const task = await server.createTask({ title: "Prefix task" });
    const slot = server.live(
      renderSlot(
        app.navPanels[0]!,
        {
          subPath: `task/${task.key}`,
        },
        server.options,
      ),
    );
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Unsaved local title";
    const lookups = () =>
      slot.rpcCalls.filter((call) => call.method === "getTaskByKey").length;
    const before = lookups();

    await act(async () => {
      await server.harness.callRpc("renameProjectPrefix", {
        projectId: server.project.id,
        prefix: "NEW",
      });
    });
    await waitFor(() => expect(lookups()).toBeGreaterThan(before));
    await settle();

    expect(slot.queryByText(`Task ${task.key} was not found.`)).toBeNull();
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(title.textContent).toBe("Unsaved local title");
  });
});
