# Spike notes — auto-approve human stages (E0 / R1+R2)

Date: 2026-11-10. Plan: `IMPLEMENTATION_PLAN.md` §0 defaults (all six
"Recommended" options) taken as confirmed; the survey was never answered and
the idea file is absent, so the task text is authoritative.

## R1 — timer/scheduler/persistence truth

1. **Waiting-state durability:** task markdown frontmatter is the persisted
   path (`saveTaskMarkdown` writes keys, `parseTaskMarkdown` reads them in
   `api/work/taskPersistence.js`). `enteredStageAt`/`status` round-trip;
   `resumedAfterInterruption`/`interruptedAt` are the boolean/string
   precedent. `supersededStageId` is memory-only — the new
   `autoApproveAt`/`autoApproveRemindedAt` stamps follow the frontmatter
   path, not the memory-only one.
2. **Sweeper insertion:** second `setInterval` owned by
   `ensureAutoApproveTimer` (own module), armed from `startScheduler`,
   healed from `ensureScheduler`, cleared in `stopScheduler` as
   `store.autoApproveTimer` (unref'd). Honours `schedulerDisabled` and
   `opts.disabled`; sweep cadence 0 disables the sweeper independently.
3. **Auto-advance engine semantics:** the sweeper calls the same
   `store.advanceStage` the `/advance` route calls. `moveToStage` releases
   a `checkpoint`-parked engine on advance-out, so no extra engine handling
   is needed. The sweeper calls `kickScheduler` after any advance so the
   newly entered automated stage dispatches promptly.
4. **Runner-lease interplay:** the sweeper mirrors the `/execute` 409 guard
   (`store.claimStore?.describe(taskId)` → skip when held) and additionally
   skips blocked tasks (`store.isTaskBlocked`), paused stages, and the
   engine's live `running` owner. A `waiting_human` task should never be
   any of these; each guard is one line that closes a double-advance class.
5. **Restart catch-up:** `reconcileInterruptedRuns` only collapses orphaned
   *running* statuses; `waiting_human` tasks are untouched by recovery
   (`parseTaskMarkdown` preserves the status). Stamps persist on disk, so
   the first sweep after boot fires overdue tasks oldest-first within the
   batch cap. No rebuild needed.
6. **Entry sites found (all stamp):** `moveToStage` (covers
   advance/failback/move/jump/reject-failback), `createTask` (created
   directly into a human stage), the `executeStage` human-park block
   (re-park of an `in_stage` task at a human stage via execute/resume/
   retry/follow-up), and the PUT-workflow status flip in
   `api/routes/projects.js`. `parkTaskForSurvey` parks `waiting_human` at
   *agent* stages — excluded by the sweeper's human-stage check, no change.
7. **Exit/clear sites (all clear):** `moveToStage` to any non-qualifying
   destination, `pauseTask`, `abortTask`, `completeTask`,
   `failbackStage`'s abort-policy branch, and the PUT-workflow flip back to
   `in_stage`. One test per exit.

## R2 — duration/config conventions + reminder seam

1. **Duration grammar:** no existing human-duration parser (the config
   `DURATION_PATTERN` returns raw text; `shared/stageDurations.js` parses
   report seconds only). New shared grammar in
   `shared/autoApproveDuration.js`: `ms/s/m/h/d/w` + long/plural forms,
   case-insensitive, multi-part combos (`1h 30m`), whitespace-tolerant.
   **Bare numbers mean milliseconds**, matching the `stage.timeout`
   bare-ms convention. Fractional input rounds UP (`Math.ceil`).
   Min 60s / max 365d enforced ONLY at the stage-save boundary (400);
   `normalizeStage` is shape-only (tolerant read, drops invalid) so
   legacy stages round-trip byte-identically and in-memory/test stages
   can carry short holds without an env escape hatch.
2. **Save boundary:** the four `assertValidStageRunnerPolicies` sites in
   `api/routes/projects.js` gain an `assertValidStageAutoApproves` sibling.
   Non-human stages carrying the field: **kept, not dropped or 400'd**
   (data-preserving across pipeline reorders; only `human` stages act on
   it). Documented in `normalizeStage` JSDoc.
3. **Reminder seam:** two NEW alert events, `task.auto_approve_soon`
   (reminder) and `task.auto_approve` (fired), added to `ALERT_EVENTS`
   (webhook contract tests iterate the list, so coverage is automatic).
   The reminder's UI relay reuses the existing `stage:checkpoint_wait`
   event (no `eventBridge` change); the fired alert needs no UI relay
   (`moveToStage`/`completeTask` already broadcast). Effective lead is
   `min(configured 24h default, half the hold)`; `0` disables reminders.
   Once-per-deadline marker `autoApproveRemindedAt` persisted. No new Web
   Push methods in v1 (follow-up); webhook + dashboard broadcasts cover it.
4. **Frontend tolerance:** stage saves use partial updates
   (`onUpdateStage(id, patch)` merges) and `pipelineTransfer` carries
   unknown keys verbatim — no frontend change needed. Task payloads return
   `{...task}`, so the stamps are visible to API clients with no
   serializer change.

## Test-harness notes (E0.3)

- Stub-store pattern: `taskScheduler.test.js` `makeStore` and
  `stageTransitions.test.js` `makeStore` (mirror both).
- Route pattern: `api/routes/projects.test.js` (temp roots + `app.inject`);
  the app uses the `taskStore` singleton, so integration tests can call
  `taskStore.autoApproveSweep({ now })` with injected time directly.
- Gates per new file: one top-level `function` max
  (`check-one-function-per-file.mjs`; arrow consts exempt) and `@example`
  on every new export (`check-jsdoc-example.mjs`).
- `.env.example` is generated from the config schema — regenerate after
  adding knobs. `freshSchedulerStats` has an exact-shape test to extend.
