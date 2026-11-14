# IMPLEMENTATION_PLAN — Make runner model discovery reliable and explicit

Parent bug: task `b3401f19`. This task (WP-B): causes N2, N3; survey q5/q7/q8/q11/q16/q18;
WIDE_NET cause 1; REPLICATION_GUIDE section 1; TESTING_GUIDE section 1.

## 1. Goal

Every configured harness always has an explicit, named discovery state — never `{}`.
A runner with a broken or missing discovery leg still boots, still serves its pin,
and says exactly what is wrong, where the operator looks (logs + heartbeat facts).
Stale slices are marked, not silently kept; malformed pins are rejected at load,
not advertised.

## 2. Starting facts (verified in-tree)

- `runner/harnessModelDiscovery.js`: `discoveryCache` is `{ [harnessId]: { ids, atMs, error } }`;
  `runDiscoveryLeg` keeps the previous slice on failure (keep-old); `runDiscoveryRound`
  **skips** harness ids with no leg (`mock`, `custom`, unknown) and blank entries;
  `getDiscoveryStatus(onlyHarnessIds)` only emits entries for ids **already in the cache**,
  so a never-scanned harness reports `{}` (N2). `classifyLegError` passes through coded
  errors, else `<HARNESS>_DISCOVERY_FAILED`.
- Lazy leg imports (the N3 mechanism): `loadPiHarness` → `../api/agent/harnesses/pi/piHarness.js`
  (line 374), `loadAgyCatalog` → `.../antigravity/agyModelCatalog.js` (455),
  `loadVibeCatalog` → `.../vibe/vibeModelCatalog.js` (504),
  `discoverOpencodeModels` → `.../opencode/OpencodeModelDiscovery.js` (656),
  plus the pi SDK npm dep `@earendil-works/pi-coding-agent`. The `muse` leg spawns a CLI
  (no import) and `modelDiscovery.js` is statically imported — both always present.
- `runner/daemon.js`: `refreshDiscoveredModels` (746) outer `catch` only warns and keeps the
  cache — a round-level throw leaves **no** per-harness record. Boot (`~956`) seeds one round
  **after** the first heartbeat facts are built (`~921`), so first-heartbeat `discoveryStatus`
  is always pre-scan. `handlePendingCommands` already re-runs a fresh round on
  `requestModelRediscovery` (except interval-`0`, which acks without scanning).
  `factsFor` (811) already emits `discoveryStatus: getDiscoveryStatus(runnerHarnessIds(config))`
  but has **no** `errors` field today.
- `runner/config.js`: `loadRunnerConfig` accepts any non-`default` pin text — never parses
  model ids, never checks the harness segment against `KAINBAIN_RUNNER_HARNESSES`, and has no
  warning channel for dropped values (only fatal `errors[]`).
- `scripts/package-runner.mjs`: copies whole `runner/`, `shared/`, `api/` trees, prunes
  `*.test.js`/`node_modules`; `INSTALL.txt` admits pi hosts need a separate
  `npm install --prefix api`. So the N3 gap is the **npm dependency**, not the harness
  modules (which ship inside `api/`).
- `shared/modelKeys.js`: `parseModelKey` returns `harness` (3-part) / `harnessReasoning`
  (4-part) / `provider` / `bare` / `null`; single `:` inside an id segment is legal.
- Existing tests: `runner/harnessModelDiscovery.test.js` (leg registry, keep-old, grammar
  validation, `NO_DISCOVERY_LEG`), `runner/daemon.test.js` "model auto-discovery refresh"
  (pin ∪ discovered already covered), `runner/config.test.js` (`loadRunnerConfig` +
  credential file). `npm run test:unit` is the verification gate.
- Survey note: this task's `SURVEY.md` round-1 carries no recorded answers (`"answers": {}`);
  the normative survey constraints are taken from the task statement (q1 start-anyway +
  named error; q2 pin ∪ discovered; q5/q16 24h stale-then-flagged, keep showing; q7 malformed
  pins blocked; q8/q18 `harness::provider::model[::effort]` grammar; q11 on-demand re-scan).
- Ownership: `runner/harnessModelDiscovery.js`, `runner/daemon.js` (`refreshDiscoveredModels` +
  boot sequence only), `runner/config.js` (pin validation), runner bundle manifest/packaging
  (`scripts/package-runner.mjs` + `INSTALL.txt`/manifest docs), `runner/*.test.js`.
  WP-A touches `factsFor().versions` only — whoever merges second rebases.

## 3. Key decisions (with rejected alternatives)

1. **Single leg-module table first ("make the change easy").** Introduce one exported table,
   e.g. `LEG_MODULE_SPECIFIERS = { pi: [...], antigravity: [...], vibe: [...], opencode: [...] }`,
   holding the exact specifiers the loaders import (harness module + npm package where
   applicable). All three loaders, the boot self-check, and the packaging manifest read it —
   one table, three consumers, no triple bookkeeping. Rejected: separate hard-coded lists
   per consumer (drifts back to N3 within a quarter).
2. **Staleness computed at read time in `getDiscoveryStatus`, not stamped at write time.**
   A `stale:true` flag stamped during a write goes stale itself when rounds stop running;
   read-time comparison (`Date.now() - atMs > staleMs`) is always correct. Slice shape gains
   nothing persisted; status shape gains `stale` (+ `atMs` already there).
3. **Outer-catch `ROUND_FAILED` only fills harnesses lacking a fresh result.** A round-level
   throw (e.g. cache bug, unexpected throw out of `runDiscoveryRound`) must not overwrite
   per-leg errors recorded microseconds earlier. Rule: in the outer catch, for each
   configured harness whose slice was not touched by the failed round, write
   `{ ids: previous, atMs: now, error: { code: 'ROUND_FAILED', ... } }`.
4. **Pin validation drops + warns, never fatals (survey q3).** Malformed pins join neither
   the advertised list nor `config.models`; each drop appends to a new `config.warnings[]`
   (fatal `errors[]` semantics unchanged) and surfaces via a new `facts.errors` array.
   Rejected: refuse-to-boot (loses the fleet to one typo; q3 recommends warn-and-continue).
5. **Packaging: vendor the pi SDK listing path OR pin it as a bundled dep — do not re-document
   the manual install.** `INSTALL.txt` today tells pi hosts to `npm install` by hand; that
   is the N3 hole. Prefer vendoring a minimal `runner/vendor/` model-listing implementation
   behind the existing `createHarness`/`createCatalog` seams (no new APIs); fallback is adding
   the npm package to the bundle with an install-at-unpack step. Either way the acceptance
   is the same bundle-import test. Rejected: keeping the manual step (repeats N3).
6. **Stale models stay usable (survey q2/q5/q16).** `stale:true` is advisory for Settings/the
   catalogue; `resolveAdvertisedModels` ignores it. Rejected: blocking new work on stale
   (q2 keeps pins usable; discovery staleness must not strand a healthy runner).

## 4. Steps (in order; big/research pieces first)

### Step 0 — Extract the leg-module table (enabler, no behaviour change)
- Add `LEG_MODULE_SPECIFIERS` to `runner/harnessModelDiscovery.js`; rewrite `loadPiHarness`,
  `loadAgyCatalog`, `loadVibeCatalog`, `discoverOpencodeModels` to import through it.
- Tests: existing `harnessModelDiscovery.test.js` suite stays green (`npm run test:unit`
  scoped to the file); no new behaviour asserted.

### Step 1 — Boot self-check: `LEG_MODULE_MISSING` (change 1, kills N3 silence)
- New exported `verifyDiscoveryLegModules(harnessIds, { logger } = {})`: for each configured
  harness with a table entry, `import()` each specifier; on `ERR_MODULE_NOT_FOUND` (or any
  load throw) write `discoveryCache[h] = { ids: previous ?? [], atMs: Date.now(),
  error: { code: 'LEG_MODULE_MISSING', message, hint } }` and log loudly
  (`logger.warn`/`logger.log` + console fallback so `--manual` boots without a logger see it).
  Success leaves the cache untouched (no fake `ok` before a real scan).
- Call it in the daemon boot sequence **before** the seed `refreshDiscoveredModels` (~956),
  so the seed round and first post-seed heartbeats carry the named error.
- Tests (`harnessModelDiscovery.test.js`): leg fake whose import throws →
  `discoveryCache` entry has `error.code === 'LEG_MODULE_MISSING'` (named, not `{}`).

### Step 2 — Never-ran visibility + round-failure recording (change 2, kills N2 silence)
- `getDiscoveryStatus(onlyHarnessIds)`: after emitting cached slices, synthesize one entry
  per wanted id missing from the cache: `{ ok: false, count: 0, atMs: null,
  error: { code: 'NOT_YET_RUN', message, hint } }`. Wanted ids include legless configured
  harnesses (`mock`/`custom`): they can never scan, so they must never read as `{}` either.
- `refreshDiscoveredModels` outer catch: per decision 3, record `ROUND_FAILED` on every
  configured harness the failed round did not touch; keep the warn log.
- `runDiscoveryRound` keeps skipping legless ids (no behaviour change there — the status
  synthesis in `getDiscoveryStatus` covers them).
- Tests: `getDiscoveryStatus(['pi','muse'])` on a cold cache returns **two** `NOT_YET_RUN`
  entries; forced round-level throw → every configured harness carries `ROUND_FAILED`;
  daemon test asserting `discoveryStatus` keys equal configured harness ids on first facts.

### Step 3 — Pin validation in `loadRunnerConfig` (change 5, kills malformed advertisement)
- Validate each `KAINBAIN_RUNNER_MODELS` / `KAINBAIN_RUNNER_MODEL` entry: `parseModelKey(id)`
  must yield `form === 'harness' | 'harnessReasoning'` **and** `parsed.harness` must be in the
  normalized `KAINBAIN_RUNNER_HARNESSES` list. Drop failures into `config.warnings[]`
  (new; `errors[]` untouched), keep the survivors in order/deduped.
- `factsFor` gains `errors: [...config.errors, ...config.warnings]`-style exposure (name it
  `facts.errors`; coordinate field name/shape with WP-A's `versions` work at rebase).
  Boot logs each dropped id as a warning (visible per survey q4: logs + status page).
- Edge cases: `default` sentinel still means unpinned; singular + csv merge keeps working;
  harness ids are compared post-trim; an empty-after-drop pin behaves as unpinned.
- Tests (`config.test.js` + daemon facts test): `KAINBAIN_RUNNER_MODELS=deepseek-v4-flash:0731-cloud`
  → dropped with warning (accepted today — assert the new rejection);
  `ollama-cloud-direct::gemma4:31b-cloud` → dropped (2-part form, harness not configured);
  `muse::meta::a` with `HARNESSES=muse` → kept; wrong-harness `pi::x::y` with
  `HARNESSES=muse` → dropped; `facts.errors` lists every drop.

### Step 4 — Staleness marker (change 4)
- New `KAINBAIN_RUNNER_DISCOVERY_STALE_MS` env (default 24h; invalid → 24h), plumbed through
  `loadRunnerConfig` as `config.modelDiscoveryStaleMs`, threaded into `getDiscoveryStatus`
  (new optional param, defaulting to the 24h constant for direct callers/tests).
- Status entries gain `stale: true` when `atMs != null && Date.now() - atMs > staleMs`;
  `ids` untouched, no eviction anywhere on the runner. Catalogue history stays a backend
  concern (no runner-side history store).
- Tests: slice with `atMs = now - 25h` → `stale:true`, ids intact; fresh slice → no `stale`
  key (or `stale:false` — pick one, assert it); env override respected; invalid env → default.

### Step 5 — Packaging: ship the leg closure (change 3, kills N3 structurally)
- Decide vendor-vs-bundle-dep (decision 5) by sizing the pi-SDK listing surface; implement
  the smaller one. Update `scripts/package-runner.mjs` manifest/comments + `INSTALL.txt`
  (remove/negate the manual-`npm-install` instruction for the vendored path).
- New bundle test (e.g. `scripts/package-runner.bundle.test.js` or alongside existing
  packaging tests): stage a packaged tree, `import()` **every** specifier in
  `LEG_MODULE_SPECIFIERS` from the staged tree, assert all resolve. This test fails on
  today's bundle for the pi SDK dep — that failure is the N3 regression gate.
- Re-run the full `npm run test:unit` plus the existing update-channel tests
  (`runner/updates-*.test.js`) to prove the bundle layout change broke nothing.

### Step 6 — Confirm pin ∪ discovered + on-demand re-scan (change 6, survey q2/q11)
- No code change expected (both already hold): add explicit regression tests — pinned config
  + successful leg → advertised list is pin ∪ discovered (extends the existing daemon test);
  `requestModelRediscovery` with `intervalMs: 0` documents current ack-without-scan behaviour
  (q11 allows on-demand re-scan; the `0`-means-disabled contract stays, ack says so).
- If any test fails, treat it as a real regression, not a plan gap — fix the code.

### Step 7 — Docs + rollout notes
- Update the discovery JSDoc headers (`harnessModelDiscovery.js` module + `runDiscoveryLeg` +
  `getDiscoveryStatus`), `config.js` pin docs, and the operator-facing runner docs for:
  new `LEG_MODULE_MISSING` / `NOT_YET_RUN` / `ROUND_FAILED` codes, `stale` flag,
  `KAINBAIN_RUNNER_DISCOVERY_STALE_MS`, pin-grammar rules, `facts.errors`.
- Rollout: no migration — new statuses appear on next boot/round; old backends ignore
  unknown fact fields. WP-F (blocked on this) consumes `discoveryStatus`/`facts.errors`.

## 5. Test plan (maps 1:1 to acceptance)

| Acceptance | Proving test |
|---|---|
| `models: ['muse::meta::a']` + import-throwing leg → named error (not `{}`) | Step 1 test: `LEG_MODULE_MISSING` in cache + status |
| `KAINBAIN_RUNNER_MODELS=deepseek-v4-flash:0731-cloud` rejected with warning | Step 3 test: dropped, warning, `facts.errors` entry |
| Bundle-import test passes | Step 5 test: every table specifier imports from staged tree |
| `discoveryStatus` has one key per configured harness | Step 2 test: cold cache + post-failure facts key-set assertion |
| Pin ∪ discovered + `requestModelRediscovery` fresh round | Step 6 regression tests |

Full gate: `npm run test:unit` green, plus the touched files' suites run unmodified
(no `-k` narrowing, no skipped failures). New tests live next to the code they cover
(`runner/harnessModelDiscovery.test.js`, `runner/config.test.js`, `runner/daemon.test.js`,
packaging test); throwaway probes stay in `/tmp`.

## 6. Risks / open questions

- **WP-A rebase** (`factsFor().versions` vs new `facts.errors`): whoever merges second
  rebases; agree the `errors` field name with WP-A before Step 3 lands.
- **Vendor-vs-bundle-dep sizing** (Step 5): if the pi SDK listing surface is large,
  vendoring risks behaviour drift from the backend harness — mitigate via the
  `createHarness` seam tests already in the suite.
- **`mock`/`custom` status codes**: `NOT_YET_RUN` forever for legless harnesses is honest
  but noisy; alternative `NO_DISCOVERY_LEG` post-first-round. Default to `NOT_YET_RUN`
  (simplest, matches "never-ran visible"); revisit only if Settings UX objects.
- **24h default vs `modelDiscoveryIntervalMs` (12h)**: with defaults every slice refreshes
  long before going stale — `stale:true` then signals "rounds are failing", which is the
  intended operator signal, not normal ageing.
