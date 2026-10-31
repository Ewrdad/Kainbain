# Implementation Plan: Accurate Model Information Passthrough

> **Task:** Fix Runner → backend → UI model reporting so the UI shows the actual served model for agent stages, nothing for CI stages, and the model catalogue behaves correctly.
> **Survey basis:** `SURVEY.md` — all questions answered with recommended options; see §1.
> **Principle:** Make change easy, then make the change.

---

## 1. Survey Decisions (Locked)

| # | Question | Answer |
|---|----------|--------|
| Q1 | Agent stage model in UI | Only the actual model the Runner serves (not the Runner default) |
| Q2 | CI stage model field | No model / blank (CI uses no LLM) |
| Q3 | Model source for reporting + dispatch | The exact model required by the dispatched task (`requirements.model`) |
| Q4 | Task requires model Runner didn't advertise | Refuse assignment (leave for another Runner); alias: check other targets |
| Q5 | Catalogue behaviours that must keep working | All five: picker non-empty, harness-specific lists correct, runnable/auth labels accurate, aliases resolve, dispatch matches available models |
| Q6 | Model/harness pill while running (Runners view) | Yes, always while running |

**Derived invariants:**

- `config.model` / `config.models` is the Runner's **advertised capability** (what it _can_ run). It is never the stage's served model unless the stage happens to require that same model.
- CI stages have no model; the Runner must not invent one for them (currently `config.model || "default"` leaks into CI posture/progress).
- Alias resolution is already centralised (`resolveAliasRequirement`); the Runner must not second-guess it — dispatch hands it the concrete `requirements.model`.

---

## 2. Current Behaviour & Bug

### 2.1 What the runner reports today

`runner/daemon.js:executeAssignment` receives the dispatch answer's `requirements.model` as `model` and correctly passes it to `runHarnessStage({ model: model || config.model })` — the harness itself runs on the right model.

But every **observable** path writes the Runner default instead:

```js
// daemon.js — progress "prompted" event
model: config.model || "default"          // should be (kind === "ci" ? null : model || config.model || null)

// daemon.js — complete (both CI pass/fail + agent)
posture: `${tiers}:${harness}:${config.model || "default"}`   // should use the dispatch model

// daemon.js — integration posture
posture: `…:integration:${config.model || "default"}`        // integration has no LLM model either
```

The backend faithfully stores whatever the Runner sends (`executionLedger.recordProgress` → `stageServing`, `executionLedger.completeExecution` → `posture` history), and the frontend renders it (`PerRunnerTasksWidget` reads `assignment.serving.{harness,model}`; `MobileMonitorView` / `ActiveTaskPromptWidget` hide pills when `modelSelection` says so but otherwise show `serving.model`).

Result: the UI perpetually shows the Runner's default (or literal `"default"`), never the stage's actual model; CI stages show a model they never used (the bug in the screenshot).

### 2.2 Catalogue surface (must not regress)

- `GET /compute/models` + `GET /harnesses/:id/models` served from `api/models.js` / `api/routes/compute.js` via `aggregateModelCatalog` / `getAvailableModels`, with `FALLBACK_MODELS` when discovery is empty.
- `shared/modelKeys.js` grammar (canonical, re-exported by `api/models.js` + `frontend/src/services/api.js`) — parity pinned by `frontend/src/services/api.test.js`.
- `api/aliasTargets.js` validates aliases against `modelIdsFor` (catalogue probe) + alias dispatch resolves centrally.
- Frontend `ModelSelector.jsx` groups by harness, honours `modelSelection: "list" | "none"`, shows runnable/auth labels.
- Dispatch matching (`runnerMatches` + `taskRequirements` + `resolveAliasRequirement`) must continue to match `requirements.model` against `capabilities.models`.

---

## 3. Guiding Principle: Make Change Easy, Then Make the Change

The bug is a 3-line value error repeated in 4 places, but touching it safely requires:

1. A single source of truth for "what model does this assignment serve?" so the fix cannot drift between the progress event, the posture string, and the harness call.
2. A CI-blank contract that every downstream consumer agrees on.
3. Tests that lock the corrected behaviour before the production code changes.

Therefore **Phase 1** introduces the helper + fixtures + failing tests (no behaviour change to shipped code except the new helper). **Phase 2** rewires the four reporting sites to use it. **Phase 3** tightens dispatch refusal + catalogue regression tests.

---

## 4. Phase 1 — Make the Change Easy (No Behaviour Change to Shipped Reporting)

### Step 1.1 — Introduce `servingModelFor` helper (single source of truth)

- **File:** `runner/daemon.js` (or `runner/servingModel.js` if preferred — decide in review; keeping it in `daemon.js` avoids a new import graph)
- **Signature:**

  ```js
  export function servingModelFor({ kind, model, fallbackModel } = {}) {}
  ```

- **Rules:**
  - `kind === "ci" || kind === "merge" || kind === "integrate"` → `null` (no LLM; covers CI + merge/integrate which are also non-LLM).
  - Otherwise → `model` when non-empty string, else `fallbackModel` when non-empty, else `null`.
  - Never returns the string `"default"` — that literal is the bug. `null` means "no model to report".
- **Why a helper:** without it the four call sites will be fixed by copy-pasted ternaries that re-diverge. One function is grep-able and test-able.
- **Docs & parity:** mirror the comment on `taskRequirements` that CI stages are runnerless-model-less.

### Step 1.2 — Add `servingModelFor` unit tests (failing → passing)

- **File:** `runner/daemon.test.js` (extend)
- **Cases:**
  - agent with dispatch model → that model
  - agent without dispatch model but with fallback → fallback
  - agent with neither → null
  - ci with any model → null (even if dispatch accidentally carries one)
  - merge/integrate → null
  - empty/whitespace model treated as absent

### Step 1.3 — Introduce backend helper for posture formatting

- **File:** `api/flow/executionLedger.js` or a small new `api/flow/runnerPosture.js`
- **Fix:** `posture` currently `tiers:harness:model` where model is always present. For CI/integrate the model segment should be empty/omitted or explicitly blank so UI can hide the pill by contract. Decide: either omit trailing `:model` when null, or send `:`, with frontend already guarding `serving?.model` truthiness. Document the choice.
- **Add helper:** `formatPosture({ tiers, harness, model })` → string, model segment absent when null.

### Step 1.4 — Snapshot the current catalogue + dispatch test fixtures

- Add/verify fixtures:
  - `api/routes/compute.test.js` / `api/models.test.js` / `api/flow/dispatch/*.test.js` already pin catalogue + dispatch.
  - Add a **regression test** in `api/flow/dispatch/runnerMatches.test.js` that a Runner advertising `["kimi-k3:cloud"]` does NOT match a task requiring `gpt-oss:120b-cloud` (`NO_MODEL`), and that refusing that mismatch leaves the candidate for the next poll (the Q4 contract — the route already does this by `continue` on `!verdict.ok`, but the test locks it).
  - Add a **catalogue smoke test**: `GET /compute/models` non-empty; `GET /harnesses/:id/models` for each harness returns only that harness's models; aliases resolve to real entries (covers Q5).

---

## 5. Phase 2 — Fix the Reporting (The Actual Change)

### Step 2.1 — Wire `servingModelFor` into `executeAssignment` progress report

- **File:** `runner/daemon.js`
- **Change:**

  ```js
  const servingModel = servingModelFor({ kind, model, fallbackModel: config.model });
  await client.progress({
    stageId, event: "prompted", prompt,
    harness: servingHarnessId,
    model: servingModel, // null → omitted by client.progress body builder
  });
  ```

- `runner/client.js:progress` already does `...(model ? { model } : {})` — null/empty omits the field, and `executionLedger.recordProgress` already guards `if (event === "prompted" && (harness || model))`. Verify CI now records `serving: { harness, model: null }` or no serving entry, not a fake model.

### Step 2.2 — Wire into `complete` posture (all four sites)

- **File:** `runner/daemon.js`
- **Sites:**
  1. CI pass `client.complete({ posture })`
  2. CI fail `client.complete({ posture })`
  3. Agent pass `client.complete({ posture })`
  4. Agent fail (`err.failedOutcome`) `client.complete({ posture })`
  5. Integration `posture` const
- Use `formatPosture` + `servingModelFor` so CI/integration posture has no fake model segment.
- Verify string never contains literal `"default"` unless a real model is literally named that.

### Step 2.3 — Backend: store null cleanly + monitor omits blank model pill

- **Files:** `api/flow/executionLedger.js`, `api/flow/runnerRoutes.js`
- The monitor (`GET /runners/monitor`) joins `executionLedger.servingFor(executionId)` into `liveAssignments[].serving`. Ensure a `null` model stays `null` in the JSON (not `"default"` or `""` that the UI might render).
- **Frontend already correct:** `PerRunnerTasksWidget.jsx:287` guards `{serving?.model && ...}`; `ActiveTaskPromptWidget` hides model pill when `serving.model` falsy or `modelSelection === "none"`. Confirm no change needed; if needed, trim whitespace before check.

### Step 2.4 — Runner advertise-vs-required model audit

- **Files:** `runner/config.js` (`config.models`/`config.model`), `api/flow/dispatch/normalizeCapabilities.js`
- Ensure Runner heartbeat `facts.models` is the advertised set; `runnerMatches` already checks `caps.models.includes(req.model)` and alias targets check availability. Document that `KAINBAIN_RUNNER_MODELS` (csv) is the operator's capability claim, not the stage model.
- Add a log line when a dispatch `requirements.model` is not in `caps.models` is handled as `NO_MODEL` (already happens via `runnerMatches` → `misses.NO_MODEL` count in `runnerRoutes.js:dispatch`).

---

## 6. Phase 3 — Harden Dispatch Refusal + Catalogue Guarantees

### Step 3.1 — Alias fallback: other targets from same alias

- **File:** `api/flow/dispatch/resolveAliasRequirement.js` already re-resolves per dispatch poll; the Q4 note says "if it is an alias it should look to see if any others from that alias are available".
- **Action:** Verify that when `resolveAliasRequirement` returns a target whose `model` the chosen Runner doesn't advertise, `runnerMatches` yields `NO_MODEL` → that candidate is skipped → next candidate (same task, same alias, but maybe a different Runner with a different target on re-resolve) is tried. Since resolution is weighted round-robin centralised, the natural re-resolve on next poll covers the "try other alias targets" case. Add a test that two Runners with disjoint model sets each pick different alias targets for the same alias.
- If the current flow does NOT retry other targets within one dispatch poll, extend `runnerMatches` branching to, on `NO_MODEL` for an alias requirement, attempt the next weighted target before counting the miss. Keep this narrow — only for alias `req.alias` with `targetIndex`.

### Step 3.2 — Catalogue regression sweep

- **Files:** `api/models.js`, `shared/modelKeys.js`, `frontend/src/services/modelKeys.js`, `api/routes/compute.js`
- **Test matrix (Q5 — all five):**
  1. Model picker non-empty: `GET /compute/models` returns ≥1 entry (falls back to `FALLBACK_MODELS` when discovery empty).
  2. Harness-specific lists correct: `GET /harnesses/:id/models` returns only that harness's models; unknown harness 404/empty, not cross-contamination.
  3. Runnable/auth labels accurate: `withRunnableFlags` uses `providerAuthSummary` — test with mocked auth.
  4. Aliases resolve to real catalogue entries: `validateAliasTargetModels` warns when model missing from target harness catalog; `sanitizeAliasTargetModels` strips malformed.
  5. Runner dispatch matches available models: `runnerMatches` `NO_MODEL` vs `MATCH` table above.
- Add a **parity test** for `shared/modelKeys.js` ↔ `api/models.js` key grammar if not already present (the architecture doc says one exists — verify it still passes).

### Step 3.3 — Frontend Runners view always shows pill while running (Q6)

- **File:** `frontend/src/components/observability/widgets/PerRunnerTasksWidget.jsx`
- Already shows `serving.harness` + `serving.model` pills whenever truthy, on both full cards and compact rows. Verify compact `PerRunnerCompactRow` also surfaces `serving` (currently it doesn't — it shows only elapsed/task/stage; add harness/model pills there too if required by Q6 "Yes, always while running").
- Add test: mock `getRunnerMonitor` with `serving: { harness: 'pi', model: 'kimi-k3:cloud' }` → pills visible on both compact and full variants.

---

## 7. Phase 4 — Testing & Verification Plan

### 7.1 Unit tests (must pass before merge)

| File | Covers |
|------|--------|
| `runner/daemon.test.js` | `servingModelFor`, progress model null for CI, posture without default |
| `runner/client.test.js` | `progress({ model: null })` omits field; `progress({ model: "x" })` sends it |
| `api/flow/executionLedger.test.js` | `recordProgress` stores null model; `servingFor` returns null; `completeExecution` history without fake model |
| `api/flow/dispatch/runnerMatches.test.js` | `NO_MODEL` vs `MATCH`, alias retry |
| `api/flow/dispatch/taskRequirements.test.js` | CI kind has no model/harness, agent has model |
| `api/flow/runnerRoutes.test.js` | Dispatch refuses NO_MODEL, monitor omits blank model pill |
| `frontend/.../PerRunnerTasksWidget.test.jsx` | Pills show actual model, hidden for CI, visible while running |
| `frontend/.../MobileMonitorView.test.jsx` | Scripted stages render "Automated — no model" |
| `api/models.test.js` / `api/routes/compute.test.js` | Catalogue non-empty, harness-scoped, runnable labels, aliases |

### 7.2 Commands

```bash
npm run test:unit                          # entire suite — gate for the stage
npm run test:frontend -- PerRunnerTasksWidget
npm run test:frontend -- MobileMonitorView
npm run lint
# Optional: headless screenshot of Runners view with seeded monitor data
npm run capture:screenshot
```

### 7.3 Manual / smoke verification (no long-lived servers)

- Seed a project with one `agent` stage (model `kimi-k3:cloud`) and one `ci` stage (`npm test`).
- Start a Runner with `KAINBAIN_RUNNER_MODELS=kimi-k3:cloud,gpt-oss:120b-cloud` and observe:
  - Monitor shows `kimi-k3:cloud` on the agent card, no model pill on the CI card.
  - Posture history line for CI has no fake `default` segment.
- Start a second Runner advertising only `gpt-oss:120b-cloud`; dispatch an agent requiring `kimi-k3:cloud` — only the first Runner should match (Q4).

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Posture string consumers parse it assuming 3 segments | Keep `tiers:harness:model` shape; when model is null either omit last segment or emit empty — document and update parsers; add migration note |
| `config.model` empty string regressions | Helper treats `""` / whitespace as absent → null, never `"default"` |
| Alias alias-model mismatch counted as miss forever | Central re-resolve on next poll rotates to another target automatically; test two-Runner disjoint case |
| Frontend pills flicker on prompt delay | `executionLedger.stageServing` is set on `prompted` progress; until then `serving` is null and pills are hidden — acceptable (same as today) |
| Integration/merge stages accidentally show model | Helper classifies `kind === "merge"` / `"integrate"` as non-LLM |

---

## 9. Documentation & Follow-up

- Update `docs/KB Architecture.md` Runner section: explain advertised `models` vs dispatched `requirements.model` vs `serving.model` vs `posture` model segment.
- Update operator docs (`KB Local Integration details.md` or Runner README) for `KAINBAIN_RUNNER_MODELS` / `KAINBAIN_RUNNER_MODEL` semantics.
- Add ADR or inline comment linking `servingModelFor` to this plan + SURVEY.md.

---

## 10. Sequencing Summary

1. **Phase 1 first** (biggest research, lowest risk): helper + tests + catalogue snapshots.
2. **Phase 2** (the fix): 4-site rewire — small diff, high confidence because Phase 1 tests already assert it.
3. **Phase 3** (hardening): alias retry + catalogue matrix + Q6 pill-always.
4. **Phase 4**: run the gates, manual smoke, screenshot evidence, doc updates.
