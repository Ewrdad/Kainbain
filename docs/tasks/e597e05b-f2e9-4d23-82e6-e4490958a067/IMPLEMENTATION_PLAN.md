# IMPLEMENTATION PLAN — Fix the branch-switch bug that stranded two task pipelines

Task: e597e05b-f2e9-4d23-82e6-e4490958a067
Stage: plan (docs-only — this file is the only artifact of this stage)

## 0. Problem recap (mechanism, confirmed against the code)

- The primary checkout sits on a `kb/<task>` branch while OTHER tasks' engine
  snapshots (`docs/tasks/<other-id>/task.md`, stage reports) exist there as
  UNTRACKED files. Once such a task merges, `main` TRACKS those paths, so any
  `git checkout main` (e.g. a `runOnBranch: "primary"` CI stage such as Update
  running `./update.sh` via `withCheckedOutBranch`, or the catchup/default-hop
  in `ensureBranchCheckedOut`) is refused by git's own untracked-overwrite
  safety: `error: The following untracked working tree files would be
  overwritten by checkout: docs/tasks/d1e56caa-.../task.md`.
- The clean-tree guard (`requireCleanWorkingTree`) correctly ignores these
  engine-owned paths, but git itself does not — guard passing does not save the
  switch.
- Failed tasks: 82e49a05-b83f-4233-8d65-263aa0b9314c (runner auto-update, Update
  stage) and 9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7 (runner/model autodetect, In
  Progress + catchup stages) — same error shape in every final-stage report.
- Current state of `api/git/branch.js` (verified by reading the file):
  - `checkoutBranch` ALREADY has the mitigation: `_moveAsideBlockingLiveSnapshots`
    moves engine-owned paths that the TARGET branch tracks but the current index
    does not track into a temp dir across `git checkout`, and
    `restoreMovedAsideSnapshots` puts the newer live content back afterwards.
  - `ensureBranchCheckedOut` still performs RAW `git checkout` calls at five
    sites (branch-exists path, worktree-recovery retry, pinned-base checkout,
    create-then-checkout, race-tolerant re-checkout) WITHOUT the move-aside —
    these are the holes that stranded the two tasks.
  - `returnToDefaultBranch` and `withCheckedOutBranch` both delegate to
    `checkoutBranch`, so they are safe once `checkoutBranch` is — but they must
    be covered by the regression test anyway (acceptance requires every public
    entry point).
- Other raw checkouts found by grep (out of the branch-switch hot path, audited
  in step 2): `api/git/commit.js:508` and `api/git/merge.js:166` are
  path-restore checkouts (`checkout -- <paths>` / `--theirs`), not branch
  switches — leave alone. `runner/project.js:631,660,669` are `-f` checkouts
  inside per-task worktrees — separate blast radius, note only.

## 1. Survey decisions to honor (from SURVEY.md round 2)

- q2: `ensureBranchCheckedOut` must reuse the SAME move-aside wrapper as
  `checkoutBranch` (a shared internal helper, e.g. `checkoutWithSnapshotAside`)
  while keeping its own worktree-lock recovery try/catch and retry logic.
- q3: finish the `untrackLiveTaskSnapshots` migration by wiring it into the
  normal startup/branch-prep path (run when snapshot dirt is present, together
  with the snapshot commit that carries the staged deletion), so `main` stops
  tracking `docs/tasks/<id>/task.md`. The move-aside stays as the safety net.
- q4: regression tests use BOTH a shared real-git fixture AND per-entry-point
  tests; extend `api/git/switchSnapshots.integration.test.js` (existing shared
  real-git fixture) to cover `checkoutBranch`, `ensureBranchCheckedOut`,
  `withCheckedOutBranch`, and `returnToDefaultBranch` in the conflicting state.
- q5: explicitly verify the previously-failed flows in the conflicting state:
  Update stage (`withCheckedOutBranch` on primary running `./update.sh` —
  `api/flow/commandStages.js` ~line 858), catchup/default-hop
  (`ensureBranchCheckedOut(cwd, baseBranch, …)` hop in
  `api/work/taskBranches.js` ~line 530 and final ensure ~line 548), return to
  default after CI (`api/work/taskFinalize.js` ~line 370), and the merge-stage
  switch to main (`api/flow/commandStages.js` ~line 1674 via `checkoutBranch`).

## 2. Step-by-step implementation (research/big pieces first, then "make change easy", then the change)

### Step 1 — Discovery & inventory (do first, before any edit)
1. Re-grep every branch-switch call site and classify each as protected or raw:
   `grep -rn '"checkout"' api/ runner/ scripts/ shared/ --include='*.js'`.
   Expected raw branch switches confined to `api/git/branch.js`
   (`ensureBranchCheckedOut`); everything else routes through `checkoutBranch`.
2. Map every public entry point in `api/git/branch.js` and its callers:
   `checkoutBranch`, `ensureBranchCheckedOut`, `withCheckedOutBranch`,
   `returnToDefaultBranch` (callers: `api/work/taskBranches.js`,
   `api/work/taskFinalize.js`, `api/flow/commandStages.js`, re-exported via
   `api/git.js`).
3. Confirm the conflicting-state fixture shape in the existing integration test
   (`api/git/switchSnapshots.integration.test.js`): main tracks
   `docs/tasks/<other>/task.md`, working tree is on `kb/t` holding the same path
   untracked. Note the fixture helpers (`initRepo`, `run`, temp-dir teardown,
   `gitAvailable` guard) so new tests reuse them unchanged.
4. Read `api/git/workingTreeStatus.js` `_resolveIgnorePaths` and
   `api/git/commit.js` `isLiveTaskSnapshotPath` / `untrackLiveTaskSnapshots` /
   `commitEngineSnapshots` so the wrapper and the migration reuse the exact
   same engine-owned-path predicate (no divergent path lists).

### Step 3 — Make the change easy: introduce ONE protected switch helper
5. In `api/git/branch.js`, extract the move-aside + checkout + restore sequence
   from `checkoutBranch` into a single internal helper, e.g.
   `checkoutWithSnapshotAside(projectCwd, args, opts)` that:
   - calls `_moveAsideBlockingLiveSnapshots(projectCwd, targetBranch, opts)`,
   - runs `git(projectCwd, args)` (args = `["checkout", branch]` or
     `["checkout", "-b", branch]`),
   - always calls `restoreMovedAsideSnapshots(aside)` in a `finally`.
   `checkoutBranch` then becomes a thin wrapper around it — behavior identical
   to today, single code path to audit.

### Step 4 — Make the change: route EVERY raw checkout through the helper
6. Rewrite `ensureBranchCheckedOut` so all five raw `git checkout` sites call
   `checkoutWithSnapshotAside` instead:
   - branch-exists path (with the existing `isWorktreeLockError` →
     `reconcileBranchWorktreeLock` → retry flow preserved verbatim; the retry
     also goes through the helper),
   - pinned-base checkout (`["checkout", pinnedBase]`) — move-aside against the
     base branch too,
   - create path (`["checkout", "-b", branch]` and the explicit-start-point
     `["checkout", branch]`) — move-aside against the new branch,
   - the race-tolerant final re-checkout.
   Keep the clean-tree guard, the unborn-repo skip, and the
   `commitSnapshotsBeforeSwitch` backstop exactly where they are.
7. Audit pass: after the edit,
   `grep -n '"checkout"' api/git/branch.js` must show `["checkout", ...]`
   ONLY inside `checkoutWithSnapshotAside`. No bare
   `git(cwd, ["checkout", ...])` may remain anywhere in `api/git/`
   (`commit.js:508` / `merge.js:166` are path restores and stay).
8. Belt-and-braces migration: wire `untrackLiveTaskSnapshots` into the
   startup/branch-prep path (per survey q3) — the natural home is
   `ensureTaskBranch` pickup in `api/work/taskBranches.js` (alongside the
   existing `commitAllIfNeeded` auto-commit) and/or `prepareProjects` startup —
   as a warn-only best-effort call paired with `commitEngineSnapshots` so the
   staged `rm --cached` deletion rides along in the same snapshot commit (this
   pairing already exists inside `commitEngineSnapshots`, so wiring the
   migration into the pre-switch backstop `commitSnapshotsBeforeSwitch` in
   `api/git/branch.js` is the smallest correct change). Goal: once main's
   `docs/tasks/<id>/task.md` copies are untracked + committed as deletions, no
   branch switch can ever be blocked by them again.

### Step 5 — Regression tests (shared fixture + per-entry-point)
9. Extend `api/git/switchSnapshots.integration.test.js` with a shared helper
   that builds the EXACT conflicting state: on `main`, commit
   `docs/tasks/<other-id>/task.md`; switch to `kb/t`; write the same path as an
   untracked live copy (plus optionally an untracked report).
10. Add one focused test per public entry point, each starting from a fresh
    conflicting-state repo and asserting the switch to `main` succeeds, HEAD is
    `main`, and the live untracked content is restored afterwards:
    - `checkoutBranch(dir, "main")`
    - `ensureBranchCheckedOut(dir, "main")` (branch-exists path — the exact
      shape that failed tasks 82e49a05/9d2b75a2)
    - `withCheckedOutBranch(dir, "main", fn)` — `fn` runs, default branch
      restored afterwards
    - `returnToDefaultBranch(dir)`
11. Add the ensure-create path: conflicting state + target branch does NOT
    exist → `ensureBranchCheckedOut(dir, "kb/new", { baseBranch: "main" })`
    must create from main and check out through the pinned-base protected path.
12. Keep/add the negative test: a REAL untracked file (not engine-owned) that
    main tracks must STILL block the switch loudly — the move-aside must never
    swallow operator files.

### Step 6 — Verification plan (acceptance)
13. Unit/integration gate: `npm run test:api` (vitest, `api` package) green,
    including the new regression tests; also run `node --test api/git/` per the
    acceptance wording and `npm run test:unit` for the full unit gate.
14. Lint: `npm run lint:api` (eslint) clean on the touched files.
15. Flow-level repro (manual, in a throwaway temp repo — never the KainBain
    repo): build the conflicting state, then simulate
    (a) the Update stage: `withCheckedOutBranch(cwd, "main", () => run
    ./update.sh)` via `api/flow/commandStages.js` semantics — must pass;
    (b) the catchup/default-hop: `ensureBranchCheckedOut(cwd, "main")` from a
    `kb/other` branch holding untracked `docs/tasks/<merged-id>/task.md` —
    must pass; (c) `returnToDefaultBranch(cwd)` after a CI stage — must pass.
16. Post-migration check: after the Step-4(8) wiring runs once on a repo where
    main tracks `docs/tasks/<id>/task.md`, `git ls-tree main --
    docs/tasks/<id>/task.md` is empty and a raw `git checkout main` from a
    conflicting branch succeeds even WITHOUT the move-aside.
17. Docs: update the JSDoc MARK blocks on `ensureBranchCheckedOut` /
    `checkoutBranch` / the new helper to describe the protected-switch contract;
    add a CHANGELOG.md entry (Fixed) referencing the two stranded tasks
    (82e49a05, 9d2b75a2) if the repo convention calls for it; run
    `npm run docs:check` if any site-docs/api-coverage docs are touched.

## 3. Risks & guardrails

- The move-aside must only ever move ENGINE-OWNED paths (existing
  `_moveAsideBlockingLiveSnapshots` already enforces this via
  `isLiveTaskSnapshotPath` + `_resolveIgnorePaths`); the negative test (step
  12) locks that in.
- `restoreMovedAsideSnapshots` must run in `finally` so a failed checkout never
  leaves live snapshots sitting in a temp dir.
- Do NOT touch `runner/project.js` worktree checkouts in this task (separate
  `-f` semantics inside per-task worktrees); only audit them.
- No force-checkouts, no `clean -fd` on engine paths — the fix is move-aside +
  untrack, never destructive.
- Tests use temp dirs only (`fs.mkdtempSync`), matching the existing
  integration-test convention.

## 4. Definition of done

- Zero raw `git checkout <branch>` calls outside the single protected helper in
  `api/git/`.
- `untrackLiveTaskSnapshots` wired into the startup/branch-prep path so main
  untracks `docs/tasks/<id>/task.md`.
- New regression tests pass for all four public entry points in the conflicting
  state; `npm run test:api` and `node --test api/git/` green; flow-level repro
  of the Update and catchup flows passes in the conflicting state.
