# AGENTS-MAP — one-page orientation (read after `agents.md`, before any `ls`/`find`)

**Orientation in ≤3 reads:** 1) `agents.md` → 2) this file → 3) the one entry
file your change touches (grep for a symbol listed below — never read a god file whole).

## Directory ownership and reviewer roles

Roster sourced from `docs/ARCHITECTURE_DOMAINS.md`; role titles only, never individual
names. A PR touching a row needs the matching reviewer; cross-domain changes need every
affected reviewer. Until a volunteer steps up, the domain reviewer for the most-affected
area stands in as **Docs Steward**.

| Dir | Owns | Owner role |
| --- | --- | --- |
| `api/work/` | Task identity, assets, branches, errors, files, lifecycle, finalize, persistence, survey, workspace, task-work routes | Work reviewer |
| `api/flow/` | Scheduler, execution queue, stage execution/advancement/failback, flow routes, command stages, reports gating (`execution/`, `routing/{tables,resolvers,orchestrators}/`, `scheduler/`) | Flow reviewer |
| `api/watch/` | Observability: process logs, log-feed routes, stage reports, metrics, reliability | Watch reviewer |
| `api/house/` | Project startup, safe atomic file writing | House reviewer |
| `api/crew/` | Harness roster, model discovery, session capabilities | Crew reviewer |
| `api/agent/` | Harness boundary (pi, antigravity, muse, vibe, opencode, custom, mock), contracts, `logStream/` | Crew reviewer |
| `api/git/` | (WP-4) Command-family git operations: errors, validation, exec, staleLock, status, working-tree status/recovery, branch, commit, merge, remote — each under 420 LOC, covered by co-located `*.test.js` | Work reviewer |
| `api/project/` | (WP-3) Project normalizers/utilities: `stageNormalizers`, `retrySettings`, `appStatus`, `workflowDefaults`, `aliasRenames`, `deployCommands`, `projectSlug`, `gitRemote`, `projectConfigDiscovery` — each under 400 LOC; consumed only through `api/projectStore.js` | House reviewer |
| `api/routes/` | Fastify route registrars (thin); `tasks.js` is a 45-line facade → work/flow/watch route modules | House reviewer |
| `api/skills/` | Skills registry and stage skill injection | Flow reviewer |
| `api/index.js` | Fastify server wiring only; registration, no business logic (resolvers in `api/projectResolution.js`, `api/sessionResolution.js`, CORS in `api/cors.js`) | House reviewer |
| `frontend/src/components/workflow/` | Workflow canvas and extracted hooks | Flow reviewer |
| `frontend/src/components/workflow/hooks/` | Extracted canvas state logic: `useActivityConsole`, `useBoardFilters`, `useCanvasAnalytics`, `useCanvasSearchFilter`, `useCollapsedGroups`, `useMobileToolbarCollapse`, `useStageDnD`, `useStageTagFilter`, `useTaskActions` | Flow reviewer |
| `frontend/src/components/tasks/` | Task identity, overlay/tab panes, work actions, reports/logs/history panes | Work reviewer |
| `frontend/src/components/settings/` | Project settings, system settings, house config UI | House reviewer |
| `frontend/src/context/` | App context composed from domain hooks (no split; see §No-split decisions) | House reviewer |
| `frontend/src/services/` | API client facade over work/flow/crew/watch/house domains | domain owners |
| `shared/` | Shared api↔frontend constants and helpers (`toolLogFormat`, report helpers, model keys/aliases, stage keyword tokens) | Watch reviewer for `toolLogFormat`; Crew reviewer for model keys/aliases; Flow reviewer for stage keyword tokens |
| `site-docs/` | Markdown docs served by `GET /docs` | Docs Steward + affected domain reviewer |
| `tests/`, `scripts/` | Bash/Node test harnesses, utility scripts | Docs Steward for doc-facing scripts; Platform owner for the rest |
| `docs/tasks/` | Per-task engine artifacts and historical decision records | Docs Steward (rotation) — see `docs/TASK_DIRECTORY_HYGIENE.md` |
| `docs/` | Architecture and task-directory hygiene notes | Docs Steward |

## God files — grep to the seam, never read whole

| File | Lines | Entry points (grep these) | Usage shown in |
| --- | --- | --- | --- |
| `frontend/src/components/workflow/WorkflowCanvas.jsx` | ~558 (post WP-6) | `WorkflowCanvas`, `AddStageButton`, `STAGE_KEYWORD_TOKENS`; seams: `useActivityConsole`, `useBoardFilters`, `useCanvasAnalytics`, `useCanvasSearchFilter`, `useCollapsedGroups`, `useMobileToolbarCollapse`, `useStageDnD`, `useStageTagFilter`, `useTaskActions` (`hooks/`) | `WorkflowCanvas.test.jsx` (+ Collapse/Creation/ModelSelector/Models variants) + `hooks/useCanvas*.test.js` |
| `frontend/src/context/KainBainContext.jsx` | ~470 (documented only; no split) | `KainBainProvider`, `useKainBain`, `KainBainRouteBridge`; satellites: `useTasks`, `useWorkflow`, `useProjects`, `useSkills`, `useUiPreferences`, `useHarnessPrefs`, `useNotifications`, `useViewNavigation`, `useSelectedTask`, `useEngineStatus`, `useTaskSubmission`, `useBoardSync`, `useStageNavigation`, `useWebSocket`, `usePendingTaskSave` | `KainBainContext.test.jsx` |
| `frontend/src/components/settings/ProjectSettings.jsx` | shell | `PROJECT_SETTINGS_SECTIONS`; sections: `ProjectSettingsForm`, `WorkflowManagementPanel`, `RetryNumberField`, `parseRetrySettings` (see `projectSettingsValidation.js`) | `ProjectSettings.test.jsx` |
| `frontend/src/components/tasks/TaskDetailPage.jsx` | barrel → `TaskDetailPageContent.jsx` (details body + header remain in content) | tabs use `TaskDetailReportsPane`, `TaskDetailLogsPane`, `TaskDetailHistoryPane` | `TaskDetailPage.test.jsx` |
| `frontend/src/components/tasks/TaskDetailOverlay.jsx` | barrel → `TaskDetailOverlayContent.jsx` | tabs composed via `TaskDetailsTab`, `TaskReportsTab`, `TaskHistoryTab`, `LogsPanel`; page-only panes live in `TaskDetail{Reports,Logs,History}Pane` | `TaskDetailOverlay.test.jsx` |
| `shared/toolLogFormat.js` | barrel | `export * from './toolLogFormat/index.js'`; one module per exported function in `shared/toolLogFormat/` | `toolLogFormat.test.js`, `api/toolLogFormat.shared.test.js` |
| `frontend/src/services/api.js` | ~130 | Re-export facade — real requests live in `services/{work,flow,crew,watch,house,retrospective}/index.js` (base URL in `frontend/src/services/apiBase.js`) | `api.test.js`, `domainRequests.test.js` |

## No-split decisions

- `frontend/src/context/KainBainContext.jsx` (~470 LOC) intentionally stays a single shell composed from focused `use*` hooks in `frontend/src/context/`. No split PR is pending; do not expect one. Satellite hooks: `useBoardSync.js`, `useAccentTheme.js`, `useSelectedTask`, `useViewNavigation` (among others).
- `frontend/src/services/api.js` is a compatibility facade; new requests go in `frontend/src/services/{work,flow,crew,watch,house}/index.js`.
- `api/taskStore.js` and `api/projectStore.js` remain class + singleton facades; pure logic lives in `api/work/` and `api/project/`.

## Barrels that look like code but aren't

- `api/projectStore.js` (~2254 LOC): `ProjectStore` class + singleton wiring only; pure normalizers/utilities live in `api/project/` (WP-3). Registry wiring and persistence stay in the barrel.
- `api/taskStore.js` (~1069 LOC): `TaskStore` class + singleton wiring over `api/{work,flow,watch,house}/index.js` — every method delegates to those subdirs, no business logic lives here. Engine-state composition, owner snapshot, open-queue depth, cwd/link seams, wedge settlement, scheduler kick, and never-throw push seams live as single-purpose modules in `api/work/`. `api/work/index.js` re-exports every cycle-free work module (route registrars stay out — `taskWorkRoutes.js` imports `api/flow/`).
- `api/routes/tasks.js` (~50 LOC): facade registering `taskWorkRoutes` / `taskFlowRoutes` / `taskWatchRoutes`.
- `api/git.js` (~80 LOC): thin re-export barrel over `api/git/*.js` — public surface preserved for caller stability (WP-4). Unit coverage lives in co-located `api/git/*.test.js` (one per command family) plus the 48-export surface contract in `api/git.test.js`.
- `api/flow/stageExecution.js`, `api/flow/stageFailureRouting.js`, `api/flow/taskScheduler.js`: thin re-export barrels over `api/flow/execution/`, `api/flow/routing/` (tables/resolvers/orchestrators), `api/flow/scheduler/` — one module per exported function, public surface byte-identical (WP-5). Loop mechanics import tables/resolvers, never vice versa.
- `shared/toolLogFormat.js` (1 LOC): re-export barrel over `shared/toolLogFormat/*.js` (seams: `stripAnsi`, `truncateAtWord`, `summarizeToolStart`, `summarizeToolResult`, `summarizeUsage`, `summarizePermission`, `summarizePlan`, `summarizeRaw`, and shared helpers). Owner: Watch reviewer.

## `shared/toolLogFormat.js` seam ownership (WP-7)

- `shared/toolLogFormat/index.js` re-exports one subject per file under `shared/toolLogFormat/`.
- Known seams: `stripAnsi`, `truncateAtWord`, `summarizeToolStart`, `summarizeToolResult`, `summarizeUsage`, `summarizePermission`, `summarizePlan`, `summarizeRaw`, plus `toolFamilies`, `constants`, `normalizeBudget`, `parseResultEnvelope`, `pickPrimaryArg`, `readArgValue`, `collapseWhitespace`.
- Covered by `toolLogFormat.test.js` and `api/toolLogFormat.shared.test.js`.

## Module locator — where did the legacy hubs go?

| If you are looking for… | Open first |
| --- | --- |
| Logic that used to live in `api/taskStore.js` | `api/work/index.js` (subject modules under `api/work/`); `api/taskStore.js` is a re-export facade |
| Task lifecycle specifically | `api/work/taskLifecycle.js` |
| Stage execution / advancement | `api/flow/stageExecution.js`, `api/flow/stageTransitions.js`, `api/flow/stagePolicy.js` |
| Stage failure routing / failback | `api/flow/stageFailureRouting.js`, `api/flow/stageTransitions.js` |
| Task scheduler / queue | `api/flow/taskScheduler.js`, `api/flow/executionQueue.js` |
| Safe file writes / startup | `api/house/fileWriting.js`, `api/house/projectStartup.js` |
| Project normalizers/utilities (WP-3) | `api/project/` (consumed through `api/projectStore.js`) |
| Harness / model discovery | `api/crew/` (`harnessRoster.js`, `modelDiscovery.js`, `sessionCapabilities.js`) |
| Git command families (WP-4) | `api/git/*.js` (errors, validation, exec, staleLock, status, workingTreeStatus, workingTreeRecovery, branch, commit, merge, remote) |
| Process logs / stage reports / reliability | `api/watch/` |
| Flow execution/routing/scheduler internals (WP-5) | `api/flow/execution/`, `api/flow/routing/` (tables/resolvers/orchestrators), `api/flow/scheduler/` |
| Workflow canvas hooks | `frontend/src/components/workflow/hooks/` |
| Task detail tabs | `frontend/src/components/tasks/` (`TaskDetailsTab.jsx`, `TaskReportsTab.jsx`, `TaskHistoryTab.jsx`, `TaskDetailsTabContent.jsx`) |
| Task detail panes | `frontend/src/components/tasks/TaskDetailReportsPane.jsx`, `TaskDetailLogsPane.jsx`, `TaskDetailHistoryPane.jsx` |
| Log formatting helpers | `shared/toolLogFormat.js` (barrel) and `shared/toolLogFormat/` (seams above) |
| Top-level doc ownership | `docs/ARCHITECTURE_DOMAINS.md` + this file's owner roster |
| Task-directory hygiene decision | `docs/TASK_DIRECTORY_HYGIENE.md` |

## Test & lint commands (run from repo root)

| Purpose | Command |
| --- | --- |
| Full gate | `npm test` |
| Full gate without canary E2E | `npm test -- --no-canary` (or `KAINBAIN_SKIP_CANARY=1`) |
| Unit tests | `npm run test:unit` — or per-area `npm run test:api` / `npm run test:frontend` |
| Fast documentation coverage & link integrity | `npm run docs:check` |
| WP-8 one-function gate | `npm run check:one-function` |
| WP-8 JSDoc `@example` gate | `npm run check:jsdoc-example` |

## Read-budget rules

- Prefer `GET /tasks/:id/logs?projectId=<id>&feed=main|thinking|tools&format=entries|text` over scraping `task.md` process logs.
- Never `ls -R`; use this map and grep.
- The `docs/tasks/` tree (≈242 engine-generated directories) is not a search surface by convention; see `docs/TASK_DIRECTORY_HYGIENE.md`.