import type { QueryClient } from "@tanstack/react-query";
import { invalidateRpcQueries } from "@get-bb/plugin-sdk/internal/rpc-query-host";

export { invalidateRpcQueries as invalidatePluginRpcQueries };

export function refreshPluginRpcQueries(queryClient: QueryClient): void {
  const pluginIds = new Set<string>();
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: ["plugin-rpc"] })) {
    const pluginId = query.queryKey[1];
    if (typeof pluginId === "string") pluginIds.add(pluginId);
  }
  for (const pluginId of pluginIds)
    invalidateRpcQueries(queryClient, pluginId, null);
}
