<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** PR review on reports needs to be markdown rendered and prettier Currently it looks like this :  ![image.png](assets/image.png) This makes it hard to read the thick lines and gaps between each thing make it difficult to read whole blocks.  In report mode the Markdown should be rendered out and still allow some degree of anchored comments. Line highlights should only show when you hover over things. We can keep line numbers but dont add lines to dictate each line.  And may be usefull to sort out whatever is causing those massive gaps
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 912.454s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 691ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (32 files in 88ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (api) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s), Linting (api) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
⏳ still running: Unit Tests (api) (3m00s)
Running Unit Tests (api)... [0;32mPASS[0m (182s)
Running Unit Tests (frontend)... [0;32mPASS[0m (182s)
Running Unit Tests (runner)... [0;32mPASS[0m (182s)
Running Linting (api)... [0;32mPASS[0m (182s)
Running Linting (frontend)... [0;32mPASS[0m (182s)
Running Frontend Build... [0;32mPASS[0m (182s)
Running Security Script Tests... [0;32mPASS[0m (182s)
Running Dependency Check... [0;32mPASS[0m (182s)
Running Dependency Audit Gate... [0;32mPASS[0m (182s)
Running Harness Self-Tests... [0;32mPASS[0m (182s)
Running Container Tests... [0;32mPASS[0m (182s)
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
Running Canary Tests... [0;31mFAIL[0m (725s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 111 of 231 lines; showing the tail)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=13 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   77 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (8.2s)
  ✓   78 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.2s)
  ✓   79 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.4s)
  ✓   80 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (2.3s)
  ✓   81 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.4s)
  ✓   82 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2.0s)
  ✓   83 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.0s)
  ✓   84 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.1s)
  ✓   85 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (4.4s)
  ✓   86 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.6s)
  ✓   87 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.0s)
  ✓   88 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.6s)
  ✓   89 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.5s)
  ✓   90 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (2.9s)
  ✓   91 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (1.9s)
survey timings ms: reveal=37 save=84 submit=91
  ✓   92 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.6s)
  ✓   93 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.9s)
  ✓   94 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (2.5s)
  ✓   95 tests/survey-verify.spec.js:316:7 › question-me survey verification › image questions: mock generation at park, pick one, chosen picture persisted (2.6s)
  ✓   96 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (5.5s)
  ✓   97 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.0s)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.6s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.2s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.9s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.6s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.2s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.1s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.2s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (4.0s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (4.4s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (1.8s)
  ✓  108 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (4.0s)
  ✓  109 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (4.3s)
  ✓  110 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (4.6s)
  ✓  111 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (4.4s)
  ✓  112 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.8s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: 51135b46-874a-4670-bb13-d6dfe65d45d3
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1794028720208
goal submitted, polling latestTask
task id: 38079746-074a-47fa-89f2-a6ca9b337521 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject failed on attempt 0: page.goto: Target page, context or browser has been closed
Reload attempt 1 starting...
page target dead — reviving a fresh page
context.newPage failed, trying a fresh context: browserContext.newPage: Target page, context or browser has been closed
page revive failed on attempt 1: browser.newContext: Target page, context or browser has been closed
Reload attempt 2 starting...
page target dead — reviving a fresh page
context.newPage failed, trying a fresh context: browserContext.newPage: Target page, context or browser has been closed
page revive failed on attempt 2: browser.newContext: Target page, context or browser has been closed
Reload attempt 3 starting...
page target dead — reviving a fresh page
context.newPage failed, trying a fresh context: browserContext.newPage: Target page, context or browser has been closed
page revive failed on attempt 3: browser.newContext: Target page, context or browser has been closed
Reload attempt 4 starting...
page target dead — reviving a fresh page
context.newPage failed, trying a fresh context: browserContext.newPage: Target page, context or browser has been closed
page revive failed on attempt 4: browser.newContext: Target page, context or browser has been closed
  ✘  113 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (5.3s)
  ✓  114 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (4.4s)
  ✓  115 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.3s)
  ✓  116 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.4s)
  ✓  117 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.3s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.2s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.9s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (4.3s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.5s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (5.6s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.3s)
  ✓  124 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.4s)
  ✓  125 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.1s)
  ✓  126 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (4.7s)
  ✓  127 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (1.7s)
  ✓  128 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.2s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.2s)
  ✓  130 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (1.9s)
  ✓  131 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.5s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.2s)
  ✓  133 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.9s)
  ✓  134 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.5s)
  ✓  135 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (3.8s)
  ✓  136 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.3s)
  ✓  137 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (2.8s)
  ✓  138 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.5s)


  1) tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

    Error: app did not boot after 5 reloads

      181 | 			} catch (err) {
      182 | 				console.log(`page revive failed on attempt ${attempt}:`, err.message);
    > 183 | 				if (attempt === 4) throw new Error("app did not boot after 5 reloads");
          | 				                         ^
      184 | 				await sleepMs(250);
      185 | 				continue;
      186 | 			}
        at /home/[REDACTED]/.kainbain/runner-work/kb-ae3ea5a0-111c-43dd-bf89-ed25b841b3e0/canary-e2e/tests/task-lifecycle.spec.js:183:30

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  Slow test file: tests/accessibility.spec.js (6.2m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  1 failed
    tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
  137 passed (12.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.