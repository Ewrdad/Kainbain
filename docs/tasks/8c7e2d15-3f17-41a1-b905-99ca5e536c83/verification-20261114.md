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


## Addendum 2026-11-14 (WP-F runbook completion attempt — safe subset)

- Permission record written: `permission-wpf-phase4-20261114.md` (scope: purge + read-only only; restarts operator-only).
- Bundle staged: `dist/kainbain-runner-fbcf8442.tar.gz` (sha256 `ac919e2ad17bf1674ed351e148fa65445db868d93b8c9b7f44a94cfd43ade402`) pushed to server2 at `~/kainbain-runner-fbcf8442.tar.gz` (operator extracts per handoff Bundle B).
- server2 pi leg dependency staged: copied `@earendil-works/pi-coding-agent` from `runner.prev` into `/home/server2/apps/kainbain/runner/api/node_modules/@earendil-works/` (future restart will resolve). `runner-prev` build is legacy (`f430f537`, no `build.sha`); full Bundle B reinstall + restart still required by operator to reach `fbcf8442` identity.
- Purge: `DELETE /runners/models/catalogue/muse::meta::test-fleet-model` returns 404 `UNKNOWN_MODEL` — already absent (verified). Catalogue remains 123 models, 2 quarantined, 0 `test-fleet` entries. Quarantined bare/provider entries and revoked `test-fleet-muse` deliberately left per permission scope.
- Live runner health this run:
  - `local-bravo`: PASS (`modelSource discovered`, discoveryStatus all 4 harnesses `ok:true`, build.sha `fbcf8442`, `codeChangedSinceBoot:false`).
  - `local-alpha`: FAIL — still booting the checkout daemon (17-model pin in process env, no `modelSource`/`build`/`codeChangedSinceBoot`). Service unit already points at `runner-install/local-alpha` and env file + systemd user env are pin-clean; **operator restart (safe window) required** — agent will not restart the runner it runs on (survey q1/q23).
  - `server2-alpha`: PARTIAL — discovery `muse ok:true` (6), `pi` still `ERR_MODULE_NOT_FOUND` until Bundle B reinstall+restart; no `build.sha`. Node module staged above; version identity pending reinstall.
- Suites this run: runner 412/412 pass; dispatch 175/175 pass; projects 97/97 pass; runnerRoutes+isolation 65/65 pass; guard 8/8 pass; frontend fleetModelOptions+ModelSelector 91/91 pass. WP-E guard green.
- §6.3: fixture evidence unchanged (WP-D integrated in build 637); operator live look still required post-purge/restart.
- §6.4: fixture dry-run PASS unchanged; live rerun pending until local-alpha/server2 restart receipts.
- Conclusion per q6: §6.1 has failing items against TWO live runners (not one product defect) — blocked on operator restart receipts for `local-alpha` (self-host safety) and `server2-alpha` (Bundle B + restart). §6.2 PASS. WP-G remains **NOT READY** until those receipts arrive; see `wp-g-readiness-20261114.md` (to be superseded on receipt).
## Addendum 2026-11-14 (safe live + suite rerun)

- Engine backup recorded: `/home/server/.kainbain/backups/wp-f-phase4-20261114-1321/{runners.json,fleet-catalog.json}` (SHA256 in same dir).
- Systemd user env pin removed (`KAINBAIN_RUNNER_MODELS`) so the next restart runs discovery-driven (see operator-handoff addendum).
- `GET /runners/models/catalogue` (`api-runners.json` snapshot): 123 models, 2 quarantined, zero `test-fleet` entries — `muse::meta::test-fleet-model` already absent. `test-fleet-muse` runner record still revoked (no runner DELETE endpoint exists; left per audit, no catalogue re-pollution).
- `touch` WP-E guard (isolation) rerun: 2/2 pass; engine dir untouched.
- Full suite rerun this run: `runner/` 412/412 pass; `api/flow/dispatch/` 175/175 pass; `api routes/projects + runnerRoutes + isolation` pass; frontend `fleetModelOptions + ModelSelector + FleetCatalogueSection` 88/88 pass.
- Runner health (§6.1) remains open until the operator executes the restart bundle `operator-handoff-20261114.md`: `local-alpha` process is still the old checkout build (pinned 17-model env), `local-bravo` is operator-paused. No agent-executed restarts (survey q1/q23).
