import { Component, Suspense, type ReactNode } from "react";
import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import {
  threadDetailBootstrapQueryOptions,
  threadTimelineQueryOptions,
} from "@/hooks/queries/thread-queries";
import { useServerConnectionState } from "@/hooks/useServerConnectionState";

interface ThreadOpenGateProps {
  threadId: string;
  enabled: boolean;
}

class ThreadOpenErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ThreadOpenData({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  useSuspenseQueries({
    queries: [
      threadDetailBootstrapQueryOptions(queryClient, threadId),
      threadTimelineQueryOptions(queryClient, threadId),
    ],
  });
  return null;
}

export function ThreadOpenGate({ threadId, enabled }: ThreadOpenGateProps) {
  const isConnected = useServerConnectionState() === "connected";
  return (
    <Suspense fallback={null}>
      {enabled && isConnected ? (
        <ThreadOpenErrorBoundary key={threadId}>
          <ThreadOpenData threadId={threadId} />
        </ThreadOpenErrorBoundary>
      ) : null}
    </Suspense>
  );
}
