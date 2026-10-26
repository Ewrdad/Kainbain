---
title: Red Shared-Gate Runbook
section: working-with
order: 66
slug: red-shared-gate
---

# Red Shared-Gate Runbook

**Symptom.** One or more tasks park `failed` on their **Deploy** stage (a ci stage running `./deploy.sh`) with a
reason like `Shared gate 'canary-e2e' is failing on main (<sha>) — no task
change will pass until the shared suite is fixed`. Retrying the task changes
nothing; other tasks start failing the same gate the same afternoon.

**Why.** The blocking deploy gates (`canary-e2e`, `final-test-suite`) run on
the shared default-branch workspace as the last step before a prod swap —
not on the task branch. A red shared suite therefore blocks **every** task's
deploy, and no task change can turn it green. The engine classifies
this as a `project-blocker`: the task parks with the branch and SHA named,
its retry budget untouched, and only **one** project-level alert fires per
gate@SHA (no per-task storm).

## What to do

1. Read the parked reason: it names the gate, the branch, and the SHA the
   red evidence was keyed on (`Deploy cause:` section of the failure report,
   plus `last-result.json` → `headSha` / `failedCommand` and the
   `gate-*.log` tail).
2. Fix the shared suite on the default branch (the usual cause is expectation
   drift — a hand-maintained assertion that no longer matches the product).
3. Re-run **one** parked task (`POST /tasks/:id/retry`). Its deploy stage
   re-runs the deploy command; when the gate goes green the task
   advances and writes `last-result.json: status=success`.
4. Retry the remaining parked tasks. Each re-runs its own deploy
   (a fresh operation key — a new base SHA means a new operation, never an
   adoption of the old failure).

## How the engine knows main is red

The `project-blocker` classification needs evidence that the gate was already
red on the pristine tree, so it never claims "main is red" from a hunch. Two
sources are consulted, both keyed by `gate@SHA`:

1. **An explicit cached probe** — `recordSharedGateProbe` writes
   `store.sharedGateProbes` (`{ passed }` for a gate at a SHA). This is the
   override seam for an operator or a future per-SHA health gate.
2. **The deploy history (the usual source).** Every durable deploy record
   stamps the full git HEAD its gates ran against (`headSha` in
   `last-result.json` / `history.jsonl`). When a task fails shared gate `G`,
   the engine looks for a history record whose `headSha` equals the task's
   **pre-merge base** and whose failure names `G`. Such a record proves `G`
   was already red on the tree this task merged onto — before the task's
   change existed — so no task change can turn it green.

Absent both, the failure stays a **task failure** with the runbook pointer
below: the engine never assumes a project blocker on no evidence.

## The pristine SHA

The SHA probed is the task's **pre-merge base** (`preMergeMainSha`), not the
current default-branch HEAD: the HEAD already contains the task's merge, so
probing it could never exonerate the task. The pre-merge base is also exactly
the `headSha` of the preceding merge's deploy record, which is why the
history lookup usually resolves in one comparison.

## Emergency escape hatch

`KAINBAIN_SKIP_CANARY=1` skips the canary gate (logged loudly). Emergency
use only — a skipped gate ships code the suite never tested.

## Scratch-port collisions (`canary-e2e` only)

**Symptom.** The canary gate fails instantly with
`Error: http://localhost:3399/status is already used, make sure that nothing
is running on the port/url or set reuseExistingServer:true in
config.webServer.` The task never even reaches a product assertion.

**Why.** The scratch suite sets `reuseExistingServer: false` on its
dedicated ports (API `:3399`, vite `:5299`) on purpose — reusing a stale
stack would serve old projects or a stuck-tripped breaker. A run killed by a
timeout, a watchdog, or Ctrl-C leaves its child servers bound, so the next
run cannot bind.

**What to do.** The drain is automatic: `deploy.sh` runs
`scripts/drain-ports.sh 3399 5299` immediately before the gate, and
`npm run test:canary` runs `scripts/canary-preflight.mjs` first. Both only
ever touch the two scratch ports. If a collision still surfaces, check that
nothing unrelated is squatting on those ports (`lsof -ti tcp:3399`);
`canary-preflight.mjs` deliberately **refuses to kill** an occupant that does
not match the canary scratch-stack signature and reports it instead.

## Cross-task branch bleed (spurious merge conflicts)

**Symptom.** A merge stage fails with a conflict in files the task never
touched, or a commit appears on a task branch that belongs to a sibling task
(then the sibling's merge conflicts). The 2026-10-12 incident: task
`2e6a3521`'s stage auto-commit landed on `kb/04170d74` while that task's
branch happened to be checked out, and the contamination produced a conflict
in `TaskReviewPage.jsx` at the next merge.

**Why.** Work stages share one primary checkout, so the branch under `HEAD`
can move between a stage's own checkout and its auto-commit. A blind
`git add -A && git commit` then records one task's files on whichever branch
is current.

**What to do.** Auto-commits are now branch-affinity guarded: callers pass
`expectedBranch` to `commitAllIfNeeded`, which refuses with a
`GitBranchMismatchError` when the checkout has moved (never committing the
files onto a sibling branch). The merge stage's pre-merge commit fails the
stage loudly on a mismatch; publish and review-snapshot commits degrade
to a warn-only skip because their merge/deploy already landed. If a task is
parked with a branch-mismatch reason, no cleanup is needed beyond retrying
the stage — the guard prevented the contamination rather than recording it.
For projects that want full filesystem isolation instead of the shared
checkout, set `workspaceIsolation: "worktree"` so every task runs in its own
`git worktree`.
