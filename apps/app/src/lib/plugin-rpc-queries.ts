import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createRpcQueryHooks } from "@get-bb/plugin-sdk/internal/rpc-query-host";
import { usePluginId } from "@/components/plugin/plugin-context";
import { wsManager } from "./ws";
import { callPluginRpc } from "./plugin-sdk-hooks";

export const {
  experimental_useRpcQuery,
  experimental_useRpcKeyedQuery,
  experimental_useRpcRefresh,
} = createRpcQueryHooks(() => {
  const pluginId = usePluginId();
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      pluginId,
      queryClient,
      call: (
        id: string,
        method: string,
        input: import("@bb/domain").JsonValue,
        signal: AbortSignal | undefined,
        warmKeyedMethods?: readonly string[],
      ) =>
        callPluginRpc(fetch, id, method, input, signal, true, warmKeyedMethods),
      subscribeRead(
        id: string,
        method: string,
        reads: readonly (
          | { input: import("@bb/domain").JsonValue }
          | { key: string }
        )[],
        whileWatched: boolean,
      ) {
        const target = { kind: "plugin" as const, pluginId: id };
        const interests = (whileWatched ? reads : []).map((read) => ({
          kind: "plugin-read" as const,
          pluginId: id,
          method,
          read,
        }));
        wsManager.subscribe(target);
        let held = false;
        const update = () => {
          const visible = document.visibilityState !== "hidden";
          if (visible === held) return;
          held = visible;
          for (const interest of interests)
            if (held) wsManager.subscribe(interest);
            else wsManager.unsubscribe(interest);
        };
        update();
        document.addEventListener("visibilitychange", update);
        return () => {
          document.removeEventListener("visibilitychange", update);
          if (held)
            for (const interest of interests) wsManager.unsubscribe(interest);
          wsManager.unsubscribe(target);
        };
      },
    }),
    [pluginId, queryClient],
  );
});
