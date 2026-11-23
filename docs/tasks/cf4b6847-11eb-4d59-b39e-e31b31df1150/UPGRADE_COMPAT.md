# Upgrade Compatibility Review: Per-Pipeline Base Branch (cf4b6847)

**Stage:** Upgrade-safety gate — "make sure the current change as implemented won't cause existing installs to break on update."
**Scope:** Full diff `origin/main...HEAD` (64 files, ~30 source/test files outside this docs folder). Docs-only stage: no source inspected was modified.
**Verdict: PASS** — existing installs with no configured `baseBranch` upgrade with zero migration, zero new failure mode, and byte-identical behaviour.

## Summary

Every new surface is additive and optional with the old path preserved as the default. The base-branch chain is `task.baseBranch` (pinned snapshot) → workflow `baseBranch` (live pipeline) → `defaultBranch(cwd)` (repo default); when nothing is configured the chain resolves to the repo default and all callers behave exactly as before — including skipping all new git work (`ensureTaskBaseBranch` short-circuits for `source: 'repo'`, `prepareIntegrationAttempt` / `resolveCiBranchPlan` / runner `primaryBranch` are gated on `source !== 'repo'`). No stored-file migration, no required field, no new env/port, no removed export, and runner `apiVersion` unchanged, so old↔new backend/runner mixing is safe in both directions.

## 1. Stored data (`project.json` + `task.md`) — no migration, tolerant reads

- **Workflow `baseBranch` is optional and omitted when absent.** `normalizeWorkflow` (`api/project/workflowDefaults.js`) spreads `...(storedBase && isValidBranchName(storedBase) ? { baseBranch: storedBase } : {})`; `createWorkflow` (`api/projectStore.js`) only stores `...(base.changed && base.baseBranch ? { baseBranch } : {})`. Workflows created without a base carry no key at all (covered by `workflowDefaults.test.js` "leaves workflows without a base branch byte-identical" and `projectStore.test.js` round-trip test).
- **Old files load unchanged.** `scanProjects`/`_loadProjectFile` re-normalize via `normalizeWorkflows`; a file with no `baseBranch` normalizes to the same `{id, name, isDefault, stages}` shape as before. No schema-version bump or migration script exists or is needed.
- **Hand-edited invalid values degrade to "repo default", never crash.** Invalid stored names are dropped on load (`normalizeWorkflow` validity gate); reads in `resolveTaskBaseBranch` (`api/work/taskBaseBranch.js`) fall through invalid pinned/live names to the repo default (tested: "ignores invalid pinned and live names").
- **Downgrade is lossy but safe.** Old code's `normalizeWorkflow` rebuilt `{id, name, isDefault, stages}` and dropped unknown fields, so a new file with `baseBranch` downgraded to old code loses the field — it does not crash (old drops, never throws). This is the correct direction for "update" (old→new is what matters, and new preserves valid field across disk reload per the reload test).
- **Task pin is optional frontmatter.** `saveTaskMarkdown` (`api/work/taskPersistence.js`) emits the `baseBranch:` line only when `task.baseBranch` is truthy; `parseTaskMarkdown` reads `data.baseBranch || undefined`. Old tasks without the line parse to `undefined` (resolver falls through); new tasks round-trip (tested both directions in `taskPersistence.test.js`). Old parsers ignore the unknown frontmatter key (flat `data` map, explicit field reads) — no parse failure.
- **Task creation never throws for pinning.** `createTask` (`api/work/taskLifecycle.js`) wraps the `getWorkflow` lookup in try/catch and tolerates missing `getWorkflow` (tested: "leaves baseBranch absent when the store has no workflow lookup"). Pin is pure data, zero git at creation, preserving the serialization gate.

## 2. API — absent means untouched, new 400 only for the new field

- `POST /projects/:id/workflows` and `PATCH /projects/:id/workflows/:workflowId` (`api/routes/projects.js`) accept an optional `baseBranch`. Absent (`undefined`) ⇒ `{ changed: false }` ⇒ field untouched (`normalizeBaseBranchUpdate` in `api/project/workflowDefaults.js`). Existing clients that never send the field see identical behaviour.
- Blank/`null` clears back to repo default (key deleted, not stored empty) — the documented clear semantic.
- Invalid names now 400 (route wraps `updateWorkflow`/`createWorkflow` throws into 400). This is only reachable when the caller explicitly sends the new field; no existing install sends it, so no existing request changes from success to failure. Previously-sent `baseBranch` (unknown field, silently ignored) is not an existing-install pattern.
- `createWorkflow(projectId, { …, baseBranch })` adds an optional param with `undefined` default; existing call sites are unaffected.

## 3. Behaviour — unconfigured paths are byte-identical

- `resolveTaskBaseBranch` returns `{ branch: <repo default>, source: 'repo' }` when unconfigured (tests cover injected-default, cwd-resolved, and store-throw fallthrough). All consumers gate new logic on `source !== 'repo'`: `ensureTaskBaseBranch` returns without git work; `resolveCiBranchPlan` skips the new missing-base existence check; `prepareIntegrationAttempt` (`api/flow/runnerRoutes.js`) skips `ensureBaseBranchExists`; `finalizeTaskBranch` omits `targetBranch` (historical call shape preserved); runner payload omits `primaryBranch`.
- `defaultBranch(cwd)` (`api/git/branch.js`) is untouched — same symbolic-ref/known-name/current-branch/fallback chain, still the bottom of the resolver chain. The new merge-stage `!mainBranch` guard corresponds to the old `defaultBranch` throw: for non-git/unborn checkouts both old and new fail (message differs, success→failure never occurs for valid repos). Merge already guards `hasCommits` before resolving.
- `syncMainToRemoteBestEffort(…, opts)` defaults to `syncDefaultBranchToRemote(cwd)` with no override when `opts.mainBranch` is blank/null; `syncDefaultBranchToRemote` (`api/git/remote.js`) treats explicit-equal-to-default identically to resolving it. Unconfigured syncs target the same branch with the same warn-only contract.
- `returnToDefaultBranch` / `withCheckedOutBranch` (`api/git/branch.js`) add optional `targetBranch`/`restoreBranch`; when omitted they resolve via `defaultBranch` as before. `resolveReviewBase` adds optional `opts.baseBranch` with fallback; `getTaskDiffStat` adds defaulted `branchExistsFn` — all old call signatures work.
- Auto-create (`ensureBaseBranchExists`/`ensureTaskBaseBranch`) never throws (skipped results) and only runs for configured pipelines; unconfigured installs see no extra fetch/push/branch-create. The adopted-remote-tip fork and best-effort push are new only for configured pipelines (the feature).
- CI `primary` semantics change (pipeline base vs real default) is gated to configured pipelines; unconfigured `primary` stages resolve and restore identically (backend resolve + runner checkout both no-op without `primaryBranch`).

## 4. Runner / fleet — additive field, matching directions safe

- Backend sends `primaryBranch` **only** when `runOnBranch === 'primary'` and `resolvedBase.source !== 'repo'` (`api/flow/runnerRoutes.js`); otherwise the key is absent — payload byte-identical for unconfigured pipelines.
- Old runner ignores the unknown field (it never read `claim.primaryBranch`); new runner defaults `primaryBranch = ""` and no-ops (`checkoutPrimaryBase` gated on `mode === 'primary' && base && resolved === projectCwd`). New runner + old backend (which never sends `primaryBranch`) runs exactly as before; new backend + old runner runs primary stages on the primary checkout's current branch as before (only configured-pipeline stages lose the new checkout, but old backends never configured anything).
- `runner/version.json`: `runnerVersion` 0.1.0→0.2.0, **`apiVersion` stays `1.0.0`, `requires.backendApi` stays `>=1.0.0 <2.0.0`** — no compatibility gate blocks update in either direction, matching the repo's self-update contract (newest release whose manifest admits the backend).

## 5. Frontend — display + conditional payload only

- `WorkflowManagementPanel` adds an optional base-branch input/edit; existing create/rename flows behave identically when left blank.
- `useWorkflow.createWorkflow` spreads `...(baseBranch ? { baseBranch } : {})` — callers without the field send the same payload.
- `TaskDetailPageContent` / `CreateTaskFromFileModal` add read-only base-branch labels; no required UI state or migration.

## 6. What would have failed this gate (none present)

- Required field / migration / schema bump — none; field is optional everywhere.
- New throw on the old path — none; new throws (`normalizeBaseBranchUpdate` 400, missing-base `GitError`, runner `checkoutPrimaryBase`) are all gated on an explicitly configured pipeline.
- Removed/renamed exports or endpoints — none; only additions (`normalizeBaseBranchUpdate`, `taskBaseBranch` exports, `primaryBranch` payload key).
- Version/port/env breaks — none; `apiVersion` unchanged, no new env vars or routes.

## Test evidence (existing suites, unmodified)

- Round-trip/tolerance: `workflowDefaults.test.js` (byte-identical, trim, invalid-drop), `projectStore.test.js` (disk reload + clear + plain-has-no-key), `taskPersistence.test.js` (both directions), `taskLifecycle.test.js` (pin/absent/missing-lookup).
- Resolver chain: `taskBaseBranch.test.js` (pin>live>repo, invalid fallthrough, store-throw tolerance, repo short-circuit).
- Behaviour parity: `commandStages.test.js`, `integrationDispatch.test.js`, `runnerCiBranchPayload.test.js`, `taskBranches.test.js`, `taskDiffStat.test.js`, `branch.test.js`, `routes/projects.test.js`, `runner/ciBranchWorkdir.test.js`, plus `pipelineBaseBranch.integration.test.js` (configured-path end-to-end with `main` untouched).
- Prior canary failures in this task's reports are infra flakes (`Target page, context or browser has been closed`, 1–3 tests, different specs per run, 137–139/140 passing) unrelated to this change.

## Second pass (2026-11-19, HEAD `171a855b`) — latest delta re-checked

The HEAD commit added four refinements on top of the reviewed state. Each was re-checked for upgrade breakage; none changes the verdict.

- **Wrong-typed `baseBranch` now throws (400) instead of silently clearing** (`api/project/workflowDefaults.js:normalizeBaseBranchUpdate`). Only reachable when the caller explicitly sends the new field (existing clients never do), and it replaces a silent data-loss (wipe) with a loud error. Absent (`undefined`) still means untouched — verified at runtime: `undefined → {changed:false}`, `null → {changed:true, baseBranch:null}`; `42`/`{}`/`[x]` throw.
- **Invalid pipeline names are never pinned** (`api/work/taskLifecycle.js:createTask` gates `normalizeBaseBranchName` with `isValidBranchName`). A hand-edited store with garbage yields an absent pin (resolver falls through to repo default), never a persisted-bad snapshot. Stored-workflow tolerance is unchanged: `normalizeWorkflows` drops invalid/non-string names on load (runtime-verified: `"has space"` and `42` both drop without throwing).
- **Diff-stat badge now threads the caller's effective base** (`api/work/taskDiffStat.js`, `api/work/taskPersistence.js`). `getTaskDiffStat` gains an optional `baseBranch` (defaults to task pin); `recordTimelineWithDiffStat` resolves via `resolveTaskBaseBranch` best-effort and degrades to pin-only on failure. Unconfigured tasks resolve to repo default exactly as before (tests: 234 passed across `workflowDefaults`, `projectStore`, `projectStore.barrel`, `taskLifecycle`, `taskPersistence`, `taskBaseBranch` this session).
- **Runner re-check unified to `isValidBranchName`** (`runner/daemon.js:checkoutPrimaryBase`). Stricter than the old inline regex, but only exercised when a pipeline is explicitly configured (`primaryBranch` absent ⇒ no checkout). No existing install reaches it.

Merge status: `git merge-tree --write-tree HEAD origin/main` resolves cleanly (single tree, no conflicts) — the earlier `api/projectStore.barrel.test.js` conflict is already resolved by merge `359fa2d4` (all three exports `normalizeBaseBranchUpdate`, `normalizeDocsRepoPointers`, `normalizeDocsRepoSettings` present in order).

## Conclusion

KAINBAIN_VERDICT: PASS — ship as-is from an upgrade-safety standpoint. No follow-up required for existing installs; operators opting into `baseBranch` get the new auto-create/push/checkout behaviour as designed.
