# Where does my change go?

Choose by the reason a person wants the change, not by the technology used.

| Domain | Plain-language responsibility | Current homes | Examples |
| --- | --- | --- | --- |
| The Work | A task's name, goal, branch, and board card | `api/work/` (identity, branches, errors, lifecycle, persistence, task routes); `api/taskStore.js` (facade); `frontend/src/components/tasks/` | Rename a task; change task branch policy; reduce board card payload |
| The Flow | The stages work passes through, execution, and transitions | `api/flow/` (execution, transitions, scheduler, commands, stage policy, flow routes); `api/workflowRegistry.js`; `frontend/src/components/workflow/` | Change stage timing; advance/failback logic; stage routing rules |
| The Crew | Who does the work and which models they can use | `api/crew/` (capability guards, discovery, roster), `api/agent/`, `api/models.js`, `api/sessionStore.js`; browser-safe key grammar in `shared/modelKeys.js` | Add an agent harness; distinguish models from two providers |
| Watching the Work | What happened, whether it worked, and why it stopped | `api/watch/` (report content/recognition, progress logs, observability metrics, watch routes); `api/agent/logStream/`; review and stuck-check modules; `LogsPanel.jsx`, `logEntryModel.js`, `TaskReportsTab.jsx` | Group task logs by turn; show a review report; run stuck checks |
| House Setup | Projects, settings, files, health, and application startup | `api/house/` (project startup, safe file writes), `api/projectStore.js`, `api/config.js`, `api/index.js`; project/settings components | Configure a project; show deployment health |

## Ownership and safe changes

- The task author names one accountable business-domain reviewer in the task before editing. These are review responsibilities, not invented team accounts: Work reviewer checks task records; Flow reviewer checks stage progression; Crew reviewer checks harness contracts; Watch reviewer checks evidence; House reviewer checks startup and settings. Cross-domain changes need each affected reviewer. Until assigned, ownership is **unassigned**, not implicitly approved.
- Freeze new responsibilities in `taskStore.js`, `WorkflowCanvas.jsx`, `TaskDetailOverlay.jsx`, `KainBainContext.jsx`, and `services/api.js`; new business operations belong in subject files.
- The `api.js` object is a compatibility surface: cache helpers, model-key helpers, and `...workRequests(request)` style spreads from the five domain files in `frontend/src/services/{work,flow,crew,watch,house}/index.js`. New frontend requests go in their domain file, not the `api` object.
- Outside a new backend domain, import through its `index.js`. Inside it, import the subject file directly. Do not put startup or singleton creation in those indexes. Old paths remain compatible re-exports until callers migrate deliberately.
- Do not move `shared/modelKeys.js` into the server: the browser and server share the same Crew language. Do not create `misc`, `utils`, or duplicate key grammars to hide ownership decisions.
- Before editing, list exact files/sub-jobs each task owns. Sequence tasks touching the same file even across domains. Two tasks in the same domain may proceed independently only when their files do not overlap. Different domain labels alone do not guarantee safe parallel changes.
- Review checklist: explain the business reason; preserve contracts; add subject-local tests; run full `npm run test:unit`; compare screenshots for visual splits; record remaining exceptions.
- Soft size warnings: about 400 lines for backend subjects, 300 for components. Review must reject a **new** file over 800 lines without an explicit, documented exception. Existing oversized files are tracked debt, not permission to grow. This is a review rule, not an automated lint limit.

## Split status and next steps

Implemented domains and facades:
- **The Work:** `api/work/` houses `taskIdentity.js`, `taskBranches.js`, `taskErrors.js`, `taskFiles.js`, `taskLifecycle.js`, `taskPersistence.js`, and `taskWorkRoutes.js`. Tested by `taskIdentity.test.js` and `domainCompatibility.test.js`.
- **The Flow:** `api/flow/` houses `stagePolicy.js`, `executionQueue.js`, `stageTransitions.js`, `taskScheduler.js`, `commandStages.js`, `stageExecution.js`, `stageFailureRouting.js`, `taskControl.js`, and `taskFlowRoutes.js`. Tested by `stagePolicy.test.js` and `executionQueue.test.js`.
- **Watching the Work:** `api/watch/` houses `stageReports.js`, `processLogs.js`, `observabilityMetrics.js`, and `taskWatchRoutes.js`. Tested by `stageReports.test.js`. Frontend overlay sub-tabs extracted into `TaskReportsTab.jsx` and `TaskHistoryTab.jsx`. Stage-duration evidence (`api/taskDurationSummary.js`, `shared/stageDurations.js`, `shared/reportTimestamp.js`) is recorded at report/transition sites and enriched at the board-list boundary in `api/work/taskWorkRoutes.js`; never stored on the canonical cached task.
- **The Crew:** `api/crew/` houses `harnessRoster.js`, `modelDiscovery.js`, and `sessionCapabilities.js`. Tested by `capabilityGuard.test.js` and `compute.models.test.js`.
- **House Setup:** `api/house/` houses `fileWriting.js` and `projectStartup.js`. Tested by `projectStartup.test.js`.
- **Routes:** `api/routes/tasks.js` is a 40-line declarative facade registering Work, Flow, and Watch route modules. Tested by `routes/tasks.test.js` (all 35 tests green).
- **Core Store Facade:** `api/taskStore.js` is reduced from 5141 lines to 649 lines while preserving all 16 legacy public exports and backwards compatibility, plus the newer `stageElapsedSeconds` timing helper re-exported from The Flow. Tested by `taskStore.test.js` (140 tests green), `taskStore.summaryDurations.test.js` (12 green), `taskStore.characterisation.test.js` (8 green), and `domainCompatibility.test.js` (16 tests green).
- **Inspector composition:** `TaskDetailOverlay.jsx` (1421 → 947 lines) is composition only: header, tab navigation, and the four tab bodies (`TaskDetailsTab.jsx` at 597 lines, `LogsPanel.jsx`, `TaskReportsTab.jsx`, `TaskHistoryTab.jsx`). Tested by `TaskDetailOverlay.test.jsx` (37 tests green, including the failure-banner log-shortcut regression test).
- **Tracked debt (not permission to grow):** `WorkflowCanvas.jsx` (2368 lines) and `KainBainContext.jsx` (~930 lines) still exceed the soft limits. Their split paths are recorded: canvas by Flow sub-job (shell, stage cards, model selection, analytics, KB reference select) following the existing `WorkflowCanvas*.test.jsx` seams; context by focused hooks behind the current import surface. New code in these areas must land in subject files per the freeze rule above.

Three placement examples: task-log grouping → Watch; harness-scoped model discovery → Crew; stage skills' target-stage selector → Flow (coordinate with House for project catalogue changes).
