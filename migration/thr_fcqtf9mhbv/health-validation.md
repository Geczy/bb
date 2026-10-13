# Health review finding validation

## Validation Results

### KEPT: [P1] Honor the credential-storage override before selecting the custom profile

**Trigger:** The host daemon inherits `CLAUDE_CONFIG_DIR=/profiles/work` and `CLAUDE_SECURESTORAGE_CONFIG_DIR=""`, with a working default OAuth credential store. There are no per-thread auth overrides. With no credentials in `/profiles/work`, this patch changes working health/usage to unauthenticated. With a different valid custom token there, it queries usage using that token instead of the token Claude uses.

**Source evidence:** At the reviewed head, `provider-maintenance.ts:271–284` selects credentials and the Keychain suffix solely from `CLAUDE_CONFIG_DIR`. Both consumers use that selector (`:405–420`, `:552–568`). The Keychain failure path only tries the selected file (`:331–343`); no guard or fallback honors the storage override. The base instead uses the unsuffixed Keychain service (`base :270–281`) and `~/.claude/.credentials.json` (`base :309–324`), which are correct for this concrete empty-override trigger.

Published Claude 2.1.296 gives a **defined** `CLAUDE_SECURESTORAGE_CONFIG_DIR` precedence over `CLAUDE_CONFIG_DIR`. Its credential-directory selector uses the override when nonempty, or `join(homedir(), ".claude")` when explicitly empty, then applies NFC. Its Keychain selector independently checks whether the override is defined, suppresses the suffix for an empty override, and hashes the NFC override for a nonempty override. Thus an empty override does not mean “use the custom settings directory.” Directly inspected binary source:

- Linux `package/claude`, byte **209490609**, `Dw`; byte **209490744**, `Lue`; byte **209495815**, credential-file selection using `Dw()`.
- Darwin `darwin/package/claude`, byte **189113735**, `Lw`; byte **189113870**, `j$`; byte **189120346**, Keychain read using `j$(Lbe)` where `Lbe="-credentials"`; byte **189123581**, credential-file selection using `Lw()`.

For nonempty storage overrides, the suffix is the first eight lowercase SHA-256 hexadecimal characters of the NFC string. There is no trimming, tilde expansion, home resolution, or dot-segment canonicalization before hashing. The settings/legacy account paths still use `CLAUDE_CONFIG_DIR`; they do not switch to the separate secure-storage directory.

**Priority and scope:** Keep **P1 / One-off**. This breaks the explicitly required preservation of working default behavior and can select another account's token within the same OAuth file/Keychain mechanism being repaired. It is not an API-key, third-party OAuth, or per-thread routing expansion. Both affected readers already have one owner. The implementation handoff's exclusion at `handoff.md:34` is not approval to introduce this regression; the caller explicitly confirms no override-config break was approved.

**Existing fix/done-when retained:** Honor vendor storage-override precedence, including empty and NFC semantics, while keeping metadata on the settings profile. Both readers must choose the default store for an empty override even with conflicting custom credentials, choose only the specified store for a nonempty override, and preserve same-store fallback and existing default/hex behavior. Do not borrow default credentials when the effective credential store is genuinely custom and missing. This validation does not authorize or implement the fix.

### KEPT: [P2] Include an explicitly empty config directory in legacy account lookup

**Trigger:** Linux host `CLAUDE_CONFIG_DIR=""`, storage override unset, valid bridge-cwd `.credentials.json` for account A, bridge-cwd `.config.json` for A, stale `~/.claude.json` for B, and no default credential file. This newly supported credential path returns A's health/usage with B's email and account key.

**Source evidence:** `provider-maintenance.ts:273–277` preserves the empty config string through `??` and selects cwd-relative `.credentials.json`. Its truthiness guard at `:279–281` sets `legacyAccountPath` to null, while `:278` selects home `.claude.json`. `readAccount` then skips legacy lookup (`:346–358`), health includes B's email (`:413–420`), and successful usage includes B's email/UUID (`:557`, `:595–598`). There is no later identity reconciliation. At the base, this Linux fixture had no readable credentials and returned unauthenticated, so the newly successful A-credentials/B-metadata result is introduced by the patch; the old metadata path alone is not the finding.

The vendor raw config accessor returns `process.env.CLAUDE_CONFIG_DIR`; its directory selector uses nullish defaulting and NFC, preserving `""`. Legacy account selection checks the joined `.config.json` path without a truthiness guard before using the home fallback:

- Linux `package/claude`, byte **207256450** vicinity: raw `o` accessor and `ve` directory selector; byte **207518686** vicinity: `Tt` legacy lookup and `DRr` fallback.
- Darwin `darwin/package/claude`, byte **186879314** vicinity: raw `o` accessor and `be` directory selector; byte **187141398**: `Tt`; byte **187141498**: `txr` fallback.

**Priority and scope:** Keep **P2 / One-off**, **report-only**. The existing selector's truthiness condition causes this narrow newly supported-path attribution error. No expansion to all default-profile legacy metadata, other auth modes, or other surfaces is requested.

**Existing fix/done-when retained:** Permit legacy lookup for a defined config value, including `""`, while preserving the existing unset-profile metadata behavior. The fixture should associate A's credential result with A's email/UUID. No implementation is requested for this P2.

## Host environment reachability

This conclusion applies to variables present in the daemon's inherited process environment, not merely a different interactive shell or a per-thread setting. The host path does not discard either variable or its empty value:

1. `packages/agent-runtime/src/runtime-provider-process.ts:364–380` spreads sanitized `process.env` into the bridge spawn environment. `packages/process-utils/src/environment.ts:6–24` excludes undefined values, `NODE_ENV`, and `BB_*`; it retains empty values and both `CLAUDE_*` names.
2. `apps/host-daemon/src/runtime-manager.ts:245–256` adds PATH/recording overrides, and maintenance uses this runtime at `:1135–1151`; it does not replace the inherited Claude variables.
3. Maintenance dispatch directly invokes these readers in the bridge at `plugins/provider-claude-code/src/bridge/bridge.ts:2146–2150`, where they inspect `process.env`.
4. Session execution spreads the same bridge environment at `bridge.ts:1622–1631`; `withoutBridgeRuntimeEnv` removes only Electron/recording variables (`packages/provider-bridge-protocol/src/bridge-kit/bridge-runtime-env.ts:3–10`). With no per-thread override, `session-options.ts:273–276` preserves both values and changes only the context toggle. `sdk-session.ts:265` supplies that environment to the Claude SDK. Recording's direct child spawn also passes its environment unchanged at `sdk-session.ts:127–130`.

Therefore caller context does not make either trigger impossible. Missing empty-value cases in the complete credential tests (`provider-maintenance.credentials.test.ts:116–273`) do not negate the source paths.

## Identity, provenance, and limits

Validated only the two findings in [the supplied review](/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb/.health-review-0K0crC/review.md). Read that review in full, both affected source/test files in full, their exact diff, base credential readers, relevant host forwarding, and the captured provenance and vendor source. Used the [false-positive validator instructions](/root/.bb-machines/brsbl.getbb.app/runtime/global-skills/d1aa21792177cfdc2d4825c9b14de8f31a5d704080c47b638293c3fe11567a31/skills/review/agents/false-positive-validator.md). No additional findings.

- Exact comparison: `c6aef9658628fea3f3356517dc6710e20d0a13ab..d929d96c4de8a5de1d3f0c835e1c20af681ba91d`; read-only `git rev-parse HEAD` in the health worktree returned the latter SHA.
- All source line references above are within `/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb`, at that head unless explicitly marked base. `provider-maintenance.ts` and its credential tests are under `plugins/provider-claude-code/src/bridge/`.
- Vendor byte offsets refer to extracted binaries under that health worktree's `.credential-profile-rr4IbJ/`. [Provenance](/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb/.credential-profile-rr4IbJ/provenance.json) records immutable versioned npm archives for `@anthropic-ai/claude-code-linux-x64@2.1.296` and `@anthropic-ai/claude-code-darwin-arm64@2.1.296`, their SHA-512 integrity values, and binary SHA-256 values `24972e3bc859fab2b46ed4c1e51f7d6130f06d3bd550811a114640de3370d0de` and `c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`. Captured registry records agree on package/version/archive/integrity; the CLI package pins both platform packages to 2.1.296. There is no recorded `gitHead`.
- This pass read binary text directly; it did not execute vendor binaries or independently rerun archive hashing. The existing review records that hashing. Conclusions are source-control-flow validation, not fresh runtime reproduction or real-auth verification.
- No code edits to either branch, branch/environment changes, subagents, credentials/Keychain reads, app/browser, local checks, CI dispatches, PRs, or merges. Only this task-scoped validation artifact was written in the recovery worker's existing worktree. Parent owns any subsequent authorization.
