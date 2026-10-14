import { useEffect, useRef, useState } from "react";
import { useMutationState, type Mutation } from "@tanstack/react-query";
import type { ThreadTimelineUnreadDividerPlacement } from "@/components/thread/timeline";
import {
  isDocumentVisible,
  subscribeToDocumentVisibility,
} from "@/lib/document-visibility";

interface ThreadUnreadDividerThreadState {
  id: string;
  lastReadAt: number | null;
  latestAttentionAt: number;
}

interface ThreadUnreadDividerSnapshot {
  attentionAt: number;
  autoScroll: boolean;
  placement: ThreadTimelineUnreadDividerPlacement | null;
  sentThrough: number;
  threadId: string;
}

interface ThreadUnreadDividerState {
  autoScroll: boolean;
  placement: ThreadTimelineUnreadDividerPlacement | null;
}

interface ShouldTrackThreadUnreadDividerArgs {
  routeThreadId: string | undefined;
  threadId: string | undefined;
}

interface IsThreadUnreadArgs {
  lastReadAt: number | null | undefined;
  latestAttentionAt: number | undefined;
}

interface UseThreadUnreadDividerStateArgs {
  routeThreadId: string | undefined;
  thread: ThreadUnreadDividerThreadState | undefined;
}

const NO_UNREAD_DIVIDER_STATE: ThreadUnreadDividerState = {
  autoScroll: false,
  placement: null,
};

const THREAD_SEND_LIFECYCLE_OPERATIONS = new Set([
  "send_message",
  "queue_message",
]);

function isSendToThread(mutation: Mutation, threadId: string): boolean {
  const variables: unknown = mutation.state.variables;
  return (
    THREAD_SEND_LIFECYCLE_OPERATIONS.has(
      String(mutation.meta?.lifecycleOperation),
    ) &&
    typeof variables === "object" &&
    variables !== null &&
    "id" in variables &&
    variables.id === threadId
  );
}

function useLatestThreadSendAt(threadId: string | undefined): number {
  const submittedAts = useMutationState({
    filters: {
      predicate: (mutation) =>
        threadId !== undefined && isSendToThread(mutation, threadId),
    },
    select: (mutation) => mutation.state.submittedAt,
  });
  return submittedAts.reduce((latest, at) => Math.max(latest, at), 0);
}

function shouldTrackThreadUnreadDivider({
  routeThreadId,
  threadId,
}: ShouldTrackThreadUnreadDividerArgs): boolean {
  if (threadId === undefined || routeThreadId !== threadId) {
    return false;
  }

  return true;
}

function isThreadUnread({
  lastReadAt,
  latestAttentionAt,
}: IsThreadUnreadArgs): boolean {
  if (lastReadAt === undefined || latestAttentionAt === undefined) {
    return false;
  }
  return lastReadAt === null || lastReadAt < latestAttentionAt;
}

function buildUnreadDividerPlacement(
  thread: ThreadUnreadDividerThreadState,
): ThreadTimelineUnreadDividerPlacement | null {
  if (thread.lastReadAt === null) {
    return { kind: "before-first" };
  }
  if (thread.lastReadAt < thread.latestAttentionAt) {
    return { kind: "after-cutoff", cutoffAt: thread.lastReadAt };
  }
  return null;
}

export function useThreadUnreadDividerState({
  routeThreadId,
  thread,
}: UseThreadUnreadDividerStateArgs): ThreadUnreadDividerState {
  const [snapshot, setSnapshot] = useState<ThreadUnreadDividerSnapshot | null>(
    null,
  );
  const trackedThreadIdRef = useRef<string | null>(null);
  const hiddenSinceSnapshotRef = useRef(false);
  const snapshotAttentionAtRef = useRef<number | null>(null);
  const threadId = thread?.id;
  const latestSendAt = useLatestThreadSendAt(threadId);

  useEffect(
    () =>
      subscribeToDocumentVisibility(() => {
        if (!isDocumentVisible()) {
          hiddenSinceSnapshotRef.current = true;
        }
      }),
    [],
  );
  const threadLastReadAt = thread?.lastReadAt;
  const threadLatestAttentionAt = thread?.latestAttentionAt;

  useEffect(() => {
    if (
      threadId === undefined ||
      threadLastReadAt === undefined ||
      threadLatestAttentionAt === undefined ||
      !shouldTrackThreadUnreadDivider({
        routeThreadId,
        threadId,
      })
    ) {
      trackedThreadIdRef.current = null;
      setSnapshot(null);
      return;
    }

    const isFirstTrackedThreadState = trackedThreadIdRef.current !== threadId;
    trackedThreadIdRef.current = threadId;
    const watchedSinceSnapshot =
      !hiddenSinceSnapshotRef.current && isDocumentVisible();
    if (
      isFirstTrackedThreadState ||
      snapshotAttentionAtRef.current !== threadLatestAttentionAt
    ) {
      snapshotAttentionAtRef.current = threadLatestAttentionAt;
      hiddenSinceSnapshotRef.current = !isDocumentVisible();
    }
    const threadState: ThreadUnreadDividerThreadState = {
      id: threadId,
      lastReadAt: threadLastReadAt,
      latestAttentionAt: threadLatestAttentionAt,
    };

    setSnapshot((currentSnapshot) => {
      if (
        currentSnapshot?.threadId === threadId &&
        latestSendAt > currentSnapshot.sentThrough
      ) {
        return {
          attentionAt: threadLatestAttentionAt,
          autoScroll: false,
          placement: null,
          sentThrough: latestSendAt,
          threadId,
        };
      }
      if (
        currentSnapshot?.threadId === threadId &&
        currentSnapshot.attentionAt === threadLatestAttentionAt
      ) {
        if (threadLastReadAt === null) {
          const autoScroll =
            currentSnapshot.placement !== null && currentSnapshot.autoScroll;
          return {
            attentionAt: threadLatestAttentionAt,
            autoScroll,
            placement: { kind: "before-first" },
            sentThrough: currentSnapshot.sentThrough,
            threadId,
          };
        }
        return currentSnapshot;
      }

      if (
        !isFirstTrackedThreadState &&
        watchedSinceSnapshot &&
        currentSnapshot?.threadId === threadId
      ) {
        return {
          ...currentSnapshot,
          attentionAt: threadLatestAttentionAt,
          autoScroll: false,
        };
      }

      const placement = buildUnreadDividerPlacement(threadState);
      return {
        attentionAt: threadLatestAttentionAt,
        autoScroll: isFirstTrackedThreadState && placement !== null,
        placement,
        sentThrough: latestSendAt,
        threadId,
      };
    });
  }, [
    latestSendAt,
    routeThreadId,
    threadId,
    threadLastReadAt,
    threadLatestAttentionAt,
  ]);

  if (
    !shouldTrackThreadUnreadDivider({
      routeThreadId,
      threadId,
    }) ||
    snapshot === null ||
    snapshot.threadId !== threadId ||
    latestSendAt > snapshot.sentThrough ||
    (snapshot.attentionAt !== threadLatestAttentionAt &&
      !isThreadUnread({
        lastReadAt: threadLastReadAt,
        latestAttentionAt: threadLatestAttentionAt,
      }))
  ) {
    return NO_UNREAD_DIVIDER_STATE;
  }

  return {
    autoScroll: snapshot.autoScroll && snapshot.placement !== null,
    placement: snapshot.placement,
  };
}
