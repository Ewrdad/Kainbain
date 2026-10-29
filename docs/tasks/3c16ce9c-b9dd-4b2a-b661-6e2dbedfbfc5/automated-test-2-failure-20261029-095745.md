<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** can you please break the project settings down to more tabs mainly want aliases in their own tab like skills . And maybe a one for custom file/web addresses. generally just neeeds to be easier to use. Maybe worth adding a settings search to the top right thats unused for project settings  ![image.png](assets/image.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 1050.701s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 835ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (29 files in 90ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s)
⏳ still running: Unit Tests (api) (1m00s), Linting (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (141s)
Running Unit Tests (frontend)... [0;32mPASS[0m (141s)
Running Linting (api)... [0;32mPASS[0m (141s)
Running Linting (frontend)... [0;32mPASS[0m (141s)
Running Frontend Build... [0;32mPASS[0m (141s)
Running Security Script Tests... [0;32mPASS[0m (141s)
Running Dependency Check... [0;32mPASS[0m (141s)
Running Dependency Audit Gate... [0;32mPASS[0m (141s)
Running Harness Self-Tests... [0;32mPASS[0m (141s)
Running Container Tests... [0;32mPASS[0m (141s)
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
Running Canary Tests... [0;31mFAIL[0m (900s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 17 of 137 lines; showing the tail)
  ✓    3 tests/accessibility.spec.js:81:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › stage settings tray has no axe violations (10.7s)
  ✓    4 tests/accessibility.spec.js:89:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer view has no axe violations (8.8s)
  ✓    5 tests/accessibility.spec.js:95:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs view has no axe violations (15.4s)
  ✓    6 tests/accessibility.spec.js:101:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › observability view has no axe violations (22.0s)
  ✓    7 tests/accessibility.spec.js:107:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail view has no axe violations (8.5s)
  ✓    8 tests/accessibility.spec.js:118:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task review view has no axe violations (6.0s)
  ✓    9 tests/accessibility.spec.js:127:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › settings model-aliases reliability cards have no axe violations (6.3s)
  ✓   10 tests/accessibility.spec.js:148:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › compact mobile monitor view has no axe violations (19.5s)
  ✓   11 tests/accessibility.spec.js:159:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk catches a planted 1.7:1 node (negative control) (6.8s)
  ✓   12 tests/accessibility.spec.js:179:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: skip link is reachable and visible on focus (5.1s)
  ✓   13 tests/accessibility.spec.js:188:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: project dropdown closes on Escape (7.4s)
  ✓   14 tests/accessibility.spec.js:200:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus (7.4s)
  ✓   15 tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape (8.8s)
  ✓   16 tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar (8.6s)
  ✓   17 tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations (22.9s)
  ✓   18 tests/accessibility.spec.js:280:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations (22.3s)
  ✓   19 tests/accessibility.spec.js:286:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations (4.8s)
  ✓   20 tests/accessibility.spec.js:292:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations (16.4s)
  ✓   21 tests/accessibility.spec.js:305:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations (7.7s)
  ✓   22 tests/accessibility.spec.js:318:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations (8.7s)
  ✓   23 tests/accessibility.spec.js:329:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations (6.4s)
  ✓   24 tests/accessibility.spec.js:352:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations (11.5s)
  ✓   25 tests/accessibility.spec.js:373:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) (8.1s)
  ✓   26 tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL (6.3s)
  ✓   27 tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override (6.2s)
  ✓   28 tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published (17.0s)
  ✓   29 tests/engine-isolation.spec.js:20:6 › scratch-stack engine isolation › containment-state file resolves inside the scratch roots (7ms)
  ✓   30 tests/engine-isolation.spec.js:34:6 › scratch-stack engine isolation › agent stages run on the mock harness, never ambient models (9ms)
  ✓   31 tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console (8.2s)
  ✓   32 tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console (23.6s)
  ✓   33 tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable (9.4s)
  ✓   34 tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit (5.9s)
  ✓   35 tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges (5.9s)
  ✓   36 tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with engine controls (5.9s)
  ✓   37 tests/functional.spec.js:54:6 › KainBain Functional E2E Tests › right rail never overlaps the center transport controls at any supported width (7.2s)
  ✓   38 tests/functional.spec.js:134:6 › KainBain Functional E2E Tests › in-place column task creation (6.7s)
  ✓   39 tests/functional.spec.js:152:6 › KainBain Functional E2E Tests › project selector lists projects and switches (5.2s)
  ✓   40 tests/functional.spec.js:174:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs (3.1s)
  ✓   41 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px (4.5s)
  ✓   42 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px (4.2s)
  ✓   43 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 375px (5.6s)
  ✓   44 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px (4.9s)
  ✓   45 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px (5.6s)
  ✓   46 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px (5.6s)
  ✓   47 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px (6.0s)
  ✓   48 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px (8.0s)
waitForFontsSettled: icon font not settled within 15 s, measuring anyway (page.waitForFunction: Timeout 15000ms exceeded.)
  ✓   49 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px (19.3s)
  ✓   50 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 859px (9.8s)
  ✓   51 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1024px (6.9s)
  ✓   52 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1280px (6.6s)
  ✓   53 tests/homepage.spec.js:4:5 › homepage has correct title (5.7s)
  ✓   54 tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit (6.0s)
  ✓   55 tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip (6.2s)
  ✓   56 tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column (6.6s)
  ✓   57 tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls (6.1s)
  ✓   58 tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping (5.8s)
  ✓   59 tests/mobile-responsive.spec.js:113:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) (6.1s)
  ✓   60 tests/mobile-responsive.spec.js:142:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) (6.8s)
  ✓   61 tests/mobile-responsive.spec.js:158:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) (6.9s)
  ✓   62 tests/mobile-responsive.spec.js:210:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover (6.3s)
  ✓   63 tests/mobile-responsive.spec.js:225:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip (1.0s)
  ✓   64 tests/mobile-responsive.spec.js:237:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed (7.2s)
  ✓   65 tests/mobile-responsive.spec.js:263:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector (6.4s)
waitForFontsSettled: icon font not settled within 15 s, measuring anyway (page.waitForFunction: Timeout 15000ms exceeded.)
  ✓   66 tests/mobile-responsive.spec.js:341:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen (21.0s)
  ✓   67 tests/mobile-responsive.spec.js:368:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover (6.1s)
  ✓   68 tests/mobile-responsive.spec.js:408:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport (5.9s)
  ✓   69 tests/now-playing-cross-project.spec.js:206:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B (16.4s)
  ✓   70 tests/now-playing-cross-project.spec.js:302:6 › Now Playing bar is one pipeline for all projects › Skip Current advances the engine owner even when another project is selected (9.4s)
fatal: Needed a single revision
fatal: a branch named 'kb/e1a984b9-ca97-4fa6-a335-f79262714f32' already exists
Already on 'kb/e1a984b9-ca97-4fa6-a335-f79262714f32'
Switched to branch 'main'
Switched to branch 'kb/e1a984b9-ca97-4fa6-a335-f79262714f32'
Switched to branch 'main'
  ✓   71 tests/pr-review.spec.js:150:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (9.5s)
  ✓   72 tests/pr-review.spec.js:349:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7) (13.2s)
  ✓   73 tests/pr-review.spec.js:391:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff (14.6s)
  ✓   74 tests/pr-review.spec.js:487:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow (6.4s)
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=13 mock=1
RESPONSIVENESS dropdown-open frames=72 p95=16.7ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (18.0s)
  ✓   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (7.9s)
  ✓   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.6s)
  ✓   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (5.8s)
  ✓   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (5.8s)
  ✓   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (6.1s)
  ✓   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (6.3s)
  ✓   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (18.4s)
  ✓   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (6.1s)
  ✓   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (9.5s)
  ✓   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (5.8s)
  ✓   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (5.8s)
  ✓   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (7.0s)
  ✓   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (6.8s)
  ✓   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (8.6s)
survey timings ms: reveal=36 save=72 submit=93
  ✓   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (8.6s)
  ✓   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (8.8s)
  ✓   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (3.9s)
  ✓   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (5.3s)
  ✓   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (3.6s)
  ✓   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (3.4s)
  ✓   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (5.0s)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (6.3s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (3.0s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (6.2s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (4.8s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (3.4s)
  ✓  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (6.2s)
  ✘  103 tests/task-editing.spec.js:71:6 › Task-view editing behaviors › preview/edit round-trip preserves edited content (14.0s)
  ✓  104 tests/task-errors.spec.js:93:6 › Task-view error display › long failure renders capped with a Show more/less toggle (6.3s)
  ✓  105 tests/task-inspector.spec.js:38:6 › Task inspector core behaviors › just-created task opens the goal in edit mode with context tokens (8.0s)
Timed out after 900000ms (branch process tree reaped)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.