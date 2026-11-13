# Ticket creation report — Runners are not correctly creating a catalogue

Task: `b3401f19-2897-4049-aa3c-227bcee46a4c` · Stage: Create tickets (docs-only)
Date: 2026-11-13 · Target: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain),
workflow `wf-default` (Feature Pipeline), stage `1` (Idea)

## Sources used

The task docs folder is absent from this checkout's HEAD (local branch tip is a
`kb/55460086…` commit) but present on `origin/kb/b3401f19-2897-4049-aa3c-227bcee46a4c`.
All research below was read read-only from that remote branch:

- `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/RESPONSE.md` — 5 proven defects + N1–N6, work packages WP-A…WP-G
- `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/RESPONSE_SURVEY.md` — user decisions (rounds 1+2, q1–q24)
- `WIDE_NET_ANALYSIS.md`, `REPLICATION_GUIDE.md`, `TESTING_GUIDE.md`, `SURVEY.md`

Note: earlier human rejections ("Response.md not present") refer to this same checkout gap;
the files exist on the remote branch and were used in full here.

## Guardrail checks

- API base: skill says `http://localhost:3100`, but this is a runner host with no local engine;
  used the engine from `KAINBAIN_RUNNER_BACKEND` (`http://192.168.1.206:3100`). Project, workflow
  `wf-default`, and stage `1` (Idea) all resolved by exact id.
- Recursion guard: current task sits in `wf-bug-analysis-599cdd` stage `stage-1794587427152`
  (Create tickets) — different workflow and stage from the target. Safe.
- Dedup: all 19 tasks in `wf-default` are `completed`; the only open tasks in the project are
  two audit tasks plus this task. No open duplicates of any work package. 7 tickets ≤ 10 cap.
- All tickets created with `execute:false` and deterministic idempotency keys
  (`sha256(tag|title + stage + currentTaskId)[:32]`), each re-read to confirm `currentStageId == 1`.

## Created tickets (one per RESPONSE.md work package)

| WP | Ticket id | Title (= first line of goal) |
|----|-----------|------------------------------|
| WP-E | `7bd55423-5ad0-4d2c-a6e2-99141ee3266b` | Isolate API tests from live engine state files |
| WP-A | `c027b1d1-3fcb-4712-9083-6333d1013264` | Give runners a build identity and stale-code detection |
| WP-B | `4f86c346-e917-4700-a418-83185c1ed1ec` | Make runner model discovery reliable and explicit |
| WP-C | `89ed9a3d-505e-4499-bff2-f7010f536596` | Enforce canonical-id catalogue contract with verified counts |
| WP-D | `d3e17b8f-0748-4f2e-9e11-dbaaff6af565` | Render runner counts instead of unavailable badges in pickers |
| WP-F | `09eaf195-335a-45d6-804d-430f5ecbd748` | Roll out catalogue fix to live runners and purge test entries |
| WP-G | `9351cd35-5803-4e3c-9167-637ca3d66432` | Enforce verified-only serving in dispatch after cleanup |

Each goal embeds: the RESPONSE.md evidence snippet (N1–N6 / causes), the exact files owned,
the change list, survey constraints (q1/q3–q13 round 1; q15–q24 round 2, incl. q15 warn-only,
q18 harness-attribution reconciliation, q23 no agent-initiated runner restarts), acceptance
criteria, and sequencing (E/A/B/C/D parallel, D merges after C, F blocked on A+B+C+E, G gated on F).

## Sequencing for operators

1. Start WP-E first (prevents re-pollution), WP-A/B/C/D in parallel.
2. Merge WP-D only after WP-C.
3. WP-F only after A+B+C deployed and E merged, with explicit human permission; user
   pre-approved dummy-entry purging only — runner restarts must be recommended, not executed.
4. WP-G only after WP-F verification shows healthy discovery, pending the human dispatch decision.
