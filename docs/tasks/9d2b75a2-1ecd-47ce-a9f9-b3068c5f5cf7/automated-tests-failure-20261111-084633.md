<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Runners are not autodetecting correctly  Key error seems to be with muse code but I suspect on others. Muse has just released a new model in the harness however for some reason it is not selectable in the ui ( but is in muse code)   Crutially this hasnt made it sway to the alias choices either, especailly since muse code keeps having its model for aliases wiped.    Please fix all this behaviour and make sure we have a firm and trusted way to build our model catalogue from the attached harnesses. For context the model catalogue should get model options from the runner, convert them into the kainbain standard harness::model::effort and save them then the Ui should allow selecting from that central list.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1120.066s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
inal versions (17.027022ms)
  ✔ rejects non-semver versions instead of publishing a bad pointer (5.427331ms)
  ✔ sha256FileHex matches the manifest's hashing (2.712546ms)
✔ buildManifest (190.104299ms)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (114.771497ms)
  ✔ rejects non-semver versions instead of tarring them (34.826824ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (5.798365ms)
  ✔ agrees with buildManifest on the asset filename grammar (190.218425ms)
✔ packageRunner (346.339014ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (8.613231ms)
✔ installSteps (20.867822ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (5.340452ms)
  ✔ root .npmrc documents the per-dir mirrors (0.551626ms)
✔ installSteps npmrc (6.289786ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.498697ms)
  ✔ installs the browser alone on macOS and Windows (4.543139ms)
✔ playwrightAttempts (6.441143ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.379243ms)
✔ npxExecutable (0.701303ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (16.246427ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (0.315818ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.249704ms)
✔ browserInstallTargets (17.232917ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-15LwOU/Sanity/docs' -> '/tmp/kainbain-sanity-notes-xUyxJr/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-9cG3AX/Sanity/docs' -> '/tmp/kainbain-sanity-notes-bcq9Jm/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-9cG3AX/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-bcq9Jm/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-9cG3AX/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-bcq9Jm/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-tqf2fW/Sanity/docs' -> '/tmp/kainbain-sanity-notes-zV3im7/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-mDa826/Sanity/docs' -> '/tmp/kainbain-sanity-notes-m94J5n/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-mDa826/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-m94J5n/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-mDa826/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-m94J5n/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-hQFcux/Sanity/docs' -> '/tmp/kainbain-sanity-notes-dFPyU1/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-MmOChx/Sanity/docs' -> '/tmp/kainbain-sanity-notes-J38qbs/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-MmOChx/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-J38qbs/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-MmOChx/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-J38qbs/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (180.52825ms)
  ✔ leaves no fixture residue in the OS temp dir (497.269687ms)
✔ checkStorageSanity (688.960355ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (8.296642ms)
  ✔ rejects a missing entry path or a different file (7.305142ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (3139.494324ms)
✔ isMainModule (3158.935078ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (19.46663ms)
  ✔ returns 0 when the notes space has no tasks dir (16.327734ms)
✔ countNotesTasks (42.914385ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (456.177565ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (151.342562ms)
  ✔ syncs build-info.json alongside a moved manifest commit (214.721569ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (302.199022ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (785.979051ms)
  ✔ is idempotent: a second run appends no duplicate history (1327.003346ms)
  ✔ leaves an already-current primary manifest alone (674.829257ms)
✔ scripts/sync-tip-dist.mjs (3943.720243ms)
ℹ tests 362
ℹ suites 94
ℹ pass 361
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 49529.238182

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:155:2
✖ the baseline covers every currently-missing export (5641.286115ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'FLEET_ENTRY_UNAVAILABLE_REASON',
  +     file: 'api/flow/dispatch/fleetModelSnapshot.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'FLEET_SNAPSHOT_MAX_MODELS',
  +     file: 'api/flow/dispatch/fleetModelSnapshot.js',
  +     kind: 'const'
  +   },
  +   {
  +     exportName: 'FLEET_SNAPSHOT_MAX_QUARANTINED',
  +     file: 'api/flow/dispatch/fleetModelSnapshot.js',
  +     kind: 'const'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/tests/check-jsdoc-example.test.mjs:164:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at node:internal/test_runner/test:1903:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9
      at Array.map (<anonymous>) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { file: 'api/flow/dispatch/fleetModelSnapshot.js', exportName: 'FLEET_ENTRY_UNAVAILABLE_REASON', kind: 'const' }, { file: 'api/flow/dispatch/fleetModelSnapshot.js', exportName: 'FLEET_SNAPSHOT_MAX_MODELS', kind: 'const' }, { file: 'api/flow/dispatch/fleetModelSnapshot.js', exportName: 'FLEET_SNAPSHOT_MAX_QUARANTINED', kind: 'const' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (227s)
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
Running Canary Tests... [0;31mFAIL[0m (886s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 122 of 242 lines; showing the tail)
  ✓   78 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.6s)
  ✓   79 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.9s)
  ✓   80 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (1.9s)
  ✓   81 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.0s)
  ✓   82 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (1.9s)
  ✓   83 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.1s)
  ✓   84 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (1.9s)
  ✓   85 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.0s)
  ✓   86 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.1s)
  ✓   87 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.2s)
  ✓   88 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.5s)
  ✓   89 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.0s)
  ✓   90 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (2.7s)
  ✓   91 tests/survey-verify.spec.js:126:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (2.2s)
survey timings ms: reveal=71 save=64 submit=95
  ✓   92 tests/survey-verify.spec.js:150:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.8s)
  ✓   93 tests/survey-verify.spec.js:265:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.3s)
  ✓   94 tests/survey-verify.spec.js:296:7 › question-me survey verification › empty round advances via continue without parking (2.6s)
  ✓   95 tests/survey-verify.spec.js:323:7 › question-me survey verification › image questions: mock generation at park, pick one, chosen picture persisted (2.7s)
  ✓   96 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (6.6s)
  ✓   97 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.3s)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (3.0s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.2s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (3.0s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.8s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.0s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.1s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (1.9s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (5.4s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (5.4s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.1s)
  ✓  108 tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (4.7s)
  ✓  109 tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (5.7s)
  ✓  110 tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (5.0s)
  ✓  111 tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists (6.1s)
  ✓  112 tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar (5.4s)
  ✓  113 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (5.1s)
  ✓  114 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (5.2s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: f66659fe-5664-484c-8669-a5d0d6fc82d1
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1794386652723
goal submitted, polling latestTask
task id: 3e066eee-24af-4ca6-aff2-5fd3b580c16c stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  115 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (37.3s)
  ✓  116 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (5.2s)
  ✓  117 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.3s)
  ✓  118 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.2s)
  ✓  119 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.0s)
  ✓  120 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.2s)
  ✓  121 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.7s)
  ✓  122 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.6s)
  ✓  123 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.2s)
  ✓  124 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.7s)
  ✓  125 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.8s)
  ✓  126 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.0s)
  ✓  127 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.4s)
  ✓  128 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.6s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.1s)
  ✓  130 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.2s)
  ✓  131 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.5s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.3s)
  ✓  133 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.6s)
  ✓  134 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.2s)
  ✓  135 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.1s)
  ✓  136 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.2s)
  ✓  137 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (35.3s)
  ✓  138 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (3.2s)
  ✓  139 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.2s)
  ✓  140 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (4.1s)


  1) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: the status badge must not change when switching projects

    expect(locator).toHaveAttribute(expected) failed

    Locator:  locator('span[aria-label^="Engine status is "]')
    Expected: "Engine status is RUNNING"
    Received: "Engine status is IDLE"
    Timeout:  5000ms

    Call log:
      - the status badge must not change when switching projects locator('span[aria-label^="Engine status is "]') with timeout 5000ms
      - waiting for locator('span[aria-label^="Engine status is "]')
        14 × locator resolved to <span aria-label="Engine status is IDLE" class="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border cursor-help text-text-muted bg-surface-container border-border-standard">IDLE</span>
           - unexpected value "Engine status is IDLE"


      247 | 			statusBadge(page),
      248 | 			"the status badge must not change when switching projects",
    > 249 | 		).toHaveAttribute("aria-label", "Engine status is RUNNING");
          | 		  ^
      250 | 		await expect(page.getByLabel("Elapsed time in current stage")).toHaveCount(0);
      251 | 		await expect(
      252 | 			queueChip(page),
        at /home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/canary-e2e/tests/now-playing-cross-project.spec.js:249:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  Slow test file: tests/accessibility.spec.js (6.8m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  1 failed
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
  139 passed (14.7m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.