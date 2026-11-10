# Root cause — Survey results are not being saved

Task: `fbcaef1d-4b97-4fcd-8a50-f32d903c7185`
Date: 2026-11-04
Plan ref: `IMPLEMENTATION_PLAN.md` Phase 2 (branches A–E) + two confirmed
variants below. SURVEY.md q1–q5 were still unanswered (`"answers": {}`) at
implementation time, so diagnosis proceeded on the plan's §4 defaults.

## Confirmed primary cause — stale Runner shipments wiped backend answers

Family: Branch B (file mismatch), new variant B2: the Runner/backend
write path disagreed about file contents across time.

Mechanism, each link verified:

1. The human saves/submits answers via `POST /tasks/:id/survey`, which writes
   only the backend checkout's survey file. The backend never commits survey
   saves to git (no git calls in `api/work/taskSurvey.js` /
   `api/work/taskWorkRoutes.js`).
2. Every later Runner stage ships its whole worktree task folder back via
   `collectTaskFiles` (`runner/daemon.js`) — including `SURVEY.md` — whether
   the agent touched it or not.
3. `syncTaskDocs` (`runner/project.js`), which should overlay the backend's
   current files onto the worktree first, silently no-ops whenever the
   backend path is unreachable — always the case for remote Runners. Proven:
   `server2-alpha` runs on 192.168.1.172 while its backend is 192.168.1.206.
   The worktree therefore carries the git-committed (blank) survey.
4. `materializeRunnerTaskDocs` (`api/flow/execution/`) overwrote the backend
   file with the shipped bytes unconditionally — answers lost, blank template
   left behind. Downstream stages then read the blank file.

Forensic match: tasks `a654a254`, `b15f4ec4`, `a3753643` each show
`Survey requested … (unanswered)` → `Survey completed (answered) — advancing`
in `task.md`, yet their `SURVEY.md` files hold `"answers": {}` — submitted
answers vanished afterwards. Mixed outcomes (8 answered / 13 blank) follow
Runner placement: stages after the submit that ran on the backend-local
Runner kept answers (sync works there); remote-Runner stages wiped them.

This also explains why the save path itself always tested green: saving
worked — the answers were destroyed afterwards.

Fix: survey-aware merge on materialize (`mergeSurveyDocuments` in
`shared/survey.js`, wired into `materializeRunnerTaskDocs`). Incoming Runner
rounds/questions land; backend answers win per question id; backend-only
rounds are re-appended; an invalid merge keeps the backend copy. Backend-only
change — effective immediately for old and new Runners, no fleet rollout.

## Confirmed secondary cause — prompt/backend filename mismatch (aliases)

Family: Branch B. `{{outputFile}}` prompt templating ignored the alias keys
(`surveyFile`, `file`, …) and fail-safe normalization the backend reader
honors. Demonstrated by execution: stage config `{ file: 'FEEDBACK.md' }`
told the agent to write `SURVEY.md` while the backend read `FEEDBACK.md` —
the survey is created (blank, in `SURVEY.md`) but never filled in, and the
task parks on `no-survey` until a human skips it. Same for extension-less
(`FEEDBACK` vs `FEEDBACK.md`), `{ value }`-wrapped, and non-string values.

Fix: `resolveSkillKeywordMap` (`api/skills/skillInjection.js`) resolves the
question-me `outputFile` through the exact backend function, at both call
sites (skill-body injection and stage custom keywords). Canonical configs
resolve identically to before (no-op); only previously-mismatched configs
change. The filename rule moved to `shared/survey.js` (single source;
`api/work/taskSurvey.js` re-exports, all importers untouched).

Known limitation (left as-is): stage-TOP-level file keys (sibling of the
`skills` array) are honored by the backend reader as an undocumented side
effect of its polymorphic input, but the prompt only reflects documented
attachment-level config. Follow-up: document or remove stage-level support.

## Killed branches (evidence)

- A (UI state reset): canary `survey-verify` proves post-save selections
  persist and the file is written; new `SurveyPage` unit tests pin
  save/error/hydration rendering. One real gap found and fixed: a save
  response without `rounds` blanked the questions — `refreshFrom` now keeps
  the last rounds, and the notice carries a save timestamp.
- B as GET-vs-POST: both use `surveyOutputFileForRequest` identically
  (route tests pin same-file round-trip incl. `outputFile` override).
- C (validation rejects UI payloads): storage repro passes all UI shapes
  (multi, notes-only, untouched-omitted, unknown ids reported); all 21 real
  `SURVEY.md` files validate clean.
- D (fence splice): round-trips CRLF/prose files; characterization tests added.
- E (parse errors → empty form): all real files parse with zero errors.

## Other hardening in this change

- Save rejects now carry a machine-readable `code` (`SURVEY_INVALID` /
  `SURVEY_NOT_FOUND`) and log a server-side warning with task id + code.
- `site-docs/surveys.md` troubleshooting section; `api-reference.md` error
  contract; CHANGELOG entry.

## Follow-ups (not done)

- Runner-side: ship only worktree files the run actually changed (would fix
  the whole stale-shipment class for non-survey files too; needs fleet
  rollout, so the backend merge stays as the backstop either way).
- `collectTaskFiles`/`syncTaskDocs` hardcode `docs/` instead of honoring a
  custom `docsDirName` — remote transfer silently misses task docs on such
  projects (found by reading; no production case confirmed).
- Backend never commits human survey answers to git — git history of survey
  files only reflects Runner worktree states.
