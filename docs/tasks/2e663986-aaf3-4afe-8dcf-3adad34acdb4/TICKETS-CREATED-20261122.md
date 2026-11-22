# Tickets created — interruption follow-ups for 2e663986

Date: 2026-11-22. Source: `RESPONSE.md` (S1–S7), `WIDE_NET_ANALYSIS.md`,
`GUIDE-01`–`GUIDE-07`, `TDD-TEST-EXAMPLES.md`, `RESPONSE_SURVEY.md`
(questions q1–q9, unanswered at creation time — each ticket cites its
survey question so the implementing agent can check for answers).

Target: project `0fd41821` (kainbain) / workflow `wf-default` / stage `1` (Idea).
API base used: `http://192.168.1.206:3100` (`localhost:3100` refused
connection from this runner; 192.168.1.206 is the backend host per the
runner env). All tickets created with `execute:false`, deterministic
`idempotencyKey = sha256(tag|1|<srcTask>)[0:32]`.

Dedupe: listed 71 tasks in wf-default; no open ticket duplicates S1–S7.
Two adjacent open tickets noted, not duplicated (referenced in goals):
`e3d4e9db` (runner-side setup-failure backoff — S1 is the backend-side
counterpart) and `fd5a74bf` (restart-storm detection observability).
Recursion guard: current task runs in `wf-bug-analysis-599cdd`,
stage `stage-1794587427152` — target stage `1` in `wf-default` is distinct.

## Created (8 of max 10)

| Tag | Ticket id | Title |
|---|---|---|
| S1 | `3b82f6ae-8c54-44bf-b283-0ffab76e7ab7` | Stop counting worktree-cap refusals as runner deaths; add re-dispatch backoff |
| S2 | `d164fb3f-ed08-4221-814e-e9e3a5d75a1a` | Fix the 413 completion-payload loop: raise limit, shrink payload, never crash on 413 |
| S6 | `79c51992-ab52-4f97-b35e-5a2aa605505d` | Fix misleading resume label and Tried-N-times inflation in task UI |
| S7 | `05b5d046-9480-40e3-8ec9-c06596c51acc` | Regression-pin boot reconcile so server-restart orphans stay at zero |
| S3 | `d9a9869c-46d3-4a57-9a69-a1a1ef87f9f8` | Investigate local-alpha setup-phase deaths via prod journal (evidence first) |
| S5 | `683f0bfd-9132-41e1-b468-2cb8c428e08c` | Roll out 0.2.x runners and run fleet before/after interrupt recount |
| S4 | `78eac844-250a-44d1-810e-6f047eb5a59e` | Make in-assignment transient backend errors non-fatal to the runner |
| S3b | `810acb8f-9e6d-4ee0-8d80-4dddf8b1693b` | Fix the named local-alpha setup-phase fault found by the journal investigation |

Verified via `GET /tasks/<id>`: all have `currentStageId: "1"`,
status `waiting_human` (stage 1 is a human stage).

## Blocking

- `810acb8f` (S3b) has `blockedBy: ["d9a9869c-…"]` (S3) — verified on re-read.
  This is the only true code dependency per RESPONSE.md ("S3b is the only
  task blocked on another task's output").
- Deliberately NOT encoded as blocks: S5 "enables" prod confirmation of
  S2/S3/S4, but code work proceeds in parallel (per RESPONSE.md §Blocking
  map), so blocking would wrongly serialize them — recorded as coordination
  notes in the goals instead. S4's sequencing with `db49d6c6` needs no
  block (that task is completed) — recorded as a must-read in the goal.

Each ticket goal's first line is its one-line title, and includes an
evidence snippet from RESPONSE.md plus file/test references for the
implementing agent.
