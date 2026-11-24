# Implementation Plan — Failed-stage report commit recovery under HEAD contention

Task: `7f347a7a-0bfd-4a37-9500-a34eb5ee3219`
Problem: in default shared-checkout workspace mode, a concurrent task can move
HEAD while another task's stage runs. The branch-affinity guard in
`api/git/commit.js` then correctly refuses the failed-stage auto-commit, but
`commitFailedStageWork` (`api/work/taskFinalize.js`) turns that refusal into a
warn-only skip whose advice ("re-run the stage so it can re-establish its
branch") never applies — a failed stage has no re-run coming. Failure-report
commits are silently dropped (branch/report drift).
Case study: task `cf4b6847-11eb-4d59-b39e-e31b31df1150`, `automated test 2` on
2026-11-20 ("expected 'kb/cf4b6847-…' but the working tree is on
'kb/1cae113f-…'").

## 0. Inputs and constraints this plan respects

### 0.1 Survey (SURVEY.md) — unanswered, recommendations adopted as defaults

All three survey rounds have empty `answers: {}`. The plan follows the
Recommended option on each question, flagged for confirmation before
implementation:

| Q | Recommended default adopted | Effect on plan |
|---|---|---|
| q1 recovery shape | Checkout-and-retry once | Phase 2 implements retry-once; the per-checkout lock is Phase 3 (stretch) |
| q2 unrecoverable outcome | Clear, actionable error (not quiet skip) | New error-severity history entry with remediation steps |
| q3 scope | Failed-stage reports only | Success-path auto-commit untouched; no shared-helper behaviour change for other callers |
| q4 short wait acceptable | Yes (conditional on lock) | Lock phase may introduce brief waits; still bounded and observable |
| q5 error surface | Task history log as error entry | History entry + process-log `[ERROR]` line; no new UI banner in this change |
| q6 old report | Future-only, no backfill | No recovery of the 2026-11-20 dropped commit |
| q7 priority | Never cross-commit beats never-lose-report | Every recovery step fails closed; dirty/ambiguous tree ⇒ error, never commit |
| q8 retry success note | Short history note | Successful retry records a one-line history entry |

If the user later answers the survey differently, only Phase 2/3 scoping
changes; Phase 1 (research + make-change-easy) is unaffected.

### 0.2 Hard invariants (never negotiable)

1. No commit ever lands on a sibling task's branch (acceptance 2, survey q7).
2. The `expectedBranch` guard in `api/git/commit.js` is never weakened,
   bypassed, or defaulted off for the failed-stage path.
3. `commitFailedStageWork` keeps its contract: never throws, never blocks
   failure routing (`api/flow/execution/routeStageError.js`,
   `api/flow/commandStages.js`).

## 1. Research first (biggest unknowns earliest)

### Step 1 — Reproduce the race on a real repository (spike, ~0.5 day)

- Goal: a deterministic repro of the case-study shape before designing the fix.
- Method: throwaway script under `/tmp` (not committed): init repo, create two
  task branches `kb/A` and `kb/B`, check out `kb/A`, dirty the tree with a fake
  report, move HEAD to `kb/B` (simulating the sibling), call
  `commitFailedStageWork` for task A, assert today's behaviour (returns null,
  history holds `Warning: failed-stage auto-commit … skipped (Refusing to
  commit on the wrong branch …)`).
- Exit criteria: repro script prints the exact case-study warning; it becomes
  the template for the regression test in Step 8.

### Step 2 — Map every HEAD-moving operation on the shared checkout

- Goal: know the full contention surface so the retry and (optional) lock cover
  the real movers, not just the guessed one.
- Enumerate callers of `checkoutBranch`, `ensureBranchCheckedOut`,
  `returnToDefaultBranch`, `withCheckedOutBranch` (`api/git/branch.js`), the
  merge stage, `syncMainToRemoteBestEffort`, task creation/approval paths, and
  anything that shells out to `git checkout/switch` outside `api/git/`.
- Record for each: which task/branch it acts for, whether it runs on the shared
  checkout or a worktree (`workspaceIsolation: 'worktree'` bypasses this bug),
  and whether it can interleave with a stage's checkout→commit window.
- Key known fact to verify: `withRepoGitLock` (`api/work/gitLock.js`) is taken
  inside `git()` (`api/git/exec.js`) per single git process — it serializes
  individual commands, not multi-step checkout→work→commit sequences. Confirm
  no higher-level sequence lock already exists; this finding decides how
  Phase 3 is scoped.
- Exit criteria: a table (mover → checkout → interleavable?) in the
  implementation notes; shared-checkout-only movers identified.

### Step 3 — Decide retry-vs-lock sequencing (design decision, needs Step 2)

- Default (survey q1): implement retry-once first (Phase 2), keep the
  sequence lock as a stretch goal (Phase 3).
- Revisit only if Step 2 shows the retry window itself is too racy (e.g. HEAD
  flapping faster than checkout+commit). Document the decision and why.
- Exit criteria: one-paragraph decision record referencing Step 2 evidence.

## 2. Make the change easy (preparatory refactoring, no behaviour change)

### Step 4 — Extract the branch-affinity check into one helper

- Today the guard is duplicated in `commitAllIfNeeded` and
  `commitEngineSnapshots` (`api/git/commit.js` ~L134, ~L346), including the
  misleading "re-run the stage" advice string.
- Extract `assertBranchAffinity(projectCwd, expectedBranch)` (throws
  `GitBranchMismatchError`, fail-closed on unreadable HEAD) and call it from
  both sites. Keep messages byte-identical in this step.
- Why first: the retry path in Step 6 needs to distinguish "mismatch" from
  other commit errors reliably (`instanceof GitBranchMismatchError` already
  exists — verify it survives the `commitAllIfNeeded` throw path and add a unit
  test if not).
- Exit criteria: `npm run test:api` green; no caller-visible change.

### Step 5 — Add a contention-test harness helper

- Add a test-only helper (alongside `api/work/taskFinalize.test.js` fixtures)
  that sets up a two-branch repo and moves HEAD mid-flight, reusing the Step 1
  repro. Cover both exec-cwd shapes: shared checkout and isolated worktree
  (worktree path must be unaffected by the fix).
- Exit criteria: helper used by at least one failing-then-passing test in
  Step 8; worktree-mode test proves no behaviour change there.

## 3. Make the change (the fix itself)

### Step 6 — Retry-once recovery in `commitFailedStageWork`

Scope: `api/work/taskFinalize.js`, `commitFailedStageWork` catch block
(~L537–549) only. Success-path auto-commit (~L273–314) is untouched (survey q3).

New logic on `GitBranchMismatchError` only (all other errors keep today's
warn-and-null path):

1. Re-read state: `currentBranch(execCwd)` and full `getWorkingTreeStatus`.
2. Fail closed, in order, each producing the Step 7 actionable error entry
   (never a commit, never a retry):
   - owning branch no longer exists (`branchExists` false);
   - tree holds dirt that is not provably this task's failed-stage output
     (conservative rule: any dirty path outside this task's report/asset
     paths ⇒ fail closed — sibling's work may be present);
   - already on the owning branch on re-read (mismatch was transient and HEAD
     moved back — do NOT auto-retry blindly; record the error so the race is
     visible rather than papering over flapping HEAD).
3. Otherwise (clean-of-foreign-work tree, owning branch exists, HEAD still on
   the sibling): `ensureBranchCheckedOut(execCwd, branch, { recovery: "off",
   allowCreate: false, project })` — strict guard, never create, never stash.
   `recovery: "off"` mirrors the finalize return-to-base call: a dirty tree at
   this point means something changed under us, so refuse loudly.
4. Retry `commitAllIfNeeded` with the identical subject/opts exactly once.
5. On retry success: keep the existing success history entry and add the
   survey-q8 note, e.g. `Note: HEAD had moved to '<sibling>' (concurrent
   task); re-established '<branch>' and committed on retry`.
6. On retry failure (any error, including a second mismatch): Step 7 error
   entry. Exactly one retry — no loops, no backoff.

### Step 7 — Actionable error entry when recovery is impossible (survey q2/q5)

Replace the quiet skip for the failed-stage path with an error-severity
history entry plus a process-log `[ERROR]` line, e.g.:

> `Error: failed-stage report for '<stage>' could NOT be committed — HEAD is
> on sibling branch '<actual>' (concurrent task moved it) and the tree holds
> uncommitted work, so an automatic checkout would risk mixing branches.
> Action: run 'git status' on the shared checkout; commit or set aside the
> foreign changes; then re-run or manually commit the report file(s)
> <paths> onto '<expected>'. No commit was made on any branch.`

Requirements: names the expected branch, the actual branch, the uncommitted
report paths, and the manual remediation; states explicitly that nothing was
committed (acceptance 1's "surfaced as an actionable error" half).

## 4. Stretch goal — serialize HEAD-moving operations (Phase 3, survey q1/q4)

Only after Phase 2 lands and passes acceptance. Do not bundle with Phase 2.

- Design a sequence-level gate for shared-checkout HEAD movers (Step 2 table):
  the natural shape is a higher-level `withRepoHeadLock` held across
  checkout→commit sequences, with `git()`'s per-command mutex left as the
  inner gate. Constraint: `withRepoGitLock` is explicitly non-reentrant, so
  the new gate must be a separate mutex layer, never a nested take of the
  same gate.
- Bound waits (survey q4 allows short waits): timeout + contention counters
  in the style of `getGitLockStats`, surfaced in observability.
- Risk: deadlock and throughput regression across all git callers — needs its
  own plan addendum, load test, and rollback switch before implementation.
- Exit criteria: Step 2's interleaving repro becomes impossible (HEAD cannot
  move mid-sequence); retry path retained as defence-in-depth.

## 5. Test plan (proves the acceptance criteria)

Primary gate: `npm run test:unit` (plus `npm run test:api` for fast
iteration). New tests live with existing suites — no new harness.

| # | Test | Type / location | Proves |
|---|---|---|---|
| T1 | Sibling moved HEAD, tree holds only own report dirt ⇒ retry commits on owning branch; history has q8 note | integration, `api/work/taskFinalize.test.js` (Step 5 harness) | Acceptance 1, happy path |
| T2 | Sibling moved HEAD, tree holds foreign dirt ⇒ null return, error entry names branches + remediation; `git log` on both branches unchanged | integration, same file | Acceptance 1 error half; fail-closed |
| T3 | Owning branch deleted mid-flight ⇒ error entry, no commit anywhere | integration, same file | Fail-closed |
| T4 | Retry itself hits mismatch again ⇒ single retry only (assert via call count or second mismatch), error entry | unit (mocked `commitAllIfNeeded`) | Exactly-once retry |
| T5 | Non-mismatch commit error (e.g. hook failure) ⇒ today's warn-and-null path unchanged | unit | No regression for other errors |
| T6 | Worktree isolation mode with HEAD moved on primary ⇒ unaffected (commits in worktree as before) | integration | No scope creep |
| T7 | Success-path auto-commit with mismatch ⇒ unchanged warn-only skip | existing tests still green | Survey q3 scope guard |
| T8 | Cross-commit invariant: across T1–T5, sibling branch tip SHA never changes | assertion inside each test | Acceptance 2 |
| T9 | `assertBranchAffinity` unit tests: match, mismatch, unreadable HEAD fails closed, permissive when unset | unit, `api/git/commit.test.js` | Step 4 refactor safety |

Also: run the Step 1 repro script after the fix to confirm the warning is gone
on the recoverable path and replaced by the Step 7 error on the unrecoverable
path; run lint (`npm run test:api` includes it per repo config — verify) and
the full `npm run test:unit` before handoff.

## 6. Documentation plan

1. Update the `MARK` doc comments on `commitFailedStageWork`,
   `commitAllIfNeeded`, and `GitBranchMismatchError` to describe the retry and
   the new error semantics (including that the "re-run the stage" advice no
   longer appears on the failed-stage path).
2. Add a short operator runbook section (repo docs, near git/troubleshooting
   docs): what the Step 7 error means and the exact manual recovery commands.
3. Record the Step 3 retry-vs-lock decision and the Step 2 mover table in this
   task's docs folder for the Phase 3 implementer.
4. No user-facing changelog unless the repo convention requires one for engine
   behaviour changes — check and follow it.

## 7. Verification checklist (definition of done)

- [ ] Step 1 repro demonstrates the bug before, and the fix after, the change.
- [ ] T1–T9 green; full `npm run test:unit` green in this session (observed,
      not copied from a prior run).
- [ ] Acceptance 1: failed-stage report lands on the owning branch under HEAD
      contention (T1), or an actionable error is recorded (T2–T4).
- [ ] Acceptance 2: sibling branch tip untouched in every test (T8).
- [ ] Guard intact: `expectedBranch` still fail-closed; no new bypass flag.
- [ ] `commitFailedStageWork` still never throws / never blocks routing
      (callers in `routeStageError.js`, `commandStages.js` unchanged).
- [ ] Docs (§6) written; survey-default deviations (if any) noted.
- [ ] Phase 3 explicitly left as stretch with its own exit criteria.

## 8. Risks and mitigations

- Flapping HEAD defeats a single retry ⇒ accepted by design (error entry
  preserves visibility); Phase 3 addresses the root race.
- Misclassifying foreign dirt as own ⇒ conservative rule (Step 6.2) fails
  closed; T2 pins it.
- `ensureBranchCheckedOut` side effects (snapshot commits, move-aside) ⇒ use
  `recovery: "off"`, `allowCreate: false`; verify no snapshot commit can land
  on the sibling branch during the re-checkout (it commits before switching —
  confirm which branch that commit lands on during Step 2, and if it can hit
  the sibling, use a stricter checkout path).
- Non-reentrancy: never take `withRepoGitLock` around `git()` calls in Phase 2
  (all git access stays inside existing helpers).
