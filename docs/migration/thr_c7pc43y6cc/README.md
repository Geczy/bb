# Claude profile health migration handoff

This is an archival migration snapshot, not a product PR branch. Resume product work from `bb/check-health-for-the-active-claude-profile-thr_c7pc43y6cc` at `eb57495b8ba1c7453022bcd840dee06ed60d8905`; keep this migration-only evidence commit out of the product diff. The implementation branch remains independently based on exact main `c6aef9658628fea3f3356517dc6710e20d0a13ab`. No PR exists. Never merge this snapshot into main.

## Identity and ownership

Old thread `thr_c7pc43y6cc`, title “Check health for the active Claude profile”, was an implementation/remote-CI worker for Stickiness lead `thr_8kunyvhjta`, under Growth `thr_bdgvzaiafa`. No children. Old host `host_q7quxdditd` (bb-worker-1), environment `env_khtnyhv38a`, checkout `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb`. brsbl ordered this worker frozen and migrated to brsbl-bbox. No implementation, checks, apps, or new review were started during migration.

The lead owns downstream targeted review-fix validation, screenshot inspection/user sign-off, PR creation, and merge routing. The sibling recovery implementation belongs to `thr_fcqtf9mhbv`; it is independent and must not be combined into this health branch. This worker also completed the requested read-only validation of five recovery findings; its historical artifact is retained here but does not describe the later recovery head.

## Approved task and current result

Fix health/account/usage inspecting a different Claude profile from execution. Preserve shipped default behavior and never silently use a default account when a genuinely custom credential store is missing. Limit the product diff to `plugins/provider-claude-code/src/bridge/provider-maintenance.ts` and its existing `provider-maintenance.credentials.test.ts` owner. The source mismatch was reproduced with synthetic credentials through the production host provider-state route: future custom credentials, expired default credentials, but health reported expired even after a synthetic successful continuation. This was not evidence of a working real OAuth account.

Implementation and the independently validated P1 storage-override fix are complete and pushed. Exact-head remote CI is green (all 44 jobs), and the saved QA worker report records PASS for Linux synthetic file/profile behavior and its visible status card. No live OAuth, renewal, live usage, subscription authentication, or macOS Keychain runtime success is claimed. Mac Keychain is source plus mocked boundary evidence only.

The original review at `d929d96c4de8a5de1d3f0c835e1c20af681ba91d` found one P1 and one P2; independent validation kept both. The lead explicitly authorized only P1: “defined CLAUDE_SECURESTORAGE_CONFIG_DIR wins for credential file and Keychain identity; empty means default credential store with no service hash; nonempty uses its NFC string/path/hash exactly as vendor. Settings/account metadata stays tied to CLAUDE_CONFIG_DIR.” The implemented P1 is at the current product head. P2 remains report-only: `CLAUDE_CONFIG_DIR=""` can skip cwd `.config.json` metadata because of the legacy truthiness check. Do not fix it in this change. A separate targeted post-fix review verdict was not present among the artifacts carried by this worker; obtain it from the lead's successor before treating that gate as satisfied. Do not rerun the full review merely for reassurance.

## Selection rules and primary evidence

Official `@anthropic-ai/claude-code@2.1.296`, inspected 2026-10-13, pins Linux x64 and Darwin arm64 platform packages. Immutable archive URLs, SHA-512 integrity and executable SHA-256 hashes are in `vendor-provenance.json`. No `gitHead` is published. Relevant bundled JavaScript was inspected read-only inside those native binaries; the binaries were not executed. Registry tarballs can be downloaded again and verified against this record; excluded local binaries are not needed to resume.

One existing private owner, `claudeCredentialProfile`, selects health/account/usage sources:

- Settings directory: NFC of `CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")`.
- Defined `CLAUDE_SECURESTORAGE_CONFIG_DIR` wins for storage. Nonempty uses its NFC literal; empty uses NFC default `~/.claude`. Undefined uses the settings directory.
- Credential file: `.credentials.json` within that store. Missing custom storage never falls back to another default store. Existing macOS same-store file fallback and hexadecimal Keychain decoding are preserved.
- Keychain: `Claude Code-credentials`, plus `-` and the first eight lowercase SHA-256 hex digits of the NFC storage string when the effective explicit selector is truthy. Defined empty storage override suppresses the suffix even with custom settings. Explicitly selecting the default path uses a suffix. Do not trim, expand tilde, resolve against home, realpath, or canonicalize dot segments before hashing.
- Metadata stays on `CLAUDE_CONFIG_DIR`: custom normalized `.config.json` first, then `.claude.json` using the raw environment string; unset default preserves shipped `~/.claude.json`. The explicit-empty metadata P2 is intentionally not changed.
- These variables must be inherited by the actual daemon/bridge. Setting a different interactive shell is insufficient. Per-thread contributed auth overrides and other auth modes were not expanded into this repair.

Storage functions/source offsets: Linux executable `Dw` at byte 209490609, `Lue` at 209490744, credential-file selection at 209495815; Darwin `Lw` at 189113735, `j$` at 189113870, Keychain read at 189120346, file selection at 189123581. Metadata/control-flow details are in `health-finding-validation.md`. The public SDK plugin-discovery resolver uses different shipped normalization and remains untouched.

Prior decisions: issue https://github.com/get-bb/bb/issues/3607 and correction https://github.com/get-bb/bb/issues/3607#issuecomment-5780060962 identify the custom service suffix, superseding the refresh theory. PR https://github.com/get-bb/bb/pull/4086 was closed unmerged; do not inherit its default fallback or home-based expansion. Never recommend changing config directory as a workaround: that previously stranded session history. Historical commit `ecf3832a1b8a40deb241837e61a65a1ba41847c8` owns preserved hex decoding/same-store fallback.

## Remote red/green evidence

All tests/typechecks/lint/CI builds ran only in existing GitHub Actions `ci.yml`, using workflow_dispatch with verified headSha. No workflow was added. Local work only formatted the two owned files.

- Original tests-only head `f3222eaf4f6f0a061761855f3e44741180896224`: https://github.com/get-bb/bb/actions/runs/38444687568/job/115460452237 ; 15 new mismatch regressions failed, 3 existing credential cases passed. The completed red job is evidence even though the remaining workflow was later cancelled by a new dispatch.
- Original reviewed green head `d929d96c4de8a5de1d3f0c835e1c20af681ba91d`: https://github.com/get-bb/bb/actions/runs/38446193169 ; all 44 jobs passed.
- Storage-override tests-only head `a05e1c89181a108616b508bc00c55ebacc8518fe`: https://github.com/get-bb/bb/actions/runs/38454228522/job/115493120016 ; 7 new cases failed meaningfully while 400 existing Claude tests passed. Five expected-ready cases read expired settings credentials, two missing-store cases incorrectly reported ready.
- Final product head `eb57495b8ba1c7453022bcd840dee06ed60d8905`: https://github.com/get-bb/bb/actions/runs/38454713866 ; completed/success, all 44 jobs. Freshly rechecked during migration. Linux job https://github.com/get-bb/bb/actions/runs/38454713866/job/115495194476 passes all 25 credential cases / 407 Claude tests. Windows job https://github.com/get-bb/bb/actions/runs/38454713866/job/115495194051 passes all 25 credential cases / 406 Claude tests with one existing skip.

Tests exercise the exported health and usage boundary using synthetic filesystem/Keychain/HTTP fixtures. They cover custom/default mismatch, platform paths, absence, hash/NFC literal semantics, storage override empty/nonempty/missing, selected token/account, same-store fallback, existing hex and usage throttling. No new production seam, exported helper, or real credential access. Early fixture-only CI repairs are documented in the historical implementation handoff; do not reintroduce shared Vitest config imports into this forkable plugin.

## Saved exact-head QA and screenshots

`qa-report.md` and `qa-evidence.json` record PASS at the final product head against exact base. Their absolute paths and old host IDs are historical; PNG basenames now resolve beside this README. SHA-256 values are preserved in the evidence record. Screenshot files are unchanged originals, not resized images.

QA used the same isolated HOME/DB, synthetic profiles, `/settings` setup Agent card, light theme, top scroll, headless Chrome for Testing `155.0.0.0`, DPR 2. Desktop 1440x900 CSS produced 2880x1800 PNGs; phone 390x844 produced 780x1688. Base showed expired/default account, head ready/custom account. Check again retained the custom result; navigation away/back restored it. Missing custom credentials returned unauthenticated; explicit empty storage selected default credentials with custom settings metadata; nonempty third-store expired/missing results stayed scoped to that store. No browser error/unhandled rejection was recorded after mount.

The fake CLI advertised `2.1.238 (isolated synthetic Claude fixture)`; that is QA fixture output, not the 2.1.296 source provenance. No live usage endpoint was validated by this product QA; usage selection has mocked-boundary remote CI coverage. A blank first base capture and a hard-coded-launcher case were discarded and corrected; only counted evidence is preserved.

The two launcher/bootstrap scripts here are historical reference only: they contain old paths and relative imports and must be adapted to a fresh task directory if further QA is justified. Do not execute them unchanged. `scripts/bb-dev-app` was absent at these revisions, so the documented `pnpm dev` launcher was used. Bootstrap a fresh DB/HOME; enable only provider-claude-code, thread-list, environment-project-checkout, environment-personal-workspace and custom-instructions. Do not copy the old isolated database or auth secrets. Do not copy production data. Explicitly exclude connect, push-notifications, automations, scheduled-send, design-doctrine and account-pool. Set case environment in the daemon/bridge launcher, use synthetic values and fresh ports. The review/QA gate does not require redoing an already passed unchanged scope merely because the server migrated.

Old QA ports 12150/20150/28150 are stopped; terminal `term_s8pjs54hhr` exited and browser session `59355e08-6ce4-4a63-9ad1-0152cc116405` closed. This thread/environment had no live terminals at migration. No task port share, schedule, automation or plugin-state change is owned here. Other host-wide Connect shares were left alone. No production service or daemon was reconfigured.

Optional original diagnosis assets on Mac `host_37m3sgpq59`: `/Users/brsbl/Moss/Notes/bb Recovery and Continuation Research/assets/recovery-20261013/`. They are not required for continuing Linux work; use Mac only if an isolated native Keychain validation is specifically chosen, never personal credentials.

## Carryover records and omissions

- `implementation-handoff.md`: historical implementation/CI details before later QA; its claim that this implementation worker launched no app remains true but is superseded for project QA by `qa-report.md`.
- `health-review.md` and `health-finding-validation.md`: review and independent validation at original d929d96c head. P1 subsequently fixed; P2 intentionally report-only.
- `historical-recovery-validation.md`: read-only result at recovery `4dbb0d82aef44c2f8ef4bb21f6bab87677fd86d9`, all four P1 kept and one P2 report-only. It does not claim current recovery status; defer to that owner's migration handoff. No recovery code is included in this health branch.
- Historical absolute links inside copied reports point to the old server; this README maps each needed report to its saved sibling. GitHub code/CI links remain accessible.
- Deliberately excluded: recreatable vendor archives/executables and source extracts; downloaded CI logs (permanent run/job URLs retained); synthetic QA DB/HOME, local dev auth secrets, caches, generated/runtime files; invalid blank capture. No unfinished tracked edits are left behind. Originals remain on old disk; none were deleted or moved.

## Remaining gate and constraints

Implementation/CI work has no blocker. No PR, user sign-off, merge card or explicit merge approval exists in this worker's record. Confirm targeted P1 fix-review completion with the lead successor, inspect the saved exact-head QA/evidence, then let the lead create the independent health PR and obtain brsbl sign-off. Preserve gate: remote CI -> deliberate review / targeted finding fix validation -> exact-head qa-agent PASS -> matching full-window 2x screenshots -> brsbl sign-off -> Growth merge card -> explicit merge approval. Keep before/after directly in the eventual PR body, originating thread line, repository PR template and AGENT GENERATED footer.

No onboarding restyling, telemetry/experiments, credential migration/refresh, auth policy, account-pool work, recovery UI/error events, public API/protocol break, or P2 cleanup. No code comments except allowed directives. No real credentials/Keychain access, real OAuth login/revocation, production UI, production data copies, local tests/typechecks/lint/builds, force-push, or autonomous merge. Only remote GitHub CI checks. Don't rerun a broad review or QA scope without a material reason. The old worker will not commit/push again after its final migration reply.

No open question is waiting on brsbl in this worker's record. Future decision cards must explain the project/change in plain words, why a decision is needed now, the choices and consequences, recommendation/reason, and what happens after each answer. Stickiness owns combined sign-off/merge routing.

## First successor action

Fetch both refs from get-bb/bb, read this snapshot, and verify the product branch is still at `eb57495b8ba1c7453022bcd840dee06ed60d8905`. Coordinate with the migrated Stickiness lead to identify the existing targeted P1 fix-review verdict and remaining sign-off/PR work. Resume on the product branch; do not merge/cherry-pick this archive-only commit or silently rebase the QA-reviewed head. Linux is sufficient to continue. Avoid asking brsbl to repeat already approved P1 authorization.
