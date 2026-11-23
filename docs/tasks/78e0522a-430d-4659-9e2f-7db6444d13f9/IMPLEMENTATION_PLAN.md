# Implementation plan — Restart and Update as separate runner options + per-runner version pinning

## Goal

Replace the ambiguous "reload" affordance on the System Settings › Runners screen with two
separate actions — **Restart** (destructive, confirmed) and **Update** (reinstall to a
different/newer version) — and add per-runner version control: each runner is pinned either
to `Latest` (default) or to one fixed release, with a version-mismatch warning and an
Update button, red when a newer version exists.

Source request: task title + screenshot (`assets/image.png` shows one runner row,
`local-alpha`, with PAUSE / REVOKE / RELOAD buttons, a build line, and a yellow
version-mismatch banner). Binding survey answers: `SURVEY.md` (round 1, all six questions
answered; see §1).

## 1. Binding survey decisions (do not re-litigate)

| # | Decision |
|---|---|
| q1 | Restart = reboot the runner on its current version (debug use when a runner looks stuck). Update = reinstall it onto a different/newer version. Two separate buttons; RELOAD goes away as a runner action. |
| q2 | Restart confirmation warns that any work currently running on that runner will be stopped. |
| q3 | Per-runner dropdown: `Latest` plus every released version to pick from. |
| q4 | Mismatch warning appears whenever the runner's version differs from its own setting, whether fixed or `Latest`. |
| q5 | Automatic update happens only for `Latest` runners, and only when the runner next restarts or is idle with no work running (no mid-work interruption). |
| q6 | Red warning when a newer version exists than the one the runner is on; softer colour for other mismatches. |

Notes captured: restart is a debug tool for stuck runners (q1); Latest default per the
original request.

## 2. Current-state map (verified in repo)

- UI: [RunnerConfigurationSection.jsx](/frontend/src/components/settings/RunnerConfigurationSection.jsx) — detail panel with lifecycle controls, `reloadSelected` (re-reads config from backend, §335–358 — this is the "RELOAD" the screenshot shows; it does **not** touch the runner process), `handleUpdateNow` → `api.requestRunnerUpdate` (queues idle-only `requestUpdate`, §654–676).
- Helpers: [runnerConfigHelpers.js](/frontend/src/components/settings/runnerConfigHelpers.js) — `runRunnerAction` (approve/deny/pause/resume/revoke only, §143–150), `canRequestUpdate`/`canRequestRediscovery` (§421–437), `describeRunnerVersion` (§162–168), `describeRunnerBuild` + `runnerBuildWarning` (§735–810, stale-code banner that already says "restart or update it").
- API surface: [frontend/src/services/runners/index.js](/frontend/src/services/runners/index.js) — `requestRunnerUpdate` posts `{ command: 'requestUpdate' }` to `/runners/:id/commands`; no restart endpoint exists.
- Backend: [api/flow/runnerRegistry.js](/api/flow/runnerRegistry.js) — `RUNNER_COMMANDS = ["requestModelRediscovery", "requestUpdate"]` (§179); heartbeat auto-nudge queues `requestUpdate` for runners trailing recommended version, max one pending and daily per runner (Amendment 1 of [ADR 0012](/docs/adr/0012-runner-artifact-update-channel.md)).
- Runner: [runner/daemon.js](/runner/daemon.js) consumes backend-to-runner commands, advertises `SUPPORTED_RUNNER_COMMANDS` in facts; updates apply idle-only via [runner/updates/](/runner/updates/index.js) (download → verify against pinned key → atomic symlink flip, never downgrade). No restart command exists anywhere.
- Update policy source of truth: `KAINBAIN_RUNNER_RECOMMENDED_VERSION` / `KAINBAIN_RUNNER_MIN_VERSION` env knobs; procedures in [docs/runner-update-runbook.md](/docs/runner-update-runbook.md). ADR 0012 explicitly deferred per-runner pinning ("no per-runner pinning" in survey refinements) — this task reverses that for the *desired-version* directive only (backend still never serves bytes; R05 stands).
- Tests: `frontend/src/components/settings/runnerConfigHelpers.test.js`, `RunnerConfigurationSection.test.jsx`, `api/flow/runnerVersionCompat.test.js`, `runner/updates-*.test.js`, `api/flow/runnerRoutes.test.js`.

## 3. Approach — make the change easy, then make the change

Do the work in this order so each step is independently shippable and the hard
research lands first:

1. **Research spikes first** (Steps 0a–0c): restart mechanism, version-list source, desired-version storage. These answer the only unknowns; everything after is mechanical.
2. **Make the change easy**: extract the runner-action button + status-line block in `RunnerConfigurationSection.jsx` into small components/helpers with unit tests, so adding Restart/Update/version-selector is adding props, not rewriting the panel.
3. **Make the change**: backend `requestRestart` command + desired-version field, runner daemon support, then UI (separate buttons, confirm modal, version dropdown, warning tiers).
4. **Assure it**: unit/integration/e2e per step + docs updates; keep the old behaviour green until the new one lands.

Non-goals: backend serving runner bytes (R05 stands); Windows support; pre-release opt-in; changing 409/minimum-floor semantics; touching pause/resume/revoke.

## 4. Step-by-step plan

### Step 0a — Spike: restart mechanism (do first; biggest unknown)

- Question: what does "reboot the runner on its current version" mean mechanically? Candidates: (a) new `requestRestart` backend-to-runner command consumed by the daemon (graceful: finish-or-kill work, re-exec wrapper `current` without version change); (b) backend kills the runner process remotely (no — backend has no shell on runner hosts); (c) restart = re-register/reboot host service (out of scope).
- Investigate: how the daemon loop in [runner/daemon.js](/runner/daemon.js) consumes `requestUpdate` end-to-end (heartbeat → ack → idle-apply), where a restart hook fits, what "stop running work" means for claimed tasks (requeue vs kill), and how the wrapper (`bin/kainbain-runner`) re-execs `current`.
- Decide: recommended (a) — symmetric with `requestUpdate`, honours the q2 destructive semantics (work is stopped, not drained), keeps backend coordination-only.
- Evidence: spike note (≤1 page) in the task docs folder naming the chosen hook point and the work-stop semantics.

### Step 0b — Spike: version-list + desired-version source of truth

- Questions: where does the per-runner dropdown's release list come from? Where is `desiredVersion` (`latest` | semver) stored?
- Investigate: backend registry record shape + persistence (disk vs memory — note `pendingCommands` are memory-only per `runnerRegistry.js` §160); whether the backend can list GitHub releases server-side or should expose `recommendedVersion` + a cached release index; how `operatorConfig` (already PATCH-able per runner) could carry `desiredVersion` with `latest` default and backfill for old records.
- Recommended direction (to confirm in spike): `desiredVersion` lives in `operatorConfig` (`null`/`"latest"` = Latest, default); dropdown options = cached release list endpoint (newest-first, same 30-entry bound as the runner client) falling back to `{ current, recommended }` when offline; fixed pin = exact semver; runners resolve `latest` → newest compatible release via the existing compat filter.
- Evidence: spike note + decision on storage/endpoint shape before any schema change.

### Step 0c — Spike: idle-only auto-update vs restart-triggered update

- Reconcile q5 ("only when the runner next restarts or is sitting idle") with current behaviour (hourly idle check + 409-triggered + daily auto-nudge for trailers). Decide the exact matrix: Latest+idle → auto; Latest+busy → wait; fixed-pin → never auto (manual Update only); restart of a Latest runner → check-and-update on boot before claiming work.
- Evidence: one truth-table in the spike note; it becomes the acceptance table in §6.

### Step 1 — Test-seam refactor (make the change easy)

- Extract from `RunnerConfigurationSection.jsx`: action-button row (with disabled-reason tooltips), command status-line builder, version/warning banner block into testable units beside `runnerConfigHelpers.js`.
- Add missing unit coverage for current behaviour first (`runRunnerAction` unknown-action null, `canRequestUpdate` gating, `runnerBuildWarning` branches) so refactors are provably safe.
- Gate: `npm run test:unit` + existing `RunnerConfigurationSection.test.jsx` green, no visual change.

### Step 2 — Backend: `requestRestart` command (mirror `requestUpdate`)

- Add `requestRestart` to `RUNNER_COMMANDS` in `api/flow/runnerRegistry.js`, queue/dedupe/cooldown semantics (mirror `requestUpdate`; decide cooldown in Step 0a), `POST /runners/:id/commands { command: 'requestRestart' }` path, `runnerApi.requestRunnerRestart` in `frontend/src/services/runners/index.js`, `runRunnerAction`-adjacent dispatcher entry.
- Gate: `api/flow/runnerRoutes.test.js` + registry unit tests for queue/dedupe.

### Step 3 — Runner daemon: consume `requestRestart`

- Advertise support in `SUPPORTED_RUNNER_COMMANDS`; implement restart: stop in-flight work per Step 0a semantics (heartbeat ack carries what was stopped), re-exec wrapper on the **same** version (no update check interleaved — Restart ≠ Update per q1), re-register.
- Safety: restart never triggers an update on a fixed-pin runner; on a Latest runner it may check-and-update on boot per Step 0c matrix (document which).
- Gate: `runner/daemon.test.js` + idle/busy restart cases; chaos coverage per `docs/manual-testing/09-runner-chaos.md`.

### Step 4 — Backend + registry: `desiredVersion` per runner

- Schema per Step 0b (`operatorConfig.desiredVersion`, default Latest, backfill old/empty → Latest); PATCH validation (exact semver from release list or `latest`); include resolved `desired` + `latest` + release list in `GET /runners` records (or a lightweight releases endpoint); keep env knobs as fleet defaults.
- Decide conflict rule: fixed pin above recommended is allowed (asymmetric updates already accepted per ADR Amendment 1); fixed pin below minimum still 409s (floor unchanged).
- Gate: registry + compat tests (`runnerVersionCompat.test.js`).

### Step 5 — UI: separate Restart / Update, confirm modal, version selector, warning tiers

- Replace RELOAD-as-action with: **Restart** (destructive styling, opens confirm modal with q2 copy: names the runner, warns running work will be stopped, requires explicit confirm; disabled with reason when runner not active/old) and **Update** (queues reinstall to resolved target: fixed pin → that version; Latest → newest compatible; shows target version in tooltip as today).
- Keep config re-read available but demote it (e.g. small refresh icon, not a primary button) so no capability is lost.
- Per-runner version dropdown (`Latest` + releases, default Latest) bound to `desiredVersion` PATCH.
- Warning logic per q4/q6: mismatch(runnerVersion vs resolved desired) → banner + Update button; tier = red when a newer version exists than running (scare), softer otherwise (e.g. pinned older-behind, dev checkout, unknown). Preserve `runnerBuildWarning` sha-mismatch branch or merge it into the same banner (decide in implementation; no double banners).
- Distinguish three states explicitly: update queued/pending, last-update failed (with reason), update available — reusing the existing `commands.pending`/`results` + `updateStatus` plumbing.
- Gate: helper unit tests (warning-tier matrix) + `RunnerConfigurationSection.test.jsx` additions + headless screenshot (`npm run capture:screenshot`) of row states.

### Step 6 — Auto-update behaviour for Latest (q5)

- Implement the Step 0c matrix; default Latest for new runners; no auto-update for fixed pins (manual Update only).
- Gate: daemon update-client tests + heartbeat-nudge tests proving busy runners are never interrupted.

### Step 7 — Docs + runbook

- Update [docs/runner-update-runbook.md](/docs/runner-update-runbook.md) (Restart vs Update, pin procedure, Latest auto behaviour, triage for the new banners), the Runners settings UI copy, and ADR 0012 Amendment 2 (per-runner desired-version reverses the "no per-runner pinning" deferral for selection only).
- Backwards-compat note: old runners (no `requestRestart`, no `desiredVersion`) show disabled buttons + "update the runner to enable this" guidance, mirroring the existing R1 pattern.

## 5. Ordering / dependencies

`0a, 0b, 0c` (any order, all before schema) → `1` → `2 → 3` (backend then daemon; UI Restart in 5 may mock until 3 lands) → `4` → `5` → `6` → `7`. Steps 2–3 and 4 are parallelisable once spikes conclude.

## 6. Acceptance table (from survey; verify every row)

| Runner setting | Runner state | Expected |
|---|---|---|
| any | press Restart | confirm modal (q2 copy) → reboot same version, running work stopped |
| fixed pin = running | — | no warning |
| fixed pin ≠ running | — | softer warning + Update → reinstalls pinned version |
| Latest, running = newest | — | no warning |
| Latest, trailing | idle/restart | auto-updates (q5); banner red until converged (q6) |
| Latest, trailing | busy | red banner + Update button; no interruption |
| any old runner | — | disabled controls + "too old" guidance, never a dead button |

## 7. Assurance plan (how we prove it)

- Unit: `npm run test:unit` — new helper tests (restart dispatcher, desired-version normalisation, warning-tier matrix incl. red-vs-soft), registry queue/dedupe/cooldown tests, daemon command tests.
- Integration: runner update-client + heartbeat suites (`runner/updates-*.test.js`, daemon tests) for idle-only apply, never-downgrade, opt-out ack, fixed-pin-no-auto.
- UI: extend `RunnerConfigurationSection.test.jsx` (two buttons, modal copy, dropdown default Latest, banner tiers); headless capture (`npm run capture:screenshot`) of: clean row, soft mismatch, red newer-available, pending-update, failed-update, confirm modal.
- Manual: runbook triage walkthrough (stale runner, failed update, old runner) + chaos checklist (`docs/manual-testing/09-runner-chaos.md`).
- Docs: runbook + ADR amendment + settings copy reviewed in the same PR; no code lands without its docs row in §6 re-verified.
- Regression: full suite for touched packages; `api/flow/runnerRoutes.test.js` and existing update-channel tests must stay green (old behaviour preserved until new lands).

## 8. Risks

- Restart-during-work data loss → mitigated by q2 confirm copy + ack reporting what was stopped; never auto-restart busy runners.
- Fixed pin below minimum → 409 loop; UI must surface "pin is below fleet minimum" distinctly from "update available".
- Release-list availability offline → dropdown degrades to current+recommended (R03 offline updates keep working).
- Scope creep into serving bytes or changing floors → explicitly out; R05 stands.
