<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Can we make sure the model information is being pased through accurately ![image.png](assets/image.png) We seem to have some sort of regression when moving to the runner architecture where we are reporting default for model constantly. And like in this case reporting a model that isnt in use as its a CI stage I want the runner to be able to accurately report (through the backend) to the ui what model choices etc it is running. And I want to make sure the general model catalogue behaviours work.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 735.831s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
or Harness Self-Tests:
(trimmed 420 of 540 lines; showing the tail)
  ✔ runs Canary Tests in the serial phase after the fast overlap window (2.369102ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.222373ms)
✔ splitGatePhases (2.769651ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.231792ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.09848ms)
  ✔ opts out via --no-canary (0.093634ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.104702ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.080415ms)
  ✔ skip flags win over the legacy opt-in flags (0.107199ms)
✔ resolveCanary (0.91846ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (6.904624ms)
  ✔ reports true when the root tree carries the Windows binary (0.3825ms)
  ✔ reports false when the platform's binary name is missing (0.358487ms)
  ✔ reports false when the root tree has no binaries at all (0.245252ms)
✔ depcheckAvailable (8.09104ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (1.265088ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (3.913095ms)
  ✔ reports not installed when a package manifest is unreadable (0.891577ms)
✔ workspaceDepsInstalled (6.273051ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (3.144174ms)
  ✔ does not spawn when every workspace dependency is already present (1.007484ms)
  ✔ installs each missing package through npm and re-verifies (1.835874ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (1.328661ms)
✔ ensureWorkspaceDeps (7.621438ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (0.774254ms)
  ✔ returns zero and does not throw when directory does not exist (0.215564ms)
✔ pruneStaleTestDirectories (1.723278ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (5.416141ms)
✔ installSteps (8.435875ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (3.063982ms)
  ✔ root .npmrc documents the per-dir mirrors (1.61915ms)
✔ installSteps npmrc (5.100667ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (3.886637ms)
  ✔ installs the browser alone on macOS and Windows (0.226259ms)
✔ playwrightAttempts (4.354604ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (2.677546ms)
✔ npxExecutable (3.088229ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (3.060159ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.693915ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.243772ms)
✔ browserInstallTargets (5.271505ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-R6SRqu/Sanity/docs' -> '/tmp/kainbain-sanity-notes-0wsJza/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-hKfXLO/Sanity/docs' -> '/tmp/kainbain-sanity-notes-3eTzpn/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-hKfXLO/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-3eTzpn/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-hKfXLO/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-3eTzpn/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-iLYcW9/Sanity/docs' -> '/tmp/kainbain-sanity-notes-SsxTy7/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-eIE1iJ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-YnT4gl/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-eIE1iJ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-YnT4gl/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-eIE1iJ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-YnT4gl/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-HxkGPS/Sanity/docs' -> '/tmp/kainbain-sanity-notes-9brP0K/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-GOy5QY/Sanity/docs' -> '/tmp/kainbain-sanity-notes-hBKY90/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-GOy5QY/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-hBKY90/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-GOy5QY/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-hBKY90/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (95.935736ms)
  ✔ leaves no fixture residue in the OS temp dir (321.837401ms)
✔ checkStorageSanity (422.187332ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.535099ms)
  ✔ rejects a missing entry path or a different file (12.10428ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (808.977027ms)
✔ isMainModule (821.952016ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (3.996856ms)
  ✔ returns 0 when the notes space has no tasks dir (3.316086ms)
✔ countNotesTasks (8.340694ms)
ℹ tests 312
ℹ suites 80
ℹ pass 311
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 28563.963886

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (3093.388252ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'formatPosture',
  +     file: 'api/flow/formatPosture.js',
  +     kind: 'function'
  +   },
  +   {
  +     exportName: 'servingModelFor',
  +     file: 'api/flow/servingModelFor.js',
  +     kind: 'function'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-e3b2624a-bc24-4698-9c78-86af7f6f3b5b/tests/check-jsdoc-example.test.mjs:164:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { file: 'api/flow/formatPosture.js', exportName: 'formatPosture', kind: 'function' }, { file: 'api/flow/servingModelFor.js', exportName: 'servingModelFor', kind: 'function' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
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
⏳ still running: Canary Tests (9m30s)
Running Canary Tests... [0;31mFAIL[0m (591s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 94 of 214 lines; showing the tail)
  ✓   74 tests/pr-review.spec.js:487:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow (2.2s)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=13 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (7.9s)
  ✓   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.2s)
  ✓   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.2s)
  ✓   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (2.6s)
  ✓   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.3s)
  ✓   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2.5s)
  ✓   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.5s)
  ✓   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.1s)
  ✓   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (4.4s)
  ✓   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.6s)
  ✓   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.8s)
  ✓   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.3s)
  ✓   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (2.6s)
  ✓   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (3.7s)
  ✓   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (3.6s)
survey timings ms: reveal=35 save=61 submit=125
  ✓   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (4.6s)
  ✓   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.7s)
  ✓   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (2.8s)
  ✓   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (4.7s)
  ✓   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.0s)
  ✓   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.6s)
  ✓   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.7s)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.5s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (3.3s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.4s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (4.4s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (3.9s)
  ✓  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (4.0s)
  ✓  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (3.6s)
  ✓  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.0s)
  ✓  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (3.7s)
  ✓  106 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (3.6s)
  ✓  107 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (3.9s)
  ✓  108 tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (3.6s)
  ✓  109 tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.7s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: ed9c1fb3-6c1e-4441-8c9e-2f5470575199
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1793367406712
goal submitted, polling latestTask
task id: 5e9cd7ef-80d5-42d3-8fc9-5a9a40ba0be6 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (4.3s)
  ✓  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3.8s)
  ✓  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.1s)
  ✓  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (3.1s)
  ✓  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.6s)
  ✓  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.1s)
  ✓  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.6s)
  ✓  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.4s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.4s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (4.8s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (6.0s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.7s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (4.1s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (4.0s)
  ✓  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.6s)
  ✓  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.7s)
  ✓  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (3.1s)
  ✓  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.5s)
  ✓  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.3s)
  ✓  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (4.9s)
  ✓  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (4.0s)
  ✓  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.2s)
  ✓  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (3.9s)
  ✓  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.1s)
  ✓  134 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.0s)
  ✓  135 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (5.5s)


  1) tests/accessibility.spec.js:329:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 

    Test timeout of 60000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('heading', { name: /Task detail waiting a11y 1793367064537/i })
    Expected: visible
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('heading', { name: /Task detail waiting a11y 1793367064537/i }) with timeout 60000ms
      - waiting for getByRole('heading', { name: /Task detail waiting a11y 1793367064537/i })
      - Test timeout of 60000ms exceeded.


      344 |     // page fans out to task, project, workflow, models, and runners fetches,
      345 |     // which serialize behind a busy scratch backend late in a full shard.
    > 346 |     await expect(page.getByRole("heading", { name: new RegExp(goal, "i") })).toBeVisible({
          |                                                                              ^
      347 |       timeout: 60000,
      348 |     });
      349 |     await scanState(page, "task detail / waiting_human");
        at /home/server/.kainbain/runner-work/kb-e3b2624a-bc24-4698-9c78-86af7f6f3b5b/canary-e2e/tests/accessibility.spec.js:346:78

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-7e818-tatus-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-7e818-tatus-has-no-axe-violations/error-context.md

  1 failed
    tests/accessibility.spec.js:329:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 
  134 passed (9.8m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.