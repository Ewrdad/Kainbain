# Implementation Plan — Runner auto-detect models from all supported harnesses

## Goal

Every Runner auto-detects the models of each harness it serves (not just
`muse`), advertises them to the backend through the existing heartbeat,
and the existing UI Refresh / Re-detect controls drive a fresh scan.
Concrete target: a host like server2 with `pi` configured must serve its
pi models into the fleet picker with no hand-typed model list.

## Context and evidence

- Runner discovery today is muse-only: `discoverClaudeModels()` in
  `runner/modelDiscovery.js` (`muse serve` → `model/list`), and
  `refreshDiscoveredModels()` in `runner/daemon.js` returns early unless
  `muse` is in the configured harness list.
- The Runner bundle ships `runner/` + `api/` + `shared/` (see `deploy.sh`
  staging) and `startRunner.sh` runs `npm ci --prefix runner/api`, so the
  Runner host HAS the backend harness modules and their deps (including
  the pi SDK `@earendil-works/pi-coding-agent`). `defaultLoadHarness()`
  already imports backend harness factories on the Runner.
- Backend per-harness discovery already exists and is the behavior to
  reuse, not reimplement:
  - `pi`: `piHarness.listModels()` from `ModelRuntime.getAvailableSnapshot()`
    (only providers with VALID credentials appear — matches survey q2).
  - `antigravity`: `agyModelCatalog.js` (`agy models` spawn + parse, TTL
    cache, classified `{code,message,hint}` errors).
  - `opencode`: `OpencodeModelDiscovery.js` (`/config/providers` fetch).
  - `muse`: MSP `model/list` (`museMspModelCatalog.js`; Runner leg exists).
  - `vibe`: ACP handshake model select (`vibeModelCatalog.js`); exec path
    honestly empty.
  - `codex`: theoretical shim, honestly empty (`listModels()` → `[]`).
  - `custom`/`mock`: no discovery (`none`, or test-only).
- Refresh plumbing already exists end to end and only needs generalizing:
  `RunnerConfigurationSection.jsx` "Re-detect models" →
  `api.requestModelRediscovery(runnerId)` → `RUNNER_COMMANDS` heartbeat
  pull channel (`api/flow/runnerRegistry.js`, ADR 0013) →
  `handlePendingCommands()` → `refreshDiscoveredModels()` → ack
  `discovered N model(s)` → next heartbeat `facts.models` → fleet
  catalogue (`buildFleetModelCatalog`) → picker fleet badges
  (`withFleetModels`, `fleetCountBadgeNode`).
- Precedence already implemented: explicit `KAINBAIN_RUNNER_MODELS/MODEL`
  wins over discovery (`resolveAdvertisedModels`, pinned check in
  `handlePendingCommands`). Empty-scan behavior already implemented for
  muse: failures keep the previous cache and warn.
- `SURVEY.md` in this task folder is UNANSWERED (empty `answers: {}`),
  and the `idea-*.md` report named in the stage brief is not on disk.
  This plan adopts the survey's Recommended options as assumptions
  (flagged ASSUMPTION below) so the first implementation pass is
  reviewable without blocking on the survey.

## Survey assumptions (all from SURVEY.md Recommended options)

- ASSUMPTION q1 (scope): all six named harnesses — pi, muse, codex,
  opencode, vibe, antigravity. Codex/opencode legs are honest-empty until
  runnable (see Phase 0 spikes); this matches the backend honesty rule
  (never serve models that cannot run there).
- ASSUMPTION q2 (what to list): only models ready to use right now
  (logged in / valid credentials). This is what the reused
  `listModels()` legs already yield.
- ASSUMPTION q3 (Refresh button): ask the Runner to scan again right away
  and update the list. This is the existing `requestModelRediscovery`
  command; keep it, generalize the scan.
- ASSUMPTION q4 (precedence): the typed-in list wins, auto-detect ignored.
  Already implemented; keep and extend tests.
- ASSUMPTION q5 (empty scan): keep the old list, show a small warning.
  Already implemented for muse; generalize per-harness slices + status.
- ASSUMPTION q6 (presentation): detected models appear as normal choices
  in the model picker (fleet-joined options), not a separate Pi section.
  Already how `withFleetModels` works; no picker redesign.

## Approach (make change easy, then make the change)

Do NOT add five more one-off `discoverXModels` functions beside
`discoverClaudeModels`. Instead:

1. First (Phase 1) extract a Runner-side **discovery registry**:
   `harnessId → async discover(ctx) → string[]` with one shared cache,
   shared timeout/best-effort wrapper, and shared fleet-id mapping —
   migrating the muse leg into it with ZERO behavior change.
2. Then (Phase 2) add one leg per harness behind the same contract,
   each reusing the backend harness's own `listModels()` (single source
   of truth for "ready to use"), with fixture-seamed unit tests.
3. Then (Phase 3) wire status/UX: per-harness counts and first-error in
   the command ack + heartbeat facts, surfaced by the existing Runner
   detail status line. No new screens.

## Steps

### Phase 0 — Research spikes (first, de-risks everything)

- [ ] 0.1 Pi-on-Runner probe (server2). On a Runner host with pi
  configured (`~/.pi/agent/` holds `auth.json`, `models.json`,
  `models-store.json` on server2): import the bundled
  `api/agent/harnesses/pi/piHarness.js`, call
  `createPiHarness({}).listModels({refresh:true})`, and record: works
  headless, wall time, ids returned, behavior with no login (expect
  honest empty, no throw). Decides whether the pi leg is a direct
  `listModels()` call (expected) or needs a CLI/config-file fallback.
- [ ] 0.2 Opencode-on-Runner feasibility. Determine what an opencode leg
  would talk to on a Runner host: existing `OPENCODE_URL` vs spawning
  `opencode serve` per discovery round (cost, port, lifecycle). If neither
  is sane, scope opencode to honest-empty + status
  (`opencode server not reachable`) and note the follow-up.
- [ ] 0.3 Codex transport check. Confirm the live `codex` model-listing
  surface is still UNVERIFIED (see `codexHarness.js` header). Expected
  outcome: no codex leg this round; shim stays honest-empty. Record the
  decision in the plan file before Phase 2 starts.
- [ ] 0.4 Dispatch-match verification. Read
  `api/flow/dispatch/taskRequirements.js` + `runnerMatches.js` and confirm
  a fleet-advertised id (e.g. `pi::google::gemini-x`) dispatched from a
  picker exactly matches that Runner (the "fleet pick is a guaranteed
  match" invariant). Record any grammar fix needed before legs land.
- [ ] 0.5 Fleet-counts freshness check. Confirm how `/runners/models`
  catalogue readers refresh after a re-detection (poll vs manual
  reload), so Phase 3 knows whether the picker needs a refresh nudge or
  docs-only guidance. Record outcome.

### Phase 1 — Make change easy: discovery registry + muse migration (no behavior change)

- [ ] 1.1 Add `runner/harnessModelDiscovery.js`: `DISCOVERY_LEGS`
  registry (`{ [harnessId]: async (ctx) => string[] }`), `discoverModelsForHarnesses(ids, ctx)`
  (per-leg timeout, best-effort, dedupe, fleet-id grammar validation
  `harness::provider::id`, colon rejection like today), per-harness
  cache slices (`{ ids, atMs, error }`). Reuse `withModelKey` from
  `api/models.js` for id mapping so Runner ids are byte-identical to
  backend keys.
- [ ] 1.2 Migrate the muse leg into the registry as `muse:
  discoverClaudeModels` wrapper. Keep `discoverClaudeModels` export
  (tests + compat). No new harnesses yet.
- [ ] 1.3 Rework `refreshDiscoveredModels()` to iterate
  `runnerHarnessIds(config)` through the registry instead of the
  muse-only early return. Keep: pinned-models early return, keep-old-on-
  failure (now per-harness slice), warn-never-throw, log line (now with
  per-harness counts, e.g. `pi:12 muse:3`).
- [ ] 1.4 Rework the `requestModelRediscovery` ack detail to
  `discovered N model(s) (pi:12, muse:3)` and include the first leg
  error code when a leg fails (still `ok:true`, cache kept).
- [ ] 1.5 Unit tests: registry contract (timeout → `[]`, throw → `[]`,
  dedupe, grammar validation, per-slice keep-old), muse migration
  parity (existing `modelDiscovery.test.js` + `daemon.test.js` cases
  still pass unmodified where possible), ack detail format. New
  `runner/*.test.js` files must be registered in the explicit file list
  in `scripts/run-tests.mjs` ("Unit Tests (runner)" suite) or they never
  run.
- [ ] 1.6 Gate: `npm test` (the root gate runs the api, frontend, AND
  runner suites; `npm run test:unit` alone skips the runner suite) +
  `npm run lint` green.

### Phase 2 — Make the change: one leg per harness

Order by value and certainty (pi first — the task's concrete need).

- [ ] 2.1 `pi` leg: dynamic import the bundled pi harness factory,
  `listModels({refresh:true})`, map to `key` ids. Seams: injectable
  harness factory + listModels for fixture tests. Timeout ~20s.
  Do NOT read keys; the SDK snapshot already encodes credential validity.
- [ ] 2.2 `antigravity` leg: reuse `createAgyModelCatalog` with a
  `refresh`-equivalent (its `clearCache()` + `listAgyModels()`), map to
  keys. Reuse its classified errors for the leg error slot.
- [ ] 2.3 `vibe` leg: reuse `createVibeModelCatalog().listModels()`
  (handshake-only probe, no prompt, no cost). Exec-only hosts yield
  honest empty + retained error.
- [ ] 2.4 `muse` leg: already done in Phase 1 (keep as the reference
  implementation for leg shape).
- [ ] 2.5 `opencode` + `codex` legs: per Phase 0 outcomes — expected
  honest-empty legs returning `[]` with a status reason (no fake ids).
  If 0.2 finds a sane opencode path, implement it the same way
  (server URL from env, short fetch timeout).
- [ ] 2.6 `custom`/`mock`: explicitly NO legs (documented non-goal;
  `mock` never auto-detects, `custom` manages its own model).
- [ ] 2.7 AUTO_DETECTABLE_HARNESSES review: `pi,muse,antigravity,vibe`
  already covered; add `codex`/`opencode` to PATH auto-detect ONLY if
  `defaultLoadHarness` can run them (today it cannot) — otherwise leave
  detection as-is and record why. Do not expand runnable scope by
  accident.
- [ ] 2.8 Tests per leg: fixture-driven (fake harness/catalogue, no
  CLIs): happy path ids, empty login → `[]` + status, throw/timeout →
  `[]` + status, colon/malformed ids skipped, cross-leg dedupe.
- [ ] 2.9 Gate: `npm test` green (covers the runner suite).

### Phase 3 — Refresh-button + status UX (tie-in)

- [ ] 3.1 Heartbeat facts: add additive `facts.discoveryStatus`
  (`{ [harnessId]: { ok, count, atMs, error?: {code,message} } }`).
  Backend ignores unknown fields (additive, old backends safe).
- [ ] 3.2 Backend: persist `discoveryStatus` from facts into the runner
  record capabilities projection (same path as `facts.models`), serve
  it on the runner rows API. No schema break: absent = unknown, never
  mislead.
- [ ] 3.3 Frontend `RunnerConfigurationSection`: extend the existing
  re-detect status line to show per-harness counts from the ack detail
  (already rendered) and, when present, the first leg warning. Keep-old
  list behavior: no list change on failure (already true). No new
  buttons: the existing "Re-detect models" IS the refresh button for
  this screen (survey q3).
- [ ] 3.4 `ModelSelector` empty-state Refresh (`onRefresh` →
  `/compute/models?refresh=true`) already covers backend-host
  catalogues; verify it needs no change for fleet-joined options and
  record the outcome (Phase 0.5 input). Expected: docs-only.
- [ ] 3.5 Frontend tests: status-line renders counts + warning, empty
  list keeps old rows on failed re-detection, no-`discoveryStatus`
  (old backend) renders as today.
- [ ] 3.6 Headless verification only (per stage guidance): use existing
  mock fixtures + `npm run capture:screenshot` for the Runner models
  block and picker empty state. No long-lived dev servers.
- [ ] 3.7 Gate: `npm run test:frontend` + `npm run lint:frontend` green.

### Phase 4 — Assurance: E2E, docs, rollout

- [ ] 4.1 E2E on server2 (real pi): boot/point a Runner with
  pi auto-detect, no pinned models; assert heartbeat advertises
  `pi::…` ids; press Re-detect; assert ack counts + fleet picker shows
  the models as normal choices; revoke login (or stop agent) and assert
  keep-old + warning. Record commands + output in the task folder.
- [ ] 4.2 Regression: pinned-models Runner still skips discovery with
  the "models pinned" ack; muse-only Runner output byte-identical to
  before (Phase 1 parity).
- [ ] 4.3 Docs: update `docs/EngineDetails/HarnessModelSelector.md`
  (runner legs matrix), `runner/README.md` (env knobs unchanged +
  per-harness behavior), `api/agent/harnesses/README.md` (runner
  discovery column if it has a matrix), `CHANGELOG.md` entry.
  Keep `SURVEY.md` untouched (survey record).
- [ ] 4.4 Full gate: `npm test`, `npm run lint`,
  `npm run docs:check` green.

## Validation plan (maps to phases)

| Phase | Check | Expected evidence |
| 0 | probe scripts on server2 | notes in task folder: pi ids, timings, login-absent behavior |
| 1 | `npm test`, `lint` | green; muse parity tests pass |
| 2 | `npm test` | green; per-leg fixture tests pass |
| 3 | `npm run test:frontend`, `capture:screenshot` | green; screenshots of status line + empty state |
| 4 | server2 E2E + `docs:check` | recorded transcript; docs gate green |

## Risks and mitigations

- Pi SDK import on Runner hosts is heavy or slow → measure in 0.1;
  mitigate with lazy import + 20s leg timeout + cache (legs never run
  per-heartbeat, only on 12h cadence / boot / re-detect).
- Leg spawning hangs (agy/vibe binaries) → per-leg watchdog + kill,
  reuse existing catalog timeouts; failures keep old cache, never break
  heartbeats.
- Opencode needs a server the Runner host may lack → spike 0.2 decides;
  default honest-empty, no fake models.
- Old Runner / old backend mix → all wire additions additive
  (`discoveryStatus`, ack detail text); unknown fields ignored both ways.
- Scope creep into making the Runner RUN codex/opencode → explicitly out
  (2.7 records the boundary).

## Non-goals

- Changing precedence (typed-in wins) or picker presentation.
- New settings screens or new API routes (reuse `requestModelRediscovery`
  + `facts.models`).
- Making codex/opencode runnable on Runners (`defaultLoadHarness` scope
  unchanged).
- Touching `SURVEY.md` answers (survey record stays as-is).

## Open questions

- Q1 (was survey q1): confirm the six-harness scope, or cut
  codex/opencode legs to honest-empty permanently. Default assumed: all
  six, honest-empty where unrunnable.
- Q2: opencode-on-Runner desired at all (needs a server per host)?
  Default assumed: honest-empty unless spike 0.2 finds a cheap path.
- (Survey q2–q6 answered by Recommended defaults; revisit if the survey
  gets filled in differently.)
