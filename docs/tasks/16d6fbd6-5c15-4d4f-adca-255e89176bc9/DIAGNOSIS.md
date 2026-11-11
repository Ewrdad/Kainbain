# DIAGNOSIS — "tasks on a pipeline I'm not looking at don't run"

Task `16d6fbd6-5c15-4d4f-adca-255e89176bc9` · Phase 0 output · 2026-11-11
Repro: `api/flow/scheduler/centralQueueFairness.test.js` (ran against pre-fix code: 5/7 assertions failed, 2 passed).

## Verdict on the user's fear (UI-focus coupling in dispatch): REFUTED

Neither dispatch path reads the UI-focused/active project:

- The embedded scheduler ticks on a server interval (`startScheduler`, default 3 s) and scans **all** projects (`findNextCandidateTask`); mutation kicks (`kickIfRunnable`) carry no project filter.
- The runner fleet path (`POST /runners/dispatch` → `scanClaimableTasks`) scans all projects unless the runner is explicitly scoped via `KAINBAIN_RUNNER_PROJECTS`.
- Test proof: `centralQueueFairness.test.js` "dispatch outcome is identical no matter which project the UI has focused" passes on pre-fix code — `activeProjectId` (set by the UI via `POST /projects/:id/activate`) does not influence `findNextCandidateTask`, `scanClaimableTasks`, or `getScheduledQueue()`.
- No frontend focus/visibility handler triggers execution; focus handlers only refresh display data.

One **read-path** coupling exists: `GET /tasks/queue` with no `?projectId=` falls back to the UI-activated project (`resolveAndGuardProject` → `getActiveProject()`), so that endpoint alone can show only the focused pipeline. Fixed in this change (no param now means all projects).

## Actual causes of the perceived stall (all confirmed by the repro)

1. **Cross-project starvation via absolute stage index (Rule 2).** Both dispatch paths sorted by raw `stageIndex` descending, then oldest. A pipeline with more stages (or a task further along in absolute index) always beat an older task on another pipeline — under perpetual late-stage influx on the pipeline you're watching, the other pipeline's work waits forever. This is the "sits still until I open that pipeline" symptom: opening a pipeline doesn't change dispatch, but the pipeline you keep working on keeps winning.
2. **Unbounded follow-on pre-emption (Rule 1).** After each completion, the same pipeline's next task got a free pass (`lastCompletedTask`), so a churning pipeline pre-empts older cross-pipeline work once per stage — indefinitely.
3. **No starvation bound by default.** `dispatchMaxWaitMs` defaulted to 0 = off on the runner path; the embedded path had no bound at all.
4. **Single-active serialization (by design, documented in `docs/queue-scheduler-idle.md`).** One task runs at a time, so a long task on the busy pipeline delays everything else; combined with (1) it feels like unfocused pipelines never run. Left unchanged (load-bearing for git-workspace safety) — the runner fleet provides parallelism.

## Prescribed fix (implemented in this change)

- One central-queue ordering seam (`api/flow/scheduler/centralQueue*.js`) shared by `findNextCandidateTask`, `scanClaimableTasks`, and `getScheduledQueue`, so dispatch and the combined queue display can never disagree.
- New default policy `oldest-first` (survey q3: "oldest waiting job first, wherever it is", with furthest-along **as a percentage** of the pipeline as tiebreak): primary key = oldest waiting (`enteredStageAt`), tiebreak = progress percentage, then absolute stage index. Worst-case wait is bounded by construction (FIFO) plus a built-in 15-minute ceiling that also gates the follow-on pass.
- Follow-on (Rule 1) keeps its single-use pass but cannot pre-empt candidates waiting past the ceiling.
- Rollback/config: `KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along` restores the legacy ordering; `KAINBAIN_DISPATCH_MAX_WAIT_MS` overrides the ceiling (positive) or disables it in legacy mode (0).
- `GET /tasks/queue` without `?projectId=` now returns the central queue (all projects).
- Combined queue popup already lists all projects (`projectScope: 'all'` over the global observability payload); per-project counts added to the popup.
