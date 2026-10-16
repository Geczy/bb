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
