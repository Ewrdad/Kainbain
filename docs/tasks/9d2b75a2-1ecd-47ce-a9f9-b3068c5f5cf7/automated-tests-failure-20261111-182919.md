<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Runners are not autodetecting correctly  Key error seems to be with muse code but I suspect on others. Muse has just released a new model in the harness however for some reason it is not selectable in the ui ( but is in muse code)   Crutially this hasnt made it sway to the alias choices either, especailly since muse code keeps having its model for aliases wiped.    Please fix all this behaviour and make sure we have a firm and trusted way to build our model catalogue from the attached harnesses. For context the model catalogue should get model options from the runner, convert them into the kainbain standard harness::model::effort and save them then the Ui should allow selecting from that central list.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 375.593s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 934ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (35 files in 143ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (173s)
Running Unit Tests (frontend)... [0;32mPASS[0m (173s)
Running Unit Tests (runner)... [0;32mPASS[0m (173s)
Running Linting (api)... [0;32mPASS[0m (173s)
Running Linting (frontend)... [0;32mPASS[0m (173s)
Running Frontend Build... [0;32mPASS[0m (173s)
Running Security Script Tests... [0;32mPASS[0m (173s)
Running Dependency Check... [0;32mPASS[0m (173s)
Running Dependency Audit Gate... [0;32mPASS[0m (173s)
Running Harness Self-Tests... [0;32mPASS[0m (173s)
Running Container Tests... [0;32mPASS[0m (173s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
Running Canary Tests... [0;31mFAIL[0m (197s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 2825 of 2945 lines; showing the tail)
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/workflow-Workflow-E2E-Test-006ae-or-exposes-the-Skills-panel/error-context.md

  113 failed
    tests/accessibility.spec.js:124:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations 
    tests/accessibility.spec.js:130:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations 
    tests/accessibility.spec.js:136:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations 
    tests/accessibility.spec.js:147:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations 
    tests/accessibility.spec.js:156:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations 
    tests/accessibility.spec.js:177:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations 
    tests/accessibility.spec.js:188:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) 
    tests/accessibility.spec.js:208:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus 
    tests/accessibility.spec.js:217:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape 
    tests/accessibility.spec.js:229:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus 
    tests/accessibility.spec.js:242:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape 
    tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar 
    tests/accessibility.spec.js:303:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations 
    tests/accessibility.spec.js:309:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations 
    tests/accessibility.spec.js:315:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations 
    tests/accessibility.spec.js:321:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations 
    tests/accessibility.spec.js:334:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › accessibility statement view has no axe violations 
    tests/accessibility.spec.js:343:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › accessibility statement with report form open has no axe violations 
    tests/accessibility.spec.js:354:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations 
    tests/accessibility.spec.js:367:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations 
    tests/accessibility.spec.js:378:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations 
    tests/accessibility.spec.js:401:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations 
    tests/accessibility.spec.js:422:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) 
    tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL 
    tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override 
    tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published 
    tests/engine-isolation.spec.js:20:6 › scratch-stack engine isolation › containment-state file resolves inside the scratch roots 
    tests/engine-isolation.spec.js:34:6 › scratch-stack engine isolation › agent stages run on the mock harness, never ambient models 
    tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console 
    tests/functional.spec.js:5:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit 
    tests/functional.spec.js:15:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges 
    tests/functional.spec.js:33:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes 
    tests/functional.spec.js:70:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width 
    tests/functional.spec.js:164:6 › KainBain Functional E2E Tests › in-place column task creation ─
    tests/functional.spec.js:182:6 › KainBain Functional E2E Tests › project selector lists projects and switches 
    tests/functional.spec.js:204:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs 
    tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px 
    tests/homepage.spec.js:4:5 › homepage has correct title ────────────────────────────────────────
    tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit ────────────────────────
    tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip 
    tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column 
    tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls 
    tests/mobile-responsive.spec.js:105:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping 
    tests/mobile-responsive.spec.js:130:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:159:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) 
    tests/mobile-responsive.spec.js:175:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) 
    tests/mobile-responsive.spec.js:227:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover 
    tests/mobile-responsive.spec.js:242:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip 
    tests/mobile-responsive.spec.js:254:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed 
    tests/mobile-responsive.spec.js:280:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector 
    tests/mobile-responsive.spec.js:358:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen 
    tests/mobile-responsive.spec.js:385:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover 
    tests/mobile-responsive.spec.js:425:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport 
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
    tests/survey-verify.spec.js:126:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances 
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
    tests/task-inspector.spec.js:45:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens 
    tests/task-inspector.spec.js:64:6 › Task inspector core behaviors › preview toggle hides the editor and the context tokens, edit restores them 
    tests/task-inspector.spec.js:92:6 › Task inspector core behaviors › clicking the task key copies the full task id and keeps the inspector open 
    tests/task-inspector.spec.js:124:6 › Task inspector core behaviors › inspector width adjusts via the splitter, keyboard, and persists 
    tests/task-inspector.spec.js:200:7 › Task inspector core behaviors › desktop overlay geometry (task f56e9878) › open inspector overlaps the board without squishing the toolbar 
    tests/task-lifecycle.spec.js:42:6 › Task Lifecycle E2E › submit -> kanban placement -> advance -> complete 
    tests/task-lifecycle.spec.js:85:6 › Task Lifecycle E2E › kanban cards are draggable and columns are drop targets 
    tests/task-lifecycle.spec.js:109:6 › Task Lifecycle E2E › human stage renders Approve/Reject checkpoint controls 
    tests/task-lifecycle.spec.js:233:6 › Task Lifecycle E2E › clicking a card opens the slide-over task inspector 
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
  23 did not run
  4 passed (2.2m)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.