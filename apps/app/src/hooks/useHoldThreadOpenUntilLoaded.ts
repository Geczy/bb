import { use, useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  threadDetailBootstrapQueryOptions,
  threadTimelineQueryOptions,
} from "@/hooks/queries/thread-queries";

export const THREAD_OPEN_HOLD_MAX_MS = 1_000;

const holdsByClient = new WeakMap<QueryClient, Map<string, Promise<void>>>();

function holdsFor(queryClient: QueryClient): Map<string, Promise<void>> {
  let holds = holdsByClient.get(queryClient);
  if (holds === undefined) {
    holds = new Map();
    holdsByClient.set(queryClient, holds);
  }
  return holds;
}

function isThreadOpenLoaded(queryClient: QueryClient, threadId: string) {
  return (
    queryClient.getQueryData(
      threadTimelineQueryOptions(queryClient, threadId).queryKey,
    ) !== undefined &&
    queryClient.getQueryData(
      threadDetailBootstrapQueryOptions(queryClient, threadId).queryKey,
    ) !== undefined
  );
}

function threadOpenHold(
  queryClient: QueryClient,
  threadId: string,
): Promise<void> | null {
  const holds = holdsFor(queryClient);
  const existing = holds.get(threadId);
  if (existing !== undefined) {
    return existing;
  }
  if (isThreadOpenLoaded(queryClient, threadId)) {
    return null;
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const hold: Promise<void> = Promise.race([
    Promise.allSettled([
      queryClient.ensureQueryData(
        threadTimelineQueryOptions(queryClient, threadId),
      ),
      queryClient.ensureQueryData(
        threadDetailBootstrapQueryOptions(queryClient, threadId),
      ),
    ]),
    new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, THREAD_OPEN_HOLD_MAX_MS);
    }),
  ]).then(() => {
    clearTimeout(timeoutId);
    Object.assign(hold, { status: "fulfilled", value: undefined });
    if (isThreadOpenLoaded(queryClient, threadId)) {
      holds.delete(threadId);
    }
  });
  holds.set(threadId, hold);
  return hold;
}

export function didThreadOpenHoldEndUnloaded(
  queryClient: QueryClient,
  threadId: string,
): boolean {
  return holdsFor(queryClient).has(threadId);
}

export function useHoldThreadOpenUntilLoaded(
  threadId: string,
  enabled: boolean,
): void {
  const queryClient = useQueryClient();
  const [mountedThreadId] = useState(threadId);
  const holding = enabled && threadId !== mountedThreadId;
  useEffect(() => {
    if (!holding) return;
    return () => {
      holdsFor(queryClient).delete(threadId);
    };
  }, [holding, queryClient, threadId]);
  if (!holding) return;
  const hold = threadOpenHold(queryClient, threadId);
  if (hold !== null) {
    use(hold);
  }
}
