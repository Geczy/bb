# Auth recovery host and profile review

**Verdict: NEEDS FIXES — three P1 findings.** Leaf architect review; findings await the owning manager's synthesis and validation. No fixes performed.

Reviewed exact range: `git diff c6aef9658628fea3f3356517dc6710e20d0a13ab..4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9`.
Reviewed head: `4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9`.
Verified environment `env_jeqe9ahwrp`, host `host_q7quxdditd`, worktree `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb`; manager `thr_8kunyvhjta`.

Scope: the assigned server terminal route/lifecycle/login service, daemon terminal manager, runtime state/accessor, terminal wire/public contracts, associated tests and SDK/domain version changes. Read `handoff.md` and traced adjacent provider, environment, Account Pool and SDK callers as context. Findings below attach only to owned changed code.

Read-only verification: GitHub run [38447743273](https://github.com/get-bb/bb/actions/runs/38447743273) is completed/success, attempt 2, all 44 jobs successful at the reviewed head. No CI rerun, local tests/typechecks/lint/builds, product execution, browser, subagents, or repository edits; this requested review artifact is the only write.

## Findings

### [P1] Recovery can use a profile staged by a steer instead of the failed process's profile

**Files:** `packages/agent-runtime/src/runtime.ts:2559` (introduced accessor; particularly line 2563), related `runtime.ts:2164` and `apps/host-daemon/src/terminals/terminal-manager.ts:641`.

**Trigger:** Start a Claude turn with `CLAUDE_CONFIG_DIR=A`. While it runs, change the project/provider environment contribution to `CLAUDE_CONFIG_DIR=B` and send a steering message. The resident process then reports an authentication failure; click Sign in for that failed turn.

**Evidence and impact:** The host passes fresh contributions into `steerTurn` (`apps/host-daemon/src/command-handlers/thread.ts:360`). The runtime overwrites `threadRuntimeConfigs.envVars` with B after the steer succeeds (`runtime.ts:2164-2168`). Claude's `applyTurnEnvironment` stages the environment and marks a restart for the next turn (`plugins/provider-claude-code/src/bridge/bridge.ts:1649-1678`); `getWritableThreadSession` explicitly keeps the existing resident process for a steer (`bridge.ts:1403-1424`). That process still executes with A. The new accessor pairs its failed turn ID with mutable configuration B, and the daemon accepts the matching IDs and signs into B. Removing A's override during the steer instead makes recovery use the default profile. This violates the approved failed-profile ownership contract.

**Root-cause scope:** Shared ownership gap — the runtime's latest requested configuration and the bridge's effective process environment have different lifetimes, but recovery treats them as the same owner.

**Minimal fix:** Retain the effective environment associated with the root turn/session that actually executed, separate from settings staged for a later turn. Serve that snapshot for the matching failed turn; a successful steer must not replace it when the provider defers applying the environment. Keep the existing stale-turn invalidation.

**Done when:** With A active and B staged by a steer, failure of A followed by Sign in launches with A; removing the override during the steer cannot launch the default profile. A subsequent root turn invalidates the old recovery context. Verify the actual Claude steer/restart semantics, not only a runtime mock that immediately applies every environment update.

### [P1] Codex Account Pool failures bypass the routing rejection

**Files:** `apps/server/src/services/terminals/provider-login.ts:108` (reject list), related `apps/host-daemon/src/terminals/terminal-manager.ts:645`.

**Trigger:** A Codex turn routed through Account Pool ends with a terminal structured `unauthorized` error, then the user invokes the shared provider-login action.

**Evidence and impact:** Account Pool contributes `CODEX_OPENAI_BASE_URL` and `CODEX_POOL_AUTH_TOKEN` (`plugins/account-pool/src/server.ts:380-393`). Neither appears in the new reject list. The Codex bridge turns those variables into app-server `-c` routing options (`plugins/provider-codex/src/bridge/bridge.ts:351-385`), including the pool authorization header. Recovery instead runs plain `codex login --device-auth`, with none of that routing configuration. It therefore starts local account login for a failure owned by the pool; completing it does not renew the pool account/hub credential and can replace the host's local login. The structured unauthorized error is already supported by Codex's translator (`plugins/provider-codex/src/delta-translation.ts:414`, `:1324`), so this is reachable through the new generic route.

**Root-cause scope:** Shared ownership gap — the recovery service independently lists credential-routing variables and has drifted from the Account Pool/provider launch contract.

**Minimal fix:** Add the two actual Codex pool routing keys to the server-owned refusal policy. Keep the error limited to the variable name and direct recovery to the owning credential source. Do not launch local login for this case.

**Done when:** A retained failed Codex environment containing the pool keys is rejected before PTY spawn, without exposing their values; an ordinary direct Codex login remains permitted. Cover the actual Account Pool key names rather than only `ANTHROPIC_AUTH_TOKEN`.

### [P1] Direct login loses supported Claude executable resolution

**Files:** `apps/host-daemon/src/terminals/terminal-manager.ts:657` (override lookup and line 670 launch), related `packages/agent-runtime/src/runtime.ts:2563` and `apps/server/src/services/terminals/provider-login.ts:119`.

**Trigger:** The daemon is started with the supported `BB_CLAUDE_CODE_EXECUTABLE=/custom/claude` override and no `claude` on PATH. A normal thread runs using that binary, fails authentication, and the user clicks Sign in.

**Evidence and impact:** The Claude provider explicitly declares this inherited variable (`plugins/provider-claude-code/server.ts:100`); `packages/agent-runtime/src/provider-registry.ts:46-48` forwards it into the bridge. It is not automatically part of the runtime's per-thread `config.envVars`: the ordinary shell environment contains PATH and BB context, not this inherited override (`apps/host-daemon/src/runtime-shell-env.ts:616-645`). Recovery consults only `context.env` for the executable, so it misses the override and spawns bare `claude`. `buildTerminalEnv` also strips inherited `BB_*` variables through `sanitizeInheritedChildProcessEnv`, so it does not restore the missing value. Sign-in fails even though the thread's CLI is installed and usable. The same independent resolution also omits the bridge's supported native-install fallback paths (`plugins/provider-claude-code/src/bridge/session-options.ts:186-239`, existing regression at `bridge/__tests__/bridge.test.ts:1247`).

**Root-cause scope:** Shared ownership gap — provider execution and recovery choose the executable through different rules; the new test supplies the override directly in the mock context and misses the supported inherited source.

**Minimal fix:** Retain the effective executable selected for the failed session, including declared inherited overrides and the provider's native-install fallback resolution, and launch that executable directly with the retained profile. Share the provider's executable selection rather than adding a second partial search or a login shell.

**Done when:** A daemon-inherited executable override absent from contributed/shell env launches the same custom binary for recovery. A supported native installation outside PATH also launches successfully. Retained profile variables remain intact and login never invokes a login shell.

## Contract and lifecycle assessment

No concrete removal, narrowing or changed meaning of an existing public/wire field was found in this range. The public request mode and optional daemon launch context are additive; prior shell/command/argv shapes remain accepted. The optional runtime accessor preserves injected implementations. Protocol 234 to 235 uses the existing mismatch/update gate, so the new context cannot be silently ignored by a connected old daemon. SDK/domain versions both move from 0.6.42 to 0.6.43. No breaking-contract approval is inferred from these bumps.

The UI and CLI reach the SDK/public terminal create path, and the server sends credential-context identifiers rather than credential values. The daemon checks environment, provider and failed-turn IDs immediately before synchronous spawn. Runtime active/pending-turn checks, nested-turn handling, disposal/reaping, workspace binding, terminal errors and restart behavior were inspected. Missing/evicted context is explicitly refused; no default-profile fallback is supplied for that absence. This assessment does not claim those guards solve the effective-profile mismatch in finding 1.

This artifact ends at code review. Exact-head QA, screenshot evidence, user signoff and the manager's merge gate remain outside this leaf's work.
