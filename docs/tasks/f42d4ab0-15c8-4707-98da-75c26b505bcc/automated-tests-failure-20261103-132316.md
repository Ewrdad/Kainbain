<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** queue number doesnt seem to every go down ![image.png](assets/image.png) theres only 2 tasks in the dashboard meaning that there only could possibly be 2 things in queue max really. Well now 3 including this.  So as a fix please review the queue behaviour in the ui and make clicking on the queue thing in the ui it have pop up that shows the queue and the current order of tasks. Which should help me visually debug
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 7907.755s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

3 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (30 files in 144ms)
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
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Linting (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (168s)
Running Unit Tests (frontend)... [0;32mPASS[0m (168s)
Running Unit Tests (runner)... [0;32mPASS[0m (168s)
Running Linting (api)... [0;32mPASS[0m (168s)
Running Linting (frontend)... [0;32mPASS[0m (168s)
Running Frontend Build... [0;32mPASS[0m (168s)
Running Security Script Tests... [0;32mPASS[0m (168s)
Running Dependency Check... [0;32mPASS[0m (168s)
Running Dependency Audit Gate... [0;32mPASS[0m (168s)
Running Harness Self-Tests... [0;32mPASS[0m (168s)
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
⏳ still running: Canary Tests (12m00s)
⏳ still running: Canary Tests (12m30s)
⏳ still running: Canary Tests (13m00s)
⏳ still running: Canary Tests (13m30s)
⏳ still running: Canary Tests (14m00s)
⏳ still running: Canary Tests (14m30s)
Running Canary Tests... [0;31mFAIL[0m (900s)
----------------------------------------------------------------------
Details for Canary Tests:
(trimmed 30 of 150 lines; showing the tail)
  ✘   14 tests/accessibility.spec.js:200:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: in-column stage configuration drawer closes on Escape and restores focus (7.0s)
  ✘   15 tests/accessibility.spec.js:213:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › keyboard: task inspector closes on Escape (7.1s)
  ✘   16 tests/accessibility.spec.js:245:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › idle engine names no task in the NowPlaying bar (7.2s)
  ✘   17 tests/accessibility.spec.js:274:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings view has no axe violations (7.0s)
  ✘   18 tests/accessibility.spec.js:280:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › system-settings deep section (models) has no axe violations (7.0s)
  ✘   19 tests/accessibility.spec.js:286:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective view has no axe violations (7.0s)
  ✘   20 tests/accessibility.spec.js:292:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › retrospective with chat panel open has no axe violations (7.0s)
  ✘   21 tests/accessibility.spec.js:305:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task survey view has no axe violations (7.0s)
  ✘   22 tests/accessibility.spec.js:318:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › docs deep article (first-time-setup) has no axe violations (7.0s)
  ✘   23 tests/accessibility.spec.js:329:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › task detail with waiting_human status has no axe violations (7.0s)
  ✘   24 tests/accessibility.spec.js:352:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › explorer with file preview open has no axe violations (7.0s)
  ✘   25 tests/accessibility.spec.js:373:7 › Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness) › contrast walk exempts disabled controls (negative control) (7.0s)
  ✓   26 tests/app-status.spec.js:61:6 › App-status / goto-app link › files page shows the goto-app link when the API publishes a URL (2.4s)
  ✓   27 tests/app-status.spec.js:85:6 › App-status / goto-app link › loopback URL honors the networkHost override (2.1s)
  ✓   28 tests/app-status.spec.js:103:6 › App-status / goto-app link › no link renders — never a broken one — when no URL is published (2.2s)
  ✓   29 tests/engine-isolation.spec.js:20:6 › scratch-stack engine isolation › containment-state file resolves inside the scratch roots (20ms)
  ✓   30 tests/engine-isolation.spec.js:34:6 › scratch-stack engine isolation › agent stages run on the mock harness, never ambient models (21ms)
  ✘   31 tests/footer-overlay.spec.js:99:6 › Footer overlap consistency › Configure drawer buttons stay clickable above the collapsed activity console (1.0m)
  ✘   32 tests/footer-overlay.spec.js:158:6 › Footer overlap consistency › Configure drawer stays clear of an expanded activity console (1.0m)
  ✘   33 tests/footer-overlay.spec.js:188:6 › Footer overlap consistency › Task inspector ends above the Now Playing footer and keeps its controls clickable (1.0m)
  ✓   34 tests/functional.spec.js:6:6 › KainBain Functional E2E Tests › homepage loading and orchestrator cockpit (3.0s)
  ✓   35 tests/functional.spec.js:16:6 › KainBain Functional E2E Tests › workflow canvas renders stage columns with type badges (2.0s)
  ✓   36 tests/functional.spec.js:34:6 › KainBain Functional E2E Tests › now playing bar with runner fleet boxes (2.2s)
  ✘   37 tests/functional.spec.js:71:6 › KainBain Functional E2E Tests › right rail never overlaps the runner boxes at any supported width (19.3s)
  ✓   38 tests/functional.spec.js:158:6 › KainBain Functional E2E Tests › in-place column task creation (2.4s)
  ✓   39 tests/functional.spec.js:176:6 › KainBain Functional E2E Tests › project selector lists projects and switches (2.2s)
  ✓   40 tests/functional.spec.js:198:6 › KainBain Functional E2E Tests › settings tab renders per-project configuration across its tabs (2.0s)
  ✓   41 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 320px (3.1s)
  ✓   42 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 360px (2.6s)
  ✓   43 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 375px (2.7s)
  ✓   44 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 390px (2.8s)
  ✓   45 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 414px (2.7s)
  ✓   46 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 430px (2.9s)
  ✓   47 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 480px (2.8s)
  ✓   48 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 640px (3.0s)
  ✓   49 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 768px (3.0s)
  ✓   50 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 859px (2.5s)
  ✓   51 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1024px (2.7s)
  ✓   52 tests/header-responsive.spec.js:105:7 › Header responsive layout guard (task 66ad153f) › header controls neither overlap nor clip at 1280px (2.9s)
  ✓   53 tests/homepage.spec.js:4:5 › homepage has correct title (2.0s)
  ✓   54 tests/homepage.spec.js:9:5 › homepage displays the orchestrator cockpit (2.1s)
  ✓   55 tests/mobile-responsive.spec.js:36:6 › Mobile Responsive Layout › renders mobile stage column selector tab strip (1.8s)
  ✓   56 tests/mobile-responsive.spec.js:50:6 › Mobile Responsive Layout › switching mobile stage tabs displays the corresponding column (2.3s)
  ✓   57 tests/mobile-responsive.spec.js:64:6 › Mobile Responsive Layout › slide-over inspector opens in mobile drawer mode with accessible touch controls (2.0s)
  ✓   58 tests/mobile-responsive.spec.js:95:6 › Mobile Responsive Layout › now playing bar is compact and controls are visible without clipping (1.8s)
  ✓   59 tests/mobile-responsive.spec.js:120:6 › Mobile Responsive Layout › filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9) (1.9s)
  ✓   60 tests/mobile-responsive.spec.js:149:6 › Mobile Responsive Layout › search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9) (2.9s)
  ✘   61 tests/mobile-responsive.spec.js:165:6 › Mobile Responsive Layout › task cards render the compact density on mobile (task 7a411b12) (1.0m)
  ✓   62 tests/mobile-responsive.spec.js:217:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the pipeline switcher opens only the menu, never a tooltip popover (2.1s)
  ✓   63 tests/mobile-responsive.spec.js:232:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping the task search field focuses it without popping a tooltip (2.3s)
  ✘   64 tests/mobile-responsive.spec.js:244:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping a card body opens the inspector and it can be closed (1.0m)
  ✓   65 tests/mobile-responsive.spec.js:270:6 › Mobile tap popups deconfliction (task e2cf55ac) › tapping Approve on a checkpoint card advances the task without opening the inspector (2.5s)
  ✓   66 tests/mobile-responsive.spec.js:348:6 › Header controls on mobile (task 66ad153f) › every header control meets the touch floor and stays on-screen (2.0s)
  ✓   67 tests/mobile-responsive.spec.js:375:6 › Desktop regression for tap guard (task e2cf55ac) › switcher opens its menu on click and tooltip only on hover (2.1s)
  ✓   68 tests/mobile-responsive.spec.js:415:6 › Mobile search bar with tags (task da91c31e) › search bar with 6 tags remains width-bounded with input and clear within viewport (1.9s)
  ✘   69 tests/now-playing-cross-project.spec.js:208:6 › Now Playing bar is one pipeline for all projects › bar keeps naming the running owner when switching from Project A to Project B (1.0m)
  ✘   70 tests/now-playing-cross-project.spec.js:305:6 › Now Playing bar is one pipeline for all projects › advancing the engine owner keeps the bar put even when another project is selected (1.0m)
hint: Using 'master' as the name for the initial branch. This default branch name
hint: will change to "main" in Git 3.0. To configure the initial branch name
hint: to use in all of your new repositories, which will suppress this warning,
hint: call:
hint:
hint: 	git config --global init.defaultBranch <name>
hint:
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint:
hint: 	git branch -m <name>
hint:
hint: Disable this message with "git config set advice.defaultBranchName false"
warning: re-init: ignored --initial-branch=main
fatal: Needed a single revision
fatal: Needed a single revision
fatal: a branch named 'kb/ec8f53c1-da94-45a5-9a48-afd9a15976be' already exists
Already on 'kb/ec8f53c1-da94-45a5-9a48-afd9a15976be'
Switched to branch 'main'
Switched to branch 'kb/ec8f53c1-da94-45a5-9a48-afd9a15976be'
Switched to branch 'main'
  ✓   71 tests/pr-review.spec.js:171:6 › PR Review E2E › open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge (5.4s)
  ✓   72 tests/pr-review.spec.js:385:6 › PR Review E2E › review page shows the branch-unsupported empty state when branch support is off (A10, D7) (2.6s)
  ✘   73 tests/pr-review.spec.js:427:6 › PR Review E2E › reports tab enables line-by-line review of stage reports outside git diff (2.6s)
  -   74 tests/pr-review.spec.js:523:6 › PR Review E2E › reports tab is usable at a mobile viewport without horizontal overflow
CATALOGUE pi=null agy=["low","medium","high"] mock=["low","medium","high"] muse=null
CATALOGUE COUNTS pi=0 agy=0 mock=1
RESPONSIVENESS dropdown-open frames=73 p95=16.8ms
SAVED defaultModel=mock::mock::echo-v1::high harness=undefined
ANTIGRAVITY CATALOGUE EMPTY in scratch — agy levels covered by unit tests
NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom
SAVED aliases=[{"name":"browser-small","harness":"mock","model":"mock::mock::echo-v1::medium","targets":[{"harness":"mock","model":"mock::mock::echo-v1::medium","percent":100}]}]
INVALID SAVE status=400 body={"error":"modelAliases[0]: alias \"bad\" targets harness \"mock\" with reasoning level \"nope\", which is not supported (supported: low, medium, high)"}
  ✓   75 tests/reasoning-levels-browser.spec.js:71:7 › Reasoning levels browser verification (scratch stack) › picker + aliases: levels, persistence, invalid handling, null harnesses (7.5s)
  ✓   76 tests/retrospective-chat.spec.js:59:6 › retrospective long-turn chat › send shows the working card, then the reply replaces it (3.3s)
  ✓   77 tests/retrospective-chat.spec.js:86:6 › retrospective long-turn chat › navigate away mid-turn keeps the turn and toasts with a way back (4.6s)
  ✓   78 tests/retrospective.spec.js:13:5 › retrospective page renders without page errors (2.5s)
  ✓   79 tests/retrospective.spec.js:22:5 › retrospective ?show= share link renders without page errors (2.4s)
  ✓   80 tests/retrospective.spec.js:51:6 › retrospective mobile layout › phone shows one pane at a time behind the tab strip (2.4s)
  ✓   81 tests/retrospective.spec.js:83:6 › retrospective mobile layout › phone controls keep touch-sized targets (2.8s)
  ✓   82 tests/retrospective.spec.js:117:6 › retrospective mobile layout › phone page owns the vertical scroll region (2.0s)
  ✓   83 tests/retrospective.spec.js:151:6 › retrospective mobile layout › phone page never scrolls sideways (2.0s)
  ✓   84 tests/retrospective.spec.js:172:6 › retrospective mobile layout › desktop hides the strip and shows all three panes (2.3s)
  ✓   85 tests/runtime-errors.spec.js:13:5 › app renders without uncaught page errors (2.2s)
  ✓   86 tests/runtime-errors.spec.js:23:5 › app renders without console errors (2.3s)
  ✓   87 tests/settings.spec.js:60:6 › Settings save round-trip › edit, save, reload: values persist across UI and API (2.9s)
  ✓   88 tests/settings.spec.js:83:6 › Settings save round-trip › invalid input blocks the save and keeps the stored config (2.6s)
  ✓   89 tests/survey-verify.spec.js:121:7 › question-me survey verification › engine parks a question-me stage with no survey file; skip advances (2.2s)
survey timings ms: reveal=61 save=58 submit=81
  ✓   90 tests/survey-verify.spec.js:145:7 › question-me survey verification › desktop: conditional reveal, notes, save, submit advances; file stays append-only (3.5s)
  ✓   91 tests/survey-verify.spec.js:258:9 › question-me survey verification › touch context › mobile: survey renders, answers, and fits 375px (2.1s)
  ✓   92 tests/survey-verify.spec.js:289:7 › question-me survey verification › empty round advances via continue without parking (1.9s)
  ✓   93 tests/system-settings-mobile.spec.js:126:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on mobile across all tabs (5.2s)
  ✓   94 tests/system-settings-mobile.spec.js:142:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on a short mobile viewport (2.2s)
  ✓   95 tests/system-settings-mobile.spec.js:155:6 › System Settings screen tab bar (task 5ad55777) › scrolling the details never covers the tab bar (2.8s)
  ✓   96 tests/system-settings-mobile.spec.js:169:6 › System Settings screen tab bar (task 5ad55777) › tab bar renders at full height on desktop (1.9s)
  ✓   97 tests/system-settings-mobile.spec.js:175:6 › System Settings screen tab bar (task 5ad55777) › rotating the viewport never covers the tab bar (2.8s)
  ✓   98 tests/system-settings-mobile.spec.js:192:6 › System Settings screen tab bar (task 5ad55777) › a deep-linked tab survives a refresh and an unknown section falls back (2.3s)
  ✓   99 tests/system-settings-mobile.spec.js:221:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › no modal dialog shell remains on the settings route (1.8s)
  ✓  100 tests/system-settings-mobile.spec.js:228:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › desktop System Menu opens System Settings in a new window (1.9s)
  ✓  101 tests/system-settings-mobile.spec.js:253:6 › System Settings entry opens a screen, not a dialog (task cd669cc3) › mobile System Menu falls back to same-tab navigation (no popout trap) (1.7s)
  ✘  102 tests/task-editing.spec.js:34:6 › Task-view editing behaviors › attached image markdown is appended at the end, title line intact (1.0m)
Timed out after 900000ms (branch process tree reaped)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.