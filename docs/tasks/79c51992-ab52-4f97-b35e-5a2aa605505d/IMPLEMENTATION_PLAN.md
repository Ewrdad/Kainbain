# S6 — Fix misleading resume label and Tried-N-times inflation — Implementation Plan

**Task:** `79c51992-ab52-4f97-b35e-5a2aa605505d`
**Source research (as cited in brief):** task `2e663986-aaf3-4afe-8dcf-3adad34acdb4`
("noticing a high level of interruptions"), RESPONSE.md §S6,
`GUIDE-07-amplifier-requeue-and-display.md`, WIDE_NET amplifier, TDD-TEST-EXAMPLES.md.
**Survey source:** `SURVEY.md` in this folder (round 1, q1–q2).

## 0. Goal and non-goals

**Goal.** Fix the two display defects the reporter saw in `assets/image.png`:

1. **Misleading resume label (backend).** `autoResumeTask` writes one history
   string — `"Auto-resumed after server restart — prioritised in queue"` — for
   both recovery routes, so ~100 runner-path resumes display as "server
   restarts that never happened" (0 recorded). New behaviour: genuine
   reconcile recoveries keep the server-restart string; runner-path resumes
   write `"Auto-resumed after runner interrupt — prioritised in queue"`
   including runner id + reason.
2. **Tried-N-times inflation (frontend).** `summarizeStageRuns` counts every
   `Resumed` timeline row into `tryCount`, producing the screenshot's
   x6/x10/x11 badges. New behaviour: `Resumed` rows are excluded from
   `tryCount` and shown separately (e.g. `"Tried 2 times, 4 infra resumes"`).

**Non-goals.**

- No change to resume *semantics* (who gets resumed, priority, escalation
  bounds, single-active invariant). Display/contract change only.
- No migration of already-written histories: old rows keep the old string;
  only new resumes use the new one (backward compat, per brief).
- No change to `isVisitOutcomeTimelineStatus` live-row suppression (see trap
  in §4): `Resumed` stays a visit-outcome status there.

## 1. Inputs — what exists, what is missing

### 1.1 Cited research docs are absent from this checkout

`docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/` does **not** exist here
(verified: no such folder under `docs/tasks/`; the closest RESPONSE-bearing
task is `b3401f19-…`, which is about the model catalogue, not interruptions).
Likewise `RESPONSE_SURVEY.md` (q6/q7) for the cited task is unavailable.

**Consequence for the implementer:** treat the task brief's Evidence/Change
paragraphs plus the live code (verified below) as the contract source of
truth. Do not block on the missing GUIDE; the brief quotes the operative
sentences verbatim. If the research task becomes available, re-check only
these two points against it before coding: (a) the exact new history-string
wording, (b) whether q7 picked "show separately" vs "hide".

### 1.2 This task's survey is unanswered — proceed on Recommended defaults

`SURVEY.md` round 1 contains two required questions with **empty answers**
(`"answers": {}`):

| Survey item | Question | Recommended option (plan default) |
|---|---|---|
| q1 | Two separate resume labels vs keep single label? | **Yes — two separate labels** |
| q2 | How should infra resumes be shown? | **Show both, e.g. "Tried 2 times, 4 infra resumes"** |

**Decision recorded:** implement the Recommended options (they match the task
brief exactly). Flag in the implementation report that the survey was still
unanswered at plan time; if answers arrive before coding, q2="Hide them" is
the only answer that changes the plan (it simplifies `formatTryCount` to keep
returning only `"Tried N times"`), and q1="No" cancels workstream A.

### 1.3 Verified live-code facts (read, not assumed)

- `api/flow/scheduler/autoResumeTask.js:42-43` — single `historyAction`
  constant, used for both `_recordHistory` and (as default) the `Resumed`
  timeline row's `reason`.
- `frontend/src/components/tasks/taskFormatters.js:483-536`
  (`summarizeStageRuns`) — `tryCount = group.length` over **all** grouped rows
  including `Resumed`; `:552-556` (`formatTryCount`) renders
  `` `Tried ${n} times` ``.
- Consumers of `formatTryCount`: `TaskHistoryTab.jsx:26` and
  `TaskDetailHistoryPane.jsx:52` — both render the returned string inline
  after `•`, so a combined string needs **no consumer change**.
- Pins encoding current behaviour: `taskFormatters.test.js:1254-1385`
  (`summarizeStageRuns` + `formatTryCount` cases),
  `api/flow/taskScheduler.test.js:896-939` (`autoResumeTask` block),
  `api/flow/stallRecovery.integration.test.js:139`,
  `api/flow/startupRecovery.integration.test.js:147`
  (both assert `"Auto-resumed after server restart"`).
- **Discrepancy — the brief's `interruptedBy` marker does not exist.**
  A repo-wide grep finds no `interruptedBy` symbol. What exists today:
  `executionLedger.interruptExecution` stamps `runnerInterruptStage` /
  `runnerInterruptCount` on the task plus a history line
  `` `Runner ${runnerId} interrupted execution …` ``
  (`api/flow/executionLedger.js`, interrupt path); the crash path
  (`scanTasks` → orphaned `running_*` collapses to `interrupted`) stamps
  nothing runner-specific. **Phase 1 resolves this** (see §3); it is the
  single biggest unknown and therefore comes first.

## 2. Strategy — make the change easy, then make the change

```
Phase 1  PROVE + DECOUPLE (make the change easy)     — research spike first
Phase 2  PIN (characterise current behaviour, red)   — tests before code
Phase 3  CHANGE (backend label, frontend count)      — the actual fix
Phase 4  PROPAGATE (pins, docs, gates)               — contract change fallout
Phase 5  ASSURE (verification + docs + report)       — prove it is done
```

Rule: no production-line change in Phases 1–2; every production change in
Phase 3 lands against an already-red test from Phase 2.

## 3. Phase 1 — Prove + decouple (do this first; biggest unknowns earliest)

### Step 1.1 — Resolve the `interruptedBy` discrepancy (spike, ≤1h)

Goal: decide the discriminator `autoResumeTask` uses to pick the label.

1. Read `executionLedger.interruptExecution` fully (who passes `runnerId` /
   `reason`; confirm `runnerInterruptStage`/`runnerInterruptCount` are always
   stamped on the runner path).
2. Read the crash path (`scanTasks` orphan collapse + `startupRecovery.js`)
   and confirm it stamps **neither** field.
3. Read `deployReconcile.js` resume path (it also calls `autoResumeTask`) and
   classify it: reconcile/genuine-restart route.
4. **Decision (recommended):** stamp a small structured marker at interrupt
   time — `task.interruptedBy = { runnerId, reason, at }` in
   `interruptExecution` — and let `autoResumeTask` branch on its presence:
   present → runner string (+ id + reason), absent → restart string. This is
   additive (old tasks simply lack the field and keep old behaviour), survives
   the `updatedAt` flip, and needs no migration.
   - Fallback if stamping is judged too invasive: derive the route from
     `runnerInterruptStage != null` (+ last history line match). Weaker
     (conflates "interrupted before" with "interrupted now" if the field is
     never cleared — verify clearing in `resetAttemptBudgets.js` first).
5. Record the decision + evidence (file:line for each of the three resume
   call sites: `startupRecovery`, `scheduleTick`, `deployReconcile`) in the
   implementation report. If the GUIDE reappears, reconcile wording only —
   the discriminator decision stands on code evidence.

### Step 1.2 — Extract the label decision into one helper (backend seam)

Create `api/flow/scheduler/resolveResumeLabel.js` (one function per file, per
repo convention — see `check:one-function`):

- Input: `(task, { reason } = {})`. Output: the history string.
- Initially it returns the **current** single string unconditionally (pure
  refactor, zero behaviour change); `autoResumeTask` calls it.
- Run `npm run test:api` — must be green before proceeding. This proves the
  seam is safe and gives Phase 3 a one-line branch point plus a unit-testable
  surface.

### Step 1.3 — Extract the Resumed classifier (frontend seam)

In `taskFormatters.js`, add a module-local `isInfraResumeRow(entry)` predicate
(case-insensitive `status === 'resumed'`, mirroring the existing
`isVisitOutcomeTimelineStatus` normalisation). Initially used **nowhere in
production logic** — only imported by the new pin tests. Zero behaviour
change; run `npm run test:frontend` green.

## 4. Phase 2 — Pin current behaviour, then turn the pins red

Write characterisation tests that **first assert today's behaviour (green)**,
then flip them to the new contract (red), before any production change.

### Step 2.1 — Backend: new `api/flow/scheduler/autoResumeLabel.test.js`

Pin-then-red cases (each assertion states the new expectation explicitly
after the flip):

1. Genuine restart route (interrupted task with **no** runner marker) →
   `"Auto-resumed after server restart — prioritised in queue"` (unchanged).
2. Runner route (interrupted task **with** the Phase-1 marker) →
   `"Auto-resumed after runner interrupt — prioritised in queue"`, containing
   the runner id and the interrupt reason.
3. Runner route with missing/blank reason → label still well-formed (falls
   back to no-reason suffix, never `"Reason: undefined"`).
4. Timeline `Resumed` row `reason` matches the picked history string in both
   routes.
5. Old history rows are untouched (backward compat: no rewrite of existing
   `history[].action`).

Run green on pins, flip to new expectations (red), keep red into Phase 3.

### Step 2.2 — Frontend: `summarizeStageRuns` / `formatTryCount` pin-then-red

Extend `frontend/src/components/tasks/taskFormatters.test.js` (or a colocated
describe block):

1. Group of 2 real tries + 4 `Resumed` rows → `tryCount: 2`,
   `resumeCount: 4` (name: `resumeCount`; alternative `infraResumeCount` —
   pick one, document it, use it everywhere).
2. Group of only `Resumed` rows → no `tryCount` badge; representative row
   still renders (latest-status rule unchanged).
3. `formatTryCount({ tryCount: 2, resumeCount: 4 })` →
   `"Tried 2 times, 4 infra resumes"`.
4. `formatTryCount({ tryCount: 2 })` → `"Tried 2 times"` (no resume suffix
   when zero/absent); `({ tryCount: 1, resumeCount: 3 })` → resume-only text
   (e.g. `"3 infra resumes"`) — decide exact string in the test, explicitly.
5. Cap behaviour: `resumeCount` obeys `STAGE_RUN_TRY_COUNT_CAP` display
   clamping like `tryCount`; fractional/string inputs fail safe as today.
6. Representative-row rule unchanged: latest chronological row still wins
   even when it is a `Resumed` row (only the *counting* changes).

**Trap to pin, not fix:** `isVisitOutcomeTimelineStatus('Resumed') === true`
drives live-row suppression in `buildDisplayTimeline` — that logic must keep
treating `Resumed` as a same-stage outcome. Add a regression assertion that
suppression still works with the new counts (extends the existing
`taskFormatters.test.js:951-957` case shape).

## 5. Phase 3 — Make the change (against red tests)

### Step 3.1 — Workstream A: backend label (independent)

1. (If Step 1.1 chose stamping.) Stamp `interruptedBy = { runnerId, reason,
   at }` in `executionLedger.interruptExecution`, truncating `reason` with
   the existing 500-char clean rule. Clear/leave policy: leave it on the
   task; `autoResumeTask` consumes it read-only (do not delete — the next
   interrupt overwrites it; document this).
2. Branch in `resolveResumeLabel`: marker present → runner string with
   `runnerId` + `reason`; absent → restart string.
3. `autoResumeTask` uses the resolved string for both `_recordHistory` and
   the timeline default reason (unchanged plumbing, new value).
4. `autoResumeLabel.test.js` goes green. Full `npm run test:api` will still
   show the *intended* pin failures from §6 — that is expected; do not fix
   them here.

### Step 3.2 — Workstream B: frontend count (independent, parallel-safe)

Workstream B touches only `frontend/src/components/tasks/taskFormatters.js`
(+ its test); workstream A touches only `api/`. They can run in parallel.

1. `summarizeStageRuns`: partition each stage group into real tries vs
   `Resumed` rows via `isInfraResumeRow`. `tryCount` = real-try count (only
   set when > 1, as today); new `resumeCount` = Resumed count (only set when
   > 0). Representative-row selection still runs over the **whole** group.
2. `formatTryCount`: render combined label —
   `"Tried {n} times[, {m} infra resumes]"`, resume-only form when `tryCount`
   is absent/`<= 1` but `resumeCount > 0`, `null` when neither qualifies.
   Same clamp/floor/fail-safe rules as today.
3. No consumer change needed (`TaskHistoryTab`, `TaskDetailHistoryPane`
   render the string verbatim) — verify by reading both call sites, not by
   editing them.
4. New frontend tests go green.

## 6. Phase 4 — Propagate the intended contract change to existing pins

Each updated assertion must state the **new** expectation explicitly (this is
the contract change the brief calls out — not test churn):

1. `api/flow/taskScheduler.test.js:896-939` (`autoResumeTask` block):
   seed one case **without** marker (expects restart string) and one
   **with** marker (expects runner string + id + reason). Keep the flip,
   priority-marker, and untouched-task assertions otherwise identical.
2. `api/flow/stallRecovery.integration.test.js:139` and
   `api/flow/startupRecovery.integration.test.js:147`: these exercise the
   genuine kill -9 / SIGTERM restart route → keep asserting the
   server-restart string, and add a comment naming the route. (If either test
   seeds a runner marker, it must assert the runner string instead — check
   while editing.)
3. `frontend/src/components/tasks/taskFormatters.test.js` existing
   `summarizeStageRuns` cases: none of the current fixtures contain `Resumed`
   rows, so they should pass unchanged — if any fails, that is a regression
   in grouping, not an intended change; fix the code, not the test. Only the
   `buildDisplayTimeline` Resumed-suppression case (:951-957) may gain a
   `resumeCount` assertion.
4. Docs carrying the old string: `docs/resume-stall-recovery-runbook.md:56`
   and `docs/queue-scheduler-idle.md:88` — update to document both strings
   and which route writes which.

## 7. Phase 5 — Assure the change (verification + documentation plan)

### 7.1 Test gates (must all pass)

1. `npm run test:api` — green (new `autoResumeLabel.test.js` + updated
   scheduler/recovery pins).
2. `npm run test:frontend` — green (updated formatter pins).
3. `npm run lint` (api + frontend) — green; new files carry the repo's MARK
   JSDoc header so `check-jsdoc-example` / `docs:check` stay green.
4. `npm run check:one-function` — green (new helper = one function per file).
5. Manual reproduction of the reporter's screenshot scenario (no long-lived
   server; headless only):
   - Backend: unit-level — interrupt a task via `interruptExecution` with a
     runner id + reason, run `autoResumeTask`, assert history shows the
     runner string (covered by the new test; also eyeball one JSON history
     line).
   - Frontend: render check via the existing test harness or
     `npm run capture:screenshot` on a task whose timeline mixes tries and
     `Resumed` rows — expect `"Tried 2 times, 4 infra resumes"`-style badge,
     never x6/x10/x11 from infra resumes alone.

### 7.2 Documentation updates (part of "done")

- JSDoc on `autoResumeTask`, `resolveResumeLabel`, `summarizeStageRuns`,
  `formatTryCount` updated to the new contract (with `@example` lines —
  they are executed by `check:jsdoc-example`, so they double as tests).
- Runbook lines in §6.4 updated.
- Implementation report in this task folder noting: (a) cited research docs
  absent, contract taken from brief + code; (b) survey unanswered, Recommended
  defaults used; (c) Phase-1 discriminator decision + evidence; (d) exact
  new strings shipped.

### 7.3 Backward-compat check

- Grep the codebase for remaining single-string assumptions
  (`"Auto-resumed after server restart"` consumers): only history-display
  (verbatim render) and the two integration tests may reference it; no
  parser may branch on the old prefix — if one does, extend it to both
  prefixes.
- Confirm no migration code touches existing `history[]` / `timeline[]`
  rows (new fields only on new rows).

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `interruptedBy` doesn't exist (brief assumed it) | Phase 1 spike decides first; additive stamping, no migration |
| Runner marker stale across crashes (task interrupted by runner, then server dies before resume) | Label reflects the *last* interrupt cause — correct: the runner death is why it is interrupted; document this semantic |
| `resumeCount` field name leaks into persisted timeline | It is display-only (like `tryCount`, set on copies in `summarizeStageRuns`); never written to storage — assert in tests |
| Over-correcting: hiding infra resumes entirely | Survey default is show-both; `formatTryCount` keeps them visible |
| Missing GUIDE wording differs when it resurfaces | Wording isolated in `resolveResumeLabel` — one-line change |

## 9. File inventory (expected diff)

- **New:** `api/flow/scheduler/resolveResumeLabel.js`,
  `api/flow/scheduler/autoResumeLabel.test.js`
  (names per brief: `autoResumeLabel.test.js`; helper name is the plan's
  choice — keep it if no better name emerges).
- **Edit (backend):** `api/flow/scheduler/autoResumeTask.js`,
  `api/flow/executionLedger.js` (stamp only),
  `api/flow/taskScheduler.test.js`,
  `api/flow/stallRecovery.integration.test.js`,
  `api/flow/startupRecovery.integration.test.js`.
- **Edit (frontend):** `frontend/src/components/tasks/taskFormatters.js`,
  `frontend/src/components/tasks/taskFormatters.test.js`.
- **Edit (docs):** `docs/resume-stall-recovery-runbook.md`,
  `docs/queue-scheduler-idle.md`, plus the implementation report in this folder.
- **Explicitly not touched:** `TaskHistoryTab.jsx`,
  `TaskDetailHistoryPane.jsx`, `isVisitOutcomeTimelineStatus` semantics,
  resume/priority/escalation logic.

## 10. Acceptance checklist

- [ ] Genuine restart resume writes the server-restart string (test 2.1.1 green).
- [ ] Runner resume writes the runner string with id + reason (tests 2.1.2–2.1.4 green).
- [ ] `Resumed` rows excluded from `tryCount`, counted in `resumeCount` (tests 2.2.1–2.2.2 green).
- [ ] Badge reads `"Tried N times[, M infra resumes]"` incl. edge forms (tests 2.2.3–2.2.5 green).
- [ ] Live-row suppression still treats `Resumed` as visit outcome (trap test green).
- [ ] `npm run test:api`, `npm run test:frontend`, `npm run lint` green.
- [ ] Old histories byte-identical; docs + JSDoc updated; report filed.
