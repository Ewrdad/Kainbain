# PR review — failed-stage report commit recovery under HEAD contention

Task `7f347a7a-0bfd-4a37-9500-a34eb5ee3219`. Reviewer ran every check below in this session; nothing is copied from prior runs.

## Verdict: PASS (suitable to integrate)

The change achieves the stated goal, follows the implementation plan, keeps both hard invariants, and is covered by tests that the reviewer executed and watched pass. No blocking issue found. Three non-blocking nits are listed at the end; none needs to gate integration.

## What was reviewed

Branch `kb/7f347a7a-0bfd-4a37-9500-a34eb5ee3219` vs `main` (14 files, +1779/−86):

- `api/git/commit.js` — new exported `assertBranchAffinity` guard, shared by `commitAllIfNeeded` and `commitEngineSnapshots`; guard moved before the no-code erase.
- `api/git/branch.js` — `checkoutBranch` gains `opts.snapshotCommit` (default `true`).
- `api/git/errors.js`, `api/git.js`, `api/git.test.js` — MARK doc, re-export, surface-contract update (63→64).
- `api/work/taskFinalize.js` — `_recoverFailedStageCommitAfterHeadMove` retry-once recovery in `commitFailedStageWork` plus `_failedStageOwnPathPrefixes`, `_isProvablyOwnFailedStagePath`, `_recordTaskHistory`, `_appendProcessLogSafely`, `_formatFailedStageCommitUnrecoverable` helpers.
- Tests: `api/work/taskFinalize.test.js` (T1, T2, T2b, T3, T6, T7 contention harness), `api/work/taskFinalize.headContention.unit.test.js` (T4/T4b/T5 + fail-closed cases), `api/git/commit.test.js` (T9 + guard-ordering).
- Docs: `site-docs/git-head-contention-runbook.md`, `HEAD-CONTENTION-IMPLEMENTATION-NOTES.md`, `IMPLEMENTATION_PLAN.md`, `SURVEY.md`.

## Evidence (observed in this session)

- Targeted suites, all green: `git/commit.test.js` + `work/taskFinalize.headContention.unit.test.js` (41 passed), `work/taskFinalize.test.js` + `git/branch.test.js` (72 passed, incl. T1/T2/T2b/T3/T6/T7), `git.test.js` + `git/branchWorktree.test.js` (92 passed).
- Full `npm run test:api`: 478 files, 7747 passed, 3 skipped, 0 failed.
- `siteDocs` + `docs.apiCoverage`: 45 passed. `check-doc-links.mjs`: clean (76 files). `check-one-function-per-file.mjs`: PASS. `check-jsdoc-example.mjs`: PASS. `eslint` on all touched files: 0 errors, 2 warnings at `taskFinalize.js:217,825`, both in pre-existing code outside this diff's hunks.
- Acceptance 1: T1 (real git, stage name `automated test 2` matching the case study) commits the report on the owning branch with the q8 note; T2/T2b/T3/T4 record an `Error:` history entry + `[ERROR]` log naming both branches, foreign paths, report paths, remediation, and "No commit was made on any branch".
- Acceptance 2: every contention/integration test asserts the sibling tip SHA is unchanged (T8); recovery uses `snapshotCommit: false` so the commit-then-switch backstop cannot land on the sibling, and the retry re-passes the unweakened `expectedBranch` guard.
- Plan compliance: Steps 1–8 implemented as specified, including the §8 risk response (confirmed the backstop can hit the sibling → stricter checkout path). Phase 3 lock correctly left as stretch with exit criteria. Survey answers now exist and match the adopted defaults. Success path untouched (T7 green; `routeStageError.js`/`commandStages.js` not in diff). `commitFailedStageWork` still never throws (recovery returns `{unrecoverable, detail}`; outer catch falls back to the same error formatter). Changelog correctly untouched per `CHANGELOG.md` update discipline (ordinary PRs must not touch it).

## Justified deviation (accepted, not a fail)

Step 4 said "no caller-visible change", but the guard was moved before the no-code erase in `commitAllIfNeeded`. The old order erased a sibling task's in-flight non-doc work on the alien branch and only then refused — data loss on both the failed-stage and success paths (the success path also passes `noCode` + `expectedBranch`). The new order refuses before any tree mutation. Reviewer verified the blast radius is exactly the mismatch+noCode case (all other orders are identical), it is pinned by two new tests, and T7 still passes. This is a bug fix in the spirit of the task, documented in the implementation notes.

## Non-blocking nits (may fix in a follow-up, do not gate)

1. Implementation notes claim "On the unrecoverable path HEAD is never moved at all". True only for pre-switch failures; post-switch unrecoverable outcomes (retry failure, post-verify failures) leave HEAD on the owning branch or wherever a concurrent mover took it. The state is still safe for continuation (same argument as the success path), but the sentence overclaims — suggest rewording to distinguish pre- vs post-switch.
2. The stale "re-run the stage" advice can still leak into the failed-stage error entry embedded inside the retry-failure reason (the second mismatch's message). The entry's own Action line is correct, so this is cosmetic.
3. Clean-tree + HEAD-moved case: recovery moves HEAD to the owning branch, the retry no-ops, and no history note is recorded (note only fires when `committed === true`). Tiny observability gap; harmless.

## Residual risk (accepted by design, Phase 3 motivation)

The recovery itself moves HEAD while a sibling stage may be running, and foreign dirt appearing inside ignored prefixes between the two status reads can leave mixed untracked state (uncommitted — the post-verify prevents the retry from committing it). This is inherent to the shared checkout without a sequence lock and is exactly what the documented Phase 3 (`withRepoHeadLock`) would eliminate. The retry window fails closed in every such case, never wrong-branch committing.
