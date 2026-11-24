# Stage review — S6 misleading resume label + Tried-N inflation (PR-review stage)

Task: `79c51992-ab52-4f97-b35e-5a2aa605505d`. Branch: `kb/79c51992-ab52-4f97-b35e-5a2aa605505d`.
Reviewer stance: assumed broken, looked for proof it works. Read-only review of the
diff vs `origin/main` (`git diff --stat`: 28 files); no production code changed here.

## Verdict: PASS — suitable to integrate

## Goal achievement (brief §Change, all three items)

1. Backend distinct labels — DONE. `api/flow/scheduler/resolveResumeLabel.js`
   returns the unchanged restart string with no marker and
   `Auto-resumed after runner interrupt — prioritised in queue (runner {id}, reason: {reason})`
   with the marker; `autoResumeTask.js` uses it for both history and the default
   timeline reason. Survey q1 (two labels) matches what shipped.
2. Frontend count split — DONE. `summarizeStageRuns` partitions groups via
   `isInfraResumeRow` into `tryCount` (real tries only) + `resumeCount`;
   `formatTryCount` renders `Tried {n} times[, {m} infra resume(s)]`, resume-only,
   and null forms. Survey q2 (show-both) matches. Both consumers
   (`TaskHistoryTab.jsx`, `TaskDetailHistoryPane.jsx`) render the string verbatim —
   verified, no consumer change needed.
3. Pins updated as explicit contract change — DONE. `taskScheduler.test.js`
   (exact restart string + new runner case), both recovery integration tests
   (restart route + route comments), `taskFormatters.test.js` (9 new + trap pin).

## Plan compliance

Followed `IMPLEMENTATION_PLAN.md`, including the Phase-1 recommended option (stamp
`interruptedBy`, since the brief's "existing" marker did not exist). Two deliberate,
documented deviations, both improvements: (a) the marker is consumed (`delete`) on
every path out of `interrupted` instead of the plan's leave-it-read-only — prevents
stale-runner mislabels, pinned by test; (b) new `cleanSingleLineText.js` helper
instead of reusing the inline trim+slice — shared by stamp + label sites, blocks
history-line forgery via embedded newlines, tested. Neither adds scope beyond the
brief's "include runner id + reason" requirement.

## Evidence observed this session (not copied from reports)

- Backend S6 tests: 5 files, 274 passed
  (`autoResumeLabel`, `taskScheduler`, `cleanSingleLineText`, `taskPersistence`,
  `executionLedger`).
- Frontend: `taskFormatters.test.js`, 123 passed.
- `check-one-function-per-file`: PASS (886 scanned). `check-jsdoc-example`: PASS.
- Grep: no runtime parser branches on either history string (only the helper +
  tests/docs); old rows byte-identical (pinned test); `Resumed` still a visit
  outcome for live-row suppression (trap pin green).
- Stamp coverage: every `interruptExecution` path that flips to `interrupted`
  stamps the marker (early returns all throw before the flip); terminal/stale/
  fence rejects never produce a resume. Capacity-refusal interrupts also stamp —
  correctly labelled runner-path with their refusal reason.

## Standards / maintainability / debt / docs

- Standards: agree with `CODE-STANDARDS-REVIEW.md` (PASS). One nit, non-blocking:
  `executionLedger.js interruptExecution` shadows `cleanReason` (outer trim+slice
  for the capacity check, inner `cleanSingleLineText`) — legal block scoping,
  lint-clean, but confusing on first read; a rename would help a future touch.
- Maintainability: wording isolated in one helper's constants; classifier is one
  predicate; deletes are explicit per-site, no abstraction.
- Debt: none added. Residual limitation (out of scope, not a fail): a runner death
  that orphans `running_*` WITHOUT calling `interruptExecution` still reconciles
  via `reconcileInterruptedRuns` ("interrupted by server restart") and resumes with
  the restart string. The brief defines the discriminator as the marker, so this is
  the specified behaviour, but it means the restart string can still appear without
  a server restart on that rarer path. Candidate follow-up, not a blocker.
- Docs: both runbooks updated with both strings + route mapping; JSDoc + `@example`
  + `MARK` on all new/changed exports; implementation report §§1–7 complete.

## Why no UI screenshot

The user-visible change is a badge/history string fully pinned by unit tests asserting
exact rendered strings. Rendering it in the live app would require seeding app state
against live operations for no additional signal, so headless unit verification was
used instead.
