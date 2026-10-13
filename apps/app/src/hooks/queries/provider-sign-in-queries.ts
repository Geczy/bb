import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TerminalSession } from "@bb/server-contract";
import { useCloseTerminal, useCreateTerminal } from "./thread-terminal-queries";
import { providerSignInQueryKey } from "./query-keys";
import { applyTerminalSessionUpsert } from "../cache-owners/terminal-cache-owner";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "@/components/thread/terminal/useThreadTerminalController";

export function useProviderSignIn(threadId: string, turnId: string) {
  const queryClient = useQueryClient();
  const queryKey = providerSignInQueryKey(threadId, turnId);
  const create = useCreateTerminal();
  const close = useCloseTerminal();
  const state = useQuery<TerminalSession | null>({
    queryKey,
    queryFn: skipToken,
    initialData: null,
    gcTime: Infinity,
  });
  const signIn = async () => {
    const current = queryClient.getQueryData<TerminalSession | null>(queryKey);
    if (current?.status === "running" || current?.status === "starting") return;
    const owner = queryClient.getQueryCache().find({ queryKey, exact: true });
    try {
      await queryClient.fetchQuery({
        queryKey,
        gcTime: Infinity,
        staleTime: 0,
        retry: false,
        queryFn: async () => {
          const session = await create.mutateAsync({
            target: { kind: "thread", threadId },
            start: { mode: "provider-login", turnId },
            title: "Provider sign-in",
            cols: DEFAULT_TERMINAL_COLS,
            rows: DEFAULT_TERMINAL_ROWS,
          });
          if (
            queryClient.getQueryCache().find({ queryKey, exact: true }) !==
            owner
          ) {
            await close.mutateAsync({ terminalId: session.id, mode: "force" });
            return null;
          }
          return session;
        },
      });
    } catch {}
  };
  const cancel = async () => {
    const current = queryClient.getQueryData<TerminalSession | null>(queryKey);
    if (!current) return;
    try {
      await close.mutateAsync({ terminalId: current.id, mode: "force" });
    } catch {}
  };
  return {
    session: state.data ?? null,
    pending: state.isFetching,
    error: state.error,
    closing: close.isPending,
    signIn,
    cancel,
    updateSession: (session: TerminalSession) =>
      applyTerminalSessionUpsert({ queryClient, session }),
  };
}
