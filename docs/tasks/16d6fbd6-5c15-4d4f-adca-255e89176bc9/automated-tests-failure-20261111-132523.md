<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** we should be creating a central queue from tasks on all pipelines /projects recently i have been using multiple pipelines and have noticed that there seems to be a difficulty getting tasks on a pipe im not currently looking at to run. Can we please investigate and fix it if needed The point of kainbain is to normalise work accross multiple projects and pipelines My main fear right now is that it seems workers will only pickup work when the UI has that pipeline focused,which isnt how it should work
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1053.635s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 825ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (35 files in 110ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (160s)
Running Unit Tests (frontend)... [0;32mPASS[0m (160s)
Running Unit Tests (runner)... [0;32mPASS[0m (160s)
Running Linting (api)... [0;32mPASS[0m (160s)
Running Linting (frontend)... [0;32mPASS[0m (160s)
Running Frontend Build... [0;32mPASS[0m (160s)
Running Security Script Tests... [0;32mPASS[0m (160s)
Running Dependency Check... [0;32mPASS[0m (160s)
Running Dependency Audit Gate... [0;32mPASS[0m (160s)
Running Harness Self-Tests... [0;32mPASS[0m (160s)
Running Container Tests... [0;32mPASS[0m (160s)
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
Running Canary Tests... [0;31mFAIL[0m (887s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 101 of 221 lines; showing the tail)
fatal: Needed a single revision
fatal: a branch named 'kb/99036e4a-6f58-4cde-bfa1-236af74071fa' already exists
Already on 'kb/99036e4a-6f58-4cde-bfa1-236af74071fa'
Switched to branch 'main'
Switched to branch 'kb/99036e4a-6f58-4cde-bfa1-236af74071fa'
Switched to branch 'main'
  ✓   73 tests/pr-review.spec.js:171:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (4.7s)
  ✓   74 tests/pr-review.spec.js:385:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7) (2.5s)
  ✓   75 tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables block-anchored review of stage reports outside git diff (2.2s)
  ✓   76 tests/pr-review.spec.js:529:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow (3.0s)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=84 agy=18 mock=1
  ✘   77 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (124ms)
  ✓   78 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.5s)
  ✓   79 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.6s)
  ✓   80 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (2.0s)
  ✓   81 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (3.8s)
  ✓   82 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2.3s)
  ✓   83 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (1.8s)
  ✓   84 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (1.8s)
  ✓   85 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.2s)
  ✓   86 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (4.6s)
  ✓   87 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.9s)
  ✓   88 tests/runtime-errors.spec.js:23:5 › app renders without console errors (3.0s)
  ✓   89 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.9s)
  ✓   90 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (3.2s)
  ✓   91 tests/survey-verify.spec.js:126:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (2.5s)
survey timings ms: reveal=37 save=64 submit=96
  ✓   92 tests/survey-verify.spec.js:150:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (4.7s)
  ✓   93 tests/survey-verify.spec.js:265:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.0s)
  ✓   94 tests/survey-verify.spec.js:296:7 › question-me survey verification › empty round advances via continue without parking (2.4s)
  ✓   95 tests/survey-verify.spec.js:323:7 › question-me survey verification › image questions: mock generation at park, pick one, chosen picture persisted (2.3s)
  ✓   96 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (6.2s)
  ✓   97 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.8s)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.7s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.1s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.8s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (3.0s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (1.9s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.1s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.1s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (5.2s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (4.6s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.3s)
  ✓  108 tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (35.2s)
  ✓  109 tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (4.6s)
  ✓  110 tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (34.7s)
  ✓  111 tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists (35.0s)
  ✓  112 tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar (34.3s)
  ✓  113 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (4.8s)
  ✓  114 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (4.7s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: 9fd05a6e-3aa8-4333-842d-8acca892ae97
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1794403440161
goal submitted, polling latestTask
task id: 0e2fb97b-6546-4ac8-9279-b0e28805899c stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  115 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (6.3s)
  ✓  116 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (5.1s)
  ✓  117 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.1s)
  ✓  118 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.5s)
  ✓  119 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.7s)
  ✓  120 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.5s)
  ✓  121 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.7s)
  ✓  122 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.8s)
  ✓  123 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.6s)
  ✓  124 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.8s)
  ✓  125 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.7s)
  ✓  126 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.0s)
  ✓  127 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.5s)
  ✓  128 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.4s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.5s)
  ✓  130 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.4s)
  ✓  131 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.5s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.3s)
  ✓  133 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.7s)
  ✓  134 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.5s)
  ✓  135 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.2s)
  ✓  136 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.3s)
  ✓  137 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (4.8s)
  ✓  138 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.3s)
  ✓  139 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.4s)
  ✓  140 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (5.3s)


  1) tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses 

    Error: expect(received).toEqual(expected) // deep equality

    Expected: ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
    Received: null

      89 |     // pi's 7-level advertisement is pinned by unit tests + the live probe.
      90 |     if ((cat.harnesses || []).some((h) => h.id === "pi")) {
    > 91 |       expect(levelsOf("pi")).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
         |                              ^
      92 |     }
      93 |     expect(levelsOf("antigravity")).toEqual(["low", "medium", "high"]);
      94 |     expect(levelsOf("mock")).toEqual(["low", "medium", "high"]);
        at /home/[REDACTED]/.kainbain/runner-work/kb-16d6fbd6-5c15-4d4f-adca-255e89176bc9/canary-e2e/tests/reasoning-levels-browser.spec.js:91:30

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/reasoning-levels-browser-R-ef95b-lid-handling-null-harnesses/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/reasoning-levels-browser-R-ef95b-lid-handling-null-harnesses/error-context.md

  Slow test file: tests/accessibility.spec.js (6.3m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  1 failed
    tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses 
  139 passed (14.8m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.