# IMPLEMENTATION_PLAN — Runner autodetect + trusted model catalogue + alias stability

Task: `9be2458f-c691-4772-90e7-eef1cc2f27c4` — "Runners are not autodetecting correctly".
Stage: plan only. No code changes in this stage.

## 1. Goal

Fix runner autodetect (muse known-broken, others suspected), stop muse alias
targets losing their stored model, and build one firm, trusted model
catalogue: model options flow from each runner's harness discovery into the
kainbain-standard `harness::provider::id[::reasoning]` form, are saved
centrally, and the UI selects from that central list.

## 2. Starting evidence (what the codebase shows today)

All paths verified by reading the code this session. No prior report was
taken on trust.

- Runner discovery legs live in `runner/harnessModelDiscovery.js`
  (`DISCOVERY_LEGS`: pi, muse, antigravity, vibe, opencode, codex). Each leg
  reuses its backend harness's own `listModels()` surface, runs behind a
  20s watchdog (`DISCOVER_LEG_TIMEOUT_DEFAULT_MS`), and keeps the previous
  per-harness slice on failure.
- The daemon (`runner/daemon.js`) seeds `discoveredModelsCache` at boot and
  refreshes on `modelDiscoveryIntervalMs` (default 12h,
  `runner/modelDiscovery.js`). Heartbeats advertise
  `models: resolveAdvertisedModels(config, discovered)` — **pin-wins by
  default**: when `KAINBAIN_RUNNER_MODELS`/`MODEL` is set,
  `refreshDiscoveredModels` skips scanning entirely unless
  `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`. A pinned runner can therefore
  never surface a newly released model.
- Runner harness autodetect (`detectAvailableHarnesses`,
  `AUTO_DETECTABLE_HARNESSES = ["pi","muse","antigravity","vibe"]`,
  `HARNESS_DETECT_BINS`, `defaultLoadHarness`) knows only five harnesses.
  **opencode and codex have discovery legs but are absent from runner
  autodetect, version probing, and the runnable-harness loader** — the
  backend resolver (`api/agent/harnessDiscovery.js`) does cover
  codex/opencode (`KAINBAIN_CODEX_BIN`, `KAINBAIN_OPENCODE_BIN`,
  `~/.opencode/bin`). The two sides have drifted.
- Leg asymmetry: codex always throws `CODEX_DISCOVERY_UNAVAILABLE` (live
  transport unverified); opencode requires an `OPENCODE_URL` server on the
  runner host (`OPENCODE_NOT_CONFIGURED` otherwise); muse spawns
  `muse serve` stdio `model/list` and throws `MUSE_MSP_MODELS_EMPTY` on a
  zero-row answer.
- The fleet catalogue (`api/flow/dispatch/fleetModelCatalog.js`,
  `buildFleetModelCatalog`) is derived **live** from claim-eligible runner
  registrations, served at `GET /runners/models/catalogue`, and gated by
  `effectiveRunnerModels` (operator `availableModels` allowlist wins over
  advertised). It is never cached — good — but it is a *second* catalogue,
  not the one the pickers primarily read.
- The pickers primarily read `GET /compute/models` (backend-host catalogue
  via `aggregateModelCatalog` in `api/models.js`, per-harness honest lists,
  curated fallback for the default harness only), fetched once on mount by
  `useModelCatalog` (`frontend/src/hooks/useModelCatalog.js`) with a 60s
  client cache, on top of backend TTLs (shared `modelListCache`, 5-min muse
  MSP cache in `api/agent/harnesses/muse/msp/museMspModelCatalog.js`,
  per-harness timeout in `api/crew/modelDiscovery.js`). Fleet ids are merged
  in client-side by `withFleetModels`/`fleetModelsForHarness`
  (`frontend/src/services/fleetModelOptions/`) as exact advertised ids with
  strict harness attribution, gated on `fleetLoaded`. So today there are
  **two sources merged in the browser**, with at least four TTLs between a
  new CLI model and a visible option. That explains "new muse model visible
  in muse code but not in the UI".
- "Effort" in the task text does not exist as a catalogue segment. The real
  grammar (`shared/modelKeys.js`) is
  `harness::provider::id[::reasoning]`; runner `tiers` (`T0,T1`,
  `runner/config.js`, dispatch gate `TIER_CEILING`) are a separate fleet
  concept. The plan treats "effort" = reasoning level and keeps tiers
  distinct (see survey assumption q4).
- Alias wipe paths found: (a) `ModelAliasesSection.jsx` harness `onChange`
  always writes `{ harness: next, model: "" }`; (b) `normalizeModelAliases`
  (`shared/modelAliases.js`) **drops** grammar-invalid rows on every
  projectStore write path (`api/projectStore.js`); (c)
  `sanitizeAliasTargetModels` (`api/aliasTargets.js`) blanks models on
  `none`-harness targets at load; (d) save-time hard errors refuse unknown
  harness / `none`+model / malformed ref / unadvertised reasoning level
  (`validateAliasTargetModels`). Catalogue-miss is already soft (warning
  only) — that part matches the desired behaviour and must be preserved.
- Survey state: `SURVEY.md` exists in this task folder but `answers` is
  empty (unanswered), and the referenced `idea-20261110-212333.md` is not
  present in the folder. The plan adopts the survey's Recommended options
  as assumptions (Section 3) and flags them for confirmation.

## 3. Survey assumptions (Recommended options adopted, unconfirmed)

- q1 — scope: **all connected tools, fixed properly** (not muse-only).
- q2 — new-model arrival: **appears on its own at the next automatic
  check** (no manual Refresh required, though Refresh stays as an escape
  hatch).
- q3 — alias target stops being detected: **keep the saved value and show
  a clear warning** (never auto-retarget, never blank, never block saves).
- q4 — "effort" segment: **thinking depth / reasoning level** (the existing
  4th `::reasoning` segment), not speed/quality tier. Tiers stay a separate
  dispatch concept.

If any assumption is wrong, Phase 0 re-plans before code changes.

## 4. Key decisions

1. **Single harness-capability table shared by runner and backend.**
   Autodetect bins, env overrides, version probes, discovery legs, and
   "runnable" status come from one module both sides import, so runner and
   backend can never drift again (fixes the opencode/codex gap
   structurally, not by adding two more entries in one file).
2. **Discovery-wins becomes the safe default; pins become explicit
   allowlists.** Keep pin-wins available as an operator opt-out, but the
   default advertises live discovery (freshness beats upgrade-safety once
   the catalogue is trusted and alias/validation paths never wipe on
   drift). This is the direct fix for "new model never appears".
3. **One central catalogue service on the backend.** It unions
   backend-host listings and per-runner advertised ids, normalises every
   option to canonical `harness::provider::id[::reasoning]` via
   `shared/modelKeys.js`, persists the union (so UI and dispatch read the
   same saved list), and records provenance per option (which runner(s) /
   backend host serve it, when last seen). The UI selects from this list;
   the fleet merge moves server-side and the browser stops merging two
   sources.
4. **Aliases never lose data to discovery drift.** Catalogue-miss stays
   soft everywhere; invalid rows are quarantined with a warning instead of
   dropped; harness switches preserve the model text until the user picks a
   replacement.
5. **Muse is the pilot harness, not the only harness.** Every fix lands
   behind the shared table + per-harness contract tests, and the rollout
   proves all six legged harnesses (pi, muse, antigravity, vibe, opencode,
   codex-including-its-honest-unavailable state).

## 5. Work plan (research and big pieces first; make-change-easy before the change)

### Phase 0 — Research spikes (do first; time-boxed; no behaviour change)

- **0.1 Muse probe parity spike.** Reproduce "new model in muse code, not
  in UI" end to end: run the runner leg (`discoverMuseModels`), the
  backend catalogue probe (`createMuseMspModelCatalog`), and the UI fetch
  chain against a muse CLI serving a model the caches have never seen.
  Measure which layer hides it (pin-wins skip, 12h cadence, 5-min MSP
  cache, `modelListCache` TTL, 60s client cache, `fleetLoaded` gate) and
  record the exact staleness budget. Output: a short findings note +
  failing characterization tests checked in as pending/skipped.
- **0.2 Autodetect matrix spike.** Build the ground-truth matrix
  harness × {runner autodetect, runner version probe, runner runnable
  loader, discovery leg, backend resolver, backend roster,
  UI section} for all eight ids (mock, custom, pi, muse, antigravity,
  vibe, opencode, codex). Confirm opencode/codex gaps and any further
  drift (e.g. codex transport status in `codexHarness.js`, opencode server
  expectations). Output: matrix doc + contract-test skeletons.
- **0.3 Catalogue consolidation design spike.** Decide the persisted
  central catalogue's home (extend the runner registry vs a new store),
  write triggers (heartbeat vs discovery event vs cadence), retention for
  "last seen" provenance, and the exact API shape (extend
  `/runners/models/catalogue`, extend `/compute/models`, or one new
  endpoint). Constraint: dispatch (`runnerMatches.js`,
  `effectiveRunnerModels`) and pickers must read the same saved list.
  Output: ADR-style decision record.

### Phase 1 — Make the change easy (seams, safety nets, no behaviour change)

- **1.1 Extract the shared harness-capability table.** New dependency-free
  module (next to `shared/modelKeys.js`) owning per-harness: autodetect
  bins, env override var, version probe bins, search-dir extras, has-leg,
  runnable-by-default. Rewire runner `daemon.js` tables and
  `api/agent/harnessDiscovery.js` to import it. Behaviour identical;
  covered by the Phase 0 matrix tests.
- **1.2 Per-harness discovery contract tests.** For each of the six legs:
  canonical-key output, honest-empty classification, keep-old-slice on
  failure, watchdog timeout, and grammar rejection of malformed rows.
  Codify codex's honest-unavailable and opencode's not-configured as
  specified states, not gaps.
- **1.3 Catalogue provenance plumbing (read-only).** Add last-seen /
  served-by provenance to fleet catalogue entries and surface
  `discoveryStatus` per runner in Settings, without changing selection
  behaviour. This is the observability the later cutover leans on.
- **1.4 Alias safety net.** Characterization tests proving: unknown-model
  saves warn but succeed; reload never drops rows; harness switch keeps
  model text as a visibly-stale value. All red before Phase 3, no prod
  change yet.

### Phase 2 — Fix autodetect (runner + backend agreement)

- **2.1 Bring opencode/codex into the shared table** with correct
  semantics: opencode autodetects via binary *and* reachable-server
  signal (document which counts as "installed" vs "runnable");
  codex autodetects via binary + auth store
  (`codexAuthPath`) while discovery stays honestly unavailable until the
  transport lands.
- **2.2 Single "installed / runnable / discoverable" vocabulary** surfaced
  identically in runner logs, heartbeat `discoveryStatus`, and backend
  harness availability, replacing today's per-side wording.
- **2.3 Stale-pin hint becomes actionable.** `staleHarnessHintFor` already
  detects configured-vs-detected drift; wire it into heartbeat facts and
  Settings so "runner not serving an installed harness" is visible without
  reading logs.

### Phase 3 — Trusted central catalogue (the core change)

- **3.1 Discovery-wins by default.** Flip the default so live discovery
  advertises and pins become explicit allowlists (`availableModels`
  semantics extend to the runner: pin = restrict, not freeze). Keep
  pin-wins as an opt-out flag for frozen fleets. Shorten/refresh cadence
  so q2 ("appears at the next automatic check") holds: keep the 12h tick
  but add discovery on runner (re)connect, on Re-detect command, and a
  bounded staleness cap for the persisted list.
- **3.2 Central catalogue service.** Implement the Phase 0.3 design:
  ingest runner-advertised ids + backend-host listings, normalise to
  canonical keys (reject ungrammatical ids with provenance-logged drops,
  never silent), persist with per-option provenance, serve one endpoint
  the UI and dispatch share. `buildFleetModelCatalog` becomes a view over
  it (or is replaced by it — decided in 0.3).
- **3.3 UI cutover to the central list.** `useModelCatalog` reads the
  central endpoint; `withFleetModels` client-side merging is removed (or
  kept purely as a deprecated fallback for older backends during one
  release); `ModelSelector` and `ModelAliasesSection` render provenance
  ("2 runners · seen 3m ago") instead of today's dual-source badges.
  Refresh bypasses caches end to end (client → central service → legs).
- **3.4 Kill the staleness stack.** Align the four TTLs behind the central
  service: legs cache per-harness slices (keep), central service owns the
  UI-facing TTL, client keeps a short TTL only. A new CLI model must be
  selectable after at most one automatic check + one UI refresh, per q2.

### Phase 4 — Alias stability (keep + warn, per q3)

- **4.1 Never drop on write.** `normalizeModelAliases` quarantines invalid
  rows (kept, flagged, excluded from dispatch) instead of dropping them;
  projectStore surfaces the quarantine in save responses.
- **4.2 Never blank on drift.** `sanitizeAliasTargetModels` load path and
  the `ModelAliasesSection` harness switch preserve model text as a
  visibly-stale value; "Clear" stays an explicit user action.
- **4.3 Unknown harness stays hard, unknown model stays soft** —
  re-verify `validateAliasTargetModels` tiers after the catalogue move so
  a central-catalogue outage can never block alias saves (probe-null ⇒
  warn nothing, as today).

### Phase 5 — Assurance and rollout

- **5.1 Test gates.** `npm run test:unit` green; new suites: shared-table
  parity (runner vs backend resolve identically on fixtures), leg
  contracts, central-catalogue golden tests (ingest → normalise → persist
  → serve), alias no-data-loss tests, UI picker tests against the central
  endpoint (existing `useModelCatalog` / `ModelSelector` /
  `ModelAliasesSection` suites updated, not deleted). Headless checks via
  existing mock fixtures or `npm run capture:screenshot`; no long-lived
  background servers.
- **5.2 Docs.** Update runner docs (autodetect + discovery-wins +
  Re-detect), Settings help text, the model-key grammar doc if "effort"
  wording appears anywhere (rename to reasoning level), and the ADR from
  0.3. Add an operator runbook: "new model not appearing" (check
  discoveryStatus → Re-detect → staleness cap) and "alias target stale"
  (warning meaning + fix path).
- **5.3 Rollout.** Ship Phase 1 behind no flags (refactor only); Phase 2
  with per-harness logging; Phase 3 behind a single
  `centralCatalog` flag with dual-read comparison logging (central vs
  legacy merge) for one release before cutover; Phase 4 with quarantine
  metrics. Rollback = flag off + pin-wins opt-out documented.

## 6. Validation plan (per phase)

- 0.1: reproduction script shows the new-model journey across every layer
  with timestamps; characterization tests fail for the right reason.
- 0.2: matrix has zero "unknown" cells; every cell links to code or a
  contract test.
- 0.3: ADR signed off; dispatch and UI proven to read the same store in a
  spike test.
- 1.1–1.4: `npm run test:unit` green with zero behaviour diff (dual-run
  old vs new tables on fixtures).
- 2.x: fixture-host tests prove opencode/codex detect/no-detect correctly
  on both sides; stale-pin hint visible in heartbeat facts fixture.
- 3.x: golden test — runner advertises `muse::meta::<new>` → central list
  contains it with provenance → picker offers it → dispatch matches it
  verbatim; staleness test — new model selectable within one check cycle.
- 4.x: no-data-loss tests — drifted/invalid/stale alias rows survive
  save → reload → save with warnings and zero silent mutation.
- 5.x: full `npm run test:unit`, lint, docs link check
  (`scripts/check-doc-links.mjs` path per repo convention), screenshot
  smoke of picker + aliases pages.

## 7. Risks and open questions

- The survey was never answered; q1–q4 assumptions need owner confirmation
  before Phase 3 (wrong q2/q4 changes the catalogue design).
- Codex live transport is unverified — 2.1 must not promise codex
  discovery, only honest codex detectability.
- Opencode "installed" definition (binary present vs server reachable) is
  genuinely ambiguous — 0.2/2.1 decides, both states stay expressible.
- Behaviour risk: flipping to discovery-wins changes what pinned fleets
  advertise — mitigated by the opt-out flag, dual-read logging, and the
  quarantine path in 4.1.
- Non-goals: new harness additions beyond the eight known ids; changing
  the `harness::provider::id[::reasoning]` grammar; dispatch matching
  semantics beyond reading the shared list; UI redesign of the pickers.

## 8. Success criteria

- Every legged harness autodetects identically on runner and backend, with
  contract tests pinning the agreement.
- A model released in any attached harness CLI is selectable in the UI
  after the next automatic check, with no manual Refresh and no alias
  edits.
- Alias targets never lose their stored model to discovery drift; stale
  targets show a clear warning and saves always succeed.
- One persisted central catalogue in canonical form backs the UI pickers,
  alias validation, and dispatch matching.
