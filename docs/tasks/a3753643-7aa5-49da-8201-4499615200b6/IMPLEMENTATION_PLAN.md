# Implementation Plan — Whitelist/Blacklist Runners on Stages

- Task: `a3753643-7aa5-49da-8201-4499615200b6`
- Goal: at the bottom of stage settings, an **optional** runner whitelist/blacklist per stage, so (e.g.) only one runner can take publish tasks, or a compliance scan runs only on onsite runners — without blocking a whole category.
- Principle: **make the change easy, then make the change.** Phases 0–2 are research spikes and behavior-preserving refactors that land safely on their own; Phases 3–6 are the actual feature.
- Survey status: `SURVEY.md` exists but has **no answers** (`"answers": {}`). Section 2 records each survey question with a recommended default (marked ASSUMPTION). If the survey is answered differently later, only the flagged decision points change — the phase order stands.

## 1. Current architecture (verified in this repo)

How a Runner gets work today (all paths read during planning):

1. **Stages** live on the project/workflow and are normalized additively in [api/project/stageNormalizers.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/project/stageNormalizers.js): `normalizeStage` / `normalizeStages` only touch `skills`, `tags`, `harness`, `runOnBranch`/`customBranch` when present, so legacy stages round-trip byte-identically. New optional fields follow the same present-only pattern. The stage editor UI is [frontend/src/components/workflow/StageSettingsDrawer.jsx](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/frontend/src/components/workflow/StageSettingsDrawer.jsx); the pause/fallback section at the bottom (lines ~146–215) is the natural neighbor for the new control. [frontend/src/components/workflow/StageTagEditor.jsx](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/frontend/src/components/workflow/StageTagEditor.jsx) is the closest "list editor in this drawer" precedent to copy.
2. **Dispatch scan** (`POST /runners/dispatch` in [api/flow/runnerRoutes.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/flow/runnerRoutes.js)): [api/flow/dispatch/scanClaimableTasks.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/flow/dispatch/scanClaimableTasks.js) finds candidate tasks, [api/flow/dispatch/taskRequirements.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/flow/dispatch/taskRequirements.js) derives `{ harness, model, tier, alias, runnableType, kind, stageId }`, then each candidate is tested with [api/flow/dispatch/runnerMatches.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/flow/dispatch/runnerMatches.js). Misses are loud reason codes aggregated into the `NO_CAPABLE_MATCH` response.
3. **Runner-side operator settings** are enforced in one shared helper, [api/flow/dispatch/operatorConfigVerdict.js](/home/server/.kainbain/runner-work/kb-a3753643-7aa5-49da-8201-4499615200b6/api/flow/dispatch/operatorConfigVerdict.js), called from **three** paths so no claim route bypasses it: the dispatch scan (via `runnerMatches`), direct claim (`POST /tasks/:id/claim`, verdict at `runnerRoutes.js:839`), and merge-lease acquire (`POST /runners/integration/acquire`, verdict at `runnerRoutes.js:1209`). This is the pattern to copy: one pure verdict helper, called from every claim path.
4. **Runner identity** is the `runnerId` string. A repo-wide search confirms there is currently **no `runnerPolicy`/`allowedRunners`/`blockedRunners` code anywhere**, and **no runner labels/tags infrastructure** (no `labels` on records, facts, capabilities, or `operatorConfig`) — labels would be new Runner-advertise + backend-store/match plumbing on both sides.
5. **What is Runner-runnable (correction to stale comments):** the `taskRequirements.js` docblock still says "only agent/review … human, command, and ci stages stay embedded", but the code (lines 34–41) says otherwise: post-DA9 every command stage is Runner-runnable (`hostCommand` is always `false`, `hostOnly` is stripped in `normalizeStage`), and `runnableType` is true for `agent`, `review`, `ci`, **and `merge`**. So a publish step (ci) and a merge step **do** flow through Runner dispatch/lease paths and **are** coverable by a stage policy. Human stages are the only inert type.
6. **The merge path is the awkward one:** `POST /runners/integration/acquire` currently enforces with only `{ kind: "merge" }` and no stage context (`runnerRoutes.js:1209-1212`), so a stage allow/block list for merge stages requires resolving task→stage there (or explicitly scoping merge out of v1 — see D6).

Consequences:

- A **stage-centric** rule (stage names which runners may take it) is the mirror image of the existing **runner-centric** `operatorConfig` (runner names which projects/tools it serves). It needs its own verdict helper but the same "one enforcement point, called from every claim path" discipline.
- Name-based matching (runnerId) needs no new Runner/backend infrastructure and covers both motivating examples. Labels roughly double the work (advertise/store/match + admin UI) and belong in a named follow-up.

## 2. Survey questions → decisions (all ASSUMPTION until SURVEY.md is answered)

| # | Survey question | Recommended default | Why |
|---|---|---|---|
| q1 | Names, labels, or both? | **Names (runnerId) in v1; labels as a named follow-up** | Covers both examples (one publish runner, onsite-only scan — operators know their runnerIds). Labels need advertise/store/match plumbing on both sides. Data model reserves space labels can extend (see D1). |
| q2 | One list + mode toggle, or two lists? | **One list + mode toggle** (`Only these runners` / `All except these runners`), Off/empty = unrestricted | One list has no allow-vs-block precedence rule to define. Matches "optional whitelist/blacklist" in the task. |
| q3 | No allowed runner available? | **Keep waiting + loud surfacing, never fail the task** | Matches existing `NO_CAPABLE_MATCH` behavior; failing would destroy queued work. New miss reason (e.g. `RUNNER_NOT_ALLOWED`) + monitor visibility. Manual recovery stays via existing operator moves, not a new bypass. |
| q4 | Stage-only, or also project/group defaults? | **Stage-only in v1** | The task asks for stage settings. Project defaults add precedence rules (stage vs project) for unclear value; note as follow-up. |
| q5 | Who can edit the lists? | **Anyone who can already edit stage settings** | No permission system exists for stages; inventing one is out of scope. |
| q6 | Who sets runner labels? (conditional on labels) | **Admin-managed, centrally** (when labels land) | The compliance use case ("must run onsite") is meaningless if the runner self-declares its labels. Self-reported labels are spoofable; operator-owned labels in `operatorConfig` are enforceable. |

If any survey answer comes back differently, only the flagged decision (D1–D6 in §4) changes; the phase order is unchanged. Re-check §2 before starting Phase 3.

## 3. Approach: make the change easy, then make the change

**Make the change easy (Phases 0–2, behavior-preserving):**

- P0: timeboxed research spikes that retire the two unknowns (merge-lease stage resolution; runner-picker data availability) before any code is shaped around them.
- P1: introduce the shared stage-runner-policy module + fixtures with **no wiring** (pure functions, fully tested, nothing calls them yet).
- P2: plumb stage/policy context to the one claim path that lacks it (integration acquire) in a behavior-preserving way, or formally scope merge out with a recorded decision.

**Make the change (Phases 3–6):**

- P3: data model + normalization + persistence round-trip.
- P4: enforcement on all claim paths + loud miss reasons.
- P5: UI at the bottom of stage settings.
- P6: observability, docs, rollout/verification.

Each phase lands as a reviewable unit with its own tests; P0–P2 are safe to land even if the feature is later rescoped.

## 4. Key design decisions

- **D1 — Storage shape.** `stage.runnerPolicy = { mode: "allow" | "block", runners: [<runnerId>, …] }`, entirely optional/absent = unrestricted. Empty `runners` array = unrestricted regardless of mode (fail-open, never strand tasks on a mis-edit). Additive normalization in `normalizeStage` (trim, drop non-strings/blanks, dedupe) mirroring the `tags` pattern. Reject unknown `mode` at the API boundary with 400, but never reject unknown runnerIds (see D4). Reserve sibling key space for a future `labels` extension rather than overloading `runners`.
- **D2 — Enforcement point.** New pure helper `stageRunnerPolicyVerdict(stageOrPolicy, runnerId, …)` in `api/flow/dispatch/` (sibling to `operatorConfigVerdict.js`), returning `{ ok, reason }` with loud codes (`RUNNER_NOT_ALLOWED` / `RUNNER_BLOCKED`). `taskRequirements()` attaches the current stage's policy to `req`; `runnerMatches()` enforces it **after** health/capability gates (stable reasons keep priority — a stale runner still reports `STALE_HEARTBEAT`) and alongside `operatorConfigVerdict`. Direct claim and integration-acquire routes call the same helper so no path bypasses it. Decide and document the order of the two verdicts (operator vs stage) and test the combined case.
- **D3 — No fallback execution.** A restricted stage with no eligible runner waits (q3). No silent reroute, no auto-fail. The stuck/stall surfacing must distinguish "waiting for an allowed runner" from generic idleness (see P6).
- **D4 — Name matching.** Exact `runnerId` match (trimmed). Unknown/deleted runnerIds in a policy are kept (not auto-pruned) and shown as stale in the UI, so renaming a runner never silently opens a compliance gate. Renames are an operator action with a visible warning.
- **D5 — Human/non-runnable stages.** Policy is stored but inert for `human` stages (`runnableType: false` — never dispatched). UI may still show the control for consistency, with a note that it only affects runner-dispatched work.
- **D6 — Merge stages in v1.** Preferred: enforce on the merge path too (publish/merge is a motivating example; code path exists via `cand.stage` on the dispatch merge branch). Cost: `POST /runners/integration/acquire` must resolve task→stage to get the policy. If P0.2 shows that resolution is invasive, fallback is: v1 covers agent/ci; merge-lease enforcement is a fast follow with the same helper. Record whichever is chosen before P4.

## 5. Work plan (ordered; big pieces / research first)

### Phase 0 — Research spikes (no production code; timeboxed)

- **0.1 Dispatch-path audit.** Confirm the full set of execution paths a policy must cover by re-reading `runnerRoutes.js` dispatch/claim/lease routes plus `scanClaimableTasks.js` and scheduler deferral counters. Output: a short note listing every claim path a stage policy must gate, or proof that claim-path enforcement is sufficient.
- **0.2 Merge-path stage resolution spike.** Find the cheapest correct way to get from `POST /runners/integration/acquire` (`projectId` + `targetBranch`) to the task's current stage policy. Options: (a) look up the queued task in `integrationQueue` by project+branch, (b) require `taskId` in the acquire body, (c) enforce only at dispatch time (the dispatch route already has `cand.stage`) and treat direct acquire as operator-trusted. Output: chosen option + estimate; feeds D6.
- **0.3 Runner-picker data check.** Confirm `GET /runners` returns everything the stage-settings picker needs (id + displayName + status). If display names are missing for some records, the picker falls back to runnerId — no backend change.

### Phase 1 — Make the change easy: shared policy module (no wiring)

- **1.1** Create `api/flow/dispatch/stageRunnerPolicy.js` (pure): `normalizeStageRunnerPolicy(raw)` + `stageRunnerPolicyVerdict(policy, runnerId)`. Fail-open on absent/malformed input (legacy-safe, like `operatorConfigVerdict`). Full unit tests: absent → allow; empty list → allow; allow-mode hit/miss; block-mode hit/miss; malformed shapes → allow; whitespace/dupes normalized.
- **1.2** Shared test fixtures: a small factory for stage objects with policies + runner records, reusable by dispatch/route tests. Check existing `test-helpers` first; extend, don't duplicate.
- **1.3** Wire **nothing** yet. This phase lands as dead-but-tested code, reviewable in isolation.

### Phase 2 — Make the change easy: context plumbing (behavior-preserving)

- **2.1** `taskRequirements()` attaches the stage's normalized policy to the returned `req` (e.g. `req.runnerPolicy`) alongside the existing `stageId`. No consumer reads it yet → no behavior change. Add characterization tests asserting the new field.
- **2.2** Per P0.2 outcome: plumb stage context into the integration-acquire path (still unenforced), or record the D6 fallback. No behavior change.
- **2.3** Add the new miss-reason strings to whatever centralizes reason codes / monitor copy (if such a registry exists; otherwise co-locate with the verdict helper). No behavior change.

### Phase 3 — Data model + normalization + persistence

- **3.1** `normalizeStage()` in `api/project/stageNormalizers.js`: additive `runnerPolicy` handling (present-only, legacy round-trip identical). Unit tests: legacy stages untouched; valid policies preserved; junk coerced per D1.
- **3.2** Persistence round-trip: save/load a project + workflow carrying policies (`projectStore` tests), including multi-workflow (`createWorkflow`/`updateWorkflow` paths that call `normalizeStages`).
- **3.3** Validation at the API boundary: stage create/update routes reject unknown `mode` values with 400 (but never reject unknown runnerIds — D4).

### Phase 4 — Enforcement on every claim path

- **4.1** `runnerMatches()`: enforce `req.runnerPolicy` after capability gates, next to `operatorConfigVerdict`. New loud reasons flow into the `NO_CAPABLE_MATCH` misses map.
- **4.2** `POST /tasks/:id/claim`: call the verdict helper with the task's current stage policy; refuse with 409 + reason code (mirrors the existing `operatorConfigVerdict` 409 block in that route).
- **4.3** Merge path per D6: `POST /runners/dispatch` merge branch (has `cand.stage` — straightforward) and `POST /runners/integration/acquire` (uses P2.2 plumbing).
- **4.4** `selectRunnerForTask()` inherits enforcement via `runnerMatches` — add a test proving it.
- **4.5** Negative tests: a blocked runner polling dispatch gets `NO_CAPABLE_MATCH` with the new reason (not a task); direct claim by a non-allowed runner gets 409; unrestricted stages behave exactly as before (regression sweep of existing dispatch/claim/runner tests).

### Phase 5 — UI: bottom of stage settings

- **5.1** New section at the bottom of `StageSettingsDrawer.jsx` (below the pause/fallback block): mode selector (`Off` / `Only these runners` / `All except these runners`) + runner multi-select fed by `GET /runners` (displayName with runnerId fallback; status shown; stale/unknown ids preserved and badged). Reuse `SelectDropdown` / existing multi-select patterns; follow `StageTagEditor` as the list-editor precedent.
- **5.2** Save path: `onUpdateStage(stage.id, { runnerPolicy })` round-trips through the existing stage save; `Off`/empty clears to absent (not an empty object) so stored stages stay clean.
- **5.3** Frontend tests: renders section; mode + selection persist via `onUpdateStage`; stale-id badging; empty/off clears. Headless only (see §6); no long-lived dev servers.
- **5.4** Copy: one-line explanation per mode + a note that empty = all runners, and (per D5) that human stages are unaffected.

### Phase 6 — Observability, docs, rollout, verification

- **6.1 Observability.** New miss reasons appear in dispatch `misses`, `GET /runners/monitor` (or equivalent), and scheduler deferral diagnostics, so "waiting for an allowed runner" is distinguishable from "no runners at all". Add/extend a monitor-widget test if the dashboard renders per-reason breakdowns.
- **6.2 Docs.** Update: (a) user docs for stage settings (new section: what it does, publish + onsite-compliance examples), (b) runner/operator docs (interaction with runner-side `operatorConfig` scoping — both gates apply), (c) `CHANGELOG.md` entry, (d) JSDoc on new/changed functions per repo convention. Check `site-docs` vs `docs` ownership before writing.
- **6.3 Rollout.** Feature is additive and default-off: no migration, no flag needed. Rollout = deploy + verify unrestricted behavior unchanged + one restricted stage end-to-end (see §6). Rollback = deploy previous build; stored policies are inert to old code (unknown field ignored) — verify that claim with an old-code read test if cheap.

## 6. Validation plan (how we prove it works)

### Automated (primary gate: `npm run test:unit` = `test:api` + `test:frontend`)

- **Unit:** policy normalize + verdict matrix (P1.1); `normalizeStage` legacy round-trip + coercion (P3.1); `taskRequirements` carries policy (P2.1); `runnerMatches` reason priority incl. combined operator+stage gates (P4.1); `selectRunnerForTask` inheritance (P4.4).
- **Route/integration:** dispatch honors allow (only listed runner gets the task) and block (listed runner never does) across agent + ci stages; direct-claim 409s for refused runners; merge-path behavior per D6; `NO_CAPABLE_MATCH` misses include the new codes with counts; full existing dispatch/claim/runner test files pass unmodified (regression proof that unrestricted behavior is identical).
- **Frontend:** drawer-section tests (P5.3) via the existing headless runner; persistence round-trip through `saveStages` mocks.
- **Golden/characterization:** a `project.json` carrying policies survives save→load→save byte-stable (apart from intended normalization).
- **Repo gates:** `npm run test:unit` green; `npm run docs:check` link/JSDoc checks pass if docs are touched.

### Manual / headless checks (no long-lived servers)

- Two-runner scenario (fixtures or mocks): restrict a CI "publish" stage to runner A; poll dispatch as B → `NO_CAPABLE_MATCH` with `RUNNER_NOT_ALLOWED`/`RUNNER_BLOCKED`; poll as A → assigned. Same for block mode inverted.
- Stage-settings UI check via the headless screenshot tool (`npm run capture:screenshot`) if visual confirmation is wanted — no `npm run dev` background servers.
- Monitor/scheduler surfaces show the waiting-for-allowed-runner state distinctly.

### Documentation proof

- Review checklist: stage-settings doc, runner doc, changelog entry, JSDoc examples all present and linked; `npm run docs:check`-style link checks pass.

## 7. Risks and mitigations

- **Stranded tasks (policy names a dead/renamed runner).** Mitigated by D3 (wait, don't fail) + D4 (stale ids visible, never auto-pruned) + observability (P6.1). No silent opening of gates.
- **Bypass via an unpatched claim path.** Mitigated by the single-helper discipline (D2) + a negative test per path (P4.5) + the P0.1 audit.
- **Labels expected but not delivered.** q1 follow-up is explicit: v1 = names. If compliance reviewers insist on labels, that is a scoped Phase 7 (runner label advertise/store/match + admin UI), estimated separately — the `runnerPolicy` shape reserves room for it.
- **Scope creep (project defaults, permissions).** q4/q5 defaults recorded; anything beyond stage-only + existing editors is a follow-up.
- **Survey answered differently.** Only D-decisions change; phases stay the same shape. Re-check §2 before P3.

## 8. Open questions

- None blocking: every survey question has a recommended default in §2. The two genuine unknowns are retired by timeboxed spikes (P0.1, P0.2) before any production code is shaped around them.

## 9. Success criteria

- An operator can set, save, and clear a per-stage runner allow/block list from the bottom of stage settings.
- Restricted stages dispatch/claim **only** to eligible runners on **every** claim path; ineligible runners get loud, specific refusals.
- Unrestricted stages (including all legacy stages) behave exactly as before — proven by the existing suite passing unmodified plus new regression tests.
- "Waiting for an allowed runner" is visible in dispatch misses and monitor surfaces, distinct from fleet-down states.
- Docs + changelog updated; `npm run test:unit` green.

## 10. Non-goals (v1)

- Runner labels/tags (q1 follow-up / Phase 7 candidate).
- Project-level or stage-group defaults (q4 follow-up).
- New edit permissions (q5: existing stage editors).
- Manual override/bypass UI beyond existing operator moves (q3 default is wait + visibility).
- Auto-pruning or auto-migrating policies on runner rename/delete (D4: show stale, keep closed).
