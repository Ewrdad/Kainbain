# RECOUNT — BEFORE (frozen kit, runners still on 0.1.0)

Task `683f0bfd-9132-41e1-b468-2cb8c428e08c` (S5). Run 2026-11-23T11:46:49–55Z by
`bin/fleet-recount.sh before .` against `http://192.168.1.206:3100`, project
`0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (survey q4 answer: same project only, 81
tasks). Raw per-task payloads: `raw/before/*.json` (81 files). Meta:
`recount-before-meta.json` (81 fetched, 0 failed; `recount-before-errors.jsonl`
empty). Machine table: `recount-before-table.json`; rows: `recount-before.jsonl`;
E5 worklist: `recount-before-e5worklist.json` (canonical). Stdout/stderr:
`raw/recount-before-stdout.txt`, `raw/recount-before-stderr.txt`.

## WIDE_NET §2 table — BEFORE 2026-11-23T11:46Z

| Signal | 11-21 baseline (61 tasks, WIDE_NET §2) | 09:04Z before (81 tasks, see REVIEW-20261123T104633Z F6) | **BEFORE 11:46Z (81 tasks)** |
|---|---|---|---|
| Runner-path interrupts | 118 | 145 | **149** |
| With `Reason:` | 49 (all cap) | 70 | **72** |
| Bare (no reason) | 69 | 75 | **77** |
| ≤15 s after `started` | 99 (median 4.7 s) | — | **125 (median 4 s)** |
| ≥2 min after `started` | 15 | — | **18** |
| Post-`finished` interrupts (E5 scope) | — | 19 | **28 (20 tasks)** |
| `Auto-resumed after server restart` | 100 | — | **125** |
| Server-restart interrupts | 0 | 0 | **0** |
| `Execution recovered after server restart` | 0 | — | **0** |
| Death-streak escalations | 42 | — | **49** |
| Per-runner split | local-alpha 96 / server2-alpha 22 | — | **local-alpha 108 / server2-alpha 41** |
| Tasks with `gitFailureStreak` | — | — | **0** |

`reason_vocabulary` (24 distinct strings): **every one is the Cause-1 workdir-cap
string** (`Runner workdir unavailable: Worktree cap reached (~5); …`). →
negative control holds: on the still-deployed 0.1.0 runners, no non-cap reason is
ever emitted; every new interrupt since 11-21 is still bare or cap. This
re-confirms the "until the 0.2.x build lands, every new interrupt is still bare"
premise (fresh bare examples accrued this morning on 0.1.0: `3b82f6ae`
2026-11-23T08:25:23Z server2-alpha, `79c51992` 2026-11-23T09:19:30Z local-alpha).

`server_restart` stays **0** — Cause 6 upkeep: the 11-23 11:36Z backend deploy was
publish-only (no `restart_service`), so no orphan interrupts were manufactured.

## Runner versions at BEFORE time

`bin/runners-snapshot.sh runners-before` → `runners-before/runners-20261123T114612Z.{json,tsv}`,
`deploy-status-20261123T114612Z.json`, `verdict-20261123T114612Z.{json,txt}`:

- `local-alpha` active, `runnerVersion 0.1.0`, build `fbcf8442ee031e2edbc9f0b30195afa410296cf3`
  (built 2026-11-14) — `git merge-base --is-ancestor 046a6391 fbcf8442…` → **NO** →
  NOT-CONVERGED.
- `local-bravo` active, same 0.1.0 build (not a named S5 runner).
- `server2-alpha` active, `runnerVersion 0.1.0`, **no build sha reported** →
  verdict "cannot verify the fix is in the running build" → NOT-CONVERGED.
- Fleet knobs at BEFORE: `recommendedVersion 0.1.0`, `minimumVersion 0.1.0`,
  `availableVersions ["0.1.0"]`, `updateAvailable false`, `pendingCommands []`
  on all active runners — **no update nudge pending**.
- Backend: `GET /deploy/status` build **637**, deployed 2026-11-23T11:36:08Z,
  `lastResult.headSha 6558033…` ("Publish-only deploy (registry + dist)
  complete"), `engine.updatedAt 2026-11-23T11:36:20Z`.

## Re-run commands (frozen kit, identical for AFTER)

```bash
cd docs/tasks/683f0bfd-9132-41e1-b468-2cb8c428e08c
bash bin/runners-snapshot.sh runners-after --require-converged   # exit 0 only when both named runners converged
bash bin/fleet-recount.sh after .                                 # -> recount-after-table.json etc.
bash bin/e5-sweep.sh local  <prefixes...>                         # E5 sweep, local host
bash bin/e5-sweep.sh server2 <prefixes...>                        # E5 sweep, server2 host (ssh)
bash bin/tests/run-tests.sh                                       # kit self-tests (71 checks)
```

Kit regression pin: T1/T10 reproduce `recount-before-table.json` from
`raw/before/*.json` exactly (suite log `raw/tests-run-20261123T115031Z.log`,
`RESULT: 71 passed, 0 failed`).
