// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act } from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));

describe("GitHub app navigation", () => {
  it("opens issue details in the URL-backed page instead of a fixed tab", async () => {
    const panel = app.navPanels[0]!;
    expect(panel.fixedTabs).toBeUndefined();

    const slot = renderSlot(
      panel,
      { subPath: "issues" },
      {
        rpc: {
          listItems: () => ({
            items: [
              {
                repo: "get-bb/bb",
                number: 42,
                kind: "issue",
                title: "Route-backed issue",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: [],
                url: "https://github.com/get-bb/bb/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
            ],
          }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [{ repo: "get-bb/bb", projectId: null }],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    (await slot.findByText("Route-backed issue")).click();
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "github",
      options: { subPath: "issues/get-bb/bb/42" },
    });
    slot.lifecycle.unmount();
  });

  it("keeps removed files out of workspace navigation and preserves the comment editor on refresh failure", async () => {
    let readError: Error | null = null;
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr-1", params: null },
      {
        experimental_rpcTags: (method) => ({
          tags:
            method === "getPull"
              ? ["pr:get-bb/bb#42"]
              : method === "listLinks"
                ? ["links"]
                : ["links", "thread:thr-1", "environment:env-1"],
        }),
        rpc: {
          pullForThread: () => ({
            pull: {
              repo: "get-bb/bb",
              number: 42,
              environmentId: "env-1",
            },
          }),
          getPull: () => {
            if (readError) throw readError;
            return {
              pull: {
                repo: "get-bb/bb",
                number: 42,
                title: "Navigation fix",
                state: "OPEN",
                author: "octocat",
                body: "",
                url: "https://github.com/get-bb/bb/pull/42",
                createdAt: "2026-08-20T00:00:00.000Z",
                updatedAt: "2026-08-20T00:00:00.000Z",
                baseRefName: "main",
                headRefName: "fix-navigation",
                additions: 1,
                deletions: 1,
                changedFiles: 2,
                labels: [],
                assignees: [],
                reviewDecision: "",
                mergeStateStatus: "CLEAN",
                reviewRequests: [],
                checks: [],
                comments: [],
                reviews: [],
                reviewThreads: [],
                files: [
                  {
                    path: "removed.ts",
                    status: "removed",
                    additions: 0,
                    deletions: 1,
                    patch: "@@ -1 +0,0 @@\n-removed",
                  },
                  {
                    path: "modified.ts",
                    status: "modified",
                    additions: 1,
                    deletions: 0,
                    patch: "@@ -0,0 +1 @@\n+added",
                  },
                ],
              },
            };
          },
          listLinks: () => ({ links: {} }),
        },
      },
    );

    await act(async () => {});
    const removedFile = await slot.findByText("removed.ts");
    const modifiedFile = slot.getByText("modified.ts");
    expect(removedFile.closest("a")).toBeNull();
    expect(modifiedFile.closest("a")?.getAttribute("href")).toBe(
      "./modified.ts",
    );

    const diffToggle = removedFile.parentElement?.querySelector("button");
    if (!(diffToggle instanceof HTMLButtonElement)) {
      throw new Error("removed file diff toggle was not rendered");
    }
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Expand removed.ts diff",
    );
    await act(async () => diffToggle.click());
    const diff = slot.getByTestId("bb-diff");
    expect(diff.getAttribute("data-path")).toBe("removed.ts");
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Collapse removed.ts diff",
    );
    const editor = slot.getByPlaceholderText("Leave a comment…");
    fireEvent.change(editor, { target: { value: "Unsaved review comment" } });
    editor.focus();
    readError = new Error("Pull refresh failed");
    await act(async () => {
      await slot.experimental_invalidateRpc(["pr:get-bb/bb#42"]);
    });
    await slot.findByText("Pull refresh failed");
    expect(slot.getByPlaceholderText("Leave a comment…")).toBe(editor);
    expect(editor.getAttribute("value") ?? editor.textContent).toBe(
      "Unsaved review comment",
    );
    expect(document.activeElement).toBe(editor);
    readError = null;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(slot.queryByText("Pull refresh failed")).toBeNull(),
    );
    expect(slot.getByPlaceholderText("Leave a comment…")).toBe(editor);
    expect(editor.textContent).toBe("Unsaved review comment");
    slot.lifecycle.unmount();
  });
});

function detailFixture(
  kind: "issue" | "pull",
  initialReadError: Error | null = null,
) {
  let readError: Error | null = initialReadError;
  let statusError: string | null = null;
  const issue = {
    repo: "get-bb/bb",
    number: 42,
    title: "Live detail",
    state: "OPEN",
    author: "octocat",
    body: "Description",
    url: "https://github.com/get-bb/bb/issues/42",
    updatedAt: "2026-08-20T00:00:00.000Z",
    labels: [],
    assignees: [],
    comments: [],
  };
  const pull = {
    ...issue,
    url: "https://github.com/get-bb/bb/pull/42",
    createdAt: issue.updatedAt,
    baseRefName: "main",
    headRefName: "feature",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    reviewDecision: "",
    mergeStateStatus: "CLEAN",
    reviewRequests: [],
    checks: [],
    reviews: [],
    reviewThreads: [],
    files: [],
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: `${kind === "pull" ? "pulls" : "issues"}/get-bb/bb/42` },
    {
      experimental_rpcTags: (method) => ({
        tags:
          method === "status"
            ? ["status"]
            : method === "getIssue"
              ? ["issue:get-bb/bb#42"]
              : method === "getPull"
                ? ["pr:get-bb/bb#42"]
                : ["links"],
      }),
      rpc: {
        getIssue: () => {
          if (readError) throw readError;
          return { issue };
        },
        getPull: () => {
          if (readError) throw readError;
          return { pull };
        },
        listLinks: () => ({ links: {} }),
        status: () => ({
          ghOk: statusError === null,
          ghState: statusError === null ? "ready" : "unavailable",
          ghError: statusError,
          repos: [{ repo: "get-bb/bb", projectId: null }],
          lastSyncedAt: null,
        }),
      },
    },
  );
  return {
    view,
    readError(value: Error | null) {
      readError = value;
    },
    statusError(value: string | null) {
      statusError = value;
    },
  };
}

it("retains the issue comment editor and offers Retry after a live read fails", async () => {
  const fixture = detailFixture("issue");
  const { view } = fixture;
  try {
    const editor = await view.findByPlaceholderText("Leave a comment…");
    fireEvent.change(editor, { target: { value: "Unsaved issue comment" } });
    editor.focus();
    fixture.readError(new Error("Issue refresh failed"));
    await act(async () => {
      await view.experimental_invalidateRpc(["issue:get-bb/bb#42"]);
    });
    await view.findByText("Issue refresh failed");
    expect(view.queryByPlaceholderText("Leave a comment…")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    fixture.readError(null);
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(view.queryByText("Issue refresh failed")).toBeNull(),
    );
    expect(view.getByPlaceholderText("Leave a comment…")).toBe(editor);
    expect(editor.textContent).toBe("Unsaved issue comment");
  } finally {
    view.lifecycle.unmount();
  }
});

it.each(["issue", "pull"] as const)(
  "retains the %s editor across unavailable auth status and recovery",
  async (kind) => {
    const fixture = detailFixture(kind);
    const { view } = fixture;
    try {
      const editor = await view.findByPlaceholderText("Leave a comment…");
      fireEvent.change(editor, {
        target: { value: "Unsaved comment during auth failure" },
      });
      editor.focus();
      fixture.statusError("Network unavailable");
      await act(async () => {
        await view.experimental_invalidateRpc(["status"]);
      });
      await view.findByText(/Network unavailable/);
      expect(view.queryByPlaceholderText("Leave a comment…")).toBe(editor);
      expect(document.activeElement).toBe(editor);
      fixture.statusError(null);
      fireEvent.click(
        view.getByRole("button", { name: "Retry GitHub connection" }),
      );
      await waitFor(() =>
        expect(view.queryByText(/Network unavailable/)).toBeNull(),
      );
      expect(view.getByPlaceholderText("Leave a comment…")).toBe(editor);
      expect(editor.textContent).toBe("Unsaved comment during auth failure");
    } finally {
      view.lifecycle.unmount();
    }
  },
);

it("offers Retry when the first issue detail read fails", async () => {
  const fixture = detailFixture("issue", new Error("Issue unavailable"));
  try {
    await fixture.view.findByText("Issue unavailable");
    expect(fixture.view.queryByPlaceholderText("Leave a comment…")).toBeNull();
    fixture.readError(null);
    fireEvent.click(fixture.view.getByRole("button", { name: "Retry" }));
    await fixture.view.findByPlaceholderText("Leave a comment…");
    expect(fixture.view.queryByText("Issue unavailable")).toBeNull();
  } finally {
    fixture.view.lifecycle.unmount();
  }
});
