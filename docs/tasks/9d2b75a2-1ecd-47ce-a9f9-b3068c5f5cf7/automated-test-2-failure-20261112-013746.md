<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: automated test 2

**Task:** Runners are not autodetecting correctly  Key error seems to be with muse code but I suspect on others. Muse has just released a new model in the harness however for some reason it is not selectable in the ui ( but is in muse code)   Crutially this hasnt made it sway to the alias choices either, especailly since muse code keeps having its model for aliases wiped.    Please fix all this behaviour and make sure we have a firm and trusted way to build our model catalogue from the attached harnesses. For context the model catalogue should get model options from the runner, convert them into the kainbain standard harness::model::effort and save them then the Ui should allow selecting from that central list.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 167.634s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 118 packages in 853ms

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (35 files in 102ms)
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
Running Unit Tests (api)... [0;32mPASS[0m (162s)
Running Unit Tests (frontend)... [0;31mFAIL[0m (162s)
----------------------------------------------------------------------
Details for Unit Tests (frontend):
(trimmed 19197 of 19317 lines; showing the tail)
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)
Warning: An update to StageSkillsPanel inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at StageSkillsPanel (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/src/components/workflow/StageSkillsPanel.jsx:344:29)
    at Router (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9996:13)
    at MemoryRouter (/home/[REDACTED]/.kainbain/runner-work/kb-9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/frontend/node_modules/react-router/dist/development/chunk-GR4NQCSD.js:9906:3)

 [32m✓[39m [30m[46m 1 [49m[39m src/components/workflow/StageSkillsPanel.test.jsx [2m([22m[2m28 tests[22m[2m)[22m[33m 969[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m [30m[43m 0 [49m[39m src/components/accessibility/AccessibilityReportDialog.test.jsx[2m > [22msuccessful submit shows a confirmation with the reference
[31m[1mError[22m: [2mexpect([22m[31melement[31m[2m).toHaveFocus()[22m

Expected element with focus:
  [32m<h3
  class="text-base font-bold text-on-surface outline-none"
  tabindex="-1"
>
  Report received — thank you
</h3>[31m
Received element with focus:
  [31m<body>
  <div>
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      <div
        aria-labelledby="a11y-report-title"
        aria-modal="true"
        class="w-full max-w-xl bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
      >
        <header
          class="p-4 sm:p-6 border-b border-border-standard bg-surface-container"
        >
          <h2
            class="text-base sm:text-lg font-bold text-on-surface tracking-tight"
            id="a11y-report-title"
          >
            Report an accessibility problem
          </h2>
          <p
            class="text-xs text-text-muted mt-1"
          >
            Tell us about any barrier you hit — whether or not it appears in an accessibility standard. Press··············
            <kbd
              class="px-1.5 py-0.5 bg-surface-container-high rounded text-text-high border border-border-standard"
            >
              Ctrl+Enter
            </kbd>··············
            to send.
          </p>
        </header>
        <div
          class="p-4 sm:p-6 space-y-4"
        >
          <h3
            class="text-base font-bold text-on-surface outline-none"
            tabindex="-1"
          >
            Report received — thank you
          </h3>
          <p
            class="text-sm text-text-muted"
            role="status"
          >
            The website team will look into it and reply to every report.··············
            Your reference is·
            <span
              class="font-mono"
            >
              abc12345
            </span>
            .
          </p>
          <footer
            class="flex justify-end"
          >
            <button
              class="px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all cursor-pointer"
              type="button"
            >
              Close
            </button>
          </footer>
        </div>
      </div>
    </div>
  </div>
</body>[31m[39m
[36m [2m❯[22m src/components/accessibility/AccessibilityReportDialog.test.jsx:[2m79:59[22m[39m
    [90m 77|[39m   });
    [90m 78|[39m   // Confirmation takes focus for screen-reader users.
    [90m 79|[39m   expect(screen.getByText('Report received — thank you')).toHaveFocus(…
    [90m   |[39m                                                           [31m^[39m
    [90m 80|[39m });
    [90m 81|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m340 passed[39m[22m[90m (341)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m4644 passed[39m[22m[90m (4645)[39m
[2m   Start at [22m 01:35:06
[2m   Duration [22m 59.13s[2m (tests 54%, setup 19%, worker 8%, environment 7%, transform 6%, import 6%)[22m

----------------------------------------------------------------------
Running Unit Tests (runner)... [0;32mPASS[0m (162s)
Running Linting (api)... [0;32mPASS[0m (162s)
Running Linting (frontend)... [0;32mPASS[0m (162s)
Running Frontend Build... [0;32mPASS[0m (162s)
Running Security Script Tests... [0;32mPASS[0m (162s)
Running Dependency Check... [0;32mPASS[0m (162s)
Running Dependency Audit Gate... [0;32mPASS[0m (162s)
Running Harness Self-Tests... [0;32mPASS[0m (162s)
Running Container Tests... [0;32mPASS[0m (162s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.