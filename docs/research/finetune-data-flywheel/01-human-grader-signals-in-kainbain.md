# The Human-Grader Signal Already Inside KainBain

All file references verified against the repo on 2026-10-30. The point of this file:
**before designing any new instrumentation, inventory what the product already records.**
Most of what a fine-tuning dataset needs is already on disk per task.

## Where run data lives today

- **Per-task directory:** `<projectRoot>/docs/tasks/<taskId>/` — `task.md` (frontmatter
  + history/timeline entries pushed by `api/taskStore.js`), `review-comments.json`
  (sidecar written by `api/reviewStore.js`), stage reports under the task's reports
  folder (`api/watch/stageReports.js`, files carry the `AUTO_REPORT_MARKER` HTML comment
  so engine-written and human-written reports are distinguishable).
- **Engine state:** `<projectRoot>/.kainbain/` (name configurable via `kainbainDirName`,
  `api/kainbainDir.js`) — sessions under `.kainbain/sessions` (`api/sessionStore.js`),
  durable flow state (`api/flow/executionLedger.js`, `loadStateFile.js` /
  `saveStateFile.js`).
- **Full agent transcripts:** harness session logs (pi `.jsonl` session files —
  `{"type":"session",...}` → `message`/`tool_call` events; example files visible at the
  repo root), normalized server-side through the event vocabulary in
  `api/agent/sessionEvents.js` and the grouped log view in
  `api/agent/logStream/agentLogStreamer.js`. The runner works in isolated worktrees under
  `~/.kainbain/runner-work/<taskId>`.
- **Real-time events:** `api/eventBridge.js` broadcasts process/stage events over
  WebSocket (currently in-memory fan-out, not a persisted training stream — see gaps).

## Signal inventory — what a human grader already does, and what it's worth

| # | Human action in the UI | Where it's captured | Dataset value |
| --- | --- | --- | --- |
| 1 | **Reject with feedback** at a human stage — `FeedbackDialog.jsx` collects free text (+ screenshots), `frontend/src/context/useTaskMutations.js` `rejectTaskWithFeedback` sends it; the text is appended to the task goal and the stage re-runs | Task history/timeline in `docs/tasks/<id>/task.md`; `api/flow/stageTransitions.js` (`failbackStage`, retry paths); `api/flow/stageFailureRouting.js` | **Gold.** A reject→fix→approve cycle on the same task+stage is a ready-made preference pair `(rejected run, chosen run)` with a natural-language reason. This is the single most valuable signal. |
| 2 | **Approve / advance** at a human checkpoint (`waiting_human` / `checkpoint` statuses, `api/agentGuide.js` `TASK_STATUSES`) | History entries in `task.md` via `api/flow/stageTransitions.js` | Positive label for the run that reached the checkpoint. Weak on its own (see safety file) — strong when combined with #3. |
| 3 | **Objective verification**: CI stage pass/fail, merge-stage review baseline, `api/flow/humanGitSafety.audit.js` | Stage history + `api/reviewAssembly.js` (`buildTaskReview`), diff stats `api/work/taskDiffStat.js`, branch state `api/work/taskBranches.js` | The trustworthy half of the reward. CI green + human approve = high-confidence "chosen"; CI red + human approve = disagreement to learn from or discard. |
| 4 | **Line/file-anchored review comments and replies** on the MR-style review page | `api/routes/review.js` → `api/reviewStore.js` → `docs/tasks/<id>/review-comments.json` (path-injection-guarded) | **Step-level (process) supervision:** "this hunk was wrong, here's the fix." Directly usable as process-reward labels (see `02`, PRM). |
| 5 | **Agent verdict block** `KAINBAIN_VERDICT: PASS/FAIL` + reason + fix | `skills/stage-verdict/SKILL.md`, parser in `api/agent/verdictContract.js` (fail-open: reasonless FAIL passes) | Agent self-assessment. Useful as a feature, *not* as a human label — never treat as ground truth. |
| 6 | **Mid-run steering** ("wait", "do X instead") queued to a live execution | `api/flow/steerStore.js` (queue/pull/ack with receipts) | Human correction mid-trajectory — excellent for trajectory-level labels ("at step k, the human redirected"). |
| 7 | **Survey answers** (question-me rounds) | `shared/survey.js` (append-only `survey-json` rounds), `api/work/taskSurvey.js`, UI `frontend/src/components/tasks/SurveyPage.jsx` | Human-authored clarifications → instruction data ("when the goal is ambiguous, ask these questions"). |
| 8 | **Retrospective chat** about finished tasks | `api/routes/retrospectiveChat.js` | Human explanations of *why* a task went well/badly — rich but unstructured; usable after parsing, low priority. |
| 9 | **Model/harness choice per stage** (aliases, picker) | `api/models.js`, `shared/modelKeys.js`, `api/aliasSelector.js` | Attribution metadata: which model produced which artifact. Essential so preference pairs compare outputs of the *same* model, and so you can fine-tune the model you actually run. |
| 10 | **Re-route / move between stages, pause, edit goal** | `api/routes/tasks.js` (PATCH), `api/work/taskLifecycle.js` | Secondary signals; goal edits are human rewrites of the prompt — useful for prompt-distribution matching. |

## How a preference pair falls out naturally

```
task t, stage "In Progress", model M, harness pi
  run 1  → agent produces diff D1 + report R1 → human REJECTS with feedback F
           (F appended to goal; history entry in task.md)
  run 2  → same (augmented) context → agent produces D2 + R2 → CI green → human APPROVES
  ⇒ pair: prompt = stage prompt + goal(+F) + repo context
           rejected = run 1 transcript/report/diff, reason = F
           chosen   = run 2 transcript/report/diff
```

No new UI is needed to *generate* the pairs; the kanban workflow already produces them.
What's missing is the export/curation layer (below).

## Gaps — what does NOT exist yet (and must be built in phase 1–2)

1. **No persisted, schema-versioned training event stream.** `api/eventBridge.js` fans
   events out over WS but doesn't append them to a durable log. `api/flow/executionLedger.js`
   persists execution state; neither is shaped as "training events" (see `06`).
2. **No consent / opt-in flag.** Nothing in project settings says "this project's run data
   may be used for training". Must be explicit, per project, default **off**.
3. **No redaction layer for export.** Transcripts contain repo code, file paths, possibly
   pasted secrets. There is secret *handling* for config (`.env` discipline) but no
   transcript scrubber. Redaction must happen at capture/export time, before anything
   leaves the machine.
4. **No "best-of-k" sampling surface.** Today one run per stage execution. Preference data
   quality rises a lot if a stage can run k candidate completions and the human picks
   (rejection sampling / best-of-n). This is a workflow/UX feature, not just data plumbing.
5. **No eval holdout concept.** No notion of "these tasks are golden eval, never train on
   them". Must exist before the first training run.
6. **No dataset export / datasheet.** Nothing produces a `dataset.jsonl` + provenance
   datasheet (licenses, filters, consent scope, counts).
7. **No deletion/erasure path** for "remove user X's data from the dataset and retrain".

## Design consequences

- Capture should live **at the existing write points** (history push in
  `api/flow/stageTransitions.js`, comment add in `api/reviewStore.js`, steer ack in
  `api/flow/steerStore.js`, report save in `api/watch/stageReports.js`) so the training
  stream can never drift from what the UI shows — one event vocabulary, two consumers
  (UI + dataset builder).
- Every event needs: `taskId`, `stageId`, `executionId`, `modelKey` (from
  `shared/modelKeys.js` grammar), `harness`, `timestamp`, `actor` (human/agent/ci),
  `payload`, and a `consent` snapshot of the project flag at that moment (so later
  opt-out can be honored exactly).
- Transcripts should be stored **by reference** (session file path + hash), not duplicated,
  until the dataset builder materializes them into examples.
