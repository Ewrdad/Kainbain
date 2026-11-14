# WP-F Phase 5 — Verification vs RESPONSE.md §6 (2026-11-14)

Agent-safe subset only: live READS + fixtures + suites. Live mutation
(Phase 2–4) is operator / permission-blocked — see `gates-20261114.md` §2.
Per q6, any FAIL below stops the rollout; none of them is spuriously
failed — each names its unblocker.

## §6.1 Runner health — FAIL (live), unblocked by operator Phases 2–3

`GET /runners` 2026-11-14 ~11:30Z (raw in backups dir):

| Runner | modelSource (want discovered/pinned+discovered) | discoveryStatus (want per-harness ok:true) | versions.build.sha (want deployed commit) | codeChangedSinceBoot (want false) |
|---|---|---|---|---|
| local-alpha | absent — FAIL | absent — FAIL | absent (0.1.0, no build) — FAIL | absent — FAIL |
| local-bravo | absent — FAIL | absent — FAIL | absent (0.1.0, no build) — FAIL | absent — FAIL |
| server2-alpha | `discovered` — PASS | muse ok:true PASS; pi ERR_MODULE_NOT_FOUND (N3 live) — FAIL | absent (0.1.0 @ f430f537, no build) — FAIL | absent — FAIL |

Note: `/status` `build.commit` (`1.0.0-28aac94`) is STALE (proven in
gates doc) — the §6.1 sha comparison must use the deploy-log true commit
(likely `b64cae26`) once runners report a build. Dry-run lesson for
receipts: confirmation needs a FRESH leg (`atMs` within the stale window);
a stale leg reads `unknown` → 0 runners even with provenance present.

## §6.2 Catalogue hygiene — 1 ITEM FAILING (the purge target), rest PASS

`GET /runners/models/catalogue` (~11:30Z): 124 models, 2 quarantined.

- Bare/provider forms in `models[]`: ZERO — PASS (WP-C holds; the two
  offenders sit correctly quarantined with `not harness-qualified`).
- Every entry `harnesses.length === 1` — PASS.
- `test-fleet-model`: PRESENT (`muse::meta::test-fleet-model`, runnerCount
  0, provenance `test-fleet-muse`) — FAIL, expected: this is the Phase 4
  purge target, blocked on permission + Phase 3 receipts.

## §6.3 UI pass — PENDING operator (fixture evidence PASS)

Agent did not spawn servers (stage guidance). Fixture evidence: WP-D
merged + deployed (build 637 ≥ `b64cae26` behaviourally — catalogue serves
the WP-D contract); `ModelSelector.test.jsx` 60/60 pass (incl. "0
runners" grey rendering); fleetModelOptions suites 22/22 pass. Operator
live look still required post-purge: Muse picker harness badge "N
runners", `muse-ember` with "N runners", no gemma4/deepseek/test-fleet
rows, dropped models grey "0 runners" with "Remove permanently".

## §6.4 Regression — PASS on fixtures, live re-run PENDING post-purge

`/tmp/wpf-dryrun.mjs` (DRY-RUN PASS, memory store + /tmp file, repo's own
`createFleetModelSnapshotStore` + `fleetRunnerRecord`): drop → entry stays
at 0 runners; `remove()` → gone, second call false (204-then-404
semantics); re-advertise → back. Same script also proved migration-on-load
(bare/provider → quarantine, fan-out → `[harness]`) and a §3.2 scan
helper. Live re-run after Phase 4 per plan.

## §6.5 Suites — PASS

| Suite | Command | Result |
|---|---|---|
| runner/ | `node --test runner/*.test.js` (19 files, gate list) | 412/412 pass |
| api/flow/dispatch/ | `npm run test --prefix api -- flow/dispatch` | 17 files, 175/175 pass |
| api/routes/projects.* + runnerRoutes + WP-E guard | `npm run test --prefix api -- routes/projects flow/engineStateIsolation flow/runnerRoutes` | 15+ files incl. guard 2/2, runnerRoutes 63/63 (DELETE route tests), historically-polluting alias+modelCombination suites — all pass |
| frontend fleetModelOptions + ModelSelector | `npm run test --prefix frontend -- fleetModelOptions ModelSelector` | 5 files, 91/91 pass (ModelSelector 60/60) |
| FULL api suite | `npm run test:api` | 443 files, 7167 pass, 3 skipped, 0 fail |
| FULL frontend suite | `npm run test:frontend` | 346 files, 4724/4724 pass |
| WP-E no-touch proof | guard test + external mtime diff of `/home/server2/.kainbain/engine/*.json` before vs after EVERY suite above | `ENGINE-DIR-UNTOUCHED-ALL-SUITES` |

## Stop/go per q6

STOP — §6.1 fails on all three live runners and §6.2 retains the purge
target. Both fail for the same scheduled reason: operator Phases 2–3 not
yet executed, Phase 4 permission not yet recorded. No product-code defect
found: every named and full suite passes. Next: operator executes
`operator-handoff-20261114.md`, returns receipts; a fresh run with
recorded permission performs Phase 4 + live §6.4 + §6.3 confirmation.
