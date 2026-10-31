<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** review the active states a task can be ![18742.png](assets/18742.png) All tasks seem to currently get stuck on retry for some reason so need to figure out why that is so task status can be more useful in showing the state
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 2497.553s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 97ms)
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
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (137s)
Running Unit Tests (frontend)... [0;32mPASS[0m (137s)
Running Unit Tests (runner)... [0;32mPASS[0m (137s)
Running Linting (api)... [0;32mPASS[0m (137s)
Running Linting (frontend)... [0;32mPASS[0m (137s)
Running Frontend Build... [0;32mPASS[0m (137s)
Running Security Script Tests... [0;32mPASS[0m (137s)
Running Dependency Check... [0;32mPASS[0m (137s)
Running Dependency Audit Gate... [0;32mPASS[0m (137s)
Running Harness Self-Tests... [0;32mPASS[0m (137s)
Running Container Tests... [0;32mPASS[0m (137s)
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
Running Canary Tests... [0;31mFAIL[0m (545s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 89 of 209 lines; showing the tail)
Switched to branch 'kb/9b465c11-0dc3-4e67-b7b9-5bfa5f44caf6'
Switched to branch 'main'
  ✘   71 tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (34.3s)
  -   72 tests/pr-review.spec.js:349:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7)
  -   73 tests/pr-review.spec.js:391:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff
  -   74 tests/pr-review.spec.js:487:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=13 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (10.2s)
  ✓   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.1s)
  ✓   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.2s)
  ✓   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (2.2s)
  ✓   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.0s)
  ✓   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (3.7s)
  ✓   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.3s)
  ✓   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (3.8s)
  ✓   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.7s)
  ✓   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (1.8s)
  ✓   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.1s)
  ✓   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.5s)
  ✓   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.1s)
  ✓   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (2.7s)
  ✓   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (3.2s)
survey timings ms: reveal=35 save=86 submit=95
  ✓   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.7s)
  ✓   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.0s)
  ✓   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (2.4s)
  ✓   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (4.9s)
  ✓   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.7s)
  ✓   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.7s)
  ✓   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.3s)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.8s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (3.0s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.6s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (4.2s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.2s)
  ✓  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (3.8s)
  ✓  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (3.6s)
  ✓  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.3s)
  ✓  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (3.4s)
  ✓  106 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (3.9s)
  ✓  107 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (3.9s)
  ✓  108 tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (3.7s)
  ✓  109 tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.8s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: db69aef5-ef1b-41f2-969c-939bfa3d2898
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1793479609319
goal submitted, polling latestTask
task id: a8c79d04-4244-48d5-a84f-31f5e4b9239c stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (7.3s)
  ✓  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (5.5s)
  ✓  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.0s)
  ✓  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.5s)
  ✓  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.1s)
  ✓  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.2s)
  ✓  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.6s)
  ✓  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.1s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.1s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.5s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.4s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.0s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (4.0s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.1s)
  ✓  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.5s)
  ✓  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.3s)
  ✓  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.3s)
  ✓  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.5s)
  ✓  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (7.2s)
  ✓  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.3s)
  ✓  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.5s)
  ✓  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.1s)
  ✓  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (3.7s)
  ✓  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.0s)
  ✓  134 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.5s)
  ✓  135 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.7s)


  1) tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 

    Error: expect(received).toMatch(expected)

    Expected pattern: /^completed ::/
    Received string:  "failed :: Merge of 'kb/9b465c11-0dc3-4e67-b7b9-5bfa5f44caf6' landed on 'main' but publishing it failed (git push -u origin main failed (exit 128): fatal: unable to access 'https://git.example.com/canary/pr-review-canary-1793479458461.git/': Could not resolve host: git.example.com) — the local branch is ahead "

    Call Log:
    - Timeout 30000ms exceeded while waiting on the predicate

      342 | 				{ timeout: 30000 },
      343 | 			)
    > 344 | 			.toMatch(/^completed ::/);
          | 			 ^
      345 | 		const merged = git(repoDir, ["show", "main:src/session.js"]);
      346 | 		expect(merged).toContain("if (b == null) return 0;");
      347 | 	});
        at /home/[REDACTED]/.kainbain/runner-work/kb-8815d13d-e43e-45ec-b013-725c705ae59b/canary-e2e/tests/pr-review.spec.js:344:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/pr-review-PR-Review-E2E-op-06c1d-review-stale-→-pass-→-merge/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/pr-review-PR-Review-E2E-op-06c1d-review-stale-→-pass-→-merge/error-context.md

  1 failed
    tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 
  3 did not run
  131 passed (9.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.