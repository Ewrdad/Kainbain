---
title: Meta Ray-Ban Display Mode
section: working-with
order: 11
slug: meta-rayban-display
---

# Meta Ray-Ban Display Mode

KainBain has a dedicated lightweight UI mode for a roughly square
600 x 600 pixel canvas, such as a Meta Ray-Ban display.

## How it activates

The mode is automatic. Any viewport that is roughly square and close to
600 x 600 pixels switches to it; desktop widths, phones, and tablets keep
their existing UI unchanged.

## What it shows

- **Task list** (observability home): the running task name and current
  step, Running / Waiting for review / Failed counts, a short tap list of
  tasks needing attention, and a View button.
- **Quick review**: task name, `Step N of M` progress, at most two short
  summary lines, and extra-large Approve / Details buttons.

## Approval safety

Approve is never one tap. It opens an "Are you sure?" confirmation before
calling advanceTask. Details stays read-only and points to a larger screen
for the full diff, files, and comments.

## Refresh

Both screens refresh by themselves about every five seconds. Refresh pauses
while the tab is hidden or while a confirmation is open, and never overlaps
an in-flight refresh.
