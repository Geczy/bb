import {
  normalizeUsageMeasurement,
  selectUsageResources,
} from "./usage-normalization.js";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod/mini";
import {
  usageSnapshotSchema,
  type ProviderUsage,
  type UsageMachine,
  type UsageProvider,
  type UsageSnapshot,
} from "./usage-schema.js";

import {
  usageListMethod,
  usageFetchMethod,
  type UsageResourceList,
  type UsageMeasurement,
  usageSourceRpcContract,
  type UsageResource as Resource,
} from "./usage-source-contract.js";

interface SourceResult {
  pluginId: string;
  label: string | null;
  resources: UsageResourceList["resources"];
  error: string | null;
}

const TINT_COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([-+.%\w\s,/]*\)|[a-z]{3,20})$/iu;

export const providerUsageRpcContract = defineRpcContract({
  getUsage: {
    input: z.strictObject({
      force: z.boolean(),
      machineIds: z.nullable(z.array(z.string().check(z.minLength(1)))),
      providerIds: z.array(z.string().check(z.minLength(1))),
      maxAgeMs: z.number().check(z.int(), z.nonnegative()),
    }),
    output: usageSnapshotSchema,
  },
});

export type UsageRequest = z.infer<
  typeof providerUsageRpcContract.getUsage.input
>;
function normalizedTint(
  tint: { light: string; dark: string } | undefined,
): { light: string; dark: string } | null {
  if (
    tint === undefined ||
    !TINT_COLOR_PATTERN.test(tint.light.trim()) ||
    !TINT_COLOR_PATTERN.test(tint.dark.trim())
  ) {
    return null;
  }
  return { light: tint.light.trim(), dark: tint.dark.trim() };
}

function normalizedUsage(
  usage: Resource["usage"] | undefined,
): ProviderUsage | null {
  if (usage === undefined) return null;
  switch (usage.status) {
    case "ok":
      return {
        status: "ok",
        accountEmail: usage.accountEmail || null,
        planLabel: usage.planLabel || null,
        windows: usage.windows.map((window) => ({
          label: window.label,
          usedPercent: window.usedPercent,
          resetsAt: window.resetsAt || null,
          cost: window.cost ?? null,
        })),
      };
    case "not_installed":
      return { status: "not_installed" };
    case "unauthenticated":
      return { status: "unauthenticated" };
    case "expired":
      return { status: "expired" };
    case "error":
      return {
        status: "error",
        message: usage.message || "Usage could not be collected.",
      };
  }
}

type Provider = Awaited<
  ReturnType<BbPluginApi["sdk"]["providers"]["list"]>
>[number];

function normalizedProvider(
  provider: Pick<
    Provider,
    "id" | "displayName" | "logoUrl" | "icon" | "strings"
  >,
  usage: Resource["usage"] | undefined,
): UsageProvider {
  return {
    id: provider.id,
    providerId: provider.id,
    accountLabel: null,
    displayName: provider.displayName,
    logoUrl: provider.logoUrl,
    icon: provider.icon ?? null,
    strings: { iconTint: normalizedTint(provider.strings?.iconTint) },
    signInHint:
      provider.strings?.signInHint ??
      "Sign in to " + provider.displayName + ", then reload usage.",
    expiredHint:
      provider.strings?.expiredHint ??
      "Your " +
        provider.displayName +
        " session expired. Sign in again, then reload usage.",
    usage: normalizedUsage(usage),
  };
}

function resourceProvider(
  resource: UsageResourceList["resources"][number],
  measurement: UsageMeasurement | undefined,
  pluginId: string,
  providers: Provider[],
): UsageProvider {
  const metadata = providers.find(
    (provider) => provider.id === resource.providerId,
  );
  return {
    ...normalizedProvider(
      metadata ?? {
        id: resource.providerId,
        displayName: resource.providerId,
        logoUrl: null,
      },
      measurement?.usage,
    ),
    ...(resource.scope.kind === "shared"
      ? {
          signInHint:
            "Sign in to this account in the source plugin’s settings, then reload usage.",
          expiredHint:
            "This account’s session expired. Sign in again in the source plugin’s settings, then reload usage.",
        }
      : {}),
    id: `${pluginId}:${resource.id}`,
    accountLabel:
      resource.scope.kind === "shared"
        ? (measurement?.usage.accountEmail ?? resource.label)
        : null,
  };
}

export default function providerUsagePlugin(bb: BbPluginApi): void {
  const inventories = new Map<string, SourceResult>();
  const measurements = new Map<
    string,
    { value: UsageMeasurement; loadedAt: number }
  >();
  const failures = new Map<string, number>();
  const resourceGenerations = new Map<string, number>();
  const pending = new Map<
    string,
    { force: boolean; generation: number; promise: Promise<UsageMeasurement> }
  >();
  const keyOf = (pluginId: string, resourceId: string) =>
    JSON.stringify([pluginId, resourceId]);
  const fetchResource = async (
    pluginId: string,
    resourceId: string,
    force: boolean,
  ): Promise<UsageMeasurement> => {
    const key = keyOf(pluginId, resourceId);
    const generation = resourceGenerations.get(key) ?? 0;
    const running = pending.get(key);
    if (running?.generation === generation) {
      if (!force || running.force) return running.promise;
      await running.promise.catch(() => undefined);
      return fetchResource(pluginId, resourceId, force);
    }
    const promise = bb.sdk.plugins
      .callRpc({
        pluginId,
        method: usageFetchMethod,
        input: { resourceId, refresh: force },
        outputSchema: usageSourceRpcContract[usageFetchMethod].output,
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(45_000)]),
      })
      .then((raw) => {
        const value = normalizeUsageMeasurement(raw);
        if (value.usage.status === "error")
          throw new Error("Usage could not be refreshed.");
        if ((resourceGenerations.get(key) ?? 0) === generation) {
          measurements.set(key, { value, loadedAt: Date.now() });
          failures.delete(key);
        }
        return value;
      })
      .catch((error) => {
        if ((resourceGenerations.get(key) ?? 0) === generation)
          failures.set(key, Date.now());
        throw error;
      })
      .finally(() => {
        if (pending.get(key)?.promise === promise) pending.delete(key);
      });
    pending.set(key, { force, generation, promise });
    return promise;
  };
  let sources: Awaited<
    ReturnType<typeof bb.sdk.plugins.experimental_discoverRpc>
  > = [];
  let inventoryUpdatedAt: number | null = null;
  let discoveryGeneration = 0;
  let discoveryError: Error | null = null;
  let inventoryPending: Promise<void> | null = null;
  const lifetime = new AbortController();
  bb.onDispose(() => {
    lifetime.abort();
    for (const stop of sourceStops.values()) stop();
    sourceStops.clear();
  });
  const sourceStops = new Map<string, () => void>();
  const sourceReady = new Map<string, Promise<void>>();
  const sourceGenerations = new Map<string, number>();
  const evictResources = (
    pluginId: string,
    next: UsageResourceList["resources"],
  ) => {
    for (const resource of inventories.get(pluginId)?.resources ?? []) {
      if (next.some((item) => item.id === resource.id)) continue;
      const key = keyOf(pluginId, resource.id);
      resourceGenerations.set(key, (resourceGenerations.get(key) ?? 0) + 1);
      measurements.delete(key);
      failures.delete(key);
    }
  };
  const acceptInventory = (pluginId: string, inventory: UsageResourceList) => {
    if (!sources.some((source) => source.pluginId === pluginId)) return;
    const next = {
      pluginId,
      label: inventory.label ?? null,
      resources: inventory.resources,
      error: null,
    };
    if (JSON.stringify(inventories.get(pluginId)) === JSON.stringify(next))
      return;
    evictResources(pluginId, inventory.resources);
    inventories.set(pluginId, next);
    bb.rpc.experimental_invalidate(["inventory"]);
  };
  const startSource = (id: string) => {
    sourceStops.get(id)?.();
    const generation = (sourceGenerations.get(id) ?? 0) + 1;
    sourceGenerations.set(id, generation);
    const controller = new AbortController();
    let settle!: () => void;
    let timer: ReturnType<typeof setTimeout>;
    const ready = () => {
      clearTimeout(timer);
      settle();
    };
    const onError = () => {
      if (
        sourceGenerations.get(id) === generation &&
        sources.some((source) => source.pluginId === id)
      ) {
        const old = inventories.get(id);
        inventories.set(id, {
          pluginId: id,
          label: old?.label ?? null,
          resources: old?.resources ?? [],
          error: "Usage resources could not be listed.",
        });
        bb.rpc.experimental_invalidate(["inventory"]);
      }
      ready();
    };
    sourceReady.set(
      id,
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    timer = setTimeout(() => {
      controller.abort();
      onError();
    }, 45_000);
    const stop = bb.sdk.plugins.experimental_watchRpc({
      pluginId: id,
      method: usageListMethod,
      input: {},
      outputSchema: usageSourceRpcContract[usageListMethod].output,
      signal: AbortSignal.any([lifetime.signal, controller.signal]),
      onChange: (inventory) => {
        if (sourceGenerations.get(id) === generation)
          acceptInventory(id, inventory);
        ready();
      },
      onError,
    });
    sourceStops.set(id, () => {
      controller.abort();
      stop();
      ready();
    });
  };
  const updateSources = (next: typeof sources) => {
    discoveryGeneration++;
    const changed =
      discoveryError !== null ||
      JSON.stringify(sources) !== JSON.stringify(next);
    discoveryError = null;
    sources = next;
    const ids = new Set(next.map((source) => source.pluginId));
    for (const [id, stop] of sourceStops)
      if (!ids.has(id)) {
        stop();
        sourceStops.delete(id);
        sourceReady.delete(id);
        sourceGenerations.set(id, (sourceGenerations.get(id) ?? 0) + 1);
        evictResources(id, []);
        inventories.delete(id);
      }
    for (const id of ids) if (!sourceStops.has(id)) startSource(id);
    if (changed) bb.rpc.experimental_invalidate(["inventory"]);
  };
  const waitForSources = async () => {
    let generation: number;
    do {
      generation = discoveryGeneration;
      await Promise.all(
        sources.map((source) => sourceReady.get(source.pluginId)),
      );
      lifetime.signal.throwIfAborted();
      if (discoveryError) throw discoveryError;
    } while (generation !== discoveryGeneration);
  };
  const reconcileInventory = (): Promise<void> => {
    if (inventoryPending) return inventoryPending;
    inventoryPending = (async () => {
      const existing = new Set(sourceStops.keys());
      const started = discoveryGeneration;
      const discovered = await bb.sdk.plugins.experimental_discoverRpc({
        method: usageListMethod,
        signal: lifetime.signal,
      });
      lifetime.signal.throwIfAborted();
      if (started === discoveryGeneration) updateSources(discovered);
      if (discoveryError) throw discoveryError;
      for (const source of sources)
        if (existing.has(source.pluginId)) startSource(source.pluginId);
      await waitForSources();
      inventoryUpdatedAt = Date.now();
    })().finally(() => {
      inventoryPending = null;
    });
    return inventoryPending;
  };
  bb.background.service("usage-inventories", {
    async start(signal) {
      const stopHosts = bb.sdk.subscribe({
        event: "host:changed",
        callback: () => bb.rpc.experimental_invalidate(["inventory"]),
      });
      const stopSystem = bb.sdk.subscribe({
        event: "system:changed",
        callback: (event) => {
          if (event.changes.includes("config-changed"))
            bb.rpc.experimental_invalidate(["inventory"]);
        },
      });
      const stop = bb.sdk.plugins.experimental_watchDiscovery({
        method: usageListMethod,
        signal,
        onChange: updateSources,
        onError: (error) => {
          discoveryGeneration++;
          discoveryError = error;
          inventoryUpdatedAt = null;
          bb.rpc.experimental_invalidate(["inventory"]);
        },
      });
      try {
        if (!signal.aborted)
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
      } finally {
        stopHosts();
        stopSystem();
        stop();
        for (const dispose of sourceStops.values()) dispose();
        sourceStops.clear();
      }
    },
  });
  const readUsage = async (request: UsageRequest): Promise<UsageSnapshot> => {
    if (
      request.force ||
      discoveryError !== null ||
      inventoryPending !== null ||
      inventoryUpdatedAt === null ||
      Date.now() - inventoryUpdatedAt >= 5 * 60_000
    )
      await reconcileInventory();
    const hostId = request.machineIds?.find((id) => !id.startsWith("source:"));
    const [hosts, providers, config] = await Promise.all([
      bb.sdk.hosts
        .list()
        .then((hosts) => hosts.filter((host) => host.type !== "ephemeral")),
      bb.sdk.providers
        .list(
          hostId === undefined
            ? { capability: "usage" }
            : { capability: "usage", hostId },
        )
        .catch(() => []),
      bb.sdk.system.config().catch(() => null),
    ]);
    await waitForSources();
    hosts.sort(
      (a, b) =>
        Number(b.id === config?.primaryHostId) -
        Number(a.id === config?.primaryHostId),
    );
    for (const id of inventories.keys())
      if (!sources.some((source) => source.pluginId === id))
        inventories.delete(id);

    const keys = new Set(
      [...inventories.values()].flatMap((source) =>
        source.resources.map((resource) => keyOf(source.pluginId, resource.id)),
      ),
    );
    for (const key of measurements.keys())
      if (!keys.has(key)) {
        measurements.delete(key);
        failures.delete(key);
      }
    const selected = [...inventories.values()].flatMap((source) =>
      source.resources
        .filter((resource) => {
          const machineId =
            resource.scope.kind === "shared"
              ? `source:${source.pluginId}`
              : resource.scope.hostId;
          return (
            request.providerIds.includes(resource.providerId) &&
            (request.machineIds === null ||
              request.machineIds.includes(machineId)) &&
            (resource.scope.kind === "shared" ||
              hosts.some(
                (host) =>
                  resource.scope.kind === "host" &&
                  host.id === resource.scope.hostId &&
                  host.status === "connected",
              ))
          );
        })
        .map((resource) => ({ source, resource })),
    );
    for (let offset = 0; offset < selected.length; offset += 3) {
      await Promise.all(
        selected.slice(offset, offset + 3).map(async ({ source, resource }) => {
          const key = keyOf(source.pluginId, resource.id);
          const cached = measurements.get(key);
          if (
            !request.force &&
            cached !== undefined &&
            Date.now() - Math.max(cached.loadedAt, failures.get(key) ?? 0) <
              request.maxAgeMs
          )
            return;
          await fetchResource(
            source.pluginId,
            resource.id,
            request.force,
          ).catch(() => undefined);
        }),
      );
    }
    const machines: UsageMachine[] = hosts.map((host) => ({
      id: host.id,
      displayName: host.name,
      status: host.status,
      providers: [],
      error: null,
    }));
    const candidates: Array<{
      source: SourceResult;
      resource: UsageResourceList["resources"][number];
      machineId: string;
    }> = [];
    for (const source of inventories.values()) {
      const hasShared =
        source.label !== null ||
        source.resources.some((resource) => resource.scope.kind === "shared");
      if (hasShared || (source.error !== null && source.resources.length === 0))
        machines.push({
          id: `source:${source.pluginId}`,
          displayName:
            source.label ??
            sources.find((item) => item.pluginId === source.pluginId)
              ?.displayName ??
            source.pluginId,
          status: "connected",
          providers: [],
          error: source.error,
        });
      for (const resource of source.resources) {
        const machineId =
          resource.scope.kind === "shared"
            ? `source:${source.pluginId}`
            : resource.scope.hostId;
        candidates.push({ source, resource, machineId });
      }
    }
    for (const machine of machines) {
      const visible = selectUsageResources(
        candidates.filter((candidate) => candidate.machineId === machine.id),
        ({ source, resource }) => ({
          ...resource,
          accountKey: measurements.has(keyOf(source.pluginId, resource.id))
            ? measurements.get(keyOf(source.pluginId, resource.id))!.value
                .accountKey
            : resource.accountKey,
        }),
      );
      for (const { source, resource } of visible) {
        const key = keyOf(source.pluginId, resource.id);
        const cached = measurements.get(key);
        machine.providers.push(
          resourceProvider(resource, cached?.value, source.pluginId, providers),
        );
        if (source.error !== null || failures.has(key))
          machine.error = "Some usage could not be refreshed.";
      }
    }
    const providerOrder = new Map(
      providers.map((provider, index) => [provider.id, index]),
    );
    for (const machine of machines)
      machine.providers.sort(
        (a, b) =>
          (providerOrder.get(a.providerId) ?? Number.MAX_SAFE_INTEGER) -
          (providerOrder.get(b.providerId) ?? Number.MAX_SAFE_INTEGER),
      );
    return { machines };
  };
  bb.rpc.register(providerUsageRpcContract, {
    getUsage: async (request, context) => {
      context.experimental_tag(
        "inventory",
        ...(request.providerIds.length === 0
          ? []
          : [
              "usage",
              ...(request.machineIds?.map((id) => `usage:${id}`) ?? [
                "usage:all",
              ]),
            ]),
      );
      const result = await readUsage(request);
      if (request.force)
        bb.rpc.experimental_invalidate([
          "inventory",
          "usage:all",
          ...(request.machineIds?.map((id) => `usage:${id}`) ?? []),
        ]);
      return result;
    },
  });
  let watchCount = 0;
  let inventoryTimer: ReturnType<typeof setInterval> | null = null;
  bb.rpc.experimental_whileWatched("getUsage", (read, signal) => {
    if (!("input" in read)) return;
    const parsed = providerUsageRpcContract.getUsage.input.safeParse(
      read.input,
    );
    if (!parsed.success) return;
    const request = parsed.data;
    const refreshIntervalMs = Math.max(1_000, request.maxAgeMs);
    watchCount++;
    if (watchCount === 1)
      inventoryTimer = setInterval(() => {
        void reconcileInventory().catch((error) => {
          if (lifetime.signal.aborted) return;
          bb.log.warn(String(error));
          bb.rpc.experimental_invalidate(["inventory"]);
        });
      }, 30 * 60_000);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      try {
        await readUsage({ ...request, force: false });
      } catch (error) {
        if (!signal.aborted) bb.log.warn(String(error));
      } finally {
        if (!signal.aborted) {
          bb.rpc.experimental_invalidate([
            "usage:all",
            ...(request.machineIds?.map((id) => `usage:${id}`) ?? []),
          ]);
          timer = setTimeout(() => {
            void refresh();
          }, refreshIntervalMs);
        }
      }
    };
    if (request.providerIds.length > 0)
      timer = setTimeout(() => {
        void refresh();
      }, refreshIntervalMs);
    signal.addEventListener(
      "abort",
      () => {
        if (timer) clearTimeout(timer);
        watchCount--;
        if (watchCount === 0 && inventoryTimer) {
          clearInterval(inventoryTimer);
          inventoryTimer = null;
        }
      },
      { once: true },
    );
  });
  const markDirty = () => {
    for (const value of measurements.values()) value.loadedAt = 0;
    for (const key of failures.keys()) failures.set(key, 0);
    bb.rpc.experimental_invalidate(["usage"]);
  };
  bb.events.on("thread.idle", markDirty);
  bb.events.on("thread.failed", markDirty);
}
