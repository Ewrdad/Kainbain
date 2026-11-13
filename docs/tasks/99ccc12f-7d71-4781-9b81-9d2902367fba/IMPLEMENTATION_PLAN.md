# IMPLEMENTATION_PLAN — Isolate API tests from live engine state files

Task: `99ccc12f-7d71-4781-9b81-9d2902367fba` · Parent bug: task `b3401f19` ("Runners are not correctly creating a catalogue") · Source work package: WP-E (cause N5).
Merge priority: FIRST — every suite run re-pollutes production; blocks WP-F (cleanup must not be re-polluted).

## 1. Goal

No API test may read or write live engine state under `~/.kainbain/engine/`
(`runners.json`, `fleet-catalog.json`, `claims.json`, `steers.json`, `seed-demo.json`
marker, `circuit.json`). After this change, the standard suite runs fully against
per-test temp state files, and any future store that resolves a live engine path
under test fails loudly instead of silently polluting production (survey q14:
dummy/test models must never appear in production).

## 2. Success Criteria

1. `api/testSetup.isolation.js` points EVERY engine state file at per-test temp
   paths (runner/claims/steer/fleet-catalogue; circuit already done).
2. A structural guard in `api/flow/resolveStatePath.js` throws when `VITEST` is
   set and the resolved path is under `~/.kainbain/engine/`.
3. A new guard test imports `api/index.js` under the standard setup, registers a
   runner, and asserts nothing under `~/.kainbain/engine/` changed (mtime +
   content comparison).
4. Guard test written first FAILS on current code (a `projects.alias.test.js`
   run changes live mtimes), then PASSES after the fix.
5. Full `api` suite passes with the throw-guard active; lint passes.
6. Verification runs leave live engine files byte-identical (snapshot/restore
   around every red-run).

## 3. Verified current-state evidence (read 2026-11-13, branch kb/99ccc12f-*)

- Root cause CONFIRMED: `api/testSetup.isolation.js` (global `setupFiles`
  backstop, `api/vitest.config.js:34`) sets `PROJECTS_ROOT`, `NOTES_SPACE_ROOT`,
  `KAINBAIN_CIRCUIT_STATE_FILE`, `KAINBAIN_PROJECTS_REGISTRY_FILE`,
  `KAINBAIN_PROMPT_LAYOUT_DIR` — but NOT `KAINBAIN_RUNNER_STATE_FILE`,
  `KAINBAIN_CLAIM_STATE_FILE`, `KAINBAIN_STEER_STATE_FILE`, or
  `KAINBAIN_FLEET_CATALOG_FILE`. `grep` for `KAINBAIN_FLEET_CATALOG_FILE` in that
  file prints nothing, as RESPONSE.md §3.4 states.
- Polluters CONFIRMED: `api/routes/projects.alias.test.js` and
  `api/routes/projects.modelCombination.test.js` do NOT import
  `isolatedTestRoots.js`; they mint only projects/notes roots, then register
  runner `test-fleet-muse` with model `muse::meta::test-fleet-model` via
  `/runners/register`. With no env override, `config.runnerStateFile` /
  `config.fleetCatalogFile` fall back to the schema defaults
  (`api/config/schema.js:1400-1431`) → live `~/.kainbain/engine/*.json`.
- Blast radius: 440 `*.test.js` files under `api/`, only 30 import
  `isolatedTestRoots.js` — ~410 suites depend solely on the global backstop.
  The backstop is the fix seam, not per-file edits.
- Task text is STALE in one place: `api/isolatedTestRoots.js:53-62` ALREADY
  sets all four vars including `KAINBAIN_FLEET_CATALOG_FILE` (it does not "omit
  the fleet catalogue"). Do not re-add; verify and move on (Step 2).
- `resolveStatePath` callers (all covered by placing the guard there):
  `runnerRegistry.js:201`, `claimStore.js:47`, `steerStore.js:39`,
  `fleetModelSnapshot.js:77`, `index.js:106` (seed-demo marker, only when
  `config.seedDemo === true`, default false per `api/config/schema.js:477`).
- Known test that the guard WILL break (must be updated in the same change):
  `api/flow/durableState.test.js:21-23` asserts
  `resolveStatePath(null, null, "s.json")` returns the live engine path under
  VITEST. It must assert the throw instead.
- Safe neighbour: `api/flow/dispatch/fleetModelSnapshot.test.js:421` asserts
  `resolveFleetSnapshotPath(undefined)` matches `/fleet-catalog\.json$/` — keeps
  passing ONLY if the temp file keeps the `fleet-catalog.json` basename (as
  `isolatedTestRoots.js` already does). Preserve basenames in the new setup block.
- `config/config.test.js:147-151` asserts schema *defaults* via `path.join`, not
  via `resolveStatePath` — unaffected by the guard.
- Direct engine joins that BYPASS `resolveStatePath` (guard cannot catch):
  `api/flow/circuitBreaker.js:103` (covered in practice: setup already sets
  `KAINBAIN_CIRCUIT_STATE_FILE`, so the `configured` branch wins before the
  fallback), `api/auth/accessConfig.js:67` (audit in Step 1; out of scope unless
  a suite hits the fallback), `api/routes/accessibility.js:82` (writes
  `~/.kainbain/accessibility-feedback.jsonl`, NOT under `engine/` — out of scope,
  record as residual risk).

## 4. Key decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Scope of `isolatedTestRoots.js` edit | No-op after verification; fix lives in `testSetup.isolation.js` only | File already sets all four vars; task text predates that fix |
| D2 | Duplication vs shared helper for the temp-state block | Duplicate the 4-file block into setup, mirroring the existing registry-block precedent, with cross-linking comments | Setup file must stay dependency-free and obvious; matches existing convention between these two files |
| D3 | Temp basenames | Keep real basenames (`runners.json`, `fleet-catalog.json`, …) in temp dirs | `fleetModelSnapshot.test.js:421` and future basename assertions keep passing |
| D4 | Guard condition | Throw iff `process.env.VITEST` is set AND resolved path is under `~/.kainbain/engine/` (prefix match on normalized path + separator) | Catches exactly the pollution path; explicit/configured temp paths never throw; production (`VITEST` unset) byte-identical |
| D5 | `seed-demo.json` marker | Guard-only protection; NO new `KAINBAIN_SEED_DEMO_MARKER_FILE` env/schema key | Marker branch runs only when `seedDemo` is true (never in tests); adding a schema key touches non-owned files for zero current benefit; guard fails loudly if a future test enables it |
| D6 | `durableState.test.js` fallback assertion | Rewrite to expect the throw + add guard unit tests (explicit wins, configured wins, fallback throws under VITEST, fallback works when VITEST unset) | The old assertion encodes the exact bug (live fallback under test); it becomes guard coverage |
| D7 | Guard-test design | Two layers: (a) deterministic — resolved state paths are under `os.tmpdir()`; (b) live-FS — mtime+content snapshot of `~/.kainbain/engine/` before/after app import + runner registration, with a unique sentinel runner id per run | (a) never flakes; (b) is the acceptance proof but a concurrently running engine could touch the dir — sentinel id + content check distinguish our writes from ambient ones |
| D8 | Red-run safety | Snapshot live engine dir before ANY test run; restore after; re-verify byte-identical | The fail-first demonstration itself pollutes prod; WP-F does the real cleanup later, but we must not add residue |
| D9 | Bypasses (`circuitBreaker`, `accessConfig`, `accessibility`) | Audit, do not fix here | Outside owned files and outside the pollution evidence; record residuals for follow-up |

## 5. Assumptions and evidence gaps

- G1 (material): `docs/tasks/99ccc12f-*/SURVEY.md` and the `idea-*` / `plan-failure-*`
  files named in the stage brief DO NOT EXIST in this checkout (verified
  2026-11-13 — the task folder itself was absent and was created for this plan).
  The q14 constraint ("dummy/test models must never appear in production") is
  factored in from the task text. Implementer: if the folder appears (rebase/
  sync), re-read SURVEY.md and reconcile before coding.
- G2: parent-bug docs (`docs/tasks/b3401f19-*/RESPONSE.md`, `RESPONSE_SURVEY.md`,
  `REPLICATION_GUIDE.md`, `TESTING_GUIDE.md`) are likewise absent here; all
  citations above are verified against live code instead, which is stronger.
- G3: prior stage failure (`spawn muse ENOENT`) was infrastructure, not plan
  content — no content failure to resolve.
- G4: Vitest sets `VITEST=true` in workers running `setupFiles` (standard
  behaviour; re-confirm with one `node -e` / debug print in Step 3 — if unset
  there, gate the guard on `VITEST` OR `NODE_ENV=test`).

## 6. Work plan — make the change easy, then make the change

Ordered big/risky first. The implementer owns: `api/testSetup.isolation.js`,
`api/isolatedTestRoots.js` (verify-only), `api/flow/resolveStatePath.js`, one new
guard test, plus the forced `durableState.test.js` update.

### Step 0 — Safety snapshot (before any test runs)

1. `ls ~/.kainbain/engine/`; copy the whole dir to
   `/tmp/kainbain-engine-snapshot-<date>/` (cp -a).
2. Record `sha256sum` of each file into the snapshot dir.
3. Note whether a live engine/process is running on this host (`ps aux | grep
   -i kainbain`) — informs guard-test flake interpretation in Step 5.

### Step 1 — Audit the bypasses (research, small, first)

1. Re-run the two searches from §3 (`resolveStatePath` callers; `homedir()`
   joins) to catch tree drift since planning.
2. For `accessConfig.js` `resolveAuthStateDir` fallback: grep callers for
   whether any suite reaches it without explicit/configured dir. Expected: no
   suite does → record "audited, no change" in the final report.
3. Confirm no test sets `KAINBAIN_SEED_DEMO=true` (grep) — locks in D5.

### Step 2 — Make the change easy: reconcile + test-first red

1. Verify `isolatedTestRoots.js` still sets all four vars (D1). If yes: no edit.
2. Write the NEW guard test FIRST (suggested path:
   `api/flow/engineStateIsolation.test.js`, beside `durableState.test.js`):
   - Snapshot: for each file in `~/.kainbain/engine/` (if dir exists) record
     mtimeMs + sha256; also record dir listing.
   - Import `../index.js` under the STANDARD setup (no per-file env overrides —
     that is the point), `POST /runners/register` with a unique sentinel id
     (`test-isolation-<uuid>`), approve it, trigger one catalogue read.
   - Assert (a): `resolveRunnerStatePath()` and `resolveFleetSnapshotPath()`
     return paths under `os.tmpdir()`; (b): live dir listing/mtimes/hashes
     unchanged AND no file contains the sentinel id.
   - Cleanup: revoke sentinel; restore is unnecessary on green (nothing written).
3. Run red from `api/`: `npx vitest run routes/projects.alias.test.js` +
   the new guard test. EXPECTED: both fail; live `runners.json` /
   `fleet-catalog.json` mtimes change and contain `test-fleet-muse`.
   Capture this output as the before-evidence.
4. IMMEDIATELY restore live files from the Step 0 snapshot; re-verify
   `sha256sum` matches. Do not proceed with dirty live state.

### Step 3 — Make the change, part 1: global backstop

1. In `api/testSetup.isolation.js`, add the WP-4.1 temp-state block mirroring
   `isolatedTestRoots.js:42-62`: `tempStateFile(name)` helper + `claims.json`,
   `runners.json`, `steers.json`, `fleet-catalog.json` under `os.tmpdir()`,
   exported (e.g. `tempEngineStateFiles`) for debuggability; set the four
   `KAINBAIN_*` env vars; add a comment cross-linking both files (D2, D3).
2. Confirm G4: add a one-line temporary assertion (or `node -e` probe via a
   scratch vitest run) that `process.env.VITEST` is set inside setup execution;
   remove the probe after.
3. Re-run the two polluter suites + guard test. EXPECTED: green, live files
   untouched. Restore-verify live files again.

### Step 4 — Make the change, part 2: structural guard + forced test update

1. In `api/flow/resolveStatePath.js`: after computing the fallback (and, for
   defence in depth, on ANY branch whose result lands under the engine dir),
   throw an `Error` naming the resolved path, the `VITEST` gate, and the fix
   (set the `KAINBAIN_*` env var). Normalise with `path.resolve` and compare
   with trailing separator to avoid prefix false-positives
   (e.g. `engine2/`). Keep production path byte-identical when `VITEST` unset.
2. Update `api/flow/durableState.test.js`: fallback assertion becomes
   `expect(() => resolveStatePath(null, null, "s.json")).toThrow(...)`; keep
   explicit/configured assertions; add cases: configured-temp never throws,
   fallback works when `VITEST` is temporarily unset (save/restore env).
3. Run: new guard test + `durableState.test.js` + `fleetModelSnapshot.test.js`
   + `config.test.js` + `runnerRoutes`/`circuitBreaker` suites. EXPECTED: green.

### Step 5 — Full-suite validation with guard active

1. `npm run test:api` (full 440-file suite). EXPECTED: green. Any failure is
   either a newly caught live-state dependency (fix the suite's isolation, do
   NOT weaken the guard) or a genuine regression — triage each individually.
2. `npm run lint --prefix api`. EXPECTED: clean.
3. Live-state cleanliness: `sha256sum` live engine dir vs Step 0 snapshot —
   must match; grep live `runners.json`/`fleet-catalog.json` for
   `test-fleet-muse` / sentinel ids — the ONLY acceptable hits are pre-existing
   WP-F cleanup targets, identical to the snapshot.
4. If the box is slow/flaky, use `scripts/repeat-tests.mjs` for the touched
   suites per repo convention before declaring green.

### Step 6 — Documentation and handoff

1. Code-as-docs: MARK/JSDoc comments on the new setup block, the guard, and the
   guard test explaining the 2026-11 incident and the q14 invariant.
2. If `TESTING_GUIDE.md` / `REPLICATION_GUIDE.md` (parent bug docs) become
   available, add one paragraph each: "engine-state isolation contract" + how to
   reproduce the original pollution. If still absent, put that paragraph in the
   task's final report instead — do not invent the parent files.
3. Final report must list: files changed, red/green evidence (commands +
   outputs), live-state sha256 verification, residuals for follow-up (D9
   bypasses, WP-F handoff: cleanup is now safe to schedule).

## 7. Validation plan (evidence-oriented)

| Check | Command (from `api/` unless noted) | Expected evidence |
|-------|------------------------------------|-------------------|
| Red (Step 2) | `npx vitest run routes/projects.alias.test.js flow/engineStateIsolation.test.js` on unpatched code | FAIL; live mtimes change; `test-fleet-muse` in live files (then restored) |
| Backstop (Step 3) | same command after Step 3 | PASS; live sha256 unchanged |
| Guard unit (Step 4) | `npx vitest run flow/durableState.test.js flow/dispatch/fleetModelSnapshot.test.js` | PASS incl. new throw assertions |
| Full suite (Step 5) | `npm run test:api` (repo root) | All green with guard active |
| Lint | `npm run lint --prefix api` (repo root) | Clean |
| No residue | `sha256sum ~/.kainbain/engine/*` vs snapshot; `grep -r test-fleet-muse ~/.kainbain/engine/` | Identical to snapshot; no new hits |
| Static proof | `grep -c KAINBAIN_FLEET_CATALOG_FILE api/testSetup.isolation.js` | ≥1 (was 0) |

Highest-risk validation: the full-suite run (Step 5) — the guard may expose
other suites with hidden live-state dependencies; each must be fixed at the
suite, never by weakening the guard.

## 8. Risks and open questions

- R1: A live engine running on the verification host could touch
  `~/.kainbain/engine/` during the guard test → mitigated by sentinel-id content
  check (D7) + Step 0 process note.
- R2: `VITEST` unset in some runner context (G4) → guard silently inactive;
  mitigated by the Step 3 probe and the deterministic tmpdir assertions.
- R3: Pre-existing live pollution (`test-fleet-muse`, `muse::meta::test-fleet-model`)
  is NOT removed here — that is WP-F, explicitly sequenced after this ticket.
- Open questions: none — all material facts were verified in-repo; G1/G2 are
  flagged for implementer re-check, not blocking.

## 9. Sequencing

No blockers. Blocks WP-F (engine-state cleanup). Merge FIRST per task priority.
Non-goals: production behaviour changes (guard is test-only), WP-F cleanup,
auth/accessibility state isolation (D9 residuals).
