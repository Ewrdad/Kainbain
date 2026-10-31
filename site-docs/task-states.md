---
title: Task States and Retry
section: working-with
order: 42
slug: task-states
---

# Task States and Retry

A task's scheduler identity is `task.status`. Whether a retry is pending is a
separate annotation, `task.retryState`. The two together answer "what is this
task doing" — the status alone cannot, which is why tasks used to look stuck
on retry.

## Scheduler statuses

| Status | Meaning | Runnable? |
| ------ | ------- | --------- |
| `idle` | Created but not yet placed in a stage | no |
| `in_stage` | Sitting in a stage awaiting (re)dispatch | yes |
| `waiting_human` / `checkpoint` | Paused at a human or review gate | no |
| `advancing` | Moving to the next stage | transient |
| `blocked` | Held by unfinished blockers | no |
| `paused` | Paused deliberately | no |
| `interrupted` | Interrupted; resumable through the continuity path | sometimes |
| `failed` | Current stage failed and parked; use retry or failback | no |
| `passed` / `completed` / `done` | Through its pipeline | no |

## Retry states

| Retry state | Meaning |
| ----------- | ------- |
| `none` | No retry in flight or scheduled |
| `scheduled` | A retry is armed and waiting for its `nextRetryAt` deadline |
| `running` | A retry attempt is currently running |
| `exhausted` | The retry budget ran out and the task parked as `failed` |

The board and the task card derive the display from both fields: a scheduled
retry in `in_stage` reads `RETRYING (scheduled) 2/5 · in 12s`; a parked task
reads `FAILED` even if an old retry flag lingers on the record. A settled
task never shows a retry badge.

## Transition rules

- Every retry goes through one helper (`armRetry`), which always records the
  `nextRetryAt` deadline — even when the engine is stopped, so the retry is
  picked up on restart instead of dropped.
- Every terminal outcome (`failed`, exhausted budget, operator move,
  `interrupted`) clears the retry schedule first.
- A manual retry (`POST /tasks/:id/retry`) keeps its history, resets the
  retry budget, and reads `RETRYING (manual)` while pending.
- A retry whose deadline passed long ago while the engine was down parks as
  `failed` on the next boot instead of retrying forever.
