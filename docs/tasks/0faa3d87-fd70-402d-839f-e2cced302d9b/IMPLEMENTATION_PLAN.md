# Implementation Plan — One task per Runner at a time (+ unambiguous UI)

Task: `0faa3d87-fd70-402d-839f-e2cced302d9b`
("UI seems to imply a runner is running multiple tasks at once")
Author: planning stage, 2026-11-02. Status: plan only — no code changed.

## Goal

Guarantee that one Runner executes at most one task at a time (protecting a
memory-limited dev box from concurrent-work crashes), prove the guarantee with
tests, and make the single-active-task state unmistakable in the UI.

## Success Criteria

1. A single `runnerId` can hold at most one live backend claim at any moment;
   a second claim/dispatch attempt while one is live is refused loudly
   (named error code, no silent queueing inside the Runner).
2. The Runner daemon cannot start a second assignment while one is in flight,
   even with a stale/retried dispatch answer.
3. Every UI surface derives "running" from one source of truth, so two tasks
   can never both render as running; stale `running_*` labels render as
   stale/interrupted, never as live.
4. Each Runner view shows exactly one "current task" slot plus an explicit
   Busy/Free state (and, where cheap, queued-next and memory pressure).
5. `npm run test:unit` passes; new regression tests cover the per-runner fence
   and the UI single-active rendering.

## Context and evidence (what research found)

- Embedded engine already claims single-active execution: `ExecutionQueue`
  serializes jobs (`api/flow/executionQueue.js`), and
  `api/flow/singleActiveInvariant.test.js` characterizes "at most one live
  running_* status".
- Frontend already has the right seam: `frontend/src/components/tasks/runningTask.js`
  (`resolveRunningTask`, `isTaskRunning`, `isStaleRunner`) documents the
  engine-owner lock and the "phantom-second-runner" bug class. Open question
  is whether *all* surfaces use it (audit needed).
- Fleet path has the gap: `ClaimStore.claim(taskId, runnerId, …)`
  (`api/flow/claimStore.js`) enforces one holder per *task*, and dispatch
  (`api/flow/runnerRoutes.js`, ~L993-1060) enforces a *fleet* cap and a
  *per-project* cap — but nothing enforces one live hold per *runner*.
  `countLiveHolds()` supports only a `projectId` filter; there is no
  by-runner lookup. Two daemon processes sharing one `runnerId`/credential
  (or a claim-route call racing a dispatch lease) can therefore hand one
  Runner two live assignments on a small box.
- Runner daemon loop (`runner/daemon.js`, `runDispatchLoop`) is sequentially
  structured (poll → execute → poll), but there is no in-process
  "assignment in flight" guard asserted around `executeAssignment`, and no
  defense against a second process with the same identity.
- Per-task live-claim UI exists: `RunnerBanner.jsx` renders from `task.claim`.
  If two tasks ever carry claims for the same `runnerId` (see gap above), the
  UI truthfully shows the forbidden state — the screenshot's "one Runner, many
  tasks" look. Stale `running_*` labels are the second suspect (display-only).
- Evidence gaps: the screenshot (`assets/18846.png`) is NOT present in this
  task's docs folder (only `SURVEY.md` exists), and `SURVEY.md` has
  `"answers": {}` (all questions unanswered). The plan below treats the survey
  as open decisions with recommended defaults (§1), and Step 0 re-captures the
  screenshot evidence.

## How the survey shapes this plan (SURVEY.md, unanswered → advised defaults)

| Survey Q | Options | Advised default used by this plan |
|---|---|---|
| q1 — what to fix | real behavior / display / both / advise | **Both**: verify + fence real behavior first, then fix display (§5: backend fence precedes UI work) |
| q2 — new tasks while busy | queue / reroute / manual move / advise | **Queue + reroute**: Runner refuses second assignment (`RUNNER_BUSY`); backend keeps the task claimable so another free Runner (or the same Runner when free) picks it up; no manual move needed for the common case |
| q3 — what the screen shows (multi) | current task / Busy-Free / queue / memory warning | **All four**, in that priority order; memory warning is best-effort from heartbeat facts (`diskHeadroomMb`-style posture) and explicitly non-blocking |
| q4 — ever allow >1 concurrent? | never / tiny background ok / if memory ok / advise | **Never** for task assignments; heartbeats/polling are the only concurrency (they are not tasks and must never render as tasks) |
| q5 — what worried you in the screenshot | looked concurrent / stuck-doubled / other | Unanswered + screenshot missing → Step 0 reproduces both hypotheses (real double-hold vs stale-label display) before choosing which fix leads |

If the human later answers the survey differently, only §5 Step 6 (queue /
reroute policy text) and Step 7 (UI slots) need re-scoping; the per-runner
fence (§5 Step 5) stands regardless.

## Approach (make change easy, then make the change)

Big research and structural work comes first; behavior changes land only after
their seams and characterization tests exist:

1. **Research first** (Steps 0–1): reproduce the two hypotheses with the
   smallest possible probes; inventory every UI "running" signal.
2. **Make change easy** (Steps 2–4): add the missing query seam
   (holds-by-runner), characterization tests that pin current behavior, and a
   UI audit routing every badge through `runningTask.js` — no behavior change.
3. **Make the change** (Steps 5–7): backend per-runner fence, Runner-side
   in-flight guard, UI single-slot clarity.
4. **Assure it** (Steps 8–10): regression tests, docs, rollout/rollback.

## Steps

### Step 0 — Re-capture the evidence (research, first)

- Re-obtain or re-create the `assets/18846.png` view: which page/widget showed
  one Runner against several tasks? If the reporter can re-attach it, file it
  under this task's `assets/`; otherwise reproduce via
  `npm run capture:screenshot` against a fixture with two claim-carrying tasks
  for the same `runnerId` (see Step 1 probe).
- Decide which hypothesis the screenshot shows: (a) two live claims, one
  `runnerId` (backend gap), or (b) one live claim + stale `running_*` labels
  (display gap). Record the verdict at the top of this file before Step 5.
- Validation: the recorded verdict names the page, the tasks, and which
  hypothesis; a reviewer can re-open the same view.

### Step 1 — Minimal reproduction probes (research, first)

- Backend probe (throwaway, `/tmp`, not committed): drive `ClaimStore`
  directly — claim task A as `runner-1`, then claim task B as `runner-1` —
  and show both holds are live today. Then drive `POST /runners/dispatch`
  twice for one `runnerId` with two claimable tasks and show whether two
  leases are issued (mirror the style of
  `api/flow/runnerDispatchCaps.test.js`).
- Frontend probe: render the suspect view with one engine-owner task plus a
  second task carrying a stale `running_agent` label; note every element that
  renders a live-looking RUNNING/claimed signal.
- Validation: probes are independent of the later fix (they use public
  routes/helpers); keep the backend probe's assertions to convert into the
  Step 8 regression test.

### Step 2 — Add the by-runner query seam (make change easy, no behavior change)

- `api/flow/claimStore.js`: add `liveHoldsByRunner(runnerId)` (and optionally
  extend `countLiveHolds({ runnerId })`), reusing the existing lazy-expiry
  sweep in `_holding()`. Pure query — no call-site behavior changes.
- `api/flow/runnerRoutes.js`: expose the data the UI needs — extend the
  existing `liveAssignments` projection (~L468) or the runner-status payload
  with `currentTaskId` / `liveHoldCount` per runner so the UI never joins
  claims client-side.
- Validation: `npm run test:api -- claimStore` passes; new unit tests assert
  expiry-aware by-runner counts.

### Step 3 — Characterization tests pinning current behavior (make change easy)

- Add failing-or-pinning tests *before* the fence: "second dispatch for a
  busy runnerId is refused" (expectation set to the DESIRED code, allowed to
  fail until Step 5 — mark clearly as fence-pending), plus passing
  characterization of today's fleet/project caps to prevent regressions.
- Frontend: add a test rendering two claim/stale-running tasks for one runner
  through the real view (not the helper in isolation) pinning today's
  (wrong-looking) output, to flip in Step 7.
- Validation: full `npm run test:unit` green except the explicitly-marked
  fence-pending assertions.

### Step 4 — UI signal audit + route every badge through the one helper (make change easy)

- Inventory every "running/live/claimed" signal: `TaskCard`, `RunnerBanner`,
  `ObservabilityDashboard`, `EngineStatePill`, `MobileMonitorView`,
  `TaskDetailOverlay`, activity console — record which use
  `resolveRunningTask`/`isTaskRunning`/`isStaleRunner` and which read raw
  `task.status`/`task.claim`.
- Convert stragglers to the helpers with NO visual redesign yet: stale labels
  must already render as stale/interrupted after this step.
- Validation: `npm run test:frontend` passes; the Step 1 frontend probe now
  shows at most one live RUNNING badge.

### Step 5 — Backend: one live hold per runner (make the change)

- In `claim()`-issuing paths (`POST /runners/dispatch` candidate loop AND the
  direct single-assignment claim route ~L846, AND the merge-lease path
  ~L1067): refuse when the requesting `runnerId` already holds a live,
  unexpired hold. Suggested contract: HTTP 409 + code `RUNNER_BUSY` with the
  current `taskId`/`executionId` in the body (mirrors existing `CLAIM_CONFLICT`
  / `FLEET_CONCURRENCY_EXHAUSTED` shapes).
- Keep the refused task claimable (do NOT park it on the busy runner) so q2's
  queue+reroute default holds: another free Runner can claim it; the busy
  Runner's next poll after completing gets fresh work.
- Decide + document TTL interplay: an expired hold must not block (lazy sweep
  already handles this); a crashed Runner's hold blocks re-dispatch only until
  TTL, same as today — no new resurrection logic.
- Validation: fence-pending tests from Step 3 now pass; caps tests
  (`runnerDispatchCaps.test.js`) and `singleActiveInvariant.test.js` still pass.

### Step 6 — Runner daemon: in-flight guard + busy handling (make the change)

- `runner/daemon.js`: assert a single-flight guard around `executeAssignment`
  in `runDispatchLoop` (and the single-assignment path): never start a second
  assignment while `state.executionId` is set; treat a second dispatch answer
  arriving mid-run as a bug and back off rather than executing.
- Handle `RUNNER_BUSY` like `FLEET_CONCURRENCY_EXHAUSTED`: log, back off
  without consuming idle budget, re-poll (covers the two-processes-one-identity
  case: the loser backs off instead of double-executing).
- Optional hardening (only if Step 1 shows it is reachable): local pid/lockfile
  so two daemons with the same `runnerId` on one box cannot both run; document
  as defense-in-depth, not the primary fence (the backend fence is primary).
- Validation: `runner/daemon.test.js` additions — busy answer backs off;
  in-flight guard never double-executes (mirror the existing 429 test ~L1024).

### Step 7 — UI: one unmistakable current-task slot per Runner (make the change)

- Per Runner (settings/runners list + monitor): exactly one "Current task"
  slot (task link + stage + elapsed), an explicit `BUSY`/`FREE` pill sourced
  from the Step 2 payload (`liveHoldCount`/`currentTaskId`), a "queued next"
  count when work is waiting, and a best-effort memory-pressure note from
  heartbeat posture. Never render two live task rows under one Runner.
- Keep `RunnerBanner` per task (it answers "where is THIS task running") but
  ensure its copy cannot imply the Runner is otherwise free; link to the
  Runner's single slot.
- Validation: headless check via existing fixtures + `npm run capture:screenshot`
  (no long-lived servers); flip the Step 3 frontend test to the new rendering.

### Step 8 — Regression tests (assurance)

- Backend: busy-runner dispatch refused (agent + merge + direct-claim paths);
  refused task still claimable by a different runner; expired hold does not
  block; two processes / double-poll with one identity cannot double-execute.
- Frontend: one-runner-two-tasks fixture renders exactly one BUSY slot and one
  live badge; stale labels render stale.
- Runner: `RUNNER_BUSY` backoff; single-flight guard.
- Gate: `npm run test:unit` fully green; run the touched suites
  (`claimStore`, `runnerRoutes`, `runnerDispatchCaps`, `singleActiveInvariant`,
  `daemon`, `runningTask`, dashboard) unmodified, no narrowing/deselect.

### Step 9 — Documentation (assurance)

- Update the Runner/operator docs: the one-task-per-Runner invariant, the
  `RUNNER_BUSY` contract (code, status, retry-after behavior), queue+reroute
  semantics, and what each UI slot means. Touch `agent-docs/` only where a
  Runner invariant is already documented; otherwise the user-facing runner
  settings/monitor help text + CHANGELOG-style note per repo convention.
- Record the Step 0 verdict (screenshot hypothesis) and the survey-default
  decisions (§1 table) in the task folder so a later human answer can be
  diffed against what shipped.

### Step 10 — Rollout + rollback (assurance)

- Rollout is a normal deploy (backend fence + runner update + frontend);
  backend first (old Runners treat 409 `RUNNER_BUSY` as a retryable dispatch
  miss — verify this fallback in Step 6 tests so mixed versions are safe).
- Rollback: revert backend fence → prior caps-only behavior; no data migration
  (holds stay memory-only), so rollback is stateless.
- Post-deploy check: fleet with ≥2 runners, ≥2 tasks — each runner shows
  BUSY with exactly one current task; queue drains without overlap.

## Risks / Open Questions

- Screenshot missing + survey unanswered: Step 0 re-captures evidence; §1
  defaults keep the plan executable either way.
- Mixed-version fleet during rollout: old Runner receiving unknown 409 code
  must back off, not crash — covered in Step 6.
- TTL edge: a crashed Runner's hold still blocks ITS OWN identity until TTL;
  acceptable (same as today's per-task behavior), documented in Step 9.
- Out of scope: raising fleet/project caps, multi-task runners by config,
  real memory-based admission control (memory UI is display-only).

## Validation Plan (summary)

| Step | Check |
|---|---|
| 0–1 | Verdict recorded; throwaway probes reproduce the bug via public routes |
| 2–4 | `npm run test:api`, `npm run test:frontend` green; ≤1 live badge in probe |
| 5–6 | Fence tests pass; caps + invariant + daemon suites unmodified-green |
| 7 | Headless screenshot of runner view shows one BUSY slot |
| 8 | Full `npm run test:unit` green |
| 9–10 | Docs updated; mixed-version backoff verified; deploy/rollback noted |

Highest-risk validation: Step 1's double-dispatch probe — if it shows the
backend already refuses (hypothesis (a) wrong), Steps 5–6 shrink to hardening
and the plan re-weights toward the Step 4/7 display fix.
