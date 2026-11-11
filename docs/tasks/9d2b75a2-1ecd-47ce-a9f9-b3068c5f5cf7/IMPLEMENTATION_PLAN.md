# IMPLEMENTATION_PLAN — Runner autodetect + trusted central model catalogue

Task: `9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7`
Author: planning turn (no code changed yet)
Inputs: task brief, `SURVEY.md` (this folder; questions present, `answers: {}`
empty), codebase evidence below. The brief also names
`idea-20261111-074628.md`, which does not exist in this folder — treated as
missing input, not as evidence.

## Goal

Runners reliably autodetect the models their harnesses can serve (muse first,
then every other leg that shares the bug); those ids are normalized to the
KainBain canonical key grammar, saved into one central model catalogue; and
the UI selects exclusively from that central list — including brand-new
models (e.g. the latest Muse release) and fleet-only harnesses — without
ever silently wiping alias targets.

## Success criteria

1. A new model released in a harness appears as a selectable UI option through
   the normal detection path (no hand-editing of pins or allowlists).
2. One documented central catalogue is the single source the pickers read;
   each option carries its harness attribution and availability.
3. Changing harness availability (offline runner, empty scan, malformed id)
   degrades honestly (marked unavailable / explained warning), never silently.
4. Alias targets are never silently wiped or retargeted by detection changes;
   a missing saved choice keeps the last working value with a warning.
5. `npm run test:unit` and `npm run lint` pass; new behaviour is pinned by
   committed tests.

## Current architecture (verified evidence)

- Runner detection: `runner/daemon.js` (`detectAvailableHarnesses`,
  `refreshDiscoveredModels`, `factsFor`, `SUPPORTED_RUNNER_COMMANDS`),
  per-harness legs in `runner/harnessModelDiscovery.js` reusing each
  backend harness's `listModels()`; muse leg probes `muse serve` stdio
  `model/list` (`runner/modelDiscovery.js` `discoverClaudeModels`).
  Advertisement is pin-wins by default (`resolveAdvertisedModels`),
  discovery-wins opt-in (`KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`),
  12 h cadence (`MODEL_DISCOVERY_INTERVAL_MS_DEFAULT`), keep-old-slice on
  failure; heartbeat carries `facts.models` + `facts.discoveryStatus`.
- Backend serves TWO catalogues: engine catalogue
  (`aggregateModelCatalog` in `api/models.js`, local harnesses only,
  TTL-cached, curated `FALLBACK_MODELS`) at `GET /compute/models`; fleet
  catalogue (`buildFleetModelCatalog` in
  `api/flow/dispatch/fleetModelCatalog.js`, live-derived from runner
  registrations, never persisted) at `GET /runners/models/catalogue`
  (`api/flow/runnerRoutes.js`).
- Frontend: `useModelCatalog` reads `/compute/models` (single fetch point);
  `useFleetModelCatalog` reads fleet counts; `ModelSelector` merges fleet
  ids into backend harness sections via `withFleetModels` /
  `fleetModelsForHarness` (`frontend/src/services/fleetModelOptions/`).
  Sections come from the backend `harnesses[]` view — there is no section
  for a harness the backend host itself does not know.
- Grammar: canonical `harness::provider::id(::reasoning)` in
  `shared/modelKeys.js` (single implementation shared backend/frontend).
  The brief's `harness::model::effort` is read as: canonical key + effort
  (tiers/reasoning) carried as catalogue attributes — see Open questions.
- Aliases: `shared/modelAliases.js`; `normalizeModelAliases` drops invalid
  records on write; `ModelAliasesSection.jsx` clears the model on harness
  change (`onTargetChange({ harness: next, model: '' })`); unknown-model is
  currently soft (badge + save succeeds); ADR 0005 owns dispatch combination
  rules.

## Survey mapping (SURVEY.md answers are empty — defaults proposed)

| # | Question | Proposed default (reversible) |
|---|----------|-------------------------------|
| q1 | Scope: muse-only vs all harnesses | Muse first, others only if the same bug affects them |
| q2 | New-model latency | Automatic on next detection/heartbeat; manual Refresh stays as escape hatch |
| q3 | Central list shape | One combined list, each entry labelled with source harness |
| q4 | Offline/broken/empty ids | Keep showing, marked unavailable, with reason |
| q5 | Saved alias choice goes missing | Keep last working choice + warning (never silent wipe) |
| q6 | New model moves aliases? | No — aliases stay; new model is an extra option |

These defaults are assumed unless the task owner answers the survey; each is
flagged at its implementation step so an answer can flip it cheaply.

## Approach — make change easy, then make the change

Research and the two structural enablers come first (Phases 0–1): prove the
exact break in each symptom chain with a failing test before touching
behaviour, and build the seams (fixtures, contract tests, provenance logging)
that make the later fix small and reviewable. Behaviour changes land after
(Phases 2–5), one symptom per phase, each independently shippable.

## Steps

### Phase 0 — Diagnose with evidence (research first, no behaviour change)

0.1. Trace the new-Muse-model chain end to end and record where the id drops:
runner leg output → `facts.models` → fleet catalogue (`harnesses` union +
section gate) → `/compute/models` sections → `withFleetModels` merge.
Prime suspects to confirm or rule out, in order: (a) no backend `muse`
harness section exists so fleet-only muse ids have nowhere to render;
(b) the `serving` gate in `fleetModelsForHarness` excludes the id because
the runner's advertised `harnesses` union lacks `muse`; (c) the runner leg
drops the row (`modelDiscovery.js` skips any provider/model containing
`:` while `modelKeys.js` allows single `:` in ids); (d) pin-wins +
12 h cadence hides the discovery result; (e) TTL caches
(`modelListCache`, MSP catalogue 5 min, client 60 s) delay visibility.
0.2. Reproduce the alias wipe: harness-change clear in
`ModelAliasesSection.jsx`, `normalizeModelAliases` drops on save/load, and
any picker path that rewrites a stored unknown-model value. Record which
path(s) fire for the muse-alias report.
0.3. Audit every other discovery leg (`pi`, `antigravity`, `vibe`,
`opencode`, `codex`) for the same defect class found in 0.1 (q1 scope
decision is evidence-led: shared bug ⇒ shared fix).
0.4. Write findings to `ROOT_CAUSE.md` in this task folder (chain diagram +
per-suspect CONFIRMED/RULED-OUT with file:line + log/test excerpt).

### Phase 1 — Make change easy (seams, fixtures, contracts; no behaviour change)

1.1. Add a mock-`muse serve` transcript fixture containing the new-model row
(extend `api/agent/harnesses/muse/fixtures/`) plus a mock runner
registration fixture, so the whole chain is testable without the real CLI.
1.2. Add contract tests pinning the catalogue seam: runner-discovered id ⇒
fleet catalogue entry `{ id, harnesses, tiers, runnerCount }` ⇒ UI option
with identical key (dispatch matches verbatim, so keys must be byte-equal).
1.3. Add provenance logging: each catalogue entry traces to
(runner id, harness leg, detected-at); surface `discoveryStatus` per
harness in the existing Settings › Runners surface (already partially
there — fill gaps only).
1.4. Reconcile the `harness::model::effort` naming: document the canonical
grammar + where effort/tiers live (catalogue attributes, see Open
questions) in `docs/EngineDetails/ModelKeys.md`.

### Phase 2 — Fix runner autodetect (muse first, shared bugs everywhere)

2.1. Fix the confirmed muse-leg drop (whichever of 0.1a–e it is). If the
colon filter is at fault, align the leg with `parseModelKey` instead of
its own stricter rule.
2.2. Apply the identical fix to every leg sharing the defect (0.3); legs
with honestly-empty semantics (`codex`, unconfigured `opencode`) keep
their classified errors, only the shared defect class is fixed.
2.3. If pin-wins/cadence is (partly) hiding discovery: keep pin-wins as the
default (upgrade-safe) but make the effective source visible per runner
(pinned vs discovered, last scan time) and ensure Re-detect scans and
reports honestly. Do not flip the default without a survey answer.
2.4. Gate: new-model fixture row flows runner → fleet catalogue in tests.

### Phase 3 — One trusted central catalogue (the structural change)

3.1. Decide persisted snapshot vs live-derived (recommendation: keep the
live derivation as the computation, add a persisted snapshot with
provenance + detected-at so the UI never depends on a transient read;
mark entries stale/unavailable rather than deleting them — survey q4).
Record the decision in an ADR.
3.2. Normalize every runner-advertised id through `parseModelKey` /
`normalizeModelRef` at ingestion; malformed ids are quarantined with a
reason (visible in Settings), never silently dropped, never served.
3.3. Ensure fleet-only harnesses get catalogue sections: the central list's
harness set is the UNION of backend-known and fleet-served harnesses
(fixes 0.1a class permanently for every future harness).
3.4. Gate: central-list endpoint returns the new-model entry with harness
label + availability after a single runner heartbeat in tests.

### Phase 4 — UI selects from the central list only

4.1. Repoint all pickers (`ModelSelector`, project default, stage override,
alias targets) at the central list; backend-only and fleet-only entries
render uniformly with harness labels (survey q3) and availability badges.
4.2. Unavailable entries (offline runner, stale snapshot, quarantined id)
render marked-unavailable with reasons (survey q4), never hidden, never
normal-looking.
4.3. Keep Refresh (backend `?refresh=true` + Re-detect) as the manual escape
hatch; automatic appearance on next detection remains the default path
(survey q2).
4.4. Visual check via `npm run capture:screenshot` or existing headless
fixtures only — no long-lived dev servers.

### Phase 5 — Alias trust (no wipe, no silent retarget)

5.1. Stop the wipe: harness change preserves the model text (badge
unknown-model instead of clearing); persistence never drops a target the
user saved — invalid records quarantine with a warning, matching the
q5 keep-last-working default.
5.2. New models never move aliases (q6 default): aliases resolve to stored
targets only; the new model appears as an extra pickable option.
5.3. Gate: regression tests — save muse alias target, simulate catalogue
churn (model disappears / harness offline / new model arrives), assert
the stored target byte-survives with a warning surfaced.

### Phase 6 — Assurance and rollout

6.1. Full gates: `npm run test:unit`, `npm run lint`, plus any configured
analyser gate found in the repo (check package.json/CI before finishing).
6.2. Update docs: `HarnessModelSelector.md` (central list as the seam),
`ModelKeys.md` (grammar + effort), `runner/README.md` (legs matrix +
effective-source visibility), Settings help text.
6.3. Rollout is additive: old runners (no provenance) read as unknown-source
entries; rollback per phase (Phase 4 can revert to the merged view without
losing Phase 2 detection fixes).

## Validation plan (per phase, evidence-oriented)

- 0.x: `ROOT_CAUSE.md` with CONFIRMED/RULED-OUT per suspect + a failing test
  per confirmed break (red before, green after — the test is written from
  the observed real behaviour, not from the fix assumption).
- 1.x: contract tests pass; no behavioural test changes needed (pure
  refactoring/fixtures ⇒ existing suite stays green).
- 2.x–5.x: each phase's Gate test + the full `npm run test:unit` suite;
  edge/error paths exercised per phase (empty scan, malformed id, offline
  runner, unknown-harness fleet id, blank alias model on `none` harness).
- Highest-risk check: Phase 3→4 integration — a fleet-only harness id must
  be selectable AND dispatchable (key byte-equality from picker to
  `effectiveRunnerModels` match); verify with the dispatch-level test, not
  just the UI render.

## Testing plan

- Primary gate: unit/integration suites (`npm run test:unit`); no separate
  manual QA cycle required for logic changes.
- New committed tests colocated with touched areas (runner legs,
  `fleetModelCatalog`, `modelKeys` ingestion, `ModelSelector` /
  `ModelAliasesSection`, dispatch matching).
- Throwaway probes (if needed) live under `/tmp`, never committed.
- UI changes verified headless (`npm run capture:screenshot`, existing
  fixtures/mocks); no background servers.

## Documentation plan

- `ROOT_CAUSE.md` (this folder): diagnosis evidence from Phase 0.
- ADR (this repo's `docs/adr/`): persisted-snapshot vs live-derived
  decision + catalogue ownership.
- Updates: `docs/EngineDetails/HarnessModelSelector.md`,
  `docs/EngineDetails/ModelKeys.md`, `runner/README.md`, Settings copy.
- CHANGELOG entry if the repo convention calls for one.

## Risks / open questions

1. SURVEY.md has no answers — all six survey decisions ride on the proposed
   defaults above; a late answer flips implementation cheaply only before
   its phase lands. Highest leverage: q4 (hide vs mark unavailable) and q6
   (alias auto-switch).
2. `harness::model::effort` vs canonical `harness::provider::id(::reasoning)`:
   assumed the brief means canonical key + effort as attributes (tiers in
   the fleet catalogue, reasoning segment in keys). If the task owner means
   a NEW 3-part `harness::model::effort` key format, Phase 1.4 must design
   a migration instead — confirm before Phase 3.
3. Persisted snapshot adds a staleness problem the live view avoids; the
   mitigation is provenance + staleness marking (never silent delete).
   If persistence proves unnecessary during Phase 3, the fallback is:
   live-derived central computation + fixed UI sourcing, no new store.
4. MRS / multi-runner conflicts (same id, different tiers): union today;
   keep unioning unless Phase 0 shows dispatch mismatches from it.

## Non-goals

- New harnesses, new providers, or new model families beyond detection reach.
- Changing dispatch matching semantics (verbatim id match stays).
- Stored-format migrations of existing `defaultModel`/alias values (ADR 0005
  additive-seam constraint stands).
- Flipping pin-wins to discovery-wins globally.
