import {
  notifyManager,
  replaceEqualDeep,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  beginOptimisticMutation,
  type TaggedOptimisticUpdate,
} from "@bb/query-tags";
import {
  threadWithRuntimeSchema,
  type ThreadListEntry,
  type ThreadWithRuntime,
} from "@bb/domain";
import type { ThreadResponse } from "@bb/server-contract";
import {
  ARCHIVED_THREADS_LIST_KIND,
  allThreadDetailBootstrapQueryKeyPrefix,
  allThreadQueryKeyPrefix,
  sidebarNavigationQueryKey,
  threadSearchQueryKeyPrefix,
  threadsQueryKey,
} from "../queries/query-keys";

type Fields = Record<string, unknown>;
type ListFacetKey = Exclude<keyof ThreadListEntry, keyof ThreadWithRuntime>;
type DetailFacetKey = Exclude<keyof ThreadResponse, keyof ThreadWithRuntime>;
type Facet = "list" | "detail";

export interface ThreadEntity {
  thread: Partial<ThreadWithRuntime>;
  list: Partial<Pick<ThreadListEntry, ListFacetKey>> | null;
  detail: Partial<Pick<ThreadResponse, DetailFacetKey>> | null;
}

const LIST_FACET: Record<ListFacetKey, true> = {
  activity: true,
  queuedWork: true,
  pinSortKey: true,
  hasPendingInteraction: true,
  environmentHostId: true,
  environmentName: true,
  environmentBranchName: true,
  environmentPath: true,
  environmentProviderId: true,
  environmentIsWorktree: true,
  environmentWorkspaceDisplayKind: true,
};
const DETAIL_FACET: Record<DetailFacetKey, true> = {
  activeBackgroundAgentCount: true,
  canRestoreEnvironment: true,
  canEditMessages: true,
  canSpawnChild: true,
  queuedMessageCount: true,
};
const THREAD_KEYS = new Set(Object.keys(threadWithRuntimeSchema.shape));
const FACET_KEYS: Record<Facet, ReadonlySet<string>> = {
  list: new Set(Object.keys(LIST_FACET)),
  detail: new Set(Object.keys(DETAIL_FACET)),
};

type Membership = "active" | "archived" | "any";

interface ViewSlot {
  key: string;
  items: readonly unknown[];
}

interface ViewFamily {
  facet: Facet;
  membership(queryKey: QueryKey): Membership;
  slots(data: unknown): ViewSlot[] | undefined;
  rebuild(data: unknown, items: ReadonlyMap<string, unknown[]>): unknown;
  threadOf(item: unknown): Fields | undefined;
  withThread(item: unknown, thread: Fields): unknown;
}

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function threadRow(item: unknown): Fields | undefined {
  return isRecord(item) && typeof item.id === "string" ? item : undefined;
}

const ROW_ITEMS = {
  threadOf: threadRow,
  withThread: (_item: unknown, thread: Fields) => thread,
};

const SIDEBAR: ViewFamily = {
  facet: "list",
  membership: () => "active",
  slots(data) {
    if (!isRecord(data) || !isRecord(data.personalProject)) return undefined;
    const projects = Array.isArray(data.projects) ? data.projects : [];
    return [
      { key: "personal", items: projectThreads(data.personalProject) },
      ...projects.map((project, index) => ({
        key: projectSlot(project, index),
        items: projectThreads(project),
      })),
    ];
  },
  rebuild(data, items) {
    if (!isRecord(data) || !isRecord(data.personalProject)) return data;
    const personal = items.get("personal");
    const projects = Array.isArray(data.projects) ? data.projects : [];
    return {
      ...data,
      personalProject:
        personal === undefined
          ? data.personalProject
          : { ...data.personalProject, threads: personal },
      projects: projects.map((project: unknown, index) => {
        const threads = items.get(projectSlot(project, index));
        return isRecord(project) && threads !== undefined
          ? { ...project, threads }
          : project;
      }),
    };
  },
  ...ROW_ITEMS,
};

function projectSlot(project: unknown, index: number): string {
  return isRecord(project) && typeof project.id === "string"
    ? `project:${project.id}`
    : `project-index:${index}`;
}

function projectThreads(project: unknown): readonly unknown[] {
  return isRecord(project) && Array.isArray(project.threads)
    ? project.threads
    : [];
}

const THREAD_LISTS: ViewFamily = {
  facet: "list",
  membership(queryKey) {
    const scope = queryKey[1];
    if (scope === ARCHIVED_THREADS_LIST_KIND) return "archived";
    if (isRecord(scope) && typeof scope.archived === "boolean")
      return scope.archived ? "archived" : "active";
    return "any";
  },
  slots(data) {
    if (Array.isArray(data)) return [{ key: "rows", items: data }];
    if (isRecord(data) && Array.isArray(data.pages))
      return data.pages.map((page: unknown, index) => ({
        key: `page:${index}`,
        items: Array.isArray(page) ? page : [],
      }));
    if (isRecord(data) && Array.isArray(data.threads))
      return [{ key: "threads", items: data.threads }];
    return undefined;
  },
  rebuild(data, items) {
    if (Array.isArray(data)) return items.get("rows") ?? data;
    if (isRecord(data) && Array.isArray(data.pages))
      return {
        ...data,
        pages: data.pages.map(
          (page: unknown, index) => items.get(`page:${index}`) ?? page,
        ),
      };
    const threads = items.get("threads");
    if (isRecord(data) && threads !== undefined) return { ...data, threads };
    return data;
  },
  ...ROW_ITEMS,
};

const SEARCH: ViewFamily = {
  facet: "list",
  membership: () => "any",
  slots(data) {
    if (!isRecord(data)) return undefined;
    return ["active", "archived"].map((key) => {
      const group = data[key];
      return {
        key,
        items:
          isRecord(group) && Array.isArray(group.results) ? group.results : [],
      };
    });
  },
  rebuild(data, items) {
    if (!isRecord(data)) return data;
    const next: Fields = { ...data };
    for (const key of ["active", "archived"]) {
      const group = data[key];
      const results = items.get(key);
      if (isRecord(group) && results !== undefined)
        next[key] = { ...group, results };
    }
    return next;
  },
  threadOf: (item) => (isRecord(item) ? threadRow(item.thread) : undefined),
  withThread: (item, thread) => (isRecord(item) ? { ...item, thread } : item),
};

const DETAIL: ViewFamily = {
  facet: "detail",
  membership: () => "any",
  slots: (data) =>
    threadRow(data) === undefined
      ? undefined
      : [{ key: "detail", items: [data] }],
  rebuild: (data, items) => items.get("detail")?.[0] ?? data,
  ...ROW_ITEMS,
};

function familyOf(queryKey: QueryKey): ViewFamily | undefined {
  const [head] = queryKey;
  if (head === sidebarNavigationQueryKey()[0])
    return queryKey.length === 1 ? SIDEBAR : undefined;
  if (head === threadsQueryKey()[0])
    return queryKey.length > 1 ? THREAD_LISTS : undefined;
  if (head === threadSearchQueryKeyPrefix()[0]) return SEARCH;
  if (
    head === allThreadQueryKeyPrefix()[0] ||
    head === allThreadDetailBootstrapQueryKeyPrefix()[0]
  )
    return queryKey.length === 2 ? DETAIL : undefined;
  return undefined;
}

function pick(source: Fields, keys: ReadonlySet<string>): Fields {
  const picked: Fields = {};
  for (const key of Object.keys(source))
    if (keys.has(key)) picked[key] = source[key];
  return picked;
}

function withFields<T extends object>(
  current: T | null,
  fields: Fields,
): T | null {
  const keys = Object.keys(fields);
  if (keys.length === 0) return current;
  const base: Fields = current === null ? {} : { ...current };
  if (
    current !== null &&
    keys.every((key) => Object.is(Reflect.get(current, key), fields[key]))
  )
    return current;
  for (const key of keys) base[key] = fields[key];
  return base as T;
}

function mergeEntity(
  current: ThreadEntity,
  threadFields: Fields,
  facet: Facet,
  facetFields: Fields,
): ThreadEntity {
  const thread = withFields(current.thread, threadFields) ?? current.thread;
  const facetValue = withFields(current[facet], facetFields);
  if (thread === current.thread && facetValue === current[facet])
    return current;
  return { ...current, thread, [facet]: facetValue };
}

function isMember(entity: ThreadEntity, membership: Membership): boolean {
  if (entity.thread.deletedAt != null) return false;
  if (membership === "any" || !("archivedAt" in entity.thread)) return true;
  const archived = entity.thread.archivedAt != null;
  return membership === "archived" ? archived : !archived;
}

interface ViewEntry {
  id: string | null;
  item: unknown;
}

interface ViewSkeleton {
  family: ViewFamily;
  data: unknown;
  slots: Map<string, ViewEntry[]>;
  slotsById: Map<string, Set<string>>;
}

type Materialized = Map<string, Map<string, unknown>>;

interface ViewInsertion {
  slot: string;
  entry: ViewEntry;
  at: number;
}

interface EntityLayer {
  ids: ReadonlySet<string>;
  apply(entity: ThreadEntity, threadId: string): ThreadEntity;
  settled: boolean;
}

interface ThreadEntityStore {
  client: QueryClient;
  base: Map<string, ThreadEntity>;
  layers: EntityLayer[];
  visible: Map<string, ThreadEntity>;
  skeletons: Map<Query, ViewSkeleton>;
  insertions: WeakMap<Query, ViewInsertion[]>;
  viewsById: Map<string, Set<Query>>;
  materialized: WeakMap<Query, Materialized>;
  fetchStartedAt: WeakMap<Query, number>;
  acknowledgedAt: Map<string, number>;
  rows: WeakMap<object, WeakMap<ThreadEntity, unknown>>;
  clock: number;
  batching: number;
  dirtyIds: Set<string>;
  dirtyViews: Set<Query>;
}

const stores = new WeakMap<QueryClient, ThreadEntityStore>();

function readEntity(
  store: ThreadEntityStore,
  id: string,
): ThreadEntity | undefined {
  const cached = store.visible.get(id);
  if (cached !== undefined) return cached;
  let entity = store.base.get(id);
  if (entity === undefined) return undefined;
  for (const layer of store.layers)
    if (layer.ids.has(id)) entity = layer.apply(entity, id);
  store.visible.set(id, entity);
  return entity;
}

function changed(store: ThreadEntityStore, ids: Iterable<string>): void {
  const dirty = new Set(ids);
  for (const id of dirty) store.visible.delete(id);
  if (store.batching > 0) {
    for (const id of dirty) store.dirtyIds.add(id);
    return;
  }
  const views = new Map<Query, Set<string>>();
  for (const id of dirty)
    for (const view of store.viewsById.get(id) ?? []) {
      const viewIds = views.get(view) ?? new Set<string>();
      viewIds.add(id);
      views.set(view, viewIds);
    }
  notifyManager.batch(() => {
    for (const [view, viewIds] of views) rematerialize(store, view, viewIds);
  });
}

function writeBase(
  store: ThreadEntityStore,
  id: string,
  update: (current: ThreadEntity | undefined) => ThreadEntity | undefined,
): void {
  const current = store.base.get(id);
  const next = update(current);
  if (next === undefined || next === current) return;
  store.base.set(id, next);
  changed(store, [id]);
}

function isNewer(
  incoming: unknown,
  current: unknown,
  readStart: number,
  acknowledgedAt: number,
): boolean {
  if (typeof incoming !== "number" || typeof current !== "number") return true;
  if (incoming !== current) return incoming > current;
  return readStart > acknowledgedAt;
}

function ingest(
  store: ThreadEntityStore,
  id: string,
  facet: Facet,
  source: Fields,
  readStart: number,
): void {
  const acknowledgedAt = store.acknowledgedAt.get(id) ?? -1;
  const threadFields = pick(source, THREAD_KEYS);
  const facetFields = pick(source, FACET_KEYS[facet]);
  writeBase(store, id, (current) => {
    if (current === undefined)
      return {
        thread: threadFields,
        list: facet === "list" ? facetFields : null,
        detail: facet === "detail" ? facetFields : null,
      };
    if (
      isNewer(
        threadFields.updatedAt,
        current.thread.updatedAt,
        readStart,
        acknowledgedAt,
      )
    )
      return mergeEntity(current, threadFields, facet, facetFields);
    return current[facet] === null
      ? mergeEntity(current, {}, facet, facetFields)
      : current;
  });
}

function applyChangedFields(
  store: ThreadEntityStore,
  id: string,
  facet: Facet,
  next: Fields,
  previous: Fields,
): void {
  const changed: Fields = {};
  for (const key of Object.keys(next))
    if (!Object.is(next[key], previous[key])) changed[key] = next[key];
  const threadFields = pick(changed, THREAD_KEYS);
  const facetFields = pick(changed, FACET_KEYS[facet]);
  if (
    Object.keys(threadFields).length === 0 &&
    Object.keys(facetFields).length === 0
  )
    return;
  writeBase(store, id, (current) =>
    current === undefined
      ? current
      : mergeEntity(current, threadFields, facet, facetFields),
  );
}

function materializeItem(
  store: ThreadEntityStore,
  family: ViewFamily,
  item: unknown,
  entity: ThreadEntity,
): unknown {
  const source = family.threadOf(item);
  if (source === undefined || !isRecord(item)) return item;
  let byEntity = store.rows.get(item);
  if (byEntity === undefined) {
    byEntity = new WeakMap();
    store.rows.set(item, byEntity);
  }
  const cached = byEntity.get(entity);
  if (cached !== undefined) return cached;
  const row = family.withThread(item, {
    ...source,
    ...entity.thread,
    ...entity[family.facet],
  });
  byEntity.set(entity, row);
  return row;
}

function rematerialize(
  store: ThreadEntityStore,
  query: Query,
  dirty?: ReadonlySet<string>,
): void {
  const skeleton = store.skeletons.get(query);
  if (skeleton === undefined) return;
  const previous = store.materialized.get(query);
  const incremental = dirty !== undefined && previous !== undefined;
  const slotKeys = new Set<string>();
  if (incremental) {
    for (const id of dirty)
      for (const slot of skeleton.slotsById.get(id) ?? []) slotKeys.add(slot);
  } else for (const slot of skeleton.slots.keys()) slotKeys.add(slot);
  if (slotKeys.size === 0) return;
  const membership = skeleton.family.membership(query.queryKey);
  const items = new Map<string, unknown[]>();
  const materialized: Materialized = new Map(previous);
  for (const slot of slotKeys) {
    const prior = previous?.get(slot);
    const visible = new Map<string, unknown>();
    const rows: unknown[] = [];
    for (const entry of skeleton.slots.get(slot) ?? []) {
      if (entry.id === null) {
        rows.push(entry.item);
        continue;
      }
      const entity = readEntity(store, entry.id);
      if (entity !== undefined && !isMember(entity, membership)) continue;
      const previousRow = incremental ? prior?.get(entry.id) : undefined;
      const row =
        previousRow !== undefined && dirty?.has(entry.id) === false
          ? previousRow
          : replaceEqualDeep(
              previousRow,
              entity === undefined
                ? entry.item
                : materializeItem(store, skeleton.family, entry.item, entity),
            );
      visible.set(entry.id, row);
      rows.push(row);
    }
    const unchanged =
      prior !== undefined &&
      prior.size === rows.length &&
      [...prior.values()].every((row, index) => row === rows[index]);
    if (incremental && unchanged) continue;
    items.set(slot, rows);
    materialized.set(slot, visible);
  }
  if (items.size === 0) return;
  let next = skeleton.family.rebuild(
    incremental ? query.state.data : skeleton.data,
    items,
  );
  if (!incremental) {
    next = replaceEqualDeep(query.state.data, next);
    for (const slot of skeleton.family.slots(next) ?? []) {
      const visible = new Map<string, unknown>();
      for (const item of slot.items) {
        const thread = skeleton.family.threadOf(item);
        if (thread !== undefined) visible.set(String(thread.id), item);
      }
      materialized.set(slot.key, visible);
    }
  }
  store.materialized.set(query, materialized);
  if (next !== query.state.data) query.setState({ data: next });
}

function setSkeleton(
  store: ThreadEntityStore,
  query: Query,
  skeleton: ViewSkeleton | undefined,
): void {
  const previousIds = skeletonIds(store.skeletons.get(query));
  const nextIds = skeletonIds(skeleton);
  if (skeleton === undefined) {
    store.skeletons.delete(query);
    store.materialized.delete(query);
  } else store.skeletons.set(query, skeleton);
  for (const id of nextIds) {
    let views = store.viewsById.get(id);
    if (views === undefined) {
      views = new Set();
      store.viewsById.set(id, views);
    }
    views.add(query);
  }
  for (const id of previousIds) {
    if (nextIds.has(id)) continue;
    const views = store.viewsById.get(id);
    views?.delete(query);
    if (views === undefined || views.size === 0) {
      store.viewsById.delete(id);
      store.base.delete(id);
      store.visible.delete(id);
    }
  }
}

function skeletonIds(skeleton: ViewSkeleton | undefined): Set<string> {
  const ids = new Set<string>();
  for (const entries of skeleton?.slots.values() ?? [])
    for (const { id } of entries) if (id !== null) ids.add(id);
  return ids;
}

function priorItem(
  materialized: Materialized | undefined,
  slot: string,
  id: string,
): unknown {
  const same = materialized?.get(slot)?.get(id);
  if (same !== undefined) return same;
  for (const visible of materialized?.values() ?? []) {
    const item = visible.get(id);
    if (item !== undefined) return item;
  }
  return undefined;
}

function isHidden(
  entry: ViewEntry,
  visible: ReadonlyMap<string, unknown>,
): boolean {
  return entry.id !== null && !visible.has(entry.id);
}

function keepHiddenEntries(
  previous: readonly ViewEntry[],
  next: ViewEntry[],
  visible: ReadonlyMap<string, unknown>,
): ViewEntry[] {
  if (!previous.some((entry) => isHidden(entry, visible))) return next;
  const result = [...next];
  let insertAt = result.length;
  for (let index = previous.length - 1; index >= 0; index--) {
    const entry = previous[index]!;
    const existing =
      entry.id === null ? -1 : result.findIndex(({ id }) => id === entry.id);
    if (existing >= 0) insertAt = existing;
    else if (isHidden(entry, visible)) result.splice(insertAt, 0, entry);
  }
  return result;
}

function keptInsertions(
  store: ThreadEntityStore,
  query: Query,
  slot: string,
  readStart: number,
): ViewInsertion[] {
  const insertions = (store.insertions.get(query) ?? []).filter(
    (insertion) => insertion.at > readStart,
  );
  store.insertions.set(query, insertions);
  return insertions.filter((insertion) => insertion.slot === slot);
}

function batch(store: ThreadEntityStore, run: () => void): void {
  store.batching++;
  try {
    notifyManager.batch(run);
  } finally {
    store.batching--;
  }
  if (store.batching > 0) return;
  const full = new Set(store.dirtyViews);
  const partial = new Map<Query, Set<string>>();
  for (const id of store.dirtyIds)
    for (const view of store.viewsById.get(id) ?? []) {
      if (full.has(view)) continue;
      const ids = partial.get(view) ?? new Set<string>();
      ids.add(id);
      partial.set(view, ids);
    }
  store.dirtyIds.clear();
  store.dirtyViews.clear();
  notifyManager.batch(() => {
    for (const view of full) rematerialize(store, view);
    for (const [view, ids] of partial) rematerialize(store, view, ids);
  });
}

function onViewWritten(
  store: ThreadEntityStore,
  query: Query,
  family: ViewFamily,
  manual: boolean,
): void {
  const data = query.state.data;
  const slots = data === undefined ? undefined : family.slots(data);
  if (slots === undefined) {
    setSkeleton(store, query, undefined);
    return;
  }
  const previous = store.skeletons.get(query);
  const materialized = manual ? store.materialized.get(query) : undefined;
  const readStart = manual ? -1 : (store.fetchStartedAt.get(query) ?? 0);
  batch(store, () => {
    const nextSlots = new Map<string, ViewEntry[]>();
    const slotsById = new Map<string, Set<string>>();
    for (const slot of slots) {
      const entries: ViewEntry[] = [];
      for (const item of slot.items) {
        const thread = family.threadOf(item);
        if (thread === undefined) {
          entries.push({ id: null, item });
          continue;
        }
        const id = String(thread.id);
        entries.push({ id, item });
        const prior = priorItem(materialized, slot.key, id);
        const priorThread =
          prior === undefined ? undefined : family.threadOf(prior);
        if (priorThread !== undefined) {
          if (prior !== item)
            applyChangedFields(store, id, family.facet, thread, priorThread);
        } else ingest(store, id, family.facet, thread, readStart);
      }
      const previousEntries = previous?.slots.get(slot.key);
      const visible = materialized?.get(slot.key);
      const kept =
        previousEntries !== undefined && visible !== undefined
          ? keepHiddenEntries(previousEntries, entries, visible)
          : entries;
      if (!manual)
        for (const insertion of keptInsertions(
          store,
          query,
          slot.key,
          readStart,
        ))
          if (!kept.some(({ id }) => id === insertion.entry.id))
            kept.push(insertion.entry);
      nextSlots.set(slot.key, kept);
      for (const { id } of kept) {
        if (id === null) continue;
        const slotKeys = slotsById.get(id) ?? new Set<string>();
        slotKeys.add(slot.key);
        slotsById.set(id, slotKeys);
      }
    }
    setSkeleton(store, query, { family, data, slots: nextSlots, slotsById });
    store.dirtyViews.add(query);
  });
}

export function ensureThreadEntityStore(
  client: QueryClient,
): ThreadEntityStore {
  const existing = stores.get(client);
  if (existing !== undefined) return existing;
  const store: ThreadEntityStore = {
    client,
    base: new Map(),
    layers: [],
    visible: new Map(),
    skeletons: new Map(),
    insertions: new WeakMap(),
    viewsById: new Map(),
    materialized: new WeakMap(),
    fetchStartedAt: new WeakMap(),
    acknowledgedAt: new Map(),
    rows: new WeakMap(),
    clock: 0,
    batching: 0,
    dirtyIds: new Set(),
    dirtyViews: new Set(),
  };
  stores.set(client, store);
  client.getQueryCache().subscribe((event) => {
    const { query } = event;
    const family = familyOf(query.queryKey);
    if (family === undefined) return;
    if (event.type === "removed") {
      setSkeleton(store, query, undefined);
      return;
    }
    if (event.type !== "updated") return;
    if (event.action.type === "fetch") {
      store.fetchStartedAt.set(query, ++store.clock);
      return;
    }
    if (event.action.type === "success")
      onViewWritten(store, query, family, event.action.manual === true);
  });
  for (const query of client.getQueryCache().getAll()) {
    const family = familyOf(query.queryKey);
    if (family !== undefined && query.state.data !== undefined)
      onViewWritten(store, query, family, true);
  }
  return store;
}

export function patchThreadEntity(
  client: QueryClient,
  threadId: string,
  change: Fields,
  updatedAt?: number,
): void {
  const store = ensureThreadEntityStore(client);
  const threadFields = pick(change, THREAD_KEYS);
  const listFields = pick(change, FACET_KEYS.list);
  writeBase(store, threadId, (current) =>
    current === undefined ||
    (updatedAt !== undefined &&
      (current.thread.updatedAt ?? Number.NEGATIVE_INFINITY) > updatedAt)
      ? current
      : mergeEntity(current, threadFields, "list", listFields),
  );
}

export function getThreadEntity(
  client: QueryClient,
  threadId: string,
): ThreadEntity | undefined {
  return readEntity(ensureThreadEntityStore(client), threadId);
}

function getThreadEntities(client: QueryClient): ThreadEntity[] {
  const store = ensureThreadEntityStore(client);
  return [...store.base.keys()].flatMap((id) => {
    const entity = readEntity(store, id);
    return entity === undefined ? [] : [entity];
  });
}

export function findThreadEntityIds(
  client: QueryClient,
  matches: (thread: Partial<ThreadWithRuntime>) => boolean,
): string[] {
  return getThreadEntities(client).flatMap(({ thread }) =>
    thread.id !== undefined && matches(thread) ? [thread.id] : [],
  );
}

export function findThreadTreeIds(
  client: QueryClient,
  matchesRoot: (thread: Partial<ThreadWithRuntime>) => boolean,
): string[] {
  const threads = getThreadEntities(client).map(({ thread }) => thread);
  const childrenByParent = new Map<string, string[]>();
  const threadIds = new Set<string>();
  for (const thread of threads) {
    if (thread.id === undefined) continue;
    if (matchesRoot(thread)) threadIds.add(thread.id);
    if (thread.parentThreadId != null) {
      const children = childrenByParent.get(thread.parentThreadId) ?? [];
      children.push(thread.id);
      childrenByParent.set(thread.parentThreadId, children);
    }
  }
  for (const threadId of threadIds)
    for (const childId of childrenByParent.get(threadId) ?? [])
      threadIds.add(childId);
  return [...threadIds];
}

export function insertThreadIntoSidebar(
  client: QueryClient,
  threadId: string,
): void {
  const store = ensureThreadEntityStore(client);
  const entity = readEntity(store, threadId);
  const query = client
    .getQueryCache()
    .find({ queryKey: sidebarNavigationQueryKey(), exact: true });
  const skeleton = query === undefined ? undefined : store.skeletons.get(query);
  if (
    query === undefined ||
    skeleton === undefined ||
    entity?.list == null ||
    !isRecord(skeleton.data)
  )
    return;
  const personal = skeleton.data.personalProject;
  const existingSlot = skeleton.slotsById.get(threadId)?.values().next().value;
  const slot =
    existingSlot ??
    (isRecord(personal) && personal.id === entity.thread.projectId
      ? "personal"
      : `project:${String(entity.thread.projectId)}`);
  const entries = skeleton.slots.get(slot);
  if (entries === undefined) return;
  const entry = entries.find(({ id }) => id === threadId) ?? {
    id: threadId,
    item: { ...entity.thread, ...entity.list },
  };
  store.insertions.set(query, [
    ...(store.insertions.get(query) ?? []),
    { slot, entry, at: ++store.clock },
  ]);
  if (existingSlot !== undefined) return;
  const slots = new Map(skeleton.slots);
  slots.set(slot, [...entries, entry]);
  const slotsById = new Map(skeleton.slotsById);
  slotsById.set(threadId, new Set([slot]));
  setSkeleton(store, query, { ...skeleton, slots, slotsById });
  notifyManager.batch(() => rematerialize(store, query));
}

export interface ThreadEntityPrediction<Result = unknown> {
  threadIds: readonly string[];
  succeed(result?: Result): void;
  fail(): void;
}

function bakeSettledLayers(store: ThreadEntityStore): Set<string> {
  const baked = new Set<string>();
  const pending = new Set<string>();
  store.layers = store.layers.filter((layer) => {
    const blocked = [...layer.ids].some((id) => pending.has(id));
    if (!layer.settled || blocked) {
      for (const id of layer.ids) pending.add(id);
      return true;
    }
    for (const id of layer.ids) {
      const current = store.base.get(id);
      if (current !== undefined) store.base.set(id, layer.apply(current, id));
      baked.add(id);
    }
    return false;
  });
  return baked;
}

export function beginThreadEntityPrediction<Result = unknown>(
  client: QueryClient,
  {
    threadIds,
    update,
    extra = [],
  }: {
    threadIds: readonly string[];
    update: (
      entity: ThreadEntity,
      threadId: string,
      result: { value: Result } | undefined,
    ) => ThreadEntity;
    extra?: readonly TaggedOptimisticUpdate[];
  },
): ThreadEntityPrediction<Result> {
  const store = ensureThreadEntityStore(client);
  let accepted: { value: Result } | undefined;
  const layer: EntityLayer = {
    ids: new Set(threadIds),
    apply: (entity, threadId) => update(entity, threadId, accepted),
    settled: false,
  };
  store.layers.push(layer);
  changed(store, threadIds);
  const others =
    extra.length === 0 ? undefined : beginOptimisticMutation(client, extra);
  return {
    threadIds,
    succeed(result) {
      if (layer.settled || !store.layers.includes(layer)) return;
      for (const id of threadIds) store.acknowledgedAt.set(id, ++store.clock);
      accepted = result === undefined ? undefined : { value: result };
      layer.settled = true;
      changed(store, [...threadIds, ...bakeSettledLayers(store)]);
      others?.accept(result);
      others?.settle();
    },
    fail() {
      if (layer.settled || !store.layers.includes(layer)) return;
      store.layers = store.layers.filter((other) => other !== layer);
      changed(store, [...threadIds, ...bakeSettledLayers(store)]);
      others?.rollback();
    },
  };
}
