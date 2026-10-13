import { lazy, Suspense, useState } from "react";
import type { TerminalSession } from "@bb/server-contract";
import { Button } from "@bb/shared-ui/button";
import {
  useCloseTerminal,
  useCreateTerminal,
} from "@/hooks/queries/thread-terminal-queries";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "../terminal/useThreadTerminalController.js";

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
  const create = useCreateTerminal();
  const close = useCloseTerminal();
  const [session, setSession] = useState<TerminalSession | null>(null);
  const running =
    session?.status === "running" || session?.status === "starting";
  const signIn = async () => {
    try {
      setSession(
        await create.mutateAsync({
          target: { kind: "thread", threadId },
          start: { mode: "provider-login", turnId },
          title: "Provider sign-in",
          cols: DEFAULT_TERMINAL_COLS,
          rows: DEFAULT_TERMINAL_ROWS,
        }),
      );
    } catch {}
  };
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={create.isPending || running}
          onClick={() => void signIn()}
        >
          {create.isPending ? "Starting sign-in…" : "Sign in"}
        </Button>
        {running && session !== null ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={close.isPending}
            onClick={() => {
              void close
                .mutateAsync({ terminalId: session.id, mode: "force" })
                .then((next) => setSession(next))
                .catch(() => undefined);
            }}
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
      {create.error ? (
        <p role="alert" className="text-sm text-destructive">
          {create.error.message}
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
              onSessionChange={setSession}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
