# AUDIT — Post-hackathon codebase audit (KainBain rewrite)

- **Audit date:** 2026-11-12 ~09:00 UTC
- **Branch:** `kb/b8c9bb8e-ec2c-4296-9580-6d70ed161526` (working tree = `main` tip `b8f81ea`)
- **Auditor:** Audit stage agent (this task)
- **Deliverable:** this file, `docs/tasks/b8c9bb8e-ec2c-4296-9580-6d70ed161526/AUDIT.md`
- **Focus per task instructions:** collect findings and missing data only. §§0–6 deliberately contain **no recommendations**; they record what was measured, what passed/failed, and what could not be verified. §§7–9 are the only recommendation-bearing parts (they record the FEEDBACK_SURVEY answers and the proposals those answers select); all other prioritization is left to peer review / follow-up tasks.

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

(Churn counts are ref-dependent — mined on `main` at audit time; re-running on the current task branch shifts absolute numbers by ~10–25% without changing the ranking.)

### 4.3 Branch-density hotspots (window-changed files; branches per 100 code lines)

`api/flow/curateRunnerPrompt.js` 58.2 (32 branches/55 lines), `api/flow/runnerAssignmentSummary.js` 51.0 (53/104), `api/work/resolveAttestationStage.js` 41.2, `frontend/.../review/reportAnchors.js` 36.6, `api/flow/dispatch/normalizeCapabilities.js` 33.2, `frontend/.../layout/activeTaskVisibility.js` 32.7, `api/flow/scheduler/startScheduler.js` 31.4, `scripts/generate-build-info.mjs` 31.3, `api/flow/scheduler/compareCentralQueueCandidates.js` 29.9, `shared/stageAttestation/formatAttestationToken.js` 29.7, `api/flow/dispatch/runnerMatches.js` 29.6, `scripts/detect-changed-components.mjs` 29.6, `frontend/.../tasks/logEntryModel.js` 29.5, `runner/impromptu.js` 29.3, `taskRetryState/isRetryInProgress.js` 29.2, `api/flow/scheduler/getScheduledQueue.js` 29.1, `api/routes/imageGen.js` 29.1, `api/work/taskWorkRoutes.js` 27.9 (199 branches/712 lines), `shared/survey.js` 27.9 (252/902), `api/flow/runnerRoutes.js` 25.5 (279/1,092).

### 4.4 Standards compliance checks (recent changes vs `docs/KB Code Standards.md` + `docs/ARCHITECTURE_DOMAINS.md`)

- **Cross-domain imports bypassing the domain `index.js`** (rule: outside a domain, import through its `index.js`): **19 instances**, e.g. `api/work/resolveAttestationStage.js` → `../flow/stageResolution.js`; `api/work/taskWorkRoutes.js` → `../flow/taskScheduler.js`; `api/work/taskPersistence.js` → `../watch/reliabilityShared.js` and `../flow/taskScheduler.js`; `api/work/resolveEngineState.js` → `../flow/stageResolution.js`, `../flow/circuitBreaker.js`; `api/work/countOpenTasksGlobal.js` → `../flow/scheduler/isWaitingForPickup.js`; `api/flow/taskControl.js`, `api/flow/commandStages.js` (3 imports), `api/flow/stageTransitions.js` → `../work/taskBranches.js` etc.; `api/flow/runnerRoutes.js` → `../work/resolveAttestationStage.js`; `api/watch/observabilityMetrics.js` → `../work/gitLock.js`; `api/auth/{apiKeyStore,sessionStore,userStore,accessConfig}.js` → `../house/fileWriting.js`.
- **Freeze-list files grew during the window** (`ARCHITECTURE_DOMAINS.md` freeze: `taskStore.js`, `WorkflowCanvas.jsx`, `TaskDetailOverlay.jsx`, `KainBainContext.jsx`, `services/api.js`): `api/taskStore.js` 1,069→1,094 (+25), `api/projectStore.js` 2,278→2,344 (+66), `WorkflowCanvas.jsx` 577→671 (+94), `KainBainContext.jsx` 499→539 (+40), `services/api.js` 137→139 (+2), `TaskDetailOverlay.jsx` 1→1. Whether the growth is new responsibility vs rewiring is not determined here (missing data).
- **New class added in the window (peer-review addition):** `api/flow/impromptuStore.js` (added 2026-11-06, commit `798d129`, 648 lines) declares `export class ImpromptuStore` at line 129. The standards allow classes only for the documented `taskStore.js` / `projectStore.js` facades; this one has a co-located test (`impromptuStore.test.js`) and good `MARK:` coverage (18), but it is not recorded as an allowed class in `ARCHITECTURE_DOMAINS.md` or `AGENTS-MAP.md`.
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

## 7. Feedback resolutions (FEEDBACK_SURVEY.md Round 1, answered 2026-11-12)

This section records what the survey answers decide. It is the only
recommendation-bearing part of this document; §§0–6 remain findings-only.
Verified against the current tree on 2026-11-12 (Node v26.4.0) unless noted.

### 7.1 Q1 — breakdown proposals first (all four selected)

The next stage must turn **all four** hotspot groups into concrete breakdown
proposals, in this order (agent read-budget impact first):

1. `runner/` — daemon, routes, registry, scheduler.
2. `api/` — config/schema, commandStages, executeStage.
3. Agent-facing docs/maps before code (unblocks the other two).
4. Frontend largest components/pages.

Proposal sketches live in §8. They are docs/maps/tests-only sketches (see
§7.7): seam names, target homes, and characterization-test notes — no code
moved in this task.

### 7.2 Q2 — only one blocker, rest is backlog

- **Blocker:** new source files with no co-located tests. Re-verified:
  `api/imageGen/surveyImages.js` **does** have `surveyImages.test.js` (27
  tests), so the §4.1 size finding is not a coverage blocker; the blocker
  population is the §4.4 tail — 96 new files without same-basename tests, of
  which 15 are referenced by no test file at all (`api/auth/rbac.js`,
  `claimEligibleRunner.js`, `effectiveRunnerModels.js`,
  `canary-e2e/global-teardown.js`, 4 onboarding helpers, `ReportLineRow.jsx`,
  `FailureMessageImage.jsx`, 3 `useTaskInspectorResize/*` helpers,
  `unauthorizedEvent.js`, `scripts/refresh-accessibility-results.mjs`).
  Next stage: add characterization tests for the 15 unreferenced files first,
  then work through the remaining 81 by churn order.
- **Backlog (explicitly not blockers):** the 19 cross-domain imports bypassing
  domain `index.js` (§4.4, rule confirmed in `docs/ARCHITECTURE_DOMAINS.md`:
  "Outside a new backend domain, import through its `index.js`"); freeze-list
  file growth (`api/taskStore.js` +25, `api/projectStore.js` +66,
  `WorkflowCanvas.jsx` +94, `KainBainContext.jsx` +40, `services/api.js` +2 —
  growth confirmed, responsibility-vs-rewiring still undetermined per §6);
  pattern-name mentions (~19 added lines matching `factory|singleton|barrel`,
  e.g. `api/work/index.js` "MARK: work barrel", `api/push/index.js` "push
  singleton"). Log all three as backlog items with file/line pointers; do not
  gate merges on them.

### 7.3 Q3 — top-level docs are canonical

Decision: **`docs/KB Code Standards.md` (and `docs/KB Architecture.md`) are
canonical; `docs/agent-docs/*` vendored copies get reconciled.**
Re-verified 2026-11-12: `diff` of the standards pair is 227 lines (228 at
audit time — same divergence modulo line counting); the vendored copy lacks
the `MARK`/`@description`/`@example` and plain-language rules the WP-8 gates
enforce, while `agents.md` (2026-11-04) still instructs agents to treat the
vendored copies as source of truth. Next stage (docs-only): reconcile the
vendored copies from the top-level files byte-for-byte (plus a vendoring
header), or replace the `agents.md` source-of-truth pointer — do not delete
either file in this task and do not leave both divergent.

### 7.4 Q4 — size-rule enforcement is forward-only

Decision: **only enforce on future files.** `api/imageGen/surveyImages.js`
(879 lines, added 2026-11-02, commit `015104a`) exceeds the 800-line hard
review-rejection line with no documented exception in `docs/`,
`AGENTS-MAP.md`, or `CHANGELOG.md` — re-searched 2026-11-12, still none —
but per this answer it is **grandfathered backlog**, not a merge blocker and
not remediated in this task. Its JSDoc coverage is good (12 `MARK:` for 12
exports: `SURVEY_IMAGE_CAP`, `IMAGE_GEN_DISABLED`, `imageGenRequestedBy`,
`resolveImageGenProvider`, `surveyImageFileName`, `ensureSurveyImages`,
`kickSurveyImageJob`, `reportSurveyImagesToTask`, `chosenSurveyImageFileName`,
`upsertChosenDesignsSection`, `persistChosenSurveyImages`) and it has a
co-located test, so the split proposal (§8) is tracked debt. Same treatment
for the 400-line soft-line newcomers (`api/auth/routes.js` 746,
`shared/accessibilityStatement.js` 717, `runner/harnessModelDiscovery.js`
712, `api/flow/impromptuStore.js` 648, `api/imageGen/providers.js` 456).
Future new files over 800 lines require a documented exception before merge.

### 7.5 Q5 — stabilize tests as-is, then refactor

Decision: **stabilize the oversized test helpers first; split production code
only after.** Re-verified sizes: `runner/daemon.test.js` 2,643 lines
(≈2,509-line `stubClient` helper at audit time), `api/flow/runnerRoutes.test.js`
2,039 lines (≈1,985-line `findTaskMarkdown`), `api/flow/commandStages.test.js`
2,050 lines (≈1,895-line `baseStage`). Next stage: keep these suites green
unchanged (they pass — §2: 11,721 unit tests green), add characterization
coverage for the 15 unreferenced files (§7.2), and only then extract
production seams with the existing suites as the safety net. No
production+test co-refactor in one step.

### 7.6 Q6 — evidence gaps to close (three selected, one declined)

Close these before declaring the audit complete:

1. **Fix knip and run the dead-export check.** Re-verified 2026-11-12:
   `.knip.json` still uses arrays under `workspaces` (`.`, `api`,
   `frontend`, `canary-e2e`), which knip 6.45.1 rejects, and knip is still
   unpinned. Rewrite config to the installed knip's object schema (or pin
   knip to the version the config targets), then record the dead-export
   list — rewrite leftovers are otherwise unmeasured.
2. **Reduce or justify lint warnings.** Baseline stands: `npm run lint`
   exits 0 with 0 errors, 498 api-pass + 215 frontend-pass warnings,
   dominated by `security/detect-*` and unused eslint-disable directives.
   Next stage triages by rule (justify the `security/detect-*` class where
   inputs are trusted, remove dead disables), not a blind warning-count
   campaign.
3. **Run canary E2E or the full `npm test` gate.** This audit ran only
   `test:unit`; canary/full-gate status is still unverified.
4. **Declined:** aligning tooling to the pinned Node version. Gates were run
   on Node v26.4.0 vs `.nvmrc`/`.node-version` pin 24 and passed; no
   re-run on 24 is required by this survey.

### 7.7 Q7 — scope and risk boundary for later implementation

Decision: **report plus docs/maps/tests only; no behavior changes.**
This task stays report-only in effect: the follow-up may update
`AGENTS-MAP.md`, `docs/agent-docs/*` reconciliation, `ARCHITECTURE_DOMAINS.md`
notes, JSDoc/`MARK:`/`@example` additions, and new characterization tests —
all green-gated. No production splits, no behavior changes, no larger
restructuring in this task even if gates pass. Execution-stage proposals in
§8 are therefore sized as follow-up tasks, each with its own green gate.

## 8. Concrete breakdown proposals (from Q1 order; docs/tests-only sketches)

Conventions: each proposal names the seam to extract, the target home
(caller-named folder per KB co-location value), and the characterization
test that must exist first. No code is moved here.

### 8.1 `runner/` first (2,530-line daemon is the #1 churn × size overlap, 65 changes since 2026-10-26 / 24 in 10 days)

- `runner/daemon.js` (2,530 lines; verified exports cluster):
  harness-probing seam (lines ~126–500: `isRunnableFile`,
  `firstExecutableDirFor`, `probeHarnessVersions`, `harnessProbeContext`,
  `harnessProbeDirsFor`, `detectAvailableHarnesses`, `findUnconfiguredHarnesses`,
  `describeUnconfiguredHarnessHint`, `resolveHarnessConfig`,
  `refreshDiscoveredModels`) → `runner/daemon/harnessProbe.*`;
  claim-renewal seam (`startClaimRenewal`, `CLAIM_HEARTBEAT_MS`) →
  `runner/daemon/claimRenewal.*`; dispatch-loop seam (`runDispatchLoop` 217,
  `executeAssignment` 527, `executeIntegrationAssignment` 187) →
  `runner/daemon/dispatchLoop.*` + `runner/daemon/executeAssignment.*`.
  Characterization net: existing `runner/daemon.test.js` stays green as-is
  (§7.5); new tests pin probe/dir-resolution edge cases before any move.
- `api/flow/runnerRoutes.js` (1,521 lines; `registerRunnerRoutes` ≈1,309-line
  span — the export at line 213; three small helper exports also sit at lines
  50, 101, 151):
  split by route group into `api/flow/runnerRoutes/<group>.js` (registration,
  assignment/claim, status/history, dispatch-match read paths), keeping one
  thin `registerRunnerRoutes` that only wires group registrars. Net:
  `runnerRoutes.test.js` green as-is first; add per-group characterization
  tests around `runnerMatches.js` (branch density 29.6, churn 11–20).
- `api/flow/runnerRegistry.js` (1,052 lines; `resolveRunnerStatePath` ~855
  span) → extract path-resolution seam to
  `api/flow/runnerRegistry/resolveRunnerStatePath.js`. Scheduler pair
  (`startScheduler.js` density 31.4, `compareCentralQueueCandidates.js` 29.9,
  `getScheduledQueue.js` 29.1) → one file per scheduler step under
  `api/flow/scheduler/`, no shared-state extraction in this task.

### 8.2 `api/` config / stages (second)

- `api/config/schema.js` (2,328 lines; exports: `FRONTEND_CHAT_TIMEOUT_MS`,
  `CONFIG_GROUPS`, `ConfigError`, `parseTypedValue`, `CONFIG_SCHEMA`,
  `loadConfig`, `checkCiStallCoherence`, `checkTimeoutPairing`, path exports):
  split `CONFIG_SCHEMA` entries by `CONFIG_GROUPS` section into
  `api/config/schema/<section>.js` with `schema.js` as the concatenating
  surface; `loadConfig` + validators stay until characterization tests pin
  them (config churn: 23 changes / 12 in 10 days; `config.test.js` churn 20/11
  is the net).
- `api/flow/execution/executeStage.js` (1,334 lines; single exported
  `executeStage`, ~1,233-line span; stage-type dispatch at ~line 146,
  command-stage runtime at ~557, timeout resolution at ~860, report content
  at ~1052) → phase splits under `api/flow/execution/executeStage/`:
  normalize/dispatch, command-runtime resolution, timeout, report-content.
  `api/flow/commandStages.js` (2,173 lines; test helper `baseStage` 1,895
  lines) follows the same phase seams only after `commandStages.test.js` is
  stabilized green (§7.5).

### 8.3 Agent-facing docs/maps before code (third in build order, first enabler)

- Reconcile `docs/agent-docs/KB-Code-Standards.md` from canonical
  `docs/KB Code Standards.md` (and architecture pair likewise); fix the
  `agents.md` source-of-truth pointer consistently.
- Refresh `AGENTS-MAP.md` numbers to tree truth (`WorkflowCanvas.jsx` 671,
  `KainBainContext.jsx` 539, `api/taskStore.js` 1,094, `api/projectStore.js`
  2,344, `services/api.js` 139, `api/routes/tasks.js` 53, `api/git.js` 99)
  and add the missing ownership rows: `runner/` (39 files / 14.5k lines),
  `canary-e2e/`, root shell scripts (`deploy.sh` 1,878 lines et al.).
- Record the `docs/TASK_DIRECTORY_HYGIENE.md` vs `.gitignore` drift (672 files
  under 58 task dirs tracked in-repo) as a hygiene backlog item, not a silent
  fix.

### 8.4 Frontend largest components/pages (fourth)

- `TaskDetailPageContent.jsx` (1,290 lines; `TaskDetailPage` ~1,236-line span,
  single export at line 54): extract by rendered section
  (`TaskDetailPage/<Section>.jsx` — header, stages, history, overlays),
  keeping data hooks (`useTaskInspectorResize` + its 4-file subfolder —
  resolve the §4.4 file+folder collision by moving the 186-line parent body
  into the subfolder or renaming) in place first.
- `TaskDetailOverlayContent.jsx` (1,071), `ObservabilityDashboard.jsx`
  (1,143), `ModelAliasesSection.jsx` (1,439), `TaskCard.jsx` (1,019),
  `RunnerConfigurationSection.jsx` (1,018, churn 22/15), `StageSkillsPanel.jsx`
  (1,052): same section-split treatment, ordered by churn (RunnerConfiguration
  first). `SurveyPage.jsx` (956, churn 14 in 10 days) likewise.
- High branch-density frontend files (`review/reportAnchors.js` 36.6,
  `layout/activeTaskVisibility.js` 32.7, `tasks/logEntryModel.js` 29.5) get
  characterization tests before any split; `shared/survey.js` (27.9, 252
  branches/902 lines) is tested at the shared level, not duplicated per page.

## 9. Sequencing for the follow-up (combines Q5 + Q6 + Q7)

1. Docs/maps reconciliation (§8.3) — no code, unblocks agent orientation.
2. Stabilize suites as-is + characterization tests for the 15 unreferenced
   files (§7.2) — the only blocker class.
3. Fix knip config, run dead-export check; triage lint warnings by rule;
   run canary or full `npm test` (§7.6).
4. Execute §8.1 → §8.2 → §8.4 splits as separate follow-up tasks, each small,
   each green-gated, each with its §8 characterization net in place first.
   Freeze-list files and cross-domain imports stay backlog until a split
   proposal explicitly touches them with a documented rationale.

## Appendix — commands run (all from repo root unless noted)

`npm ci` (root, `api/`, `frontend/`); `npm run check:one-function`; `npm run check:jsdoc-example`; `npm run docs:check`; `npm run lint`; `npm run test:unit`; `npm run depcheck`; `npm run build`; `npx knip` (failed, config schema); `./Security_scans.sh` (Trivy done, Semgrep in progress); `git log --since=2026-10-26 / 2026-11-02 --name-only` churn mining; `wc -l` size surveys; custom shingle/density scripts (scratchpad only, not committed).

Feedback-stage re-verification (2026-11-12, §§7–8): `wc -l` on
`runner/daemon.js`, `runnerRoutes.js`, `schema.js`, `agentGuide.js`,
`executeStage.js`, `daemon.test.js`, `runnerRoutes.test.js`,
`commandStages.test.js`, `TaskDetailPageContent.jsx`, `TaskCard.jsx`,
`surveyImages.js`; `grep` export/`MARK:`/route-registration structure surveys;
`diff` of the standards pair (227 lines); `agents.md` source-of-truth header;
`.knip.json` schema check; `ARCHITECTURE_DOMAINS.md` import-rule quote;
`AGENTS-MAP.md` ownership-gap grep; `surveyImages.js` exception re-search in
`docs/`/`AGENTS-MAP.md`/`CHANGELOG.md` (none found); `api/imageGen/` co-located
test listing.
