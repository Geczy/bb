// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalSession } from "@bb/server-contract";
import { sdk } from "@/lib/sdk";
import { ProviderSignIn } from "./ProviderSignIn";

vi.mock("@/lib/sdk", () => ({
  BbHttpError: class extends Error {},
  sdk: { terminals: { create: vi.fn(), close: vi.fn(), list: vi.fn() } },
}));
vi.mock("../terminal/ThreadTerminalView.js", () => ({
  ThreadTerminalView: ({ session }: { session: TerminalSession }) => (
    <div>Terminal {session.id}</div>
  ),
}));

const session: TerminalSession = {
  id: "login-a",
  threadId: "thread-a",
  environmentId: "env-a",
  hostId: "host-a",
  title: "Provider sign-in",
  initialCwd: "/workspace",
  cols: 80,
  rows: 24,
  status: "running",
  exitCode: null,
  closeReason: null,
  createdAt: 1,
  updatedAt: 1,
  lastUserInputAt: null,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("inline provider sign-in ownership", () => {
  it.each([false, true])(
    "reattaches the same login after unmount (pending=%s)",
    async (pending) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      let resolve!: (value: TerminalSession) => void;
      vi.mocked(sdk.terminals.create).mockReturnValue(
        new Promise<TerminalSession>((done) => {
          resolve = done;
        }),
      );
      vi.mocked(sdk.terminals.close).mockResolvedValue({
        ...session,
        status: "exited",
        closeReason: "user",
      });
      vi.mocked(sdk.terminals.list).mockResolvedValue({ sessions: [session] });
      const view = (visible: boolean) => (
        <QueryClientProvider client={client}>
          {visible ? (
            <ProviderSignIn threadId="thread-a" turnId="failed-a" />
          ) : null}
        </QueryClientProvider>
      );
      const mounted = render(view(true));
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() =>
        expect(sdk.terminals.create).toHaveBeenCalledTimes(1),
      );
      if (!pending) await act(async () => resolve(session));
      mounted.rerender(view(false));
      mounted.rerender(view(true));
      if (pending) {
        expect(
          screen
            .getByRole("button", { name: "Starting sign-in…" })
            .hasAttribute("disabled"),
        ).toBe(true);
        mounted.rerender(view(false));
        await act(async () => resolve(session));
        mounted.rerender(view(true));
      }
      await screen.findByText("Terminal login-a");
      expect(
        screen
          .getByRole("button", { name: "Sign in" })
          .hasAttribute("disabled"),
      ).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
      await waitFor(() =>
        expect(sdk.terminals.close).toHaveBeenCalledWith({
          terminalId: "login-a",
          mode: "force",
        }),
      );
      await waitFor(() =>
        expect(
          screen
            .getByRole("button", { name: "Sign in" })
            .hasAttribute("disabled"),
        ).toBe(false),
      );
      expect(sdk.terminals.create).toHaveBeenCalledTimes(1);
      mounted.unmount();
      client.clear();
    },
  );
});
