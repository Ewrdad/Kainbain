# DELIVERABLES — post-hackathon refactor and agent-velocity plan

Source: `docs/tasks/b8c9bb8e-ec2c-4296-9580-6d70ed161526/AUDIT.md` + `FEEDBACK_SURVEY.md`
Answers (2026-11-12). Scope boundary: per `AUDIT.md` §7.7, **this task is
report/docs/maps/tests only; no production behaviour changes.** Production
splits are sized here as gated follow-up tasks, each with its own green gate
before any code moves.

This document turns the audit findings into ticketable work packages. It does
not move, rename, or delete any task directory or production code.

## 0. How to use this file

- Each `WP-nn` is a **whole step**: one accountable owner, one green gate at the
  end, one changelog-worthy outcome.
- Work packages are ordered by `(interest × risk ÷ effort)` in the style of the
  audit's SQALE scoring. **Structural blockers first, config and polish last**
  ("make change easy, then make the change").
- `Depends on` lists only hard blockers. Items with `none` may run in parallel
  within their phase.
- `Required knowledge` lists the files/symbols an implementer must read before
  editing. Read those first; do not start by reading a god file whole.
- `Deliverable` is the concrete artifact a reviewer checks.
- `Done when` is the gate that must pass.

## 1. Scope and risk boundary

In scope for this task family:

- Agent-facing docs/maps reconciliation.
- Registry, freshness, and evidence-gap closure (knip, lint triage, canary/full
  unit gate).
- Characterization tests for the untested and high-risk files named in the
  audit.
- Split proposals with seam names and target homes (no code moved yet).

Explicitly **out of scope** for this task (backlog, gated by a later task):

- Moving production code seams (all `WP-08..WP-19` code changes).
- Changing behaviour, API contracts, or stored task state.
- Remediating grandfathered oversized files beyond tracking them
  (`api/imageGen/surveyImages.js`, `api/auth/routes.js`,
  `shared/accessibilityStatement.js`, `runner/harnessModelDiscovery.js`,
  `api/flow/impromptuStore.js`, `api/imageGen/providers.js`).
- Resolving freeze-list file growth beyond documenting the open question.
- Aligning tooling to the pinned Node version (declined in `FEEDBACK_SURVEY.md`
  Q6).

## 2. Global prerequisites (read once)

- `docs/KB Code Standards.md` (canonical; see WP-01).
- `docs/ARCHITECTURE_DOMAINS.md` — domain table, import rule, freeze list,
  size warnings.
- `AGENTS-MAP.md` — ownership roster and god-file seams.
- `docs/TASK_DIRECTORY_HYGIENE.md` — do not move/rename/delete task dirs.
- Gate commands: `npm run test:unit`, `npm run docs:check`,
  `npm run check:one-function`, `npm run check:jsdoc-example`, `npm run lint`,
  `npm run depcheck`, `npm run build`.

## 3. Phase plan

| Phase | Theme | Goal |
| --- | --- | --- |
| 0 | Evidence closure | Make the audit's unverified gaps measured and recorded |
| 1 | Agent orientation | Make the maps match the tree; one canonical standards source |
| 2 | Safety nets | Stabilize oversized tests; cover the only blocker class (untested new files) |
| 3 | Structural splits (runner) | Reduce the #1 churn × size hotspot |
| 4 | Structural splits (api) | Split config and the two largest stage-execution files |
| 5 | Structural splits (frontend) | Split the largest components/pages by rendered section |
| 6 | Backlog triage | Cross-domain imports, freeze growth, pattern names, collisions, grandfathered files |

## 4. Phase 0 — evidence closure

### WP-01: Fix knip config and run the dead-export check

- **Depends on:** none
- **Risk:** low (config-only)
- **Required knowledge:**
  - `.knip.json` (`workspaces` currently arrays)
  - Installed knip version (6.45.1) schema expectations
  - `package.json` scripts; `api/`, `frontend/`, `canary-e2e/` workspaces
- **Work:** Rewrite `.knip.json` to the installed knip object schema or pin
  knip to the version the config targets. Run `npx knip`, capture the
  dead-export list. No deletions in this task; record only.
- **Deliverable:** config diff + `docs/tasks/.../knip-dead-exports-<date>.md`
  (or equivalent recorded appendix) with the list.
- **Done when:** `npx knip` exits 0 and produces a report; the report is
  committed/recorded.

### WP-02: Triage lint warnings by rule

- **Depends on:** none
- **Risk:** low (justification + removal of dead disables only)
- **Required knowledge:**
  - Current baseline: 498 api-pass + 215 frontend-pass warnings
  - Dominant rules: `security/detect-non-literal-fs-filename`,
    `security/detect-object-injection`, `security/detect-unsafe-regex`,
    unused eslint-disable directives
- **Work:** Group warnings by rule. Justify the `security/detect-*` class where
  inputs are trusted; remove unused eslint-disable directives; record
  remaining warnings as deliberate with file/line pointers. No blind
  warning-count campaign.
- **Deliverable:** `docs/tasks/.../lint-triage-<date>.md` + scoped code edits
  removing dead disables only.
- **Done when:** `npm run lint` exits 0; the documented justification covers every
  remaining warning or it has been removed.

### WP-03: Run canary E2E / full `npm test` once and record status

- **Depends on:** WP-01 and WP-02 recommended (not required) so the record is
  clean
- **Risk:** low (verification only)
- **Required knowledge:** `npm test`, `KAINBAIN_SKIP_CANARY`, canary-e2e/ layout
- **Work:** Run the full gate (or `npm test -- --no-canary` only if E2E infra is
  unavailable, recording why). Capture pass/fail counts and any flaky/new failures.
- **Deliverable:** a recorded gate run (`docs/tasks/.../full-gate-<date>.md`).
- **Done when:** a full or reduced gate result is recorded with rationale.

## 5. Phase 1 — agent orientation (docs/maps)

### WP-04: Reconcile canonical standards docs

- **Depends on:** none
- **Risk:** low (docs-only)
- **Required knowledge:**
  - `docs/KB Code Standards.md` (canonical top-level)
  - `docs/KB Architecture.md` (canonical top-level)
  - `docs/agent-docs/KB-Code-Standards.md` (vendored, divergent by ~227 lines)
  - `docs/agent-docs/KB-Architecture.md` (vendored, divergent)
  - `agents.md` (points agents at vendored copies as source of truth)
- **Work:** Propagate the top-level canonical files into the vendored copies
  byte-for-byte with a vendoring header, or replace the `agents.md`
  source-of-truth pointer consistently. Do not delete either file in this task.
- **Deliverable:** reconciled standards pair + consistent pointer.
- **Done when:** `diff` of each canonical/vendored pair is empty (aside from the
  vendoring header) and `agents.md` names the chosen canonical source.

### WP-05: Refresh AGENTS-MAP line counts and ownership roster

- **Depends on:** WP-04 (run after, so one orientation pass)
- **Risk:** low (docs-only)
- **Required knowledge:**
  - `AGENTS-MAP.md`
  - Actual lines: `WorkflowCanvas.jsx` 671; `KainBainContext.jsx` 539;
    `api/taskStore.js` 1,094; `api/projectStore.js` 2,344; `services/api.js` 139;
    `api/routes/tasks.js` 53; `api/git.js` 99
  - Missing ownership rows: `runner/` (39 files, 14.5k lines),
    `canary-e2e/`, root shell scripts (`deploy.sh` 1,878 lines, `publish.sh` 454,
    `startRunner.sh` 184, `Security_scans.sh` 335), plus an explicit note for
    `api/index.js` (492 lines) vs the "wiring only" description
- **Work:** Update every god-file line count to tree truth; add the missing rows;
  keep entry-point seams and no-split decisions accurate.
- **Deliverable:** refreshed `AGENTS-MAP.md`.
- **Done when:** a spot-check of 10 listed paths matches `wc -l` and the named
  gaps (runner/, canary-e2e/, root scripts) have owner rows or an explicit
  "unowned/unassigned" note.

### WP-06: Record task-directory hygiene drift as backlog

- **Depends on:** none
- **Risk:** low (documentation only; no moves/renames/deletes)
- **Required knowledge:**
  - `docs/TASK_DIRECTORY_HYGIENE.md` scope note (2026-10-26)
  - `.gitignore` comments (2026-11-11)
  - 672 files under 58 task dirs currently tracked in-repo
- **Work:** Add an explicit backlog entry describing the drift between the
  hygiene doc and `.gitignore`; decide later, silently neither fix it nor pretend
  it is resolved.
- **Deliverable:** a numbered backlog item in the task directory with the count
  and both source references.
- **Done when:** the drift is recorded with file/line pointers; no task directory
  has been moved, renamed, or deleted.

## 6. Phase 2 — safety nets (the only blocker class + oversized tests)

### WP-07: Stabilise oversized test helpers as-is

- **Depends on:** none (must precede any split in the affected areas)
- **Risk:** medium (test-only characterization)
- **Required knowledge:**
  - `runner/daemon.test.js` (~2,643 lines; `stubClient` ~2,509)
  - `api/flow/runnerRoutes.test.js` (~2,039 lines; `findTaskMarkdown` ~1,985)
  - `api/flow/commandStages.test.js` (~2,050 lines; `baseStage` ~1,895)
  - `FEEDBACK_SURVEY.md` Q5 = "stabilize tests as-is, then refactor"
- **Work:** Keep suites green unchanged. Add extraction-friendly seams AROUND the
  helpers (named fixture factories, data modules) without changing asserted
  behaviour; do not split production code in this task. Confirm all 11,721 unit
  tests stay green.
- **Deliverable:** refactored test modules with behaviour-preserving diffs and a
  green `npm run test:unit`.
- **Done when:** `runner/daemon.test.js`, `runnerRoutes.test.js`, and
  `commandStages.test.js` still pass with identical assertion outcomes and no
  production files changed.

### WP-08: Characterization tests for the 15 untested new files

- **Depends on:** WP-07 recommended for the runner/route-adjacent files; none
  for pure helpers
- **Risk:** medium (new tests only)
- **Required knowledge:** audit §4.4 / §7.2 lists:
  - `api/auth/rbac.js`
  - `api/flow/dispatch/runnerMatches/claimEligibleRunner.js`
  - `api/flow/dispatch/runnerMatches/effectiveRunnerModels.js`
  - `canary-e2e/global-teardown.js`
  - `frontend/src/.../onboarding/{onboardingEvents,openAdoptProjectDialog,openCreateProjectDialog,writeOnboardingDismissed}.js`
  - `frontend/src/components/review/ReportLineRow.jsx`
  - `frontend/src/components/tasks/FailureMessageImage.jsx`
  - `frontend/src/components/tasks/hooks/useTaskInspectorResize/{clampToRange,defaultTaskInspectorWidth,widthFromPreference}.js`
  - `frontend/src/services/auth/unauthorizedEvent.js`
  - `scripts/refresh-accessibility-results.mjs`
- **Work:** Add the lowest-level characterization tests for each file (unit for
  pure helpers; component for React). Tests pin current behaviour, including
  defaults and boundary values. No behaviour changes.
- **Deliverable:** 15 (or grouped) co-located test files.
- **Done when:** `npm run test:unit` green and each of the 15 files has at least
  one co-located test referencing it.

### WP-09: Characterization tests for other high-risk surfaces

- **Depends on:** none
- **Risk:** medium
- **Required knowledge:**
  - High branch density: `api/flow/curateRunnerPrompt.js` (58.2),
    `api/flow/runnerAssignmentSummary.js` (51.0),
    `api/work/resolveAttestationStage.js` (41.2),
    `api/flow/taskWorkRoutes.js` (27.9), `shared/survey.js` (27.9)
  - Frontend: `review/reportAnchors.js` (36.6),
    `layout/activeTaskVisibility.js` (32.7), `tasks/logEntryModel.js` (29.5)
  - `shared/stageAttestation/formatAttestationToken.js` (29.7)
- **Work:** Add branch-covering characterization tests for the listed files
  before any split. For `shared/survey.js`, test at the shared level once
  rather than per page.
- **Deliverable:** co-located tests pinning branches.
- **Done when:** added tests pass and any split-affected module in Phases 3–5
  has a documented safety net.

## 7. Phase 3 — runner structural splits (highest interest × size)

Target: `runner/daemon.js` (2,530 lines, 65 changes since 2026-10-26),
`api/flow/runnerRoutes.js` (1,521 lines, `registerRunnerRoutes` ~1,309-line
span), `api/flow/runnerRegistry.js` (~855-line `resolveRunnerStatePath`),
and scheduler pair.

### WP-10: Extract harness-probing seam in `runner/daemon.js`

- **Depends on:** WP-07 (daemon test stabilised), WP-08 (probe helpers covered)
- **Risk:** medium
- **Required knowledge:**
  - `runner/daemon.js` lines ~126–500:
    `isRunnableFile`, `firstExecutableDirFor`, `probeHarnessVersions`,
    `harnessProbeContext`, `harnessProbeDirsFor`, `detectAvailableHarnesses`,
    `findUnconfiguredHarnesses`, `describeUnconfiguredHarnessHint`,
    `resolveHarnessConfig`, `refreshDiscoveredModels`
  - Exports/target: `runner/daemon/harnessProbe.*`
- **Work:** Extract the harness-probing helpers into `runner/daemon/harnessProbe.js`
  (or grouped under `runner/daemon/`), leaving `daemon.js` as a thin orchestrator.
  Fowler operation: Extract Module. Keep imports through the caller-named folder.
- **Deliverable:** new module + green `runner/daemon.test.js`.
- **Done when:** probe tests pass, daemon imports the seam, no behaviour change.

### WP-11: Extract claim-renewal and dispatch-loop seams in `runner/daemon.js`

- **Depends on:** WP-10
- **Risk:** medium/high
- **Required knowledge:**
  - `startClaimRenewal`, `CLAIM_HEARTBEAT_MS`,
    `runDispatchLoop` (217 lines), `executeAssignment` (527 lines),
    `executeIntegrationAssignment` (187 lines)
  - Targets: `runner/daemon/claimRenewal.*`,
    `runner/daemon/dispatchLoop.*`, `runner/daemon/executeAssignment.*`
- **Work:** Move each seam to its own file under `runner/daemon/`. Keep one
  orchestrator entry point. Extract Function/Module, not rewrites.
- **Deliverable:** three seam modules + green daemon tests.
- **Done when:** all three seams import cleanly and the dispatch tests pass.

### WP-12: Split `api/flow/runnerRoutes.js` by route group

- **Depends on:** WP-07, WP-08 (runnerMatches coverage)
- **Risk:** medium
- **Required knowledge:**
  - `api/flow/runnerRoutes.js`: `registerRunnerRoutes` (line ~213, ~1,309-line
    span); helpers at lines ~50, ~101, ~151
  - Route groups: registration, assignment/claim, status/history,
    dispatch-match read paths
  - `api/flow/dispatch/runnerMatches.js` (branch density 29.6, churn 11–20)
    and its subfolder `runnerMatches/` (`claimEligibleRunner.js`,
    `effectiveRunnerModels.js`)
  - Target: `api/flow/runnerRoutes/<group>.js` + thin registrar
- **Work:** Move each route group into its own module; keep one thin
  `registerRunnerRoutes` that only wires group registrars. Resolve the
  `runnerMatches.js` vs `runnerMatches/` file+folder collision (§7 Phase 6)
  by placing the 114-line parent body into the subfolder or renaming — do not
  leave both as real logic.
- **Deliverable:** route-group modules + collision resolution + green
  `runnerRoutes.test.js`.
- **Done when:** tests pass and no route registration behaviour changed.

### WP-13: Extract `resolveRunnerStatePath` and split the scheduler

- **Depends on:** WP-12 recommended (shared runner area)
- **Risk:** medium
- **Required knowledge:**
  - `api/flow/runnerRegistry.js` (~1,052 lines; `resolveRunnerStatePath` ~855)
  - `api/flow/scheduler/startScheduler.js` (density 31.4),
    `compareCentralQueueCandidates.js` (29.9),
    `getScheduledQueue.js` (29.1)
  - Targets: `api/flow/runnerRegistry/resolveRunnerStatePath.js` and
    one module per scheduler step under `api/flow/scheduler/`
- **Work:** Extract path resolution; split scheduler steps. No shared-state
  extraction in this task.
- **Deliverable:** new modules + green registry/scheduler tests.
- **Done when:** `resolveRunnerStatePath` lives in its own file and scheduler
  tests pass.

## 8. Phase 4 — api config / stages

### WP-14: Split `api/config/schema.js` by CONFIG_GROUPS section

- **Depends on:** WP-09 (config tests hardened)
- **Risk:** medium
- **Required knowledge:**
  - `api/config/schema.js` (2,328 lines; exports `FRONTEND_CHAT_TIMEOUT_MS`,
    `CONFIG_GROUPS`, `ConfigError`, `parseTypedValue`, `CONFIG_SCHEMA`,
    `loadConfig`, `checkCiStallCoherence`, `checkTimeoutPairing`, path exports)
  - `api/config/config.test.js` (churn 20/11)
  - Config churn: 23 changes / 12 in 10 days
  - Targets: `api/config/schema/<section>.js` with `schema.js` as the
    concatenating surface; `loadConfig` + validators stay until pinned
- **Work:** Split `CONFIG_SCHEMA` entries by `CONFIG_GROUPS` section. Keep
  `loadConfig` and validators in place first (characterization), then move.
- **Deliverable:** section modules + green `config.test.js`.
- **Done when:** all exported names remain available (surface byte-identical)
  and tests pass.

### WP-15: Split `executeStage` by lifecycle phase

- **Depends on:** WP-07, WP-09
- **Risk:** medium/high
- **Required knowledge:**
  - `api/flow/execution/executeStage.js` (1,334 lines; single `executeStage`,
    ~1,233-line span)
  - Phase split markers: stage-type dispatch ~146, command-stage runtime ~557,
    timeout resolution ~860, report content ~1052
  - Targets: `api/flow/execution/executeStage/{normalize,commandRuntime,timeout,report}.js`
- **Work:** Split by phase using Extract Module / Split Phase. Keep one public
  `executeStage` entry point.
- **Deliverable:** phase modules + green execution tests.
- **Done when:** behaviour unchanged and stage execution suites green.

### WP-16: Split `commandStages.js` after stabilization

- **Depends on:** WP-07 (baseStage helper stabilised), WP-15
- **Risk:** medium/high
- **Required knowledge:**
  - `api/flow/commandStages.js` (2,173 lines; helper `baseStage` 1,895 lines)
  - `commandStages.test.js` (~2,050 lines)
- **Work:** Apply the same phase seams (dispatch, runtime, timeout, report)
  to command stages, only after WP-15 proves the pattern and WP-07 pins the
  test helper.
- **Deliverable:** split command-stage modules + green tests.
- **Done when:** `commandStages.test.js` green and no contract change.

## 9. Phase 5 — frontend structural splits

### WP-17: Split `TaskDetailPageContent.jsx` by rendered section

- **Depends on:** WP-08 (useTaskInspectorResize collision helpers covered)
- **Risk:** medium
- **Required knowledge:**
  - `TaskDetailPageContent.jsx` (1,290 lines; `TaskDetailPage` ~1,236-line span)
  - Data hook collision: `useTaskInspectorResize.js` (186 lines) vs
    `useTaskInspectorResize/` (4 files incl. `clampToRange`,
    `defaultTaskInspectorWidth`, `widthFromPreference`)
  - Target: `TaskDetailPage/<Section>.jsx` plus move the 186-line parent body
    into the subfolder or rename to resolve the collision
- **Work:** Extract by rendered section (header, stages, history, overlays).
  Keep data hooks in place first; resolve the file+folder collision. Compare
  screenshots for visual splits.
- **Deliverable:** section components + resolved collision + green
  `TaskDetailPage.test.jsx`.
- **Done when:** tests green and existing accessible names/roles preserved.

### WP-18: Split `RunnerConfigurationSection.jsx`

- **Depends on:** WP-08/09 recommended
- **Risk:** medium
- **Required knowledge:**
  - `RunnerConfigurationSection.jsx` (1,018 lines; `RunnerConfigurationSection`
    ~912 span), churn 22/15
  - Churn hotspot per audit §4.2
- **Work:** Split by configuration subsection (harness list, model aliases,
  connection health, actions). High-churn area goes first in this phase.
- **Deliverable:** subsection components + green tests.
- **Done when:** tests green and visual diff reviewed.

### WP-19: Split remaining oversized components/pages

- **Depends on:** WP-17 (pattern established)
- **Risk:** medium
- **Required knowledge:**
  - `ObservabilityDashboard.jsx` (1,143, span ~995)
  - `ModelAliasesSection.jsx` (1,439)
  - `TaskCard.jsx` (1,019, span 924)
  - `TaskDetailOverlayContent.jsx` (1,071, overlay ~1,013)
  - `StageSkillsPanel.jsx` (1,052)
  - `SurveyPage.jsx` (956, churn 14 in 10 days)
  - Branch-density helpers: `review/reportAnchors.js` (36.6),
    `layout/activeTaskVisibility.js` (32.7), `tasks/logEntryModel.js` (29.5)
- **Work:** Section-split each target, ordered by churn (RunnerConfiguration
  already WP-18, then SurveyPage, then the rest). Reuse WP-17's pattern.
- **Deliverable:** section components + characterization tests + green tests.
- **Done when:** each target file is under its soft limit of ~300 lines or has
  a recorded reason, with tests green.

## 10. Phase 6 — backlog triage (gated by explicit rationale)

These are **not** blockers per `FEEDBACK_SURVEY.md` Q2. Run only when a Phase 3–5
split touches the relevant file, with the rationale recorded.

### WP-20: Cross-domain import cleanup (19 instances)

- **Depends on:** the first split that touches each site
- **Risk:** medium
- **Required knowledge:** audit §4.4 list, e.g.
  - `api/work/resolveAttestationStage.js` → `../flow/stageResolution.js`
  - `api/work/taskWorkRoutes.js` → `../flow/taskScheduler.js`
  - `api/work/taskPersistence.js` → `../watch/reliabilityShared.js`,
    `../flow/taskScheduler.js`
  - `api/work/resolveEngineState.js` → `../flow/stageResolution.js`,
    `../flow/circuitBreaker.js`
  - `api/work/countOpenTasksGlobal.js` → `../flow/scheduler/isWaitingForPickup.js`
  - `api/flow/taskControl.js`, `commandStages.js` (×3), `stageTransitions.js` →
    `../work/taskBranches.js` etc.
  - `api/flow/runnerRoutes.js` → `../work/resolveAttestationStage.js`
  - `api/watch/observabilityMetrics.js` → `../work/gitLock.js`
  - `api/auth/{apiKeyStore,sessionStore,userStore,accessConfig}.js` →
    `../house/fileWriting.js`
- **Work:** Route through domain `index.js` instead of reaching into siblings, per
  `ARCHITECTURE_DOMAINS.md`. Each change needs the affected domain reviewers.
- **Deliverable:** import-only PRs with rationale; no behaviour change.
- **Done when:** listed imports go through `index.js` and gates green.

### WP-21: Freeze-list growth rationale

- **Depends on:** a split that touches the file
- **Risk:** low/medium
- **Required knowledge:**
  - `api/taskStore.js` +25, `api/projectStore.js` +66, `WorkflowCanvas.jsx` +94,
    `KainBainContext.jsx` +40, `services/api.js` +2
  - Undetermined whether growth is new responsibility or rewiring
- **Work:** For each, determine whether growth is new responsibility (move out)
  or rewiring (document). No silent untouched growth.
- **Deliverable:** a short rationale per file in `ARCHITECTURE_DOMAINS.md` (or
  an ADR).
- **Done when:** every freeze-list entry has a documented determination.

### WP-22: Pattern-name mentions cleanup

- **Depends on:** none for edits, but pair with the file's next change
- **Risk:** low (docs/comment wording only; no behaviour)
- **Required knowledge:** ~19 added lines matching `factory|singleton|barrel`,
  e.g. `api/vitest.config.js` ("hot barrel"), `api/work/index.js`
  ("MARK: work barrel"), `api/push/index.js` ("push singleton"),
  `api/agent/harnessContract.js` / `harnessRegistry.js` ("factory"),
  one `// Barrel: one function per file` comment
- **Work:** Rewrite the offending comments/labels in plain business language
  (per `KB Code Standards.md` "NEVER MENTION DESIGN PATTERNS"). Do not rename
  public exports.
- **Deliverable:** diff of comments only.
- **Done when:** the grep count of pattern-name mentions in code is reduced to
  the pre-window baseline with no public API change.

### WP-23: Grandfathered oversized new files — policy and exceptions

- **Depends on:** none
- **Risk:** low (docs/policy)
- **Required knowledge:**
  - `api/imageGen/surveyImages.js` (879 lines, added 2026-11-02, commit
    `015104a`): 12 `MARK:` for 12 exports and a co-located test
  - Soft-line newcomers: `api/auth/routes.js` 746, `shared/accessibilityStatement.js`
    717, `runner/harnessModelDiscovery.js` 712, `api/flow/impromptuStore.js` 648,
    `api/imageGen/providers.js` 456
  - `docs/`, `AGENTS-MAP.md`, `CHANGELOG.md` contain no exception for any of them
- **Work:** Add an "Exceptions" appendix to `ARCHITECTURE_DOMAINS.md` (or an ADR)
  listing each grandfathered file and tracking it as debt; state the rule that
  any **future** file over 800 lines needs a documented exception before merge.
  Follow-up splits remain tracked debt, not this task.
- **Deliverable:** documented exception list + forward-only rule.
- **Done when:** the 6 files are listed with tracking links and the rule is
  stated.

### WP-24: Resolve file+folder same-name collisions (non-barrel)

- **Depends on:** the split that touches each seam
- **Risk:** medium
- **Required knowledge:**
  - `api/flow/dispatch/runnerMatches.js` (114 lines) vs `runnerMatches/` folder
  - `frontend/src/components/tasks/hooks/useTaskInspectorResize.js` (186 lines) vs
    `useTaskInspectorResize/` (4 files)
  - `frontend/src/hooks/useFleetModelCatalog.js` (67 lines) vs
    `useFleetModelCatalog/`
  - Documented barrels that stay untouched: `api/git.js`, `api/config.js`,
    `shared/toolLogFormat.js`, `shared/stageVerdict.js`,
    `shared/stageAttestation.js`, `fleetModelOptions.js`, `taskRetryState.js`
- **Work:** For each non-barrel collision, move the parent body into the
  subfolder or rename to a `*.legacy.js`-free explicit name. Leave true barrels
  alone.
- **Deliverable:** one seam per name, searchably placed.
- **Done when:** each listed name resolves to either a file or a folder, not both,
  with tests green.

### WP-25: Finish co-located test coverage for the remaining 81 new files

- **Depends on:** WP-08 (blocker class cleared first), then by churn
- **Risk:** low/medium
- **Required knowledge:** audit §4.4: 96 new source files without same-basename
  tests; 15 are unreferenced (WP-08). The remaining 81 follow, ordered by churn
  (per `FEEDBACK_SURVEY.md` Q2).
- **Work:** Add co-located tests for the remaining 81 new files, smallest and
  most-churned first. Prefer the lowest test level (unit).
- **Deliverable:** one test file per new source file.
- **Done when:** every new source file added since 2026-11-02 has a co-located
  test or an explicit skip with reason.

## 11. New class check (tracked item, not a split in this task)

- `api/flow/impromptuStore.js` (added 2026-11-06, 648 lines) declares
  `export class ImpromptuStore` at line 129. It has 18 `MARK:` entries for 9
  exports and a co-located test, but is not recorded as an allowed class in
  `ARCHITECTURE_DOMAINS.md` or `AGENTS-MAP.md`. Record it as a new-class
  exception candidate; decide (allow vs. convert to functional factory) before
  any refactor of that module. No code change in this task.

## 12. Dependency map (hard blockers)

```text   (knip)          : none
WP-02   (lint)          : none
WP-03   (full gate)     : WP-01, WP-02 recommended
WP-04   (standards)     : none
WP-05   (AGENTS-MAP)    : WP-04
WP-06   (hygiene note)  : none
WP-07   (test stabilize): none
WP-08   (15 untested)   : WP-07 for runner/route-adjacent only
WP-09   (char tests)     : none
WP-10   (daemon probe)  : WP-07, WP-08
WP-11   (daemon loops)  : WP-10
WP-12   (runnerRoutes)  : WP-07, WP-08
WP-13   (registry/sched): WP-12 recommended
WP-14   (config schema) : WP-09
WP-15   (executeStage)  : WP-07, WP-09
WP-16   (commandStages): WP-07, WP-15
WP-17   (TaskDetailPage): WP-08
WP-18   (RunnerConfig)  : WP-08, WP-09 recommended
WP-19   (other comps)    : WP-17
WP-20   (cross-domain)  : touches by WP-10..WP-19
WP-21   (freeze growth) : touches by WP-10..WP-19
WP-22   (pattern names) : none
WP-23   (grandfathered): none
WP-24   (collisions)    : WP-12, WP-17 (the seams affected)
WP-25   (remaining tests): WP-08
```

Parallel-safe groups: `{WP-01, WP-02, WP-04, WP-06, WP-09, WP-22, WP-23}`
may start immediately and do not block each other.

## 13. Global acceptance (for any ticket drawn from this list)

1. `npm run test:unit` green (7,076 api + 4,645 frontend baseline).
2. `npm run docs:check` green.
3. `npm run check:one-function` and `npm run check:jsdoc-example` green;
   any new missing `@example` is added in the same PR.
4. `npm run lint` exits 0; warning deltas are justified or removed
   (WP-02).
5. No new file exceeds 800 lines without a documented exception (WP-23 rule).
6. No new class outside `taskStore.js` / `projectStore.js` (or recorded
   exception such as `ImpromptuStore`).
7. No new cross-domain import bypassing a domain `index.js` (WP-20).
8. File/folder collisions do not grow (WP-24).
9. `AGENTS-MAP.md` line counts and owner rows reflect the resulting tree for
   any file a PR changes.
10. Behaviour-preserving: no API, CLI, or stored-state changes unless the
    ticket explicitly scopes them.

## 14. Basis of evidence

Every metric, file, line count, and blocker list in this document is taken from
`AUDIT.md` (audit date 2026-11-12). Gate results cited there (unit 11,721
green, 0 lint errors, docs check 71 files, depcheck 3 workspaces, build exit 0)
are the baseline evidence; see `AUDIT.md` §2 and §6 for the known gaps (knip,
canary/full `npm test`, lint-warning triage, Node-version alignment) that WP-01
through WP-03 close.

---

*Generated as `DELIVERABLES.md` from `AUDIT.md` per the task stage. Report-only:
no production code was changed to produce this file.*
