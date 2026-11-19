# Implementation Plan: Per-Pipeline Configurable Main Branch

- **Task:** `cf4b6847-11eb-4d59-b39e-e31b31df1150` — "add per pipeline configurable main branch"
- **Goal:** users can point a pipeline (KainBain "named workflow") at a non-`main` base branch
  (e.g. a feature branch), so new task branches are created off it and the merge stage merges back into it.
- **Companion survey:** `SURVEY.md` in this folder (grill-me round 1, generated 2026-11-19).
  **Note:** the survey's `answers` object is empty at plan time, so every survey question is treated below
  as an open decision with a codebase-grounded recommendation (§2). Step 0 of the plan closes these.
- **Method:** make the change easy first (seams + characterization tests, no behaviour change),
  then make the change in small vertical slices.

Terminology: the UI calls them "pipelines" (`WorkflowManagementPanel.jsx`); the code calls them
"named workflows" (`api/project/workflowDefaults.js`, stored in `.kainbain/project.json`).
This plan uses **pipeline** for the user-facing concept and **workflow** when naming code.

---

## 1. Example workflow (acceptance story, from the task)

1. User manually creates a feature branch (e.g. `feature/big-thing`).
2. User creates one or two pipelines with the base set to that feature branch.
3. User creates a task → task branch `kb/<taskId>` is created **off the feature branch**, not `main`.
4. Work happens on the task branch.
5. Merge stage merges the task branch **back into the feature branch**.
6. Steps 3–5 repeat until the feature is done; the same mechanism also fits a standard ticket workflow
   (e.g. a pipeline per release/ticket track).

Acceptance = this story works end-to-end (see §8), not just "a field exists".

---

## 2. Survey decisions (SURVEY.md q1–q8 → recommendations)

| # | Survey question | Recommendation | Rationale / code evidence |
|---|---|---|---|
| q1 | Where should the setting live? | **On each pipeline** (per-stage override explicitly out of scope) | Matches the task title; per-stage override would multiply every seam below. Note `normalizeWorkflow` (`api/project/workflowDefaults.js:31`) currently **rebuilds** `{id, name, isDefault, stages}` and drops unknown fields — the field must be added there or it will not survive a restart. |
| q2 | What does it control? | **Both**: task-branch creation source AND merge target | Required by acceptance steps 3 + 5. Creation: `ensureTaskBranch` (`api/work/taskBranches.js:410`). Merge: `mergeTaskBranchIntoMain` (`api/flow/commandStages.js:1441`). |
| q3 | Configured branch does not exist yet? | **Clear error at task creation / first pickup**, asking the user to create the branch first | Codebase convention is fail-loud, never silent fallback (`GitDirtyTreeError`, "Fails LOUD" in `api/git/branch.js`). Auto-create is a possible follow-up, not v1. Silent fallback to `main` is rejected: it would merge feature work into the wrong branch. |
| q4 | Pipeline base changed while tasks run? | **Pin the base on the task at creation** (`task.baseBranch` snapshot); in-flight tasks keep their pinned base | Mirrors the existing freeze philosophy (`reviewBaseline` SHAs in `commandStages.js:95`). Live-resolving would retarget merges mid-flight — dangerous. Legacy tasks without the snapshot fall back to the pipeline's live value, then repo default. |
| q5 | Where editable? | **UI in pipeline settings + API** (config-file support comes free) | `WorkflowManagementPanel.jsx` is the named panel; the API routes already exist (`POST/PATCH /projects/:id/workflows…`, `api/routes/projects.js:751,800`). Storage is `.kainbain/project.json`, i.e. the project config file — so "UI" and "config file" are the same backend change. |
| q6 | Should CI `runOnBranch: 'primary'` mean the pipeline base? | **Yes** — inside the pipeline, "primary" = the pipeline base | One mental model ("the main branch" of this pipeline). Backend: `resolveExecutionBranch` (`commandStages.js:264`); runner: `ciWorkdirFor`/`resolveCiWorkdir` (`runner/daemon.js:1557,1587`). `custom` mode already covers exceptions. |
| q7 | What to call it? | **"Base branch"**, field `baseBranch` | Already the codebase term for this concept (`baseBranch` in `api/reviewAssembly.js:44+`). Avoids confusion with the repo's real `main`. |
| q8 | Anything else that should follow it? | **All three listed**: (a) post-merge push of the base branch, (b) return-to-base after each stage, (c) review/diff base | (a) already happens for the default branch (`pushBranchIfRemote(cwd, mainBranch)`, `commandStages.js:1790`) — extending it is natural. (b) `returnToDefaultBranch` (`api/git/branch.js:784`) / `finalizeTaskBranch` must return to the base or stages end stranded on the wrong branch. (c) `resolveReviewBase` (`api/reviewAssembly.js:78`) must diff against the base or Files Changed shows the whole feature branch as the task's change. |

**Step 0 (decision gate):** confirm or override each row with the stakeholder. If any answer flips
(e.g. live-resolve instead of pin), re-check the affected steps before starting Phase 2.

---

## 3. Codebase map (verified touch points)

Ordered by risk / size — biggest first, per the "big pieces early" rule.

| Area | Files | Current behaviour | Change needed |
|---|---|---|---|
| Workflow model + storage | `api/project/workflowDefaults.js` (`normalizeWorkflow`, `normalizeWorkflows`, `createDefaultWorkflow`); `api/projectStore.js` (`createWorkflow:2100`, `updateWorkflow:2178`, `getWorkflow:2064`); `api/routes/projects.js:751,800` | Workflows carry only `{id, name, isDefault, stages}`; create/update whitelist fields; normalizer drops extras | Add optional `baseBranch` (trimmed string; absent/blank = repo default). Persist, validate (400 on invalid git name via existing `isValidBranchName`), round-trip through load/save. |
| Branch-creation seam | `api/work/taskBranches.js` (`ensureTaskBranch:410`, incl. worktree path `:444` and shared path `:481`; `syncMainToRemoteBestEffort:277`) | Start point + hop-through + pre-pickup sync all use `defaultBranch(cwd)` | Resolve the task's pinned/pipeline base once per operation; use it as start point, hop-through branch, and sync target. |
| Merge seam | `api/flow/commandStages.js` (`mergeTaskBranchIntoMain:1441`, `mainBranch = await defaultBranch(cwd)` at `:1472`; ghost/landed checks; `recordReviewBaseline`) | Merge target, landed-evidence checks, ghost diagnostic, review baseline, pre/post push all use repo default | Same single resolver; target becomes the base. Runner-side integration already takes `targetBranch` as a parameter (`runner/daemon.js:2301,2342`; `runner/project.js:985`) and the integration queue is already keyed per target (`api/flow/integrationQueue*.js`), so the backend just passes the resolved base down. |
| CI `primary` mode | `api/flow/commandStages.js:264` (`resolveExecutionBranch`); `runner/daemon.js:1557,1587` | `'primary'` resolves via `defaultBranch(cwd)` backend-side; runner picks primary checkout vs task workdir | Backend resolves base and passes it through the existing claim payload; runner honours the passed branch (verify no runner-side `defaultBranch` assumption — none found; confirm in spike). |
| Finalize / return | `finalizeTaskBranch` + `returnToDefaultBranch` (`api/git/branch.js:784`) | Always returns to repo default | Return to the task's base instead. |
| Review / diff | `api/reviewAssembly.js` (`resolveReviewBase:78`, `baseBranch` plumbing); `api/reviewDiff.js` | Diffs `baseBranch...taskBranch` with base = repo default | Diff against the task's base (pinned snapshot preferred so reviews stay stable if the pipeline is re-pointed). |
| Task record | `api/work/taskPersistence.js` (frontmatter incl. `workflowId:71,893,944`); task creation path (`api/taskStore.js:462`) | Task persists `branch`, `workflowId`; **branch provisioning is deferred to first pickup** (zero git at creation — serialization-gate rule, `docs/git-branch-support.md:191`) | Snapshot `baseBranch` onto the task at creation (pure data, no git — keeps the gate rule). Validate existence lazily: q3 error surfaces at first pickup (and eagerly in UI validate-if-possible). |
| Frontend | `WorkflowManagementPanel.jsx` (create form + per-workflow cards); `useWorkflow.js` (`createWorkflow`, `updateWorkflowDetails`); task-creation wiring (`useTaskSubmission.js`, `createTaskSubmit.js`) | No base-branch UI; workflow PATCH sends `{name}`/`{isDefault}` | Add base-branch input to create form + per-workflow edit; surface validation errors; show the pinned base on the task detail view. |
| Runner | `runner/project.js` (`prepareWorkdir`, `prepareIntegrationWorkdir`), `runner/daemon.js` | Operates on branches handed down by the backend | Expected: no logic change, only honour the passed-through base/target. Spike must confirm. |

Cross-cutting: `defaultBranch(cwd)` (`api/git/branch.js:707`) stays as the **repo-default fallback**
(bottom of the chain), never removed. `syncDefaultBranchToRemote` (`api/git/remote.js:193`) already
accepts an explicit branch override (`opts.mainBranch`) — reuse it, don't fork it.

---

## 4. Phase 0 — Decisions, spikes, and baselines (do first; de-risks everything)

1. **Close the survey gate (§2).** Record final answers in `SURVEY.md` (append an `answers` round;
   do not rewrite the questions). Any flip re-scopes the steps below.
2. **Spike A — enumerate every `defaultBranch(` call site and classify it.**
   For each, record: has task context? has workflow context? must follow the base (table §3) or stay
   repo-default (e.g. host self-deploy, mirror sync)? Output: a checklist table in the working notes;
   each row becomes a conversion or an explicit non-goal. (Known candidates beyond §3: `withCheckedOutBranch`
   `:854`, deploy/continuity paths, `stuckCheck`, observability snapshots.)
3. **Spike B — runner contract.** Confirm the full claim payload path (backend → runner) for work stages,
   CI `primary`/`custom`, and integration: which branch names travel today, where the runner resolves vs
   receives. Confirm no runner-side repo-default assumption breaks under a custom base.
4. **Spike C — task-creation validation.** Decide exactly where the q3 "branch does not exist" error
   surfaces given "zero git at creation": recommended = async existence check best-effort at creation
   (warn) + hard error at first work-stage pickup + a "validate" affordance in pipeline settings.
   Record the decision.
5. **Baseline the suite.** Run `npm run test:unit` (api + frontend) on the untouched tree and record
   pass/fail + duration. All later phases compare against this.

Exit criteria: survey answers recorded; spikes A–C written up; baseline green (or pre-existing failures
listed as known-bad with file names).

---

## 5. Phase 1 — Make the change easy (no behaviour change; each step shippable alone)

6. **Preserve-and-normalize workflow field (the load-bearing fix).**
   Extend `normalizeWorkflow`/`createWorkflow`/`updateWorkflow` + routes to carry an opaque optional
   `baseBranch` string end-to-end (normalize: trim; blank → drop key). No consumer reads it yet.
   Tests: round-trip (create → reload project file → field intact), PATCH validation (400 on invalid
   git name, blank clears), legacy workflows without the field load byte-identically.
7. **Introduce the single resolver (the seam everything else uses).**
   New pure-ish helper, e.g. `resolveTaskBaseBranch({ task, projectStore, projectId, cwd })` in
   `api/work/` (or `api/git/` if git-layer placement fits better — decide in Spike A), implementing:
   `task.baseBranch` (pinned) → workflow `baseBranch` (live) → `defaultBranch(cwd)` (repo default).
   Returns `{ branch, source }` for audit lines. Unit-test the chain with stub stores (no git).
8. **Convert call sites to the seam WITHOUT changing behaviour.**
   One commit per call site, each defaulting to repo-default so output is identical:
   `ensureTaskBranch` (both worktree + shared paths), `syncMainToRemoteBestEffort` (parameterize the
   sync target; reuse `opts.mainBranch` of `syncDefaultBranchToRemote`), `mergeTaskBranchIntoMain`,
   `resolveExecutionBranch`, `returnToDefaultBranch` callers, `resolveReviewBase`.
   Each conversion adds a characterization test locking current behaviour (task without any base
   configured behaves exactly as before).
9. **Runner pass-through (if Spike B requires it).** Add the resolved base to the claim payloads with
   fallback to current behaviour when absent; runner prefers the passed value. Old-runner/new-backend
   and new-runner/old-backend combos must both keep working (mixed-fleet test).

Exit criteria: full suite green; no user-visible change; `git grep defaultBranch(` shows only the
resolver + documented repo-default usages (Spike A table all checked).

---

## 6. Phase 2 — Make the change (thin vertical slices, in this order)

10. **Slice 1 — pin + create off base.** Snapshot `baseBranch` onto the task at creation
    (data-only, keeps the serialization gate); `ensureTaskBranch` uses the resolver; q3 error path
    at first pickup (clear message naming pipeline, branch, and the fix). Integration test with a
    real temp repo: feature branch → task branch starts at feature tip, not `main` tip.
11. **Slice 2 — merge back into base.** Merge stage (backend path + integration-claim `targetBranch`)
    merges into the resolved base; landed-evidence, ghost diagnostic, review-baseline recording, and
    pre/post-merge push all target the base. Audit/history lines name the actual branch (they already
    interpolate it — verify). Integration test: two tasks on one feature pipeline merge sequentially
    into the feature branch; `main` untouched.
12. **Slice 3 — finalize/return + sync.** Post-stage return lands on the base; pre-pickup sync syncs
    the base (never resets an ahead ref — existing `local-ahead` loud-skip applies to the base too).
    Test: mid-pipeline pause + hand-edit on the feature branch is picked up cleanly (mirrors the
    documented main-branch pause behaviour).
13. **Slice 4 — CI `primary` follows the base (q6).** Backend resolves, runner honours. Test both
    backend resolution and `resolveCiWorkdir`/`ciWorkdirFor` with a passed base; `custom` mode
    unchanged (regression test).
14. **Slice 5 — review/diff against the base (q8).** `resolveReviewBase` uses the task's pinned base;
    Files Changed for a task on a feature pipeline shows task-vs-feature, not task-vs-main. Test with
    a fixture where feature branch itself differs from `main` (the case that proves the base is used).
15. **Slice 6 — pipeline re-point safety (q4 consequence).** Changing a pipeline's base affects only
    subsequently created tasks (pinned snapshot); UI warns that in-flight tasks keep their pinned base.
    Test: re-point mid-flight → old task merges to old base, new task to new base.

Exit criteria: acceptance story (§1) passes manually on a scratch repo; slices 1–6 each have
automated coveragenamed below (§8).

---

## 7. Phase 3 — UI (after backend slices; API already exists from step 6)

16. **Pipeline settings:** base-branch field in the `WorkflowManagementPanel` create form and an
    inline edit on each workflow card (validate-as-you-type against git-name rules; server 400s
    surface as the existing `statusMsg` error style). Show "repo default" as the placeholder/empty state.
17. **Task surfaces:** show the task's effective base (pinned vs live vs repo-default) on the task
    detail view; task-creation flow shows which base the new task will use for the selected pipeline.
18. **Frontend tests** (`vitest run --prefix frontend`): panel renders/saves/clears the field; error
    display; mixed pipelines display correctly. No long-lived dev server — use the existing
    component-test setup (and `npm run capture:screenshot` only if a visual check is explicitly needed).

---

## 8. Phase 4 — Assurance plan (how we prove it was implemented)

### 8.1 Automated gates (primary)

- `npm run test:unit` (= `test:api` + `test:frontend`) green on the final tree; compare with the
  Phase-0 baseline — zero new failures, and every *touched area* has new tests (repo rule: run the
  whole relevant test file/package unmodified, never narrowed).
- New/changed suites expected:
  - `api/project/workflowDefaults.test.js`, `api/projectStore.test.js` — field round-trip + validation.
  - `api/work/taskBranches.test.js` — creation off base, hop-through, sync target, q3 error.
  - `api/flow/commandStages.test.js` + `api/git/*.integration.test.js` — merge-into-base incl.
    sequential merges, landed re-entry, ghost diagnostic naming the base.
  - `api/reviewAssembly.test.js` — diff base follows pinned base.
  - `runner/` daemon/project tests for claim pass-through (only if Phase 1 step 9 adds any).
  - Frontend panel tests (§7).
- Serialization-gate regression: task creation still performs zero git work (existing gate test
  must keep passing — the snapshot is data-only).

### 8.2 End-to-end acceptance (the §1 story, scripted once, then manual)

On a scratch clone with a remote (or the repo's integration-test harness style — temp dirs + real git):

1. `git branch feature/big-thing`; create pipeline P1 with base `feature/big-thing`, pipeline P2
   with no base.
2. Create task T1 in P1 → assert `git merge-base --is-ancestor` shows T1's branch starts at the
   feature tip; create T2 in P2 → starts at `main` tip.
3. Run T1 through to merge → assert feature branch contains T1's work, `main` does not; remote
   feature branch updated (push happened).
4. Repeat 3 with a second task → sequential merges both land; no conflicts from the machinery.
5. Re-point P1 at a new branch; create T3 → T3 uses the new base, in-flight T1-retry still targets
   the old base (q4).
6. CI `primary` stage in P1 runs against the feature branch; review view for T1 diffs against the
   feature branch, not `main`.

### 8.3 Documentation updates (part of "done")

- `docs/git-branch-support.md` — the branch bible: add a "Per-pipeline base branch" section
  (setting, pinning, q3 error, CI-primary meaning, re-point semantics) and update every "default
  branch" lifecycle sentence that now means "effective base".
- Pipeline/workflow UI help text + `site-docs`/user guide if workflows are documented there
  (check `site-docs/` and `docs/UI/` for the workflows page).
- `CHANGELOG.md` per repo convention (`scripts/generate-changelog.mjs` — follow whatever it derives from).
- This plan's survey-answers appendix: copy final q1–q8 answers into `SURVEY.md`.

### 8.4 Non-goals / follow-ups (explicitly NOT in this change)

- Per-stage base-branch override (q1 option 3).
- Auto-creating a missing base branch (q3 option 2).
- Deleting/retargeting the repo's real default branch; `defaultBranch()` fallback stays.
- Migrating existing tasks (they have no snapshot → pipeline-live → repo-default chain covers them).

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `normalizeWorkflow` field-drop (silent data loss on restart) | Fixed first in Phase 1 step 6 with a reload round-trip test. |
| Mid-flight retarget merges work into the wrong branch | Pin-on-create (q4) + Slice 6 test; UI warning on re-point. |
| Custom base + worktree isolation interplay | Slice 1 test covers both `quarantine` and `worktree` modes (both `ensureTaskBranch` paths converted in step 8). |
| Runner/backend version skew during rollout | Pass-through with fallback both directions (step 9); mixed-fleet test. |
| Silent-fallback temptation ("just use main if missing") | Rejected by q3 decision; the missing-branch path has a dedicated loud-error test. |
| Scope creep into per-stage overrides | Non-goals listed (§8.4); per-stage `customBranch` on CI already exists for one-off needs. |

---

## 10. Suggested execution order (checklist)

- [ ] 0. Survey gate: record q1–q8 answers in `SURVEY.md`
- [ ] 1. Spikes A (call-site census), B (runner contract), C (q3 surface) + baseline `npm run test:unit`
- [ ] 2. Phase 1: field plumbing (step 6) → resolver seam (7) → behaviour-preserving conversions (8) → runner pass-through (9)
- [ ] 3. Phase 2: slices 1–6 in order (create → merge → finalize/sync → CI-primary → review → re-point)
- [ ] 4. Phase 3: UI (pipeline settings → task surfaces → frontend tests)
- [ ] 5. Phase 4: full gates (§8.1) + scripted acceptance (§8.2) + docs (§8.3)

Each checkbox lands with its tests green before the next starts; Phase 1 steps must each be
independently shippable with zero user-visible change.
