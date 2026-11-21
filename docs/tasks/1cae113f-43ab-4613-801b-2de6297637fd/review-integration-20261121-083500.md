<!-- KAINBAIN PR-REVIEW REPORT (docs-only stage) -->
# PR Review (integration re-check): Surface runner commit/hook failures in the task UI

**Task:** `1cae113f-43ab-4613-801b-2de6297637fd` · **Branch:** `kb/1cae113f-43ab-4613-801b-2de6297637fd`
**Base:** `8460e4a8` · **Checked-out HEAD:** `ad57578f` · **Main tip at review:** `64e428e6`
**Method:** treated as an experiment — assumed it does not work, hunted for proof at each layer;
re-ran the touched suites on this checkout and dry-ran the merge against current `origin/main`.

## Verdict: NOT suitable to integrate as-is (needs rebase + reconciliation)

The implementation is well-built and fully green on its own base, but it no longer merges —
textually or semantically — with `main`, which has since merged task `db49d6c6`
("Fix runner recovery commits failing on pre-commit hooks and crash-looping",
merge `64e428e6`, 2026-11-21 06:10). That task fixed the same incident area with the
opposite answer to this branch's load-bearing design decision (hook bypass for recovery
commits). The merge stage already failed with conflicts in `runner/daemon.js` and
`runner/project.js`, and I re-confirmed all three conflict regions are still present.
Integrating this branch without reconciliation either breaks a committed test or silently
reverts main's merged fix. Details below.

## What I verified works (proof, this checkout)

- Runner: `node --test runner/project.test.js runner/gitOps.test.js runner/client.test.js` → 75/75 pass;
  `node --test runner/daemon.test.js` → 165/165 pass. Includes the incident replays
  (hook-rejected recovery commit → `complete-failed` with `gitFailure`, 0 interrupts, no throw;
  stage-commit and merge-commit variants; loop-dead test) and the q6 grep-guard test.
- API: `npx vitest run` over the 11 touched files
  (`applyRunnerReport`, `runnerRoutes`, `sanitizeGitFailure`, `recordGitFailureStreak`,
  `isGitFailureParked`, `isSchedulerRunnable`, `stageTransitions`, `taskErrors.taxonomy`,
  `taskPersistence`, `circuitSensors`, `gitFailure.shared`) → 347/347 pass.
- Frontend: `npx vitest run` over the 6 touched files
  (`GitFailureDetails`, `TaskDetailPage`, `TaskDetailsTabContent`, `TaskCard`,
  `failureReason`, `HistoryFailureReason`) → 152/152 pass.
- Code quality on its base: shared `GitFailureDetails` contract in `shared/gitFailure/`
  with caps/redaction, backend reuses the existing failure pipeline (`lastError` /
  timeline / history / `-failure-` report / `process:exit`), additive wire field,
  malformed-payload degradation without 400s, UI callout null-safe with expand/collapse.
  Plan compliance, docs (ADR 0017, runbook section, CHANGELOG, pre-commit header,
  `_PROOF_RULE.md` note), and standards all check out — I concur with the earlier
  `review-commit-hook-surfacing-20261121.md` on every point it makes about the base tree.

## Why it fails integration (all re-confirmed this session)

1. **Textual merge conflicts persist.** `git merge-tree <base> HEAD origin/main` shows
   3 conflict regions: 1 in `runner/daemon.js` (this branch's `assignmentResult` +
   one-poll backoff vs main's try/catch loop containment around `executeAssignment`)
   and 2 in `runner/project.js` (this branch's hook-running recovery commits tagged
   with `withGitFailurePhase(phase: "recovery")` vs main's `commitRecoverySnapshot`
   helper). Five more files changed on both sides but auto-merge.
2. **Semantic collision on hook bypass (the load-bearing decision).**
   Main's `commitRecoverySnapshot` (`runner/project.js:454` on `origin/main`) runs
   `commit --no-verify` for both `kb-recovery/*` snapshot sites (reuse + eviction),
   deliberately, with a warn log and a scope-pinning test. This branch runs hooks on
   those same commits and commits a grep-guard test
   (`runner/project.test.js` "contains no --no-verify in runner production code")
   that scans every non-test `runner/*.js`. After merge: keep main's helper → the
   guard test goes red; keep this branch's side → main's merged fix is reverted and
   the crash path it closed returns in modified form. There is no mechanical
   resolution that is green and correct — it needs a design reconciliation.
3. **The branch's flagship incident path is obsolete on current main.** Under main's
   `--no-verify` recovery snapshots, a recovery commit can no longer be hook-rejected,
   so this branch's `recovery`-phase surfacing, its recovery incident-replay tests,
   and the ADR/runbook passages describing hook-running recovery commits no longer
   match reality. The stage-commit and merge paths (where hooks still run — pinned by
   main's own `gitOps.test.js` scope test) keep full value, as do the shared
   contract, backend plumbing, parking, and UI callout.
4. **Survey drift strengthens the case for reconciliation, not override.** The recorded
   survey answers post-date the plan: q6 selected `--no-verify` retry, q1 a new status,
   q3 all git problems. Main's merged sibling task already implements the scoped form
   of the q6 answer. This branch's documented q6 refusal now contradicts both the
   human survey and merged main behavior; that needs an explicit human decision during
   the rework, not a silent override.

## What the next attempt should do (fix guidance)

1. Rebase the branch onto current `origin/main` (`64e428e6` or later).
2. Resolve the 3 conflict regions by reconciling, not by picking a side:
   keep main's `commitRecoverySnapshot` (`--no-verify` recovery snapshots) and its
   dispatch-loop containment; keep this branch's `assignmentResult` backoff alongside
   the containment (they compose: report-and-return plus loop barrier); keep this
   branch's structured `gitFailure` surfacing for the paths where hooks still run
   (stage-commit, merge) and the interrupt-with-reason improvements.
3. Narrow or replace the `--no-verify` grep-guard test so it pins the reconciled
   policy (bypass allowed only inside `commitRecoverySnapshot` for `kb-recovery/*`;
   forbidden everywhere else, especially stage/merge commits).
4. Retarget or drop the recovery-phase incident-replay tests and update ADR 0017, the
   runbook, and the plan's Decision 5 / q6 note to describe the reconciled behavior;
   confirm the human decision on q6/q1/q3 overrides explicitly.
5. Re-run the full gates (`npm run test:unit`, the runner `node --test` suite, lint,
   doc checks) on the rebased tree and retry the merge stage.

No live operations were touched: read-only inspection plus targeted unit/headless runs.
No UI screenshots were taken — the earlier review already established the render tests
as the pixel-proof substitute, and re-shooting a UI whose recovery-path premise is
under reconciliation would prove the wrong thing.
