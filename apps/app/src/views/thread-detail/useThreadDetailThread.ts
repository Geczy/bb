import {
  didThreadDetailBootstrapRefreshAfterMount,
  useThread,
  useThreadDetailBootstrap,
} from "@/hooks/queries/thread-queries";
import { useThreadUnreadDividerState } from "./useThreadUnreadDividerState";

export function useThreadDetailThread(threadId: string) {
  const threadDetailBootstrapQuery = useThreadDetailBootstrap(threadId);
  const hasThreadDetailBootstrapSettled =
    threadDetailBootstrapQuery.isSuccess || threadDetailBootstrapQuery.isError;
  const threadQuery = useThread(threadId, {
    enabled: hasThreadDetailBootstrapSettled,
    refetchOnMount: didThreadDetailBootstrapRefreshAfterMount(
      threadDetailBootstrapQuery,
    )
      ? false
      : "always",
  });
  const thread = threadQuery.data;
  const unreadDividerState = useThreadUnreadDividerState({
    hasFreshThread:
      thread !== undefined &&
      !threadQuery.isFetching &&
      !threadDetailBootstrapQuery.isFetching,
    routeThreadId: threadId,
    thread,
  });
  return {
    hasThreadDetailBootstrapSettled,
    threadDetailBootstrapQuery,
    threadQuery,
    unreadDividerState,
  };
}
