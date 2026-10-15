# Retention prototypes

Twelve clickable Ladle stories: six proposed experiences, each beside a control using the current message and composer components without the proposed prompt. These are isolated presentation fixtures, not screenshots of a connected account. Sidebar, task content, submission results, permission acceptance, and plugin installation are story state. Reload resets them. Nothing is assigned, scheduled, installed, paired, or sent to an agent.

## Preview ownership

- Branch: `bb/retention-prototypes`
- Base: `d722659a2c89fdf371fdb5d9f09fdd1ba3d0cba7` (origin/main at creation)
- Owner: `thr_e4bcx727qf`; manager: `thr_attkbfayhq`
- Host: `host_57pj4zhqxr`; environment: `env_nsmu7rmqvu`
- Persistent terminal: `term_9rxswckezn`
- Worktree: `/home/bersabel/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_e4bcx727qf-1/bb`
- Launch command from worktree: `cd apps/app && pnpm storybook --port 61001 --stories src/prototypes/retention/Retention.stories.tsx`
- Preview: <http://localhost:61001/?story=retention--h1a-automation&theme=light>
- Remote preview: <https://brsbl-bbox--61001.getbb.app/?story=retention--h1a-automation&theme=light>
- Port 61000 was already occupied. Leave this environment and terminal alive for review.

## Stories and interactions

Each story URL uses `http://localhost:61001/?story=retention--<id>&theme=light`. Set `theme=dark` for the other theme; add `mode=preview` to hide Ladle navigation.

| Moment | Treatment ID | Control ID | Click through |
| --- | --- | --- | --- |
| H1a · first thread finishes | h1a-automation | h1a-control | Schedule card → editable automation request → Send |
| H1b · first thread finishes | h1b-notifications | h1b-control | Notify me → local accepted state; Not now dismisses |
| H1c · first thread finishes | h1c-phone | h1c-control | Pair mobile app → existing QR/code UI; phone browser → example address and arrival preview |
| H2 · first reply | h2-first-reply | h2-first-reply-control | Child-thread tip → editable request; Hide tips → Undo |
| H2 · running turn | h2-running | h2-running-control | Follow-up tip → Queue follow-up → editable/removable queued item → Preview turn finishing |
| H2 · new thread | h2-new-thread | h2-new-thread-control | Plugin tip → catalog card → install/remove; card opens a short capability description |

The H1 variants are peers, not a sequence. H2 maps child threads to the first reply, queueing to a running turn, and plugin discovery to the new-thread page. The phone QR encodes `DEMO-ONLY` and a reserved `.invalid` address; it cannot pair a device. The web address is illustrative. No OS permission request is made. The phone preview demonstrates both paths; native pairing and notification delivery require a separately approved product experiment.

## Reuse and provenance

- **#5395:** copied the complete presentational `SidebarNudge` into `sidebar-nudge.tsx`, then supplied local callbacks and shorter notification copy. Sound starting point for the sidebar treatment; its eligibility, persistence, permission hook, and telemetry are deliberately not imported. Source: `d5aff24590f472f1da0ec1a4b5dfe80110dffa6c`.
- **#4991:** copied the Tips gallery/feed/hidden-notice presentation, SuggestionCard/Group/Section, and InlineConfirmation. Adapted imports, replaced animated artwork with bb icons, supplied three local tips, and reused the draft-insertion interaction. Sound starting point for contextual suggestions; no catalog engine, setup gate, settings, or assignment behavior is imported. Source: `08e780c8165cdae3d6231227a0a90caae899547f`.
- **#4986:** copied the shared plugin catalog presentation module; used its browse card, icon chip, and install control. Sound second step after a plugin tip because the user can inspect a named capability and its install state. The full catalog card would add unnecessary weight to the initial one-line suggestion. Source: `4349b9d2b29d4c3c2732f857c9d7bf96fc267273`.
- **Current main:** directly imports production `ConversationMessageContent`, `PromptBoxInternal`, `NewThreadPromptBoxUI`, `ExecutionControls`, shared buttons/icons, and `plugins/automations/composer.ts`. Copies Connect's `MobilePairingCard`, QR image, copy button, and countdown helpers into `plugins/connect/retention-pairing.prototype.tsx` to avoid registering the live Connect plugin.

The only Ladle infrastructure changes expose the already-implemented thread status glyph from its SDK adapter and scan the copied pairing prototype for Tailwind classes. No theme tokens change.

## Experiment boundary

After brsbl signs off, H1 can randomize eligible new installations into control or one of the three peer prompts immediately after their first completed thread. H2 can randomize installations into control or the three contextual suggestions. Keep assignment stable across sessions, analyze intention-to-treat, and predeclare a day-2 return measure plus later-day work in week one and W4 retention. The supplied retention figures motivate these hypotheses; they do not establish a causal effect. Assignment, eligibility, metrics, and holdout behavior are outside this prototype branch.

## Verification and captures

Chrome for Testing 155.0.8059.39 on Linux. Exercised prompt insertion, notification accept/dismiss, tip hide/undo, queued follow-up submission and completion, plugin install/remove, mobile pairing QR, and phone-web arrival. Checked all twelve stories at 1440×900 in light and dark, plus compact 390×844 coarse-pointer treatment layouts and H1c control. No horizontal overflow or page JavaScript exceptions in the completed capture passes. Navigation and reload render the fresh fixture; spinner and card transitions were observed. This is prototype UI verification, not end-to-end product verification.

Full-resolution PNGs live under the gitignored `.tmp/retention/screenshots/`, never in the code diff. Desktop files are 2880×1800; mobile files are 780×1688. `.tmp/retention/screenshots/manifest.json` records every saved image with dimensions and paths. Files ending `-v2` supersede earlier new-thread light captures and the running-tip icon capture; earlier captures remain available. No tests, typecheck, or lint ran locally. The QA browser is closed after capture; the story terminal remains running.
