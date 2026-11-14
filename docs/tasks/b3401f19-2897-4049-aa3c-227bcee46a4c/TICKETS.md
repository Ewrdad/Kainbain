# Ticket creation report — Runners are not correctly creating a catalogue

Task: `b3401f19-2897-4049-aa3c-227bcee46a4c` · Stage: Create tickets (docs-only)
Date: 2026-11-13 · Target: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain),
workflow `wf-default` (Feature Pipeline), stage `1` (Idea)

## Sources used

All research read from this task's docs folder:

- `RESPONSE.md` — 5 proven defects + N1–N6, work packages WP-A…WP-G (§4), blocking order (§5)
- `RESPONSE_SURVEY.md` — user decisions (rounds 1+2, q1–q24)
- `WIDE_NET_ANALYSIS.md`, `REPLICATION_GUIDE.md`, `TESTING_GUIDE.md`, `SURVEY.md`

Note: an earlier `TICKETS.md` revision claimed 7 tickets (ids `7bd55423…`,
`c027b1d1…`, etc.) had been created. This run re-checked: `GET
/tasks/7bd55423-5ad0-4d2c-a6e2-99141ee3266b` returns `{"error":"Task not
found"}`, and none of those ids appear in the project. Those tickets never
existed, so this run created the full set for real (ids below).

## Guardrail checks

- API base: skill says `http://localhost:3100`, but this runner host has no
  local engine there (empty response); used the live engine at
  `http://192.168.1.206:3100` (verified serving `/projects`). Project
  `0fd41821…`, workflow `wf-default`, stage `1` (Idea) all resolved by exact id.
- Recursion guard: current task sits in `wf-bug-analysis-599cdd` stage
  `stage-1794587427152` (Create tickets) — different workflow and stage from
  the target. Safe.
- Dedup: all 19 tasks in `wf-default` are `completed`; the only open tasks in
  the project are two audit tasks plus this task. No open duplicates of any
  work package. 7 tickets ≤ 10 cap. Nothing left over (all 7 RESPONSE.md
  work packages ticketed).
- All tickets created with `execute:false` (status `waiting_human` in the Idea
  human stage) and deterministic idempotency keys
  (`sha256(tag|title + stage + currentTaskId)[:32]`), each re-read to confirm
  `currentStageId == 1` and the `blockedBy` list below.

## Created tickets (one per RESPONSE.md work package, with blockedBy wiring)

| WP | Ticket id | Title (= first line of goal) | Blocked by |
|----|-----------|------------------------------|------------|
| WP-E | `99ccc12f-7d71-4781-9b81-9d2902367fba` | Isolate API tests from live engine state files | — |
| WP-A | `ae1ae677-7eb5-432c-b0d5-20c72e833084` | Give runners a build identity and stale-code detection | — |
| WP-B | `77a4072e-3b0b-42b1-bd0b-3b21e129dd4b` | Make runner model discovery reliable and explicit | — |
| WP-C | `94ee5786-309a-4063-85a2-a4062e836c47` | Enforce canonical-id catalogue contract with verified counts | — |
| WP-D | `4ec027a7-0566-4d48-9fbc-37fc95ceea50` | Render runner counts instead of unavailable badges in pickers | WP-C |
| WP-F | `8c7e2d15-3f17-41a1-b905-99ca5e536c83` | Roll out catalogue fix to live runners and purge test entries | WP-A, WP-B, WP-C, WP-E |
| WP-G | `6ba7e727-8b7a-4c46-ad4a-960bcd099bcb` | Enforce verified-only serving in dispatch after cleanup | WP-F |

Blocking implements RESPONSE.md §5 exactly: E/A/B/C start unblocked in
parallel; D merges after C; F runs after A+B+C deployed and E merged
(D preferred but not required, so not a hard blocker — noted in the WP-F
goal); G is decision-gated on F. Blocked tickets cannot execute until their
blockers complete (API enforces 409 while blocked).

Each goal embeds: the RESPONSE.md evidence snippet (N1–N6 / causes), the exact
files owned, the change list, survey constraints (q1/q3–q13 round 1; q15–q24
round 2, incl. q15 warn-only, q18 harness-attribution reconciliation, q23 no
agent-initiated runner restarts), acceptance criteria, and sequencing.

## Sequencing for operators

1. Start WP-E first (prevents re-pollution), WP-A/B/C/D in parallel against
   the WP-C response contract fixtures.
2. Merge WP-D only after WP-C (enforced by `blockedBy`).
3. WP-F only after A+B+C deployed and E merged (enforced by `blockedBy`),
   with explicit human permission; user pre-approved dummy-entry purging
   only — runner restarts must be recommended, not executed.
4. WP-G only after WP-F verification shows healthy discovery (enforced by
   `blockedBy`), pending the human dispatch decision.
