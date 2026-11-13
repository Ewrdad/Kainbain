---
title: Develop Alongside KainBain
section: working-with
order: 46
slug: develop-alongside
---

# Develop Alongside KainBain

You can edit the same project KainBain is working on — pause the task first, make your change, then resume. This article covers the safe flows for hand edits, where the task's work actually lives, and what to do when your edits collide with the engine.

## The one mental model

- Each task works on its own branch (`kb/<task-id>`), merged back when its pipeline finishes. Your checkout of `main` is usually **not** where the agent writes.
- The engine runs one task at a time. Your safe moves are: a **separate branch**, **pause-then-edit**, or **review-gate input** — never editing the same files while the agent runs.
- Open the task detail page to see where a task works: the **working-location line** shows its branch, isolation mode, and worktree path when one is enabled (`GET /tasks/:id` returns the same as `workingLocation`, alongside `claim`, which names the Runner currently holding the task).

## Flow A — Separate branch (primary flow)

Use this whenever you want your own copy: KainBain works on its own task branch, you work on yours, then the two combine through the pipeline.

1. Create your branch from `main` (`git checkout -b my-feature`) and build there — keep the task's `kb/*` branch alone.
2. Merge your branch back first. Combining runs through the pipeline merge, which auto-aborts on conflict and **fails the merge stage** instead of overwriting: a conflicted merge parks for human resolution, so nothing gets silently lost.
3. Never force-push over a `kb/*` branch. If the task already touched your files, coordinate through the task instead: leave a review-gate comment or steer text describing the conflict, and let the next agent stage reconcile it.
4. If `main` moved while the task ran, the task branch merges back per the normal pipeline; your merged feature rides along like any other `main` change.

## Flow B — Quick fix (pause, edit, resume)

Use this for small tweaks to files the task also touches.

1. **Pause** the task (task detail page: Pause button, or API):

```bash
curl -X POST http://localhost:3100/tasks/<task-id>/pause \
  -H 'Content-Type: application/json' \
  -d '{"projectId": "<project-id>"}'
```

Pausing stops the live run (child process and agent session are terminated, the engine is released) and parks the task as `paused`. A retry/iteration queued behind it is cancelled, not left dangling.

2. **Edit** the task's branch, not `main`. Copy the checkout command from the task detail page (`Copy Checkout`) or check out `kb/<task-id>` yourself, commit your fix there.
3. **Resume** the task (Resume button, or `POST /tasks/:id/resume`). Resume re-runs the current stage from scratch on the task branch — your committed hand edit is picked up, not overwritten.

If the task is held by a remote Runner (`claim` names a Runner in the task detail), its files are not on your disk. Do not hunt for them: either **steer** the task (`POST /tasks/:id/steer` with your guidance, queued against the Runner lease) or wait for the next review gate and leave a comment instead (see `#/docs/review-gates`).

## Flow C — Settings and setup

Some things are safe to touch with the task paused; others must never be hand-edited.

| Safe with the task paused | Never hand-edit |
|---|---|
| Pipeline files (per `#/docs/submit-track-task` validation rules) | `.kainbain/` engine state (`sessions/`, `worktrees/`, `quarantine/`) |
| Project settings (Files & Repos tab, Runner policy) | Task markdown/state files under `docs/tasks/` bookkeeping |
| Review-gate comments and feedback | Another task's `kb/*` branch while it runs |

Changing state-folder contents by hand wedges the scheduler. If you must touch project configuration the engine owns, stop new work first, make the change, then re-run — the stop-rename-restart flow in `#/docs/existing-projects` applies.

## Flow D — Project docs

- Project docs (`docs/`): safe to edit any time, like any other source file. Pause first only if a running task is editing the same page.
- Task bookkeeping (`docs/tasks/`): written by the engine during execution. Read it freely; do not edit it by hand.
- Product docs (`site-docs/`): safe to edit directly. They are served unauthenticated, so keep secrets and host paths out (see the authoring rules linked from `#/docs/getting-started`).

## What not to do

- Editing files inside a **running** task's worktree. The cleanliness guard will refuse the next branch switch and the stage will fail instead of silently overwriting you. Pause first (Flow B).
- Editing `.kainbain/` state, `sessions/`, `worktrees/`, or `quarantine/` by hand. These are engine-owned; the sweep step of the recovery ladder may delete stray files there.
- Force-pushing over `kb/*` branches. The task's merge story assumes it owns that ref.

In `off` (shared-checkout) isolation mode there is no worktree separating you from the agent: edit only while the task is paused or idle, and prefer worktree mode for hand-editing (see `#/docs/red-shared-gate`).

## When something collides

If your hand edits are still in the tree when the engine needs a clean branch switch, it first runs the automated dirty-tree recovery ladder: it sweeps engine debris, stashes tracked modifications under a `kainbain-task-<task-id>` marker, then reports. Only when the tree is still dirty afterwards does the stage fail with a `GitDirtyTreeError` naming every blocking path, the recovery attempts, and the safe next step:

```text
Working tree is not clean (refusing checkout): src/one.js. Commit or stash
your changes first — switching branches now could lose work. If these are your
own hand edits, commit, stash, or move them aside, then retry or resume the
task — nothing was overwritten.
```

Recover by committing, stashing, or moving the listed paths aside, then retry or resume the task. Tracked edits the ladder stashed are restored with `git stash pop` (the marked stash ref is in the error's recovery trail). For lock-file confusion rather than dirty-tree blocks, see `#/docs/git-index-lock-runbook`.

## Related

- `#/docs/submit-track-task` — submitting and tracking tasks, pipeline file rules
- `#/docs/review-gates` — approve / reject / re-route with comments
- `#/docs/task-dependencies` — ordering tasks that depend on each other
- `#/docs/existing-projects` — project settings and state-folder safety
- `#/docs/git-index-lock-runbook` — recovering from git index locks
- `#/docs/pipeline-stages` — task statuses including `paused` and `waiting_human`
- `#/docs/api-reference` — `pause`, `resume`, `abort`, and `steer` endpoints
