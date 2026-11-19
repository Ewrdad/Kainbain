<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add per pipeline configurable main branch this meaans users should be okay to use non-main as the base branch ## example workflow 1) I want to work towards a new feature. So I manually create a feature branch 2) I create a new pipeline or two with the main configured to this feature branch 3) I create a new task, creating a standard branch off the feature branch rather than main 4) work is done on feature branch 5) merge stage merges change back into feature branch 6) 3-5 continue till I am happy with feature.  this will also be used to fit work into a standard ticket workflow
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1343.787s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 966ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (37 files in 146ms)
✅ Frontend imports check passed (754 files in 446ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Proof Hygiene
▸ started Binary Guard
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
⏳ still running: Unit Tests (api) (4m00s)
Running Unit Tests (api)... [0;32mPASS[0m (247s)
Running Unit Tests (frontend)... [0;32mPASS[0m (247s)
Running Unit Tests (runner)... [0;32mPASS[0m (247s)
Running Linting (api)... [0;32mPASS[0m (247s)
Running Linting (frontend)... [0;32mPASS[0m (247s)
Running Frontend Build... [0;32mPASS[0m (247s)
Running Security Script Tests... [0;32mPASS[0m (247s)
Running Dependency Check... [0;32mPASS[0m (247s)
Running Dependency Audit Gate... [0;32mPASS[0m (247s)
Running Proof Hygiene... [0;32mPASS[0m (247s)
Running Binary Guard... [0;32mPASS[0m (247s)
Running Harness Self-Tests... [0;32mPASS[0m (247s)
Running Container Tests... [0;32mPASS[0m (247s)
KAINBAIN_FAST_GATE_RESULT ok=true failedBranches="" canary=pending verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/verdict.json"
Fast-gate verdict: PASSED — every fast branch passed
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/verdict.json

Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
⏳ still running: Canary Tests (3m30s)
⏳ still running: Canary Tests (4m00s)
⏳ still running: Canary Tests (4m30s)
⏳ still running: Canary Tests (5m00s)
⏳ still running: Canary Tests (5m30s)
⏳ still running: Canary Tests (6m00s)
⏳ still running: Canary Tests (6m30s)
⏳ still running: Canary Tests (7m00s)
⏳ still running: Canary Tests (7m30s)
⏳ still running: Canary Tests (8m00s)
⏳ still running: Canary Tests (8m30s)
⏳ still running: Canary Tests (9m00s)
⏳ still running: Canary Tests (9m30s)
⏳ still running: Canary Tests (10m00s)
⏳ still running: Canary Tests (10m30s)
⏳ still running: Canary Tests (11m00s)
⏳ still running: Canary Tests (11m30s)
⏳ still running: Canary Tests (12m00s)
⏳ still running: Canary Tests (12m30s)
⏳ still running: Canary Tests (13m00s)
⏳ still running: Canary Tests (13m30s)
⏳ still running: Canary Tests (14m00s)
⏳ still running: Canary Tests (14m30s)
⏳ still running: Canary Tests (15m00s)
⏳ still running: Canary Tests (15m30s)
⏳ still running: Canary Tests (16m00s)
⏳ still running: Canary Tests (16m30s)
⏳ still running: Canary Tests (17m00s)
⏳ still running: Canary Tests (17m30s)
⏳ still running: Canary Tests (18m00s)
Running Canary Tests... [0;31mFAIL[0m (1087s)
----------------------------------------------------------------------
Details for Canary Tests:
Full log: Canary Tests → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/canary-tests.full.log
(trimmed 145 of 265 lines; showing the tail)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (3.0s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.2s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (3.1s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.7s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.0s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.3s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.5s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (35.7s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (7.4s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.1s)
  ✓  108 tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (5.5s)
  ✓  109 tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (5.4s)
  ✓  110 tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (5.1s)
  ✓  111 tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists (5.4s)
  ✘  112 tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar (3.9s)
  ✓  113 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (5.4s)
  ✓  114 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (5.9s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: f66659fe-5664-484c-8669-a5d0d6fc82d1
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1795101908654
goal submitted, polling latestTask
task id: 479c7933-d4b7-45fb-87f8-30c62649d6c4 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  115 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (7.8s)
  ✘  116 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3.8s)
  ✓  117 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.6s)
  ✓  118 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.7s)
  ✓  119 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.8s)
  ✓  120 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.5s)
  ✓  121 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.9s)
  ✓  122 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.8s)
  ✓  123 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.3s)
  ✓  124 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (4.4s)
  ✓  125 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (8.6s)
  ✘  126 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (1.1m)
  ✓  127 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (4.2s)
  ✓  128 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (4.0s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (3.1s)
  ✓  130 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.2s)
  ✓  131 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (3.5s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.4s)
  ✓  133 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.3s)
  ✓  134 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.4s)
  ✓  135 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.1s)
  ✓  136 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (5.4s)
  ✓  137 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (35.4s)
  ✓  138 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.0s)
  ✓  139 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.9s)
  ✓  140 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (6.4s)


  1) tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar 

    Error: page.goto: Target page, context or browser has been closed

       at helpers.js:65

      63 | 		if (!/ERR_INSUFFICIENT_RESOURCES|has been closed|Target closed|Page crashed|Target crashed/.test(err?.message || "")) throw err;
      64 | 		await new Promise((r) => setTimeout(r, 1000));
    > 65 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      66 | 	}
      67 | 	await expect(page).toHaveTitle(/Kainbain/);
      68 | 	const totalBudget = Number.isFinite(readyTimeoutMs) && readyTimeoutMs > 0 ? readyTimeoutMs : APP_READY_TIMEOUT_MS;
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/helpers.js:65:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/helpers.js:129:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/task-inspector.spec.js:208:4

    Error Context: test-results/task-inspector-Task-inspec-75a03-thout-squishing-the-toolbar/error-context.md

  2) tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Error: page.goto: Target page, context or browser has been closed

       at helpers.js:65

      63 | 		if (!/ERR_INSUFFICIENT_RESOURCES|has been closed|Target closed|Page crashed|Target crashed/.test(err?.message || "")) throw err;
      64 | 		await new Promise((r) => setTimeout(r, 1000));
    > 65 | 		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         | 		           ^
      66 | 	}
      67 | 	await expect(page).toHaveTitle(/Kainbain/);
      68 | 	const totalBudget = Number.isFinite(readyTimeoutMs) && readyTimeoutMs > 0 ? readyTimeoutMs : APP_READY_TIMEOUT_MS;
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/helpers.js:65:14)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/helpers.js:129:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/task-lifecycle.spec.js:31:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/task-lifecycle.spec.js:236:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  3) tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ────────────────

    Test timeout of 60000ms exceeded while running "beforeEach" hook.

      45 | 	for (const viewport of VIEWPORTS) {
      46 | 		test.describe(`${viewport.name}`, () => {
    > 47 | 			test.beforeEach(async ({ page }) => {
         | 			     ^
      48 | 				await page.setViewportSize({
      49 | 					width: viewport.width,
      50 | 					height: viewport.height,
        at /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/visual/dashboard.spec.js:47:9

    Error Context: test-results/visual-dashboard-Dashboard-Visuals-Mobile-Empty-state/error-context.md

  Slow test file: tests/accessibility.spec.js (7.0m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  3 failed
    tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar 
    tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ─────────────────
  137 passed (16.8m)
----------------------------------------------------------------------
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Canary Tests" canary=ran verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/verdict.json"
Fast-gate verdict: FAILED — Canary Tests
Canary: ran in the serial phase (see gate output)
Full log: Canary Tests → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/canary-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-150603/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.