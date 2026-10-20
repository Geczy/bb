// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { startTransition, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ThreadTimelineResponse,
  ThreadWithIncludesResponse,
} from "@bb/server-contract";
import type { WebSocketConnectionState } from "@/lib/ws";
import { sdk } from "@/lib/sdk";
import { useServerConnectionState } from "@/hooks/useServerConnectionState";
import {
  makeThreadResponse,
  makeThreadTimelineResponse,
} from "@/test/fixtures/thread-responses";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { ThreadOpenGate } from "./ThreadOpenGate";

vi.mock("@/lib/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sdk")>()),
  sdk: {
    threads: {
      get: vi.fn(),
      timeline: vi.fn(),
    },
  },
}));

vi.mock("@/hooks/useServerConnectionState", () => ({
  useServerConnectionState: vi.fn(),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function threadWithIncludes(id: string): ThreadWithIncludesResponse {
  return makeThreadResponse({ id });
}

function ThreadPage({ threadId }: { threadId: string }) {
  return (
    <>
      <ThreadOpenGate threadId={threadId} enabled />
      <p>open {threadId}</p>
    </>
  );
}

function pendingThread() {
  const thread = deferred<ThreadWithIncludesResponse>();
  const timeline = deferred<ThreadTimelineResponse>();
  vi.mocked(sdk.threads.get).mockReturnValueOnce(thread.promise);
  vi.mocked(sdk.threads.timeline).mockReturnValueOnce(timeline.promise);
  return { thread, timeline };
}

async function renderPage() {
  const { wrapper } = createQueryClientTestHarness();
  let rerender: (ui: ReactElement) => void = () => {};
  const first = pendingThread();
  await act(async () => {
    ({ rerender } = render(<ThreadPage threadId="thread-a" />, { wrapper }));
  });
  await act(async () => {
    first.thread.resolve(threadWithIncludes("thread-a"));
    first.timeline.resolve(makeThreadTimelineResponse());
  });
  return {
    switchInTransition: async (threadId: string) => {
      await act(async () => {
        startTransition(() => rerender(<ThreadPage threadId={threadId} />));
      });
    },
    switchUrgently: async (threadId: string) => {
      await act(async () => {
        rerender(<ThreadPage threadId={threadId} />);
      });
    },
  };
}

beforeEach(() => {
  vi.mocked(useServerConnectionState).mockReturnValue(
    "connected" satisfies WebSocketConnectionState,
  );
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ThreadOpenGate", () => {
  it("renders the first thread a page opens without waiting for its data", async () => {
    const { wrapper } = createQueryClientTestHarness();
    pendingThread();
    await act(async () => {
      render(<ThreadPage threadId="thread-a" />, { wrapper });
    });

    expect(screen.getByText("open thread-a")).toBeTruthy();
  });

  it("keeps the previous thread through a transition until the next one has loaded", async () => {
    const page = await renderPage();
    const next = pendingThread();
    await page.switchInTransition("thread-b");

    expect(screen.getByText("open thread-a")).toBeTruthy();

    await act(async () => {
      next.thread.resolve(threadWithIncludes("thread-b"));
    });
    expect(screen.getByText("open thread-a")).toBeTruthy();

    await act(async () => {
      next.timeline.resolve(makeThreadTimelineResponse());
    });
    expect(screen.getByText("open thread-b")).toBeTruthy();
  });

  it("does not hold an urgent switch", async () => {
    const page = await renderPage();
    pendingThread();
    await page.switchUrgently("thread-b");

    expect(screen.getByText("open thread-b")).toBeTruthy();
  });

  it("lets the page render when the next thread fails to load", async () => {
    const page = await renderPage();
    const next = pendingThread();
    await page.switchInTransition("thread-b");
    expect(screen.getByText("open thread-a")).toBeTruthy();

    await act(async () => {
      next.thread.reject(new Error("not found"));
      next.timeline.reject(new Error("not found"));
    });

    expect(screen.getByText("open thread-b")).toBeTruthy();
  });

  it("does not hold while the server connection is down", async () => {
    const page = await renderPage();
    vi.mocked(useServerConnectionState).mockReturnValue(
      "reconnecting" satisfies WebSocketConnectionState,
    );
    pendingThread();
    await page.switchInTransition("thread-b");

    expect(screen.getByText("open thread-b")).toBeTruthy();
  });
});
