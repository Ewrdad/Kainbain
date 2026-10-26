---
title: Push Notifications
section: working-with
order: 75
slug: push-notifications
---

# Push Notifications

KainBain can notify you through the browser's Web Push system even after you
close every KainBain tab or navigate away. Delivery runs through a Service
Worker (`/sw.js`), so the notification appears as a system-level alert and
clicking it reopens or focuses the app.

## Permission is not subscription

The two most commonly confused states, and the source of most "notifications
aren't working" reports:

| State | What it means | Set where |
| --- | --- | --- |
| **Permission: Allowed** | The browser lets KainBain show notifications at all | Browser site settings (the permission prompt) |
| **Subscribed & registered** | This browser has a push subscription the server knows about, so the server can actually deliver | Notifications tab → **Enable push notifications** |

Allowing permission alone never delivers anything — you must also subscribe
the browser. The Notifications tab shows both separately: a permission badge
("Allowed"/"Blocked") and a subscription status that is verified against the
server, not just read from the browser. If the server loses a registration
(for example after a failed save), the tab reports **Not registered on
server** and repairs it automatically on the next read; the
**Re-register** button forces that repair immediately.

The old in-page "Desktop / Browser Notifications" toggle (Sound & Alerts tab)
is gone: it used the `new Notification()` browser API, which Android and iOS
browsers do not support, so it consumed the permission without ever being
able to show anything on mobile. Web Push is the one notification path, and
it is the only one that works on phones and backgrounded tabs.

## Triggers

Two events can send a push today (both configurable, both on by default):

- **Queue empty** — fires exactly once when the engine transitions from
  running work to having no runnable tasks left. It never repeats on
  consecutive idle scheduler ticks.
- **Stage error needing you** — fires when a stage hits an error the app
  cannot auto-recover from (for example invalid credentials, quota
  exhaustion, lost connectivity, or an exhausted retry budget) and the task
  is parked for human intervention. Routine CI test failures and
  agent-chosen fail verdicts, which the normal workflow already iterates on,
  never send a push.

## Setup

1. Open System Settings (`#/system-settings`; System menu → **System
   Settings**, or shortcut `S` — both open it in a new window) and switch to
   the **Notifications** tab.
2. Click **Enable push notifications**. This asks for the browser permission
   and subscribes this browser in one step. If permission shows as blocked,
   allow notifications for this site in the browser's site settings first.
3. Confirm the status row reads **Subscribed & registered**.
4. Toggle each trigger independently, then use **Send Test Notification** to
   verify delivery end to end.

On iPhone/iPad, Safari delivers web push only to apps added to the Home
Screen: use the share menu, choose "Add to Home Screen", reopen KainBain
from the new icon, then subscribe from there.

Push requires a secure context: `https://` in production or `http://`
`localhost` during development. Unsupported browsers show a hint in the
settings tab instead of the subscribe button.

## "The test says sent but nothing appeared"

When the server reports the test as delivered, the notification is out of
KainBain's hands — the remaining failure mode is the operating system hiding
it. Work through the in-app checklist:

- **Android**: system Settings → Apps → (Chrome, or the installed KainBain
  app) → Notifications — make sure notifications (and the KainBain channel)
  are on and not silenced by Do Not Disturb or battery optimisation.
- **iPhone/iPad**: the app must be added to the Home Screen (see above);
  check Settings → Notifications for the installed app.
- Re-run **Send Test Notification** with the app in the background to prove
  Service Worker delivery, not just the foreground case.

Every send's outcome (delivered / pruned / failed, per endpoint host) is
written to the server journal with one structured log line, so
`journalctl --user -u kainbain` answers "did the server deliver to this
browser?" after the fact.

## Server configuration

- VAPID keys are generated lazily on first use and stored with mode
  `0600` at `~/.kainbain/push/push-vapid.json`. Override with `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` environment variables.
- Subscriptions live at `~/.kainbain/push/push-subscriptions.json`; endpoints
  the browser push service reports as gone (HTTP 404/410) are pruned
  automatically on the next send.
- General preferences live at `~/.kainbain/push/push-settings.json` and are
  editable via `GET`/`PUT /push/settings`:
  `{ "enabled": true, "triggers": { "queueEmpty": true,
  "unrecoverableStageError": true }, "stages": {} }`.
- Master kill switch: set `pushNotificationsEnabled` to `false` in server
  config (or `KAINBAIN_PUSH_NOTIFICATIONS_ENABLED=false`) to silence all
  push delivery without touching subscriptions.

## Extending to stage-specific rules

The `stages` object in the settings schema is reserved for per-stage
overrides (for example
`"<stageId>": { "notifyOnSuccess": false, "notifyOnFailure": true }`) and
the Notifications tab notes this upcoming capability. Future work can read
those overrides in the stage-error trigger and add controls to the stage
settings drawer without changing the general settings contract.
