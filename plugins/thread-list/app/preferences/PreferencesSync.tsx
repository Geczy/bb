import { useEffect } from "react";
import { useAtomValue, useStore } from "jotai";
import {
  experimental_usePluginId,
  experimental_useRpcQuery,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { threadListRpcContract } from "../../server.js";

import {
  applyRemotePreferenceSignal,
  attachPreferencesStore,
  attachPreferencesRpc,
  hydratePreferences,
  hydratePreferencesFromMirror,
  preferencesReadyAtom,
} from "./preferences-sync.js";

export function usePreferencesReady(): boolean {
  return useAtomValue(preferencesReadyAtom());
}

let syncOwnerCount = 0;

export function usePreferencesSync(): void {
  const rpc = useRpc<typeof threadListRpcContract>();
  const query = experimental_useRpcQuery<
    typeof threadListRpcContract,
    "listPreferences"
  >({ method: "listPreferences", input: null });
  const store = useStore();
  const pluginId = experimental_usePluginId();
  useEffect(() => {
    attachPreferencesStore(store, pluginId);
    attachPreferencesRpc(rpc);
    syncOwnerCount += 1;
    if (syncOwnerCount === 1) {
      hydratePreferencesFromMirror();
    }
    return () => {
      syncOwnerCount -= 1;
    };
  }, [pluginId, store, rpc]);
  useEffect(() => {
    if (query.data === undefined) return;
    void hydratePreferences(rpc, query.data);
    for (const [key, value] of Object.entries(query.data.preferences))
      applyRemotePreferenceSignal({ key, value });
  }, [query.data, rpc]);
}

export function PreferencesSync() {
  usePreferencesSync();
  return null;
}
