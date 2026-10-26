# Review page 
The goal of the review page is to allow for reviewing recent tasks and finding ways to improve, learn and make greater efficencies. 

## Design

```excalidraw
url:Projects/Personal/KainBain/UI/ReviewPage.excalidraw
height:500px
```


## Key elements

### Task histories

A birds eye overview of past tasks that could allow you to find similarities or differences to identify where things failed.

Individual tasks must be also selectable so that they can be context for chat and quick actions

## quick actions

This can be things such as “undo this task” or maybe “find trends here” .... I am unsure and those are probably bad ideas but wanted to reserve space for button like actions


## chat

This is an ai agent which you can chat with to try and find trends. This should use existing harness integrations however i imagine not all harnessess would work  

the main thing the ai agent can do i suggest/create tickets based on talking with the user 
## Implementation status (v1 — implemented)

Live at `/retrospective` (view id `retrospective`, 🔍 tab, keyboard `R`) — deliberately NOT `/review`, which would collide with the per-task PR review at `/tasks/:id/review`.

Covered by v1:

- **Task histories** — bird's-eye list of duration-enriched summaries (`GET /tasks`), per-stage duration bars with FAILED markers, wall-clock vs active totals, stats strip, client-side sort/filter (recency, status, workflow), checkbox multi-select as shared context, expandable rows hydrated via `GET /tasks/:id`, deep-link to the full task view.
- **Quick actions** — `quickActions` registry plus three actions: "Find trends in selection" (seeds chat, no backend), "Open task detail" (navigates), "Create follow-up task" (plain `POST /tasks` ticket — NOT the executing `/follow-up` endpoint). Disabled states carry reasons.
- **Chat** — stateless turns via `POST /retrospective/chat` (transcript + selected `taskIds` resolved through the harness registry on an ephemeral session), harness/model picker reusing `ModelSelector`, 501 `unsupported_by_harness` degraded notice for non-chat harnesses, and ticket-suggestion cards with Confirm/Edit into `POST /tasks` (never created unconfirmed).

Deferred (follow-up tasks, not v1):

- "Undo this task" — no safe rollback primitive exists (`failback` re-runs work, `abort` kills); needs a reviewed semantic before any action ships.
- Streaming chat replies (SSE) — v1 is single-shot per turn.
- Extra quick actions beyond the v1 three — the registry makes them one-object additions.
