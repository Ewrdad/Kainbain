# Worktree + Logs Bug — Agent Handoff

Date: 2026-10-27. Repo: `/home/server/projects/kainbain` (branch `main`).
Prod: https://kainbain.home. Task under test: `c76e13f5-4453-4d1c-85c2-d9d8f9fee0b5`
("general codebase cleanup"), currently parked in `waiting_human` (Review Plan).

## 1. Background: what this whole arc was about

- Tasks now run **only via Runners** (`KAINBAIN_RUNNER_EXECUTION_ONLY=true`;
  `false` is the emergency rollback hatch, pinned off in tests/canary).
- Fleet is **2 identical local runners**: `local-alpha`, `local-bravo`
  (old `local-pi/muse/agy/vibe` revoked). Services:
  `kainbain-runner-local-alpha.service`, `kainbain-runner-local-bravo.service`.
- **Observability**: all runner logs go to the log viewer with `runner`
  kind/tag + runner filter; monitor's active-task section replaced by
  per-runner widgets (`PerRunnerTasksWidget.jsx`, with-prompt + compact);
  monitor rows carry serving `{harness, model}` + stage via the runner's
  `prompted` progress event (`stageServing`, `stagePrompt` in executionLedger,
  exposed on `GET /runners/monitor` as `serving` + `prompt`).
- **Runner worktree reuse** (`runner/project.js`): clone-mode workdirs are
  re-synced on reuse via `refreshWorktreeToRemote` (`fetch origin` +
  `checkout -f -B kb/<id> origin/kb/<id>`; plain checkout when no remote
  branch yet). Unpushed residue is discarded by design.
- **Turn-by-turn live logs**: runner frames stream over WS
  (`process:stdout` with `[RUNNER]` tag + `executionId`/`seq`); frontend
  `logEntryModel.js` strips the `[Project]` prefix for classification and
  dedupes live frames against stored entries by `executionId:seq`.
- Reference docs updated: `site-docs/api-reference.md` (monitor row,
  `POST /tasks/:id/progress` harness/model).

## 2. Shipped state (committed + deployed)

- Commit [`f63a9a1`](https://github.com/Ewrdad/Kainbain/commit/f63a9a1)
  on `main`, pushed to `origin/main` — 18 files (runner/API/frontend/docs).
- **Prod build 561** (commit label `f63a9a1`, deployed 2026-10-27T16:30Z)
  is live and healthy; `/status`, `/runners` (alpha+bravo active),
  `/runners/monitor` verified. Live monitor row confirmed carrying
  `serving: {harness:'pi', model:'default'}` + `prompt` + `stageId`.
- Gates green at ship time: `node --test runner/*.test.js` (50 pass),
  API vitest (claimStore/executionLedger/runnerRoutes/processLogs),
  frontend vitest (logCategories/logEntryModel/PerRunnerTasksWidget/
  ObservabilityDashboard/RunnersSection/LogsPanel), `npm run docs:check`,
  `npm run lint` (0 errors).
- Canary E2E is flaky in this environment (scratch-stack `:5299`
  `ERR_CONNECTION_REFUSED`, state leakage between specs, one
  status-dependent AAA contrast hit on the NowPlaying CHECK badge in
  `NowPlayingBar.jsx` — pre-existing, untouched). Failures move run to run;
  isolated re-runs pass. Do not "fix" canary by editing unrelated UI.

## 3. The bug: `already used by worktree` failback loop

Symptom on the Automated-tests CI stage:

```text
[ERROR] Stage failback triggered -> target stage: previous
(git checkout kb/c76e13f5-... failed (exit 128):
 fatal: 'kb/c76e13f5-...' is already used by worktree at
 '/home/server/projects/kainbain-kb-c76e13f5')
```

Root cause chain:

1. An **orphaned API-side linked worktree** at
   `/home/server/projects/kainbain-kb-c76e13f5` (created by the older
   `workspaceIsolation: 'worktree'` mode; project now uses
   `"workspaceIsolation": "quarantine"`) held branch `kb/c76e13f5-…` checked out.
2. Agent stages run on runners (own workdirs under
   `/home/server/.kainbain/runner-work/kb-<taskId>`), but **CI/command
   stages still execute embedded in the master checkout** via
   `api/flow/execution/executeStage.js:464` →
   `store.ensureTaskBranch` → `ensureBranchCheckedOut`
   (`api/git/branch.js`) → `git checkout kb/…` in
   `/home/server/projects/kainbain` → exit 128.
3. The deterministic failure classified `logical`, so the task burned
   auto-iteration budget failing back to In Progress and re-running —
   a loop that could never succeed until the worktree went away.

## 4. Fix (IN PROD BUILD 561 BUT NOT YET COMMITTED — see §6)

`api/git/branch.js`:

- `isWorktreeLockError(error)` — matches only the
  `already used by worktree` shape; all other checkout errors propagate.
- `findBranchWorktreeHolder(projectCwd, branch)` — parses
  `git worktree list --porcelain`, returns `{path, head, branch}` or null
  (fail closed).
- `reconcileBranchWorktreeLock(projectCwd, branch)` — removes the holder
  **only when provably safe**: path exists (else just `worktree prune`),
  holder HEAD == branch tip, `status --porcelain -uall` empty, **no
  ignored files** (`--ignored` `!!` entries — `.env`/build outputs are
  invisible to porcelain and must never be swept), branch **not ahead of
  upstream** (no-upstream treated as ahead-unknown → refuse). Anything
  else → `{recovered:false}` with holder + reason.
- `ensureBranchCheckedOut` wraps the existing-branch checkout: on a
  worktree-lock error it reconciles, retries, and returns
  `worktreeRecoveredFrom: holder` (key present **only** on recovery, so
  existing `toEqual` assertions are unaffected). Refusal throws a `GitError`
  naming the holder, the reason, and the exact `git worktree remove`
  command plus the original error.

`api/work/taskBranches.js` (`ensureTaskBranch`, after `outcome`): records a
branch-hop audit line when `outcome.worktreeRecoveredFrom` is set
(`taskStore._saveTaskMarkdown` already runs just below).

`api/git/branchWorktree.test.js` (new, vitest + **real git** in tmp dirs,
no spawn mock — matches `runner/project.test.js` style): 8 tests —
error-shape matcher, holder lookup (null + multi-worktree), safe
remove-and-checkout, stale-metadata prune, and three refusals (dirty
holder, ignored-file holder, ahead-of-upstream holder) that keep the
worktree intact. All pass; `git/branch.test.js` (32) and
`work/taskBranches.test.js` unaffected (61 total pass with the new file).

Immediate unblock (done 2026-10-27): verified the orphan was clean
(`status --porcelain -uall` empty) and fully synced (0 ahead / 0 behind
`origin/kb/…`), then `git worktree remove
/home/server/projects/kainbain-kb-c76e13f5 && git worktree prune`.
Nothing was lost — branch + commits intact. `git worktree list` now shows
only `/home/server/projects/kainbain [main]`.

## 5. Known residuals / sharp edges (do not "fix" blindly)

- CI/command stages run **embedded in master**, not on runners, even with
  runner-only execution. Routing them through runners is a larger
  architectural change — out of scope here.
- Deterministic infra conflicts still classify `logical` and consume
  auto-iteration budget (max 8). The recovery above removes this instance;
  rewiring the retry taxonomy (`api/work/taskErrors.js`,
  `beginAutoIteration.js`) was deliberately not touched.
- The orphan was an isolation-mode leftover: mode changes do not clean up
  old linked worktrees. A future hardening could reconcile on mode change.
- Reviewer edits left **uncommitted AND unpushed** in master during
  `waiting_human` are invisible to a runner-workdir rerun (it resets to
  `origin/kb/…`). Commit + push review edits before re-running.

## 6. DO THIS FIRST: commit + push the fix, then retry the task

`git status` currently shows:

```text
M api/git/branch.js
M api/work/taskBranches.js
?? api/git/branchWorktree.test.js
```

Prod build 561 was staged from this dirty tree, so the fix **is live**,
but the next deploy from a clean checkout would silently lose it.

```bash
cd /home/server/projects/kainbain
git add api/git/branch.js api/work/taskBranches.js api/git/branchWorktree.test.js
git commit -m "Recover branch-held-by-worktree checkout blocks when provably safe"
git push origin main
```

Then move task `c76e13f5` off Review Plan and watch: Automated-tests CI
should check out `kb/…` in master cleanly (or auto-recover any new stale
holder with a branch-hop audit line), and `/runners/monitor` should show
the live assignment with harness/model/stage while turn-by-turn logs
stream. The `(failed)` auto-commit guard line
("Refusing to commit on the wrong branch") seen in task history is benign.

## 7. Key references

- Checkout path: `api/git/branch.js` (`ensureBranchCheckedOut`,
  `reconcileBranchWorktreeLock`), `api/work/taskBranches.js`
  (`ensureTaskBranch` shared path, `ensureTaskBranchRef` human-checkpoint
  path — deliberately never checks out), `api/work/gitLock.js`.
- Stage entry: `api/flow/execution/executeStage.js:464`,
  `api/flow/commandStages.js:1320` (merge), failure routing
  `api/flow/routing/orchestrators/handleStageFailure.js`,
  failback `api/flow/stageTransitions.js`.
- Runner: `runner/project.js` (`prepareWorkdir`, `refreshWorktreeToRemote`,
  `refreshMirror`), `runner/daemon.js`, `runner/client.js` (progress/logs).
- Monitor: `api/flow/executionLedger.js` (`stageFor`, `promptFor`,
  `servingFor`, `ingestLogs`), `api/flow/runnerRoutes.js`
  (`GET /runners/monitor`), `api/flow/claimStore.js`.
- Frontend: `PerRunnerTasksWidget.jsx`, `ObservabilityDashboard.jsx`,
  `MobileMonitorView.jsx`, `RunnersSection.jsx`,
  `tasks/logEntryModel.js`, `logs/logCategories.js`,
  `context/useWebSocket.js`, `wsMessageDispatch.js`.
- Gates: `node --test runner/*.test.js`; from `api/`
  `npx vitest run git/… work/taskBranches.test.js flow/…`;
  `npm run docs:check`; `npm run lint`; `./deploy.sh --prod`
  (final-test-suite + canary-e2e blocking; `KAINBAIN_SKIP_CANARY=1`
  emergency opt-out only).
