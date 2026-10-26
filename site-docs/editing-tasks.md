---
title: Editing Tasks & Unsynced Drafts
section: working-with
order: 68
slug: editing-tasks
---

# Editing Tasks & Unsynced Drafts

The task goal editor (on the full task page and in the slide-over inspector)
never loses your text to a slow connection. Every keystroke is written to a
local draft immediately, and that draft is deleted only after the API confirms
the save.

## The invariant: write on edit, delete on confirm

1. **On every keystroke** the goal/title is cached in the browser's
   `localStorage` under a per-task key: `kainbain:task-draft:<taskId>`.
   The write is synchronous, so closing the editor straight after typing still
   keeps the text.
2. **On save success** (the `PATCH /tasks/:id` returns 2xx) the cache entry is
   removed. The server value then becomes the source of truth.
3. **On failure or offline** the cache entry stays. Reopening the task
   restores the text and re-attempts the save.

A draft that was already on the server when the task is reopened (the
confirmation was lost, not the edit) is simply cleared.

Approving or rejecting a task also pushes any draft an editor left behind
(closing the inspector before the save landed), so a checkpoint never advances
on the old goal.

## What "Unsynced changes" means

While a draft exists that the backend has not confirmed, the goal section shows
an amber **Unsynced changes** badge. It appears as soon as you type, survives a
close/reopen, and disappears the moment the API confirms the save. An edit in
one browser tab also updates an open editor in another tab through the shared
storage event.

## How the cache stays small

The draft namespace is bounded so it can never slow the app down:

- **One entry per task**, overwritten in place on each keystroke.
- **Entry cap of 50**: creating a new draft evicts the least-recently-edited
  draft past the cap.
- **7-day time-to-live**: a draft untouched for a week is discarded.
- **Board-load sweep**: drafts whose task no longer exists (deleted tasks) are
  dropped when the board loads. Deleting a task clears its draft immediately.

## Conflict behaviour

Saves are last-writer-wins with a visible signal, not a merge UI. A concurrent
remote edit is never applied over a local draft while the draft is
outstanding — the badge tells you the value on screen is still local. If a
second keystroke lands while a save is in flight, the confirmation for the
first save keeps the newer draft, so the later edit is never deleted with it.

## Related

- `#/docs/submit-track-task` — creating and tracking tasks.
- `#/docs/task-dependencies` — blocking a task on other tasks.
