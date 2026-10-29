## Goal

Make git work between multiple Runners as safe as a normal multi-developer flow: each Runner works on an isolated task branch, pushes to the shared remote, and integrates into the target branch through one serialized, verifiable merge at a time. The backend coordinates leases, queues, expected SHAs, and state transitions; it does not check out, reset, merge, commit, or push a shared working tree. Almost every git mutation runs on a Runner.

## Success Criteria

- Two or more Runners can work on different tasks in the same project concurrently without sharing a working tree, an index, or a checkout.
- A task branch has exactly one logical writer at a time, fenced by the existing claim `executionId`/`epoch` model, and every push is fast-forward or explicitly lease-checked.
- Only one integration (merge into the target branch) per project/target branch is leased at a time, and it lands with a compare-and-swap push against the target SHA the merge was based on.
- A moved target branch, a moved task branch, a dirty tree, or a stale SHA produces a requeue/sync/conflict state, never a silent reset, force-checkout, dropped commit, or a merge of stale local state.
- The incident classes in the evidence below cannot recur: untracked files overwritten by merge, diverged task branch with no owner to reconcile it, dirty shared checkout blocking checkout/merge, and snapshot `task.md` conflicts.
- Every landed merge is verified against the remote ref (reported SHA is an ancestor of the fetched target branch) before the task is treated as merged.
- Local-only repositories keep working in a degraded single-Runner mode with the limitation stated in the UI/logs; multi-Runner branch mode requires a remote (see Assumptions).

## Approach

Adopt the ordinary developer model, with the remote as the only shared truth:

```text
backend (coordinator only)
  claim/lease + epoch fence ──► Runner A ──► isolated clone/worktree on kb/<taskA>
  claim/lease + epoch fence ──► Runner B ──► isolated clone/worktree on kb/<taskB>
        │                              │ fetch / branch from origin/<target>@baseSha
        │                              │ work, commit, push kb/<task> (FF or lease-checked)
        │                              ▼
        │                         origin (shared truth)
        │                              ▲
        └─ integration queue ──► one leased integration Runner
             (project+target)      fresh detached worktree at expected target SHA,
                                   merge origin/kb/<task>, test, CAS-push target
```

Key invariants:

1. **Remote is truth, checkouts are caches.** No actor treats a local `main` or local `kb/<task>` as authoritative. Every job starts by fetching and naming the exact remote SHAs it based work on (`baseSha`, `expectedTaskSha`, `expectedTargetSha`).
2. **One writer per ref.** A task branch is written only by the Runner holding that task's claim. The target branch is written only by the Runner holding that project/target integration lease, and only via `git push --force-with-lease=<target>:<expectedTargetSha> <mergeSha>:<target>` so a target that moved mid-merge rejects the push instead of being overwritten or silently merged late.
3. **Ephemeral integration worktree.** Merges run in a fresh worktree/clone checked out detached at `origin/<target>`, never in the backend's project checkout and never in a long-lived Runner checkout. The worktree is deleted after the report; nothing human or engine-owned can dirty it.
4. **Conflicts are work, routed to an owner.** A content conflict on the task branch is returned as structured data and re-dispatched as a resolve/sync job on that task branch (agent resolves on the branch, as a developer would). The integration Runner never resolves code conflicts and never auto-resolves anything except paths that are no longer in git (Decision 4).
5. **Idempotent, SHA-addressed reports.** Every Runner git job reports `{ attemptId, epoch, beforeSha, afterSha, ref, pushState }`. Retried or duplicated reports with the same attempt id are no-ops; stale epochs are rejected exactly like stale stage completions today.

### Evidence: how it works today

- Work stages are already Runner-based and fenced: `runner/daemon.js` `executeAssignment` claims (or consumes a dispatch lease), `prepareWorkdir` opens `kb-<taskId>` under the Runner work root, `commitAndPush` in `runner/gitOps.js` commits and pushes `kb/<taskId>`, and `complete-execution` reports the SHA under the ClaimStore epoch fence (`api/flow/runnerRoutes.js`, `api/flow/executionLedger.js`).
- Merge stages are the exception: `isDispatchServable` in `api/flow/dispatch/isDispatchServable.js` returns `false` for `merge`, so `executeMergeStage`/`mergeTaskBranchIntoMain` in `api/flow/commandStages.js` run embedded on the backend, in the project's primary checkout (`cwd`). That one checkout does the full sequence: `syncDefaultBranchToRemote` (fetch + `reset --hard`), task-branch sync, auto-commits, `checkout` to the task branch, `checkout` to the target branch, `mergeBranch`, post-merge auto-commit, push, report commit, push again.
- Backend git calls are serialized only per command: `git()` in `api/git/exec.js` takes `withRepoGitLock` (`api/work/gitLock.js`) around each single git invocation. A merge is dozens of invocations with task-store writes in between, so the sequence is not atomic against another task's merge, a human edit, or a Runner-driven change landing in the same checkout.
- The backend and the Runner both write the same paths on different branches: the backend rewrites `docs/tasks/<id>/task.md` in its checkout on every stage event (`_saveTaskMarkdown`), while the Runner commits the same folder on `kb/<task>` (`commitAndPush` force-adds `docs/tasks/<taskId>`, and `syncTaskDocs` in `runner/project.js` copies the backend's live folder into the worktree). `task.md` is simultaneously a live database snapshot and a tracked file on two branches.
- Runner git is unhardened compared with backend git: `runGit` in `runner/project.js` is a bare `execFile` with no timeout, no per-repo lock, no stale-lock recovery, and no structured errors, and `commitAndPush` pushes `branch:branch` with no fetch, no fast-forward check, and no retry. `refreshWorktreeToRemote` reuses a worktree with `checkout -f -B <branch> origin/<branch>`, which discards anything unpushed.
- Backend acceptance of Runner work is trust-based for remote projects: `completeExecution` in `api/flow/executionLedger.js` records `shaState: "unverified-remote"` whenever the project `hasUpstreamRepo`, and the completion still advances the task.

### Evidence: failure census (docs/tasks/**, 27–29 Oct 2026)

16 `merge-failure-*.md` reports across 5 tasks, in four signatures:

| Signature | Count | Example |
| --- | --- | --- |
| Content merge conflict, dominated by `docs/tasks/<id>/task.md` and `assets/` | 9 | `docs/tasks/3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/merge-failure-20261028-175651.md` |
| Dirty shared checkout blocks checkout/merge, or working tree "not clean" before switching | 4 | `docs/tasks/b5716327-d950-4e3d-b430-4a1c15a75e66/merge-failure-20261028-102253.md` |
| Task branch diverged from `origin/kb/<id>`; merge refuses and tells a human to "reconcile locally" | 2 | `docs/tasks/b34e1939-6ee2-416d-b6a7-279920f8573c/merge-failure-20261029-191023.md` |
| Untracked backend files would be overwritten by merging `origin/kb/<id>` | 1 | `docs/tasks/a5228675-7511-40d1-b20c-c4662322494b/merge-failure-20261029-202947.md` |

The referenced task `a5228675-7511-40d1-b20c-c4662322494b` is the cleanest reproduction: the backend held `docs/tasks/a5228675-…/task.md`, `idea-*.md`, and `assets/image.png` as untracked files in its main checkout while the Runner had committed the same paths on `origin/kb/a5228675-…`; the pre-merge task-branch sync then aborted with "untracked working tree files would be overwritten by merge" and the task failed back to Idea with no actor able to fix it. The two diverged cases have the same shape: the system detects the divergence correctly, then issues an instruction ("merge `origin/kb/…` into `kb/…` locally") that no component is responsible for executing. The git history shows the cost of the current design even on success: `main` is littered with backend bookkeeping commits ("commit merge bookkeeping", "commit stage notes", "auto-commit pending work on 'main'") interleaved with Runner stage commits.

### Root causes

1. **The merge runs in the worst possible place:** a shared, long-lived, human- and engine-dirtied primary checkout on the backend, instead of an ephemeral clean worktree on a Runner.
2. **Dual ownership of the task branch and of `task.md`:** backend checkout and Runner worktree both hold `kb/<task>` state, and both write `docs/tasks/<id>/`. This structurally produces the untracked-overwrite, dirty-checkout, and snapshot-conflict failures.
3. **Detection without an owner:** sync/divergence checks (`syncBranchWithUpstream`, `syncDefaultBranchToRemote` in `api/git/merge.js`/`remote.js`) are warn-only during work and hard-fail at merge, with reconciliation left to a hypothetical human "locally". In a Runner fleet there is no local.
4. **Unguarded pushes:** Runner pushes are blind (no fetch/FF check/retry), the target push after a backend merge is warn-only, and `syncDefaultBranchToRemote` must then refuse to reset a `local-ahead` main — the land-it, lose-it, land-it-again loop already documented in `api/git/remote.js`.
5. **Force where it is dangerous, none where it is needed:** worktree reuse force-checkouts over unpushed work, while the pushes that genuinely need compare-and-swap (task branch after a rebase/sync, target branch after a merge) use plain pushes.

## Key Decisions

1. **Move the merge to a Runner as a leased `integrate` job (recommended).** The backend keeps only the queue and the verdict. Rejected alternative: keep merging on the backend but clean the checkout harder — it preserves the shared-checkout failure class, keeps git load and credentials on the backend, and contradicts the runner-only direction already taken for agent/CI stages (`isDispatchServable`).
2. **Serialize integrations with a per-(project, target branch) integration lease**, reusing the ClaimStore pattern (monotonic epoch, execution id, TTL + heartbeat, stale report = 409). Rejected alternative: rely on git push rejection alone — that detects the race only after a full merge and test cycle is wasted, and gives no queue order or operator visibility.
3. **CAS-push the target with `--force-with-lease` pinned to the expected target SHA**, even though the expected case is fast-forward. Rejected alternative: plain push + retry loop — a retry after someone else's merge must re-run the merge and gates against the new target (a new attempt), not just re-push.
4. **Take live engine state out of git.** `docs/tasks/<id>/task.md` stops being a tracked, branch-merged file: task state stays in the store, stage reports/assets move between backend and Runner as completion payloads (extend `materializeRunnerTaskDocs`/`collectTaskFiles`), and a human-readable `task.md` is generated on demand/export, not committed by either side. Until this lands, `task.md`/`assets/` are excluded from task-branch commits and from merge conflict handling. Rejected alternative: keep improving snapshot auto-resolution (`partitionMergeConflicts`/`resolveConflictsWithIncoming`) — it only handles the conflict signature, not untracked-overwrite or divergence, and keeps two writers.
5. **Require a remote for multi-Runner branch mode; degrade honestly without one.** With no `origin`, only one Runner may hold branch-mode work for a project and merges are local to that Runner's clone; the backend still never merges. Rejected alternative: backend-as-git-server/file transport for SHAs — a new subsystem to build and secure, for a topology a bare remote already solves.
6. **Harden Runner git to the backend's standard** (timeout, structured `GitError`-style codes, per-worktree serialization, stale-lock assessment scoped to the Runner's own worktrees, `GIT_TERMINAL_PROMPT=0`) in `runner/project.js`/`runner/gitOps.js`, instead of importing `api/git/*` into the Runner (the Runner must stay deployable without the backend tree; mirror the contract, not the code).

## Steps

Ordered as separate PRs; each lands independently behind the flags noted.

1. **Stop the bleeding on the current backend merge (no protocol change).**
   - In `mergeTaskBranchIntoMain` (`api/flow/commandStages.js`), preflight-classify the four census signatures before any checkout: untracked paths that exist on `origin/<branch>` (the a5228675 case), dirty tree, diverged task ref, moved target. Untracked-overwrite and divergence stop failing the task back to a work stage; they park the merge as `blocked-sync` with structured diagnostics, because no human-local fix exists.
   - Stop `syncTaskDocs` (`runner/project.js`) copying `task.md` into the worktree and stop `commitAndPush` (`runner/gitOps.js`) force-adding `docs/tasks/<taskId>`; reports already return via `collectTaskFiles` payloads.
   - Gate: existing merge suites pass (`api/git*`, `commandStages*`); new regression test reproducing a5228675 (untracked backend copies vs tracked remote copies) parks as `blocked-sync` instead of failing back.
2. **Runner git primitives v2 (`runner/project.js`, `runner/gitOps.js`, `runner/daemon.js`).**
   - Replace bare `runGit` with a hardened runner: per-workdir mutex, timeouts, structured error codes (`git-lock`, `non-fast-forward`, `diverged`, `dirty`, `conflict` with conflicted-file list), stale-lock recovery scoped to the Runner's own work root.
   - `commitAndPush` v2: fetch, integrate `origin/<branch>` when the local branch is behind/diverged (merge; conflict = structured failure, never force), push, and on `non-fast-forward` re-fetch/integrate and retry at most 3 times. Report `{ beforeSha, afterSha, pushState }`. Never `checkout -f -B` over a dirty or unpushed worktree in `refreshWorktreeToRemote`: a dirty reused worktree is committed to `kb/<task>/recovery/<executionId>` and reported, or refused with a named code.
   - Branch creation records its base: worktree branches are created from `origin/<target>` at a fetched SHA, and the daemon reports `baseSha` in `progress`.
   - Gate: `node --test runner/` plus new real-git tests (bare origin fixture as in `runner/gitOps.test.js`) covering diverged push recovery, dirty-worktree refusal, and lock timeout.
3. **Backend coordination: integration queue + verified completion (`api/flow/claimStore.js` pattern, `api/flow/executionLedger.js`, `api/flow/runnerRoutes.js`).**
   - Add an integration lease store keyed by `(projectId, targetBranch)`: FIFO queue of `{ taskId, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId, epoch }`, TTL/heartbeat mirroring task claims. State machine: `queued → leased → merging → landed | conflict | stale-head | needs-sync`, all transitions journaled to task history.
   - `complete-execution` stops advancing remote tasks on trust: a passed stage requires the Runner's reported SHA to be confirmed fetchable from the remote by the next Runner touch (deferred verification state `pushed-unverified` → `verified`), and `unverifiedSha` divergences become visible per task instead of only a monitor counter. (Backend stays push/pull-free per ADR 0009 D2; verification is done by Runners and reported.)
   - Gate: claim-fencing tests extended to integration leases (two leases, one winner; stale epoch report rejected; lease expiry requeues in order).
4. **Dispatch the merge to Runners (`api/flow/dispatch/isDispatchServable.js`, `api/flow/runnerRoutes.js`, `runner/daemon.js`, `api/flow/commandStages.js`).**
   - New dispatch kind `integrate`: backend leases the integration slot and sends `{ taskBranch, expectedTaskSha, targetBranch, expectedTargetSha, mergeAttemptId, epoch }`. `merge` stages become dispatch-servable; `executeMergeStage` shrinks to enqueue + await verdict + advance/report, performing zero git mutations in the backend checkout.
   - The integration Runner: fetch; verify both remote refs still equal the expected SHAs (else report `stale-head` and stop); create a fresh detached worktree at `origin/<target>`; `git merge --no-edit origin/<taskBranch>`; on conflict report the structured diagnostics (`buildGitConflictDiagnostics` shape) and stop; run the post-merge gate if configured; push with `--force-with-lease=<target>:<expectedTargetSha>`; re-fetch and verify the target now points at the merge SHA; report `{ mergeSha, parents }`. Delete the ephemeral worktree in all outcomes.
   - On `stale-head` (target or task moved), the backend re-bases the queue entry on fresh expected SHAs and re-leases; on `conflict`, it dispatches a `sync`/resolve job for the task branch to a Runner (merge `origin/<target>` into `kb/<task>`, agent resolves if needed, push via Step 2), then re-queues the integration. This gives divergence/conflict an owner for the first time.
   - Gate: partition test (ADR 0009): two Runners, two tasks, concurrent merge requests — exactly one integration lease at a time, both land in queue order, second merge is based on the first's merge SHA; a target moved mid-merge yields `stale-head`, never a rejected-push mystery or a lost merge.
5. **Remove live state from git (`api/work/taskPersistence.js`, `_saveTaskMarkdown` callers, `runner/daemon.js` `collectTaskFiles`, `api/flow/execution/materializeRunnerTaskDocs.js`).**
   - `task.md` (and stage-report writes into the working tree) are no longer written into any checkout that participates in branching; the store remains the source of truth, reports/assets travel as payloads (raise/collect the existing caps deliberately), and `task.md` becomes an export rendered from the store. Add `docs/tasks/` to the generated ignore rules for branch-mode projects during migration, and provide a one-time cleanup that untracks `docs/tasks/*/task.md` on task branches and the target.
   - Retire the snapshot-conflict machinery (`partitionMergeConflicts`, `resolveConflictsWithIncoming`, `healSnapshotOnlyMergeConflict`) once no tracked snapshot paths remain, and retire `syncDefaultBranchToRemote`'s `reset --hard` of the backend checkout when Step 4 removes backend merges.
   - Gate: the 9-conflict census class becomes impossible — integration test merges two long-lived task branches that both produced reports and asserts a clean merge with no snapshot paths in the conflict set.
6. **Observability, rollout, and cleanup.**
   - Surface per-project git health in the Runner monitor: integration queue depth/lease holder, `pushed-unverified` tasks, divergence counts, push-retry counts, and the four census signatures as counters (pageable-zero goal from ADR 0009).
   - Roll out per project behind the existing branch-mode setting: (a) Step 1–2 everywhere, (b) integration dispatch for one canary project, (c) default for branch-mode projects with a remote, (d) remove the embedded backend merge path and the now-dead backend-checkout sync/reset code.
   - Gate: canary project runs two concurrent multi-stage tasks end-to-end (work → review → merge → post-merge CI on a Runner via `runOnBranch`) with zero merge-stage failures and a clean backend checkout throughout (`git status` empty on the backend before/after).

## Validation Plan

- Existing suites per PR: `node --test runner/`; `npm run test --prefix api -- git gitConcurrency gitStaleLock gitWorkspaceIsolation commandStages executionLedger claimStore`; full `npm run test --prefix api` before Steps 4–5 merge.
- New integration fixtures use a real bare `origin` plus two Runner work roots (extending the `runner/gitOps.test.js` pattern): concurrent task pushes, diverged task branch reconciled by a sync job, target moved mid-merge (`stale-head` + re-lease), conflict routed to the task branch and resolved there, and the ADR 0009 partition test (a Runner partitioned mid-stage cannot complete or push over the fenced winner).
- Regression test named for the incident: reproduce `a5228675-7511-40d1-b20c-c4662322494b` (backend-side untracked `docs/tasks/<id>/` copies, same paths committed on `origin/kb/<id>`) and assert it is now impossible (no backend working-tree writes) or parks as `blocked-sync`, never a failed-back merge.
- Manual evidence per rollout stage: backend `git status --porcelain` stays empty across full task lifecycles; `git log origin/main` shows merge commits from integration jobs only, with no backend bookkeeping commits.

## Implementation status (2026-10-29)

Built in one pass over Steps 1–6, all suites green (`node --test runner/*.test.js`: 67/67; `npm run test --prefix api`: full suite). Deviations from the plan, all deliberate:

- **Step 1** as planned: diverged/conflict/merge-failed task syncs park as `failed` on the merge stage (`skipFailback`, `sync-blocked` diagnostic naming the Runner sync job as owner) instead of rewinding; `syncTaskDocs` no longer copies `task.md`; `commitAndPush` force-adds task reports but never `task.md`.
- **Step 2** as planned, plus two hardening extras the tests demanded: Runner `runGit` carries per-workdir serialization, 60s timeouts, `GIT_TERMINAL_PROMPT=0`, and machine-wide holder-checked stale-lock recovery (`git-lock` refusal instead of pile-on); `refreshWorktreeToRemote` parks dirty/ahead residue on `kb-recovery/<task>/<stamp>` instead of `checkout -f -B` discarding it; recovery-branch naming is `kb-recovery/…` (a ref cannot nest under the existing `kb/<task>` branch).
- **Step 3** as planned: `IntegrationQueue` (FIFO + monotonic epoch + TTL + expiry requeue at head + idempotent enqueue/report), Runner routes (`acquire`/`heartbeat`/`report` + `GET /runners/integration`), deferred push verification (`pendingPushVerification` on the task, `POST /tasks/:id/verify-sha` fenced by the claim lease), counters in `/runners/monitor`.
- **Step 4** as planned with one scope cut: merge stages on remote-backed projects dispatch as `integrate` (enqueue with backend `fetch --prune` + stable `mergeAttemptId`, claim + lease in one dispatch step, `INTEGRATION_BUSY` backs the Runner off without consuming idle); the Runner merges in an ephemeral detached worktree, pushes with `push --force-with-lease=<target>:<expected> <mergeSha>:<target>`, re-verifies, and reports; the backend finalize (`applyIntegrationReport`) verifies read-only (fetch + ancestry), freezes the review baseline, and advances. The automatic task-branch **sync job** from the plan is NOT built: `conflict`/`stale-head` outcomes park/fail the task with a retryable reason and the retry re-bases with fresh SHAs. A dispatched sync-then-requeue (agent resolves on the task branch) remains the follow-up.
- **Step 5** as planned, extended by two mechanisms the real-git tests forced: live snapshots (`docs/tasks/<id>/task.md`) are untracked (`git rm --cached`, worktree preserved) and never staged; the snapshot commit is built in a **scratch index** (`read-tree` + add/rm + `write-tree`/`commit-tree` + CAS `update-ref`) because porcelain `commit -- <path>` implies `--include` and would re-add the snapshot, and a full-index commit would sweep unrelated staged work. A just-untracked staged deletion rides along in the same snapshot commit (otherwise it blocks the pending switch), and the real index is re-pointed at the new HEAD for exactly those paths. `checkoutBranch` additionally moves aside untracked live snapshots that the *target* branch still tracks (the a5228675 shape) and restores them after the switch. Deliberately **retained**: the snapshot-conflict heal machinery (old branches still carry tracked snapshots; assets can still conflict) and `syncDefaultBranchToRemote`'s reset (still serves the local-only embedded path).
- **Step 6**: `/runners/monitor` exposes `integration` lease counters; `GET /runners/integration` exposes per-scope depth/lease. Rollout is per-project and automatic: remote-backed projects dispatch merges to Runners, local-only projects keep the embedded merge path (unchanged behavior, single writer). No backend merge code was deleted.

## Risks / Open Questions

- Assumptions (reversible, stated rather than asked): the remote is a reachable bare/hosted git remote for branch-mode projects; merge commits (not squash/rebase) remain the integration style, matching `MERGE_STRATEGY` today; post-merge gates run on the integration Runner before the CAS push, so a red gate means `needs-sync`/failback, never a landed-but-red target.
- Risk: `--force-with-lease` semantics vary subtly across git versions and hosting providers for non-fast-forward updates of a branch that is also the default; mitigate by pinning the exact expected SHA, testing against the real remote in the canary stage, and treating any lease rejection as `stale-head` (requeue), never retrying the push blindly.
- Risk: Step 5 changes where humans read task state; mitigate with the on-demand `task.md` export and by migrating reports/assets payloads before untracking anything.
- Risk: Runner hosts gain merge credentials for the target branch; mitigate by scoping Runner credentials to push rights on `kb/*` plus the target only while holding an integration lease, and by the existing approve/revoke Runner lifecycle.
- Open question: none blocking. If a future deployment has no git remote at all, Decision 5's degraded single-Runner mode applies and multi-Runner branch mode stays disabled for that project.

