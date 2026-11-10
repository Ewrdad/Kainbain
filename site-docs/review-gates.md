---
title: Review Gates
section: working-with
order: 50
slug: review-gates
---

# Review Gates

`human` stages and checkpoints park a task in `waiting_human` until you decide. Nothing advances past you silently. For hand-editing files outside a review comment, see `#/docs/develop-alongside`.

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
(Files & Repos tab) change that:

- **Preserve PR Review Diff After Merge** (default off) — the final review
  keeps showing the merged change, frozen at the merge commit, instead of an
  empty diff.
- **Reset Review Baseline On Each Merge** (default on) — every merge + deploy
  pass starts a fresh baseline. After a fail-back the review shows only the
  code changed in response to the failure; the merged change and the fix-up
  render as two labeled sections, never mixed. Turn it off to keep a
  cumulative view of every pass since the first merge instead.

With both defaults untouched, projects behave exactly as before.

## Automatic approval after a hold

A `human` stage can carry an optional hold (`autoApproveAfterMs`): when a
task has waited at that checkpoint for the full hold, the backend approves
it automatically. Two uses: soak a change ("exist in prod for a week or two
before I mark it as done") and speak-now-or-forever-hold-your-peace pauses
(get advice, assume silence means go). Default is off — stages without a
hold wait forever, exactly as before.

- **Set it per stage** (same every run): an integer millisecond count, or a
  human duration string like `10 days`, `36 hours`, `1 week`, `90m` (bare
  numbers mean milliseconds). Saves refuse garbage, sub-minute holds
  (minimum 60s), and holds over 365 days with 400.
- **The deadline is a minimum, never exact**: the hold is stamped once when
  the task enters the stage (`autoApproveAt = enteredStageAt + hold`) and
  the timer may fire a little late under load — never early. A 10-day hold
  always lasts at least 10 days.
- **Mid-wait edits don't shorten a live wait**: the stamp is immutable for
  that visit, so changing the hold (or removing it) affects only future
  entries. Tasks already waiting when you configure a hold get no stamp
  until they next enter the stage — move them out and back in to start one.
- **Humans always win the race**: approve or reject early as normal and the
  timer is cancelled — no double-advance, no auto-approve after you acted.
  Pausing, aborting, moving, or completing also cancels the wait.
- **One reminder**: shortly before the deadline (24h out, or half the hold
  for short holds) a `task.auto_approve_soon` webhook fires once per wait,
  naming the deadline. Set `KAINBAIN_AUTO_APPROVE_REMINDER_LEAD_MS=0` to
  turn reminders off.
- **Audit trail**: the history line, timeline row (badged `automated`), the
  `# Human approval (automatic)` report, and the `task.auto_approve`
  webhook all name the hold, the deadline, and the fire time.

Operators: the sweeper runs on its own slow cadence
(`KAINBAIN_AUTO_APPROVE_SWEEP_MS`, default 60s; `0` disables it while
stamps persist) and advances at most `KAINBAIN_AUTO_APPROVE_BATCH`
(default 25) tasks per pass, oldest deadline first. Health is visible in
`GET /engine/state` (`autoApproved`, `autoApproveDeferred`, …). Restarts
are safe: deadlines live on disk, so the first sweep after boot fires
overdue waits oldest-first.
