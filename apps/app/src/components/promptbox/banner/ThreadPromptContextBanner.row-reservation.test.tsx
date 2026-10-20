// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ThreadPromptContextBanner,
  type ThreadPromptGitSection,
} from "./ThreadPromptContextBanner";

const ROW_HEIGHT_PX = 39;

const gitSection: ThreadPromptGitSection = {
  changedFiles: {
    kind: "committed",
    label: "Committed",
    files: [],
    mergeBaseRef: "abc1234",
    stats: {
      insertions: 21,
      deletions: 4,
      lineStatsComplete: true,
      fileCount: 4,
      files: [],
    },
  },
  mergeBase: null,
  onPromptBannerFileClick: () => {},
};

const forkedFrom = {
  parentThreadTitle: "Original thread",
  href: "/threads/thr_original",
  relationship: "fork" as const,
};

function banner({
  threadId,
  rowPending,
  git,
  expandedSection = null,
  forked = false,
}: {
  threadId: string | null;
  rowPending: boolean;
  git: "pending" | "changes" | "clean";
  expandedSection?: "git" | null;
  forked?: boolean;
}) {
  return (
    <MemoryRouter>
      <ThreadPromptContextBanner
        rowHeightCacheKey={threadId}
        rowPending={rowPending}
        gitSection={git === "changes" ? gitSection : null}
        gitSectionPending={git === "pending"}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={forked ? forkedFrom : null}
        childThreadsSection={null}
        pullRequestSection={null}
        expandedSection={expandedSection}
        onToggleSection={() => {}}
      />
    </MemoryRouter>
  );
}

function placeholderHeight(container: HTMLElement): string | null {
  const placeholder = container.querySelector(
    "[data-prompt-context-row-placeholder]",
  );
  return placeholder?.parentElement?.style.height ?? null;
}

beforeEach(() => {
  const measure = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute("aria-label") === "Thread context before sending") {
        return new DOMRect(0, 0, 360, ROW_HEIGHT_PX);
      }
      return measure.call(this);
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ThreadPromptContextBanner row reservation", () => {
  it("holds the last seen row height while the thread's git status reloads", () => {
    const first = render(
      banner({ threadId: "thr_dirty", rowPending: true, git: "pending" }),
    );
    expect(placeholderHeight(first.container)).toBeNull();
    first.rerender(
      banner({ threadId: "thr_dirty", rowPending: false, git: "changes" }),
    );
    first.unmount();

    const revisit = render(
      banner({ threadId: "thr_dirty", rowPending: true, git: "pending" }),
    );
    expect(placeholderHeight(revisit.container)).toBe(`${ROW_HEIGHT_PX}px`);

    revisit.rerender(
      banner({ threadId: "thr_dirty", rowPending: true, git: "changes" }),
    );
    expect(placeholderHeight(revisit.container)).toBeNull();
    expect(
      revisit.getByRole("region", { name: "Thread context before sending" }),
    ).toBeTruthy();
  });

  it("reserves nothing for a thread whose last settled status had no row", () => {
    const first = render(
      banner({ threadId: "thr_clean", rowPending: false, git: "changes" }),
    );
    first.rerender(
      banner({ threadId: "thr_clean", rowPending: false, git: "clean" }),
    );
    first.unmount();

    const revisit = render(
      banner({ threadId: "thr_clean", rowPending: true, git: "pending" }),
    );
    expect(placeholderHeight(revisit.container)).toBeNull();
  });

  it("does not remember an expanded row or a banner without a cache key", () => {
    const expanded = render(
      banner({
        threadId: "thr_expanded",
        rowPending: false,
        git: "changes",
        expandedSection: "git",
      }),
    );
    expanded.unmount();
    const unkeyed = render(
      banner({ threadId: null, rowPending: false, git: "changes" }),
    );
    unkeyed.unmount();

    const revisit = render(
      banner({ threadId: "thr_expanded", rowPending: true, git: "pending" }),
    );
    expect(placeholderHeight(revisit.container)).toBeNull();
  });

  it("keeps a fork's row mounted at its remembered height while git status loads", () => {
    const first = render(
      banner({
        threadId: "thr_fork",
        rowPending: false,
        git: "changes",
        forked: true,
      }),
    );
    first.unmount();

    const revisit = render(
      banner({
        threadId: "thr_fork",
        rowPending: true,
        git: "clean",
        forked: true,
      }),
    );
    const row = revisit.getByRole("region", {
      name: "Thread context before sending",
    });
    expect(row.style.minHeight).toBe(`${ROW_HEIGHT_PX}px`);

    revisit.rerender(
      banner({
        threadId: "thr_fork",
        rowPending: true,
        git: "pending",
        forked: true,
      }),
    );
    expect(
      revisit.getByRole("region", { name: "Thread context before sending" }),
    ).toBe(row);
    expect(placeholderHeight(revisit.container)).toBeNull();

    revisit.rerender(
      banner({
        threadId: "thr_fork",
        rowPending: false,
        git: "changes",
        forked: true,
      }),
    );
    expect(
      revisit.getByRole("region", { name: "Thread context before sending" }),
    ).toBe(row);
  });
});
