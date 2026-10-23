# GitHub PR Status

Owns GitHub pull request data and actions for bb environments. Bundled and enabled by default.

- `host.ts` runs `gh pr view`, the merge-queue lookup and `gh pr ready|merge` in the environment's workspace on its machine.
- `server.ts` resolves environments, assembles the status, serves the keyed `pullRequests` read and the `markReady`, `markDraft` and `merge` mutations, and registers `bb pull-request`.
- `store.ts` is the single place reads are cached, re-checked while watched, and published when they change. PR snapshots are kept by PR URL so environments that share a PR share one snapshot.
- `app.tsx` registers the pull request segment of the composer's thread context row (`experimental_threadContextSegment`, with Mark ready and merge actions) and the Info tab's Pull request row (`experimental_threadInfoRow`). Their components, display helpers and the keyed read hook live in `ui/`.
- `contract.ts` is the public contract. Core's retired sidebar shim reads through it with `pluginId: "bb--github-pr-status"`, the way any other plugin would.

Plugin host calls never wake a suspended machine: reads return `unavailable`, and actions fail with a message naming the machine.
