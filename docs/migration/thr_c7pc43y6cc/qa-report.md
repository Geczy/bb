# Claude credential profile health QA

Verdict: **PASS** for the synthetic Linux credential-file health path and the provider status card at exact head `eb57495b8ba1c7453022bcd840dee06ed60d8905`, compared with base `c6aef9658628fea3f3356517dc6710e20d0a13ab`.

## UI comparison

Same isolated DB/HOME, synthetic credentials, route `/settings`, light appearance, top scroll position, and provider setup card state on both revisions. Captured full-window PNGs with the BB Browser Automation local headless Chrome for Testing session on `host_q7quxdditd` (`HeadlessChrome/155.0.0.0`), `deviceScaleFactor: 2`.

- Base: UI says `Installed · your session expired`; API returns `expired`, `default@example.test`.
- Head: UI says `custom@example.test · Max (5x)` and `Ready`; API returns `ready`, `custom@example.test`.
- Desktop viewport 1440×900 CSS px (2880×1800 PNG); phone viewport 390×844 CSS px (780×1688 PNG). Hashes and paths are in `evidence.json`.
- After load, the status card settled after the development bundle finished loading. A `Check again` refresh retained the ready custom account. Navigating to Provider settings and back through the setup guide restored the same card and account. Post-mount `error` and `unhandledrejection` listeners recorded no errors.

## Targeted host-health RPCs

All calls used `/api/v1/system/providers/state?hostId=host_rc2wgrkf66` on the isolated host service; the environment was set in the source launcher inherited by the host daemon and provider bridge.

- (b) Missing custom config credentials, with ready default credentials: `unauthenticated`, `accountEmail: null`.
- (c) Custom settings dir plus `CLAUDE_SECURESTORAGE_CONFIG_DIR=""`; default valid and settings credentials expired: `ready`, `accountEmail: custom@example.test`.
- (d) Nonempty third-store override; default/settings valid and third-store credentials expired: `expired`, `accountEmail: custom@example.test`. Removing the third-store file returned `unauthenticated`, `accountEmail: null`.

Credentials and tokens were synthetic. This does not prove OAuth login/renewal or live usage. macOS Keychain runtime behavior was not exercised; no personal credentials or production data were read.

## Runtime and cleanup

- Environment `env_khtnyhv38a`, host `host_q7quxdditd`, worktree `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb`.
- Source launch was documented `pnpm dev` via task-local `launch.mjs`, under an environment-scoped BB terminal; app/server/daemon IPv4 ports were `12150`, `20150`, `28150`.
- Browser session `59355e08-6ce4-4a63-9ad1-0152cc116405` was the only live QA browser session. Terminal IDs used are in `evidence.json`; current launcher PID pair before shutdown was `1701459` and `1701469`.
- The first base capture was a blank page while Vite was still compiling; it is retained as `before-desktop.png` for traceability and is not evidence. After checking document state and loaded modules, the page settled and valid captures were taken. The after route similarly needed the already-warmed modules before its card settled.
- No local tests, typechecks, lint, CI, source edits, production changes, or PR actions were performed.
- App terminal and browser session were stopped after writing this report. The named branch/head was restored; only supplied task artifacts and this task directory remain untracked.

Cleanup verified: terminal `term_s8pjs54hhr` exited, browser session `59355e08-6ce4-4a63-9ad1-0152cc116405` is closed, ports 12150/20150/28150 refuse connections, branch `bb/check-health-for-the-active-claude-profile-thr_c7pc43y6cc` is at the exact requested head, and tracked diff is clean. The initial case (b) result from the hard-coded launcher was discarded; the corrected task-local launcher applied `case.env.json` to the host daemon/bridge before the counted b–d RPCs.
