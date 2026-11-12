# AUDIT — Post-hackathon codebase audit (KainBain rewrite)

- **Audit date:** 2026-11-12 ~09:00 UTC
- **Branch:** `kb/b8c9bb8e-ec2c-4296-9580-6d70ed161526` (working tree = `main` tip `b8f81ea`)
- **Auditor:** Audit stage agent (this task)
- **Deliverable:** this file, `docs/tasks/b8c9bb8e-ec2c-4296-9580-6d70ed161526/AUDIT.md`
- **Focus per task instructions:** collect findings and missing data only. This document deliberately contains **no recommendations**; it records what was measured, what passed/failed, and what could not be verified. Prioritization and proposed fixes are left to peer review / follow-up tasks.

## 0. Method and scope

1. Read the standards set: `docs/KB Code Standards.md`, `docs/ARCHITECTURE_DOMAINS.md`, `AGENTS-MAP.md`, `agents.md`, `docs/TASK_DIRECTORY_HYGIENE.md`, root `package.json` gate scripts, and the gate implementations in `scripts/check-one-function-per-file.mjs` / `scripts/check-jsdoc-example.mjs`.
2. Recovered the prior task reports cited by the task prompt. They were **absent from the working tree** (empty `docs/tasks/b8c9bb8e-…/`); they exist only in git history on other task branches. Restored via `git checkout b3f196d / 5e36d31 / 3a19092 -- docs/tasks/b8c9bb8e-…/` so `FRAMEWORKS.md`, `INTENT-SURVEY.md`, `task-spec-20261110-165113.md`, and the seven `audit-failure-*.md` files are present again. No task directory was moved, renamed, or deleted (per `docs/TASK_DIRECTORY_HYGIENE.md`).
3. Scope decision (FRAMEWORKS.md §1 scope note): `INTENT-SURVEY.md` contains **no recorded answers** (`"answers": {}`), and `task-spec-20261110-165113.md` is a 3-line auto-generated `PASSED` stub with no content — so scope was inferred as recommended: the hackathon window via `git log --since`, every task directory those commits touched, with the whole current tree as context.
4. Window evidence: the rewrite big-bang is **2026-10-26** (1,698 distinct non-task files touched in a single day on `main`). Commit density: 1,126 commits on `main` since 2026-10-26; 555 since 2026-11-02 ("last 10 days"). Both windows are reported; "recent changes outside KainBain" = commits on `main` in the window (runner/muse-originated stage outputs included).
5. Ran every repo gate listed in `AGENTS-MAP.md` / FRAMEWORKS.md §D from the repo root after `npm ci` in root, `api/`, `frontend/` (all installs exit 0; Node v26.4.0 vs `.nvmrc` 24 — noted, gates still pass).
6. Mined churn (`git log --name-only`), file sizes (`wc -l`), function-span outliers (top-level `function`/`export const … = (` span heuristic), branch-density proxy (count of `if/for/while/catch/case/&&/||/?.` per 100 code lines, comments/strings masked), duplicate 8-line blocks (≥50 tokens, SHA-1 shingles over api/shared/frontend/src/runner/scripts), cross-domain import edges, and docs-vs-tree drift.

## 1. Recent tasks review (what the last 10 days built)

- **62 task directories** under `docs/tasks/` were touched since 2026-11-02. Most-touched: `b21f8658` (39 files), `8ded2dfc` (31), `202ebd9b` (29), `f42d4ab0` (27), `ef13c0e6` (26), `99709f05` (23), `32714fcd` (21), `e597e05b` (20), `2b2c7858` (20), `4add6dfd` (19).
- Merge-commit subjects on `main` in the window (feature work that landed): dynamic accessibility statement page; no-code stage toggle; `!running` / new board filters; runner attribution in task history; image-generation questions in the question-me skill; Now Playing bar freshness fix; auto-approve-after-x-time for human stages; task page / top-bar overlap fix; API-key auth system; retrospective runner-architecture fix; developer guide (`api/agentGuide.js`); site-docs usability; runner model autodetect from existing harnesses; adjustable task panel; task image loading fix; git-checkout pipeline-stranding bug fix; runner auto-update fix; first-install experience fixes; central queue across pipelines.
- This task's own Audit stage **failed 6 times before running** — all infrastructure, no content failures: `audit-failure-20261111-202821` (git checkout blocked by untracked `docs/tasks/<id>/task.md`), `…-004006/004012` (no API key for model), `…-004007/004010` (`spawn muse ENOENT`), `…-004009` (`spawn vibe ENOENT`), `…-004013` (retry ladder exhausted on the above).

## 2. Gate results (evidence, run 2026-11-12 from repo root)

| Gate | Command | Result |
| --- | --- | --- |
| One-function-per-file (WP-8) | `npm run check:one-function` | **PASS** — 816 files scanned, 281 grandfathered (34% of scanned files are on the allowlist) |
| JSDoc `@example` (WP-8) | `npm run check:jsdoc-example` | **PASS** — 682 exports currently missing `@example`, all within the 684-entry baseline; no *new* missing exports |
| Docs coverage + link integrity | `npm run docs:check` | **PASS** — 37 api doc tests green; "All referenced file paths exist (71 doc files scanned)" |
| Lint | `npm run lint` | **PASS** — exit 0, **0 errors**; warnings: 498 (api pass) + 215 (frontend pass), dominated by `security/detect-non-literal-fs-filename`, `security/detect-object-injection`, `security/detect-unsafe-regex`, unused eslint-disable directives |
| Unit tests | `npm run test:unit` | **PASS** — api: 440 files / 7,076 tests passed (1 skipped); frontend: 341 files / 4,645 passed; exit 0 |
| Dependency check | `npm run depcheck` | **PASS** — api, frontend, root all PASS |
| Build | `npm run build` | **PASS** — exit 0 (api + frontend bundles) |
| Knip (dead exports) | `npx knip` | **NOT RUNNABLE** — `.knip.json` `workspaces` entries are arrays, rejected by knip 6.45.1 (`Invalid input (location: workspaces.api, expected: object)`); knip is **not pinned** in any `package.json`, so the config targets an unknown version |
| Canary E2E / full `npm test` | not run | not verified in this audit (see §6) |
| Security scan (hygiene only) | `./Security_scans.sh` | **PASS** exit 0 — Trivy + Semgrep results uploaded to SecObserve (product ID 22; 29 existing titles deduped, 16 new uploads, 0 closed stale), SBOM generated |

## 3. Codebase metrics snapshot (current tree, excl. node_modules)

| Area | Lines | Files |
| --- | --- | --- |
| `api/` | 223,116 | 824 |
| `frontend/src/` | 145,832 | 720 |
| `shared/` | 6,612 | 61 |
| `runner/` | 14,531 | 39 |
| `scripts/` | 7,194 | 31 |
| `tests/` | 7,361 | 34 |
| `canary-e2e/` | 7,058 | 36 |

- Co-located test files (`*.test.*`): **836**.
- Source files (excl. tests/fixtures) over the **800-line** review-reject line: **38**. Over the **400-line** backend / 300-line component soft limits: **140**.
- Root shell artifacts: `deploy.sh` 1,878 lines, `publish.sh` 454, `Security_scans.sh` 335, `startRunner.sh` 184, `docker-entrypoint.sh` 83.

## 4. Findings

### 4.1 Size and function-span outliers (highest-interest debt candidates)

Largest source files (lines): `runner/daemon.js` 2,530; `api/projectStore.js` 2,344; `api/config/schema.js` 2,328; `api/flow/commandStages.js` 2,173; `api/flow/runnerRoutes.js` 1,521; `api/agentGuide.js` 1,420; `api/flow/execution/executeStage.js` 1,334; `api/agentRunner.js` 1,202; `api/taskStore.js` 1,094; `api/routes/projects.js` 1,091; `frontend/.../ModelAliasesSection.jsx` 1,439; `TaskDetailPageContent.jsx` 1,290; `ObservabilityDashboard.jsx` 1,143; `TaskDetailOverlayContent.jsx` 1,071; `StageSkillsPanel.jsx` 1,052; `TaskCard.jsx` 1,019; `RunnerConfigurationSection.jsx` 1,018; `SurveyPage.jsx` 956.

Largest top-level function spans (lines, span heuristic): `registerRunnerRoutes` **1,309** in `api/flow/runnerRoutes.js`; `TaskDetailPage` **1,236** in `TaskDetailPageContent.jsx`; `executeStage` **1,233** in `api/flow/execution/executeStage.js`; `TaskDetailOverlay` **1,013** in `TaskDetailOverlayContent.jsx`; `ObservabilityDashboard` **995**; `effectiveHarnessForValidation` ~980 in `api/routes/projects.js`; `resolveRunnerStatePath` ~855 in `api/flow/runnerRegistry.js`; `createAgentRunner` 837 in `api/agentRunner.js`; `TaskCard` 924; `RunnerConfigurationSection` 912. In `runner/daemon.js`: `executeAssignment` 527, `runDispatchLoop` 217, `executeIntegrationAssignment` 187. Test-side: `runner/daemon.test.js` contains a 2,509-line `stubClient` helper; `api/flow/runnerRoutes.test.js` 1,985-line `findTaskMarkdown`; `api/flow/commandStages.test.js` 1,895-line `baseStage`.

**New file over the hard 800-line line with no documented exception:** `api/imageGen/surveyImages.js` — 879 lines, first added 2026-11-02 (commit `015104a`, task `ef13c0e6`). No exception mention found in `docs/`, `AGENTS-MAP.md`, or `CHANGELOG.md`. Other new-in-window files over the 400-line soft line: `api/auth/routes.js` 746 (2026-11-09), `shared/accessibilityStatement.js` 717 (2026-11-02), `runner/harnessModelDiscovery.js` 712 (2026-11-09), `api/flow/impromptuStore.js` 648 (2026-11-06), `api/imageGen/providers.js` 456 (2026-11-02).

### 4.2 Churn hotspots (git `main`)

Since 2026-10-26 (excl. `docs/tasks`, `*.jsonl`), most-changed files: `runner/daemon.js` 65, `api/flow/runnerRoutes.js` 58, `runner/daemon.test.js` 46, `api/flow/runnerRoutes.test.js` 35, `site-docs/api-reference.md` 34, `runner/README.md` 28, `api/agentGuide.js` 28, `deploy.sh` 24, `api/config/schema.js` 23, `CHANGELOG.md` 23, `.env.example` 23, `scripts/run-tests.mjs` 22, `RunnerConfigurationSection.jsx` 22, `NowPlayingBar.jsx` 22, `api/flow/dispatch/runnerMatches.js` 20, `api/config/config.test.js` 20, `runner/client.js` 19, `api/index.js` 19, `api/flow/runnerRegistry.js` 19.

Last 10 days only (since 2026-11-02): `runner/daemon.js` 24, `CHANGELOG.md` 22, `runner/daemon.test.js` 18, `RunnerConfigurationSection.jsx` 15, `api/flow/runnerRoutes.js` 15, `runner/README.md` 14, `SurveyPage.jsx` 14, `api/routes/projects.js` 13, `site-docs/api-reference.md` 12, `runnerConfigHelpers.js` 12, `MobileMonitorView.test.jsx` 12, `NowPlayingBar.jsx` 12, `api/config/schema.js` 12, `.env.example` 12, `api/flow/dispatch/runnerMatches.js` 11, `api/config/config.test.js` 11.

**Churn × size overlap (highest-interest):** `runner/daemon.js` (2,530 lines, 65 changes), `api/flow/runnerRoutes.js` (1,521 lines, 58 changes), `api/config/schema.js` (2,328 lines, 23 changes), `api/agentGuide.js` (1,420 lines, 28 changes), `api/flow/dispatch/runnerMatches.js` (window churn 11–20).

### 4.3 Branch-density hotspots (window-changed files; branches per 100 code lines)

`api/flow/curateRunnerPrompt.js` 58.2 (32 branches/55 lines), `api/flow/runnerAssignmentSummary.js` 51.0 (53/104), `api/work/resolveAttestationStage.js` 41.2, `frontend/.../review/reportAnchors.js` 36.6, `api/flow/dispatch/normalizeCapabilities.js` 33.2, `frontend/.../layout/activeTaskVisibility.js` 32.7, `api/flow/scheduler/startScheduler.js` 31.4, `scripts/generate-build-info.mjs` 31.3, `api/flow/scheduler/compareCentralQueueCandidates.js` 29.9, `shared/stageAttestation/formatAttestationToken.js` 29.7, `api/flow/dispatch/runnerMatches.js` 29.6, `scripts/detect-changed-components.mjs` 29.6, `frontend/.../tasks/logEntryModel.js` 29.5, `runner/impromptu.js` 29.3, `taskRetryState/isRetryInProgress.js` 29.2, `api/flow/scheduler/getScheduledQueue.js` 29.1, `api/routes/imageGen.js` 29.1, `api/work/taskWorkRoutes.js` 27.9 (199 branches/712 lines), `shared/survey.js` 27.9 (252/902), `api/flow/runnerRoutes.js` 25.5 (279/1,092).

### 4.4 Standards compliance checks (recent changes vs `docs/KB Code Standards.md` + `docs/ARCHITECTURE_DOMAINS.md`)

- **Cross-domain imports bypassing the domain `index.js`** (rule: outside a domain, import through its `index.js`): **19 instances**, e.g. `api/work/resolveAttestationStage.js` → `../flow/stageResolution.js`; `api/work/taskWorkRoutes.js` → `../flow/taskScheduler.js`; `api/work/taskPersistence.js` → `../watch/reliabilityShared.js` and `../flow/taskScheduler.js`; `api/work/resolveEngineState.js` → `../flow/stageResolution.js`, `../flow/circuitBreaker.js`; `api/work/countOpenTasksGlobal.js` → `../flow/scheduler/isWaitingForPickup.js`; `api/flow/taskControl.js`, `api/flow/commandStages.js` (3 imports), `api/flow/stageTransitions.js` → `../work/taskBranches.js` etc.; `api/flow/runnerRoutes.js` → `../work/resolveAttestationStage.js`; `api/watch/observabilityMetrics.js` → `../work/gitLock.js`; `api/auth/{apiKeyStore,sessionStore,userStore,accessConfig}.js` → `../house/fileWriting.js`.
- **Freeze-list files grew during the window** (`ARCHITECTURE_DOMAINS.md` freeze: `taskStore.js`, `WorkflowCanvas.jsx`, `TaskDetailOverlay.jsx`, `KainBainContext.jsx`, `services/api.js`): `api/taskStore.js` 1,069→1,094 (+25), `api/projectStore.js` 2,278→2,344 (+66), `WorkflowCanvas.jsx` 577→671 (+94), `KainBainContext.jsx` 499→539 (+40), `services/api.js` 137→139 (+2), `TaskDetailOverlay.jsx` 1→1. Whether the growth is new responsibility vs rewiring is not determined here (missing data).
- **New files without co-located tests:** of 167 new source files added since 2026-11-02, **96 have no same-basename co-located test**; of those, **15 are not referenced by any test file anywhere**: `api/auth/rbac.js`, `api/flow/dispatch/runnerMatches/claimEligibleRunner.js`, `api/flow/dispatch/runnerMatches/effectiveRunnerModels.js`, `canary-e2e/global-teardown.js`, `frontend/.../onboarding/{onboardingEvents,openAdoptProjectDialog,openCreateProjectDialog,writeOnboardingDismissed}.js`, `frontend/.../review/ReportLineRow.jsx`, `frontend/.../tasks/FailureMessageImage.jsx`, `frontend/.../tasks/hooks/useTaskInspectorResize/{clampToRange,defaultTaskInspectorWidth,widthFromPreference}.js`, `frontend/src/services/auth/unauthorizedEvent.js`, `scripts/refresh-accessibility-results.mjs`.
- **Technical-language / pattern-name mentions added in code during the window:** ~19 added lines matching `factory|singleton|barrel` in `api/ shared/ frontend/src/ runner/ scripts/` — e.g. `api/vitest.config.js` ("hot barrel"), `api/work/index.js` ("MARK: work barrel"), `api/push/index.js` ("push singleton"), `api/agent/harnessContract.js` / `harnessRegistry.js` ("factory" throughout), one `// Barrel: one function per file` comment. The standard bans mentioning design patterns and names like "factory"/"barrel" in code. Pre-existing occurrences also exist outside the window (not re-counted here).
- **File+folder same-name collisions** (searchability; several are documented barrels — `api/git.js`, `api/config.js`, `shared/toolLogFormat.js`, `shared/stageVerdict.js`, `shared/stageAttestation.js`, `fleetModelOptions.js`, `taskRetryState.js`): **non-barrel collisions where real logic sits in both the file and the folder**: `api/flow/dispatch/runnerMatches.js` (114 lines) vs `api/flow/dispatch/runnerMatches/` (`claimEligibleRunner.js`, `effectiveRunnerModels.js`); `frontend/src/components/tasks/hooks/useTaskInspectorResize.js` (186 lines) vs `useTaskInspectorResize/` (4 files); `frontend/src/hooks/useFleetModelCatalog.js` (67 lines) vs `useFleetModelCatalog/`.
- **Duplication (8-line blocks ≥50 tokens, repo-wide):** only **8 duplicate blocks**, 2 touching window-changed files: `runner/harnessModelDiscovery.js` lines 219 vs 243 (internal duplication), and `scripts/generate-runner-manifest.mjs:14` vs `scripts/package-runner.mjs:8`. Overall duplication is low by this measure.
- **Positive checks:** no `TODO/FIXME/HACK/XXX` lines added in code during the window (0); no real-looking secret values added to `.env.example` in the window (only placeholder comments); new-file JSDoc `MARK:` coverage is high on sampled new files (`surveyImages.js` 12 MARK / 12 exports; `providers.js` 16/16; `accessibilityStatement.js` 18/17; `harnessModelDiscovery.js` 27/15; `impromptuStore.js` 18/9; `auth/routes.js` 2/2); the `@example` gate passes with zero new violations.

### 4.5 Agent-facing documentation drift (the "speed up agents" lens)

- **Two divergent "code standards" documents:** `docs/KB Code Standards.md` (last changed 2026-10-26) and `docs/agent-docs/KB-Code-Standards.md` (last changed 2026-11-04, header claims it is the byte-identical vendored "source of truth") differ by **228 diff lines** and contain materially different principle sets (e.g. the top-level copy has the `MARK`/`@description`/`@example` and "NEVER MENTION DESIGN PATTERNS" rules that the WP-8 gates enforce; the vendored copy has a different Architecture section and warning wording). Same for the architecture pair: `docs/KB Architecture.md` (2026-11-02) vs `docs/agent-docs/KB-Architecture.md` (2026-11-04) differ. `agents.md` (2026-11-04) instructs agents to treat the vendored copies as source of truth.
- **`AGENTS-MAP.md` line-count claims vs actual tree:** `WorkflowCanvas.jsx` claimed ~558 (map) and 2,368 ("tracked debt", `ARCHITECTURE_DOMAINS.md`) — actual **671**; `KainBainContext.jsx` claimed ~470 (map) / ~930 (domains) — actual **539**; `api/taskStore.js` claimed ~1,069 (map) / 649 (domains) — actual **1,094**; `api/projectStore.js` claimed ~2,254 — actual **2,344**; `services/api.js` ~130 — actual **139**; `api/routes/tasks.js` ~50/40 — actual **53**; `api/git.js` ~80 — actual **99**. All map-referenced paths otherwise exist (checked 50 paths; only my own typo failed).
- **`AGENTS-MAP.md` ownership roster has no rows for:** `runner/` (39 files, 14.5k lines, #1 churn area), `canary-e2e/`, `deploy/`, `kainbain-addsite/`, and the root shell scripts (`deploy.sh` 1,878 lines, `publish.sh`, `startRunner.sh`, `Security_scans.sh`). Only `tests/`, `scripts/` are covered.
- **`docs/TASK_DIRECTORY_HYGIENE.md` drift:** its 2026-10-26 scope note says the `docs/tasks/` tree is not in-repo; `.gitignore` (2026-11-11 comments) says `docs/tasks/<id>/` reports stay tracked — and **672 files under 58 task dirs are currently tracked in-repo**.
- **`api/index.js` is 492 lines** while `AGENTS-MAP.md` describes it as "Fastify server wiring only"; it changed 19 times in the window.

### 4.6 Repository hygiene

- **59 root-level session `.jsonl` transcripts were committed during the window and 147 deleted**; 0 remain in the tree now. Committing them at the repo root (even transiently) bypasses the `docs/tasks` leak-guard convention.
- Prior Audit-stage failures in this task directory were all infrastructure (API key / missing `muse` & `vibe` CLIs / `git checkout` blocked by untracked `docs/tasks/<id>/task.md`) — see §1; the `git checkout` one is the bug fixed in merge `b8f81ea`.

## 5. What was verified green (baseline evidence)

All gates in §2 except knip passed on the current tree at audit time: 11,721 unit tests (7,076 api + 4,645 frontend, 1 skipped), 0 lint errors, docs link integrity over 71 doc files, depcheck across 3 workspaces, one-function and `@example` gates with zero new violations, production build exit 0.

## 6. Missing data / not verified in this audit

- `INTENT-SURVEY.md` answers are empty (q1–q7 unanswered); `task-spec-20261110-165113.md` is a content-free PASSED stub — intended scope/risk level for this task is therefore inferred, not recorded.
- **Knip dead-export check could not run** (config/version mismatch, §2) — dead exports left by the rewrite are unmeasured.
- **Canary E2E and the full `npm test` gate were not run**; only `test:unit`.
- Security-scan *findings content* was not analysed here (hygiene run only, per framework guidance); only its exit status and upload summary were recorded.
- Complexity numbers are a **branch-density proxy**, not parser-computed cyclomatic/cognitive complexity; function spans are a line-span heuristic. No mutation testing (spot-check only per framework guidance).
- No DORA/SPACE-style velocity instrumentation (lead time, change-fail rate) exists in the repo to baseline — absent data, not zero.
- Non-mechanical standards (labelled-data import pattern `({a, b}) => {}`, verb-named functions, "file structure reflects the call stack", minimal-data invocation) were not audited line-by-line; only the file+folder collision check in §4.4 relates.
- Whether freeze-list file growth (§4.4) is new responsibility or rewiring was not determined.
- Node runtime used for gates was v26.4.0 while `.nvmrc`/`.node-version` pin 24; gates passed regardless.

## Appendix — commands run (all from repo root unless noted)

`npm ci` (root, `api/`, `frontend/`); `npm run check:one-function`; `npm run check:jsdoc-example`; `npm run docs:check`; `npm run lint`; `npm run test:unit`; `npm run depcheck`; `npm run build`; `npx knip` (failed, config schema); `./Security_scans.sh` (Trivy done, Semgrep in progress); `git log --since=2026-10-26 / 2026-11-02 --name-only` churn mining; `wc -l` size surveys; custom shingle/density scripts (scratchpad only, not committed).
