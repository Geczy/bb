import { lazy, Suspense } from "react";
import { Button } from "@bb/shared-ui/button";
import { useProviderSignIn } from "@/hooks/queries/provider-sign-in-queries";

const ThreadTerminalView = lazy(() =>
  import("../terminal/ThreadTerminalView.js").then((module) => ({
    default: module.ThreadTerminalView,
  })),
);

export function ProviderSignIn({
  threadId,
  turnId,
}: {
  threadId: string;
  turnId: string;
}) {
  const { session, pending, error, signIn, cancel, closing, updateSession } =
    useProviderSignIn(threadId, turnId);
  const running =
    session?.status === "running" || session?.status === "starting";
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || running}
          onClick={() => void signIn()}
        >
          {pending ? "Starting sign-in…" : "Sign in"}
        </Button>
        {running && session !== null ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={closing}
            onClick={() => void cancel()}
          >
            Cancel sign-in
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {session?.status === "exited"
          ? session.exitCode === 0
            ? "Sign-in command finished. Send a message when you're ready to continue."
            : "Sign-in ended. Your work is still here; you can sign in again or retry."
          : "Sign in on this thread's machine, then send a message to continue."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {session !== null ? (
        <div className="h-80 overflow-hidden rounded-md border">
          <Suspense
            fallback={
              <p className="p-3 text-sm text-muted-foreground">
                Opening sign-in terminal…
              </p>
            }
          >
            <ThreadTerminalView
              autoFocus={false}
              isPanelOpen
              session={session}
              onSessionChange={updateSession}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
