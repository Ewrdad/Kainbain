<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Enforce binary-safe proof artifacts and repo-root scratch hygiene
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1142.304s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-4XSI12/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-p9fFdH/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-jlLiPK/Sanity/docs' -> '/tmp/kainbain-sanity-notes-70GaIL/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-qhguJx/Sanity/docs' -> '/tmp/kainbain-sanity-notes-x5U8kn/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-qhguJx/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-x5U8kn/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-qhguJx/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-x5U8kn/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (159.103428ms)
  ✔ leaves no fixture residue in the OS temp dir (690.677799ms)
✔ checkStorageSanity (855.847935ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (0.607038ms)
  ✔ rejects a missing entry path or a different file (0.293485ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (1214.219756ms)
✔ isMainModule (1215.438599ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.343116ms)
  ✔ returns 0 when the notes space has no tasks dir (0.837528ms)
✔ countNotesTasks (2.674867ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (424.087249ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (289.159195ms)
  ✔ syncs build-info.json alongside a moved manifest commit (208.94809ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (234.876711ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (186.860131ms)
  ✔ is idempotent: a second run appends no duplicate history (443.759479ms)
  ✔ leaves an already-current primary manifest alone (493.27295ms)
✔ scripts/sync-tip-dist.mjs (2286.698394ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (22.533868ms)
✔ parseVerifyArgs (23.69632ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (0.58953ms)
✔ findHistoryTokens (34.874818ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (308.072995ms)
  ✔ defaults to the latest token when no SHA is given (123.622481ms)
  ✔ fails when the history token was tampered with (226.21549ms)
  ✔ fails when history names a commit the repo does not know (165.781223ms)
  ✔ fails when history carries no token, and when the task file is missing (200.025845ms)
  ✔ fails the pinned-config check on drifted config (168.659452ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1222.765192ms)
✔ verifyFromRepo (2418.193032ms)
ℹ tests 449
ℹ suites 118
ℹ pass 446
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 84864.639974

✖ failing tests:

test at tests/install-runner-wrapper.test.mjs:34:2
✖ --dry-run reports the wrapper paths and writes nothing (380.548892ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /INSTALL_ROOT=\/tmp\/kb-install-home-KygE7s\/\.kainbain\/runner-install/. Input:
  
  'UNIT=/tmp/kb-install-home-KygE7s/.config/systemd/user/kainbain-runner-local-x.service\n' +
    'ENV=/tmp/kb-install-home-KygE7s/.kainbain/runner-local-x.env\n' +
    'RUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/runner\n' +
    'TREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31\n' +
    'INSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\n' +
    'BACKEND=http://localhost:3100\n'
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:42:11)
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
    actual: 'UNIT=/tmp/kb-install-home-KygE7s/.config/systemd/user/kainbain-runner-local-x.service\nENV=/tmp/kb-install-home-KygE7s/.kainbain/runner-local-x.env\nRUNNER_DIR=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/runner\nTREE_ROOT=/home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31\nINSTALL_ROOT=/home/[REDACTED]/.kainbain/runner-install/local-alpha\nBACKEND=http://localhost:3100\n',
    expected: /INSTALL_ROOT=\/tmp\/kb-install-home-KygE7s\/\.kainbain\/runner-install/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/install-runner-wrapper.test.mjs:49:2
✖ writes a wrapper unit + env and lays the versioned tree down (1579.778863ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-Qm4Pr0/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:62:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1869:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'readlink',
    path: '/tmp/kb-install-home-Qm4Pr0/.kainbain/runner-install/current'
  }

test at tests/install-runner-wrapper.test.mjs:112:2
✖ creates a wrapper unit and lays the versioned tree down (1634.384821ms)
  Error: ENOENT: no such file or directory, readlink '/tmp/kb-install-home-LPx7cB/.kainbain/runner-install/current'
      at Object.readlinkSync (node:fs:2148:18)
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/tests/install-runner-wrapper.test.mjs:124:20)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at node:internal/test_runner/test:1867:71
      at node:internal/per_context/primordials:504:82
      at new Promise (<anonymous>)
      at new SafePromise (node:internal/per_context/primordials:478:3)
      at node:internal/per_context/primordials:504:9 {
    errno: -2,
    code: 'ENOENT',
    syscall: 'readlink',
    path: '/tmp/kb-install-home-LPx7cB/.kainbain/runner-install/current'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (222s)
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
  ✓   80 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (3.1s)
  ✓   81 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.5s)
  ✓   82 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (1.9s)
  ✓   83 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (3.1s)
  ✓   84 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.5s)
  ✓   85 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (3.7s)
  ✓   86 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.2s)
  ✓   87 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.3s)
  ✓   88 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.8s)
  ✓   89 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (3.0s)
  ✓   90 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (3.0s)
  ✓   91 tests/survey-verify.spec.js:126:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (2.6s)
survey timings ms: reveal=38 save=78 submit=93
  ✓   92 tests/survey-verify.spec.js:150:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.6s)
  ✓   93 tests/survey-verify.spec.js:265:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (4.3s)
  ✓   94 tests/survey-verify.spec.js:296:7 › question-me survey verification › empty round advances via continue without parking (2.4s)
  ✓   95 tests/survey-verify.spec.js:323:7 › question-me survey verification › image questions: mock generation at park, pick one, chosen picture persisted (2.4s)
  ✓   96 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (6.3s)
  ✓   97 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.0s)
  ✓   98 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.9s)
  ✓   99 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (2.4s)
  ✓  100 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.8s)
  ✓  101 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.7s)
  ✓  102 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (1.9s)
  ✓  103 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (2.1s)
  ✓  104 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (2.1s)
  ✓  105 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (4.4s)
  ✓  106 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (5.6s)
  ✓  107 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (2.0s)
  ✓  108 tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (5.0s)
  ✓  109 tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (6.8s)
  ✓  110 tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (4.6s)
  ✓  111 tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists (4.5s)
  ✓  112 tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar (4.6s)
  ✓  113 tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (4.1s)
  ✓  114 tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (4.9s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: 8dffdbd0-e34d-407d-b926-c7d55a6709a0
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1794684031520
goal submitted, polling latestTask
task id: d00e64f9-3368-49eb-b729-7eaf8cc22d43 stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  115 tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (8.3s)
  ✓  116 tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (4.4s)
  ✓  117 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.7s)
  ✓  118 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (2.9s)
  ✓  119 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.5s)
  ✓  120 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (3.1s)
  ✓  121 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (5.4s)
  ✓  122 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (4.6s)
  ✓  123 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.2s)
  ✓  124 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (4.1s)
  ✓  125 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (4.2s)
  ✓  126 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (2.5s)
  ✓  127 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.7s)
  ✓  128 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.8s)
  ✓  129 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.5s)
  ✓  130 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (2.9s)
waitForFontsSettled: icon font not settled within 15 s, measuring anyway (page.waitForFunction: Timeout 15000ms exceeded.)
  ✘  131 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (51.2s)
  ✓  132 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.4s)
  ✓  133 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (3.2s)
  ✓  134 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (2.0s)
  ✓  135 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (4.6s)
  ✓  136 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (3.7s)
  ✓  137 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (5.0s)
  ✓  138 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (7.5s)
  ✓  139 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (4.8s)
  ✓  140 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (6.2s)


  1) tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 

    Error: expect(locator).toHaveScreenshot(expected) failed

    Locator: locator('header').first()
    Timeout: 30000ms
      Timeout 30000ms exceeded.

      Snapshot: header-desktop-1280.png

    Call log:
      - Expect "toHaveScreenshot(header-desktop-1280.png)" locator('header').first() with timeout 30000ms
        - verifying given screenshot expectation
      - waiting for locator('header').first()
        - locator resolved to <header class="border-b border-border-standard bg-surface flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-1 px-2 sm:px-6 pb-1 sm:pb-0 sm:h-16 sticky top-0 z-40">…</header>
      - taking element screenshot
        - disabled all CSS animations
      - waiting for fonts to load...
      - Timeout 30000ms exceeded.


      27 | 			const header = page.locator("header").first();
      28 | 			await expect(header).toBeVisible();
    > 29 | 			await expect(header).toHaveScreenshot(
         | 			                     ^
      30 | 				`header-${viewport.name.toLowerCase()}-${viewport.width}.png`,
      31 | 				SCREENSHOT_OPTS,
      32 | 			);
        at /home/[REDACTED]/.kainbain/runner-work/kb-b1c069e0-1875-4aa7-b51d-4c4399b2be31/canary-e2e/tests/visual/header.spec.js:29:25

    attachment #1: header-desktop-1280 (image/png) ─────────────────────────────────────────────────
    tests/visual/header.spec.js-snapshots/header-desktop-1280-linux.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/visual-header-Header-Visua-73da6-ader-band-at-Desktop-1280px/error-context.md

  Slow test file: tests/accessibility.spec.js (6.7m)
  Consider running tests from slow files in parallel. See: https://playwright.dev/docs/test-parallel
  1 failed
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 
  139 passed (14.7m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.