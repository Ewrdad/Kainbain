# S6 upgrade-safety review — existing installs updating to this change

Task: `79c51992-ab52-4f97-b35e-5a2aa605505d`. Scope: verify the current
implementation (backend resume-label split + frontend try-count split) does
not break existing installs on update. No production code was changed in
this review.

## Verdict: PASS — no break found

Existing task.md files parse and resume identically under the new code;
the only changed surfaces are the two intended display contract changes
from the brief (new runner-route history string, Resumed rows excluded
from `tryCount`). No migration, no schema change, no parser branch on the
old string.

## Evidence

- `interruptedBy` is additive and in-memory only. `saveTaskMarkdown`
  (`api/work/taskPersistence.js:68-114`) writes an explicit frontmatter
  allowlist with no `interruptedBy` key, and `parseTaskMarkdown`
  (`api/work/taskPersistence.js:994-1054`) never reads it — same story as
  the pre-existing `runnerInterruptStage`/`Count` and S1 streak fields.
  Pinned by `api/work/taskPersistence.test.js` ("drops interruptedBy on
  the task.md round-trip").
- Absent marker falls back to the old behaviour. `resolveResumeLabel`
  (`api/flow/scheduler/resolveResumeLabel.js:35-46`) returns the exact
  old string `"Auto-resumed after server restart — prioritised in queue"`
  for null/undefined/missing/malformed markers — verified by node smoke
  (null, undefined, `{}`, no-marker, and string-marker all return the
  restart string). A task interrupted by a runner just before upgrade,
  or interrupted then restarted before resume, therefore resumes with
  the old label (graceful degradation, not a crash).
- Legacy files parse unchanged (live check this session): a hand-written
  old-format task.md (old restart history line + `Reason: socket hangup`
  interrupt line + Resumed timeline rows) parses with the old history
  byte-identical, `interruptedBy` undefined, timeline intact. New runner
  history lines (`… (runner r-7, reason: socket hangup)`) round-trip
  byte-identical — the history parser splits only on the first `": "`
  (`api/work/taskPersistence.js:785-791`), so the embedded `reason:` colon
  is safe.
- No runtime consumer branches on the old string. Repo-wide grep for
  `"Auto-resumed"` hits only the helper, its tests, docs, and one
  unrelated report-regex in `TaskHistoryTab.jsx` (`Stage report generated:`).
  Both `formatTryCount` consumers render the returned string verbatim.
- Frontend normalisation is backward compatible. Legacy display rows
  carry no `resumeCount`; `formatTryCount` (`taskFormatters.js:574-591`)
  still returns `"Tried N times"` for `{tryCount: N}` and `null` for
  single-try rows, with the same cap/fail-safe rules. `summarizeStageRuns`
  for groups without `Resumed` rows computes `tryCount` exactly as before.
  `isInfraResumeRow`/`resolveResumeLabel`/`cleanSingleLineText` never throw
  on null or non-string input.
- Interrupt-line sanitisation preserves normal lines. The switch to
  `cleanSingleLineText` in `interruptExecution` is identity for ordinary
  single-line ids/reasons; it only collapses embedded newlines/tabs and
  caps length (prevents dropped/forged history lines on task.md reload),
  same 500-char budget as before.
- Targeted gates observed green this session: `flow/scheduler/
  autoResumeLabel.test.js`, `work/taskPersistence.test.js`,
  `flow/executionLedger.test.js`, `flow/taskScheduler.test.js` — 270
  tests passed.

## Risks considered, none breaking

- Stale-marker across restart: impossible by construction — the marker is
  never persisted, is deleted by every path out of `interrupted`
  (`autoResumeTask`, `stageTransitions.resumeTask`/`retryStage`,
  `taskControl.abortTask`), overwritten by the next interrupt, and cleared
  on stage completion.
- `resumeCount`/`tryCount` are display-only projections on copies, never
  written to storage, so there is no stored-format migration.
- New files (`resolveResumeLabel.js`, `cleanSingleLineText.js`) have no
  ordering dependency; `scheduler/index.js` re-export is additive.

Existing installs can update in place with no data action.

KAINBAIN_VERDICT: PASS
