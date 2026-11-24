# IMPLEMENTATION_PLAN — S7: Regression-pin boot reconcile (server-restart orphans stay at zero)

Task: `05b5d046-9480-40e3-8ec9-c06596c51acc`
Type: test-only PIN. **Zero behaviour change.** One new file, no prod edits.
Target: `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`

## 0. Ground truth and constraints (read first)

### 0.1 What this task is

Cause 6 ("backend restart orphans") was ruled out: 0/118 interruptions,
publish-only deploys, and an observed restart orphaned nothing. This task keeps
it ruled out by pinning the one path that SHOULD write
"interrupted by server restart": `reconcileInterruptedRuns`
(`api/flow/scheduler/reconcileInterruptedRuns.js`), called at boot as step 1 of
`performStartupRecovery` (`api/flow/startupRecovery.js`).

Per GUIDE-06 §2 (as quoted in the task text), the new test file covers exactly:

1. orphan flip + history row,
2. engine-owned task untouched,
3. idempotence,
4. legacy `running_deploy` coverage.

Tests must pass immediately (PIN, not red). PROD check (GUIDE-06 §4,
PROD-READ-ONLY, needs permission) is explicitly out of implementation scope:
any "interrupted by server restart" row found in prod re-opens Cause 6, but
running that loop requires operator permission and is a review/ops step, not a
coding step.

### 0.2 SURVEY.md — factored in, no open decisions

`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/SURVEY.md` contains a single
round-1 meta-question ("I think this is simple enough to not require
questions. Do you agree?") with **no answers recorded**. The task text states
"No survey question (no behaviour change)". Conclusion: there are no
user-pending decisions; proceed exactly as described. No behaviour question may
be invented to justify a behaviour change.

(Note: the harness prompt lists an `idea-20261122-181522.md` previous report,
but that file is absent from the task folder — only `SURVEY.md` exists. The
task text in the prompt is therefore the operative spec.)

### 0.3 Source-research docs are ABSENT — reconstruction basis

Verified by filesystem search on this checkout (branch
`kb/05b5d046-9480-40e3-8ec9-c06596c51acc`):

- `docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/` does **not** exist.
  No `RESPONSE.md` S7, no `GUIDE-06-backend-restart-orphans.md`, no
  `WIDE_NET_ANALYSIS.md` Cause 6, no `TDD-TEST-EXAMPLES.md`, no
  `RESPONSE_SURVEY.md` for that id exist anywhere under `docs/`.
- The only research folder with `RESPONSE.md`/`WIDE_NET_ANALYSIS.md` is
  `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/`, which is about a
  **different bug** (runner catalogue / fleet models), not interruptions.

So the "read the GUIDE before coding" step cannot be executed literally. The
implementer MUST NOT block on this; the reconstruction basis, in priority
order, is:

1. the task text's four-case spec (orphan flip + history, owner untouched,
   idempotence, legacy `running_deploy`) — authoritative;
2. `api/flow/scheduler/reconcileInterruptedRuns.js` — code is truth for exact
   strings and branches (`"interrupted"`, `wasInterrupted = true`,
   `"Stage execution interrupted by server restart"`, owner guard on
   `store.engineState?.activeTaskId`, best-effort `_recordHistory` /
   `_saveTaskMarkdown`, per-task fail-safe);
3. `api/flow/scheduler/orphanedRunningStatuses.js` — the orphaned set
   (`running_agent`, `running_ci`, `running_merge`, `advancing`, legacy
   `running_deploy`);
4. existing test conventions in `api/flow/scheduler/*.test.js` (vitest,
   colocated, minimal fakes) — see Phase 1.

Risk accepted: if GUIDE-06 §2's literal assertions differ in wording from the
reconstruction, review against the real GUIDE (if it surfaces) may ask for
assertion-text tweaks. The four behaviours above are unambiguous from code, so
this risk is low. Flag it in the implementation report.

### 0.4 Non-goals (explicit)

- No prod code change of any kind (not even comments/JSDoc in prod files).
- No changes to existing tests.
- No PROD loop execution (needs permission; documented as an ops handoff).
- Do not "fix" anything if the PIN is red on first run (see §3.5).

---

## Phase 1 — Make the change easy (research + baseline; do this first)

Big/work-blocking items come first. None of these modify the repo.

### Step 1.1 — Re-confirm the missing-docs finding (5 min)

```bash
ls docs/tasks/ | grep 2e66; find docs -name 'GUIDE-06*' -o -name 'TDD-TEST*' | head
```

Expected: no output. Record the outcome in the implementation report so review
knows the spec was reconstructed, not read from GUIDE-06.

### Step 1.2 — Read the pin target and its contract neighbours (15 min)

Read in full (all small files):

- `api/flow/scheduler/reconcileInterruptedRuns.js` — the function under pin.
- `api/flow/scheduler/orphanedRunningStatuses.js` — the status set.
- `api/flow/startupRecovery.js` (`performStartupRecovery`, ~lines 142–210) —
  boot call site; confirms "boot reconcile" framing and idempotence
  expectation ("Safe to run twice").
- `api/work/taskPersistence.js` (~lines 891–898) — disk-load path uses the
  same set ("both reads agree"); context only, not under test here.
- `api/taskStore.js` (~lines 1045–1046) — thin `reconcileInterruptedRuns()`
  wrapper; context only.
- `api/index.js` (~lines 376–387) — shutdown persist path; context only.

Takeaway to verify: the exact history string is
`"Stage execution interrupted by server restart"` (with "Stage execution"
prefix); the owner guard is `store.engineState?.activeTaskId !== task.id`;
return shape is `[{ projectId, taskId }]`.

### Step 1.3 — Survey existing coverage to scope the PIN without overlap (15 min)

Read the existing `reconcileInterruptedRuns` coverage so the new file pins
boot semantics without brittle duplication:

- `api/flow/taskScheduler.test.js`: `describe("reconcileInterruptedRuns")`
  (~lines 297–325), `describe("reconcileInterruptedRuns isolation")`
  (~lines 1248–1294), and the WP6 fail-safe test (~lines 1631–1638); plus the
  `makeStore`/`task` helpers (~lines 52–120) as the fake-store pattern
  reference.
- `api/taskStore.summaryDurations.test.js` (~lines 40–52) — history-row
  assertion precedent.
- `api/flow/singleActiveInvariant.test.js` (~lines 130–194) — reconcile
  return-shape precedent.
- `api/flow/scheduler/schedulerPure.test.js`
  (`describe("ORPHANED_RUNNING_STATUSES")`) — set-membership precedent.

Decision: the new `.boot.test.js` is self-contained (own minimal fake store,
no imports from `taskScheduler.test.js` helpers) and boot-framed: orphans left
by a restart flip with the restart history row; the live engine owner's task
survives; a second boot pass is a no-op; pre-migration `running_deploy`
records still reconcile. Fail-safe branches (unpersistable task, throwing
project list) stay covered where they are and are NOT re-tested here.

### Step 1.4 — Confirm test-runner and file-convention facts (10 min)

- Runner is vitest (`api/package.json`: `"test": "vitest run"`). Default
  include covers `**/*.test.js`, so the new `*.boot.test.js` name is picked
  up with no config change. Verify with:
  ```bash
  cd api && npx vitest list api/flow/scheduler/reconcileInterruptedRuns.boot.test.js
  ```
  (after the file exists; before that, confirm an existing scheduler test
  lists/runs, e.g. `npx vitest run flow/scheduler/schedulerPure.test.js`.)
- Style precedent: `api/flow/scheduler/isSchedulerRunnable.test.js`
  (domain comment header, `describe`/`test`, tiny local factories, no shared
  fixtures).
- Guard-test safety: `api/flow/noDeploySpecialBehaviour.guard.test.js`
  scans only **non-test** `.js` files (`listFlowModules` excludes
  `*.test.js`), so asserting on the `"running_deploy"` string inside the new
  test file cannot trip the deploy-literal guard. No action needed; just do
  not put `running_deploy` in any new non-test file (and this task adds
  none).

### Step 1.5 — Establish a green baseline BEFORE adding the file (10–20 min)

```bash
npm run test:api -- --run flow/scheduler flow/taskScheduler.test.js taskStore.summaryDurations.test.js singleActiveInvariant.test.js
```

(API `npm test` is already `vitest run`; pass paths to bound the run.)
Expected: all green. If anything is red here, it is pre-existing: capture the
failure output, and re-verify on the untouched base (`git stash -u` is
forbidden to touch — instead `git status` to confirm clean + note the failure
as pre-existing in the report). Do not fix pre-existing failures in this task.

Also note for the report: the guard test's orphan-set allowance references
`taskScheduler.js` while the set now lives in
`scheduler/orphanedRunningStatuses.js` — if that guard is red at baseline, it
is a pre-existing issue outside S7 scope; record, don't fix.

---

## Phase 2 — Make the change (one new test file)

### Step 2.1 — Create `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`

Single new file. No prod edits. Sketch (final wording is the implementer's,
behaviours are fixed):

```js
// Domain: The Flow — boot reconcile PIN (S7): server-restart orphans stay at zero.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { reconcileInterruptedRuns } from "./reconcileInterruptedRuns.js";

// Minimal fake store: project listing, task listing, engine owner,
// history + markdown persistence spies. No imports from taskScheduler tests.
function makeBootStore(...) { ... }
function bootTask(...) { ... }

describe("reconcileInterruptedRuns boot PIN (S7)", () => {
  test("orphaned running_* tasks flip to interrupted with a server-restart history row", ...);
  test("the engine owner's live task is untouched", ...);
  test("a second pass reconciles nothing and writes no further history (idempotent)", ...);
  test("legacy running_deploy records still reconcile", ...);
});
```

Assertion checklist per case (each maps to a GUIDE-06 §2 item):

| # | Case | Must assert |
|---|---|---|
| 1 | Orphan flip + history row | Seed one task per live status (`running_agent`, `running_ci`, `running_merge`, `advancing`), `engineState.activeTaskId = null`. After the call: every status is `"interrupted"`; `wasInterrupted === true`; `updatedAt` changed; `_recordHistory` called with each task and `"Stage execution interrupted by server restart"`; return value equals `[{projectId, taskId}]` per orphan; a control `in_stage` task is untouched and absent from the return. |
| 2 | Engine-owned task untouched | Same seed plus one `running_agent` task whose id equals `engineState.activeTaskId`. After the call: owner status still `"running_agent"`, no history row added for it, owner absent from return; orphans still flip. |
| 3 | Idempotence | Run the call twice on the same store. Second call returns `[]`; `_recordHistory` call count does not grow on the second pass; statuses unchanged. (Mirrors `performStartupRecovery`'s "second pass reconciles nothing".) |
| 4 | Legacy `running_deploy` | Seed a `running_deploy` task (and only that). After the call: flips to `"interrupted"` with the same history row and return shape. (Guards the backward-compat entry in `ORPHANED_RUNNING_STATUSES`.) |

Implementation notes:

- Keep the fake store minimal: `projectStore.listProjects`, `listTasks`,
  `engineState`, `_recordHistory` (append to `task.history` like the real
  helper), `_saveTaskMarkdown` (vi.fn()). Follow the `makeStore`/`task`
  pattern from `taskScheduler.test.js` but defined locally — do not import
  test helpers across files.
- Assert the history string EXACTLY (`"Stage execution interrupted by server
  restart"`), since that string is the Cause-6 tripwire: prod rows with this
  text re-open the cause, and any other writer of this text is a bug.
- Do not assert fail-safe branches here (covered in `taskScheduler.test.js`
  isolation describes). Do not touch `performStartupRecovery`, plugins, or
  auto-resume — boot orchestration is out of scope.

### Step 2.2 — First run must be GREEN (PIN, not red)

```bash
cd api && npx vitest run flow/scheduler/reconcileInterruptedRuns.boot.test.js
```

If all four cases pass on first run: the PIN is established — proceed to
Phase 3. If ANY case is red: STOP (see §3.5).

---

## Phase 3 — Assure the change (testing + docs plan)

### 3.1 Targeted verification

1. New file standalone: `cd api && npx vitest run
   flow/scheduler/reconcileInterruptedRuns.boot.test.js` — 4/4 pass.
2. Reconcile-adjacent suites (no regressions from the new file — it should be
   inert to others, but prove it):
   ```bash
   npm run test:api -- --run flow/scheduler flow/taskScheduler.test.js taskStore.summaryDurations.test.js singleActiveInvariant.test.js flow/noDeploySpecialBehaviour.guard.test.js
   ```

### 3.2 Full-suite gate (primary verification gate per stage guidance)

```bash
npm run test:unit
```

(`test:unit` = api + frontend suites.) The api suite is the gate that matters
here; run the full unit gate when the time budget allows, otherwise at minimum
the full api suite (`npm run test:api`). Any failure: compare against the
Phase-1.5 baseline. A failure absent from baseline blocks the task; a failure
present at baseline is recorded as pre-existing with output quoted, and the
task still passes (S7 adds no prod code, so it cannot regress behaviour —
but the evidence must be shown, not assumed).

### 3.3 Static checks for the new file

- `npm run lint:api -- --no-warn-ignored` (or at minimum eslint on the new
  file) — clean.
- `check:one-function-per-file` applies to prod modules; test files are
  exempt by convention (cf. existing `*.test.js` with many tests) — no
  action, just don't add prod files.
- Confirm `git status` shows exactly one new file:
  `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js`. Nothing else
  modified.

### 3.4 Documentation plan

No product/docs-site changes (no behaviour change). The implementer writes an
implementation report in this task folder
(`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/`) recording:

1. Reconstruction basis: GUIDE-06/WIDE_NET/TDD docs absent (Step 1.1
   output); spec taken from task text + code; SURVEY.md unanswered → no
   pending decisions.
2. Spec-mapping table: each GUIDE-06 §2 case → test name → code branch/line
   pinned.
3. Evidence: baseline run output (Step 1.5), first-run PIN output (Step 2.2),
   adjacent-suite + full-gate output (§3.1–3.2), lint output.
4. Ops handoff for the deferred PROD check (GUIDE-06 §4, PROD-READ-ONLY,
   needs permission): the exact read-only loop for an operator — search task
   history for rows whose action contains "interrupted by server restart";
   ANY row re-opens Cause 6; this task's implementer does not run it.
5. Fold note: independent task; may be folded into S1/S6 at review but must
   never be skipped — the report states the file path so review can verify
   inclusion either way.

### 3.5 If the PIN is red on first run (deviation procedure)

A red PIN means behaviour drifted from the ruled-out Cause-6 baseline — this
is a finding, not a fix-it-in-passing moment:

1. Do NOT edit prod code to make the test pass.
2. Do NOT weaken the test to match drifted behaviour.
3. Capture the failing assertion + actual values, `git status`/`git diff` to
   prove the tree is otherwise clean, and the baseline output from Step 1.5.
4. Report back (implementation report + stage verdict FAIL with reason/fix
   lines) so Cause 6 can be re-opened deliberately.

---

## Phase 4 — Definition of done (acceptance checklist)

- [ ] `api/flow/scheduler/reconcileInterruptedRuns.boot.test.js` exists and
      contains the four GUIDE-06 §2 cases (§2.1 table), self-contained.
- [ ] New file passes standalone on first unmodified run (PIN evidence).
- [ ] Adjacent reconcile suites + guard test green (§3.1).
- [ ] Full `npm run test:unit` (or at minimum full api suite) green, or any
      red shown to be pre-existing via baseline comparison (§3.2).
- [ ] Lint clean on the new file; `git status` shows exactly one new file (§3.3).
- [ ] Implementation report in the task docs folder with spec mapping,
      evidence, and the deferred-PROD-check ops handoff (§3.4).
- [ ] Zero prod-code modifications; zero existing-test modifications.

## Appendix — Key references

- Pin target: `api/flow/scheduler/reconcileInterruptedRuns.js`
- Orphan set: `api/flow/scheduler/orphanedRunningStatuses.js`
- Boot caller: `performStartupRecovery` in `api/flow/startupRecovery.js`
- Existing coverage: `api/flow/taskScheduler.test.js`,
  `api/taskStore.summaryDurations.test.js`,
  `api/flow/singleActiveInvariant.test.js`,
  `api/flow/scheduler/schedulerPure.test.js`
- Convention example: `api/flow/scheduler/isSchedulerRunnable.test.js`
- Task survey: `docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/SURVEY.md`
  (unanswered meta-question; no behaviour decisions pending)
- Cited-but-absent research: `docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
  (RESPONSE.md S7, GUIDE-06, WIDE_NET Cause 6, TDD-TEST-EXAMPLES.md,
  RESPONSE_SURVEY.md) — verified missing; nearest existing research
  (`docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/`) covers an unrelated bug.
