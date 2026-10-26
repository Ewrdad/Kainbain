---
title: Review Gates
section: working-with
order: 50
slug: review-gates
---

# Review Gates

`human` stages and checkpoints park a task in `waiting_human` until you decide. Nothing advances past you silently.

## Your three moves

- **Approve / advance** — the task moves to its next stage. Optional guidance is appended to the goal so the next stage inherits your note. When the checkpoint is the last pipeline stage, the button reads "Approve & Mark Complete" because approving finishes the task.
- **Reject with feedback** — feedback is required, and the task fails back to the previous stage with your note attached. You can attach or paste screenshots into the feedback; they ride along so the agent can see the issue (see "Attaching images to a rejection" in Task Images).
- **Re-route** — failback, move, or jump sends the task to a specific stage when neither forward nor back is right.

```bash
curl -X POST http://localhost:3100/tasks/<id>/advance -H 'Content-Type: application/json' -d '{"guidance": "Use the existing button styles"}'
curl -X POST http://localhost:3100/tasks/<id>/reject  -H 'Content-Type: application/json' -d '{"feedback": "Tests still failing on empty input"}'
```

## Review hygiene

- Read the stage **reports** (`GET /tasks/:id/reports`) before deciding — they are the durable record; the activity tail is ephemeral.
- If the inspector has unsaved goal edits, approving first persists them (the editor flushes synchronously), so decide freely.
- A rejected stage re-runs with a freshly curated prompt that includes your feedback — say what was wrong *and* what good looks like.
- `complete` a task only when its pipeline is done; `retry` re-runs a failed stage without a verdict — and restarts its failback/retry budgets from zero, so the next failure auto-retries again.

## Reviewing stage reports line by line

The PR review page has three tabs: **Files Changed** (the git diff),
**Reports**, and **Conversation** (every comment thread). The **Reports** tab
lists each stage markdown report for the task and shows it in its *current
state* — no diff, because with centralised docs the reports live in your
notes store, outside the repository, so they never appear in the git diff.

- Hover any line and click the `⊕` gutter button to leave a line comment;
the report-level `💬` button leaves a whole-report comment. Threads render
inline, exactly like code comments, and use the same sidecar store.
- Toggle **Rendered Preview** to read the formatted markdown; switch back to
**Line Review** to comment.
- **Copy Path**, **Copy Markdown**, and **Notes** open the same report
in your notes workspace.
- Report comments are anchored to the report path and line number and keep the
commented line as an excerpt, so context survives later edits to the report.

The comments you leave on reports (and code) are not just for you:

- On **Pass**, every review comment is written into the `# Human approval`
report and appended to the task goal under `## Human Guidance`, so the next
agent stage receives them as things to consider — you can approve with notes
instead of rejecting.
- On **Fail**, the comments are written into the `# Human rejection` report
and pre-fill the feedback draft (without duplicating text already there).

## Reviewing after merge and deploy

Normally the PR review diff goes empty once the task branch is merged: there
is nothing left unmerged to show. For rapid iteration (merge, deploy, then
review what actually shipped), two per-project settings in Project Settings
change that:

- **Preserve PR Review Diff After Merge** (default off) — the final review
  keeps showing the merged change, frozen at the merge commit, instead of an
  empty diff.
- **Reset Review Baseline On Each Merge** (default on) — every merge + deploy
  pass starts a fresh baseline. After a fail-back the review shows only the
  code changed in response to the failure; the merged change and the fix-up
  render as two labeled sections, never mixed. Turn it off to keep a
  cumulative view of every pass since the first merge instead.

With both defaults untouched, projects behave exactly as before.
