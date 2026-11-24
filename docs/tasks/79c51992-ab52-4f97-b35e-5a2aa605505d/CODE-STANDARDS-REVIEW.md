# Code Standards Review — S6 branch vs origin/main

Task: `79c51992-ab52-4f97-b35e-5a2aa605505d`. Scope: review the changes on
branch `kb/79c51992-ab52-4f97-b35e-5a2aa605505d` as compared to
`origin/main` (`git diff --stat origin/main...HEAD`: 27 files, 1763
insertions, 24 deletions) against `docs/KB Code Standards.md`. Read-only
review; no source code was changed. Test gates re-run this session to
confirm the reviewed tree is green.

## Verdict: PASS — compliant, no blocking violations

Every KB Code Standards principle is satisfied by the S6 change set as
built. The two places that look like deviations on a strict reading
(positional object params, flat scheduler folder) follow the codebase's
actual sibling conventions and are documented below as passes, not
violations. Gates observed green on this tree: `npm run test:api`
(477 files, 7725 passed, 3 skipped), `npm run test:frontend`
(364 files, 4988 passed), `npm run check:one-function` PASS (886 scanned),
`npm run check:jsdoc-example` PASS, `npx eslint` on the five touched
production files 0 errors (5 warnings all pre-existing on untouched lines).

## User understandable over technical language — PASS

- Descriptive long names throughout: `resolveResumeLabel`,
  `cleanSingleLineText`, `isInfraResumeRow`, `resumeCount`, `realTries`,
  `SERVER_RESTART_LABEL` / `RUNNER_INTERRUPT_LABEL`,
  `cleanRunnerId` / `cleanReason` / `cleanExecutionId`. Short names
  (`marker`, `cap`) are local and self-evident.
- Common language profile held: tasks are tasks, stages are stages, one
  `resumeCount` name used everywhere (plan §4.2 alternative
  `infraResumeCount` was considered and a single name was picked and
  documented). Backend vocabulary ("runner interrupt" vs "server
  restart") matches the existing interrupt-history wording.
- The user-facing `"Tried 2 times, 4 infra resumes"` uses the word
  "infra", which is the brief's exact requested string and survey
  Recommended default (q2 show-both), documented in both runbooks
  (`docs/resume-stall-recovery-runbook.md`,
  `docs/queue-scheduler-idle.md`) as "re-parks, not attempts". It is the
  one slightly technical word in the change; it ships as specified and
  the semantics are defined where users see the string, so this is a
  note, not a failure.
- No "factory" / "barrel" or other technical-language markers anywhere in
  the new code (grep clean).
- File structure reflects the call stack: `resolveResumeLabel.js` sits in
  `api/flow/scheduler/` next to its sole caller `autoResumeTask.js`;
  `cleanSingleLineText.js` sits in `api/flow/`, the lowest common folder
  of its two callers (`executionLedger.js` and `scheduler/`), exactly as
  the "helpers at the lowest common folder" rule requires.
- Every new export carries a pure-English JSDoc block with why-not-just-what
  rationale (history one-line-per-entry format and forgery risk for
  `cleanSingleLineText`; stale-marker contract for `resolveResumeLabel`;
  re-park-not-attempt rationale for `summarizeStageRuns`/`isInfraResumeRow`).
- Labelled input pattern is used where it exists in the siblings:
  `cleanSingleLineText({ text, maxLength })` and every call site picks
  fields before invoking, e.g.
  `cleanSingleLineText({ text: marker.runnerId })`. The two predicates
  taking a whole row (`resolveResumeLabel(task)`,
  `isInfraResumeRow(entry)`) use a positional object param — the same
  shape as every sibling (`formatTryCount(entry)`,
  `summarizeStageRuns(entries, stages)`,
  `autoResumeTask(store, projectId, taskId, ...)`). Forcing
  destructuring there would diverge from the surrounding code; consistency
  wins, so this is compliant.
- No design-pattern names mentioned anywhere in the diff (grep clean).
- Every new export has `@example` tags that execute under
  `check:jsdoc-example`: `resolveResumeLabel` (2 examples),
  `cleanSingleLineText` (4), `isInfraResumeRow` (4), plus updated
  `summarizeStageRuns` / `formatTryCount` examples including the new
  `resumeCount` forms.
- Every new export carries a `MARK:` label in the same JSDoc block
  directly above the export (`resolveResumeLabel`,
  `cleanSingleLineText`, `isInfraResumeRow`) — verified by grep and by
  `check:jsdoc-example` PASS.

## Functional over object oriented — PASS

- No new classes, no currying, no design-pattern machinery. The only class
  touched (`ExecutionLedger`) is pre-existing; the change adds a stamp and
  a clear alongside existing state.
- New helpers are black-box pure: `resolveResumeLabel` is read-only over
  the task (returns a string, mutates nothing — verified by its tests);
  `cleanSingleLineText` returns a string for every input including null;
  `isInfraResumeRow` returns a boolean. `summarizeStageRuns` stays a
  display-only projection on copies (`delete row.tryCount` operates on
  the copy, never the input).
- The `delete task.interruptedBy` sites (4: `autoResumeTask`,
  `resumeTask`, `retryStage`, `abortTask`, plus completion-clear) mutate
  task state, but always as a documented state transition — "the
  interruption ends with this flip" — each with its own why-comment
  naming the route the task leaves. That is state in a clearly defined
  place moving one step, not smeared state.
- Every function is named with a verb (`resolve`, `clean`, `is`,
  `summarize`, `format`). Minimum-data rule holds: callers pick off the
  single field each cleaner needs before invoking.
- Single responsibility: one function picks the label, one cleans one
  line, one classifies one row. Nothing does two jobs.

## Co-location over abstraction — PASS

- Unit tests sit next to their file: `api/flow/cleanSingleLineText.test.js`,
  `api/flow/scheduler/autoResumeLabel.test.js` (covers its sibling
  `resolveResumeLabel` seam and the `autoResumeTask` integration),
  and frontend cases extended inside the existing
  `frontend/src/components/tasks/taskFormatters.test.js`.
- The standard's `funA`/`funB.js` subfolder ideal is not used, deliberately
  and correctly: the whole `api/flow/scheduler/` folder is 60+ flat
  one-function files and `check:one-function` enforces that layout, so a
  flat sibling for `autoResumeTask` is the codebase-conformant placement.
- `taskFormatters.js` is a pre-existing multi-function file (20+ exports,
  grandfathered — `check:one-function` PASS at 886 scanned / 281
  grandfathered). Keeping the sole-use predicate `isInfraResumeRow` in the
  same file as its only caller is the co-location-correct choice, not a
  violation.
- Helper creation is justified by use, not single-line abstraction:
  `cleanSingleLineText` is used by two files and carries non-trivial logic
  (whitespace-run collapse + cap + trim-after-cut); `resolveResumeLabel`
  is the plan's Phase-1 test seam for the label contract.
- "Don't fear repetition" is honoured in the clear sites: each
  `delete task.interruptedBy` is written out inline with its own comment
  instead of being abstracted into a consume-helper.
- Searchability is good: `interruptedBy`, `resolveResumeLabel`,
  `resumeCount` are greppable across code, tests, and runbooks.

## Tested over trusted — PASS

- Tests were planned first (IMPLEMENTATION_PLAN Phase 2 pin-then-red) and
  the red-before-green run is recorded in the implementation report §5
  (1 failed / 8 passed backend, 8 failed frontend, all green after).
- Fail-safe behaviour is assumed-nowhere: `resolveResumeLabel` falls back
  to the restart string on null/missing/malformed/string marker and never
  renders "undefined"; `cleanSingleLineText` returns `""` on non-string,
  blank, and bad-cap input; `formatTryCount` floors before the threshold
  (no "Tried 1 times" nonsense, pinned) and clamps at the cap;
  `isInfraResumeRow` returns false on null/undefined. Each failure mode
  has an explicit test.
- New contract is stated explicitly in the updated pins the brief named:
  `taskScheduler.test.js` restart case now asserts the exact restart
  string and a separate runner-route case asserts the runner string with
  id + reason; `stallRecovery` / `startupRecovery` integration cases keep
  asserting the restart string with a comment naming the genuine-restart
  route; frontend `summarizeStageRuns` cases assert `tryCount`/`resumeCount`
  partitions, caps, case/whitespace-insensitive Resumed matching, and
  stale-count dropping; the `buildDisplayTimeline` suppression trap is
  pinned with a `resumeCount` assertion so `Resumed` stays a visit outcome.
- Integration coverage goes across the real seam
  (`interruptExecution` → `autoResumeTask`) rather than mocking the
  marker, and persistence non-storage is pinned in
  `api/work/taskPersistence.test.js` (marker dropped on the task.md
  round-trip, history lines byte-identical). Upgrade safety is separately
  reviewed in `UPGRADE-SAFETY-REVIEW.md` (PASS); no parser branches on
  either history string, so old histories are untouched.

## Fast iteration over long planning — PASS

- The work was cut into two independent workstreams (backend label vs
  frontend count) with a Phase-1 discriminator spike before any
  production change, per the plan's checkpoint structure. Nothing in the
  diff blocks iteration: new files have no ordering dependency, the
  `scheduler/index.js` re-export is additive, and the label wording is
  isolated in `resolveResumeLabel` for a one-line change if the absent
  research GUIDE later differs.

## Evidence pointers (repo-relative)

- Backend: `api/flow/scheduler/resolveResumeLabel.js`,
  `api/flow/cleanSingleLineText.js`,
  `api/flow/scheduler/autoResumeTask.js`, `api/flow/executionLedger.js`,
  `api/flow/stageTransitions.js`, `api/flow/taskControl.js`.
- Frontend: `frontend/src/components/tasks/taskFormatters.js`
  (`summarizeStageRuns`, `formatTryCount`, `isInfraResumeRow`).
- Tests: `api/flow/scheduler/autoResumeLabel.test.js`,
  `api/flow/cleanSingleLineText.test.js`,
  `frontend/src/components/tasks/taskFormatters.test.js`,
  `api/flow/taskScheduler.test.js`, `api/work/taskPersistence.test.js`.
- Gates re-observed this session: `npm run test:api` 477/7725 passed,
  `npm run test:frontend` 364/4988 passed, `check:one-function` PASS,
  `check:jsdoc-example` PASS, eslint 0 errors on touched production files.

KAINBAIN_VERDICT: PASS
