# Unexplained empty workflow board after removing the hidden-by-workflow notice

Removing the full-width "N waiting in <workflow>" notice (rendered in
`frontend/src/components/workflow/CanvasToolbar.jsx`, `aria-label="Tasks hidden
by workflow filter"`) also removes the only in-context explanation for a board
that is empty because its tasks live under a non-active workflow. In that state
a user can be left looking at silent zero columns and may believe their tasks
were lost.

## Score: 4

### Impact: 2

#### Confidentiality : 1

The notice only ever displayed workflow names and a per-workflow task count,
both of which the workflow-switcher dropdown already shows. Removing it cannot
expose any additional data, so the confidentiality impact is unaffected.

#### Integrity : 2

No data is mutated by the removal itself and the board still renders. However,
an unexplained empty board can prompt a user to re-create a task that already
exists under another workflow, producing duplicate tasks (and duplicate agent
runs). The rating stays at 2 rather than higher because the state is completely
recoverable: the workflow switcher names the active workflow and lists every
other one one click away.

#### Availability : 1

Board availability is unchanged; stage columns render exactly as before.
Removing the notice improves perceived availability because the flicker that
made the board appear to jump up and down is gone (the reported defect).

### Likelihood: 2

The trigger is narrow: a project whose tasks sit under a workflow that is not
the current selection (typically a stale persisted workflow selection), plus a
user who does not consult the workflow switcher. The switcher is the primary
navigation control in the same toolbar and shows the active workflow's name, so
most users discover the state without the notice.

## Remediation

### Prevention

- Keep the workflow-switcher dropdown as the single discovery and navigation
  path for hidden tasks. This path is already covered by
  `frontend/src/components/workflow/WorkflowCanvas.toolbar.test.jsx`
  ("renders workflow selector dropdown pill and switches active workflow").
- Remove the notice completely — JSX, prop threading, the
  `groupTasksHiddenByWorkflow` helper in
  `frontend/src/components/workflow/nodeModel.js`, and the tests that assert
  its presence — so no half-removed prop, dead code or stale test can regress
  later. A repo-wide grep gate for `tasksHiddenByWorkflow`,
  `groupTasksHiddenByWorkflow` and "Tasks hidden by workflow filter" is part of
  `IMPLEMENTATION_PLAN.md`.
- Never re-introduce a conditionally-mounted bar for this state. Any future
  empty-state hint must occupy reserved space (always rendered, fixed height)
  so it cannot recreate the up/down flicker this change removes.

### Detection

- Absence tests assert the notice can never render while tasks exist under a
  non-active workflow: `queryByLabelText('Tasks hidden by workflow filter')` and
  `queryByText(/waiting in/i)` must be null
  (`CanvasToolbar.test.jsx`, `WorkflowCanvas.mobile.test.jsx`).
- `npm run test:unit` (frontend + api vitest) is the primary gate; any remaining
  dependency on the removed prop or helper fails the suite loudly.
- Layout check with `npm run capture:screenshot` (headless; no long-lived
  server) of the board before/after, plus a headless render assertion that
  stage-column offsets are identical with empty versus hidden-task task lists.

### Response

- If confusion over an empty board is reported after removal, add a
  permanently-rendered (reserved-space) static empty-state hint inside the
  column area, or a task-count badge on the workflow switcher. That is an
  in-code Ladder Step 1 change: no tokens, no human intervention. Only if that
  still fails should the state be surfaced as a Step 6 request for human
  attention. The shifting notice itself must never be reinstated.

#### Starting Step on escalation ladder : 1

Step 1 ("automated scripted in-task recovery") because the remediation is
preventative design plus automated tests: a regression is caught by the unit
gate and the absence assertions with no token spend and no human involvement.
Escalation would only begin at Step 6 if the reserved-space fallback hint
proves insufficient in practice.

## Tags

#project/kainbain #risk #ui #workflow-board #severity/4 #ladderStart/1 #likelihood/2 #impact/2
