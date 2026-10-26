---
title: Retrospective Review
section: working-with
order: 55
slug: retrospective-review
---

# Retrospective Review

The Retrospective page (`#/retrospective`, keyboard `R`, or the 🔍 tab) closes the improving feedback loop: review recent tasks, spot failure and efficiency patterns, and turn insights into new tickets.

## Mobile layout

On phones the three panes collapse behind a **Histories / Actions / Chat** tab strip — one pane visible at a time, and the page scrolls vertically so long panes stay reachable. Tabs are full finger-sized targets, and every primary control (filters, quick actions, chat send, ticket confirm) keeps at least a 44px touch height. Switching tabs never loses state: selections, chat drafts, and transcripts stay put. On desktop the strip hides and all three panes sit side-by-side exactly as before.

## Task histories

The left pane lists recent tasks with per-stage duration bars — the bird's-eye overview. Totals read as wall-clock with active time in brackets (e.g. `8h (1h 17m active)`); failed stages carry a `FAILED` marker. Use the sort and status/workflow filters to narrow the list, expand a row for inline stage detail, or open the full task view with `Open ↗`.

Tick a task's checkbox to select it as context for quick actions and chat. To find recent work, keep the **Most recent** sort and narrow with the status/workflow filters; ticked checkboxes pin focused context.

With nothing selected, quick actions stay disabled and explain this inline — but the chat still works (see below).

### Stage types filter

The **Stage types** toggle above the list hides whole stage types — for example, hide slow human approvals to compare how CI durations trend as the project grows. Hidden types drop out of the duration bars in place and the remaining bars re-scale to the longest visible stage, so comparisons stay meaningful. Task totals and the stats strip always describe the whole task, including hidden stages.

Your choices persist in this browser's localStorage across reloads, and the `?show=` URL parameter makes shareable filtered links (e.g. `#/retrospective?show=ci,deploy` shows only CI and deploy stages). Operators can hide the toggle entirely with `VITE_ENABLE_STAGE_VISIBILITY_TOGGLE=0`, which restores every stage type.

## Quick actions

Three one-click actions work off the current selection:

- **Find trends in selection** — seeds the chat with a trends prompt over the selected tasks (needs at least one).
- **Open task detail** — jumps to the full view (needs exactly one).
- **Create follow-up task** — files a plain ticket referencing the source task (needs exactly one). This creates a ticket only; it never runs agent work.

Disabled buttons name what they need in their tooltip.

## Chat

Chat with an AI agent about the selected tasks. Click **Use selection (N)** to pin the current selection as chat context (remove chips individually to narrow it), pick a harness and model, and send. Each turn is stateless — the page holds the transcript and the server folds it plus the task context into one prompt.

When the agent proposes follow-up work it returns ticket drafts as suggestion cards: **Confirm ticket** files the ticket on the board, **Edit** adjusts the title and goal first. Nothing is ever created without your Confirm click.

### No tasks selected

Quick actions remain disabled until at least one task is pinned, but the chat still works with no selection. The agent may list recent jobs itself (bounded to recent rows via the task API) and cite the task ids it inspects — so for a broad review, leave nothing selected and ask for general trends across recent jobs, e.g. "What are the general trends across recent jobs?"

Some harnesses can't chat — if yours can't, you'll see a notice instead of a reply. Switch to a chat-capable harness; histories and quick actions keep working regardless.

## Chat reliability

Chat turns degrade gracefully instead of failing opaquely:

- **Cancel** stops a pending turn silently — your message drops back into the input box so nothing is lost.
- **Retry** re-sends the identical turn after a failure. Turns run with no timeout — a turn settles when the model answers or when you cancel it (a 504 names an operator-imposed server ceiling, only when one is set).
- While a turn is pending, an "Agent working" card shows elapsed time plus the model's scrolling live output (harnesses that stay silent until they finish show honest idle copy instead); slow turns run as long as they need, and the settled reply replaces the card in place. **Cancel** stops the turn and drops your message back into the input box.
- You can navigate away mid-turn — the turn keeps running, and a toast when it settles offers a way back to the chat. A reload restores the transcript but marks the in-flight turn interrupted with Retry (turns can't survive a reload).

- When the model streams output before an interruption, failure, or empty reply, the chat shows that partial output — inside the failure notice, or under the reply — instead of swallowing it.
- **Clear chat** resets the transcript, context chips, and notices — the escape hatch for poisoned context.
- A turn that references a deleted task prunes the stale chip with an inline notice instead of erroring; when the task context is truncated to fit the budget, a notice names how many tasks were injected.
- An empty model reply renders a "no content" state with its own Retry — never a blank bubble.
- The transcript, chips, and picker survive reloads and navigation (per-project, this tab only); a turn that was in flight across a reload restores as interrupted with Retry. Corrupted saved state starts fresh.
- The message list only auto-scrolls when you are already near the bottom; otherwise a **↓ New reply** button jumps to the latest reply.
- If your requested model is unavailable, the turn answers on the session default and says so under the picker.
- Operator ceilings: chat turns have no timeout by default — `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS` is `0` (disabled). Set a positive value to re-impose a server turn ceiling (keep `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS`, also `0` = disabled, above it, or long turns die with a bare 408 instead of a structured 504). Reverse proxies in front of the API may still impose their own idle ceilings. Antigravity chat turns additionally cap at the harness's own `KAINBAIN_AGY_PRINT_TIMEOUT` (default 10 min); raise it for longer antigravity chats.

Input is capped at 8000 characters per message (live counter under the box); the transcript holds the last 50 messages.

## Task lookup skill

Every chat turn carries the `retrospective-task-lookup` skill, which teaches the agent how to read the injected task context (status, stage, goal, failure evidence, stage durations, report statuses, recent history) and how to look up deeper detail — report bodies and task files under `docs/tasks/<id>/`, or the task/observability API — on harnesses whose sessions have tools. Pin tasks with **Use selection (N)** for grounded answers: the agent cites task ids for every claim and says "not in the provided context" rather than guessing about tasks outside it. With no tasks selected, the same skill teaches the agent to list recent jobs itself (`GET /tasks?projectId=…`, `GET /tasks/queue`) before deep reads.
