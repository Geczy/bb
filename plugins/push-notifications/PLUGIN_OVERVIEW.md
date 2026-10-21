Get a notification when an agent asks a question, finishes a turn, or stops on an error. Choose mobile, web, and desktop delivery independently in Settings → Push notifications.

## Delivery

Mobile devices receive push messages through Expo, including when the app is closed. Web browsers and the desktop app receive system notifications over bb's live connection while a tab or window stays open; web delivery needs HTTPS (or localhost) and notification permission. Mobile WebViews use mobile push only.

Each thread has a level: `all` (questions, approvals, errors, finished turns), `input-only` (no finished turns), or `muted`. A thread uses its own level, else `childLevel` if it has a parent, else `defaultLevel`; every ancestor's own level caps it. Muting a parent mutes its whole subtree, but a parent never makes workers louder. The level applies on top of the suppressions below.

Click a notification to open its thread; on Linux desktop the click also restores and focuses the window. Events arriving together are combined, with pending questions taking priority. Read, archived, deleted, and hidden threads are suppressed. Tabs of the same origin deduplicate delivery.

## Notification Hint

Once a thread has been sent, an undecided browser or desktop notification
permission can show a Hint above the composer when a turn runs longer than
60 seconds or a thread waits for input. Status banners take precedence.
**Turn on** requests permission with the same client flow as Settings and
shows **Notifications on** for three seconds after permission is granted.
Denied permission hides the Hint. **Not now** snoozes the Hint for 14 days;
a second **Not now** hides it permanently. This state belongs to the server
install and is shared across its clients; permission itself remains local.

## Thread menu

Every thread menu (header, sidebar row, right-click, compact drawer, optional row quick action) has a **Notifications** entry for unarchived threads: Default, All activity, Needs input only, Muted. The entry shows the current level; Default names its fallback; a footnote says when a parent limits it. Thread plugin metadata stores only a thread's own level, `{ "notifications": { "own" } }`; limits are read from the current parent chain. Menus fetch levels for threads on screen in batches.

## Settings

- `mobileEnabled` / **Mobile notifications**: send to registered phones and tablets. Default: true.
- `webEnabled` / **Web notifications**: notify connected browsers with permission. Default: true.
- `desktopEnabled` / **Desktop notifications**: notify running desktop clients. Default: true.
- `defaultLevel` / **Default notifications**: `all`, `input-only`, or `muted`, for threads you haven't set. Default: `all`.
- `childLevel` / **Child thread notifications**: `inherit` (same as `defaultLevel`), `all`, `input-only`, or `muted`. Default: `input-only`.
- `expoPushUrl` / **Expo push relay URL**: mobile relay endpoint. Defaults to `https://exp.host/--/api/v2/push/send`.

Channel switches apply to this server and save immediately. Browser permission is granted per device with **Allow notifications**. **Send test notification** confirms broadcast, not OS display.

## CLI and SDK

- `bb push-notifications list [--json]`: registered mobile devices, with redacted tokens.
- `bb push-notifications add --token <expo-push-token> --platform <ios|android> --label <device-label> [--json]`: register or refresh a mobile device.
- `bb push-notifications remove <id> [--json]`: remove a mobile device.
- `bb push-notifications hint [--reset] [--json]`: read or reset install-wide Hint acceptance, dismissals, snooze deadline, and random suggestion identity. Reset does not change notification permission.
- `bb push-notifications status [--json]`: switches, defaults, relay, device count, and last mobile send.
- `bb push-notifications test <web|desktop> [--json]`: broadcast a test to connected clients of that type. Fails if the channel is disabled.
- `bb push-notifications thread <thread> [--level inherit|all|input-only|muted] [--json]`: print the resolved level and source; `--level` sets it.
- `bb plugin config push-notifications set <mobileEnabled|webEnabled|desktopEnabled> <true|false>`: change a channel.
- `bb plugin config push-notifications set <defaultLevel|childLevel> <level>`: change a default.

Every command takes `--help`. A failure with `--json` prints `{ "ok": false, "error": { "code", "message" } }` on stdout and the readable text on stderr.

Agents can use the SDK's plugin settings API for the same switches and `sdk.plugins.callRpc` with method `notifications.test` (`{ channel }`), `threadNotifications.list` (`{ threadIds }`, up to 200), or `threadNotifications.set` (`{ threadId, level }`). Permission requests still require a click in the target client.

The Hint's typed plugin contract exposes `notificationsHint.state` and
`notificationsHint.reset` with `{}` for the same read/reset operations.
`notificationsHint.eligibility` takes `{ threadId, channel: "web" | "desktop" }`
and returns `{ suggestion: { id } | null, nextCheckAt: number | null }`.
The server checks sent-turn history and pending interactions; `nextCheckAt`
is a server timestamp for another eligibility check, never proof of eligibility.
Call `notificationsHint.shown`, `notificationsHint.accept`, or
`notificationsHint.dismiss` with `{ id }` for the active suggestion. Repeated
or stale actions are harmless; mutations return the resulting state. Shown
records actual desktop/web display only, not eligibility checks. Accept and
dismiss record the shared server action. All three events use fixed Hint
properties and a random suggestion analytics ID and respect telemetry opt-out.
