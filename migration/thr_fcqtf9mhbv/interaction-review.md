# Auth recovery interaction review

**Verdict: NEEDS FIXES — 1 P1, 1 P2.** Leaf senior-code-reviewer; findings require manager validation before implementation. P2 is review-only.

## Target and limits

- Exact range: `git diff c6aef9658628fea3f3356517dc6710e20d0a13ab..4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9`.
- Reviewed head: `4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9`; HEAD checked at start and finish; tracked files clean.
- Verified through `pwd` and `bb status --json`: environment `env_jeqe9ahwrp`, host `host_q7quxdditd`, worktree `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb`.
- Reviewer thread `thr_s6ymzhdhcf`; manager `thr_8kunyvhjta`. Read `handoff.md` and relevant complete implementations and surrounding callers.
- Actual diff paths resolve the requested aliases: timeline helpers are under `packages/client-core/src/timeline/`; recorded expectation is `packages/provider-bridge-protocol/recordings/claude-code/auth-failure/bridge→runtime.current.ndjson`; CLI skill reference is `plugins/bb-guide/skills/bb-cli/references/thread-operation.md`.
- Owned scope: the two timeline UI files; auto-expand and render signatures; thread timeline projection and changed tests; Claude delta translation and changed tests; timeline row schema; recorded auth parity expectation; terminal CLI and command-output tests; both terminal guide references. Server/daemon/runtime code was context only.
- Supplied remote CI run [38447743273](https://github.com/get-bb/bb/actions/runs/38447743273) is corroborated by `.auth-green-ci.json`: exact head above, completed/success, all 44 jobs successful. No rerun or local test/typecheck/lint/build. No app/browser, OAuth, screenshot, or QA PASS claimed. Only this requested artifact was written.

## Entry-point inventory

| Surface | Behavior traced |
| --- | --- |
| Wide/compact timeline | Both render the same `ProviderSignIn` inside the expandable system error body. A trailing error auto-expands; the disclosure can then be collapsed. There is no width-specific sign-in implementation. |
| Keyboard/pointer | Native Sign in/Cancel buttons invoke the same handlers. The shared disclosure supports button keyboard activation. The reused `ThreadTerminalView` supplies terminal input, touch controls, link handling, and context menus. |
| Overflow/context menu/long press | Conversation action menus do not expose a separate provider-login action. Terminal menus expose link/copy operations. No competing auth-recovery handler was found. |
| Secondary panel | The shared terminal cache adds the login session to thread terminal tabs (`terminalPanelTabs.ts:99`, `ThreadDetailView.tsx:835`). Users can manually recover it there; reopening the inline error does not reattach it. This different-surface workaround does not preserve the primary inline path. |
| Command/CLI/SDK | The app `terminal.open` command creates an ordinary shell. Explicit CLI `terminal create --thread … --provider-login [--attach]` and the inline handler both call `sdk.terminals.create`, POST `/v1/terminals`, and `prepareProviderLogin`; neither submits a provider turn. |

## Findings

### [P1] Preserve ownership of the login terminal when its error row unmounts

**Files:** `apps/app/src/components/thread/timeline/ProviderSignIn.tsx:28` (primary), `apps/app/src/components/thread/timeline/ProviderSignIn.tsx:33` (pending creation).

**Problem:** Start sign-in, collapse the error row long enough for its close animation, then expand it. `ExpandablePanel` removes the body (`apps/app/src/components/ui/disclosure.tsx:295`), so the new component loses its only `session` reference. `ThreadTerminalView` cleanup only disposes its transport/renderer (`ThreadTerminalView.tsx:1173`); it does not close the persistent login process. The reopened row therefore shows an enabled Sign in button and no terminal or Cancel button, although the original OAuth command is still waiting. Clicking Sign in creates a second login session. Leaving the thread while creation is pending has the same ownership loss: the asynchronous result only sets state on the discarded component. This breaks normal inline continuation/cancellation and can leave concurrent login attempts on the same profile. The secondary-panel tab is a real workaround, but the row neither directs the user there nor restores its own active session.

**Root-cause scope:** One-off — this new component puts a persistent resource's identity exclusively in a disposable disclosure body; the existing terminal API and panel session owner already preserve sessions.

**Smallest fix:** Retain the login session identity and pending creation ownership outside the disposable row, keyed by thread and failed turn, and reattach that exact session on remount. A creation result whose owner was deliberately abandoned must be closed rather than silently discarded. Keep Cancel bound to that owned session.

**Done when:** Start login, collapse/reopen the row, and navigate away/back; the original active login remains recoverable inline with its Cancel action and no second login is created. Repeat with the create response delayed until after unmount. Cancelling stops only the owned login and leaves the thread, draft, and workspace intact.

### [P2] Do not offer historical authentication failures as current sign-in actions

**Files:** `apps/app/src/components/thread/timeline/ThreadTimelineRows.tsx:1245` (primary), `packages/thread-view/src/build-thread-timeline.ts:823`.

**Problem:** After an auth failure, send another message (or finish a later successful turn) and revisit the old error. Projection sets `providerAuthRequired` solely from the stored error category, and rendering checks only that flag plus a non-null turn ID. No current-turn or active-runtime condition reaches the button. It remains enabled and says to sign in even while a newer turn is active or has succeeded. Clicking it deterministically fails the shared server action's current-failure check (`apps/server/src/services/terminals/provider-login.ts:51`), producing “This thread has no current authentication failure.” This is a misleading dead-end recovery affordance, with no credential mutation because the server correctly rejects it. This finding concerns newly typed historical errors, not intentionally untyped older records.

**Root-cause scope:** Shared ownership gap — historical error classification is treated as action eligibility in the timeline, while the shared terminal action separately requires the current settled failed turn and rejects retries/active or superseded turns.

**Smallest fix:** Gate the sign-in control against the current failed-turn eligibility, including active-turn suppression, while retaining historical error text. Reuse current timeline/thread state or the shared eligibility result rather than guessing from error prose.

**Done when:** A current settled auth failure exposes Sign in; a later requested/active/successful turn removes or disables the obsolete affordance. Historical typed failures and retry-in-progress errors remain readable without an unusable login action. P2 remains follow-up only.

## Scope conclusions

The two explicit root assistant auth codes survive both `success` + `is_error:true` and error result subtypes. Ordinary later root assistant messages clear the retained code; turn open/close paths clear it; nested assistant messages do not overwrite it. The changed recorded expectation matches the recorded root `authentication_failed` assistant followed by `success/is_error:true`. No concrete introduced classification defect was found.

Retrying provider errors do not receive the auth flag; the render signature includes the flag, and auth errors with no detail remain expandable. Existing untyped persisted errors are intentionally not inferred from prose. The lazy terminal imports only after creation; its existing terminal transport handles attachment/output/exit, and close failures surface through the shared mutation toast. Exit zero says only that the command finished. Neither success nor cancellation resets/resubmits the thread or edits its draft. No additional finding is asserted for hypothetical module-load failures or unsupported real-provider sequences.

No dependency between the two findings. Manager owns false-positive validation, fixes, exact-head remote CI, browser QA, evidence/signoff, and the later merge gate. This leaf stops at source review.
