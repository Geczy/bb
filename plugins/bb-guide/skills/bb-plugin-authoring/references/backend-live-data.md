# Plugin live RPC data

Handlers call `context.experimental_tag("task:123", "project:7:tasks")` to
associate reads with producer-owned tags. Results retain their declared types;
tags travel beside the result in the host envelope. After a write, call
`bb.rpc.experimental_invalidate(["task:123"])` with a non-empty tag list.
Use `bb.rpc.experimental_invalidateAll()` only when every read owned by this
plugin is affected. Empty lists and omitted lists are rejected. The host merges invalidations within a tick and
falls back to every read above 200 tags. Load, reload and disable invalidate
all reads of that plugin.

`bb.rpc.experimental_whileWatched(method, (read, signal) => ...)` registers work
for each distinct subscribed read. `read` is `{ input }`, or `{ key }` for a
keyed read. Inputs use canonical JSON and have a 16 KiB limit. Work is shared
across consumers; abort when the last consumer leaves, and dispose resources
on that signal. Reload restarts work for active watches. Browsers release read
watches while hidden; Node consumers retain theirs until stopped.

Start SDK subscriptions in a background service, after the SDK becomes
available. `bb.sdk.plugins.experimental_watchRpc({ pluginId, method, input,
outputSchema, onChange, onError, signal })` owns an initial read, matching tag
invalidations and reconnect refresh. It returns an idempotent disposer; aborting
also stops it. Failures report through `onError` and retry with capped backoff.
`experimental_watchDiscovery({ pluginId?, method?, onChange, onError?, signal })`
reports published methods immediately and whenever their list changes. Neither
API creates a shared server read cache; caller identity remains per request.

Frontend `experimental_useRpcQuery({ pluginId?, method, input, enabled?, timeoutMs? })`
returns `{ data, error, isLoading, isFetching, refetch }`. The plugin ID defaults
to the calling plugin. Identical reads share BB's query client; tags select
invalidations, hidden-page work defers, and reconnect/resume refresh active
reads. Cached reads revalidate after their last consumer leaves. `timeoutMs` optionally
bounds each request attempt. The host drops overtaken responses and performs one trailing read.

`experimental_useRpcKeyedQuery({ pluginId?, method, keys, enabled? })` calls a
method shaped `{ keys: string[] } -> Record<string, value>`. It caches each key
independently and batches missing or invalidated keys in groups of at most 500
in the same render. Return every requested key, using `null` for a missing item. Inside
the producer, `context.experimental_tagKey(key, ...tags)` tags a particular
key; `experimental_tag` adds dependencies shared by every returned key.
After a successful mutation or forced reload, call a plain read result's
`experimental_setData(savedValue)` or a keyed result's
`experimental_setKey(key, savedValue)` to write through the shared query client
and notify all observers. These writers retain known tags, clear the written
read's error, and drop results and errors from reads already in flight. Later
reads replace the saved value normally. Writes made before tags are known
conservatively match invalidations until a read supplies tags. Keyed results expose
only `experimental_setKey`; plain results expose only `experimental_setData`.
`experimental_useRpcRefresh()` refreshes this client's active reads belonging
to the calling plugin, and reports whether they are fetching.

The CLI exposes these lifetimes as `bb plugin rpc call ... --watch` and
`bb plugin rpc list ... --watch`. `--json` emits one value per line.

Slot tests use `RenderedSlot.experimental_invalidateRpc(tags?, pluginId?)` to
drive producer changes. `RenderSlotOptions.experimental_rpcTags` supplies
normal or per-key envelope tags while the real query owner handles reads.

A list read can fill a keyed cache in the same response:

```ts
context.experimental_provideKeyed("getTasksKeyed", () =>
  Object.fromEntries(rows().map(row => [row.id, {
    value: row,
    tags: [`task:${row.id}`],
  }])),
);
```

The producer is lazy: the browser sends its warm keyed method names in
`x-bb-rpc-warm-keyed`, and the host runs the producer only for a method with no
cached entries. Calls without this cache hint do not produce rows. The target
method must be registered in the same plugin; its output schema validates the
provided record. Per-entry tags drive the usual targeted invalidations and
`whileWatched` follows the target method. The client seeds the existing keyed
owner before publishing the list result and discards seed metadata afterward.
Seeds fill missing entries; they never replace independently loaded rows.
Invalidations overtaking the read discard its seeds. Bound large producers;
Tasks provides at most 25 initial summaries and fetches remaining keys
normally, so first cards do not wait for the rest of a large board.
Warm membership refreshes stay IDs-only. Do not start a second dependent read
early to hide cold latency.

Backend fakes accept `callRpc(method, input, { experimental_warmKeyedMethods })`
and expose `inspection.experimental_rpcProvidedKeyed`. Frontend fake RPC
handlers receive the same warm metadata as a second argument; return provided
entries through `experimental_rpcTags(...).providedKeyed` to exercise the real
cache owner.
