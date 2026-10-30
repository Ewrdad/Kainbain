# Implementation Plan: Replace Harness Tab with Detailed Runner Configuration Settings

**Task:** Replace the legacy Harness settings tab with a detailed Runner configuration/settings screen, following the design in `assets/untitled-scene.png`.

**Survey basis:** `SURVEY.md` (all six questions answered). Key decisions captured there:

| Survey question | Decision |
|---|---|
| Q1 – What replaces the old harness on/off list? | Remove the harness settings fully; show only the new runner screen. |
| Q2 – Runner details to include | Runner name, project picker (Available vs Loaded), available tools, folder paths (Master/Worktree), job-type switches (Runs CI, Runs merges, Runs Impromptu). |
| Q3 – New/unknown runners | Show them in the runner list with approve/deny actions. |
| Q4 – Project picker meaning | Loading makes the project active for that runner. |
| Q5 – Job switches | Keep all three: Runs CI, Runs merges, Runs Impromptu. |
| Q6 – Folder paths | Editable text fields, with a save/confirm affordance to prevent accidents. |

---

## 1. Goals

1. Remove the `HarnessSection` on/off experience from System Settings (legacy harness enable/auto-detect/default harness controls no longer make sense in the runner world).
2. Replace that screen with a detailed **Runner configuration** surface in the same System Settings tab location.
3. Support multiple runners on one screen, including pending join requests with approve/deny.
4. For each runner expose:
   - Runner name / identity and status
   - Project participation (Available vs Loaded)
   - Available tools on that runner
   - Master directory and worktree directory (editable, with save confirmation)
   - Job-type capability switches: Runs CI, Runs merges, Runs Impromptu

## 2. Non-goals

- Do not redesign the Models, Engine, Storage, Notifications, Prompt Layout, or UI tabs.
- Do not remove the existing Runners onboarding/monitor logic wholesale; reuse the approved/denied/revoked state machine from ADR 0008/0009.
- Do not rework dispatch or capability advertisement in this first UI pass; operator preferences layer on top of the existing runner-reported facts.
- Do not commit task-run history or credentials; keep the existing `KAINBAIN_RUNNER_CREDENTIAL` one-time credential behaviour.

---

## 3. Current State Inventory

Frontend:
- `frontend/src/components/settings/settingsTabs.js` – defines `SETTINGS_TABS`; current first tab is `{ id: "harness", label: "Harness", ... }`.
- `frontend/src/components/settings/SystemSettingsContent.jsx` – renders `HarnessSection` + `RunnersSection` in the `harness` tabpanel.
- `frontend/src/components/settings/HarnessSection.jsx` – legacy harness discovery, availability badges, reliability, enabled/auto-detect + default harness selection.
- `frontend/src/components/settings/RunnersSection.jsx` – onboarding, pause/resume/revoke, approvals, live assignment display, capability/scope display.
- `frontend/src/services/runners/index.js` – runner API client: `getRunners`, `getRunnerMonitor`, approve/deny/pause/resume/revoke/skip.
- `frontend/src/components/settings/SystemSettingsContent.test.jsx`, `SystemSettingsPage.test.jsx`, `HarnessSection.test.jsx`, `RunnersSection.test.jsx` – pinned behaviour.
- `frontend/src/services/api.surface.test.js` – pinned API public surface.

Backend:
- `api/flow/runnerRegistry.js` – durable runner identity ledger (`register`, `approve`, `deny`, `pause`, `resume`, `revoke`, `heartbeat`, `list`, `projectScope`).
- `api/flow/runnerRoutes.js` – runner endpoints.
- ADR 0008/0009 and portability docs define runner capabilities, tiers (T0–T3), project scope, and maintenance duties.

---

## 4. Guiding Principle: Make Change Easy, Then Make the Change

Following the “one refactoring at a time” style used in the project-settings split plan, we first introduce additive plumbing and only then replace the visible surface. This prevents a risky, monolithic rewrite of the settings screen and keeps existing tests passing at intermediate commits.

Order of work:
1. **Research + data plumbing** (backend model + API client + helpers).
2. **Refactor existing components** so the new surface can reuse them.
3. **Switch the tab surface** behind a compatibility shim.
4. **Implement detailed runner configuration UI**.
5. **Verification + documentation**.

---

## 5. Proposed UX (from survey)

### 5.1 Tab location
Replace the current first tab’s *contents* from “Harness” to “Runner configuration”. For a staged migration, keep `/system-settings/harness` working by redirecting/aliasing it to the new tab id in Phase 5.3; rename the visible label to **Runner** once tests are updated.

Suggested tab entry:
```js
{ id: "runner", label: "Runner", showFooterReset: true }
```

### 5.2 Runner screen layout
Single scrollable tabpanel with two areas:

1. **Runner roster (top)**
   - One row per runner from `GET /runners`.
   - Status badge (`pending`, `active`, `paused`, `denied`, `revoked`).
   - Pending rows: **Approve** / **Deny** (survey Q3).
   - Active rows: **Pause** / **Resume** / **Revoke**.
   - Click/select a runner to load its configuration form below.

2. **Selected runner configuration form (bottom)**
   - **Runner name** – editable display name (backup identity: runner ID stays stable).
   - **Projects** – two columns:
     - Available projects (all projects from `listProjects`)
     - Loaded projects (currently scoped to the runner)
     - Move project row between columns; moving into Loaded calls `projectScope` update and triggers load/unload semantics.
   - **Available tools** – checklist/read-only capability chips drawn from `runner.capabilities.harnesses` (e.g. muse, Vibe CLI, pi).
   - **Folder paths** – Master directory and Worktree directory as editable text fields with **Save** buttons and “are you sure?” confirmation (survey Q6).
   - **Job-type switches** – three toggles:
     - Runs CI
     - Runs merges
     - Runs Impromptu
   - Save status / dirty indicator.
   - Reload from backend button.

---

## 6. Data Model and API Contract (additive)

### 6.1 Runner operator configuration
Extend the runner record with an operator-owned configuration object. Keep it distinct from runner-reported `facts`/`capabilities` so heartbeats do not wipe operator choices.

Suggested shape:
```ts
type RunnerOperatorConfig = {
  displayName: string | null;
  availableTools: string[];          // subset of advertised harness/tool ids
  jobTypes: {
    runsCi: boolean;
    runsMerges: boolean;
    runsImpromptu: boolean;
  };
  directories: {
    masterDir: string;
    worktreeDir: string;
  };
  // projectScope already exists on the runner record; canonicalise its
  // meaning as "Loaded projects".
};
```

Defaults:
- `displayName`: runner ID
- `availableTools`: all advertised tool/harness ids
- `jobTypes`: all `true` (matches current behaviour)
- `directories`: values from runner facts when present, otherwise empty string
- `projectScope`: `null` (serves all projects), as today

### 6.2 Registry API
Add to `RunnerRegistry`:
- `getConfig(runnerId)` → public runner record + `operatorConfig`
- `updateConfig(runnerId, patch)` → validate, persist, return updated config
- Include `operatorConfig` in `_public(record)` so `GET /runners` already carries it.

Validation:
- Directory paths must be non-empty strings if provided; recommend backend canonicalisation only after paths exist (do not invent defaults).
- Job-type toggles boolean.
- `availableTools` must be subset of runner’s advertised capabilities when known; otherwise accept and let dispatch intersect later.
- `projectScope` remains backward compatible: `null` = all projects.

### 6.3 HTTP routes
Additive endpoints in `api/flow/runnerRoutes.js`:
- `GET /runners/:id/config`
- `PATCH /runners/:id/config` (body partial object)
Optionally for Phase 1, store config only in memory/persisted registry; wire dispatch preferences in a later phase.

### 6.4 Frontend API client
Add to `frontend/src/services/runners/index.js`:
- `getRunnerConfig(id)`
- `updateRunnerConfig(id, patch)`
Update `frontend/src/services/api.js` aggregation and `api.surface.test.js` pinned key set (must be updated in the same commit).

---

## 7. Phase Plan (Make Change Easy)

### Phase 0: Research and design capture (first)
**Goal:** Resolve ambiguity before code changes.

1. Re-open `assets/untitled-scene.png` during implementation and transcribe exact labels, spacing, default values, and any hidden controls into this plan or a companion `RUNNER_SETTINGS_WIREFRAME.md`.
2. Confirm with the operator whether display name edits should propagate to runner-facing identity or remain a backend-only alias.
3. Confirm whether “Available tools” is read-only capability display or an operator filter.
4. Confirm directory path validation policy (absolute only, allow `~`, etc.).

Deliverable: updated plan section with accepted wireframe decisions.

### Phase 1: Backend data plumbing (additive, no UI)
**Goal:** Persist runner operator config without changing UI.

Steps:
1. Add `operatorConfig` to runner record load/persist logic in `runnerRegistry.js`.
2. Add `getConfig`/`updateConfig` methods with validation.
3. Add HTTP routes.
4. Add backend tests mirroring existing runner route tests:
   - defaults present
   - patch persists across reload
   - invalid patch returns 400
   - pending runners can still be configured (if allowed) or return clear 409
5. Update OpenAPI/site docs if applicable.

### Phase 2: Frontend API + pure helper extraction
**Goal:** Make UI change mechanical.

Steps:
1. Add `getRunnerConfig`/`updateRunnerConfig` to runner requests.
2. Add pure helper module `frontend/src/components/settings/runnerConfigHelpers.js`:
   - `defaultRunnerConfig(runner)`
   - `moveProject(runnerConfig, projectId, direction)`
   - `validateDirectories(config)`
   - `jobTypeLabels()`
3. Add helper tests.
4. Extend `frontend/src/services/api.js` aggregation and update `api.surface.test.js`.

### Phase 3: Refactor existing sections (no behaviour change)
**Goal:** Reuse roster and display components.

Steps:
1. Extract runner card/row rendering from `RunnersSection.jsx` into `RunnerCard.jsx` without changing tests.
2. Extract tool chips rendering into `RunnerToolsChips.jsx`.
3. Extract directory editor into `RunnerDirectoryFields.jsx` with save/confirm.
4. Keep `RunnersSection` composing the extracted pieces so existing tests pass.

### Phase 4: Tab compatibility shim (no visible change)
**Goal:** Safe cutover.

Steps:
1. Add new `runner` tab to `SETTINGS_TABS`.
2. Keep `harness` tab temporarily but mark deprecated in comments.
3. Redirect `/system-settings/harness` to `/system-settings/runner` in `SystemSettingsPage` (or effective section fallback).
4. Run existing tests; they should still see `Harness` until Phase 5.

### Phase 5: Replace visible Harness surface
**Goal:** Make the change.

Steps:
1. Remove `HarnessSection` import/render from `SystemSettingsContent.jsx`.
2. Create `RunnerConfigurationSection.jsx` rendering roster + selected runner form.
3. Render `RunnerConfigurationSection` under the `runner` tab; keep `RunnersSection` only as a fallback or merge its roster into the new section.
4. Delete or quarantine `HarnessSection.jsx` import; leave file initially to avoid giant deletions (remove in cleanup phase).
5. Rename tab label from `Harness` to `Runner` only after updating tests.
6. Remove compatibility shim after all references/tests updated.

### Phase 6: Test updates
**Goal:** Lock the new behaviour.

See Section 8.

### Phase 7: Cleanup and documentation
**Goal:** Prevent drift.

Steps:
1. Remove deprecated `HarnessSection` if no longer referenced.
2. Update docs/site docs and `AGENTS-MAP.md`.
3. Remove compatibility redirect after one release or when no references remain.

---

## 8. Detailed Implementation Steps

### Backend (Phase 1)
1. `runnerRegistry.js`: add `_operatorConfig(record)` initializer and validation.
2. Persist config in `_persist()` and restore in `_loadState()`.
3. Public serialization includes `operatorConfig`.
4. Add `getConfig` / `updateConfig`.
5. `runnerRoutes.js`: `GET/PATCH /runners/:id/config`.
6. Tests in `runnerRoutes.test.js`.

### Frontend API (Phase 2)
1. `runnerRequests`: add `getRunnerConfig`, `updateRunnerConfig`.
2. Aggregate in `api.js`.
3. Update `api.surface.test.js` expected key set (add two keys).
4. Helper tests.

### UI extraction (Phase 3)
1. Extract `RunnerCard`, `RunnerToolsChips`, `RunnerDirectoryFields`.
2. Preserve existing `RunnersSection` behaviour and tests.

### Tab switch (Phase 4)
1. Add `runner` tab.
2. Keep redirect.
3. Update `SYSTEM_SETTINGS_SECTIONS` derived mapping (already from `SETTINGS_TABS`).

### Main replacement (Phase 5)
1. Create `RunnerConfigurationSection.jsx` with:
   - selected runner state
   - loading/error/retry states
   - project move logic
   - directory save confirmation
   - job toggle updates
   - mutation sequencing with `Promise.all` avoided in favour of sequential saves
2. Update `SystemSettingsContent.jsx` import and tabpanel.
3. Update tests.

---

## 9. Testing Plan

### Backend
- `npm run test:api` / targeted `runnerRoutes.test.js`
- New tests:
  - `GET /runners` includes default `operatorConfig`
  - `PATCH /runners/:id/config` persists directories/job toggles
  - invalid directories return 400
  - store reload preserves operator config

### Frontend unit
Files to update/create:
- `RunnerConfigurationSection.test.jsx` (new)
  - loading state
  - empty state
  - runner selection
  - pending approve/deny
  - project move triggers `updateRunnerConfig`
  - directory save requires confirmation and calls update once
  - job toggles call update with expected payload
  - error + retry
- `runnerConfigHelpers.test.js` (new)
- `RunnersSection.test.jsx` (existing; should still pass after extraction)
- `SystemSettingsContent.test.jsx`
  - tab count derives from `SETTINGS_TABS`
  - default tab changes from `Harness` to `Runner` if renamed
- `SystemSettingsPage.test.jsx`
  - deep link expectations (`/system-settings/runner`)
- `api.surface.test.js` updated for new API keys.

### Test commands
```bash
npm run test:unit
npm run test:frontend -- SystemSettingsContent.test.jsx
npm run test:frontend -- SystemSettingsPage.test.jsx
npm run test:frontend -- RunnersSection.test.jsx
npm run test:frontend -- RunnerConfigurationSection.test.jsx
npm run lint:frontend
```

### Visual verification
Use isolated headless screenshot/canary:
```bash
npm run capture:screenshot
npm run test:canary
```
Verify:
- No Harness on/off list remains.
- Runner roster visible.
- Selected runner form shows all five required detail areas.
- Pending runner has approve/deny.
- Directory fields have save/confirm affordance.

---

## 10. Documentation Plan

- Update `site-docs` settings documentation to describe the Runner tab instead of Harness.
- Update `AGENTS-MAP.md` god-file notes:
  - `SystemSettingsContent.jsx`
  - `RunnersSection.jsx`
  - new `RunnerConfigurationSection.jsx`
- Add `docs/adr` cross-reference if runner operator config becomes a persisted contract.
- Add release note: harness enable/auto-detect replaced by runner capability configuration.

---

## 11. Risks and Open Questions

- **Backend/frontend scope ambiguity:** If the implementation is expected to be frontend-only initially, the editable directory fields may need to call stubbed endpoints. Decide backend scope in Phase 0.
- **Capability overwrite:** Heartbeats overwrite runner facts. Operator preferences must be stored separately and merged, not overwritten.
- **Project scope persistence:** Existing `projectScope` is display-only from dispatch. Editing it in settings implies a persisted operator override; routing it into dispatch is a follow-up.
- **Job switches vs tiers:** The three job switches may need translation to tier membership (T0/T1/T2/T3). Define the exact mapping in Phase 0:
  - Runs CI → permits `ci`/`script` stages
  - Runs merges → permits integration/merge stages
  - Runs Impromptu → permits T0 read-only follow-up requests
- **Test churn:** Renaming the tab from `Harness` to `Runner` will touch many tests. Keep a compatibility shim until tests are migrated.
- **Security:** Directory paths are operator input; validate/normalise before use and never execute them directly in shell. “Are you sure” confirmation is required by survey.

---

## 12. Acceptance Criteria

1. The old harness on/off/default-harness list is no longer shown in System Settings.
2. The runner screen includes all survey-selected details: name, project picker, available tools, folder paths, job switches.
3. Pending runners show approve/deny actions.
4. Loading/unloading a project updates that runner’s loaded set according to survey meaning.
5. Directory fields are editable only through an explicit save/confirm affordance.
6. All three job switches are present with the agreed meanings.
7. Existing runner onboarding tests continue to pass (or are deliberately migrated with equivalent coverage).
8. `npm run test:unit` and `npm run test:canary` pass for touched areas.
9. No credentials are rendered; one-time credential behaviour remains intact.
