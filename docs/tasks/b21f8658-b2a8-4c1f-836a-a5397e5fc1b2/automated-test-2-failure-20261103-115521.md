<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** top bar on mobile quick view can be compressed ![18850.png](assets/18850.png) I like showing the runners but the in progress/active chip is unnamed as well as the legacy left over from the old UI where we had it single threaded. If we could clean that up itd be great
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 564.161s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

added 116 packages, and audited 117 packages in 2s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 98ms)
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
⏳ still running: Unit Tests (api) (32s), Unit Tests (frontend) (32s), Linting (frontend) (32s), Frontend Build (32s), Dependency Check (32s), Dependency Audit Gate (32s), Harness Self-Tests (32s)
⏳ still running: Unit Tests (api) (1m01s), Unit Tests (frontend) (1m01s), Linting (frontend) (1m01s)
⏳ still running: Unit Tests (api) (1m31s), Unit Tests (frontend) (1m31s), Linting (frontend) (1m31s)
⏳ still running: Unit Tests (api) (2m01s), Unit Tests (frontend) (2m01s), Linting (frontend) (2m01s)
⏳ still running: Unit Tests (api) (2m31s), Unit Tests (frontend) (2m31s), Linting (frontend) (2m31s)
⏳ still running: Unit Tests (api) (3m01s), Unit Tests (frontend) (3m01s), Linting (frontend) (3m01s)
⏳ still running: Unit Tests (api) (3m32s), Unit Tests (frontend) (3m32s), Linting (frontend) (3m32s)
⏳ still running: Unit Tests (api) (4m02s), Unit Tests (frontend) (4m02s), Linting (frontend) (4m02s)
⏳ still running: Unit Tests (api) (4m32s), Unit Tests (frontend) (4m32s)
⏳ still running: Unit Tests (api) (5m02s)
⏳ still running: Unit Tests (api) (5m32s)
⏳ still running: Unit Tests (api) (6m02s)
Running Unit Tests (api)... [0;32mPASS[0m (365s)
Running Unit Tests (frontend)... [0;32mPASS[0m (365s)
Running Unit Tests (runner)... [0;32mPASS[0m (365s)
Running Linting (api)... [0;32mPASS[0m (365s)
Running Linting (frontend)... [0;32mPASS[0m (365s)
Running Frontend Build... [0;32mPASS[0m (365s)
Running Security Script Tests... [0;32mPASS[0m (365s)
Running Dependency Check... [0;32mPASS[0m (365s)
Running Dependency Audit Gate... [0;32mPASS[0m (365s)
Running Harness Self-Tests... [0;32mPASS[0m (365s)
Running Container Tests... [0;32mPASS[0m (365s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
Running Canary Tests... [0;31mFAIL[0m (192s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 2656 of 2776 lines; showing the tail)
        at waitForAppReady (/home/[REDACTED]/.kainbain/runner-work/kb-b21f8658-b2a8-4c1f-836a-a5397e5fc1b2/canary-e2e/tests/helpers.js:45:13)
        at waitForAppReadyOnProject (/home/[REDACTED]/.kainbain/runner-work/kb-b21f8658-b2a8-4c1f-836a-a5397e5fc1b2/canary-e2e/tests/helpers.js:90:8)
        at /home/[REDACTED]/.kainbain/runner-work/kb-b21f8658-b2a8-4c1f-836a-a5397e5fc1b2/canary-e2e/tests/workflow.spec.js:12:33

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/error-context.md

  107 failed
    tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 
    tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:148:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations 
    tests/accessibility.spec.js:159:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) 
    tests/accessibility.spec.js:179:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 
    tests/accessibility.spec.js:188:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 
    tests/accessibility.spec.js:200:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus 
    tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
    tests/accessibility.spec.js:280:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:286:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:292:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 
    tests/accessibility.spec.js:305:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 
    tests/accessibility.spec.js:318:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations 
    tests/accessibility.spec.js:329:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 
    tests/accessibility.spec.js:352:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations 
    tests/accessibility.spec.js:373:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 
    tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL 
    tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override 
    tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published 
    tests/engine-isolation.spec.js:20:6 › scratch-stack engine isolation › containment-state file resolves inside the scratch roots 
    tests/engine-isolation.spec.js:34:6 › scratch-stack engine isolation › agent stages run on the mock harness, never ambient models 
    tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console 
    tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit 
    tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges 
    tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/functional.spec.js:158:6 › KainBain Functional E2E Tests › in-place column task creation ─
    tests/functional.spec.js:176:6 › KainBain Functional E2E Tests › project selector lists projects and switches 
    tests/functional.spec.js:198:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px 
    tests/homepage.spec.js:4:5 › homepage has correct title ────────────────────────────────────────
    tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit ────────────────────────
    tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip 
    tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column 
    tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls 
    tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping 
    tests/mobile-responsive.spec.js:120:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:149:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:165:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 
    tests/mobile-responsive.spec.js:217:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover 
    tests/mobile-responsive.spec.js:232:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip 
    tests/mobile-responsive.spec.js:244:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 
    tests/mobile-responsive.spec.js:270:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 
    tests/mobile-responsive.spec.js:348:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen 
    tests/mobile-responsive.spec.js:375:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover 
    tests/mobile-responsive.spec.js:415:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport 
    tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B 
    tests/pr-review.spec.js:171:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge 
    tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses 
    tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it 
    tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back 
    tests/retrospective.spec.js:13:5 › retrospective page renders without page errors ──────────────
    tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors ─
    tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip 
    tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets 
    tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region 
    tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways 
    tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes 
    tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors ───────────────────
    tests/runtime-errors.spec.js:23:5 › app renders without console errors ─────────────────────────
    tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API 
    tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config 
    tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances 
    tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs 
    tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport 
    tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar 
    tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop 
    tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar 
    tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back 
    tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route 
    tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window 
    tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) 
    tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact 
    tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content 
    tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle 
    tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:57:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-inspector.spec.js:85:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 
    tests/task-lifecycle.spec.js:41:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:84:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:108:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:171:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
    tests/task-logs.spec.js:109:6 › Agent-log readability › structured run output renders readably across feeds 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Desktop › Empty state ────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Desktop › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Desktop › Populated history (tasks + session tree) 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Tablet › Empty state ─────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Tablet › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Tablet › Populated history (tasks + session tree) 
    tests/visual/dashboard.spec.js:65:8 › Dashboard Visuals › Mobile › Empty state ─────────────────
    tests/visual/dashboard.spec.js:82:8 › Dashboard Visuals › Mobile › Active execution (task card in canvas) 
    tests/visual/dashboard.spec.js:96:8 › Dashboard Visuals › Mobile › Populated history (tasks + session tree) 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Mobile 375px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Tablet 1024px 
    tests/visual/header.spec.js:23:7 › Header Visuals (task 66ad153f) › header band at Desktop 1280px 
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Desktop ────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Tablet ─────────────
    tests/visual/homepage.spec.js:44:7 › Homepage Visuals › visual regression - Mobile ─────────────
    tests/websocket.spec.js:42:5 › frontend connects to the backend WebSocket and receives the handshake 
    tests/workflow.spec.js:18:6 › Workflow E2E Tests › Task Creation: In-line add task -> verify card appears in kanban stage 
    tests/workflow.spec.js:38:6 › Workflow E2E Tests › Stage types: human stage shows review checkpoint 
    tests/workflow.spec.js:66:6 › Workflow E2E Tests › Now Playing bar: runner boxes own play/skip, no global engine controls 
    tests/workflow.spec.js:97:6 › Workflow E2E Tests › Project isolation: switching project loads its own workflow 
    tests/workflow.spec.js:114:6 › Workflow E2E Tests › Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel 
  22 did not run
  6 passed (3.2m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.