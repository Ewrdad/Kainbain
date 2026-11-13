# Walkthrough: develop alongside a live task

Human gate for the develop-alongside stage. Run on a scratch project with
at least two agent stages. No long-lived preview server: use the UI and
`curl` against the local stack.

## Setup

- Scratch project with `useBranches` on (branch mode) and default
  `quarantine` isolation.
- One task with two agent stages, started and currently in stage 1.

## Part 1 — pause, hand-edit, resume (guide Flow B)

1. While stage 1 runs, PAUSE the task (task detail page Pause button, or
   `POST /tasks/:id/pause`).
2. Confirm the task reads `paused` and the engine is idle.
3. Check out the task branch (`Copy Checkout` on the task detail page, or
   `git fetch origin && git checkout kb/<task-id>`). Make a small hand
   edit to a file the task also touches; commit it on the task branch.
4. RESUME the task (Resume button, or `POST /tasks/:id/resume`); let it
   run to the next review gate.
5. Confirm: hand edit present in the branch (`git log --oneline`,
   `git show --stat`), stage completed, no guard wedged, review diff
   shows both agent and hand changes.

## Part 2 — guard message, active worktree without pausing

6. Start a second task; without pausing, hand-edit a file in its ACTIVE
   checkout (e.g. append a line to a tracked file, or drop a new
   `my-notes.txt` in the repo root).
7. Confirm the stage fails with a `GitDirtyTreeError` whose message names
   the edited path and ends with the hand-edit recovery sentence
   ("nothing was overwritten"). Confirm the hand-edit bytes are still on
   disk (`git status --porcelain`, file contents).
8. Commit, stash, or move the hand edits aside; retry/resume; confirm the
   task proceeds.

## Part 3 — remote holder (if a Runner is available)

9. With a Runner holding the task, confirm the task detail shows the
   holder (`claim`) and a `workingLocation` with no local worktree path
   you could edit. Send steer text (`POST /tasks/:id/steer`); confirm it
   is queued against the lease and the run continues.

## Evidence to attach to the stage report

- `git log --oneline -5` and `git show --stat HEAD` excerpts from step 5.
- The full guard error message from step 7 plus `git status --porcelain`
  showing the hand edit survived.
