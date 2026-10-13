# Failed-thread sign-in recovery QA

**Verdict: BLOCKED** on the exact-head Browser Automation pass. The only Chrome for Testing session stopped after the exact-head route timed out, including one evidence-based retry using `domcontentloaded`; the session cannot be resumed. I did not open another browser session or use another driver. The login terminal, pending cancellation, repeat failure/success, explicit continuation, and same-fixture after screenshots therefore remain unverified.

## Revisions and scope

- Before: `c6aef9658628fea3f3356517dc6710e20d0a13ab`.
- After: `b832a49c250e23346d470e3193af2ed05fd71a99`; restored branch `bb/recover-failed-sign-in-in-the-original-thread-thr_fcqtf9mhbv` at that exact SHA.
- Exact-head remote CI was already green, 44/44, at [run 38457001009](https://github.com/get-bb/bb/actions/runs/38457001009); it was not rerun.
- No source files, tests, builds, CI, review, PR, or merge were changed/run here.

## Completed evidence

- The isolated source app ran with the documented `pnpm dev` fallback because `scripts/bb-dev-app` is absent. The isolated home/data directory was under this task directory. Enabled plugins were `provider-claude-code`, `thread-list`, `environment-project-checkout`, `environment-personal-workspace`, and `custom-instructions`. `connect`, `push-notifications`, `automations`, `scheduled-send`, `design-doctrine`, `account-pool`, and `bb-ai` were disabled. No `cloud-ai` plugin ID was registered in this fixture. App telemetry and Turborepo telemetry were disabled.
- On the exact base, real app → server → host-daemon → synthetic Claude bridge execution produced prior output and then an auth-coded failed root turn on project `proj_s7v42a4adh`, thread `thr_j9uvsu9cpe`. The UI showed `SYNTHETIC AUTH TEST` and had no Sign in control. The composer draft was present and the workspace marker hash remained `45c609d1b003eacacaf283d8b2b0b21dbcef569678757ff931cde7b69d41917b`.
- On exact head, an earlier same-app run on thread `thr_i2aekabcc3` showed the expanded `Provider authorization failed` row with Sign in visible, preserved the draft, and resumed the synthetic Claude session after the app restart using `--resume=<session id>`. This is partial runtime evidence only: that capture predates the task fixture’s `SYNTHETIC AUTH TEST` label and is a different thread from the final base screenshot pair, so it is not accepted as matched after evidence.
- The installed real Claude Code CLI was `/usr/local/bin/claude`, version `2.1.296`. A separate bounded probe used only an isolated HOME/profile and synthetic invalid credentials: the auth probe exited 1 with an auth failure; `auth login` reached its login prompt and was interrupted after six seconds with `BROWSER=/bin/true`. No URL was opened and no OAuth completed. This direct CLI probe does not prove BB’s server/daemon terminal launch.
- Browser Automation was local headless on explicit host `host_q7quxdditd`, session `0691db56-74b1-477c-bb64-f7051ae44f66`. Its Chrome version was not recorded. A cold source-page load first showed an empty shell while Vite prepared modules, then settled; the captured console-error list was empty. No full transition or pending-login navigation flow completed.

## Screenshots

All captures are fresh full-window PNGs from `page.screenshot`, at 2× pixel density. The final base captures share the same route, project, thread, draft, light background, scroll position, and fixture. There is no valid matched after capture on the exact head.

| Capture | Revision / thread | CSS viewport / PNG | SHA-256 | Use |
| --- | --- | --- | --- | --- |
| `before-base-desktop-final.png` | base / `thr_j9uvsu9cpe` | 1440×900 / 2880×1800 | `7ca8f516282204ff32a5f789f0bac43cce54277548b1d446fcb326b9c2665f1d` | Final base evidence |
| `before-base-mobile-final.png` | base / `thr_j9uvsu9cpe` | 390×844 / 780×1688 | `af594a0915dbba1e5cbe607166f5d48e765cb5a3726b94cc6f73e2c51b2857e9` | Final base evidence |
| `after-head-desktop-signin-visible.png` | head / `thr_i2aekabcc3` | 1440×900 / 2880×1800 | `2cb4d590d650159a3c13803d1a4cf8de9ada059fa967428e48acc7a2ed9cd2a1` | Preliminary only; different thread and no synthetic label |

Other earlier PNGs are retained in the task directory and are not comparison evidence. They were not overwritten or deleted.

## Runtime ownership and cleanup

- Source-app command: `<task-dir>/run-dev.sh` (`pnpm dev` from the exact worktree). Isolated HOME, `CLAUDE_CONFIG_DIR=<task-dir>/default-profile`, and inherited `BB_CLAUDE_CODE_EXECUTABLE=<task-dir>/bin/claude`; the project thread used `<task-dir>/custom-profile`, making default-profile substitution detectable.
- Task environment `env_jeqe9ahwrp`, physical host `host_q7quxdditd`; local dev server logical host `host_3r2e5qervk`; local thread environment `env_x3sbkgat8s`. The fixture’s workspace path was `<task-dir>/workspace`. Because it is nested inside this worktree, BB’s git panel showed parent-checkout uncommitted files; the fixture did not write them. The marker file remained unchanged.
- App terminal sessions were `term_p938x89rxb`, `term_wbebsmhg27`, `term_hhas7jihef`, `term_i5x78cs4uf`, and `term_xfdqcbwn7x`, all owned by `env_jeqe9ahwrp` on `host_q7quxdditd`. Their command was the task-local `run-dev.sh`. Ports 18445 (app), 26445 (server), and 34445 (host daemon) all closed after cleanup. No QA app or Claude process remains.

## Material gaps

No exact-head after screenshot for `thr_j9uvsu9cpe`; no click on the BB Sign in action; no pending terminal collapse/reopen or navigate-away/back check; no terminal cancellation, failure-exit or success-exit UI path; no explicit continuation after sign-in; no stale-turn/unavailable-context API denial check; no Codex Account Pool boundary check beyond the supplied green CI; no runtime A→B steer/removal check; no PTY ownership check across physical hosts; and no real OAuth or post-OAuth transcript restoration. The browser version is also unavailable because the sole browser session stopped before it was queried.
