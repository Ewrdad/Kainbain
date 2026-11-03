<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** add commit history based changelog to the ui This existed in the old UI butlikely got removed when we purged git history. The old one existed on the top bar but I think it is worth moving it to the now playing bar as a slighting greyed out #buildhash on the left of the queue. This should be a build number/hash and then should be clickable and show the git history of main up to this point (which should mostly be task x merged into master squash commits, some fancy behavuour may be needed to filter out just admin commits)  This will also need to be bundled as the usual deployment obvs wont have access to commit history
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 915.44s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
846414ms)
▶ splitGatePhases
  ✔ runs Canary Tests in the serial phase after the fast overlap window (22.222499ms)
  ✔ leaves an opted-out gate as one fast phase with no canary phase (0.324093ms)
✔ splitGatePhases (22.703763ms)
▶ resolveCanary
  ✔ runs canary by default (parity with deploy.sh --prod) (0.264944ms)
  ✔ accepts the legacy --canary opt-in as a no-op (0.095375ms)
  ✔ opts out via --no-canary (0.074215ms)
  ✔ opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out) (0.074038ms)
  ✔ treats other KAINBAIN_SKIP_CANARY values as unset (0.073723ms)
  ✔ skip flags win over the legacy opt-in flags (0.07936ms)
✔ resolveCanary (0.907868ms)
▶ depcheckAvailable
  ✔ reports true when the root tree carries the posix binary (0.548045ms)
  ✔ reports true when the root tree carries the Windows binary (0.393432ms)
  ✔ reports false when the platform's binary name is missing (0.325278ms)
  ✔ reports false when the root tree has no binaries at all (0.252873ms)
✔ depcheckAvailable (25.857793ms)
▶ workspaceDepsInstalled
  ✔ reports installed when every workspace dependency resolves (1.212492ms)
  ✔ names the missing modules per package when node_modules is absent (fresh runner clone) (35.397887ms)
  ✔ reports not installed when a package manifest is unreadable (2.251542ms)
✔ workspaceDepsInstalled (42.212501ms)
▶ ensureWorkspaceDeps
  ✔ provisions api and frontend but never touches canary when canary is opted out (23.281459ms)
  ✔ does not spawn when every workspace dependency is already present (27.489682ms)
  ✔ installs each missing package through npm and re-verifies (41.817729ms)
  ✔ fails loudly when an install exits non-zero (never a silent skip) (0.726886ms)
✔ ensureWorkspaceDeps (93.578216ms)
▶ pruneStaleTestDirectories
  ✔ removes old directories matching test prefixes and preserves young or unrelated entries (55.483379ms)
  ✔ returns zero and does not throw when directory does not exist (0.192231ms)
✔ pruneStaleTestDirectories (55.808072ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (8.262419ms)
✔ installSteps (13.151953ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (4.544053ms)
  ✔ root .npmrc documents the per-dir mirrors (0.287201ms)
✔ installSteps npmrc (6.111304ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.244865ms)
  ✔ installs the browser alone on macOS and Windows (4.128943ms)
✔ playwrightAttempts (5.182834ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (0.226364ms)
✔ npxExecutable (0.426721ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (1.596084ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (2.471073ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.43096ms)
✔ browserInstallTargets (4.886301ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-hJLNSF/Sanity/docs' -> '/tmp/kainbain-sanity-notes-njQuwn/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-y3hXvZ/Sanity/docs' -> '/tmp/kainbain-sanity-notes-DVJELy/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-y3hXvZ/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-DVJELy/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-y3hXvZ/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-DVJELy/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-FGkf6b/Sanity/docs' -> '/tmp/kainbain-sanity-notes-yKRfTr/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-Qy6wPR/Sanity/docs' -> '/tmp/kainbain-sanity-notes-VapTDB/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-Qy6wPR/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-VapTDB/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-Qy6wPR/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-VapTDB/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-YJL0LM/Sanity/docs' -> '/tmp/kainbain-sanity-notes-vhIuTK/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-UAAPdq/Sanity/docs' -> '/tmp/kainbain-sanity-notes-Q2IEVR/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-UAAPdq/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-Q2IEVR/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-UAAPdq/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-Q2IEVR/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (168.52706ms)
  ✔ leaves no fixture residue in the OS temp dir (395.287328ms)
✔ checkStorageSanity (565.250448ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (1.769641ms)
  ✔ rejects a missing entry path or a different file (10.492417ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2162.529016ms)
✔ isMainModule (2175.122838ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (0.785147ms)
  ✔ returns 0 when the notes space has no tasks dir (0.590264ms)
✔ countNotesTasks (1.671146ms)
ℹ tests 326
ℹ suites 84
ℹ pass 325
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 31954.546988

✖ failing tests:

test at tests/generate-changelog.test.mjs:80:2
✖ does not confuse lookalike prefixes with admin markers (34.451414ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/tests/generate-changelog.test.mjs:83:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (144s)
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
Running Canary Tests... [0;31mFAIL[0m (765s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 86 of 206 lines; showing the tail)
fatal: Needed a single revision
fatal: a branch named 'kb/116303ee-a62d-4960-8bb1-b13d3f258488' already exists
Already on 'kb/116303ee-a62d-4960-8bb1-b13d3f258488'
Switched to branch 'main'
Switched to branch 'kb/116303ee-a62d-4960-8bb1-b13d3f258488'
Switched to branch 'main'
  ✓   71 tests/pr-review.spec.js:164:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (4.8s)
  ✓   72 tests/pr-review.spec.js:363:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7) (1.8s)
  ✓   73 tests/pr-review.spec.js:405:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff (2.1s)
  ✓   74 tests/pr-review.spec.js:501:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow (2.0s)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=13 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (6.4s)
  ✓   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.2s)
  ✓   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.3s)
  ✓   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (5.8s)
  ✓   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.5s)
  ✓   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (1.7s)
  ✓   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.0s)
  ✓   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.0s)
  ✓   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.4s)
  ✓   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.0s)
  ✓   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.2s)
  ✓   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (5.9s)
  ✓   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (2.8s)
  ✓   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (4.1s)
  ✓   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (3.6s)
survey timings ms: reveal=43 save=65 submit=80
  ✓   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.6s)
  ✓   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (3.2s)
  ✓   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (1.9s)
  ✓   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (4.7s)
  ✓   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (3.0s)
  ✓   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.6s)
  ✓   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.3s)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.7s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.9s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.3s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (3.6s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.2s)
  ✓  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (4.2s)
  ✓  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (6.5s)
  ✓  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.7s)
  ✓  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (3.8s)
  ✓  106 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (3.8s)
  ✓  107 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (3.8s)
  ✓  108 tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (3.5s)
  ✓  109 tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.8s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: b474393c-dce9-4ea3-8d99-dab9e939f40c
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1793562634114
goal submitted, polling latestTask
task id: 7ee9ad48-e639-456e-b6c3-99ed1bd04335 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (5.0s)
  ✓  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3.9s)
  ✓  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.1s)
  ✓  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.1s)
  ✓  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.2s)
  ✓  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.5s)
  ✓  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (4.0s)
  ✓  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.1s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (1.9s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.4s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (3.7s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.2s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.2s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.8s)
  ✓  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.5s)
  ✓  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.1s)
  ✓  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (1.9s)
  ✓  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.3s)
  ✓  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.3s)
  ✓  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.3s)
  ✓  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.0s)
  ✓  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (2.6s)
  ✓  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (4.3s)
  ✓  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (4.3s)
  ✓  134 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (3.9s)
  ✓  135 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.2s)


  1) tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 

    Test timeout of 60000ms exceeded.

    Error: page.evaluate: Target page, context or browser has been closed

       at a11y/scanHelpers.js:50

      48 | 		.waitFor({ state: "visible", timeout: 15000 })
      49 | 		.catch(() => {});
    > 50 | 	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
         | 	                                                                   ^
      51 | 	return results.violations ?? [];
      52 | }
      53 |
        at AxeBuilder.analyze (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/node_modules/@axe-core/playwright/dist/index.js:236:16)
        at scanAxeViolations (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/a11y/scanHelpers.js:50:69)
        at assertViewClean (/home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/a11y/scanHelpers.js:228:24)
        at /home/[REDACTED]/.kainbain/runner-work/kb-91257d62-f181-4ee0-ab91-f00188221c78/canary-e2e/tests/accessibility.spec.js:98:5

    Error Context: test-results/accessibility-Accessibilit-77cb9--view-has-no-axe-violations/error-context.md

  1 failed
    tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 
  134 passed (12.7m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.