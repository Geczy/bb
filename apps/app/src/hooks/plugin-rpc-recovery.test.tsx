// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import {
  createRpcQueryHooks,
  type RpcQueryHost,
} from "@get-bb/plugin-sdk/internal/rpc-query-host";
import { createRealtimeCacheEffects } from "./realtime-cache-effects";

const disposers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
});

it.each(["initial connection", "reconnection", "resume"] as const)(
  "refreshes cached keyed rows on %s after missing a change",
  async (event) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const effects = createRealtimeCacheEffects({
      queryClient,
      visibility: {
        isDocumentVisible: () => true,
        subscribe: () => () => {},
      },
    });
    disposers.push(() => {
      effects.dispose();
      queryClient.clear();
    });
    let value = 1;
    const host: RpcQueryHost = {
      pluginId: "producer",
      queryClient,
      call: async () => ({
        result: { a: value },
        keyTags: { a: ["item:a"] },
      }),
      subscribeRead: () => () => {},
    };
    const hooks = createRpcQueryHooks(() => host);
    const mounted = renderHook(() =>
      hooks.experimental_useRpcKeyedQuery<number>({
        method: "keyed",
        keys: ["a"],
      }),
    );
    await waitFor(() => expect(mounted.result.current.data).toEqual({ a: 1 }));
    value = 2;
    act(() => {
      if (event === "resume") effects.handleResumed();
      else if (event === "reconnection")
        effects.handleConnected({
          reconnected: true,
          disconnectedAt: Date.now() + 1,
        });
      else effects.handleConnected({ reconnected: false });
    });
    await waitFor(() => expect(mounted.result.current.data).toEqual({ a: 2 }));
  },
);
