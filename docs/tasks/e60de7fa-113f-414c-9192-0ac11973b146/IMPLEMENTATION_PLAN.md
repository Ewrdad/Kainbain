# Implementation Plan — Add runner to the history of a task

Task ID: `e60de7fa-113f-414c-9192-0ac11973b146`
Working directory: `/home/server/.kainbain/runner-work/kb-e60de7fa-113f-414c-9192-0ac11973b146`
Source decision: `docs/tasks/e60de7fa-113f-414c-9192-0ac11973b146/idea-20261102-112913.md`
Survey (authoritative): `docs/tasks/e60de7fa-113f-414c-9192-0ac11973b146/SURVEY.md`

This document is the plan only. No code changes are made by this stage.

---

## 0. Survey decisions applied (authoritative over raw wording)

| Survey question | Selected answer | Implementation consequence |
|---|---|---|
| Q1 — what is a "runner" | A machine or computer that does the task | Only remote Runner dispatches are attributed. Backend-embedded stage runs have no runner and remain blank. Use the Runner's canonical `runnerId` (the survey note "Use the runner label" resolves to the operator-facing Runner id/label, never a person). |
| Q2 — what to save about the runner | Date/time of run, Runner name/ID, pass/fail, duration | These are exactly the four fields already present on a timeline/audit-history row: `timestamp`, `runnerId`, `status`, `duration`. No new time/duration bookkeeping is required; we are adding one column (`runnerId`) to rows that already exist. |
| Q3 — how to spot struggling | Just save the data for now, decide later | v1 persists data only. No warning flags, alerts, reports, or intervention thresholds ship in this change. They are a named follow-up that consumes the data. |
| Q4 — what counts as struggling | All suggested (more failures, longer duration, more retries, stuck on one task type) | Document those signals for the follow-up, but do not implement detection. The persisted fields (`status`, `duration`, `infraRetryCount`/`autoIterationCount`, `task.workflowId`/`stage`) are sufficient to compute them later. |
| Q5 — old history | Only new tasks going forward | No migration or backfill. Every row already persisted without `runnerId` stays runner-less; frontends and readers treat absence as "unknown / not applicable", never as a failure. |

---

## 1. Goals and non-goals

### Goals

1. Every stage-transition row (task history timeline) recorded for a Runner-run stage persists `runnerId` in its structured fields, for both successful and failed runs and every retry/recovering outcome.
2. Every stage report's persisted metadata (`reportMetadata`) carries `runnerId` for the Runner that ran it.
3. The persisted `task.currentRunAttribution` carries `runnerId` so the terminal `Completed` row and any failure close-out row attribute the Runner that ran the stage.
4. Embedded (backend) runs continue to attribute no Runner, so `runnerId` stays absent rather than becoming a placeholder (`"embedded"`, `"local"`, etc.).
5. Build and persistence remain backward-compatible: rows and reports without `runnerId` parse and render exactly as before (no migration).
6. Data survives reload/restart because it travels through the existing structured JSON frontmatter (`timelineMetadata`, `reportMetadata`), not through the rendered Markdown sections.

### Non-goals

1. No UI intervention workflow, alerting, or dashboard for "struggling runners" (survey Q3/Q4): this change is capture only.
2. No changes to dispatch selection, runner matching, or operator config.
3. No user-facing redesign beyond making the saved id available to the existing attribution surface (optional display pass, §7). If a display update is deferred, the data is still queryable from task files/API.
4. No historical migration/backfill of tasks that ran before the change (survey Q5).

---

## 2. "Make change easy, then make the change"

Per the project standard, land small preparatory refactors first so the real change is mechanical, and run `npm run test:unit` after Phase E.

### Phase E0 — Easy (research + contract decisions, no behaviour change)

1. **Pin the public contract for the new field.** Decide and document:
   - field name `runnerId` (matches the casing already used by `task.currentRunAttribution`, Runner registry, and `PerRunnerTasksWidget`);
   - it is optional on every row/report and absent means "not Runner-attributed";
   - it is additive only — never overwrite or migration-heal existing rows.
2. **Confirm parsing pass-through.** Verify `parseStoredRecords` keeps unknown keys (it does today for `aliasName`, `modelRef`, `targetIndex` added earlier); add one characterization test if missing.
3. **Identify every write site** before touching code (list in §4.1). Include `completeTask`, `advanceStage`/`moveToStage` arrival rows, `handleStageFailure`, `handleTransientFailure`, `applyRunnerReport`, `applyIntegrationReport`, dispatch stamping, claim path, and `executionLedger.recordProgress`.
4. **Agree frontend scope.** Confirm we are not required to render the new field in v1 (data capture first). The optional display item is §7, not a goal.

### Phase E1 — Refactor to make the change mechanical (no behaviour change)

1. Extend `buildTimelineAttribution` (`api/flow/runAttribution.js`) to accept and preserve `runnerId`:
   - clean it the same way as harness/model strings (`typeof string`, trim, drop blank);
   - return it even when `harnessId` and `modelRef` are absent, because CI/merge/integration rows are stage-closing rows where the only attribution may be the Runner itself;
   - keep the null contract for *both* harness/model *and* runner all absent.
2. Extend `stampArrivalRowAttribution` / `stampDispatchRunAttribution` plumbing to thread the new value (surfaces, does not change behaviour yet).
3. Add `runnerId` to the `saveTaskMarkdown` report metadata projection (`api/work/taskPersistence.js`) so it is persisted on every write once a report carries it (projection is harmless until writes include it).
4. Add `runnerId` to the documented "run attribution" vocabulary in `docs/EngineDetails/ModelKeys.md` and `docs/KB Architecture.md` as a sibling field to `harnessId`/`modelRef`.

_Phase E1 must pass existing tests (`npm run test:unit`) before proceeding. It is behaviourally inert because no write site supplies `runnerId` yet._

### Phase E2 — The change (add runner to history)

Wire `runnerId` through every stage write site listed in §4.1 so a Runner-attributed run records the Runner on its timeline row and report. Each is a one-line attribution addition, exactly analogous to the existing `harnessId`/`modelRef`/`aliasName`/`targetIndex` fields.

### Phase E3 — Audit entries, persistence, and close-out

1. Add `runnerId` to the in-memory audit entries that already narrate Runner work (`applyRunnerReport`'s `task.history.push`, `applyIntegrationReport`, and `executionLedger.recordProgress`), in addition to the existing `via Runner …` prose. Persist as before; no markdown format change.
2. Ensure `task.currentRunAttribution` carries `runnerId` so terminal and failure rows attribute it (Phase E2 already stamps it on dispatch; this phase verifies the value flows through `completeTask` and `handleStageFailure`/`handleTransientFailure`'s existing spreads).
3. Re-run persistence round-trip tests (§6.3).

---

## 3. Data model and persistence

### 3.1 Timeline row fields (additive)

```
{
  stage, status, duration, timestamp, diff/boundary fields,
  harnessId?, modelRef?, aliasName?, targetIndex?, runnerId?  // NEW
}
```

- `runnerId` is optional and absent (never `null`-worded) when the stage ran embedded or is pre-feature history.
- It is a plain string copied from the authenticated Runner record (`runner.runnerId`), never resolved through an alias or registry lookup at read time. This keeps the row interpretable after a Runner is renamed/removed.

### 3.2 Report metadata

`reportMetadata` projection in `saveTaskMarkdown` adds `runnerId` to its field list. Report files are JSON entries in frontmatter, so `parseStoredRecords` already keeps it. `saveStageReport` call sites that currently pass `{ harnessId, failureKind, aliasName, modelRef, targetIndex }` additionally pass `runnerId`.

### 3.3 Audit history entries

`task.history[i]` becomes `{ timestamp, action, runnerId? }`. Markdown rendering stays `- timestamp: action`; the structured field is retained via the existing in-memory object and best-effort rendering. Audit entries emitted by the Runner transport also include the structured field so downstream consumers need not parse the `"Runner X stage Y: event"` string.

### 3.4 Source of truth

- Dispatch allocates `runnerId` from the authenticated Runner credential (`runner.runnerId`), never from the request body. This matches the existing scope rule (R04): claim, dispatch, direct claim, and skip all use the authenticated Runner.
- Amplify fail safety: if no Runner is authenticated (embedded path), leave `currentRunAttribution.runnerId` unset; do not invent an id.

---

## 4. Files and exact change points

### 4.1 E2 wiring sites (edit these)

| File | Function / block | Change |
|---|---|---|
| `api/flow/runAttribution.js` | `buildTimelineAttribution` | Accept and preserve `runnerId` (clean string; survive even without harness/model). Update doc example/JSDoc. |
| `api/flow/runAttribution.js` | `stampArrivalRowAttribution` | Already `Object.assign(row, clean)`; no change once builder keeps `runnerId`. |
| `api/flow/runnerRoutes.js` | `stampDispatchRunAttribution` | Accept `runnerId` in `{...}` args; include it in `buildTimelineAttribution(...)` and the stamped `currentRunAttribution`. |
| `api/flow/runnerRoutes.js` | dispatch route `assigned` candidate handling, direct `claim` route | Pass `runner.runnerId` into `stampDispatchRunAttribution({ ..., runnerId: runner.runnerId })`. These call sites already have the authenticated `runner`. |
| `api/flow/runnerRoutes.js` | complete-execution route `outcome.status === failed` case | `applyRunnerReport(... outcome: { ..., runnerId: runner.runnerId })` already passes it; ensure it stays. |
| `api/flow/runnerRoutes.js` | complete-execution claim-heartbeat timeout path | `applyRunnerReport` timeout outcome already passes `runnerId`; verify (currently yes). |
| `api/flow/execution/applyRunnerReport.js` | failure path → `routeStageError` | Add `runnerId: outcome.runnerId` to `runOutcome`. |
| `api/flow/execution/applyRunnerReport.js` | success report save (`saveStageReport`) | Add `runnerId: outcome.runnerId` to params. |
| `api/flow/execution/applyRunnerReport.js` | `task.history.push` on success | Add `runnerId: outcome.runnerId`. |
| `api/flow/execution/applyIntegrationReport.js` | `parkUnverifiable`, `recordReliabilitySample`, report save, history pushes | Ensure `runnerId` is threaded into any `handleStageFailure` opts and report metadata. Report/audit text already names `via`. Add `{ runnerId }` to `parkUnverifiable`'s opts and baseline `task.history.push`. |
| `api/flow/routing/orchestrators/handleStageFailure.js` | opts destructure | Destructure `runnerId`; build `buildTimelineAttribution({ harnessId, aliasName, modelRef, targetIndex, runnerId })`; pass `runnerId` to `saveStageReport`. |
| `api/flow/routing/orchestrators/handleTransientFailure.js` | opts destructure + two timeline writes + `recordTransientAttemptReport` | Same as handleStageFailure (both parked-exhausted and retrying rows). |
| `api/flow/execution/executeStage.js` failure routes | opts where `runOutcome` is built | Thread `runnerId` where an embedded run has one. Embedded runs pass nothing; no change needed if absent. Confirm no runner is invented. |
| `api/flow/stageTransitions.js` | `completeTask` → `runAttribution` uses `task.currentRunAttribution` | No code change if Phase 2 already carries `runnerId` through dispatch; verify via tests. |
| `api/flow/executionLedger.js` | `recordProgress` `task.history.push` | Add `runnerId` to the pushed audit entry. |
| `api/work/taskPersistence.js` | `reportMetadata` projection | Add `runnerId` to the destruction map. |

### 4.2 Persistent markdown / parsing

- No change to the `# Timeline` rendered text (runner travels in `timelineMetadata` JSON frontmatter, which already overlays parsed rows).
- `saveTaskMarkdown` already JSON-stringifies `timelineMetadata` containing the full timeline objects, so once rows include `runnerId` it is persisted.
- `parseTaskMarkdown` already restores `timeline` from `parseStoredRecords(data.timelineMetadata)` when non-empty. Confirm (yes, line `if (persistedTimeline.length > 0) timeline = persistedTimeline;`).
- `parseStoredRecords` must preserve unknown keys; verify and cover with a test.

### 4.3 Frontend (optional; can defer without breaking data capture)

- `frontend/src/components/tasks/RunAttributionBadge.jsx::formatRunAttribution`: optionally append `runnerId` as `via runner <id>` in the badge/expansion. This is purely presentational and does not affect struggling detection (data is in the row).
- `frontend/src/components/tasks/TaskDetailHistoryPane.jsx`: no change required; badge component already rendered per timeline row.
- Task audit events: `task.history` entries now may carry `runnerId`. Frontend could render `(runner: …)` next to the action. Optional.

For survey Q3 ("just save the data for now"), ship the backend/persistence change and defer frontend display unless time permits; data remains accessible through task files and API.

### 4.4 Documentation

- `docs/EngineDetails/ModelKeys.md` (runner → task history vocabulary section): add `runnerId` to the recorded timeline-row field list.
- `docs/KB Architecture.md` (Model/runner reporting section): mirror the above.
- `docs/tasks/…/IMPLEMENTATION_PLAN.md` (this file) copied/linked where needed.
- Add a short note to `agent-docs/` or site-docs explaining that runner-struggling detection is a follow-up and where the data lives.

---

## 5. Stage testing plan

### Unit

1. `api/flow/runAttribution.test.js` (add/extend):
   - `buildTimelineAttribution({ runnerId: "runner-alpha" })` returns `{ runnerId: "runner-alpha" }` even with no harness/model.
   - `buildTimelineAttribution({})` still returns `null`.
   - `stampArrivalRowAttribution(task, label, { runnerId })` stamps `runnerId` on the matching arrival row.
2. `api/work/taskPersistence.test.js` (add cases):
   - `saveTaskMarkdown` → `parseTaskMarkdown` round-trips `runnerId` on timeline rows and report entries.
   - A row/report without `runnerId` parses and renders identically (backward compatibility).
3. `api/flow/execution/applyRunnerReport.test.js` (extend):
   - On pass, the last timeline/audit entry contains `runnerId` equal to `outcome.runnerId`.
   - On failure, `routeStageError` receives `runOutcome.runnerId` and the resulting Failed row persists it.
   - Report metadata includes `runnerId`.
4. `api/flow/routing/*` tests for `handleStageFailure` / `handleTransientFailure`:
   - `runnerId` passed via opts appears on the Failed/Retrying timeline row and `saveStageReport` call.
5. `runnerRoutes` dispatch/claim tests:
   - A dispatch assignment stamps `currentRunAttribution.runnerId` (and arrival row `runnerId`) for the claiming runner.
6. Audit ledger test:
   - `executionLedger.recordProgress` pushes an audit entry that carries structured `runnerId`.

### Integration

1. Dispatch a task to a test Runner, complete it, reload from disk, assert the timeline row and report metadata contain the Runner id.
2. Force a failure on the runner path, reload, assert the Failed row and failure report contain the Runner id.
3. Run `npm run test:unit` with zero regressions.

### Verification gate

- `npm run test:unit` is the primary gate (per task verification guidance).
- No long-lived server; use existing Vitest/runner mocks.
- Add a changelog note if the project's test runner list requires new test files (`scripts/run-tests.mjs` pinned list) — confirm any added test file is registered there.

---

## 6. Edge cases / compatibility

1. **Embedded runs**: no `runnerId` is stamped or persisted. Rows without it are indistinguishable from pre-feature history, which is intended (survey Q5).
2. **Renamed/removed Runners**: rows hard-code `runnerId` strings. Readers must not join against the live registry to interpret history. This matches the precedent for `aliasName` (renaming aliases orphans prior history).
3. **Terminal `Completed` row**: emitted in `completeTask` only when `currentRunAttribution` matches the current stage. For a Runner that ran the final stage, `runnerId` flows through; otherwise absent.
4. **Retries**: `handleTransientFailure` records two rows (retrying + terminal/exhausted); both must carry the same `runnerId` when the failing run was Runner-attributed.
5. **Report metadata projection**: adding `runnerId` to the projection must not hide it when reports are saved; ensure `saveStageReport` accepts and `TaskPersistence.saveTaskMarkdown` serializes it. Missing field on a report serializes as `undefined` dropped by JSON — consistent with existing optional fields.
6. **Markdown parser safety**: if a timeline row line lacks the runner (always, since runner is in frontmatter JSON), no parser change is needed. If we optionally render runner in `# Timeline` text, that would require parser care; avoid in v1.
7. **Concurrency**: no lock required; rows are appended single-writer under the owning task.

---

## 7. Optional display pass (deferred, survey Q3)

If desired in the same change, a trivial presentation update without behaviour:

- `RunAttributionBadge.jsx`: include `runnerId` in the tooltip (`runner: …`) and optionally render `via <runnerId>` as an additional muted segment.
- `TaskDetailHistoryPane.jsx` audit events: render `runnerId` when present on an audit entry.
- Frontend tests: update `RunAttributionBadge.test.jsx` expectations.

This is explicitly **not required** for struggling detection, which should be computed from persisted data, not from rendered text. Deferring keeps the change minimal per "make change easy, then make the change."

---

## 8. Risks

1. **Build timeline attribution semantics change**: extending `buildTimelineAttribution` to return `runnerId`-only rows could make CI/merge rows carry runner data where they previously carried nothing. This is exactly the goal, but callers that spread `runAttribution || {}` into timeline rows must continue to filter falsy. Mitigation: only emit `runnerId` when a real Runner is authenticated.
2. **Over-broad scope**: wiring every failure path in one pass risks missing a site. Mitigation: §4.1 table plus a final grep for `runOutcome`, `saveStageReport`, and `buildTimelineAttribution` to catch un-wired sites; add a regression test that greps for omitted `runnerId` where `harnessId` is passed.
3. **Frontend/backend divergence**: frontend types (none today) don't need updating because data is carried in JSON metadata. Keep frontend changes to optional display only.
4. **Test registration**: `scripts/run-tests.mjs` pins runner tests by filename. If new test files are added, register them or they won't run. Mitigation: prefer extending existing test files over new ones.

---

## 9. Acceptance criteria

1. A successful Runner-run stage produces a persisted timeline row with `runnerId` equal to the Runner that ran it.
2. A failed or retried Runner-run stage produces each resulting row (Failed / Retrying / exhausted) with the same `runnerId`.
3. Stage reports generated on the Runner path carry `runnerId` in `reportMetadata`.
4. A terminal `Completed` row for a Runner-run final stage carries `runnerId`.
5. Embedded runs leave `runnerId` absent on all rows/reports; no placeholder id is invented.
6. Reloads from disk preserve `runnerId` on timeline and report rows.
7. Existing tests pass without modification except tests legitimately extended to cover the new field; no snapshots/regressions.
8. `npm run test:unit` passes after each phase.

---

## 10. Rollout / "no migration" note

This change is additive and forward-only. Tasks already on disk keep their current (runner-less) rows and reports unchanged; they simply lack `runnerId` and remain valid. Struggling-runner detection (survey Q3/Q4) will be implemented as a separate follow-up consumer of these persisted fields and can choose its own thresholds without further schema work.

KAINBAIN_VERDICT: PASS