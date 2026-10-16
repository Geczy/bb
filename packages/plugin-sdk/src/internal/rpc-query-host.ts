import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  useIsFetching,
  QueryObserver,
  replaceEqualDeep,
  type QueryClient,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import {
  canonicalPluginReadInput,
  jsonValueSchema,
  type JsonValue,
} from "@bb/domain";
import { z } from "zod";
import type {
  ExperimentalRpcKeyedQueryState,
  PluginSdkApp,
} from "../app-contract.js";

export interface RpcQueryHost {
  pluginId: string;
  queryClient: QueryClient;
  call(
    pluginId: string,
    method: string,
    input: JsonValue,
    signal: AbortSignal | undefined,
    warmKeyedMethods?: readonly string[],
  ): Promise<unknown>;
  subscribeRead(
    pluginId: string,
    method: string,
    reads: readonly ({ input: JsonValue } | { key: string })[],
    whileWatched: boolean,
  ): () => void;
}
function isRpcJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
  }
  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (const child of value)
      if (!isRpcJsonValue(child, ancestors)) {
        valid = false;
        break;
      }
  } else {
    for (const key in value)
      if (
        Object.hasOwn(value, key) &&
        !isRpcJsonValue(Reflect.get(value, key), ancestors)
      ) {
        valid = false;
        break;
      }
  }
  ancestors.delete(value);
  return valid;
}
const envelopeSchema = z.object({
  result: z.custom<JsonValue>(
    (value) => isRpcJsonValue(value),
    "RPC result must be a JSON value",
  ),
  tags: z.array(z.string()).default([]),
  keyTags: z.record(z.string(), z.array(z.string())).default({}),
  whileWatched: z.boolean().default(false),
  providedKeyed: z
    .record(
      z.string(),
      z.object({
        result: z.custom<Record<string, JsonValue>>(
          (value) =>
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            isRpcJsonValue(value),
        ),
        keyTags: z.record(z.string(), z.array(z.string())),
        whileWatched: z.boolean().default(false),
      }),
    )
    .optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;
const interestResponse = z.object({ whileWatched: z.boolean().default(false) });
const taggedResponse = z.object({ tags: z.array(z.string()) });
const generations = new WeakMap<Query, number>();
const inflightTags = new WeakMap<Query, Set<string>>();
const unknownReadTags = new WeakSet<object>();
const overlaps = (tags: readonly string[], missed: ReadonlySet<string>) =>
  tags.some((tag) => missed.has(tag));
const seedGenerations = new WeakMap<QueryClient, Map<string, number>>();
const readOwners = new WeakMap<QueryClient, Map<string, number>>();
const dormantReads = new WeakMap<QueryClient, Set<string>>();

export async function runPluginRpcRead<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
): Promise<T> {
  const query = queryClient
    .getQueryCache()
    .get(queryClient.defaultQueryOptions({ queryKey }).queryHash);
  for (;;) {
    const started = query === undefined ? 0 : (generations.get(query) ?? 0);
    const missed = new Set<string>();
    if (query !== undefined) inflightTags.set(query, missed);
    let result: T;
    try {
      result = await read();
    } catch (error) {
      if (query !== undefined && started !== (generations.get(query) ?? 0))
        continue;
      throw error;
    } finally {
      if (query !== undefined && inflightTags.get(query) === missed)
        inflightTags.delete(query);
    }
    const response = taggedResponse.safeParse(result);
    if (response.success && overlaps(response.data.tags, missed)) continue;
    if (query === undefined || started === (generations.get(query) ?? 0))
      return result;
  }
}

export function invalidateRpcQueries(
  queryClient: QueryClient,
  pluginId: string,
  tags: readonly string[] | null,
): void {
  let revisions = seedGenerations.get(queryClient);
  if (!revisions) {
    revisions = new Map();
    seedGenerations.set(queryClient, revisions);
  }
  revisions.set(pluginId, (revisions.get(pluginId) ?? 0) + 1);
  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: ["plugin-rpc", pluginId] });
  const matching = new Set(
    queries.filter((query) => {
      const invalidateKeyed = keyedInvalidators.get(query);
      if (invalidateKeyed) return invalidateKeyed(tags);
      if (tags === null || unknownReadTags.has(query)) return true;
      const response = taggedResponse.safeParse(query.state.data);
      if (
        response.success &&
        response.data.tags.some((tag) => tags.includes(tag))
      )
        return true;
      const missed = inflightTags.get(query);
      if (!missed) return !response.success;
      for (const tag of tags) missed.add(tag);
      return false;
    }),
  );
  for (const query of matching) {
    generations.set(query, (generations.get(query) ?? 0) + 1);
  }
  void queryClient.invalidateQueries(
    { predicate: (query) => matching.has(query) },
    { cancelRefetch: false },
  );
}

type KeyedSnapshot = {
  data: Record<string, JsonValue>;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
};
const emptyKeyedSnapshot: KeyedSnapshot = {
  data: {},
  error: null,
  isLoading: false,
  isFetching: false,
};
const emptyKeyedView = {
  getSnapshot: () => emptyKeyedSnapshot,
  subscribe() {
    return () => {};
  },
};
function shareKeyedData(
  previous: Record<string, JsonValue>,
  next: Record<string, JsonValue>,
): Record<string, JsonValue> {
  if (previous === next) return previous;
  const keys = Object.keys(next);
  return keys.length === Object.keys(previous).length &&
    keys.every((key) => previous[key] === next[key])
    ? previous
    : next;
}
const keyedInvalidators = new WeakMap<
  Query,
  (tags: readonly string[] | null) => boolean
>();
const keyedOwners = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof createKeyedOwner>>
>();

function createKeyedOwner(
  host: RpcQueryHost,
  pluginId: string,
  method: string,
) {
  const queryKey = ["plugin-rpc", pluginId, method, { keyed: true }];
  const values = new Map<
    string,
    {
      result: JsonValue;
      tags: string[] | undefined;
      whileWatched: boolean;
    }
  >();
  const owners = new Map<string, number>();
  const revisions = new Map<string, number>();
  const dirty = new Set<string>();
  const errors = new Map<string, Error>();
  const listeners = new Set<() => void>();
  let stopObserver: (() => void) | null = null;
  const pending = new Map<string, Promise<void>>();
  const inflightKeyTags = new Map<string, Set<string>>();
  const queued = new Map<
    string,
    { resolve(): void; reject(error: Error): void }
  >();
  const snapshotValues = (): Envelope => ({
    result: Object.fromEntries(
      [...values].map(([key, value]) => [key, value.result]),
    ),
    tags: [
      ...new Set([...values.values()].flatMap((value) => value.tags ?? [])),
    ],
    keyTags: Object.fromEntries(
      [...values].flatMap(([key, value]) =>
        value.tags === undefined ? [] : [[key, value.tags]],
      ),
    ),
    whileWatched: [...values.values()].some((value) => value.whileWatched),
  });
  let flushQueued = false;
  const load = (keys: readonly string[]) => {
    for (const key of keys) {
      if ((values.has(key) && !dirty.has(key)) || pending.has(key)) continue;
      pending.set(
        key,
        new Promise<void>((resolve, reject) =>
          queued.set(key, { resolve, reject }),
        ),
      );
    }
    if (queued.size > 0 && !flushQueued) {
      flushQueued = true;
      queueMicrotask(() => {
        flushQueued = false;
        const batch = new Map(queued);
        queued.clear();
        const requested = [...batch.keys()].sort();
        const flush = async () => {
          await Promise.all(
            Array.from(
              { length: Math.ceil(requested.length / 500) },
              async (_, index) => {
                const keys = requested.slice(index * 500, (index + 1) * 500);
                const versions = keys.map((key) => revisions.get(key) ?? 0);
                for (const key of keys) inflightKeyTags.set(key, new Set());
                let overtaken = false;
                try {
                  const generation =
                    seedGenerations.get(host.queryClient)?.get(pluginId) ?? 0;
                  const response = acceptProvidedKeyed(
                    host,
                    pluginId,
                    envelopeSchema.parse(
                      await host.call(
                        pluginId,
                        method,
                        { keys },
                        undefined,
                        warmKeyedMethods(host, pluginId),
                      ),
                    ),
                    generation,
                  );
                  if (
                    response.result === null ||
                    typeof response.result !== "object" ||
                    Array.isArray(response.result)
                  )
                    throw new Error(
                      `RPC ${method} returned invalid keyed rows`,
                    );
                  const rows = response.result;
                  for (const [index, key] of keys.entries()) {
                    if (versions[index] !== (revisions.get(key) ?? 0)) continue;
                    const result = rows[key];
                    if (result === undefined)
                      throw new Error(`RPC ${method} omitted key ${key}`);
                    const keyTags = [
                      ...response.tags,
                      ...(response.keyTags[key] ?? []),
                    ];
                    if (overlaps(keyTags, inflightKeyTags.get(key)!)) {
                      overtaken = true;
                      dirty.add(key);
                      revisions.set(key, (revisions.get(key) ?? 0) + 1);
                      continue;
                    }
                    values.set(key, {
                      result: replaceEqualDeep(values.get(key)?.result, result),
                      tags: keyTags,
                      whileWatched: response.whileWatched,
                    });
                    dirty.delete(key);
                    errors.delete(key);
                  }
                  for (const key of keys) batch.get(key)?.resolve();
                } catch (error) {
                  const failure =
                    error instanceof Error ? error : new Error(String(error));
                  for (const [index, key] of keys.entries()) {
                    if (versions[index] === (revisions.get(key) ?? 0))
                      errors.set(key, failure);
                    batch.get(key)?.reject(failure);
                  }
                } finally {
                  for (const key of keys) {
                    pending.delete(key);
                    inflightKeyTags.delete(key);
                  }
                  if (overtaken) {
                    if (query)
                      generations.set(query, (generations.get(query) ?? 0) + 1);
                    void observer.refetch({ cancelRefetch: false });
                  }
                  for (const listener of listeners) listener();
                }
              },
            ),
          );
        };
        void flush();
      });
    }
    return Promise.all(
      keys.flatMap((key) => {
        const request = pending.get(key);
        return request ? [request] : [];
      }),
    );
  };
  const observer = new QueryObserver<Envelope>(host.queryClient, {
    queryKey,
    enabled: true,
    staleTime: Infinity,
    queryFn: () =>
      runPluginRpcRead(host.queryClient, queryKey, async () => {
        let requested: string[];
        do {
          requested = [...new Set([...owners.keys(), ...dirty])].filter(
            (key) => owners.has(key) || !values.has(key),
          );
          await load(requested);
        } while (
          requested.some(
            (key) => owners.has(key) && (dirty.has(key) || !values.has(key)),
          )
        );
        return snapshotValues();
      }),
  });
  const query = host.queryClient
    .getQueryCache()
    .find({ queryKey, exact: true });
  const restoreCachedValues = () => {
    const cached = observer.getCurrentQuery().state.data;
    if (
      cached?.result !== null &&
      typeof cached?.result === "object" &&
      !Array.isArray(cached.result)
    )
      for (const [key, result] of Object.entries(cached.result))
        if (!values.has(key))
          values.set(key, {
            result,
            tags: cached.keyTags[key],
            whileWatched: cached.whileWatched,
          });
  };
  const publishValues = () => {
    host.queryClient.setQueryData<Envelope>(queryKey, snapshotValues());
    observer.updateResult();
    for (const listener of listeners) listener();
  };
  const compact = () => {
    const state = observer.getCurrentQuery().state;
    if (
      listeners.size > 0 ||
      pending.size > 0 ||
      state.status !== "success" ||
      state.fetchStatus !== "idle"
    )
      return;
    if (dormantReads.get(host.queryClient)?.has(pluginId)) {
      const cached = observer.getCurrentQuery().state.data;
      if (
        cached &&
        (cached.tags.length > 0 || Object.keys(cached.keyTags).length > 0)
      )
        host.queryClient.setQueryData<Envelope>(queryKey, {
          ...cached,
          tags: [],
          keyTags: {},
        });
      void observer.getCurrentQuery().promise?.then(
        (response) => {
          if (!dormantReads.get(host.queryClient)?.has(pluginId)) return;
          response.tags = [];
          response.keyTags = {};
        },
        () => {},
      );
      observer.updateResult();
    }
    values.clear();
    revisions.clear();
    errors.clear();
  };
  if (query)
    keyedInvalidators.set(query, (tags) => {
      let matched = false;
      const cached = observer.getCurrentQuery().state.data;
      for (const key of new Set([
        ...values.keys(),
        ...owners.keys(),
        ...pending.keys(),
        ...Object.keys(
          cached?.result !== null &&
            typeof cached?.result === "object" &&
            !Array.isArray(cached.result)
            ? cached.result
            : {},
        ),
      ])) {
        const keyTags = values.get(key)?.tags ?? cached?.keyTags[key];
        const missed = inflightKeyTags.get(key);
        if (
          tags !== null &&
          (keyTags === undefined
            ? !values.has(key) && missed !== undefined
            : !keyTags.some((tag) => tags.includes(tag)))
        ) {
          for (const tag of tags) missed?.add(tag);
          continue;
        }
        matched = true;
        dirty.add(key);
        revisions.set(key, (revisions.get(key) ?? 0) + 1);
      }
      return matched;
    });
  return {
    queryKey,
    pluginId,
    method,
    setKey(key: string, value: JsonValue) {
      restoreCachedValues();
      const previous = values.get(key);
      values.set(key, {
        result: replaceEqualDeep(previous?.result, value),
        tags: previous?.tags,
        whileWatched: previous?.whileWatched ?? false,
      });
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      dirty.delete(key);
      errors.delete(key);
      publishValues();
    },
    hasEntries() {
      const result = observer.getCurrentQuery().state.data?.result;
      return (
        values.size > 0 ||
        (result !== null &&
          typeof result === "object" &&
          Object.keys(result).length > 0)
      );
    },
    seed(provided: {
      result: Record<string, JsonValue>;
      keyTags: Record<string, string[]>;
      whileWatched: boolean;
    }) {
      const cached = observer.getCurrentQuery().state.data;
      const cachedRows =
        cached?.result !== null &&
        typeof cached?.result === "object" &&
        !Array.isArray(cached.result)
          ? cached.result
          : null;
      const keys = Object.keys(provided.result).filter(
        (key) =>
          !values.has(key) &&
          (cachedRows === null || !Object.hasOwn(cachedRows, key)),
      );
      if (keys.length === 0) return;
      restoreCachedValues();
      for (const key of keys) {
        values.set(key, {
          result: provided.result[key]!,
          tags: provided.keyTags[key] ?? [],
          whileWatched: provided.whileWatched,
        });
        errors.delete(key);
      }
      publishValues();
    },
    compact: () => queueMicrotask(compact),
    refresh(keys: readonly string[]) {
      for (const key of keys) {
        dirty.add(key);
        revisions.set(key, (revisions.get(key) ?? 0) + 1);
      }
      if (query) generations.set(query, (generations.get(query) ?? 0) + 1);
      return observer.refetch({ cancelRefetch: false });
    },
    watch(keys: readonly string[], enabled: boolean) {
      restoreCachedValues();
      let snapshot: KeyedSnapshot = {
        data: {},
        error: null,
        isLoading: enabled && keys.length > 0,
        isFetching: false,
      };
      const read = () => {
        const data: Record<string, JsonValue> = Object.create(null);
        let missing = false;
        let error: Error | null = null;
        let isFetching = false;
        for (const key of keys) {
          const value = values.get(key)?.result;
          error ??= errors.get(key) ?? null;
          isFetching ||= enabled && pending.has(key);
          if (value === undefined) missing = true;
          else data[key] = value;
        }
        const shared = shareKeyedData(snapshot.data, data);
        const isLoading = enabled && missing && error === null;
        if (
          shared !== snapshot.data ||
          snapshot.error !== error ||
          snapshot.isLoading !== isLoading ||
          snapshot.isFetching !== isFetching
        )
          snapshot = {
            data: shared,
            error,
            isLoading,
            isFetching,
          };
      };
      read();
      return {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) {
          const notify = () => {
            read();
            listener();
          };
          listeners.add(notify);
          if (enabled) {
            for (const key of keys) owners.set(key, (owners.get(key) ?? 0) + 1);
            if (!stopObserver)
              stopObserver = observer.subscribe(() => {
                for (const callback of listeners) callback();
              });
            const missing = keys.filter(
              (key) =>
                (!values.has(key) || dirty.has(key)) && !pending.has(key),
            );
            if (missing.length > 0) {
              if (observer.getCurrentResult().isFetching)
                void load(missing).catch(() => {});
              if (query)
                generations.set(query, (generations.get(query) ?? 0) + 1);
              void observer.refetch({ cancelRefetch: false });
            }
          }
          read();
          return () => {
            listeners.delete(notify);
            if (enabled)
              for (const key of keys) {
                const count = (owners.get(key) ?? 1) - 1;
                if (count > 0) owners.set(key, count);
                else owners.delete(key);
              }
            if (listeners.size === 0) {
              stopObserver?.();
              stopObserver = null;
              queueMicrotask(compact);
            }
          };
        },
      };
    },
  };
}

function getKeyedOwner(host: RpcQueryHost, pluginId: string, method: string) {
  let owners = keyedOwners.get(host.queryClient);
  if (!owners) {
    owners = new Map();
    keyedOwners.set(host.queryClient, owners);
  }
  const identity = JSON.stringify([pluginId, method]);
  let owner = owners.get(identity);
  if (!owner) {
    owner = createKeyedOwner(host, pluginId, method);
    owners.set(identity, owner);
    const currentOwner = owner;
    const currentOwners = owners;
    const queryHash = host.queryClient.defaultQueryOptions({
      queryKey: owner.queryKey,
    }).queryHash;
    const stop = host.queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryHash === queryHash)
        currentOwner.compact();
      if (event.type === "removed" && event.query.queryHash === queryHash) {
        currentOwners.delete(identity);
        stop();
      }
    });
  }
  return owner;
}

function warmKeyedMethods(host: RpcQueryHost, pluginId: string): string[] {
  return [...(keyedOwners.get(host.queryClient)?.values() ?? [])]
    .filter((owner) => owner.pluginId === pluginId && owner.hasEntries())
    .map((owner) => owner.method);
}

function acceptProvidedKeyed(
  host: RpcQueryHost,
  pluginId: string,
  response: Envelope,
  generation: number,
): Envelope {
  const { providedKeyed, ...read } = response;
  if (
    generation === (seedGenerations.get(host.queryClient)?.get(pluginId) ?? 0)
  )
    for (const [method, rows] of Object.entries(providedKeyed ?? {}))
      getKeyedOwner(host, pluginId, method).seed(rows);
  return read;
}

async function readRpcWithDeadline(
  host: RpcQueryHost,
  pluginId: string,
  method: string,
  input: JsonValue,
  timeoutMs: number | undefined,
) {
  if (timeoutMs === undefined)
    return host.call(
      pluginId,
      method,
      input,
      undefined,
      warmKeyedMethods(host, pluginId),
    );
  const duration = z.number().int().positive().parse(timeoutMs);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      host.call(
        pluginId,
        method,
        input,
        controller.signal,
        warmKeyedMethods(host, pluginId),
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              `RPC ${method} timed out after ${duration / 1000} seconds`,
            ),
          );
        }, duration);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const readQueries = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof createReadQuery>>
>();

function createReadQuery(
  host: RpcQueryHost,
  pluginId: string,
  method: string,
  input: JsonValue,
  timeoutMs: number | undefined,
) {
  const queryKey = ["plugin-rpc", pluginId, method, { input }];
  let writeRevision = 0;
  const options = {
    queryKey,
    staleTime: Infinity,
    queryFn: async () => {
      let generation = 0;
      let readRevision = writeRevision;
      const response = await runPluginRpcRead(
        host.queryClient,
        queryKey,
        async () => {
          generation =
            seedGenerations.get(host.queryClient)?.get(pluginId) ?? 0;
          readRevision = writeRevision;
          try {
            const response = envelopeSchema.parse(
              await readRpcWithDeadline(
                host,
                pluginId,
                method,
                input,
                timeoutMs,
              ),
            );
            return readRevision === writeRevision
              ? response
              : (host.queryClient.getQueryData<Envelope>(queryKey) ?? response);
          } catch (error) {
            const saved = host.queryClient.getQueryData<Envelope>(queryKey);
            if (readRevision !== writeRevision && saved !== undefined)
              return saved;
            throw error;
          }
        },
      );
      if (readRevision === writeRevision)
        unknownReadTags.delete(observer.getCurrentQuery());
      const saved =
        readRevision === writeRevision
          ? undefined
          : host.queryClient.getQueryData<Envelope>(queryKey);
      return acceptProvidedKeyed(host, pluginId, saved ?? response, generation);
    },
  };
  const observer = new QueryObserver<Envelope>(host.queryClient, {
    ...options,
    enabled: false,
  });
  let enabledCount = 0;
  return {
    observer,
    setData(value: JsonValue) {
      writeRevision += 1;
      const query = observer.getCurrentQuery();
      if (query.state.data === undefined) unknownReadTags.add(query);
      host.queryClient.setQueryData<Envelope>(queryKey, (previous) => ({
        result: value,
        tags: previous?.tags ?? [],
        keyTags: previous?.keyTags ?? {},
        whileWatched: previous?.whileWatched ?? false,
      }));
      observer.updateResult();
    },
    setTimeout(duration: number | undefined) {
      timeoutMs = duration;
    },
    subscribe(listener: () => void, enabled: boolean) {
      if (enabled) enabledCount += 1;
      observer.setOptions({ ...options, enabled: enabledCount > 0 });
      const stop = observer.subscribe(listener);
      return () => {
        stop();
        if (enabled) enabledCount -= 1;
        observer.setOptions({ ...options, enabled: enabledCount > 0 });
      };
    },
  };
}

function getReadQuery(
  host: RpcQueryHost,
  pluginId: string,
  method: string,
  input: JsonValue,
  timeoutMs: number | undefined,
) {
  let reads = readQueries.get(host.queryClient);
  if (!reads) {
    reads = new Map();
    readQueries.set(host.queryClient, reads);
    const held = reads;
    host.queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "removed") held.delete(event.query.queryHash);
    });
  }
  const queryHash = host.queryClient.defaultQueryOptions({
    queryKey: ["plugin-rpc", pluginId, method, { input }],
  }).queryHash;
  let read = reads.get(queryHash);
  if (!read) {
    read = createReadQuery(host, pluginId, method, input, timeoutMs);
    reads.set(queryHash, read);
  }
  read.setTimeout(timeoutMs);
  return read;
}

export function createRpcQueryHooks(useHost: () => RpcQueryHost) {
  function useReadWatch(
    host: RpcQueryHost,
    pluginId: string,
    method: string,
    reads: readonly ({ input: JsonValue } | { key: string })[],
    enabled: boolean,
  ) {
    useEffect(() => {
      if (!enabled || reads.length === 0) return;
      let owners = readOwners.get(host.queryClient);
      if (!owners) {
        owners = new Map();
        readOwners.set(host.queryClient, owners);
      }
      const held = owners;
      held.set(pluginId, (held.get(pluginId) ?? 0) + 1);
      const cache = host.queryClient.getQueryCache();
      const needsInterest = () =>
        cache
          .findAll({ queryKey: ["plugin-rpc", pluginId, method] })
          .some((query) => {
            const response = interestResponse.safeParse(query.state.data);
            return response.success && response.data.whileWatched;
          });
      let interested = needsInterest();
      let stop = host.subscribeRead(pluginId, method, reads, interested);
      const stopCache = cache.subscribe((event) => {
        if (
          event.type !== "updated" ||
          event.action.type !== "success" ||
          event.query.queryKey[0] !== "plugin-rpc" ||
          event.query.queryKey[1] !== pluginId ||
          event.query.queryKey[2] !== method
        )
          return;
        const response = interestResponse.safeParse(event.query.state.data);
        const next = response.success && response.data.whileWatched;
        if (next === interested) return;
        stop();
        interested = next;
        stop = host.subscribeRead(pluginId, method, reads, interested);
      });
      if (dormantReads.get(host.queryClient)?.delete(pluginId))
        invalidateRpcQueries(host.queryClient, pluginId, null);
      return () => {
        stopCache();
        stop();
        held.set(pluginId, (held.get(pluginId) ?? 1) - 1);
        queueMicrotask(() => {
          if (held.get(pluginId) === 0) {
            let dormant = dormantReads.get(host.queryClient);
            if (!dormant) {
              dormant = new Set();
              dormantReads.set(host.queryClient, dormant);
            }
            dormant.add(pluginId);
            for (const query of cache.findAll({
              queryKey: ["plugin-rpc", pluginId],
            }))
              keyedOwners
                .get(host.queryClient)
                ?.get(JSON.stringify([pluginId, query.queryKey[2]]))
                ?.compact();
          }
        });
      };
    }, [host, pluginId, method, reads, enabled]);
  }
  const experimental_useRpcQuery: PluginSdkApp["experimental_useRpcQuery"] = (
    options,
  ) => {
    const host = useHost();
    const { pluginId: ownId } = host;
    const pluginId = options.pluginId ?? ownId;
    const identity = canonicalPluginReadInput(
      jsonValueSchema.parse(options.input ?? null),
    );
    const input = useMemo(
      () => jsonValueSchema.parse(JSON.parse(identity)),
      [identity],
    );
    const reads = useMemo(() => [{ input }], [input]);
    const enabled = options.enabled ?? true;
    useReadWatch(host, pluginId, options.method, reads, enabled);
    const read = getReadQuery(
      host,
      pluginId,
      options.method,
      input,
      options.timeoutMs,
    );
    const subscribe = useCallback(
      (listener: () => void) => read.subscribe(listener, enabled),
      [read, enabled],
    );
    const getSnapshot = useCallback(
      () => read.observer.getCurrentResult(),
      [read],
    );
    const query = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const currentRead = useRef(read);
    currentRead.current = read;
    const refresh = useCallback(async () => {
      await currentRead.current.observer.refetch();
    }, []);
    const setData = useCallback(
      (value: JsonValue) => {
        read.setData(jsonValueSchema.parse(value));
      },
      [read],
    );
    return {
      data: query.data?.result,
      error: query.error,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      refetch: refresh,
      experimental_setData: setData,
    } as ReturnType<PluginSdkApp["experimental_useRpcQuery"]>;
  };

  function experimental_useRpcKeyedQuery<T = JsonValue>(options: {
    pluginId?: string;
    method: string;
    keys: readonly string[];
    enabled?: boolean;
  }): ExperimentalRpcKeyedQueryState<T> {
    const host = useHost();
    const { pluginId: ownId } = host;
    const pluginId = options.pluginId ?? ownId;
    const enabled = options.enabled ?? true;
    const keyIdentity = JSON.stringify([...new Set(options.keys)].sort());
    const keys = useMemo(
      () => z.array(z.string()).parse(JSON.parse(keyIdentity)),
      [keyIdentity],
    );
    const reads = useMemo(() => keys.map((key) => ({ key })), [keys]);
    useReadWatch(host, pluginId, options.method, reads, enabled);
    const owner =
      keys.length > 0 ? getKeyedOwner(host, pluginId, options.method) : null;
    const view = useMemo(
      () => owner?.watch(keys, enabled) ?? emptyKeyedView,
      [owner, keys, enabled],
    );
    const lastData = useRef(emptyKeyedSnapshot.data);
    const getSnapshot = useMemo(() => {
      let current = view.getSnapshot();
      let selected = {
        ...current,
        data: shareKeyedData(lastData.current, current.data),
      };
      return () => {
        const next = view.getSnapshot();
        if (next !== current) {
          current = next;
          selected = {
            ...next,
            data: shareKeyedData(selected.data, next.data),
          };
        }
        return selected;
      };
    }, [view]);
    const combined = useSyncExternalStore(
      view.subscribe,
      getSnapshot,
      getSnapshot,
    );
    useEffect(() => {
      lastData.current = combined.data;
    }, [combined.data]);
    const refresh = useCallback(async () => {
      await owner?.refresh(keys);
    }, [owner, keys]);
    const setKey = useCallback(
      (key: string, value: T) => {
        getKeyedOwner(host, pluginId, options.method).setKey(
          key,
          jsonValueSchema.parse(value),
        );
      },
      [host, pluginId, options.method],
    );
    return {
      ...combined,
      refetch: refresh,
      experimental_setKey: setKey,
    } as ExperimentalRpcKeyedQueryState<T>;
  }

  function experimental_useRpcRefresh() {
    const { pluginId, queryClient } = useHost();
    const isRefreshing =
      useIsFetching({ queryKey: ["plugin-rpc", pluginId] }, queryClient) > 0;
    return {
      isRefreshing,
      refresh: () => {
        invalidateRpcQueries(queryClient, pluginId, null);
      },
    };
  }

  return {
    experimental_useRpcQuery,
    experimental_useRpcKeyedQuery,
    experimental_useRpcRefresh,
  };
}
