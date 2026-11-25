<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Make sure attachments are always saved to the task folder so they can be referred to Currently it seems that if you attach an image to the task or in a failure the runner on a different box can't refer to it . It should be re-named and commited to the the task folder so that it can be referred to. References in the task should be updated to the new files for tasks.  This should work for images or any other file references
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 286.297s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
es workers across files instead of one per file[22m

----------------------------------------------------------------------
Running Unit Tests (frontend)... [0;31mFAIL[0m (275s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/unit-tests-frontend.full.log
(trimmed 23675 of 23795 lines; showing the tail)

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mremove button drops the skill from stage.skills
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

[90mstderr[2m | src/components/workflow/StageSkillsPanel.test.jsx[2m > [22m[2mrefresh control re-fetches the skills library
[22m[39mWarning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m28 tests[22m[2m)[22m[33m 1327[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/settings/ProjectSettings.deepLink.test.jsx[2m > [22mProjectSettings section deep link[2m > [22mrewrites the URL back when the unsaved-edits guard blocks a URL-driven switch
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toHaveTextContent()[22m

Expected element to have text content:
[32m  /settings/project[31m
Received:
[31m  /settings/workflows[31m[39m
[36m [2m❯[22m src/components/settings/ProjectSettings.deepLink.test.jsx:[2m167:52[22m[39m
    [90m165|[39m       // tab again instead of stranding the blocked section.
    [90m166|[39m       expect(screen.getByLabelText('Project Name')).toHaveValue('Draft…
    [90m167|[39m       expect(screen.getByTestId('location-probe')).toHaveTextContent('…
    [90m   |[39m                                                    [31m^[39m
    [90m168|[39m     } finally {
    [90m169|[39m       window.confirm = originalConfirm;

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m363 passed[39m[22m[90m (364)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m4987 passed[39m[22m[90m (4988)[39m
[2m   Start at [22m 13:43:03
[2m   Duration [22m 97.94s[2m (tests 53%, setup 20%, worker 8%, import 7%, environment 6%, transform 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (275s)
Running Linting (api)... [0;32mPASS[0m (275s)
Running Linting (frontend)... [0;32mPASS[0m (275s)
Running Frontend Build... [0;32mPASS[0m (275s)
Running Security Script Tests... [0;32mPASS[0m (275s)
Running Dependency Check... [0;32mPASS[0m (275s)
Running Dependency Audit Gate... [0;32mPASS[0m (275s)
Running Proof Hygiene... [0;32mPASS[0m (275s)
Running Binary Guard... [0;32mPASS[0m (275s)
Running Harness Self-Tests... [0;31mFAIL[0m (275s)
----------------------------------------------------------------------
Details for Harness Self-Tests:
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/harness-self-tests.full.log
(trimmed 992 of 1112 lines; showing the tail)
▶ packageRunner
  ✔ packages a canary version under its full name and stamps version.json (50.171966ms)
  ✔ rejects non-semver versions instead of tarring them (1.215695ms)
  ✔ fails closed on unsupported platforms (v1: linux/darwin only) (4.078776ms)
  ✔ leaves the default leg-closure install on for fake roots without crashing (auto-skip) (78.93755ms)
  ✔ stageLegNpmDeps fails closed with a named error when the root has no api/package.json (1.113858ms)
  ✔ agrees with buildManifest on the asset filename grammar (326.705732ms)
✔ packageRunner (465.365095ms)
▶ installSteps
  ✔ installs root, api, frontend, then canary-e2e in order (4.313765ms)
✔ installSteps (17.196848ms)
▶ hookInstallStep
  ✔ pins the setup hook-install step: runs scripts/install-git-hooks.mjs with node from the repo root (2.878022ms)
✔ hookInstallStep (3.196948ms)
▶ installSteps npmrc
  ✔ every install dir resolves legacy-peer-deps the way npm actually reads it (15.442918ms)
  ✔ root .npmrc documents the per-dir mirrors (0.422058ms)
✔ installSteps npmrc (16.258513ms)
▶ playwrightAttempts
  ✔ tries system deps first on linux, then the browser alone (0.387137ms)
  ✔ installs the browser alone on macOS and Windows (0.307417ms)
✔ playwrightAttempts (1.10258ms)
▶ npxExecutable
  ✔ uses npx.cmd on Windows, npx elsewhere (8.971197ms)
✔ npxExecutable (9.400706ms)
▶ browserInstallTargets
  ✔ installs the root browser first, then the canary-e2e browser (3.637287ms)
  ✔ keeps Linux --with-deps on the root target and browser-only on canary (1.088193ms)
  ✔ installs the browser alone for every target on macOS and Windows (0.778497ms)
✔ browserInstallTargets (5.821286ms)
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-JzoEDM/Sanity/docs' -> '/tmp/kainbain-sanity-notes-9fksEv/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-zE4eOA/Sanity/docs' -> '/tmp/kainbain-sanity-notes-95YG2J/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-zE4eOA/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-95YG2J/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-zE4eOA/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-95YG2J/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-6jWEEm/Sanity/docs' -> '/tmp/kainbain-sanity-notes-OOlc43/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-30uZOm/Sanity/docs' -> '/tmp/kainbain-sanity-notes-a2ZXVR/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-30uZOm/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-a2ZXVR/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-30uZOm/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-a2ZXVR/Sanity'.
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-wd1PXC/Sanity/docs' -> '/tmp/kainbain-sanity-notes-XYz3D0/Sanity'
[projectStore] recreated missing docs symlink for 'Sanity': '/tmp/kainbain-sanity-projects-fc1Zuq/Sanity/docs' -> '/tmp/kainbain-sanity-notes-4ztOX0/Sanity'
[projectStore] '/tmp/kainbain-sanity-projects-fc1Zuq/Sanity/docs' is a real directory shadowing the notes space '/tmp/kainbain-sanity-notes-4ztOX0/Sanity' — task lists read the shadow copy, so most tasks are hidden. Merge any newer files from the shadow 'docs/tasks/' into the notes space, then replace '/tmp/kainbain-sanity-projects-fc1Zuq/Sanity/docs' with a symlink to '/tmp/kainbain-sanity-notes-4ztOX0/Sanity'.
▶ checkStorageSanity
  ✔ restores every seeded task and arms the shadow detector (30.30161ms)
  ✔ leaves no fixture residue in the OS temp dir (382.095279ms)
✔ checkStorageSanity (415.14762ms)
▶ isMainModule
  ✔ matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname) (1.13134ms)
  ✔ rejects a missing entry path or a different file (0.525583ms)
  ✔ fires on direct run: node scripts/storage-sanity.mjs prints PASS (2487.016997ms)
✔ isMainModule (2489.198116ms)
▶ countNotesTasks
  ✔ counts only folders holding a task.md (1.060885ms)
  ✔ returns 0 when the notes space has no tasks dir (0.592826ms)
✔ countNotesTasks (2.097491ms)
▶ scripts/sync-tip-dist.mjs
  ✔ skips (exit 0, primary untouched) without the tip-worktree marker (437.574825ms)
  ✔ syncs manifest, appends unseen history, copies tarballs, writes the pointer (213.859602ms)
  ✔ syncs build-info.json alongside a moved manifest commit (185.190512ms)
  ✔ leaves build-info.json alone when the primary manifest is already current (140.123568ms)
  ✔ syncs under deploy.sh's tip re-exec marker alone (pipeline Publish path) (375.469624ms)
  ✔ is idempotent: a second run appends no duplicate history (746.702327ms)
  ✔ leaves an already-current primary manifest alone (183.320816ms)
✔ scripts/sync-tip-dist.mjs (2333.318195ms)
fatal: bad object ffffffffffffffffffffffffffffffffffffffff
usage: node scripts/verify-stage-attestation.mjs --repo <path> --task <id> [--sha <sha>] [--config <input.json>] [--docs-dir <name>]
▶ parseVerifyArgs
  ✔ parses flags with defaults (6.084888ms)
✔ parseVerifyArgs (9.652532ms)
▶ findHistoryTokens
  ✔ collects tokens in file order (2.951911ms)
✔ findHistoryTokens (3.19184ms)
▶ verifyFromRepo
  ✔ links a matching history entry, commit, and pinned config (379.176485ms)
  ✔ defaults to the latest token when no SHA is given (214.505113ms)
  ✔ fails when the history token was tampered with (219.723433ms)
  ✔ fails when history names a commit the repo does not know (232.8668ms)
  ✔ fails when history carries no token, and when the task file is missing (225.134984ms)
  ✔ fails the pinned-config check on drifted config (232.587795ms)
  ✔ CLI smoke: exit 0 on PASS, 1 on FAIL, 2 on usage error (1209.740275ms)
✔ verifyFromRepo (2732.949642ms)
ℹ tests 687
ℹ suites 170
ℹ pass 686
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98869.392492

✖ failing tests:

test at tests/check-jsdoc-example.test.mjs:313:2
✖ the baseline covers every currently-missing export (9484.830705ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     exportName: 'default',
  +     file: 'api/routes/taskAttachments.js',
  +     kind: 'default'
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/tests/check-jsdoc-example.test.mjs:322:10)
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
    actual: [ { file: 'api/routes/taskAttachments.js', exportName: 'default', kind: 'default' } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
----------------------------------------------------------------------
Running Container Tests... [0;32mPASS[0m (275s)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api);Unit Tests (frontend);Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api), Unit Tests (frontend), Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/unit-tests-api.full.log
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/unit-tests-frontend.full.log
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/verdict.json

Running Canary Tests... SKIP (fast-gate failed: Unit Tests (api), Unit Tests (frontend), Harness Self-Tests; verdict at /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/verdict.json)
KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (api);Unit Tests (frontend);Harness Self-Tests" canary=skipped_due_to_fast_gate_failure verdict="/home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/verdict.json"
Fast-gate verdict: FAILED — Unit Tests (api), Unit Tests (frontend), Harness Self-Tests
Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)
Full log: Unit Tests (api) → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/unit-tests-api.full.log
Full log: Unit Tests (frontend) → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/unit-tests-frontend.full.log
Full log: Harness Self-Tests → /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/harness-self-tests.full.log
Verdict file: /home/[REDACTED]/.kainbain/runner-work/kb-0a5cad0b-94c3-44e2-997f-16fd178950ea/docs/tasks/0a5cad0b-94c3-44e2-997f-16fd178950ea/ci-fast-gate-20261125-134258/verdict.json


```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.