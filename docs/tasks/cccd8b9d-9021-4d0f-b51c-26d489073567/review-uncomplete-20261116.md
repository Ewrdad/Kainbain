# PR Review: Uncomplete (reopen) completed tasks

- **Branch:** `kb/cccd8b9d-9021-4d0f-b51c-26d489073567` vs `main`, HEAD `3cbcc811`
- **Reviewer stance:** assumed broken until proven otherwise; verified by reading
  the diff and re-running the gates at HEAD.
- **Prior inputs read:** `IMPLEMENTATION_PLAN.md`, `SURVEY.md` (unanswered),
  `review-plan-20261115-223712.md` (PASSED),
  `automated-tests-failure-20261115-232533.md` (FAILED, pre-fix),
  `UPDATE_SAFETY_REVIEW.md` (PASS).

## Verdict inputs: the CI failure is fully explained and fixed

The failed CI run tested code *before* `b125fbbd` + `6ba182aa`. All three of its
failures are resolved at HEAD — re-verified in this review, not taken on trust:

| CI failure | Fix | Re-verified at HEAD |
|---|---|---|
| `domainRequests` expected 104 ops, got 105 | count updated to 105 with comment | `domainRequests.test.js`: 30/30 pass |
| Busy `Uncomplete` button not disabled | `disabled={isMutating \|\| pendingAction === action}` | `TaskCompleteToggleButton.test.jsx`: 5/5 pass |
| JSDoc baseline missing the new file's default export | MARK + `@example` block added for the default export | `node --test tests/check-jsdoc-example.test.mjs`: 14/14 pass |

Full gates re-run in this review (read-only, no servers, no live-op contact):

- Full frontend suite: **347 files / 4734 tests pass** (was 2 failed / 4732 passed).
- API suites covering the change (`stagePolicy`, `stageTransitions`, `routes/tasks`,
  `taskStore`, `taskPersistence`): **360/360 pass**. Full API suite passed in the
  CI run itself; the change since is additive and covered by these files.
- ESLint on all touched frontend + API files: **0 errors**.

## Review questions

- **Does it achieve the goal?** Yes. On a completed task the same button position
  renders `Uncomplete` (both the details tab and the detail page, via one shared
  component); `uncompleteTask` restores the snapshotted pre-completion
  status/stage and the task flows through existing non-completed branches
  (`TaskCard`, board filter, `isTaskBlocked`) with no special-casing.
- **Did it follow the plan?** Yes. Shared `TaskCompleteToggleButton` (no button
  drift — both old duplicated blocks deleted), pure `resolveReopenedStatus`,
  mirror-at-every-layer backend (`stageTransitions` → `taskStore` → barrel →
  route → service → mutation → context), snapshot-with-`idle` fallback exactly
  as Phase 0 specified, plus the docs Phase 4 required.
- **Code standards?** Yes. MARK/JSDoc blocks with `@example` on every new
  export, same guard/404 shape on the route, symmetric idempotent no-ops
  (missing → null/404; non-completed → no-op), lint clean.
- **Easy to modify later?** Yes. The pure resolver isolates restore policy;
  the mirror structure makes the next change to `completeTask` visibly paired.
- **Best practices / tech debt?** No new debt. No run is interrupted or started
  on reopen; no destructive clearing (reports, surveys intact); snapshot is
  consumed on use and re-stamped on re-complete; `Reopened` timeline rows are
  ignored by `stageDurations`/`runAttribution` fallbacks; scheduler kick reuses
  the existing `_kickIfRunnable` path. `disabled` is slightly stricter than the
  old `disabled={isMutating}` (also true during its own pending key) — an
  improvement to the single-flight guard, covered by test.
- **Docs updated?** Yes. `site-docs/api-reference.md`,
  `site-docs/pipeline-stages.md`, `api/agentGuide.js`. No CHANGELOG entry
  needed: the repo convention curates that file at release time only.

## Known non-issues (checked, not defects)

- The survey was never answered, so button wording ("Uncomplete") and
  no-confirm behavior rest on the plan's stated assumptions. They are
  consistent with the existing Complete behavior (same position, no confirm),
  so this is not a blocker — but human review should confirm the wording.
- The plan's retrospective double-count risk does not materialize: the
  retrospective service is a chat API with no completed-count, and duration
  stats skip `Reopened` rows.
- `enteredStageAt` is not reset on reopen (long `timeInStage` for the revisited
  stage) — documented in the safety review, only affects reopened tasks.
- No Playwright screenshots were produced in this docs-only stage; the swap is
  proven by the 5 component tests plus both call sites read end to end.
  Human reviewers may want one headless capture before merge.

## Conclusion

The change is suitable to integrate as-is. The prior CI failure must not be
re-read as current signal: every failing assertion from that run passes at HEAD.
