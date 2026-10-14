// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { useThreadUnreadDividerState } from "./useThreadUnreadDividerState";

interface DividerThread {
  id: string;
  lastReadAt: number | null;
  latestAttentionAt: number;
}

let visibilityState: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState): void {
  act(() => {
    visibilityState = next;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function useDividerWithSend(thread: DividerThread) {
  const divider = useThreadUnreadDividerState({
    routeThreadId: thread.id,
    thread,
  });
  const send = useMutation({
    meta: { lifecycleOperation: "send_message" },
    mutationFn: (_request: { id: string }) => new Promise<void>(() => {}),
  });
  return { placement: divider.placement, send: send.mutate };
}

async function sendTo(
  view: ReturnType<typeof renderDivider>,
  threadId: string,
): Promise<void> {
  await act(async () => {
    view.result.current.send({ id: threadId });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderDivider(thread: DividerThread) {
  const { wrapper } = createQueryClientTestHarness();
  return renderHook(
    ({ current }: { current: DividerThread }) => useDividerWithSend(current),
    { initialProps: { current: thread }, wrapper },
  );
}

beforeEach(() => {
  visibilityState = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useThreadUnreadDividerState", () => {
  it("adds no divider for a reply that finishes while the thread is watched", () => {
    const view = renderDivider({
      id: "thr_watched",
      lastReadAt: 100,
      latestAttentionAt: 100,
    });
    expect(view.result.current.placement).toBeNull();

    view.rerender({
      current: { id: "thr_watched", lastReadAt: 100, latestAttentionAt: 200 },
    });

    expect(view.result.current.placement).toBeNull();
  });

  it("clears the divider as soon as a message is sent to the thread", async () => {
    const view = renderDivider({
      id: "thr_unread",
      lastReadAt: 100,
      latestAttentionAt: 200,
    });
    expect(view.result.current.placement).toEqual({
      kind: "after-cutoff",
      cutoffAt: 100,
    });

    await sendTo(view, "thr_unread");

    expect(view.result.current.placement).toBeNull();
  });

  it("keeps the divider when a message goes to another thread", async () => {
    const view = renderDivider({
      id: "thr_unread",
      lastReadAt: 100,
      latestAttentionAt: 200,
    });

    await sendTo(view, "thr_other");

    expect(view.result.current.placement).toEqual({
      kind: "after-cutoff",
      cutoffAt: 100,
    });
  });

  it("adds a divider for a reply that finished while the window was hidden", () => {
    const view = renderDivider({
      id: "thr_hidden",
      lastReadAt: 100,
      latestAttentionAt: 100,
    });
    setVisibility("hidden");
    setVisibility("visible");

    view.rerender({
      current: { id: "thr_hidden", lastReadAt: 100, latestAttentionAt: 200 },
    });

    expect(view.result.current.placement).toEqual({
      kind: "after-cutoff",
      cutoffAt: 100,
    });
  });
});
