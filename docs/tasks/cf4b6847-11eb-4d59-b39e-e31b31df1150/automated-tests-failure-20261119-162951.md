<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** add per pipeline configurable main branch this meaans users should be okay to use non-main as the base branch ## example workflow 1) I want to work towards a new feature. So I manually create a feature branch 2) I create a new pipeline or two with the main configured to this feature branch 3) I create a new task, creating a standard branch off the feature branch rather than main 4) work is done on feature branch 5) merge stage merges change back into feature branch 6) 3-5 continue till I am happy with feature.  this will also be used to fit work into a standard ticket workflow
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1294.618s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 1s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Fast-gate verdict dir: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826 (verdict.json + untrimmed failed-branch logs land here)
✅ Settings duplicate check passed (37 files in 147ms)
✅ Frontend imports check passed (754 files in 449ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Frontend Build (30s), Dependency Check (30s), Dependency Audit Gate (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Frontend Build (1m00s), Dependency Check (1m00s), Harness Self-Tests (1m00s)
⏳ still running: Unit Tests (api) (1m30s), Unit Tests (frontend) (1m30s), Linting (api) (1m30s), Harness Self-Tests (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
⏳ still running: Unit Tests (api) (3m30s)
Running Unit Tests (api)... [0;32mPASS[0m (233s)
Running Unit Tests (frontend)... [0;32mPASS[0m (233s)
Running Unit Tests (runner)... [0;32mPASS[0m (233s)
Running Linting (api)... [0;32mPASS[0m (233s)
Running Linting (frontend)... [0;32mPASS[0m (233s)
Running Frontend Build... [0;32mPASS[0m (233s)
Running Security Script Tests... [0;32mPASS[0m (233s)
Running Dependency Check... [0;32mPASS[0m (233s)
Running Dependency Audit Gate... [0;32mPASS[0m (233s)
Running Proof Hygiene... [0;32mPASS[0m (233s)
Running Binary Guard... [0;32mPASS[0m (233s)
Running Harness Self-Tests... [0;32mPASS[0m (233s)
Running Container Tests... [0;32mPASS[0m (233s)
KAINBAIN_FAST_GATE_RESULT ok=true failedBranches="" canary=pending verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/verdict.json"
Fast-gate verdict: PASSED — every fast branch passed
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/verdict.json

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
Running Canary Tests... [0;31mFAIL[0m (1050s)
----------------------------------------------------------------------
Details for Canary Tests:
Full log: Canary Tests → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/canary-tests.full.log
(trimmed 108 of 228 lines; showing the tail)
Switched to branch 'main'
  ✓   73 tests/pr-review.spec.js:171:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (5.4s)
  ✓   74 tests/pr-review.spec.js:385:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7) (2.3s)
  ✓   75 tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables block-anchored review of stage reports outside git diff (2.4s)
  ✓   76 tests/pr-review.spec.js:529:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow (3.1s)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=0 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
ANTIGRAVITY CATALOGUE EMPTY in scratch — agy levels covered by unit tests
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   77 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (9.4s)
  ✓   78 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.4s)
  ✓   79 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.9s)
  ✓   80 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (3.0s)
  ✓   81 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.1s)
  ✓   82 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2.8s)
  ✓   83 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.1s)
  ✓   84 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.8s)
  ✓   85 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.5s)
  ✓   86 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.7s)
  ✓   87 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.1s)
  ✓   88 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.6s)
  ✓   89 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.4s)
  ✓   90 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (3.2s)
  ✓   91 tests/survey-verify.spec.js:126:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (3.0s)
survey timings ms: reveal=70 save=69 submit=87
  ✓   92 tests/survey-verify.spec.js:150:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (4.1s)
  ✓   93 tests/survey-verify.spec.js:265:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.5s)
  ✓   94 tests/survey-verify.spec.js:296:7 › question-me survey verification › empty round advances via continue without parking (2.8s)
  ✓   95 tests/survey-verify.spec.js:323:7 › question-me survey verification › image questions: mock generation at park, pick one, chosen picture persisted (3.7s)
  ✓   96 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (7.2s)
  ✓   97 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.3s)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (3.0s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.3s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (3.1s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.8s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.6s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.7s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.2s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (5.3s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (5.5s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.2s)
  ✓  108 tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (6.5s)
  ✓  109 tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (6.1s)
  ✓  110 tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (5.7s)
  ✓  111 tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists (6.1s)
  ✓  112 tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar (5.4s)
  ✓  113 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (9.6s)
  ✘  114 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.8s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: f66659fe-5664-484c-8669-a5d0d6fc82d1
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1795105622903
goal submitted, polling latestTask
task id: 95525ec9-a327-4ee2-b828-88b632a3e940 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  115 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (37.8s)
  ✓  116 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (5.6s)
  ✓  117 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.4s)
  ✓  118 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.6s)
  ✓  119 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.2s)
  ✓  120 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.8s)
  ✓  121 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.9s)
  ✓  122 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (4.3s)
  ✓  123 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (3.3s)
  ✓  124 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (16.9s)
  ✓  125 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (4.1s)
  ✓  126 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.8s)
  ✓  127 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (4.2s)
  ✓  128 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (4.0s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.3s)
  ✓  130 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.7s)
waitForFontsSettled: icon font not settled within 15 s, measuring anyway (page.waitForFunction: Timeout 15000ms exceeded.)
  ✓  131 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (28.4s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.7s)
  ✓  133 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (10.6s)
  ✓  134 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (3.4s)
  ✓  135 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.6s)
  ✓  136 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.4s)
  ✓  137 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (5.5s)
  ✓  138 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (4.3s)
  ✓  139 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.9s)
  ✓  140 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.7s)


  1) tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 

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
        at /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/canary-e2e/tests/task-lifecycle.spec.js:90:3

    Error Context: test-results/task-lifecycle-Task-Lifecy-7db7d-nd-columns-are-drop-targets/error-context.md

  Slow test file: tests/accessibility.spec.js (7.2m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  1 failed
    tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
  139 passed (17.5m)
----------------------------------------------------------------------
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Canary Tests" canary=ran verdict="/home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/verdict.json"
Fast-gate verdict: FAILED — Canary Tests
Canary: ran in the serial phase (see gate output)
Full log: Canary Tests → /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/canary-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-cf4b6847-11eb-4d59-b39e-e31b31df1150/docs/tasks/cf4b6847-11eb-4d59-b39e-e31b31df1150/ci-fast-gate-20261119-160826/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.