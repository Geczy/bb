// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense, useDeferredValue, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ThreadTimelineResponse,
  ThreadWithIncludesResponse,
} from "@bb/server-contract";
import { sdk } from "@/lib/sdk";
import {
  makeThreadResponse,
  makeThreadTimelineResponse,
} from "@/test/fixtures/thread-responses";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import {
  didThreadOpenHoldEndUnloaded,
  THREAD_OPEN_HOLD_MAX_MS,
  useHoldThreadOpenUntilLoaded,
} from "./useHoldThreadOpenUntilLoaded";

vi.mock("@/lib/sdk", () => ({
  sdk: {
    threads: {
      get: vi.fn(),
      timeline: vi.fn(),
    },
  },
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function threadWithIncludes(id: string): ThreadWithIncludesResponse {
  return makeThreadResponse({ id });
}

function OpenThread({ threadId }: { threadId: string }) {
  useHoldThreadOpenUntilLoaded(threadId, true);
  return <p>open {threadId}</p>;
}

function ThreadSwitcher({ threadId }: { threadId: string }) {
  const shownThreadId = useDeferredValue(threadId);
  return (
    <Suspense fallback={<p>loading</p>}>
      <OpenThread threadId={shownThreadId} />
    </Suspense>
  );
}

async function renderSwitcher(
  wrapper: ReturnType<typeof createQueryClientTestHarness>["wrapper"],
) {
  let rerender: (ui: ReactElement) => void = () => {};
  await act(async () => {
    ({ rerender } = render(<ThreadSwitcher threadId="thread-a" />, {
      wrapper,
    }));
  });
  return async (threadId: string) => {
    await act(async () => {
      rerender(<ThreadSwitcher threadId={threadId} />);
    });
  };
}

async function settleQueries() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockLoadedThread(threadId: string) {
  vi.mocked(sdk.threads.get).mockResolvedValueOnce(
    threadWithIncludes(threadId),
  );
  vi.mocked(sdk.threads.timeline).mockResolvedValueOnce(
    makeThreadTimelineResponse(),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("useHoldThreadOpenUntilLoaded", () => {
  it("keeps the previous thread on screen until the next thread has loaded", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    const switchThread = await renderSwitcher(wrapper);
    expect(screen.getByText("open thread-a")).toBeTruthy();

    const thread = deferred<ThreadWithIncludesResponse>();
    const timeline = deferred<ThreadTimelineResponse>();
    vi.mocked(sdk.threads.get).mockReturnValueOnce(thread.promise);
    vi.mocked(sdk.threads.timeline).mockReturnValueOnce(timeline.promise);
    await switchThread("thread-b");

    expect(screen.getByText("open thread-a")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();

    await act(async () => {
      thread.resolve(threadWithIncludes("thread-b"));
      timeline.resolve(makeThreadTimelineResponse());
    });

    expect(await screen.findByText("open thread-b")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
    expect(didThreadOpenHoldEndUnloaded(queryClient, "thread-b")).toBe(false);
  });

  it("stops holding after the cap when the next thread never loads", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    const switchThread = await renderSwitcher(wrapper);
    expect(screen.getByText("open thread-a")).toBeTruthy();

    vi.useFakeTimers();
    vi.mocked(sdk.threads.get).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(sdk.threads.timeline).mockReturnValueOnce(new Promise(() => {}));
    await switchThread("thread-b");
    expect(screen.getByText("open thread-a")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREAD_OPEN_HOLD_MAX_MS);
    });

    expect(screen.getByText("open thread-b")).toBeTruthy();
    expect(didThreadOpenHoldEndUnloaded(queryClient, "thread-b")).toBe(true);
  });

  it("renders the first thread a view opens without holding it", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    await renderSwitcher(wrapper);

    expect(screen.getByText("open thread-a")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
    expect(sdk.threads.get).not.toHaveBeenCalled();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
    expect(didThreadOpenHoldEndUnloaded(queryClient, "thread-a")).toBe(false);
  });

  it("opens a thread whose data is already cached without holding", async () => {
    const { wrapper } = createQueryClientTestHarness();
    const switchThread = await renderSwitcher(wrapper);
    mockLoadedThread("thread-b");
    await switchThread("thread-b");
    await settleQueries();
    expect(screen.getByText("open thread-b")).toBeTruthy();
    mockLoadedThread("thread-c");
    await switchThread("thread-c");
    await settleQueries();
    expect(screen.getByText("open thread-c")).toBeTruthy();

    vi.mocked(sdk.threads.get).mockClear();
    vi.mocked(sdk.threads.timeline).mockClear();
    await switchThread("thread-b");

    expect(screen.getByText("open thread-b")).toBeTruthy();
    expect(sdk.threads.get).not.toHaveBeenCalled();
    expect(sdk.threads.timeline).not.toHaveBeenCalled();
  });
});
