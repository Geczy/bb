# Claude credential-profile review

**Verdict: NEEDS FIXES — one P1 and one P2.** Both findings are One-off mistakes in the existing shared profile selector; no Shared ownership gap was found. P2 is report-only. No changes were implemented.

## Reviewed identity and scope

- Date: 2026-10-13. Leaf senior-code-reviewer; owning thread: `thr_8kunyvhjta`; reviewer: `thr_vqrrdyhe6m`.
- Verified cwd: `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb`.
- `bb status --json` confirmed host `host_q7quxdditd`, environment `env_khtnyhv38a`, and the owning parent thread.
- Exact reviewed HEAD: `d929d96c4de8a5de1d3f0c835e1c20af681ba91d`.
- Exact base: `c6aef9658628fea3f3356517dc6710e20d0a13ab`.
- Command: `git diff c6aef9658628fea3f3356517dc6710e20d0a13ab..d929d96c4de8a5de1d3f0c835e1c20af681ba91d -- plugins/provider-claude-code/src/bridge/provider-maintenance.ts plugins/provider-claude-code/src/bridge/provider-maintenance.credentials.test.ts`.
- Read both complete files, the implementation handoff, the relevant vendor source in both captured binaries, historical hex/fallback repair `ecf3832a1b8a40deb241837e61a65a1ba41847c8`, shared session environment forwarding, and parent task scope. Only the two requested files differ cumulatively. Tracked files remained clean.
- Existing remote evidence: [CI run 38446193169](https://github.com/get-bb/bb/actions/runs/38446193169), captured `final-ci.json`: exact head above, completed/success, 44 jobs with success. CI was not rerun.

## Findings

### [P1] Honor the credential-storage override before selecting the custom profile

**Files:** `plugins/provider-claude-code/src/bridge/provider-maintenance.ts:272` (profile selection), `:277` (credential file), `:282` (Keychain service).

**Problem:** With host `CLAUDE_CONFIG_DIR=/profiles/work` and `CLAUDE_SECURESTORAGE_CONFIG_DIR=""`, Claude explicitly uses the default credential storage: `~/.claude/.credentials.json`, or the unsuffixed `Claude Code-credentials` Keychain service. The new selector ignores the storage override and instead reads `/profiles/work/.credentials.json` / the suffixed custom service. A valid default login with absent custom credentials changes from `ready`/successful usage at the base revision to `unauthenticated` at this head. If the custom location contains another valid token, usage is requested for that other account instead. Both health and usage are affected through the shared reader.

This is an introduced regression for the same OAuth file/Keychain mechanism, not a request to implement another authentication mode. The handoff excludes this variable, but the caller's goal requires the active host credential profile and preserving shipped default behavior; no approval for breaking this working default-storage configuration was supplied. `session-options.ts:273` forwards this host environment unchanged, so Claude continues to honor the override while maintenance ignores it.

**Evidence:** Direct inspection of the captured 2.1.296 Linux binary at byte 209490623 (`Dw` / `Lue`) and Darwin binary at byte 189113749 (`Lw` / `j$`) shows that a defined `CLAUDE_SECURESTORAGE_CONFIG_DIR` takes precedence. An empty override selects the default credential directory and suppresses the Keychain hash suffix. For a nonempty override, its NFC string supplies the file directory and hash. The compared base reads default storage unconditionally, which is correct for the concrete empty-override trigger above. The captured packages and extracted binaries were independently hash-checked as described below.

**Root-cause scope:** One-off. Health and usage already share `claudeCredentialProfile` and `readCredentials`; the missing precedence rule is localized there.

**Smallest fix:** Resolve the credential-storage directory and Keychain identity using the vendor's override precedence, including its distinct empty-string behavior. Keep account metadata selection tied to `CLAUDE_CONFIG_DIR`. Do not add fallback to default storage when a genuinely custom effective credential store is missing.

**Done when:** With a custom settings directory and an explicitly empty storage override, both readers use the valid default credential store and never a conflicting custom token. A nonempty storage override selects only that store with the correct NFC-derived service; absent custom credentials still do not borrow default credentials. Default, hex parsing, and same-store file fallback behavior remain intact.

### [P2] Include an explicitly empty config directory in legacy account lookup

**Files:** `plugins/provider-claude-code/src/bridge/provider-maintenance.ts:279`.

**Problem:** On Linux, for host `CLAUDE_CONFIG_DIR=""`, the new nullish directory calculation deliberately selects `.credentials.json` relative to the bridge cwd. However, the truthiness guard disables the corresponding `.config.json` lookup and reads `~/.claude.json` instead. Claude's source checks `<configDir>/.config.json` even when the explicit config directory is empty. With a valid cwd credential file, a cwd `.config.json` for account A, a stale home `.claude.json` for account B, and no default credential file, the patch now reports A's working credentials with B's email and `accountKey`. Previously that fixture returned unauthenticated without an account. This newly supported credential source can therefore attribute usage to the wrong account.

**Evidence:** The vendor raw config accessor preserves `""`; the nullish default plus NFC calculation appears at Linux byte 207256450 / Darwin byte 186879314. Legacy account selection at Linux byte 207518686 / Darwin byte 187141412 checks the joined `.config.json` path without a truthiness guard before falling back to the home `.claude.json`. The new code implements the credential half of this explicit-empty path, but suppresses its legacy account half.

**Root-cause scope:** One-off. A truthiness check within the existing shared profile selector loses the distinction between unset and explicitly empty; both consumers already share account loading.

**Smallest fix:** Permit legacy lookup whenever `configuredDir !== undefined`, including `""`, while preserving the existing unset-profile default metadata behavior.

**Done when:** The explicit-empty fixture above returns account A's email and UUID with A's credentials for health/usage. An unset `CLAUDE_CONFIG_DIR` retains BB's existing default metadata location. This P2 remains follow-up work for the root to assess; no implementation is requested here.

## Vendor provenance and checked behavior

All paths below are under the worktree's `.credential-profile-rr4IbJ/` directory. The published versioned archives are the immutable source; captured metadata has no `gitHead`.

- `@anthropic-ai/claude-code-linux-x64@2.1.296`: archive `claude-code-linux-x64-2.1.296.tgz`; extracted `package/claude`; source SHA-256 `24972e3bc859fab2b46ed4c1e51f7d6130f06d3bd550811a114640de3370d0de`.
- `@anthropic-ai/claude-code-darwin-arm64@2.1.296`: archive `claude-code-darwin-arm64-2.1.296.tgz`; extracted `darwin/package/claude`; source SHA-256 `c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`.
- Recomputed SHA-512 for both tarballs matches `provenance.json` and their captured registry integrity values (`native-registry.json`, `darwin-registry.json`). Hashing `package/claude` directly inside each archive matches the extracted binary hashes above. Neither executable was run.
- Without the storage override, custom service identity correctly uses the first eight lowercase SHA-256 hex digits of the NFC config-dir string, with no trimming, tilde expansion, dot-segment canonicalization, or home-based resolution before hashing. Explicitly selecting the default directory correctly keeps a suffix. Relative file paths retain process-relative semantics.
- Nonempty custom metadata correctly prefers the normalized `.config.json`, then uses the raw environment string for `.claude.json`. Missing custom credentials do not fall back to the default profile. Hex parsing and invalid-Keychain file fallback remain unchanged.
- Health and usage both snapshot the same private selector per invocation. Public SDK discovery normalization, response APIs, daemon protocol, telemetry, and the usage request/normalization path are unchanged. Existing Keychain username/service-only fallback behavior is unchanged and was not reported as introduced.
- Per-thread environment overrides, alternate API-key/third-party OAuth modes, and Windows credential-manager policy were not expanded into review findings. The storage-override finding is limited to a concrete regression in the in-scope host OAuth credential source.

## Limits and gate

Review used source inspection and artifact hashing only. No tests, typechecks, lint, builds, app/browser launches, CI dispatches, PRs, branch changes, subagents, thread lifecycle actions, or merges occurred. No real credentials were read. The findings' triggers and results are derived directly from source control flow, not claimed as runtime reproductions.

Blocker: root validation of the P1 storage-selection regression. The remote CI → review → exact-head QA/right browser → inline full-window before/after → user screenshot sign-off → manager merge card → explicit merge approval gate remains unchanged. This task ends at review.
