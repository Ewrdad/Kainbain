<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** images in tasks are randomly not loading ![18744.png](assets/18744.png) It seems to be after a short time or a page refresh images on tasks aren't shown in the UI. Hopefully still shown to the relevant tasks but uncertain Please fix this
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 734.115s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
 Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (163s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (163s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
(trimmed 11502 of 11622 lines; showing the tail)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mremove button drops the skill from stage.skills
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mrefresh control re-fetches the skills library
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/workflow/StageSkillsPanel.jsx:340:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m27 tests[22m[2m)[22m[33m 895[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.test.jsx[2m > [22mharness row offers the default harness plus the Alias entry (alias-free empty state)
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).not.toBeDisabled()[22m

Received element is disabled:
  [31m<button
  aria-controls="project-harness-select-listbox"
  aria-expanded="false"
  aria-haspopup="listbox"
  aria-label="AI Harness"
  class="w-full flex items-center justify-between gap-2 bg-surface-container hover:bg-surface-container-high border rounded-sm transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none select-none min-h-[44px] px-3 py-1.5 text-xs border-border-standard focus-visible:border-primary text-on-surface font-mono "
  disabled=""
  id="project-harness-select"
  role="combobox"
  type="button"
/>[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.test.jsx:[2m1215:30[22m[39m
    [90m1213|[39m   const harnessTrigger = await screen.findByRole('combobox', { name: '…
    [90m1214|[39m   expect(harnessTrigger.id).toBe('project-harness-select');
    [90m1215|[39m   expect(harnessTrigger).not.toBeDisabled();
    [90m   |[39m                              [31m^[39m
    [90m1216|[39m   fireEvent.click(harnessTrigger);
    [90m1217|[39m   expect(screen.getByRole('option', { name: /pi \(default\)/i })).toBe…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m287 passed[39m[22m[90m (288)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m3868 passed[39m[22m[90m (3869)[39m
[2m   Start at [22m 19:24:23
[2m   Duration [22m 52.00s[2m (tests 52%, setup 19%, worker 9%, environment 8%, import 7%, transform 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (163s)
Running Linting (api)... [0;32mPASS[0m (163s)
Running Linting (frontend)... [0;32mPASS[0m (163s)
Running Frontend Build... [0;32mPASS[0m (163s)
Running Security Script Tests... [0;32mPASS[0m (163s)
Running Dependency Check... [0;32mPASS[0m (163s)
Running Dependency Audit Gate... [0;32mPASS[0m (163s)
Running Harness Self-Tests... [0;32mPASS[0m (163s)
Running Container Tests... [0;32mPASS[0m (163s)
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
Running Canary Tests... [0;31mFAIL[0m (556s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 125 of 245 lines; showing the tail)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.7s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (4.8s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (2.2s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (3.4s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (1.6s)
  ✓  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (3.8s)
  ✓  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (3.7s)
  ✓  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (6.3s)
  ✓  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (3.8s)
  ✓  106 tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them (3.5s)
  ✓  107 tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open (3.8s)
  ✓  108 tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete (4.0s)
  ✓  109 tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets (3.5s)
TEST START: human stage renders Approve/Reject checkpoint controls
projectId: dbb5b4d0-e9db-4531-b0b3-ce07cf1feac2
stages count: 6
humanStage: 4 Review Plan
submitting goal: Human review 1793475304040
goal submitted, polling latestTask
task id: 40090941-8877-44a6-a58a-e6d445a1765a stageId before jump: undefined
jump status: 200
Reload attempt 0 starting...
page.reload finished on attempt 0
waitForAppReadyOnProject starting on attempt 0
waitForAppReadyOnProject succeeded on attempt 0
waiting for Approve/Reject buttons...
TEST FINISHED SUCCESSFULLY
  ✓  110 tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls (5.2s)
  ✓  111 tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector (3.7s)
  ✓  112 tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds (2.5s)
  ✓  113 tests/task-logs.spec.js:146:6 › Agent-log readability › long lines wrap without breaking the inspector layout (3.4s)
  ✓  114 tests/task-logs.spec.js:167:6 › Agent-log readability › a fresh task shows the initialized placeholder, not a blank page (2.3s)
  ✓  115 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state (2.3s)
  ✓  116 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) (3.2s)
  ✓  117 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) (3.6s)
  ✓  118 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state (2.1s)
  ✓  119 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) (3.1s)
  ✓  120 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) (4.0s)
  ✓  121 tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state (1.9s)
  ✓  122 tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) (3.3s)
  ✓  123 tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) (3.1s)
  ✓  124 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px (2.0s)
  ✓  125 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px (3.4s)
  ✓  126 tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px (2.0s)
  ✓  127 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop (2.6s)
  ✓  128 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet (2.0s)
  ✓  129 tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile (3.6s)
  ✓  130 tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake (2.7s)
  ✓  131 tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage (2.7s)
  ✓  132 tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint (3.7s)
  ✓  133 tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls (2.8s)
  ✓  134 tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow (2.5s)
  ✓  135 tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel (3.6s)


  1) tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: the global queue depth must not change when switching projects

    expect(locator).toHaveAttribute(expected) failed

    Locator:  locator('div[aria-label^="Execution queue:"]')
    Expected: "Execution queue: 0 open tasks across all pipelines"
    Received: "Execution queue: 3 open tasks across all pipelines"
    Timeout:  5000ms

    Call log:
      - the global queue depth must not change when switching projects locator('div[aria-label^="Execution queue:"]') with timeout 5000ms
      - waiting for locator('div[aria-label^="Execution queue:"]')
        14 × locator resolved to <div role="status" aria-label="Execution queue: 3 open tasks across all pipelines" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-help select-none">…</div>
           - unexpected value "Execution queue: 3 open tasks across all pipelines"


      252 | 			queueChip(page),
      253 | 			"the global queue depth must not change when switching projects",
    > 254 | 		).toHaveAttribute("aria-label", depthLabelOnA);
          | 		  ^
      255 | 		// The engine-owner chip names the OWNING project, not the selected one.
      256 | 		await expect(page.getByText("[Project A]", { exact: true })).toBeVisible();
      257 |
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/canary-e2e/tests/now-playing-cross-project.spec.js:254:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  2) tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 

    Error: expect(received).toMatch(expected)

    Expected pattern: /^completed ::/
    Received string:  "failed :: Merge of 'kb/f946f807-18aa-45e9-9933-baa7a7d6ed42' landed on 'main' but publishing it failed (git push -u origin main failed (exit 128): fatal: unable to access 'https://git.example.com/canary/pr-review-canary-1793475143125.git/': Could not resolve host: git.example.com) — the local branch is ahead "

    Call Log:
    - Timeout 30000ms exceeded while waiting on the predicate

      342 | 				{ timeout: 30000 },
      343 | 			)
    > 344 | 			.toMatch(/^completed ::/);
          | 			 ^
      345 | 		const merged = git(repoDir, ["show", "main:src/session.js"]);
      346 | 		expect(merged).toContain("if (b == null) return 0;");
      347 | 	});
        at /home/[REDACTED]/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/canary-e2e/tests/pr-review.spec.js:344:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/pr-review-PR-Review-E2E-op-06c1d-review-stale-→-pass-→-merge/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/pr-review-PR-Review-E2E-op-06c1d-review-stale-→-pass-→-merge/error-context.md

  2 failed
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 
  3 did not run
  130 passed (9.3m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.