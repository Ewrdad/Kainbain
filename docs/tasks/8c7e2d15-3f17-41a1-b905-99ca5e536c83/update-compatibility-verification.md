# Update Compatibility Verification — Catalogue Fix (WP-A…WP-E)

Scope: will the current change (WP-A `ae1ae677` → `26639969`, WP-B `77a4072e` → `fbcf8442`,
WP-C `94ee5786` → `e29bfb94`, WP-D `4ec027a7` → `b64cae26`, WP-E `99ccc12f` → `ec7aa37c`;
this task's branch adds docs only, `git diff origin/main...HEAD` non-docs count 0) break
existing installs on update? This audit covers forward update only (old state/old runners
onto new code, new/old mixed fleets). Downgrade observations are noted, not failed.

## Verdict: PASS — no update break

No forward path crashes, bricks boot, 400s a heartbeat, or destroys existing state.
Every behaviour change degrades gracefully with an audit trail (warnings, `declaredBy`,
quarantine, derived reasons). Evidence: probes `/tmp/update-break-probe.mjs` (33 pass),
`/tmp/update-break-probe2.mjs` (29 pass), `/tmp/update-break-probe3.mjs` (11 pass),
plus fresh suites below.

## 1. Engine state (fleet-catalog.json, runners.json)

- Old file → new `normalizeSnapshotState` (`api/flow/dispatch/fleetModelSnapshot.js`):
  bare/provider entries quarantine with claimant-union `runnerIds` + original timestamps
  (no loss), canonical entries keep timestamps/provenance with `harnesses` rewritten to
  `[parsed.harness]`, stored `available`/`unavailableReason`/`verified` dropped (derived
  on read), `runnerCount` recomputed from `runnerIds`, `declaredBy`/`lastServed*`
  defaulted. Migration is idempotent; `null`/rotted/junk degrades to empty, never throws.
  Verified against a live-shaped old file: 2 canonical kept, 2 offenders quarantined.
- Store construction from an invalid-JSON file still degrades via `loadStateFile`
  (fail-open); `KAINBAIN_FLEET_CATALOG_FILE=""` still disables persistence
  (`resolveFleetSnapshotPath`).
- `runners.json` schema untouched by WP-A…WP-E; WP-E changes only test env pinning and a
  `VITEST`-gated throw. Production `resolveStatePath` probes byte-identical
  (explicit > configured > default), live path allowed with `VITEST` unset, throws only
  under `VITEST`; bare-fallback validation cannot fire (all callers pass literals).

## 2. Runner ↔ backend interop (both directions)

- New runner → old backend (`26639969^1` `normalizeCapabilities.js` extracted and run):
  new heartbeat accepted, `errors` empty, `versions.build` passed through, new error
  codes (`NOT_YET_RUN`, `LEG_MODULE_MISSING`, `ROUND_FAILED`) preserved, `stale` dropped
  silently, `facts.errors` ignored (harmless). No 400.
- Old runner → new backend: accepted, no `build` key invented, hostile
  versions/discovery shapes never 400.
- Dispatch unchanged: `buildFleetModelCatalog` (`api/flow/dispatch/fleetModelCatalog.js`)
  skips only `stale` verdicts; WP-C narrows `confirmed` (fresh-leg only) → rest become
  `unknown`, which dispatch counts exactly as before. Stored bare/provider refs still
  dispatch via the live derivation (quarantine is snapshot-only). Operator
  `availableModels` override stays fail-open (`unknown`, trusted).
- Catalogue counts: unconfirmed pins now read `declaredBy` + 0 runners instead of served
  (intended, survey q3/q4). Entries stay listed, selectable, marked — never deleted,
  never a crash. `summarizeFleetHarnesses` tolerates poisoned records (skips them).

## 3. Config, boot, packaging, release gate

- Pins (`runner/config.js`): mixed `KAINBAIN_RUNNER_MODELS` keeps canonical ids, drops
  bare/provider with `warnings` + boot log; wrong-harness pins dropped only under
  explicit harness lists (auto-detect fail-open). Empty/invalid env never throws;
  invalid `KAINBAIN_RUNNER_DISCOVERY_STALE_MS` falls back to 24h.
- Boot helpers never throw: `loadRunnerVersionInfo` (missing/corrupt → fallback),
  `resolveRunnerBuild` (non-checkout → nulls), `snapshotCodeTree` (missing dir → zeros),
  `hasCodeChangedSinceBoot` (null/zero baseline → false). Discovery
  `getDiscoveryStatus` always names every wanted harness (`NOT_YET_RUN`), single-string
  and null opts safe; `verifyDiscoveryLegModules` never throws and does not boot-fail.
- Update channel: legacy manifests without `requires` still accepted;
  `runnerVersion`/`apiVersion` unchanged (`0.1.0`/`1.0.0`, `requires >=1.0.0 <2.0.0`),
  so old backends admit new runners and vice-versa. Package dual-stamps
  `version.json`, ships the leg closure (`RUNNER_LEG_BUNDLED_DEPS` pinned to
  `LEG_MODULE_SPECIFIERS` by the conformance test); install hosts need no npm/network.
- Version bump gate: passes on the release path (`--head-version 0.1.1` → OK). It gates
  releases, never installs; existing runners keep running their current version.

## 4. Frontend (old shapes, mixed versions)

- `fleetCountsById`/`fleetModelsForHarness` tolerate old entries (missing `harnesses`,
  missing `verified`/`declaredBy`, stored verdicts); provider/bare ids never fan out;
  `undefined`/`{}` counts → `[]`. New frontend on old catalogue renders counts without
  crashing. Old frontend on new backend keeps working (`available` still derived).

## 5. Suites (this run)

- `node --test runner/config.test.js runner/harnessModelDiscovery.test.js runner/daemon.test.js tests/check-runner-version-bump.test.mjs tests/package-runner-conformance.test.mjs tests/runner-release-manifest.test.mjs` — 246 pass, 0 fail.
- `npm run test --prefix api -- flow/dispatch flow/engineStateIsolation flow/runnerRoutes flow/resolveStatePath` — 22 files, 253 pass.
- `npm run test --prefix frontend -- fleetModelOptions ModelSelector useFleetModelCatalog fleetCatalogueContract` — 6 files, 103 pass.

## 6. Non-breaking observations (not update breaks)

1. `sanitizeDiscoveryStatus` drops `stale` at the backend boundary (both old and new):
   the flag never reaches the UI; verified counts use the backend 24h freshness rule.
   Runner/boot behaviour unaffected; only a non-default `KAINBAIN_RUNNER_DISCOVERY_STALE_MS`
   diverges from backend freshness.
2. `facts.errors` (dropped-pin warnings) is discarded by `normalizeCapabilities`: warnings
   live in the runner log + heartbeat payload, not in `capabilities` for Settings.
   No crash; observability gap only.
3. Downgrade only: pre-WP-C code reading a new snapshot marks 0-runner entries
   `available=true` (it computes `available = value.available !== false` on a missing
   field). Forward update is safe; rollbacks should restore the backed-up state files
   per the WP-F plan rather than downgrading code over new state.
4. New frontend on an old backend (`harnesses[]` absent) shows grey `0 runners` per
   harness — a display-only mixed-version effect; the deployed frontend+backend upgrade
   atomically (build 637), and there is no crash or data loss.
5. Pin-only installs running with discovery disabled (`interval 0`) that relied solely
   on bare/provider pins will advertise empty after update — the mandated q7 block,
   with loud warnings, not a boot failure. Operator migration is in the WP-F handoff.

## Scope note

This PASS covers update safety of the implemented change only. It does not declare
WP-F rollout complete or WP-G ready: per `run22-20261114-1900.md`, `server2-alpha`
still needs Bundle B reinstall+restart (pi `ERR_MODULE_NOT_FOUND` predates WP-B; WP-B
only names it) and `local-bravo` is paused pending an operator decision. No live
mutation was performed for this verification.
