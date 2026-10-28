<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** can you please break the project settings down to more tabs mainly want aliases in their own tab like skills . And maybe a one for custom file/web addresses. generally just neeeds to be easier to use. Maybe worth adding a settings search to the top right thats unused for project settings  ![image.png](assets/image.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 888.993s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 812ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (28 files in 98ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (168s)
Running Unit Tests (frontend)... [0;32mPASS[0m (168s)
Running Linting (api)... [0;32mPASS[0m (168s)
Running Linting (frontend)... [0;32mPASS[0m (168s)
Running Frontend Build... [0;32mPASS[0m (168s)
Running Security Script Tests... [0;32mPASS[0m (168s)
Running Dependency Check... [0;32mPASS[0m (168s)
Running Dependency Audit Gate... [0;32mPASS[0m (168s)
Running Harness Self-Tests... [0;31mFAIL[0m (168s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
(trimmed 499 of 619 lines; showing the tail)
    'flood-line-118\n' +
    'flood-line-119\n' +
    'flood-line-120\n' +
    'flood-line-121\n' +
    'flood-line-122\n' +
    'flood-line-123\n' +
    'flood-line-124\n' +
    'flood-line-125\n' +
    'flood-line-126\n' +
    'flood-line-127\n' +
    'flood-line-128\n' +
    'flood-line-129\n' +
    'flood-line-130\n' +
    'flood-line-131\n' +
    'flood-line-132\n' +
    'flood-line-133\n' +
    'flood-line-134\n' +
    'flood-line-135\n' +
    'flood-line-136\n' +
    'flood-line-137\n' +
    'flood-line-138\n' +
    'flood-line-139\n' +
    'flood-line-140\n' +
    'flood-line-141\n' +
    'flood-line-142\n' +
    'flood-line-143\n' +
    'flood-line-144\n' +
    'flood-line-145\n' +
    'flood-line-146\n' +
    'flood-line-147\n' +
    'flood-line-148\n' +
    'flood-line-149\n' +
    'flood-line-150\n' +
    'flood-line-151\n' +
    'flood-line-152\n' +
    'flood-line-153\n' +
    'flood-line-154\n' +
    'flood-line-155\n' +
    'flood-line-156\n' +
    'flood-line-157\n' +
    'flood-line-158\n' +
    'flood-line-159\n' +
    'flood-line-160\n' +
    'flood-line-161\n' +
    'flood-line-162\n' +
    'flood-line-163\n' +
    'flood-line-164\n' +
    'flood-line-165\n' +
    'flood-line-166\n' +
    'flood-line-167\n' +
    'flood-line-168\n' +
    'flood-line-169\n' +
    'flood-line-170\n' +
    'flood-line-171\n' +
    'flood-line-172\n' +
    'flood-line-173\n' +
    'flood-line-174\n' +
    'flood-line-175\n' +
    'flood-line-176\n' +
    'flood-line-177\n' +
    'flood-line-178\n' +
    'flood-line-179\n' +
    'flood-line-180\n' +
    'flood-line-181\n' +
    'flood-line-182\n' +
    'flood-line-183\n' +
    'flood-line-184\n' +
    'flood-line-185\n' +
    'flood-line-186\n' +
    'flood-line-187\n' +
    'flood-line-188\n' +
    'flood-line-189\n' +
    'flood-line-190\n' +
    'flood-line-191\n' +
    'flood-line-192\n' +
    'flood-line-193\n' +
    'flood-line-194\n' +
    'flood-line-195\n' +
    'flood-line-196\n' +
    'flood-line-197\n' +
    'flood-line-198\n' +
    'flood-line-199\n' +
    'flood-line-200\n' +
    'flood-line-201\n' +
    'flood-line-202\n' +
    'flood-line-203\n' +
    'flood-line-204\n' +
    'flood-line-205\n' +
    'flood-line-206\n' +
    'flood-line-207\n' +
    'flood-line-208\n' +
    'flood-line-209\n' +
    'flood-line-210\n' +
    'flood-line-211\n' +
    'flood-line-212\n' +
    'flood-line-213\n' +
    'flood-line-214\n' +
    'flood-line-215\n' +
    'flood-line-216\n' +
    'flood-line-217\n' +
    'flood-line-218\n' +
    'flood-line-219\n' +
    'flood-line-220\n' +
    'flood-line-221\n' +
    'flood-line-222\n' +
    'flood-line-223\n' +
    'flood-line-224\n' +
    '----------------------------------------------------------------------\n'
  
      at TestContext.<anonymous> (file:///home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/tests/run-parallel.test.mjs:187:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '▸ started Noisy Step\nRunning Noisy Step... \x1B[0;31mFAIL\x1B[0m (1s)\n----------------------------------------------------------------------\nDetails for Noisy Step:\n(trimmed 105 of 225 lines; showing the tail)\nflood-line-105\nflood-line-106\nflood-line-107\nflood-line-108\nflood-line-109\nflood-line-110\nflood-line-111\nflood-line-112\nflood-line-113\nflood-line-114\nflood-line-115\nflood-line-116\nflood-line-117\nflood-line-118\nflood-line-119\nflood-line-120\nflood-line-121\nflood-line-122\nflood-line-123\nflood-line-124\nflood-line-125\nflood-line-126\nflood-line-127\nflood-line-128\nflood-line-129\nflood-line-130\nflood-line-131\nflood-line-132\nflood-line-133\nflood-line-134\nflood-line-135\nflood-line-136\nflood-line-137\nflood-line-138\nflood-line-139\nflood-line-140\nflood-line-141\nflood-line-142\nflood-line-143\nflood-line-144\nflood-line-145\nflood-line-146\nflood-line-147\nflood-line-148\nflood-line-149\nflood-line-150\nflood-line-151\nflood-line-152\nflood-line-153\nflood-line-154\nflood-line-155\nflood-line-156\nflood-line-157\nflood-line-158\nflood-line-159\nflood-line-160\nflood-line-161\nflood-line-162\nflood-line-163\nflood-line-164\nflood-line-165\nflood-line-166\nflood-line-167\nflood-line-168\nflood-line-169\nflood-line-170\nflood-line-171\nflood-line-172\nflood-line-173\nflood-line-174\nflood-line-175\nflood-line-176\nflood-line-177\nflood-line-178\nflood-line-179\nflood-line-180\nflood-line-181\nflood-line-182\nflood-line-183\nflood-line-184\nflood-line-185\nflood-line-186\nflood-line-187\nflood-line-188\nflood-line-189\nflood-line-190\nflood-line-191\nflood-line-192\nflood-line-193\nflood-line-194\nflood-line-195\nflood-line-196\nflood-line-197\nflood-line-198\nflood-line-199\nflood-line-200\nflood-line-201\nflood-line-202\nflood-line-203\nflood-line-204\nflood-line-205\nflood-line-206\nflood-line-207\nflood-line-208\nflood-line-209\nflood-line-210\nflood-line-211\nflood-line-212\nflood-line-213\nflood-line-214\nflood-line-215\nflood-line-216\nflood-line-217\nflood-line-218\nflood-line-219\nflood-line-220\nflood-line-221\nflood-line-222\nflood-line-223\nflood-line-224\n----------------------------------------------------------------------\n',
    expected: /flood-line-299/,
    operator: 'match',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (168s)
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
Running Canary Tests... [0;31mFAIL[0m (715s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 278 of 398 lines; showing the tail)
      - navigating to "http://localhost:5299/", waiting until "domcontentloaded"


      49 |   // gated explicitly below (title + h1 + Orchestrator button), and scan()
      50 |   // additionally waits for fonts + build badge before measuring.
    > 51 |   await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
         |              ^
      52 |   await expect(page).toHaveTitle(/Kainbain/);
      53 |   // The app shell must be rendered: brand heading + primary navigation.
      54 |   await expect(page.locator("h1")).toContainText("KAINBAIN");
        at waitForAppShell (/home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:51:14)
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/accessibility.spec.js:60:11

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/accessibility-Accessibilit-2dcd0--open-has-no-axe-violations/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/accessibility-Accessibilit-2dcd0--open-has-no-axe-violations/error-context.md

  6) tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('Tap guard task 1793179756564').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('Tap guard task 1793179756564').first() with timeout 10000ms
      - waiting for getByText('Tap guard task 1793179756564').first()


      247 |
      248 | 		const cardTitle = page.getByText(goal).first();
    > 249 | 		await expect(cardTitle).toBeVisible({ timeout: 10000 });
          | 		                        ^
      250 | 		// Non-button card region: tap opens the slide-over inspector.
      251 | 		// The goal row keeps animating on this board (live status tickers), so a
      252 | 		// real tap never reaches Playwright's stability window; dispatch the
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/mobile-responsive.spec.js:249:27

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/mobile-responsive-Mobile-t-7b83b-pector-and-it-can-be-closed/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/mobile-responsive-Mobile-t-7b83b-pector-and-it-can-be-closed/error-context.md

  7) tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 

    Error: expect(locator).toContainText(expected) failed

    Locator: getByTestId('now-playing-task-name')
    Expected substring: "Now Playing owner run 1793179783577"
    Received string:    "Now Playing Cross-Project E2E | Task detail waiting a11y 1793179797844"
    Timeout: 20000ms

    Call log:
      - Expect "toContainText" getByTestId('now-playing-task-name') with timeout 20000ms
      - waiting for getByTestId('now-playing-task-name')
        8 × locator resolved to <span data-testid="now-playing-task-name" class="now-playing-task-enter font-headline-sm text-xs sm:text-headline-sm text-on-surface group-hover:text-primary transition-colors truncate">Now Playing Cross-Project E2E | Task detail waiti…</span>
          - unexpected value "Now Playing Cross-Project E2E | Task detail waiting a11y 1793179797844"


      219 |
      220 | 		// On Project A the bar names the running owner and shows RUNNING.
    > 221 | 		await expect(ownerName(page)).toContainText(goal, { timeout: 20000 });
          | 		                              ^
      222 | 		await expect(statusBadge(page)).toHaveAttribute(
      223 | 			"aria-label",
      224 | 			"Engine status is RUNNING",
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/now-playing-cross-project.spec.js:221:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

    Error Context: test-results/now-playing-cross-project--2322a-from-Project-A-to-Project-B/error-context.md

  8) tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 

    Error: expect(locator).toBeVisible() failed

    Locator: getByText('E2E task 1793179961692').first()
    Expected: visible
    Timeout: 10000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByText('E2E task 1793179961692').first() with timeout 10000ms
      - waiting for getByText('E2E task 1793179961692').first()


      59 |
      60 | 		// The unified Kanban board renders the task card directly under the first stage column.
    > 61 | 		await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
         | 		                                           ^
      62 |
      63 | 		// Advance the task to the next stage via the API; the card moves.
      64 | 		await page.request.post(`${API_BASE}/tasks/${task.id}/advance`, {
        at /home/server/.kainbain/runner-work/kb-3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5/canary-e2e/tests/task-lifecycle.spec.js:61:46

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  8 failed
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:272:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
    tests/accessibility.spec.js:278:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:284:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:290:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 
    tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 
    tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
  127 passed (11.9m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.