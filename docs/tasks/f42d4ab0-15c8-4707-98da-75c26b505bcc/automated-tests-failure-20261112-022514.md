<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 708011.139s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 116 packages, and audited 117 packages in 2s

15 packages are looking for funding
  run `npm fund` for details

2 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
Dependencies missing for api (@earendil-works/pi-coding-agent, @fastify/cors, @fastify/multipart, @fastify/static, @fastify/swagger, @fastify/swagger-ui, @fastify/websocket, @opencode-ai/sdk, adm-zip, eslint-config-prettier, fastify, semver, uuid, web-push, @vitest/coverage-v8, eslint, eslint-plugin-n, eslint-plugin-security, globals, vite, vitest) — installing (npm install --prefix api)...
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 346 packages, and audited 347 packages in 4s

84 packages are looking for funding
  run `npm fund` for details

6 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Dependencies missing for frontend (@testing-library/dom, react, react-dom, react-router, @testing-library/jest-dom, @testing-library/react, @vitejs/plugin-react, autoprefixer, eslint, eslint-config-prettier, eslint-plugin-jsx-a11y, eslint-plugin-no-unsanitized, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-security, globals, happy-dom, jsdom, postcss, prettier, tailwindcss, vite, vitest) — installing (npm install --prefix frontend)...

added 418 packages, and audited 419 packages in 4s

143 packages are looking for funding
  run `npm fund` for details

4 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...

added 5 packages, and audited 6 packages in 730ms

found 0 vulnerabilities
Workspace dependencies installed (api, frontend, canary-e2e).
✅ Settings duplicate check passed (30 files in 92ms)
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
Running Unit Tests (api)... [0;32mPASS[0m (200s)
Running Unit Tests (frontend)... [0;32mPASS[0m (200s)
Running Unit Tests (runner)... [0;32mPASS[0m (200s)
Running Linting (api)... [0;32mPASS[0m (200s)
Running Linting (frontend)... [0;32mPASS[0m (200s)
Running Frontend Build... [0;32mPASS[0m (200s)
Running Security Script Tests... [0;32mPASS[0m (200s)
Running Dependency Check... [0;32mPASS[0m (200s)
Running Dependency Audit Gate... [0;32mPASS[0m (200s)
Running Harness Self-Tests... [0;32mPASS[0m (200s)
Running Container Tests... [0;32mPASS[0m (200s)
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
⏳ still running: Canary Tests (18m00s)
⏳ still running: Canary Tests (18m30s)
⏳ still running: Canary Tests (19m01s)
⏳ still running: Canary Tests (19m31s)
⏳ still running: Canary Tests (20m01s)
⏳ still running: Canary Tests (20m31s)
⏳ still running: Canary Tests (21m01s)
Running Canary Tests... [0;31mFAIL[0m (1268s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 456 of 576 lines; showing the tail)
    Error Context: test-results/task-lifecycle-Task-Lifecy-62075-cement---advance---complete/error-context.md

  9) tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Timeout: 60000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()


       at helpers.js:47

      45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      48 | 		timeout: APP_READY_TIMEOUT_MS,
      49 | 	});
      50 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:47:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:121:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-db459--Reject-checkpoint-controls/error-context.md

  10) tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 

    Test timeout of 60000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()
      - Test timeout of 60000ms exceeded.


       at helpers.js:47

      45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      48 | 		timeout: APP_READY_TIMEOUT_MS,
      49 | 	});
      50 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:47:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:2)
        at submitGoal (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:30:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/task-lifecycle.spec.js:174:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/task-lifecycle-Task-Lifecy-47fe1-e-slide-over-task-inspector/error-context.md

  11) tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 

    Test timeout of 60000ms exceeded.

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('button', { name: /Project/i }).first()
    Expected: visible
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" getByRole('button', { name: /Project/i }).first() with timeout 60000ms
      - waiting for getByRole('button', { name: /Project/i }).first()
      - Test timeout of 60000ms exceeded.


       at helpers.js:47

      45 | 	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      46 | 	await expect(page).toHaveTitle(/Kainbain/);
    > 47 | 	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
         | 	                                                                     ^
      48 | 		timeout: APP_READY_TIMEOUT_MS,
      49 | 	});
      50 | }
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:47:71)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/helpers.js:90:2)
        at /home/[REDACTED]/.kainbain/runner-work/kb-f42d4ab0-15c8-4707-98da-75c26b505bcc/canary-e2e/tests/workflow.spec.js:58:3

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-56497-age-shows-review-checkpoint/error-context.md

  11 failed
    tests/accessibility.spec.js:223:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:258:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
  124 passed (21.1m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.