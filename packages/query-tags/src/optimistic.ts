import {
  matchQuery,
  notifyManager,
  QueryClient,
  replaceEqualDeep,
  type InferDataFromTag,
  type NoInfer,
  type Query,
  type QueryKey,
  type SetDataOptions,
  type Updater,
} from "@tanstack/react-query";

export interface TaggedOptimisticUpdate {
  queryKey: QueryKey;
  exact: boolean;
  path: readonly string[];
  update(current: unknown, result: { value: unknown } | undefined): unknown;
}

export function optimisticQueryUpdate<Value, Result = unknown>(
  queryKey: QueryKey,
  update: (current: Value, result: { value: Result } | undefined) => Value,
  path: readonly string[] = [],
): TaggedOptimisticUpdate {
  return {
    queryKey,
    exact: true,
    path: [...path],
    update: (current, result) =>
      update(current as Value, result as { value: Result } | undefined),
  };
}

export function optimisticQueriesUpdate<Value, Result = unknown>(
  queryKey: QueryKey,
  update: (current: Value, result: { value: Result } | undefined) => Value,
  path: readonly string[] = [],
): TaggedOptimisticUpdate {
  return { ...optimisticQueryUpdate(queryKey, update, path), exact: false };
}

type Prediction = {
  owner: object;
  order: number;
  path: readonly string[];
  initial: unknown;
  update(current: unknown): unknown;
  acceptedAt: number | null;
  fresh: boolean;
  settled: boolean;
};
type PredictionState = {
  client: QueryClient;
  base: unknown;
  visible: unknown;
  layers: Prediction[];
};
type Receipt = {
  data: unknown;
  paths: readonly { path: readonly string[]; started: number }[];
};
const predictions = new WeakMap<Query, PredictionState>();
const receipts = new WeakMap<Query, Receipt[]>();
const baseWrites = new WeakSet<Query>();
const taggedMeta = new WeakSet<object>();
const syncedClients = new WeakMap<
  QueryClient,
  { queries: Set<Query>; unsubscribe: () => void }
>();
let order = 0;

function valueAt(
  data: unknown,
  path: readonly string[],
): { value: unknown } | undefined {
  let value = data;
  for (const key of path) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, key)
    )
      return;
    value = Reflect.get(value, key);
  }
  return value === undefined ? undefined : { value };
}

function replaceAt(
  data: unknown,
  path: readonly string[],
  value: unknown,
): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return value;
  if (typeof data !== "object" || data === null) return data;
  const next = Array.isArray(data) ? [...data] : { ...data };
  Reflect.set(next, key, replaceAt(Reflect.get(data, key), rest, value));
  return next;
}

function prefix(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length <= right.length &&
    left.every((part, index) => part === right[index])
  );
}

function olderPending(state: PredictionState, layer: Prediction): boolean {
  return state.layers.some(
    (other) =>
      other.order < layer.order &&
      !other.settled &&
      (prefix(other.path, layer.path) || prefix(layer.path, other.path)),
  );
}

function confirmedValue(
  current: unknown,
  predicted: unknown,
  confirmed: unknown,
): unknown {
  if (Object.is(predicted, confirmed)) return current;
  if (
    typeof current !== "object" ||
    current === null ||
    typeof predicted !== "object" ||
    predicted === null ||
    typeof confirmed !== "object" ||
    confirmed === null ||
    Array.isArray(predicted) !== Array.isArray(confirmed) ||
    (Array.isArray(predicted) &&
      (!Array.isArray(confirmed) || predicted.length !== confirmed.length))
  )
    return confirmed;
  const next = Array.isArray(current) ? [...current] : { ...current };
  for (const key of new Set([
    ...Object.keys(predicted),
    ...Object.keys(confirmed),
  ])) {
    if (!Object.hasOwn(confirmed, key)) Reflect.deleteProperty(next, key);
    else
      Reflect.set(
        next,
        key,
        confirmedValue(
          Reflect.get(current, key),
          Reflect.get(predicted, key),
          Reflect.get(confirmed, key),
        ),
      );
  }
  return next;
}

function rebase(base: unknown, visible: unknown, next: unknown): unknown {
  if (Object.is(visible, next)) return base;
  if (
    typeof base !== "object" ||
    base === null ||
    typeof visible !== "object" ||
    visible === null ||
    typeof next !== "object" ||
    next === null ||
    Array.isArray(base) !== Array.isArray(next) ||
    Array.isArray(visible) !== Array.isArray(next)
  )
    return next;
  if (Array.isArray(base) && Array.isArray(visible) && Array.isArray(next)) {
    const aligned = base.length === visible.length;
    return next.map((item: unknown, index) => {
      const kept = visible.indexOf(item);
      if (kept >= 0) return aligned ? base[kept] : item;
      return aligned && next.length === visible.length
        ? rebase(base[index], visible[index], item)
        : item;
    });
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(base))
    if (!Object.hasOwn(visible, key) && !Object.hasOwn(next, key))
      result[key] = Reflect.get(base, key);
  for (const key of Object.keys(next))
    result[key] =
      Object.hasOwn(visible, key) && Object.hasOwn(base, key)
        ? rebase(
            Reflect.get(base, key),
            Reflect.get(visible, key),
            Reflect.get(next, key),
          )
        : Reflect.get(next, key);
  return result;
}

function projected(state: PredictionState): unknown {
  return state.layers.reduce((data, layer) => {
    const current = valueAt(data, layer.path);
    return replaceAt(
      data,
      layer.path,
      layer.update(current === undefined ? layer.initial : current.value),
    );
  }, state.base);
}

const predictionListeners = new WeakMap<Query, Set<() => void>>();

export function subscribeOptimisticQuery(
  query: Query | undefined,
  listener: () => void,
) {
  if (query === undefined) return () => {};
  let listeners = predictionListeners.get(query);
  if (listeners === undefined) {
    listeners = new Set();
    predictionListeners.set(query, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) predictionListeners.delete(query);
  };
}

function isTaggedQuery(query: Query): boolean {
  return query.meta !== undefined && taggedMeta.has(query.meta);
}

function bakeSettledLayers(query: Query, state: PredictionState): void {
  if (isTaggedQuery(query)) return;
  while (state.layers[0]?.settled) {
    const layer = state.layers.shift()!;
    const current = valueAt(state.base, layer.path);
    state.base = replaceAt(
      state.base,
      layer.path,
      layer.update(current === undefined ? layer.initial : current.value),
    );
  }
}

function untrack(query: Query, state: PredictionState): void {
  predictions.delete(query);
  const synced = syncedClients.get(state.client);
  if (synced === undefined) return;
  synced.queries.delete(query);
  if (synced.queries.size === 0) {
    synced.unsubscribe();
    syncedClients.delete(state.client);
  }
}

function track(query: Query, state: PredictionState): void {
  predictions.set(query, state);
  let synced = syncedClients.get(state.client);
  if (synced === undefined) {
    const queries = new Set<Query>();
    const unsubscribe = state.client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const current = predictions.get(event.query);
      if (current === undefined || isTaggedQuery(event.query)) return;
      const data = event.query.state.data;
      current.base =
        !event.action.manual || baseWrites.has(event.query)
          ? data
          : rebase(current.base, current.visible, data);
      publish(event.query, current);
    });
    synced = { queries, unsubscribe };
    syncedClients.set(state.client, synced);
  }
  synced.queries.add(query);
}

function publish(query: Query, state: PredictionState): void {
  bakeSettledLayers(query, state);
  const data = replaceEqualDeep(query.state.data, projected(state));
  state.visible = data;
  query.setState({ data });
  if (state.layers.length === 0) untrack(query, state);
  for (const listener of predictionListeners.get(query) ?? []) listener();
}

export function markTaggedQueryMeta(meta: object): void {
  taggedMeta.add(meta);
}

export function taggedReadReceipt(query: Query) {
  const paths: { path: readonly string[]; started: number }[] = [];
  return {
    start: () => ++order,
    record(started: number, loaded: readonly (readonly string[])[]) {
      paths.push(...loaded.map((path) => ({ path, started })));
    },
    commit(data: unknown) {
      receipts.set(query, [...(receipts.get(query) ?? []), { data, paths }]);
    },
  };
}

function isInfiniteData(value: unknown): value is { pages: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(Reflect.get(value, "pages")) &&
    Array.isArray(Reflect.get(value, "pageParams"))
  );
}

function consumeReceipts(
  query: Query,
  next: unknown,
): { kind: "read"; receipts: Receipt[] } | { kind: "partial" } | undefined {
  const pending = receipts.get(query);
  if (pending === undefined) return;
  const direct = pending.find((receipt) => Object.is(receipt.data, next));
  if (direct !== undefined) {
    receipts.delete(query);
    return { kind: "read", receipts: [direct] };
  }
  if (!isInfiniteData(next)) return;
  const pages = pending.filter((receipt) => next.pages.includes(receipt.data));
  if (pages.length === 0) return;
  receipts.delete(query);
  return pages.length === next.pages.length
    ? { kind: "read", receipts: pages }
    : { kind: "partial" };
}

function refreshedBy(receipts: Receipt[], layer: Prediction): boolean {
  return (
    layer.acceptedAt !== null &&
    receipts.every((receipt) =>
      receipt.paths.some(
        ({ path, started }) =>
          started > layer.acceptedAt! && prefix(path, layer.path),
      ),
    )
  );
}

export function taggedStructuralSharing(
  client: QueryClient,
  queryKey: QueryKey,
  previous: unknown,
  next: unknown,
): unknown {
  const query = client
    .getQueryCache()
    .get(client.defaultQueryOptions({ queryKey }).queryHash);
  if (query !== undefined && Object.is(previous, query.state.data)) {
    const receipt = consumeReceipts(query, next);
    const state = predictions.get(query);
    if (state !== undefined) {
      if (receipt?.kind === "read") {
        const refreshed = new Set<Prediction>();
        for (const layer of state.layers) {
          if (refreshedBy(receipt.receipts, layer)) {
            layer.fresh = true;
            refreshed.add(layer);
          }
        }
        state.layers = state.layers.filter(
          (layer) =>
            !layer.settled ||
            !refreshed.has(layer) ||
            olderPending(state, layer),
        );
      }
      state.base =
        receipt?.kind === "read" || baseWrites.has(query)
          ? next
          : rebase(state.base, previous, next);
      next = projected(state);
      state.visible = next;
      if (state.layers.length === 0) untrack(query, state);
    }
  }
  const sharing = client.defaultQueryOptions({ queryKey }).structuralSharing;
  return sharing === false
    ? next
    : typeof sharing === "function"
      ? sharing(previous, next)
      : replaceEqualDeep(previous, next);
}

export function getTaggedReadData<Data>(
  client: QueryClient,
  queryKey: QueryKey,
): Data | undefined {
  const query = client
    .getQueryCache()
    .get(client.defaultQueryOptions({ queryKey }).queryHash);
  const state = query === undefined ? undefined : predictions.get(query);
  return (state === undefined ? query?.state.data : state.base) as
    | Data
    | undefined;
}

export function beginOptimisticMutation(
  client: QueryClient,
  updates: readonly TaggedOptimisticUpdate[],
) {
  const owner = {};
  const mutationOrder = ++order;
  let accepted: { at: number; result: { value: unknown } } | undefined;
  let done = false;
  const affected = new Map<Query, PredictionState>();
  const attached = new Map<TaggedOptimisticUpdate, Set<Query>>(
    updates.map((update) => [update, new Set()]),
  );
  const attach = (query: Query, update: TaggedOptimisticUpdate) => {
    const queries = attached.get(update)!;
    if (queries.has(query) || query.state.data === undefined) return;
    const state = predictions.get(query) ?? {
      client,
      base: query.state.data,
      visible: query.state.data,
      layers: [],
    };
    const current = valueAt(projected(state), update.path);
    if (current === undefined) return;
    queries.add(query);
    const layer: Prediction = {
      owner,
      order: mutationOrder,
      path: update.path,
      initial: current.value,
      update: (value) => update.update(value, accepted?.result),
      acceptedAt: accepted?.at ?? null,
      fresh: false,
      settled: false,
    };
    const index = state.layers.findIndex((other) => other.order > layer.order);
    if (index < 0) state.layers.push(layer);
    else state.layers.splice(index, 0, layer);
    track(query, state);
    affected.set(query, state);
    publish(query, state);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    for (const update of updates)
      if (
        matchQuery(
          { queryKey: update.queryKey, exact: update.exact },
          event.query,
        )
      )
        attach(event.query, update);
  });
  const finish = () => {
    done = true;
    unsubscribe();
  };
  const rollback = () =>
    notifyManager.batch(() => {
      if (accepted !== undefined || done) return;
      finish();
      for (const [query, state] of affected) {
        state.layers = state.layers.filter((layer) => layer.owner !== owner);
        publish(query, state);
      }
    });
  try {
    notifyManager.batch(() => {
      for (const update of updates)
        for (const query of client.getQueryCache().findAll({
          queryKey: update.queryKey,
          exact: update.exact,
        }))
          attach(query, update);
    });
  } catch (error) {
    rollback();
    throw error;
  }
  return {
    rollback,
    accept(result?: unknown) {
      accepted = { at: ++order, result: { value: result } };
      notifyManager.batch(() => {
        for (const [query, state] of affected) {
          for (const layer of state.layers)
            if (layer.owner === owner) layer.acceptedAt = accepted!.at;
          publish(query, state);
        }
      });
    },
    settle() {
      if (done) return;
      finish();
      notifyManager.batch(() => {
        for (const [query, state] of affected) {
          const tagged = isTaggedQuery(query);
          state.layers = state.layers.filter((layer) => {
            if (layer.owner !== owner) return true;
            layer.settled = true;
            if (!tagged) return true;
            if (!layer.fresh) return true;
            if (!olderPending(state, layer)) return false;
            const current = valueAt(state.base, layer.path);
            if (current !== undefined) {
              const update = layer.update;
              const predicted = update(current.value);
              layer.update = (value) =>
                confirmedValue(update(value), predicted, current.value);
            }
            return true;
          });
          publish(query, state);
        }
      });
    },
  };
}

export class TaggedQueryClient extends QueryClient {
  override setQueryData<
    TQueryFnData = unknown,
    TTaggedQueryKey extends QueryKey = QueryKey,
    TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
  >(
    queryKey: TTaggedQueryKey,
    updater: Updater<
      NoInfer<TInferredQueryFnData> | undefined,
      NoInfer<TInferredQueryFnData> | undefined
    >,
    options?: SetDataOptions,
  ): NoInfer<TInferredQueryFnData> | undefined {
    const query = this.getQueryCache().get(
      this.defaultQueryOptions({ queryKey }).queryHash,
    );
    if (
      query === undefined ||
      !predictions.has(query) ||
      typeof updater !== "function"
    )
      return super.setQueryData(queryKey, updater, options);
    const update = updater as (
      current: NoInfer<TInferredQueryFnData> | undefined,
    ) => NoInfer<TInferredQueryFnData> | undefined;
    const base = update(getTaggedReadData(this, queryKey));
    if (base === undefined) return undefined;
    baseWrites.add(query);
    try {
      return super.setQueryData(queryKey, base, options);
    } finally {
      baseWrites.delete(query);
    }
  }
}
