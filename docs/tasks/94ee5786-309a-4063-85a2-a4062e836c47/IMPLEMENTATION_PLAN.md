# IMPLEMENTATION_PLAN — Enforce canonical-id catalogue contract with verified counts (WP-C)

Task: `94ee5786-309a-4063-85a2-a4062e836c47` · Parent bug: `b3401f19-2897-4049-aa3c-227bcee46a4c`
Source: parent RESPONSE.md WP-C (causes N4, N6, WIDE_NET cause 3 reframed), RESPONSE_SURVEY.md
q1/q3/q4/q6/q7/q8/q12/q13 + round-2 q16-q18/q22. This stage is docs-only: this file is the
plan; code changes happen in the implementation stage.

---

## 1. Goal

Make the persisted fleet model catalogue (`GET /runners/models/catalogue`, ADR 0016) enforce a
**canonical-id contract with verified counts**:

1. Only canonical `harness::provider::model[::effort]` ids enter the catalogue; bare and
   `provider::id` forms are quarantined, and harness-scoped ids whose harness the advertising
   runner does not serve are quarantined too (audit trail in `quarantined[]`).
2. Per-entry attribution: `entry.harnesses = [parsed.harness]` — never the runner's whole
   harness list (today `catalogIngest.js` copies `ctx.harnesses` verbatim, so every
   local-alpha entry carries `['antigravity','muse','pi','vibe']` and the frontend
   `fleetModelsForHarness` section gate leaks provider/bare ids into every picker section).
3. `runnerCount`/`runnerIds` count **only claim-eligible runners whose own discovery
   confirmed the id** (`modelProvenance` has it and the discovery leg is not stale per WP-B).
   Pinned/allowlisted-but-unconfirmed claimants move to a new `declaredBy: [runnerIds]`;
   `verified = runnerCount > 0`; existing `claimedBy` (stale pins) stays.
4. `available` is **derived on read** (`runnerCount > 0`), never stored; the response keeps
   it for back-compat. `unavailableReason` becomes a derived string, e.g.
   `"0 runners -- last served 3d ago by local-alpha"` /
   `"declared by 2 runners, not verified by discovery"`.
5. Lifecycle: 0-runner entries are kept indefinitely; the `FLEET_SNAPSHOT_MAX_MODELS`
   eviction is removed (quarantine cap stays); new `remove(id)` on the store plus admin
   `DELETE /runners/models/catalogue/:id` (204/404) and `DELETE .../quarantine/:id`;
   re-advertised ids reappear on the next update; project/alias references are untouched.
6. The catalogue response adds `harnesses: [{ id, runnerCount, runnerIds }]` computed from
   claim-eligible runners' `capabilities.harnesses`.
7. Migration on load: `normalizeSnapshotState` moves persisted bare/provider entries to
   `quarantined` and rewrites `harnesses` to `[parsed.harness]` (idempotent).

## 2. Scope

**Owned (sole owner) — may edit:**

| File | Role |
|---|---|
| `api/flow/dispatch/catalogIngest.js` (+ `.test.js`) | id classification / quarantine / per-entry attribution |
| `api/flow/dispatch/fleetModelSnapshot.js` (+ `.test.js`) | persisted snapshot store: verified counts, derived availability, lifecycle, migration |
| `api/flow/dispatch/runnerModelConfirmation.js` (+ `.test.js`) | catalogue-facing verdicts only |
| `api/flow/runnerRoutes.js` (+ `runnerRoutes.test.js`) | catalogue routes only (GET shape, both DELETEs) |

**Explicitly out of scope (do NOT touch):**

- `api/flow/dispatch/fleetModelCatalog.js`, `fleetSectionMerge.js`, `runnerMatches.js`,
  `runnerMatches/*` — that is WP-G (dispatch stays on the live derivation).
- `api/agent/harnessDiscovery.js` (the N6 "Muse Code UNAVAILABLE" badge comes from the
  backend container's local CLI probe around line 610, not the fleet — re-pointing that
  badge at the fleet is a frontend/WP-D concern; WP-C only makes the catalogue the
  authoritative availability source).
- `api/flow/runnerRegistry.js` — see §5.1 for the modelSource passthrough check.
- `api/routes/compute.js` — consumes `fleetModelSnapshot.update(...).models` only; the
  models shape it reads (`id/harnesses/tiers/runnerCount/runnerIds`) is preserved.
- Frontend pickers; WP-D builds against the response contract defined in §4.

## 3. Evidence recap (verified against the working tree)

- **N4**: `catalogIngest.js` `ingestAdvertisedId` accepts all four grammar forms and stamps
  `harnesses: cleanStringList(ctx?.harnesses)` — the runner's WHOLE harness list.
  `fleetModelSnapshot.js` `update()` passes `harnesses: harnessIds` (the runner's full list)
  into ingest and unions `entry.harnesses` into the slot, so every local-alpha entry ends up
  with `['antigravity','muse','pi','vibe']`, including `ollama-cloud-direct::gemma4:31b-cloud`
  (provider form) and `deepseek-v4-flash:0731-cloud` (bare form).
  `frontend/src/services/fleetModelOptions/fleetModelsForHarness.js` gates sections on
  `entry.harnesses.includes(hid)` (empty = lenient), so those ids leak into every section —
  gemma4/deepseek show under the Muse picker.
- **Verified-count hole**: `runnerModelConfirmation.js` fails OPEN to `unknown` for pins with
  no discovery result, and always for provider/bare ids; `fleetModelSnapshot.js` counts every
  non-`stale` verdict into `runnerIds` — pins show "1 runner" with zero verification.
- **Minor (modelSource)**: `runnerRegistry.js` `_public()` returns
  `capabilities: record.capabilities || null` wholesale and heartbeat capabilities are built
  by `normalizeCapabilities(facts)` (`runnerRegistry.js:637`), which preserves
  `modelSource` (`normalizeCapabilities.js:193-225`). So `runnerRegistry.list()` DOES pass
  `capabilities.modelSource` through; if local-alpha's provenance still persists
  `source: "unknown"`, the drop is not in the registry — Step 0 re-verifies end to end and,
  if the symptom reproduces, the fix belongs in the owned seam
  (`fleetModelSnapshot.js` reads `caps.modelSource` — confirm it also survives
  `normalizeSnapshotState`'s provenance rewrite, which currently keeps `source`).
- **Eviction**: `FLEET_SNAPSHOT_MAX_MODELS` (10000) is referenced only inside
  `fleetModelSnapshot.js` and its test — safe to delete. `FLEET_ENTRY_UNAVAILABLE_REASON`
  is imported only by the snapshot test — replaced by derived reasons.
- **Dispatch safety**: `confirmRunnerModel` consumers (`runnerMatches.js:88`,
  `fleetModelCatalog.js:58`) branch only on `status === "stale"`. Refining the
  confirmed/unknown split (and tightening what "confirmed" means) cannot change dispatch
  refusal behavior. Keep `stale` semantics byte-identical.
- **Admin guard pattern**: `api/index.js:241` puts `authService` in the shared `deps`;
  `api/routes/imageGen.js:42-46` shows the pattern:
  `deps?.authService?.guards?.requireRole(["admin"], { allowApiKeys: false })` as
  `preHandler` (open while access control is disabled — rbac.js).
- **Tests**: vitest; `npm run test:api` (`npm run test --prefix api`), root gate
  `npm run test:unit` = api + frontend. Route tests use `app.inject` against the real app
  from `api/index.js` with `KAINBAIN_RUNNER_JOIN_TOKEN` set; fixtures in
  `api/flow/dispatch/fleetModelFixtures.mjs` (`fleetRunnerRecord`, `NEW_MODEL_ID`).
  JSDoc `@example` blocks are executed by `scripts/check-jsdoc-example.mjs`
  (`npm run docs:check`) — every MARK doc change must keep examples runnable.

## 4. Target response contract (WP-C §4 shape; WP-D builds against this)

`GET /runners/models/catalogue` →

```json
{
  "models": [
    {
      "id": "muse::meta::muse-spark-1.4",
      "form": "harness | harnessReasoning",
      "harness": "muse",
      "provider": "meta",
      "model": "muse-spark-1.4",
      "reasoning": null,
      "harnesses": ["muse"],
      "tiers": ["T0", "T1"],
      "runnerIds": ["local-alpha"],
      "runnerCount": 1,
      "declaredBy": [],
      "claimedBy": [],
      "verified": true,
      "available": true,
      "unavailableReason": null,
      "firstSeenAtMs": 0,
      "lastSeenAtMs": 0,
      "lastServedAtMs": 0,
      "lastServedRunnerIds": ["local-alpha"],
      "provenance": { "local-alpha": { "harnesses": ["muse"], "atMs": 0, "source": "discovered" } }
    }
  ],
  "quarantined": [
    { "id": "ollama-cloud-direct::gemma4:31b-cloud",
      "reason": "Model id \"...\" is not harness-qualified (want harness::provider::model[::effort]).",
      "runnerIds": ["local-alpha"], "firstSeenAtMs": 0, "lastSeenAtMs": 0 }
  ],
  "harnesses": [ { "id": "muse", "runnerCount": 1, "runnerIds": ["local-alpha"] } ],
  "updatedAtMs": 0
}
```

- `runnerIds`/`runnerCount` = discovery-CONFIRMED claim-eligible runners only.
- `declaredBy` = claim-eligible runners that advertised the id but whose own discovery did
  not confirm it (pins, `availableModels` allowlist entries, no-signal old runners).
- `claimedBy` = unchanged: claimants whose own successful, non-stale scan contradicts the pin.
- `verified` and `available` = derived (`runnerCount > 0`), present in the response for
  back-compat, NOT persisted. `unavailableReason` = derived on read, never persisted:
  - declared first: `"declared by 2 runners, not verified by discovery"`
  - else stale: existing `staleAdvertReason(harness, n)`
  - else if `lastServedAtMs`: `"0 runners -- last served 3d ago by local-alpha"` (relative
    s/m/h/d formatting from the store's `now()` seam)
  - else: `"never served by any runner"`
- Persisted file keeps counts + timestamps only (`runnerIds`, `runnerCount`, `declaredBy`,
  `claimedBy`, `firstSeenAtMs`, `lastSeenAtMs`, `lastServedAtMs`, `lastServedRunnerIds`,
  `provenance`, attributes) — no `available`/`unavailableReason`/`verified`.
- `harnesses[]` is computed live from `runnerRegistry.list()` (claim-eligible only) at the
  route, not persisted.

## 5. Design decisions & survey reconciliation

| Survey | Decision |
|---|---|
| q1 + q22 | 0-runner entries are kept indefinitely; admin DELETE removes immediately (204) and the id reappears on the next update if still advertised. No models size cap at all. |
| q3/q4 | Unverified = 0 runners, `available: false`, `declaredBy` names the claimants; entry stays visible/selectable, marked. Never served as available. |
| q6 | No size limit on `models` — remove `FLEET_SNAPSHOT_MAX_MODELS` eviction entirely; keep `FLEET_SNAPSHOT_MAX_QUARANTINED` (oldest-first). No test may exercise a models cap. |
| q7 + q17 | Non-canonical (bare/provider) and wrong-harness ids are blocked AND recorded in `quarantined[]` with a reason (audit trail). |
| q8 vs round-2 q18 | Reconciled as: **attribute to the harness parsed from the id** (`entry.harnesses = [parsed.harness]`); quarantine only when the runner serves no such harness (its reported harness list is non-empty and lacks it). Catalogue ids are `harness::provider::model[::effort]` because two harnesses may serve the same model differently and the user deserves that choice. |
| q12 | Count only claim-eligible, healthy runners whose discovery leg confirmed the id recently (leg not stale per WP-B). |
| q13 | Keep project/alias references byte-identical; entries they point at render "not currently served" via the derived `unavailableReason`. |

### 5.1 Open recon items (Step 0, read-only — resolve before coding)

1. **WP-B leg staleness**: "leg not stale per WP-B" is a soft dependency (sequencing says no
   blockers). Grep the tree for WP-B's landed freshness predicate (discovery-leg max-age
   constant/helper near `discoveryStatus`/`atMs`). If found, import and use it in
   `runnerModelConfirmation.js`. If not found, implement the predicate there (owned file,
   catalogue-facing) as e.g. `discoveryLegFresh(leg, nowMs)` with a named
   `DISCOVERY_LEG_MAX_AGE_MS` constant; WP-B can replace it later without touching callers.
   Until then, "confirmed" = `modelProvenance` has the id AND `discoveryStatus[harness].ok === true`
   AND the leg is fresh.
2. **modelSource passthrough**: registry provably passes `capabilities` wholesale
   (`_public`, line ~310) and `normalizeCapabilities` preserves `modelSource`. Write one
   route-level regression test (heartbeat with `facts.modelSource: "pinned"` → catalogue
   provenance `source: "pinned"`) to lock it; only if it fails, hunt the drop inside the
   owned seam.

## 6. Implementation steps (make the change easy: small increments, suite green after each)

### Step 0 — Pre-flight recon (read-only, ~30 min)
Resolve §5.1 items 1-2 by grep/read only. Record the WP-B predicate decision in the PR
description. No code changes.

### Step 1 — `catalogIngest.js`: canonical-only ids + per-entry attribution
Changes:
- `ingestAdvertisedId`: after `parseModelKey` succeeds, accept ONLY `form === "harness" |
  "harnessReasoning"`. For `provider`/`bare` return
  `{ ok: false, quarantined: { id, reason: 'Model id "<id>" is not harness-qualified (want harness::provider::model[::effort]).', runnerId, atMs } }`.
- New quarantine branch: if `parsed.harness` is not in the runner's reported harness list
  (`cleanStringList(ctx?.harnesses)` non-empty and not containing it) →
  `reason: 'Model id "<id>" names harness "<parsed.harness>", which runner <runnerId> does not serve (harness not served by runner <runnerId>).'`
  An empty/absent runner harness list stays fail-open (old runners) — accept.
- `entry.harnesses` becomes `[parsed.harness]` (single element) — stop copying
  `ctx.harnesses`. `ctx.harnesses` remains in the signature, used only for the
  not-served check. `tiers`, `runnerId`, `atMs`, `source` unchanged; id stays byte-identical.
- Update all MARK doc blocks + `@example`s (they are executed by `check-jsdoc-example`).
Tests (`catalogIngest.test.js`): provider form → quarantined with the exact
not-harness-qualified reason; bare form → same; `vibe::p::m` from a runner reporting
`['pi','muse']` → quarantined with "harness not served by runner r1"; runner with empty
harness list → accepted; `entry.harnesses` is exactly `[parsed.harness]` even when
`ctx.harnesses` has four entries; malformed unchanged; batch split updated; colon-in-id and
4-part forms still accepted.
Run: `npm run test --prefix api -- flow/dispatch/catalogIngest.test.js` → green before moving on.

### Step 2 — `runnerModelConfirmation.js`: catalogue-facing verified verdict
Changes (keep `stale` semantics byte-identical — dispatch depends on it):
- `confirmed` now additionally requires the naming leg to be successful AND fresh per the
  Step-0 WP-B predicate: `discoveryStatus[parsed.harness]` exists, `ok === true`, and
  `discoveryLegFresh(leg, nowMs)`. `confirmRunnerModel` gains an optional clock param
  (`{ now = () => Date.now() }` third arg or options object) — default keeps behavior
  deterministic for existing callers.
- Provenance-hit but stale/missing/failed leg → `unknown` (unconfirmed), NOT confirmed.
- Operator-override ids stay non-`stale` (currently `unknown`) — under the new counting they
  are simply unconfirmed claimants (→ `declaredBy` in Step 3). Dispatch behavior unchanged
  because dispatch only refuses on `stale`.
- Export the freshness predicate + window constant for reuse/testing.
Tests (`runnerModelConfirmation.test.js`): confirmed requires provenance hit + ok leg + fresh
leg; stale leg (old `atMs`) with provenance hit → not confirmed; all existing `stale`
cases unchanged and passing; override still never `stale`.

### Step 3 — `fleetModelSnapshot.js`: verified counts, derived availability, lifecycle, migration
Changes:
- `update()`: live slot gains `declaredBy: Set`. Verdict mapping per claimant:
  `confirmed` → `runnerIds` + provenance stamp (provenance `harnesses` = `[parsed.harness]`);
  `stale` → `claimedBy` (unchanged); `unknown` → `declaredBy` (NEW — pins/allowlist/no-signal).
  `harnesses` union is now just `[parsed.harness]` per entry.
- Persist per entry: attributes, `harnesses`, `tiers`, `runnerIds`, `runnerCount`,
  `claimedBy`, `declaredBy`, `firstSeenAtMs`, `lastSeenAtMs`, plus NEW
  `lastServedAtMs`/`lastServedRunnerIds` (stamped `seenAt` + current `runnerIds` whenever
  `runnerCount > 0` this round; carried over otherwise), `provenance`. Do NOT persist
  `available`/`unavailableReason`/`verified`.
- Entries no live runner advertises: kept forever; `runnerIds`/`runnerCount`/`claimedBy`/
  `declaredBy` reset to empty (no current claimants), `lastSeenAtMs` untouched,
  `lastServed*` carried — this is what makes "last served 3d ago by local-alpha" possible.
- `read()`: derive per entry `verified = runnerCount > 0`, `available = verified`,
  `unavailableReason` per §4 priority (declared → stale → last-served → never-served;
  relative-time formatter `formatAge(ms)` s/m/h/d). Response includes derived fields
  (back-compat). Sorting/cloning unchanged.
- `remove(id)` → `models.delete(id)` + persist + return boolean;
  `removeQuarantined(id)` → same on the quarantine map. Both exposed on the store.
- Delete `FLEET_SNAPSHOT_MAX_MODELS` and the models branch of `evictOverflow` (keep the
  quarantine cap). Delete `FLEET_ENTRY_UNAVAILABLE_REASON` (reasons are derived now);
  add `deriveUnavailableReason(entry, nowMs)` + `formatAge` helpers (exported for tests).
- `normalizeSnapshotState` migration (idempotent): for each persisted model entry —
  re-parse `id`; unparseable or `provider`/`bare` form → move to `quarantined` (reason as in
  Step 1, `runnerIds` = union of stored `runnerIds` + `claimedBy`, timestamps preserved);
  harness forms → keep, force `harnesses = [parsed.harness]`, force
  `declaredBy: []`, `lastServedAtMs/lastServedRunnerIds` defaults, DROP stored
  `available`/`unavailableReason` (derived on read). Quarantine records unchanged.
- New exported pure helper `summarizeFleetHarnesses(runners)`:
  claim-eligible runners only → `[{ id, runnerCount, runnerIds }]` from
  `capabilities.harnesses` (sorted by id).
- Update the module MARK doc + examples.
Tests (`fleetModelSnapshot.test.js`) — rewrite/extend:
- acceptance: runner harnesses `['pi','muse']` advertising `ollama-cloud-direct::gemma4:31b-cloud`
  → appears in `quarantined` with the not-harness-qualified reason, NOT in `models`.
- acceptance: pinned runner with `discoveryStatus: {}` advertising `muse::meta::x` →
  `runnerCount: 0`, `runnerIds: []`, `declaredBy: ['r1']`, `available: false`,
  `unavailableReason` matches /declared by 1 runner/.
- confirmed-only counting: provenance hit + fresh ok leg → `runnerCount` 1; provenance hit
  + stale leg → `declaredBy`, count 0; two runners (one confirmed, one pin) → count 1,
  `declaredBy` names the other.
- derived-on-read: after `update`, the persisted JSON file contains no
  `available`/`unavailableReason` keys, but `read()`/response entries carry them;
  `unavailableReason` = "0 runners -- last served ... ago by box-a" after the runner leaves.
- migration: write an old-shape file (bare entry + entry with 4-element `harnesses` +
  stored `available`) → new store loads with bare id in `quarantined`, `harnesses` rewritten
  to `[parsed.harness]`, derived fields correct; running normalize twice is a no-op.
- `remove(id)`/`removeQuarantined(id)`: true/false, persisted, re-advertised id reappears on
  next `update`.
- DELETE the models-cap eviction test; replace with "no models cap: N > old cap entries are
  all kept" (or simply drop and assert large update is untrimmed).
- keep quarantine-cap behavior covered.
Run the file → green.

### Step 4 — `runnerRoutes.js`: catalogue routes (GET shape + DELETEs)
Changes (catalogue section only, around line 572):
- GET: compute `const runners = runnerRegistry.list()` once; respond
  `{ ...deps.fleetModelSnapshot.update(runners), harnesses: summarizeFleetHarnesses(runners) }`
  (fallback branch `buildFleetModelCatalog(...)` gains `harnesses: summarizeFleetHarnesses(runners)`
  too, so the contract holds without the snapshot dep).
- Add admin guard mirroring `imageGen.js`:
  `const adminOnly = deps?.authService?.guards?.requireRole(["admin"], { allowApiKeys: false });`
  `const guard = adminOnly ? { preHandler: adminOnly } : {};`
- `app.delete("/runners/models/catalogue/quarantine/:id", guard, ...)` →
  `deps.fleetModelSnapshot.removeQuarantined(decodeURIComponent-ish param)` → 204 empty on
  true, 404 `{ error }` on false or when no snapshot dep.
- `app.delete("/runners/models/catalogue/:id", guard, ...)` → `remove(id)` → 204/404.
  Register the quarantine route FIRST (path clarity; fastify routing makes them
  non-conflicting anyway since segment counts differ). Ids contain `::` — fine in a path
  segment; tests use `encodeURIComponent(id)`.
- 204 must send no body (`reply.status(204).send()`).
Tests (`runnerRoutes.test.js`, catalogue describe block):
- GET response contains `harnesses: [{ id: 'mock', runnerCount, runnerIds }]` matching the
  registered runners.
- acceptance route test: register+approve a runner whose heartbeat facts advertise
  harnesses `[{id:'pi'},{id:'muse'}]` and models including `ollama-cloud-direct::gemma4:31b-cloud`
  → GET shows it in `quarantined`, not `models`.
- pinned runner (`facts.modelSource: 'pinned'`, `discoveryStatus: {}`, models
  `['muse::meta::x']`) → entry has `runnerCount: 0`, `declaredBy: ['<id>']`,
  `available: false`; also proves the modelSource passthrough (§5.1.2).
- DELETE catalogue/:id → 204, entry gone from next GET; DELETE again → 404;
  re-advertised id reappears after the runner heartbeats again / next GET with the runner
  still registered (update re-merges live); DELETE quarantine/:id → 204/404.
Run `runnerRoutes.test.js` → green.

### Step 5 — Full verification (details in §7)
`npm run test:api`, `npm run test:frontend` (root `npm run test:unit`), `npm run lint`,
`npm run docs:check` (jsdoc examples), plus the acceptance checklist in §8 executed as tests.

## 7. Verification & testing plan

- Primary gate: `npm run test:unit` (= `npm run test:api` + `npm run test:frontend`) from the
  repo root. Targeted iteration:
  `npm run test --prefix api -- flow/dispatch/catalogIngest.test.js flow/dispatch/runnerModelConfirmation.test.js flow/dispatch/fleetModelSnapshot.test.js flow/runnerRoutes.test.js`.
- Also run the WP-G-adjacent suites that share fixtures to catch drift:
  `flow/dispatch/fleetModelCatalog.test.js`, `flow/dispatch/runnerMatches.test.js`,
  `flow/dispatch/fleetSectionMerge.test.js` (must stay green untouched).
- `npm run lint --prefix api` (eslint) and root `npm run lint`.
- `npm run docs:check` — `check-jsdoc-example.mjs` executes every `@example`; update examples
  in the same edit as the code they document. `check-one-function-per-file` and doc-link
  checks also run here.
- No long-lived servers: verification is vitest + `app.inject` route tests only (per the
  testing guidance); no screenshot/manual pass is needed — this is a backend contract change.
- Persistence round-trip is covered by store tests using temp files
  (`fs.mkdtempSync` pattern already in `fleetModelSnapshot.test.js`); never touch the live
  `~/.kainbain/engine/fleet-catalog.json` in tests.

## 8. Acceptance criteria → where each is proven

| Acceptance | Test |
|---|---|
| Runner with harnesses `['pi','muse']` advertising `ollama-cloud-direct::gemma4:31b-cloud` is QUARANTINED | `catalogIngest.test.js` + `fleetModelSnapshot.test.js` + route test (Step 4) |
| Pinned runner, `discoveryStatus:{}`, `muse::meta::x` → `runnerCount: 0` + `declaredBy: ['r1']` | `fleetModelSnapshot.test.js` + route test |
| Persisted bare-form entry migrates to quarantine on load | `normalizeSnapshotState` migration test (old-shape fixture file) |
| Route tests for both DELETEs (204/404) + `harnesses[]` counts | `runnerRoutes.test.js` |
| No test exercises a models size cap | delete the eviction test; grep the suite for `FLEET_SNAPSHOT_MAX_MODELS` → zero hits |
| 0-runner entries kept indefinitely | snapshot test: entry survives many `update([])` rounds with derived "last served" reason |
| `available` derived, not stored | persisted-file assertion (no `available` key) + read() back-compat assertion |
| Re-advertised ids reappear after DELETE | route test: DELETE → 204 → GET with runner still registered → entry back |
| project/alias references untouched | no change to alias/task code paths; `fleetSectionMerge`/alias suites stay green |

## 9. Documentation plan (implementation stage)

- Amend `docs/adr/0016-central-model-catalogue.md` with a WP-C amendment section: canonical-only
  admission + quarantine reasons, per-entry `[parsed.harness]` attribution, verified counts
  (`runnerCount` = discovery-confirmed, `declaredBy` for unconfirmed claimants, `claimedBy`
  unchanged), derived `available`/`unavailableReason`, indefinite retention + admin DELETE
  endpoints (204/404), `harnesses[]` summary, and the load-time migration (idempotent).
- Update the module MARK docs in the four owned files (they are the API reference; examples
  must run under `check-jsdoc-example`).
- If `docs/EngineDetails/ModelKeys.md` describes catalogue admission, add the
  canonical-only rule and quarantine vocabulary there.
- Note for WP-D (in the PR description, not code): the frontend badge should read fleet
  availability (N6), and `fleetModelsForHarness` can now rely on `harnesses` being exactly
  `[parsed.harness]`.

## 10. Risks & open questions

- **WP-B leg freshness**: soft dependency (see §5.1.1). If WP-B's window differs from the
  local fallback, only the constant/predicate in `runnerModelConfirmation.js` changes.
- **Behavior change for operator-asserted ids**: previously counted as serving/available;
  now `declaredBy` + `available: false` unless discovery confirms. Intended per q3/q4
  ("unverified = 0 runners, still selectable marked"). Dispatch refusal is unaffected
  (only `stale` refuses). Flag in the PR description for WP-G/WP-D.
- **`compute.js` consumer** uses `.models` only — the added/derived fields are additive.
- **Old persisted files**: migration is idempotent and load-safe (rotted file → empty, as
  today); bare/provider entries become quarantine records with their original timestamps.
- **Route param encoding**: ids contain `::` (legal in a path segment); tests must
  `encodeURIComponent` — noted so the 404-vs-204 tests are not flaky.
- **N6 badge** (backend CLI probe) is out of WP-C's owned files; tracked as WP-D/frontend work.

## 11. Sequencing

No blockers. WP-D merges after this and builds against the §4 contract; this WP blocks WP-F.
Merge order within the WP: Step 1 → Step 2 → Step 3 → Step 4 → Step 5, each step keeping the
full api suite green so any step can be reviewed/reverted independently.
