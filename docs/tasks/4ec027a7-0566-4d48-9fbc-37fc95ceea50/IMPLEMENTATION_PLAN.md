# Implementation Plan: Render runner counts instead of unavailable badges in pickers

## 0. Context and deliverable

- **Repository:** KainBain runner (`/home/server2/.kainbain/runner-work/kb-4ec027a7-0566-4d48-9fbc-37fc95ceea50`), branch `kb/4ec027a7-0566-4d48-9fbc-37fc95ceea50`.
- **Parent bug:** task `b3401f19` (WP-D: WIDE_NET cause 4, N6). This task is the WP-D picker-rendering half.
- **Problem:** picker rows let the "Unavailable" verdict win over runner counts, and the harness row ("Muse Code UNAVAILABLE") comes from the backend container's local CLI probe even though runners serve Muse (backend container has no `muse` binary).
- **Deliverable:** pickers always render fleet runner counts; health/probe detail moves to Settings/admin; strict harness gating; admin fleet-catalogue surface.
- **Primary artifact now:** this `IMPLEMENTATION_PLAN.md`; implementation and tests land in later stages.
- **Sequencing:** BLOCKED BY WP-C (merge after WP-C); may be built in parallel against WP-C contract fixtures.

### Files owned (sole owner — do not touch anything else)

- `frontend/src/components/common/ModelSelector.jsx`
- `frontend/src/services/modelStatus.js`
- `frontend/src/services/fleetModelOptions/fleetModelsForHarness.js`
- `frontend/src/components/settings/ModelAliasesSection.jsx`
- Settings fleet-catalogue/admin view (new or extended under `frontend/src/components/settings/`)
- Their tests (co-located `*.test.js(x)` plus any new fixture modules under the owned dirs).

### Note on survey and prior reports

- The stage brief points at `docs/tasks/4ec027a7-0566-4d48-9fbc-37fc95ceea50/SURVEY.md` and `idea-20261113-231104.md`, but that folder did not exist in this checkout at plan time (verified via `ls docs/tasks/`). No `SURVEY.md` content could be read.
- This plan therefore treats the survey constraints quoted verbatim in the stage brief as the grill outcome (Section 0.1) and calls out the residual open questions in Section 7. If a `SURVEY.md` appears later and contradicts these, Section 0.1 wins until re-grilled.
- The WP-C response contract is referenced as `RESPONSE.md` section 4 of task `b3401f19`, whose docs folder is also absent from this checkout. The contract shape below is reconstructed from (a) the stage brief's one-line summary and (b) the already-merged backend snapshot code verified in this tree (Section 2.1). Fixture work in Phase A must re-verify the wording against the real WP-C `RESPONSE.md` before coding.

### 0.1 Survey constraints (from stage brief — binding)

- **q9:** always show counts, including grey "0 runners".
- **q10:** health details live in Settings/admin, not in picker rows.
- **q13:** keep stored references to absent/0-runner ids, marked "not currently served"; never auto-clear.
- **q19:** runner counts drive badges (not the backend-local probe, not the snapshot `available` verdict).
- **q20:** unverified rows stay selectable but are clearly marked.

### 0.2 Acceptance criteria (from stage brief — each gets a test in Section 5)

- **A1:** entry `{available:false, runnerCount:0}` renders "0 runners" (renders "Unavailable" today).
- **A2:** `fleetModelsForHarness('muse', {'ollama-cloud-direct::gemma4:31b-cloud':{harnesses:['muse','pi']}})` returns 0 entries (returns 1 today).
- **A3:** muse option with `catalogue.harnesses=[{id:'muse',runnerCount:1}]` + backend `available:false` renders "1 runner" (renders "Unavailable" today).
- **A4:** fixtures follow the WP-C contract; after WP-C merges, one integration test runs against real `createFleetModelSnapshotStore({filePath:null})` output.

## 1. Principle: make the change easy, then make the change

1. **Freeze the contract first** (Phase 0): one fixture factory matching the WP-C response shape; every later phase builds against it.
2. **Add seams without behaviour change** (Phases A–B): extend `fleetCountsById` to carry `declaredBy`/`verified`/provenance, add new badge helpers alongside the old ones, plumb `catalogue.harnesses` into the harness dropdown as an unused prop. All existing tests stay green.
3. **Flip behaviour one surface at a time** (Phases C–F): strict gate → model rows → harness dropdown → stored refs → admin view. Each flip updates its own tests in the same diff.
4. **Delete the old path last** (Phase G): remove `fleetSnapshotBadgeNode` from picker rows (keep or relocate it only if the admin health view reuses it), drop dead imports/branches.
5. **Never break the WP-C seam:** no picker reads `available`/`unavailableReason` for rendering after Phase D; counts + `verified`/`declaredBy` are the only badge inputs in pickers.

## 2. Scope map (verified against this tree)

### 2.1 WP-C response contract to build against (fixture shape)

From the stage brief plus the merged backend code (`api/flow/dispatch/fleetModelSnapshot.js`,
`api/flow/runnerRoutes.js:578-632`, `api/flow/dispatch/fleetModelSnapshot.test.js`):

```js
{
  models: [
    {
      id: 'muse::meta::muse-spark-1.3', // canonical harness::provider::model[::effort]
      harness: 'muse',
      runnerCount: 1,                   // VERIFIED only (discovery-confirmed, claim-eligible)
      runnerIds: ['r1'],
      declaredBy: ['r2'],               // advertised but unconfirmed claimants (pins/allowlist/no-signal)
      claimedBy: [],                    // contradicted by own successful scan
      verified: true,                   // DERIVED on read (runnerCount > 0), never persisted
      available: true,                  // DERIVED on read (runnerCount > 0), never persisted
      unavailableReason: null,          // DERIVED on read; pickers must NOT render from this
      tiers: ['T0'],
      firstSeenAtMs: 0, lastSeenAtMs: 0, lastServedAtMs: 0, lastServedRunnerIds: ['r1'],
      provenance: { r1: { /* per-runner discovery status */ } },
    },
  ],
  harnesses: [{ id: 'muse', runnerCount: 1, runnerIds: ['r1'] }], // from summarizeFleetHarnesses
  quarantined: [{ id: 'ollama-cloud-direct::gemma4:31b-cloud', reason: 'not-harness-qualified …' }],
}
```

Key rules the plan relies on: only canonical harness-scoped ids enter `models` (bare/`provider::id` quarantine);
`available`/`verified`/`unavailableReason` are derived, never persisted; 0-runner entries persist indefinitely
(admin DELETE removes them); `harnesses[]` is id-sorted and claim-eligibility filtered.

### 2.2 Current behaviour (the code being changed)

- `frontend/src/components/common/ModelSelector.jsx:337-338` — `fleetSnapshotBadgeNode(...)` wins over
  `fleetCountBadgeNode(...)`; that is the A1/A3 bug. Model rows are built at lines 327-350.
- `frontend/src/components/common/ModelSelector.jsx:33-44` (`harnessAvailabilityBadgeNode`) + line 361 —
  harness dropdown badges come from the backend-local `available` projection via
  `frontend/src/services/harnessPrefs.js` (`availabilityFromEntry`/`availabilityBadge`); the selected-harness
  install hint renders at lines 395-399. Both move to Settings per change (3).
- `frontend/src/services/modelStatus.js:70-88` (`fleetCountBadgeNode`) — renders "No runners" today; the task
  requires grey "0 runners". Lines 201-241 (`fleetSnapshotBadge`/`fleetSnapshotBadgeNode`) render "Unavailable"
  from `available:false`; they must leave picker rows (only lawful remaining consumer is the admin health view).
- `frontend/src/services/fleetModelOptions/fleetModelsForHarness.js:65-76` — `provider` and `bare` branches
  synthesize cross-section entries; deleting them is A2. Downstream: `withFleetModels.js`,
  `fleetServesHarness.js` (length check), `effectiveModelSelection.js` (`none`→`list` lift).
- `frontend/src/components/settings/ModelAliasesSection.jsx:510-515` — same snapshot-wins pattern in alias target
  rows; `targetValidity` (lines 134-196) and `resolveStoredModelValidity` (imported from ModelSelector) govern
  stored-ref badging.
- `frontend/src/hooks/useFleetModelCatalog/fleetCountsById.js:15-39` — builds the picker map; currently drops
  `declaredBy`/`verified`/provenance. `useFleetModelCatalog.js` gates badges on `loaded` (badge-free until fetch
  succeeds) — keep that gate; "0 runners" renders only from loaded data, never from a failed fetch.
- Admin surface today: `SystemSettingsContent.jsx` Models tab is a wireframe draft (`Discovered models` count +
  refresh); runner re-scan exists as `api.requestModelRediscovery(runnerId)` used by
  `RunnerConfigurationSection.jsx:603`. No fleet-catalogue table, quarantine list, or catalogue DELETE client
  exists in frontend (backend DELETE routes exist at `runnerRoutes.js:612-632`).

### 2.3 Out of scope (non-goals)

- WP-C backend work (snapshot store, catalogue routes, quarantine rules) — consume via fixtures; do not edit `api/`.
- WP-B discovery-status vocabulary (`NOT_YET_RUN`/`LEG_MODULE_MISSING`/stale) — render whatever the contract
  carries; do not redefine it.
- Backend-local probe itself (`harnessDiscovery`) — it stays; only its picker-row rendering moves.
- Credential-health badges (`modelStatusBadge`, `healthBadges` prop for backend-executed pickers) — untouched;
  fleet counts already win when both are provided and that precedence stays.
- True OS-level harness availability on the backend host — out of scope for a picker-rendering task.

## 3. Step-by-step implementation plan

Big/research pieces first; each phase ends green (`npm run test:unit`) before the next starts.

### Phase 0 — Research and contract freeze (no behaviour change)

**Goal:** remove every unknown before fixtures are written.

1. Read the real WP-C `RESPONSE.md` section 4 (models/harnesses/quarantined field list, DELETE routes,
   `requestModelRediscovery` re-scan semantics) from the WP-C branch or merged main; diff it against Section 2.1
   and correct this plan's fixture shape first if anything differs (field rename beats code churn later).
2. Read `api/flow/dispatch/fleetModelSnapshot.js` fully (derive rules, timestamps, provenance shape,
   `summarizeFleetHarnesses`), plus `fleetModelSnapshot.test.js` "serves normalized entries" case as the
   canonical example payload.
3. Inventory every consumer of the four owned modules: grep `fleetSnapshotBadgeNode`, `fleetCountBadgeNode`,
   `fleetModelsForHarness`, `harnessAvailabilityBadgeNode`, `resolveStoredModelValidity` across
   `frontend/src`; record the full call-site list in the implementation PR description so no picker is missed.
4. Decide the two wording points the brief leaves implicit and record them as decisions: (a) singular/plural
   ("1 runner" / "N runners" — keep, matches existing helper); (b) zero wording ("0 runners", replacing
   "No runners" — required by q9/A1; grep tests for "No runners" to size the update).
5. Confirm where "Backend harnesses" lives in System Settings (which tab/section owns it after this change) and
   where the admin fleet-catalogue view mounts (extend the Models tab vs new tab); check `settingsTabs.js` and
   access-control guards (`adminGuard` parity for DELETE buttons).

### Phase A — Fixtures + map seam: make the data easy (no behaviour change)

**Goal:** one WP-C-shaped fixture factory; the picker map carries the new fields; all tests still green.

1. Add a fixture factory co-located with the owned tests (e.g.
   `frontend/src/services/fleetModelOptions/__fixtures__/wpCFleetCatalogue.js` or next to
   `useFleetModelCatalog.test.js`) exporting:
   - `wpCCatalogue()` — full payload per Section 2.1: a verified 2-runner model, a 1-runner model, a
     `{available:false, runnerCount:0}` 0-runner model, an unverified model
     (`{verified:false, declaredBy:['local-alpha'], runnerCount:0}`), `harnesses[]` with counts, one
     quarantined bare id.
   - `wpCCounts()` — the same payload passed through `fleetCountsById` (i.e. the picker-map form).
   - Keep the factory pure and deterministic (fixed timestamps; `lastServedAtMs` fixed, age computed by the
     component under test with a mockable clock).
2. Extend `fleetCountsById` to carry the WP-C fields pickers/admin need (`declaredBy`, `claimedBy`, `verified`,
   `harness`, `tiers`, timestamps, provenance) alongside the existing `runnerCount`/`runnerIds`/`harnesses`.
   Malformed entries still skip (existing fail-safe); unknown extra fields pass through untouched so WP-B
   discovery statuses render without a frontend change.
3. Extend `useFleetModelCatalog` (or its consumer seam) to also expose `harnesses` (the `catalogue.harnesses[]`
   array) and the raw `models`/`quarantined` lists for the admin view — as new optional return fields with
   defaults (`[]`), so existing consumers are unaffected.
4. Add/extend unit tests: `fleetCountsById` round-trips the new fields; unknown/malformed entries skip; hook
   exposes `harnesses` (default `[]`, populated after mocked fetch).
5. Acceptance hook: assert the fixture matches the WP-C contract shape (required keys present, `available` and
   `verified` consistent with `runnerCount > 0`) so contract drift fails fast here, not in picker tests.

### Phase B — Badge helpers: make the rendering easy (no behaviour change yet)

**Goal:** new pure helpers with tests, sitting alongside the old ones; no caller flips.

1. In `modelStatus.js`, add (names are proposals; keep whatever the codebase prefers):
   - `fleetCountBadgeNode` update path: change the zero label from "No runners" to "0 runners" (grey slate dot
     stays). Do this as a pure-function change with updated unit tests first; callers render it automatically.
   - `fleetUnverifiedNote(info)` (pure metadata) + node: shown when `verified === false && declaredBy.length > 0`;
     subtle styling, tooltip `declared by {declaredBy.join(', ')}, not found by its discovery`. Returns null
     otherwise (verified entries and entries with no declarants get no annotation).
   - `fleetModelRowBadge(info, model)` (pure composition): ALWAYS returns the count node; appends the unverified
     annotation when present. Never reads `available`/`unavailableReason`. This is the single function Phases D–E
     call, so the "counts win" rule has one enforcement point.
   - `notCurrentlyServedBadge()` (pure metadata + node): the "not currently served" marker for stored refs to
     absent/0-runner ids (Phase E).
   - `fleetHarnessBadgeNode(harnessEntry)` (pure): "N runners" green/neutral from `catalogue.harnesses` count,
     grey "0 runners" when 0/missing-but-loaded; null when fleet data is unloaded (badge-free, never mislead —
     preserves the `loaded` gate).
2. Unit tests in `modelStatus.test.js` for each helper: counts (0/1/N incl. malformed → 0), unverified tooltip
   with single/multiple declarants, `verified:false` with empty `declaredBy` → no annotation, harness badge
   0/1/N/unloaded, "not currently served" label.
3. Do NOT change any caller in this phase; run the full frontend suite to prove the additions are inert.

### Phase C — Strict gate in fleetModelsForHarness (first behaviour flip; A2)

**Goal:** only harness-form ids with `parsed.harness === hid` render; provider/bare branches deleted.

1. In `fleetModelsForHarness.js`: delete the `parsed.form === 'provider'` and `parsed.form === 'bare'` branches
   (lines 65-76); keep the `harness`/`harnessReasoning` strict match plus the existing `serving`-list gate
   (defence in depth: both the id grammar AND the entry's `harnesses[]` must admit the section).
2. Keep the `available`/`unavailableReason` verdict ride-along ONLY if the admin health view needs it; otherwise
   drop it here too (pickers no longer read it after Phase D). Decide in Phase 0 step 1 and do it in this diff.
3. Assess downstream impact in the same diff (all owned or adjacent-pure):
   - `fleetServesHarness` (length check) and `effectiveModelSelection` (`none`→`list` lift) automatically narrow
     to harness-scoped ids — verify no test depends on a provider/bare id lifting a `none` harness; update
     `ModelAliasesSection.test.jsx` / `ModelSelector.test.jsx` `none`-harness cases to use harness-scoped fixture
     ids where they relied on the lenient behaviour.
4. Tests (new `fleetModelsForHarness.test.js` — none exists today):
   - A2 verbatim: `fleetModelsForHarness('muse', {'ollama-cloud-direct::gemma4:31b-cloud':{harnesses:['muse','pi']}})`
     returns `[]`.
   - Harness-form id with `parsed.harness === hid` renders; with a different harness does not.
   - `harnessReasoning` form keeps `id::reasoning` synthesis.
   - Provider/bare ids never render even when `serving` lists the harness (grammar gate) and even when `serving`
     is empty (unknown ≠ admitted for non-harness forms).
   - Malformed ids / unparseable keys skip without throwing; `undefined` counts → `[]`.

### Phase D — Picker rows render counts, always (the core flip; A1, A3, q9, q19, q20)

**Goal:** model rows ALWAYS render `fleetModelRowBadge`; harness dropdown renders fleet harness counts.

1. `ModelSelector.jsx` model rows (lines 327-350): delete the `fleetSnapshotBadgeNode` early-return (lines 337-338);
   every option with loaded fleet data renders `fleetModelRowBadge(info)` — "N runners" green/neutral, "0 runners"
   grey (even for `{available:false, runnerCount:0}` → A1), plus the subtle "unverified" annotation when
   `verified:false && declaredBy.length > 0` (tooltip per Phase B). Unverified and 0-runner rows stay selectable:
   no `disabled`, no filtering — assert this in tests (q20).
2. `ModelSelector.jsx` harness dropdown (lines 357-369 + `harnessAvailabilityBadgeNode` lines 33-44): replace the
   backend-`available` badge with `fleetHarnessBadgeNode` fed from a new optional `fleetHarnesses` prop
   (`catalogue.harnesses[]`; default: badge-free, preserving older-backend behaviour). A3 case: muse option with
   `runnerCount:1` + backend `available:false` renders "1 runner". Grey "0 runners" for fleet-known-but-unserved
   harnesses; badge-free when fleet data is unloaded. Remove the selected-harness install hint (lines 395-399)
   from this component — it moves to Settings (step 4).
3. `ModelAliasesSection.jsx` target rows (lines 506-515): same flip as step 1 — delete the snapshot early-return,
   render `fleetModelRowBadge` for every option. Alias harness dropdowns in the target rows are catalogue-driven
   without badges today; leave them badge-free (no new badge surface there) unless Phase 0 finds a harness badge
   there too.
4. Relocate the backend-local probe badge + install hint to System Settings → Backend harnesses: render
   `harnessAvailabilityBadgeNode` (moved, not copied — keep one implementation) and the `hint` text there only.
   Keep the "entries from older backends render badge-free" rule. This satisfies q10 (health detail in Settings).
5. Update the JSDoc on `ModelSelector` (`fleetCounts` param, badge semantics comment lines 316-326) and the alias
   row comment (lines 502-515) to the new rule: counts always, snapshot verdict never in pickers.
6. Tests:
   - `ModelSelector.test.jsx`: A1 (snapshot-`available:false` + 0 runners → "0 runners", no "Unavailable"); A3
     (muse 1-runner + backend `available:false` → "1 runner"); unverified row renders count + annotation and is
     still selectable (click → `onChange` fires); 0-runner row selectable; harness options render fleet counts;
     no `harness-availability-hint` testid in the picker anymore; unloaded fleet → badge-free (existing tests).
   - `ModelAliasesSection.test.jsx`: same A1/unverified/selectable trio in the row dropdown; existing
     "marks snapshot-unavailable models Unavailable" test is REPLACED by the "0 runners" expectation (record the
     swap in the PR; do not keep both).
   - Update every "No runners" expectation to "0 runners" (sized in Phase 0 step 4).

### Phase E — Stored refs: "not currently served", never auto-clear (q13)

**Goal:** absent/0-runner stored ids badge honestly and persist.

1. Audit the three stored-ref paths for auto-clear behaviour: `ModelSelector` `resolvedValue` + reasoning `useEffect`
   strip (lines 284-314 — strips only reasoning levels, must not strip the model ref itself),
   `resolveStoredModelValidity` (ModelSelector lines 68-74), and alias `targetValidity` (ModelAliasesSection
   lines 134-196, `unknown-model` soft status). Confirm none clears/rewrites the stored string on a catalogue miss;
   if any does, remove that rewrite (keep validation messages).
2. Render `notCurrentlyServedBadge` ("not currently served") next to the trigger/validity line when the stored ref
   resolves to an absent id or a 0-runner id. Exact anchor per surface (picker trigger vs alias footer) is a Phase 0
   decision; the rule is uniform: mark, never hide, never clear.
3. Tests: stored unknown id renders the marker and the stored value is unchanged after render + after a catalogue
   refresh; stored 0-runner id renders "0 runners" in the option + "not currently served" at the trigger; no
   `onChange` fires spontaneously on mount for either.

### Phase F — Settings admin: fleet-catalogue table + quarantine + re-scan (q10)

**Goal:** the health detail q10 promises, on the WP-C contract, inside the owned Settings surface.

1. Build the admin view (location decided in Phase 0 step 5; likely the Models tab or a new Fleet tab in
   `SystemSettingsContent.jsx`): a fleet-catalogue table with columns `id`, `runnerCount`, `verified`,
   `declaredBy`, `lastServedAt`/age, and per-runner discovery status (render WP-B codes
   `NOT_YET_RUN`/`LEG_MODULE_MISSING`/stale verbatim from provenance — no frontend vocabulary of its own).
2. Actions, wired to the existing backend contract:
   - "Remove permanently" per row → `DELETE /runners/models/catalogue/:id` (new `api` client method; admin-gated
     button mirroring the image-gen admin pattern; 204 → drop the row locally + refresh; 404 → refresh).
   - Quarantine list with per-row remove → `DELETE /runners/models/catalogue/quarantine/:id`.
   - "Re-scan" button → existing `api.requestModelRediscovery(runnerId)` (per-runner; reuse the
     `RunnerConfigurationSection.jsx:603` pattern including pending/failed states).
3. States: loading, empty (no models / no quarantined), error (failed fetch keeps the last good table + an error
   note; never a blank table that looks like "no models"), and non-admin (buttons hidden/disabled per the
   access-control convention found in Phase 0).
4. Tests: table renders all columns from the Phase A fixture (incl. age formatting with a fixed clock);
   per-runner discovery statuses render verbatim; Remove/quarantine-remove call the right endpoints and refresh;
   Re-scan calls `requestModelRediscovery` with the runner id; non-admin hides the destructive buttons.

### Phase G — Cleanup + post-WP-C integration (A4)

**Goal:** dead code out; one test against the real snapshot store after WP-C merges.

1. Delete `fleetSnapshotBadgeNode`/`fleetSnapshotBadge` from picker imports; keep the functions ONLY if the Phase F
   admin view reuses the "Unavailable + reason" rendering for its health column — otherwise delete them and their
   tests (record the decision in the PR). Remove the now-unused `harnessPrefs` availability import from
   `ModelSelector.jsx` (it stays used by the Settings Backend-harnesses view).
2. Knip/lint: run the repo's gates (Section 6) and clear unused exports/imports in the owned files.
3. A4 integration test (runs only after WP-C merges; before that it stays skipped with a `describe.skip` + TODO
   naming WP-C): build a real payload via `createFleetModelSnapshotStore({ filePath: null })`, feed several runner
   registrations through `update()`, pass the result through `fleetCountsById` + `fleetModelsForHarness` +
   `fleetModelRowBadge`, and assert A1/A2/A3 end to end. Mark it as the WP-C-merge gate in the PR checklist.

## 4. Key decisions

- **D1 — Counts are the only picker badge input.** `available`/`unavailableReason` never render in pickers after
  Phase D (q19). The snapshot verdict survives at most in the admin health column.
- **D2 — Zero is "0 runners", grey.** Replaces "No runners" (q9/A1). Badge-free is reserved for unloaded/failed
  fleet data, never for a loaded zero.
- **D3 — Grammar gate, not allowlist gate.** `fleetModelsForHarness` admits only harness-form ids with
  `parsed.harness === hid`; the entry `harnesses[]` check stays as defence in depth (A2).
- **D4 — Unverified is an annotation, not a verdict.** `verified:false && declaredBy.length > 0` adds a subtle
  "unverified" note with the declarant tooltip; the row stays selectable (q20).
- **D5 — Stored refs are never auto-cleared.** Absent/0-runner ids render "not currently served" (q13).
- **D6 — Fixtures until WP-C merges, then one real-store test.** All picker/admin tests run against the Phase A
  factory; A4 pins the contract to `createFleetModelSnapshotStore({filePath:null})` after merge.

## 5. Test plan (maps every acceptance + survey clause to a test)

| Requirement | Test | Location |
|---|---|---|
| A1: `{available:false,runnerCount:0}` → "0 runners" | picker row renders count, no "Unavailable" | `ModelSelector.test.jsx`, `ModelAliasesSection.test.jsx`, `modelStatus.test.js` |
| A2: provider-form id with serving muse → 0 entries | strict-gate unit tests incl. verbatim case | new `fleetModelsForHarness.test.js` |
| A3: muse 1-runner + backend `available:false` → "1 runner" | harness option badge test | `ModelSelector.test.jsx` |
| A4: fixtures match WP-C; post-merge real-store test | contract-shape assertion + skipped-until-WP-C integration test | fixture module + integration test file |
| q9: always counts incl. grey "0 runners" | 0/1/N badge tests + grey-dot assertion | `modelStatus.test.js`, picker tests |
| q10: health detail in Settings/admin | probe badge + hint render in Backend harnesses; admin table columns/actions | Settings tests (new) |
| q13: "not currently served", never auto-clear | stored-ref marker + no-spontaneous-`onChange` tests | `ModelSelector.test.jsx`, `ModelAliasesSection.test.jsx` |
| q19: counts drive badges | no picker test references `available` for rendering; snapshot-wins tests replaced | picker tests (swap recorded in PR) |
| q20: unverified selectable + marked | annotation + click-fires-`onChange` tests | picker tests |
| Regression: unloaded fleet → badge-free | existing `loaded`-gate tests stay green | `useFleetModelCatalog.test.js`, picker tests |
| Regression: `healthBadges` backend pickers | existing credential-badge tests stay green | `ModelSelector.test.jsx` |
| Regression: `none`→`list` lift | `none` harness with harness-scoped fleet id behaves as `list` | `ModelSelector.test.jsx`, alias tests |

Headless UI checks (no long-lived servers): exercise the picker + admin table through the existing jsdom/vitest
suites; if a visual check is needed, use `npm run capture:screenshot` against a fixture-driven story, never a
dev server.

## 6. Validation plan (evidence for each phase)

- **Per phase:** `npm run test:unit` (canonical gate: `test:api` + `test:frontend`) — must be green before the
  next phase starts. Run the focused suite first for speed (`npm run test --prefix frontend -- <file>`), then the
  full gate.
- **Static gates:** the repo's configured lint/typecheck for the touched area (check `frontend/package.json`
  scripts + CI config in Phase 0; run exactly those — e.g. `npm run lint --prefix frontend` if configured).
- **Contract gate (Phase A + G):** fixture shape assertion green; after WP-C merges, un-skip the A4 integration
  test and watch it pass against the real store.
- **Highest-risk validation:** Phase D picker flip — the A1/A3/q20 tests plus the full `ModelSelector` +
  `ModelAliasesSection` suites, because every model picker in the app renders through these two components.

## 7. Risks and open questions

- **R1 — WP-C contract drift.** The fixture shape (Section 2.1) was reconstructed without the real `RESPONSE.md`.
  Mitigation: Phase 0 step 1 diffs against the real doc first; the Phase A contract assertion fails fast on drift.
- **R2 — "No runners" string churn.** Renaming to "0 runners" touches tests outside the owned files (any suite
  asserting the old label). Mitigation: size with grep in Phase 0; keep the rename to owned files + their tests
  and list stragglers in the PR.
- **R3 — `none`-harness lift narrowing.** Strict gating may drop `none`→`list` lifts that relied on provider/bare
  ids. Mitigation: Phase C step 3 audits those tests explicitly; any intentional lift gets a harness-scoped
  fixture id.
- **R4 — Admin mounting + auth.** The fleet-catalogue view's tab location and admin-guard convention are
  unverified. Mitigation: Phase 0 step 5 resolves both before Phase F starts.
- **Q1:** Does the real `SURVEY.md` (absent at plan time) add constraints beyond q9/q10/q13/q19/q20? If it appears,
  re-check Sections 0.1 and 5 before coding. Checked the repo: no `SURVEY.md` exists for this task id.
- **Q2:** Should `fleetSnapshotBadge(Node)` be deleted or reused in the admin health column? Default: reuse if the
  column wants "Unavailable + reason", else delete. Decided in Phase G.
- **Q3:** Exact anchor for "not currently served" (picker trigger vs option vs alias footer)? Default: trigger +
  alias footer validity line. Decided in Phase 0, implemented in Phase E.

## 8. Documentation plan

- Update JSDoc on every touched export (`fleetCountBadgeNode`, `fleetModelsForHarness`, `ModelSelector` props,
  alias row comments) to state the new rule; stale "snapshot wins" / "No runners" prose is a Phase G checklist item.
- PR description records: the Phase 0 call-site inventory, the replaced-test swap list (old "Unavailable wins"
  tests → new count tests), the D1–D6 decisions, and the WP-C-merge checkbox for the A4 test.
- If the repo has picker/admin user docs mentioning "Unavailable" badges, update the wording to the count model in
  the same PR (docs-only follow-up, no new behaviour).
