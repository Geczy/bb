# Missing-auth recovery migration checkpoint

This checkpoint preserves the unmerged bb missing-authentication recovery implementation and its evidence. It is a migration archive, not the release/QA target. The product branch remains `bb/recover-failed-sign-in-in-the-original-thread-thr_fcqtf9mhbv` at `b832a49c250e23346d470e3193af2ed05fd71a99`, based on exact main `c6aef9658628fea3f3356517dc6710e20d0a13ab`. Repository: https://github.com/get-bb/bb. No PR exists for that branch, checked during migration. Do not merge the migration documentation into the product diff merely to preserve it.

Old thread: `thr_fcqtf9mhbv`, “Recover failed sign-in in the original thread,” leaf worker reporting to Stickiness lead `thr_8kunyvhjta`; Growth manager was `thr_bdgvzaiafa`. No child threads. Stickiness owns combined sign-off and merge routing, including the independent credential-profile health fix owned by another worker. This recovery branch does not modify `provider-maintenance.ts`.

## Approved product behavior

Growth explicitly directed: “when a turn fails on auth, offer a sign-in action on the failed thread's own execution host and credential profile, then let the original thread continue without a restart and without losing the draft or work.” Only structured terminal authentication errors authorize recovery; provider health alone does not. No automatic resubmission or spend follows login. Cancel closes only that login terminal. Preserve thread ID, messages, unsent draft, provider resume intent and workspace files. Refuse with an exact blocker when the failed context cannot be retained safely; do not silently use the primary host/default profile.

Implementation surfaces: inline failed-error Sign in, `sdk.terminals.create` with thread scope and `start: {mode: "provider-login", turnId}`, and `bb terminal create --thread <id> --provider-login --attach`. The server owns eligibility/refusal policy. The daemon launches direct argv using retained execution environment/executable. Host protocol is 235 (from 234); SDK/domain are 0.6.43 (from 0.6.42), preserving older shell/command/argv contracts. See `implementation-handoff.md` and `docs/provider-bridge-protocol.md` for details and compatibility evidence.

## Review and implementation state

Two reviews of `c6aef9658628fea3f3356517dc6710e20d0a13ab..4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9` found four P1s, independently validated and explicitly authorized for correction. They are implemented at the final product head:

1. Keep the actual resident/root execution environment separately from latest requested config. A successful steer requesting B or removing A must still recover the resident A failure with A. Claude returns optional executed-session context, and runtime retains legacy root snapshots when old bridges omit it. New root/session-release invalidation remains.
2. Refuse local Codex login when retained `CODEX_OPENAI_BASE_URL` or `CODEX_POOL_AUTH_TOKEN` is nonempty, before PTY creation and without exposing values. Direct Codex login remains available.
3. Retain Claude SDK's selected executable, including daemon-inherited `BB_CLAUDE_CODE_EXECUTABLE` absent from contributed environment and non-root native install fallback outside PATH. Recovery neither duplicates resolution nor invokes a login shell.
4. Own inline terminal identity and pending creation in QueryClient, keyed by thread/failed turn, beyond disposable disclosure bodies. Remount reattaches the same terminal with Cancel; duplicate creates deduplicate; deliberately abandoned owners close late results.

P2 historical Sign in eligibility remains deliberately report-only. Do not expand this branch to fix it. No onboarding styling/setup changes, Account Pool redesign, business metrics, telemetry or experiments were added.

The original source review's suggestion that canonical Claude steer immediately applies B to session construction was too broad: `claudeTurnSteerParamsSchema` omits `config`; the runtime stores the next requested config, which the next root request supplies. This does not invalidate the wrong-account finding against the original recovery accessor. The final bridge regression follows these actual boundaries. Completely empty env maps mean no config update; the removal fixture now preserves the BB thread/environment variables always sent by the runtime.

The lead's final review-fix validation outcome is not recorded in this worker's messages. Coordinate with the migrated Stickiness lead before repeating a full review; only inspect the authorized fix diff if that validation is still outstanding.

## Remote CI evidence

- Original classification red: https://github.com/get-bb/bb/actions/runs/38444304420 at `151d59fa4a61ae989a6057dd00aaeeea4ffc6c21`.
- Four-fix test-only red: https://github.com/get-bb/bb/actions/runs/38454592630 at `63d010a4594eec81e6e9801c3171cbcaf772829a` (inline ownership and missing Claude context).
- Corrected test-only red: https://github.com/get-bb/bb/actions/runs/38455078567 at `3eaddcf8d4342e7f48af77f094abd6c27ec96fe9` (runtime returned B/missing A; server policy omitted real Codex pool keys). Fixture compilation/timeout errors in these runs are separately documented and are not the regression proof.
- Final green: https://github.com/get-bb/bb/actions/runs/38457001009 at `b832a49c250e23346d470e3193af2ed05fd71a99`, attempt 2, all 44 jobs successful; rechecked during migration. `green-ci.json` preserves exact metadata. Only a Windows provider-parity bridge that exited before initialize was rerun; same-head rerun passed all 59 parity tests without code changes.

All tests/typechecks/lint/builds were remote. No CI was launched for this migration-only save.

## Later QA supersedes the implementation-only handoff

Read `qa-report.md` and `qa-retry-report.md`. They were written by later QA workers in this environment after implementation handoff. Both verdicts are BLOCKED, not PASS. The initial browser session timed out; a bounded second attempt in Chrome for Testing 155 reached the correct route but stayed on “Loading thread.” Available evidence does not establish a product defect: server/environment endpoints returned 200, but no timeline fetch appeared after navigation. Diagnose fresh fixture/app initialization before another QA attempt. Do not claim successful login, real OAuth, post-OAuth transcript restoration, or cross-host continuation.

There are base full-window 2x screenshots and a preliminary head screenshot from a different fixture/thread. They are not a valid matched pair. They remain on the old host but are intentionally not committed; regenerate both sides with the same fresh fixture/route/state/viewport for sign-off on the successor host. No screenshots have been approved here.

QA's original isolated app used `pnpm dev` because `scripts/bb-dev-app` was absent. Source ports were app 18445, server 26445, daemon 34445. Task-local HOME/default profile plus a different custom project profile made profile substitution visible. Enabled fixture plugins were provider-claude-code, thread-list, environment-project-checkout, environment-personal-workspace, custom-instructions; connect/push-notifications/automations/scheduled-send/design-doctrine/account-pool/bb-ai and telemetry were disabled. Never copy this old data directory into a new server.

`fixtures/` contains reference-only synthetic fake CLI, bootstrap, seed and launch scripts. They contain no real tokens; literal credential placeholders are explicitly synthetic. They preserve the old paths/import locations and are not portable launch commands as-is. Adapt into a fresh task-local fixture only when the lead authorizes QA. No personal credentials, app auth secret, database, transcript or profile has been copied.

## Resources and exclusions

Old worktree: `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb`, environment `env_jeqe9ahwrp`, host `host_q7quxdditd`. Migration checks found no thread/environment terminals and no listeners at 18445/26445/34445. No previews, schedules, automations or task plugin mutations are owned by this leaf. Existing unrelated host shares at 4611, 5180, 47410 and 47842 were left untouched.

Old-only exclusions, safe to leave for owner cleanup: `.auth-*.log`, `.auth-ci-cache/`, `.auth-review-fixes/` raw logs, `.auth-recovery-qa-current`, and `.auth-recovery-qa-6Sm9LO/` containing the local database, synthetic/isolated profiles, transcripts, home/package caches, intermediate captures and unmatched screenshots. Selected reports/fixtures and final CI metadata have been preserved here. Do not read or migrate excluded credentials/auth secrets. The original untracked handoff/review files duplicate the saved copies.

Mac is not required for this web feature's next Chrome for Testing pass. Optional older causal research remains on the Mac at `/Users/brsbl/Moss/Notes/bb Recovery and Continuation Research/assets/recovery-20261013/` (selected report.md, fake-claude.mjs, bootstrap.mjs, launch.mjs, create-fixture.mjs). No personal Moss note was authored here. Health validation is included as `health-validation.md` solely to preserve this leaf's independent read-only finding check; the health branch, vendor archives and subsequent repair belong to the separate health worker/Stickiness lead.

## Remaining acceptance gate

- Confirm review-fix validation of product head with the migrated Stickiness lead.
- Resolve isolated app/fixture loading and obtain qa-agent PASS on exact product head in Chrome for Testing.
- Verify failed-host/profile/executable ownership, A-to-B steer/removal, pending login unmount/remount, Cancel/failure/success and explicit continuation without lost draft/thread/files/resume intent; observe no automatic resubmission.
- Complete matched main-base vs product-head full-window 2x before/after screenshots and brsbl's explicit screenshot sign-off.
- Lead opens the independent PR with evidence, originating `BB-Thread-ID: thr_fcqtf9mhbv`, repository template and `> AGENT GENERATED` footer. No PR or merge was authorized to this leaf.
- Stickiness routes combined sign-off/merge through Growth; merge only after explicit user approval. Remote CI is also required after any authorized merge.

No question is currently waiting on brsbl. Future decision cards must begin with the project and plain-language context, why a decision is needed now, options/consequences, recommendation/reason, and what follows each answer. Stickiness owns those cards. On this old server, after the migration reply, this worker must never commit or push again and must answer future wakes only “Moved to brsbl-bbox”.
