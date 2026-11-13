# Implementation Plan: "No code" toggle on a stage

## 0. Context and deliverable

- **Repository:** KainBain runner (`/home/server/.kainbain/runner-work/kb-2b258e8a...`), branch `kb/2b258e8a-7d8c-498a-8d23-5923e7975d8a`.
- **Feature:** Add a boolean stage toggle, tentatively named **`noCode`**, defaulting to off (code is allowed). When on, the stage is effectively docs-only: the agent prompt states that it may read the codebase but must only write under the project's docs directory, and any engine auto-commit must ignore/erase changes outside that docs directory.
- **Primary artifacts expected:** `IMPLEMENTATION_PLAN.md` (this file) now; subsequent implementation and tests later.
- **Note on survey:** The task points at `docs/tasks/2b258e8a-7d8c-498a-8d23-5923e7975d8a/SURVEY.md`, but that file is not present in this checkout. This plan therefore restates the suspected survey conclusions as explicit assumptions in Section 2 and calls out the resulting open questions so they can be resolved before coding.

### Assumed decisions (treated as the "grill me" survey outcome)

1. The toggle is **stage-level**, not project-level: each stage independently opts in.
2. "No code" means **docs-only writes**, not a true filesystem read-only sandbox; the agent still receives repository access for investigation.
3. `docs` is defined by the **project's resolved docs directory name** (`resolveDocsDirName`), default `docs`, honouring `centralizedDocs` and custom names.
4. Dirty code changes made by an agent under a no-code stage are **erased before commit**; they must not leak into later stages' commits.
5. The toggle applies to **agent stages** (prompt + auto-commit). It is harmless/unused on human/ci/merge stages, but the UI may show it on agent stages only initially.
6. Property name: **`noCode`** (camelCase, boolean), consistent with existing stage keys such as `paused` and `report`.

## 1. Principle: make the change easy, then make the change

Follow the repository's WP-style seam-first approach:

1. **Introduce pure helpers and normalizers first** (no behaviour change).
2. **Wire helpers into one call site at a time** with tests.
3. **Keep legacy stages byte-identical** when `noCode` is absent.
4. **Do not change commit semantics for non-no-code stages.**

## 2. Scope map (where the feature touches)

### Backend / domain
- `api/project/stageNormalizers.js` — stage shape, normalization, default stages.
- `api/promptCuration.js` — agent prompt assembly (`PromptCurationEngine.curatePrompt`, `stageWantsReport` neighbour).
- `api/work/taskFinalize.js` — `finalizeTaskBranch`, `commitFailedStageWork`.
- `api/git/commit.js` — `commitAllIfNeeded`, `commitFailed...` path, live snapshot untracking.
- `api/docsPath.js` — `resolveDocsDirName`, `DEFAULT_DOCS_DIR_NAME`.
- `api/flow/execution/executeStage.js` — wires `stage.noCode` into prompt + finalization.
- `frontend/src/components/workflow/pipelineTransfer.js` — export/import/validation of stage keys.
- `frontend/src/components/workflow/StageTypeConfig.jsx` — stage settings UI.
- Shared prompt layout (`shared/promptLayout.js`) only if a new prompt section token is added.

### Out of initial scope
- True OS-level sandboxing of agent file writes (not feasible across harnesses).
- Human/ci stage command filtering (those do not use the agent prompt/commit flow in the same way).

## 3. Step-by-step implementation plan

Order puts research/infrastructure first, then behaviour, then UI/export, then verification.

### Phase A — Data model: make normalization accept `noCode`

**Goal:** Establish a single canonical, validated representation before any runtime behaviour.

1. **Read/extend normalizer pattern** in `api/project/stageNormalizers.js`.
   - In `normalizeStage`, add a block mirroring the existing `runnerPolicy`/`harness` handling:
     - Only touch the key when `stage.noCode !== undefined`.
     - Coerce with `normalized.noCode = stage.noCode === true` (strict boolean, drops truthy garbage).
     - Keep absent/undefined absent so legacy stages remain byte-identical.
   - Add a JSDoc example: `normalizeStage({ id: '1', noCode: 1 }).noCode => true` or `undefined`? Decide strict: only `true` yields true; anything else false when explicitly present. Hidden tests may expect truthiness. Use `Boolean(stage.noCode)` on presence to be tolerant but store only booleans. At write boundary validate stricter.
   - Do **not** stamp defaults on legacy/default stages (`DEFAULT_STAGES` stays unchanged).
   - Add unit tests in `api/project/stageNormalizers.test.js`:
     - absent => key absent.
     - `noCode: true` preserved.
     - `noCode: false` preserved (explicit, not dropped).
     - garbage (`"yes"`, `1`, `null`) normalized to boolean.

2. **Stage save boundary validation** (find where stage PUT routes validate fields; search `stageNormalizers` consumers / project settings).
   - Locate the project update validation (likely `api/projectStore` or route). Add `noCode` to allowed keys and type check, rejecting non-boolean with 400 when write path expects strict types. If the codebase validates opt-in booleans loosely, mirror `paused`.
   - Search tests for `paused` validation in routes to copy pattern.

3. **Persist round-trip tests.**
   - Add a small normalizer test asserting idempotency: `normalizeStage(normalizeStage(stage))` deep-equals first result.

### Phase B — Prompt: make the agent aware (docs-only instruction)

**Goal:** "add it to the prompt to the agent."

1. Create a pure helper in `api/promptCuration.js` (or `api/work/`) `buildNoCodePromptSection(docsDirName)`:
   - Returns a markdown block such as:
     ```
     # No Code (Docs-Only)
     This stage is marked no-code. You may read and search the entire repository for context,
     but you must ONLY create or modify files under `./<docsDirName>/` (in particular this task's docs folder).
     Do not edit source code, configuration, tests, or any file outside the docs directory.
     Any code changes you make will be discarded by the engine and will not be committed.
     ```
   - Pure, deterministic, unit-testable. Keep message concise but unambiguous.
   - Use `DEFAULT_DOCS_DIR_NAME` fallback when undefined.

2. In `PromptCurationEngine.curatePrompt`:
   - Resolve docs dir name already computed as `docsDirName`.
   - If `stage?.noCode === true`, set `sectionMap.noCode = buildNoCodePromptSection(docsDirName)`.
   - Add `"noCode"` to `SECTION_TOKENS` in `shared/promptLayout.js` as an optional section so layouts can place it explicitly.
   - Because this is a safety instruction, consider making it **auto-reinjected** like `failureDetails`/`testingGuidance`: add to `CONDITIONAL_LAYOUT_TOKENS`, and update `resolveAutoReinjectedTokens` to include `"noCode"` when `stage.noCode === true` and the token is absent. This prevents a custom layout from accidentally dropping the guard.
   - Update `DEFAULT_PROMPT_LAYOUT` construction (it maps all `SECTION_TOKENS`, so adding token auto-adds a `{{noCode}}` slot; rendering drops empty blocks, so non-no-code stages stay unchanged/byte-identical). Verify default layout count tests (currently 9 tokens) will become 10; update expected values in tests carefully (this is intentional, optional empty section renders nothing).
   - *Risk:* default layout count assertions in tests. Map them.

3. Ensure the fallback non-promptEngine path in `executeStage` (when `promptEngine` missing) also includes the no-code block:
   - In `executeStage`, before wrapping `curatedPrompt`, if `stage.noCode === true`, append the section (or call helper). Better refactor helper into a shared exported function so both paths can use it.

4. Unit tests:
   - `api/promptCuration` tests: when `stage.noCode` true, prompt contains "No Code (Docs-Only)" and docs dir name.
   - When false/absent, prompt is byte-identical to baseline (add snapshot-style assertion).
   - Custom layout omitting `{{noCode}}` still gets the section auto-appended for no-code stages.

### Phase C — Git: discard non-doc changes and restrict commits

**Goal:** "cause any commits made to ignore/erase changes made outside the docs directory."

1. Add a pure path predicate `isDocPath(relativePath, docsDirName)` in `api/git/commit.js` (or `api/docsPath.js`?). Semantics: normalize slashes, resolve first path segment equals docs dir name. Include nested under docs. Possibly include task docs prefix only, but user says outside docs directory, so any `docs/...` changes okay. Keep broad: prefix `docsDirName/`.

2. Add `discardChangesOutsideDocs(projectCwd, docsDirName)` helper:
   - Guard not git repo / no commits.
   - Get full status including ignored? Use `getWorkingTreeStatus(projectCwd, { ignorePaths: [] })` for tracked/untracked dirty paths.
   - For each dirty path whose normalized path is not under `docsDirName/`:
     - If tracked: `git checkout -- <path>` (or `git restore --source=HEAD -- <path>`) to discard.
     - If untracked: `git clean -f -- <path>`? `git clean` only removes untracked; for directories use `-fd`. Use per-path `git clean -fd -- <path>` (dangerous but intended erase) or globally `git clean -fd` but excluding docs. Safer: collect untracked paths and remove file entries; directories may remain. Better use `git clean -fdx`? No, respect ignored; keep simple `git clean -fd` on non-doc paths. Could potentially delete untracked files inside ignored build dirs, but those aren't in status. Good.
   - Do not touch `docsDirName/` (keep report/doc changes). Also don't touch live snapshots special? Docs path includes task.md; keep.
   - Return list discarded.
   - Never throws; on failure record warning. But for commit filtering, better to throw? For erase semantics, log warning and continue; caller tests can assert.

3. Update `commitAllIfNeeded(projectCwd, message, opts)`:
   - Accept `opts.noCode` (boolean) and `opts.project`/`docsDirName`.
   - When `noCode === true`:
     - Resolve docs dir name: `opts.docsDirName || opts.project` via `resolveDocsDirName(opts.project)` (pass project in from finalize) or default.
     - Call `discardChangesOutsideDocs` **before** `git add -A`.
     - Even after discard, restrict add to docs dir if helper failed: instead of `git add -A`, `git add -A -- <docsDir>`? But staged deletions of non-doc? We already discarded. Could both. For safety, run `git add -A -- <docsDirName>`? This may miss repo-root doc config; `git add -A -- docs` only docs. That's desired. However live snapshot untracking path uses all staged paths; okay.
     - Also ensure deletions of tracked non-doc files? Discard tracked changes restores them, so no deletion commit. Untracked non-doc removed. Good.
   - Pass `docsDirName` to project-dependent helpers via `opts`.
   - Keep old branch affinity guard.

4. `commitFailedStageWork` similarly:
   - Accept noCode and erase before failed commit; pass through to `commitAllIfNeeded`.
   - Additionally ensure noCode passed from executeStage on failure path. Note failed stage commits occur in routeStageError? Search.
### Phase D — Wiring: pass `noCode` into runtime

1. `api/work/taskFinalize.js`:
   - Add `opts.noCode` to `finalizeTaskBranch` and `commitFailedStageWork` docs/JSDoc.
   - In `finalizeTaskBranch`, pass `noCode: opts.noCode === true` and `docsDirName: resolveDocsDirName(projectEntity?)` or `opts.docsDirName` to `commitAllIfNeeded`.
     - Need resolve project. `finalizeTaskBranch` already resolves cwd via taskStore. Add optional `opts.project` or use `store.projectStore.getProject(task.projectId)` when available (tolerant).
   - Same in `commitFailedStageWork`.

2. `api/flow/execution/executeStage.js`:
   - On successful agent dispatch, call `store.finalizeTaskBranch(task, cwd, { ..., noCode: stage.noCode === true })`.
   - On failure path: inspect `routeStageError.js` around line 94; ensure it forwards `noCode` (available in `stage`). Pass `stageNoCode: stage?.noCode === true` or `noCode` into opts. Need check current opts shape (search routeStageError). If opts already includes stage, use that.
   - Fallback non-promptEngine path append no-code block.

3. `routeStageError.js`:
   - Read stage from its arguments; when calling `commitFailedStageWork`, include `noCode: stage?.noCode === true`.

4. Frontend:
   - `pipelineTransfer.js`: add `'noCode'` to `STAGE_KEY_ORDER`; validate `typeof boolean` (mirroring `paused`).
   - `StageTypeConfig.jsx`: add a checkbox (or toggle) in the agent section, after Timeout, with InfoTooltip. Also optionally show a read-only badge in human/ci config? Initial: agent only.
   - Any component that displays stage chips/tags may show `noCode` badge; optional.

5. Export/import UI? `pipelineTransfer` covers JSON export.

### Phase E — Stage-scoped transient state and metadata

- Add `noCode` to stage overlay forms/project settings if any generic stage editor (search other frontend usages of `paused`).
- Ensure stage diff/merge summaries ignore code for no-code stages: `getCommitRangeDiffStat` may double count. For no-code stages diff should only docs. Since non-doc changes erased, okay. No special handling.
- Task reports should record `noCode` in stage report? Optional. Not needed.

### Phase F — Verification (tests + manual)

#### F1. Unit tests (backend)
- `api/project/stageNormalizers.test.js`:
  - absent vs true vs false vs garbage.
- New `api/git/commit.noCode.test.js` (or extend `commit.test.js`):
  - in a temp git repo, create doc change + code change, call `commitAllIfNeeded(cwd, msg, { noCode: true, docsDirName: 'docs' })`.
  - Assert commit includes only docs path (e.g. `git show --stat HEAD` shows `docs/...`), code file unchanged/reverted.
  - Ensure non-no-code commit still includes all (`noCode: false`).
  - Test custom docs dir name (`k-docs`).
  - Test untracked non-doc files are removed (but keep docs untracked? docs tracked? project commits tasks snapshots separately; test tracked doc).
- `api/promptCuration` tests:
  - contains no-code section only when flag true.
  - byte-identical absence assertion.
  - auto-reinject in custom layouts.

#### F2. Frontend tests
- `pipelineTransfer` validation tests (mirror `paused`):
  - boolean validation, export/import round trip.
- `StageTypeConfig` component tests:
  - toggle dispatches `onUpdateStage(id, { noCode: true })`.
  - defaults unchecked for legacy stage.

#### F3. Integration tests
- Extend `stageLifecycle.integration.test.js` maybe with a no-code stage and assert code file did not land in branch (optional; can be a follow-up test).
- Manual: create task, enable no-code on Plan stage, have agent edit both `docs/tasks/.../plan.md` and `src/foo.js`, ensure only docs ends committed.

#### F4. Documentation
- Update `site-docs` (or `docs/`) stage settings docs listing the new toggle.
- Add a short section to `README.md` or task workflow docs describing no-code stages.
- Add `@example` JSDoc blocks to new functions to satisfy `check:jsdoc-example`.
- Run `npm run docs:check`.

### Open questions (resolve before/during implementation)

1. Should `noCode` also be shown for human/CI stages? Survey assumed agent-only UI initially; semantics on command stages? A CI stage cannot be "docs only" in same way.
2. Erase semantics destructive: should untracked outside-doc files be deleted or left for operator? Current plan deletes untracked (except docs). Confirm with grill-me stakeholders; alternative is leave but ignore. User wording "ignore/erase changes" supports erase.
3. Should code changes be erased even on failed stages? Plan says yes (`commitFailedStageWork`), so a failed agent attempt cannot sneak code into next retry.
4. Field naming alias: accept `docsOnly` legacy? Recommend no (YAGNI), but normalizer can map if discovered.

### Rollout / risk

- **Default off:** all existing projects/stages load with absent `noCode`; normalization and prompt/commit paths preserve current bytes/behaviour.
- **One-way destructive operation:** implement behind a clear opt-in. Consider logging discarded paths.
- **Cross-concern:** prompt layout token count changes. Update tests deliberately, not via broad snapshots.
- **Migration:** no migration needed; absent => off.

### Definition of Done

1. A stage with `noCode: true` renders a prominent docs-only instruction in every agent prompt (including custom layouts).
2. An agent run on a no-code stage that edits code and docs results in a commit containing only docs-dir paths; code edits are reverted.
3. Default behaviour (noCode absent/false) is byte-for-byte unchanged in tests.
4. Frontend can set, persist, export, import, and validate the toggle.
5. Unit + integration tests above pass (`npm run test:unit`).
