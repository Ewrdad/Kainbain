# Runner config page refinement — Implementation plan

## Goal

Refine the System Settings › Runners configuration screen
(`frontend/src/components/settings/RunnerConfigurationSection.jsx`, backed by
`api/flow/runnerRoutes.js`, `api/flow/runnerRegistry.js`, and `runner/daemon.js`)
so that: the whole roster row is clickable; directory fields show effective
defaults instead of blank inputs; model selection toggles runner-advertised
models instead of free text; the operator can re-kick model detection; and the
operator can trigger a runner update from the page — plus the further refinements
in Phase 6.

## Success Criteria

- Clicking anywhere on a roster row (mouse or keyboard) selects that runner;
  selection still works with screen readers and keeps existing test ids.
- Directory fields display the runner's effective folders on first view with no
  typing, and saving is a single explicit save (no double-click confirm dance
  unless a destructive consequence remains).
- Models render as toggles over the union of advertised and allowlisted ids,
  with a way to add an id the runner under-reports and a reset-to-advertised path.
- A "Re-detect models" control asks the runner to re-run discovery and the UI
  reflects the fresh list without a page reload.
- An "Update now" control is offered exactly when an update is available and
  causes an idle runner to update; a busy runner queues safely and the UI shows
  progress/failure.
- `npm run test:unit` and `npm run lint` pass; new behaviour has committed tests
  beside the existing suites; user-facing docs updated.

## Context and evidence

- Page today: `frontend/src/components/settings/RunnerConfigurationSection.jsx`
  (1040 lines, single component). Only the name `<button>` selects
  (lines ~511-520); badges (`updateAvailable`, `belowMinimum`, update `failed`)
  are display-only (~556-590); models are a comma-separated text input
  (~854-911); directories default to `''` and the UI states they are "not sent
  to the Runner yet" (~974-978).
- Helpers: `frontend/src/components/settings/runnerConfigHelpers.js`
  (`defaultRunnerConfig`, `advertisedModels`, `effectiveModels`,
  `parseModelsInput`, `describeRunnerVersion`, `runRunnerAction`) — pure and
  unit-tested (`runnerConfigHelpers.test.js`).
- API surface: `frontend/src/services/runners/index.js` — list, monitor,
  catalogue, config get/patch, approve/deny/revoke/pause/resume/skip. No
  rediscovery or update-trigger endpoints exist.
- Backend: `api/flow/runnerRoutes.js` has no runner-directed command endpoint;
  the heartbeat response already carries a pull channel (`pendingSteers`,
  ~line 279-313, ADR 0011) — the natural pattern for runner-directed commands.
  Badges derive in `api/flow/runnerRegistry.js` `_public()` from heartbeat
  facts plus `config.runnerMinVersion` / `runnerRecommendedVersion`.
- Runner: `runner/modelDiscovery.js` (`discoverClaudeModels`, best-effort,
  12h cadence, `MODEL_DISCOVERY_INTERVAL_MS_DEFAULT`); `runner/daemon.js`
  self-updates idle-only and reports `updateStatus` via heartbeat facts; the
  only forced update today is the 409 `RUNNER_VERSION_BELOW_MINIMUM` path.
- Gap: the stage brief cites a grill survey at
  `docs/tasks/8ded2dfc-0df7-424a-8c19-f2f8b78c0941/SURVEY.md` plus an idea file,
  but that directory does not exist in this checkout — the survey could not be
  factored in. Decisions below fall back to the task text and code evidence;
  confirm with the survey owner before execution if it surfaces.

## Key Decisions

- D1 — One command channel for both "re-detect" and "update now". Rationale:
  both are backend→runner nudges with the same delivery, ack, and staleness
  problems; the heartbeat pull channel (`pendingSteers`) proves the pattern.
  Alternative (separate ad-hoc endpoints per action) rejected: doubles the
  protocol surface and leaves ack semantics inconsistent.
- D2 — Runner stays authoritative for facts; backend stays authoritative for
  operator intent. Discovery results and effective directories flow runner→backend
  via heartbeat facts; operator intent flows backend→runner via pending commands.
  No direct UI→runner calls (runners may be remote).
- D3 — Directory defaults come from runner-reported facts, not invented
  frontend constants. If the runner cannot report them, the UI labels the
  fields "Runner default (unknown)" rather than guessing paths.
- D4 — Model toggles keep the existing `PATCH /runners/:id/config`
  `{ availableModels }` contract (allowlist replaces advertised; `null` resets).
  UI-only change backed by the same endpoint; no new model-config API.
- D5 — "Update now" respects the idle-only invariant (ADR 0012): the command
  means "update at next idle", never "interrupt a task". The UI must say so.

## Work Plan

### Phase 0 — Research spikes (first; unblock everything)

- Step 0.1 — Survey recovery. Confirm whether SURVEY.md exists outside this
  checkout; if found, reconcile its answers with D1-D5 and amend this plan.
  If not, record the gap as accepted and proceed on task text.
- Step 0.2 — Command-channel spike. Read the heartbeat round-trip end to end
  (`runner/client.js` heartbeat call, daemon heartbeat loop cadence, registry
  `heartbeat()`, `pendingSteers` ack via `steerAck`) and write a short design
  note: `pendingCommands` shape on the record, delivery in the heartbeat
  response, ack path (facts echo vs explicit ack endpoint), TTL/staleness, and
  what a runner that never heartbeats shows in the UI. Output: ADR-style note
  under `docs/adr/` or the task dir; must be reviewed before Phase 3.
- Step 0.3 — Directory-defaults spike. Determine the runner's effective
  master/worktree folders today (daemon `workRoot`, project `cwd` resolution
  in `runner/project.js`, CI workdir logic) and whether they can be reported
  in heartbeat facts. Decide the exact facts keys and backend fallback when an
  old runner does not send them. Output: decision recorded in the Phase 4 spec.

### Phase 1 — Make the change easy (no behaviour change)

- Step 1.1 — Split `RunnerConfigurationSection.jsx` (~1040 lines) into
  focused units without changing rendered output: `RunnerRoster.jsx` (list),
  `RunnerDetail.jsx` (right panel shell), `RunnerModelsEditor.jsx`,
  `RunnerDirectoriesEditor.jsx`, plus a `useRunnerConfig` hook for
  load/mutate/save/reload state. Keep all existing `data-testid` values.
  Validation: existing `RunnerConfigurationSection.test.jsx` passes unmodified.
- Step 1.2 — Extend `runnerConfigHelpers.js` with the pure logic the features
  need (model toggle set-ops over union of advertised+effective; effective
  directory resolution incl. "unknown" state; command-availability predicates
  from record fields), each with unit tests. No network in helpers (keep the
  `runRunnerAction` exception pattern).
- Step 1.3 — Add shared fixtures/factories for runner records (advertised
  models, update badges, directory facts) reused by frontend tests, so later
  phases add cases not scaffolding.

### Phase 2 — Frontend quick wins (existing APIs only)

- Step 2.1 — Whole-row selection. Make the roster `<li>` the interactive
  element (click + Enter/Space, `role="option"`/`aria-selected` in a
  `listbox`, visible focus ring); keep the name button's test id as the
  accessible name. Add keyboard/a11y tests.
- Step 2.2 — Directory defaults display. Show effective folders from
  runner-reported facts (Phase 0.3 keys) as the field values with a
  "Runner default" hint; operator edits override via the existing PATCH.
  Remove or re-scope the double-confirm once the "not sent yet" limitation is
  resolved by Phase 4 (if Phase 4 slips, keep confirm but fix copy).
- Step 2.3 — Model toggles. Replace the text input with checkboxes over
  `union(advertised, effective)`, plus an "add id" field for under-reporting
  runners and the existing Reset control. Same PATCH contract (D4). Keep the
  effective-list summary line. Tests: toggle on/off payloads, custom add,
  reset-to-advertised, empty-advertised state.

### Phase 3 — Backend command channel (the big piece)

- Step 3.1 — Registry: `pendingCommands` per record
  (`requestModelRediscovery`, `requestUpdate`), set via new
  `POST /runners/:id/commands`-style endpoint(s), delivered in the heartbeat
  response, cleared on ack/TTL. Unit tests for set/deliver/ack/expire and for
  unknown-command refusal (mirror the `runRunnerAction` fail-closed style).
- Step 3.2 — Routes + API docs: operator endpoints to enqueue each command,
  returning a status the UI can poll (`queued` / `acked` / `stale` when the
  runner has not heartbeated). Contract tests beside `runnerRoutes.test.js`.
- Step 3.3 — `updateInfoForRunner` surfacing: ensure the record exposes
  everything the buttons need (update available + recommended version +
  last attempt state) — mostly already present; fill gaps found in Phase 0.2.

### Phase 4 — Runner daemon support

- Step 4.1 — Consume heartbeat-response commands: on `requestModelRediscovery`,
  re-run `discoverClaudeModels()` promptly (bypass the 12h gate once) and
  advertise the fresh list on the next heartbeat; on `requestUpdate`, run the
  existing idle-only update path at next idle and report `updateStatus`.
  Never interrupt live work (D5). Tests beside `daemon.test.js` with injected
  fakes (mirror existing `updateDeps` seams).
- Step 4.2 — Report effective directories in heartbeat facts (keys from
  Phase 0.3) so Phase 2.2 has real defaults. Update `modelDiscovery.test.js`
  neighbours only if discovery itself changes (avoid scope creep).

### Phase 5 — Wire the new UI controls

- Step 5.1 — "Re-detect models" button in the models editor (busy + success +
  error states; refresh the record after ack so toggles update without reload).
- Step 5.2 — "Update now" button in the detail header, shown exactly when
  `updateAvailable` (with recommended version in the label/tooltip); disabled
  with explanation while the runner is busy or below-minimum handling applies;
  reflects `updateStatus` progress/failure. Uses the endpoint from Phase 3.2
  via `frontend/src/services/runners/index.js`.
- Step 5.3 — Polling/refresh: after enqueue, re-fetch the record on a short
  bounded poll until ack/terminal state; no endless spinners.

### Phase 6 — Own refinements (small, each independently shippable)

- Per-control busy states: replace the global `busyKey` disable-everything
  with per-action pending flags so one save does not freeze the whole panel.
- Stale-runner honesty: when facts are old, badge rows "last seen Xm ago" so
  toggles/commands are read with the right scepticism.
- Empty states: no advertised models / no harnesses guidance already exists —
  extend with "Re-detect" hint linkage.
- Copy pass: remove "not sent to the Runner yet" wording once Phase 4 lands;
  document the idle-only update semantics inline.
- Keyboard/focus audit of the whole section after the split.

## Validation Plan

- Per phase: run the touched suites — frontend
  (`npm run test --prefix frontend -- <file>` for the section + helpers
  tests), backend (`npm run test --prefix api -- runnerRegistry runnerRoutes`),
  runner (daemon/modelDiscovery tests). Full gate before done:
  `npm run test:unit` and `npm run lint` from the repo root.
- Contract checks: new endpoints covered by API tests asserting status codes,
  fail-closed unknown commands, and no credential leakage (mirror the existing
  "never renders credential values" test).
- Manual/UI: exercise the page through the headless screenshot tool
  (`npm run capture:screenshot`) against mock fixtures — roster selection
  (mouse + keyboard), model toggles, directory defaults, both new buttons and
  their busy/error states. No long-lived background servers.
- Highest-risk validation: the Phase 3+4 round-trip (enqueue → heartbeat
  delivery → daemon acts → facts reflect → UI updates). Cover with an
  integration-style test using the existing fake client/registry seams before
  calling the feature done; stale/offline runner behaviour asserted explicitly.

## Documentation Plan

- Update the `MARK:` doc comments on touched components/helpers/routes
  (repo convention; `npm run docs:check`-adjacent hygiene).
- Short operator notes where runners are documented (settings screen help
  text + any runner README section): what Re-detect and Update-now do,
  idle-only semantics, what stale badges mean.
- Phase 0.2/0.3 design notes kept in the task dir; promote the command-channel
  decision to `docs/adr/` if it changes the runner protocol sketch (ADR 0009).

## Risks and Open Questions

- R1 — Old runners ignore new heartbeat commands. Mitigation: capability/
  version sniffing; UI shows "runner too old — update manually" instead of a
  dead button. (Assumption: version facts are reliable; verify in Phase 0.2.)
- R2 — Directory facts may not exist runner-side yet. Mitigation: D3 fallback
  ("unknown") keeps Phase 2 shippable before Phase 4.
- R3 — The missing SURVEY.md may contradict D1-D5. Mitigation: Step 0.1;
  do not start Phase 3 until it resolves.
- Q1 — Should Re-detect/Update-now be per-runner only, or also fleet-wide?
  Assumed per-runner (matches page scope); fleet action is a non-goal.
- Q2 — Can the double-confirm directory save be dropped entirely? Depends on
  whether any destructive consequence remains after Phase 4 — decide in 2.2.

## Non-goals

- Changing dispatch/matching semantics, the update signature scheme
  (ADR 0012), or discovery sources beyond the existing CLI probe.
- Fleet-wide bulk operations; runner install/registration flow changes.
