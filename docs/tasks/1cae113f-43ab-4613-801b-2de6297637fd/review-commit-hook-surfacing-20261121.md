<!-- KAINBAIN PR-REVIEW REPORT (docs-only stage) -->
# PR Review: Surface runner commit/hook failures in the task UI

**Task:** `1cae113f-43ab-4613-801b-2de6297637fd` · **Branch:** `kb/1cae113f-43ab-4613-801b-2de6297637fd`
**Base:** `8460e4a8` · **Scope:** 59 non-docs files (+7 task-doc files), ~3.8k added lines, all feature-scoped.
**Method:** treated as an experiment — assumed it does not work, hunted for proof at each layer.

## Verdict: suitable to integrate

## Goal 1 — Runner captures structured failure detail: PROVEN

- `runner/project.js` `toRunnerGitError()` classifies every commit/merge failure through the shared
  `parseHookFailure` + `buildGitFailureDetails` contract. `readGitSubcommand` correctly skips `-c`
  pairs, so the incident's recovery commit (`-c user.name=… -c user.email=… commit -m …`) parses as
  `commit` and yields code `git-hook-rejected` with the envelope; hook-less commits keep `git-failed`
  and gain `exitCode` + envelope. `merge --abort` stays plain.
- All commit sites covered: recovery commit (`refreshWorktreeToRemote`, phase `recovery`),
  stage-end `commitAndPush` incl. docs-repo relabel and `integrateUpstream` sync-conflict
  (phase `stage-commit`), merge path (`executeIntegrationAssignment`, phase `merge`), eviction/reap
  paths (loud `logger.error`, still degrade to `WORKTREE_CAP_REACHED`, never crash).
- Direct proof (this session, real module, incident-shaped stderr): kind `hook-rejected`,
  hook `pre-commit`, exit 1, files `[a.png, b.png, c.png]`-equivalent, full hook output preserved,
  concrete re-capture remedy, one-line summary. Real-git incident-replay tests pass:
  `runner/daemon.test.js` "reports a hook-rejected recovery commit as a failed completion instead
  of crashing" (3 corrupt PNGs, `complete-failed`, 0 interrupts, no throw), stage-commit variant,
  merge-commit variant, and the loop-dead test (N failures → N reports, 0 exits, 0 reason-less
  interrupts) plus one-poll-cycle backoff.

## Goal 2 — Backend records the failure (no stale error): PROVEN

- `complete({ outcome: "failed", failureKind: "commit-failed", gitFailure })` is the vehicle.
  Route sanitizes via `sanitizeGitFailure` (redact + caps, malformed → warn-and-drop, never 400);
  `applyRunnerReport` attaches `err.gitDiagnostics` and leads `err.stdout` with hook output, so the
  existing pipeline writes `lastError` (stale reason replaced), timeline `Failed` row, history,
  `[ERROR]` log, `-failure-` report, and `process:exit` with no further changes.
- Classification `logical/commit-failed`, non-retryable → failback (tag beats text heuristics, so a
  hook saying "timed out"/"401" cannot hijack routing); circuit sensors exclude `commit-failed`.
- Crash-loop backstop is stronger than the plan's minimum: `gitFailureStreak` (signature-keyed,
  3 strikes → park), enforced in the single dispatch gate `isSchedulerRunnable` (covers
  `scanClaimableTasks`, `findNextCandidateTask`, `findResumedCandidate`, queue display) plus a
  `409 GIT_FAILURE_PARKED` direct-claim refusal; streak persisted in task markdown, cleared on
  success advance / operator retry / resume / move, preserved across failback walks.
- Tests replay the incident literally (stale `"Cant see settings in the Ui"` replaced; timeline,
  report, `process:exit` carry hook detail) and pin old-runner compat and malformed-payload
  degradation.

## Goal 3 — UI renders commit/hook failures clearly: PROVEN (with one evidence gap)

- `GitFailureDetails.jsx` (title, mono command + exit + phase, affected-files list, remedy,
  capped hook output with Show full output/less) mounts under `FailureMessage` in both
  `TaskDetailPageContent.jsx` and `TaskDetailsTabContent.jsx`; banner heading switches to
  "⚠️ Commit Failed" via the shared `pickFailureBannerTitle`; `TaskCard.jsx` gets a distinct
  "⚠️ Commit Failed" label; timeline rows show the hook file list (`HistoryFailureReason`).
- Shape-gated (`isCommitFailureTask`): backend `merge-conflict`/`sync-blocked` diagnostics keep
  plain-text rendering — pinned by "keeps the generic banner" tests in both views.
- Evidence gap: no pixel screenshot — `capture:screenshot` found nothing served on `:3100`
  (blank capture, removed) and this review spawns no servers per guidance. Substitution: the
  committed render tests drive both banners + card with incident payloads (titles, files, remedy,
  expand/collapse, malformed-degradation, stale-expanded-state reset) and pass. Recommend a
  staging smoke screenshot post-merge (plan Step 30, still open).

## Plan compliance, standards, debt, docs

- Follows `IMPLEMENTATION_PLAN.md` phases, including incident-replay-first, contract-first,
  never-bypass (grep-guard test passes; zero `--no-verify` in `runner/`), and wire-compat rules.
- Code standards: MARK/JSDoc with runnable `@example`s, one-function-per-file gate passes (874
  scanned), `check-jsdoc-example` and `check-doc-links` pass, full CI lint/build/security/binary
  guard/container branches green on this tree. No unrelated edits; no new runner test files, so no
  `run-tests.mjs` registration was needed.
- Tech debt: negligible. Nits (non-blocking): redundant `kind` key in one spread
  (`applyRunnerReport.js`); arrow-const helpers used to satisfy the one-function gate (documented
  in comments). No new status, no systemd change, no schema migration; additive wire field only.
- Docs updated: ADR 0017, runbook section in `docs/git-runner-coordination-spike.md`, CHANGELOG
  entry, pre-commit header pointer, `_PROOF_RULE.md` note. All required by the plan's doc section.
- Human-awareness note (not a fail): survey answers arrived after planning, and the implementation
  deliberately overrides three of them — q1 (parking instead of a new status), q3 (commit/hook/
  merge now, push/auth reserved), q6 (refuses auto `--no-verify` retry on safety grounds). Each
  override is recorded in the plan's Phase-0 note and ADR 0017 with rationale; the stage goal asks
  for surfacing + remediation hints, not auto-bypass. If the survey author insists on q6 auto-
  bypass, that needs an explicit human decision — do not silently implement it.

## Test evidence (this session unless noted)

- Backend touched files: `npx vitest run …` → 17 files / 437 tests pass.
- Frontend touched files: `npx vitest run …` → 10 files / 170 tests pass.
- Runner touched files: `node --test …` → 240/240 pass (includes the earlier CI failure
  `daemon.test.js` merge-commit test — fixed; latest full CI fast-gate green on all 13 branches).
- Canary: CI run 138/140; the 2 failures were `page.goto: Target page, context or browser has
  been closed` in unrelated specs (inspector copy, lifecycle checkpoint) under a 16-min loaded
  run. Re-ran both spec files here: 9/9 pass → environmental flakes, not regressions. Separately,
  canary specs covering failure display, logs, inspector, and visuals all passed in CI.
- Gates: `check-one-function-per-file` PASS, `check-jsdoc-example` PASS, `check-doc-links` PASS.
- Live ops untouched: read-only inspection + isolated unit/headless runs on scratch ports only.
