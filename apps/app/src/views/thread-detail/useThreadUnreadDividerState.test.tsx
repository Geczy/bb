// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThreadUnreadDividerState } from "./useThreadUnreadDividerState";

interface Props {
  lastReadAt: number | null;
  latestAttentionAt: number;
}

function renderDividerState(initialProps: Props) {
  return renderHook(
    ({ lastReadAt, latestAttentionAt }: Props) =>
      useThreadUnreadDividerState({
        routeThreadId: "thr_1",
        thread: { id: "thr_1", lastReadAt, latestAttentionAt },
      }),
    { initialProps },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useThreadUnreadDividerState", () => {
  it("scrolls to the divider when an unread thread opens", () => {
    const { result } = renderDividerState({
      lastReadAt: 100,
      latestAttentionAt: 200,
    });

    expect(result.current.autoScrollKey).toBe(200);
  });

  it("keeps following new messages while the window is focused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { rerender, result } = renderDividerState({
      lastReadAt: 200,
      latestAttentionAt: 200,
    });

    rerender({ lastReadAt: 200, latestAttentionAt: 300 });

    expect(result.current.placement).toEqual({
      kind: "after-cutoff",
      cutoffAt: 200,
    });
    expect(result.current.autoScrollKey).toBeNull();
  });

  it("scrolls to new messages that arrive while the window is unfocused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { rerender, result } = renderDividerState({
      lastReadAt: 200,
      latestAttentionAt: 200,
    });

    rerender({ lastReadAt: 200, latestAttentionAt: 300 });
    expect(result.current.autoScrollKey).toBe(300);

    rerender({ lastReadAt: 200, latestAttentionAt: 400 });
    expect(result.current.autoScrollKey).toBe(400);
  });
});
