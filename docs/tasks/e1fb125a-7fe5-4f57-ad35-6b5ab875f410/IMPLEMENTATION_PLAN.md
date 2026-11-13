# Implementation Plan — Auto-approve after X time on human stages

Source: the stage task text ("add auto approve after x time option to human
stages", default off, backend-only, scalable, late-OK-but-never-early) and
`SURVEY.md` (grill-me questionnaire, round 1, 2026-11-10).
This document is the plan only — no code changes are made at this stage.

Related prior work (verified by reading the sources, not just the survey):

- Human checkpoint lifecycle: `api/flow/stageTransitions.js` (`moveToStage`
  parks `status: "waiting_human"` on entering a normalized `human` stage and
  stamps `enteredStageAt`; `advanceStage` writes the `# Human approval` report
  via `buildHumanApprovalContent` and always PASSES on human exit).
- Human routes: `api/flow/taskFlowRoutes.js` (`POST /tasks/:id/advance` with
  guidance + review-comment carry-over, `POST /tasks/:id/reject` with required
  feedback, `POST /tasks/:id/move|jump|complete`).
- Report formatting: `api/reviewCommentFormatter.js`
  (`buildHumanApprovalContent`, `buildHumanRejectionContent`,
  `buildCommentsGuidance`).
- Scheduler (the reuse target): `api/flow/scheduler/startScheduler.js`
  (`setInterval`, default 3s, `unref`'d, honours `schedulerDisabled`),
  `api/flow/scheduler/scheduleTick.js` (one candidate per tick, stats-counted
  outcomes, wedge/watchdog/circuit handling), `api/flow/taskScheduler.test.js`
  (established fake-timer test pattern).
- Scheduler exclusion of humans (the gap this feature fills):
  `api/flow/scheduler/isSchedulerRunnable.js` (only `agent`/`ci`/`merge` are
  dispatchable), `api/flow/scheduler/findNextCandidateTask.js` (only
  `in_stage` tasks scanned), `api/flow/scheduler/countHumanPendingTasks.js`
  (existing cross-project `waiting_human` scan pattern to mirror).
- Stage config + normalization: `api/project/stageNormalizers.js`
  (`normalizeStage` additive-field pattern: `skills`, `tags`, `runnerPolicy`,
  `harness`, `runOnBranch`), `shared/stageVerdict/normalizeStageType.js`
  (`review` -> `human`).
- Alerting (the reminder seam): `api/observability/alerts.js` (`emitAlert`,
  `ALERT_EVENTS` incl. `task.checkpoint_wait`/`info`, sink registry),
  `api/push/pushService.js` (Web Push delivery for human-intervention alerts).
- Stage policy helpers: `api/flow/stagePolicy.js` (`stageElapsedSeconds`,
  `isTerminalTaskStatus`, `findStageByIdOrName`, `isEngineOwnerOf`).
- Task persistence: `TaskStore` is filesystem-backed (task markdown
  frontmatter); `enteredStageAt`/`status` survive restarts, which is what
  makes a deadline-stamp design durable without new infrastructure.
- Docs surfaces: `site-docs/review-gates.md` (approve/reject/re-route),
  `site-docs/pipeline-stages.md` (task statuses incl. `waiting_human`),
  `site-docs/api-reference.md` (endpoint table).

---

## 0. Survey status and proposed defaults (needs confirmation)

The grill-me survey (`SURVEY.md`) was generated but **not answered**
(`"answers": {}`). The cited idea file (`idea-20261109-221309.md`) is also
**absent** from the task directory (only `SURVEY.md` is present) — the task
statement text is therefore the authoritative source, and the survey questions
below are answered here as *proposed defaults* (taking every survey
"Recommended" option, which also matches the task text) for the implementer
(or a human) to confirm before building. If confirmed answers arrive later,
they override this section.

| Survey question | Proposed default | Rationale |
|---|---|---|
| Q1 — Where to set the wait? | **On the step itself (same every run).** | Matches "add option to human stages"; a per-run override is an explicit follow-up, not v1. |
| Q2 — How to pick the length? | **Free-form duration** (`10 days`, `36 hours`, plus a documented bare-number rule). | Covers both use cases in the task ("a week or two", "held for 10 days"); a preset list alone cannot express legal holds. |
| Q3 — What can a person do while waiting? | **Approve or reject early as normal — the timer is only a backup.** | Least surprise; matches the "speak now or forever hold your peace" framing. A "reject-early-only / approve-only-at-deadline" true-hold mode is a follow-up, not v1. |
| Q4 — Warning before auto-approve? | **Yes — one reminder shortly before it approves.** (No snooze/extend in v1.) | A silent auto-approve defeats the "get advice" use case; snooze adds a second mutation surface and can wait. |
| Q5 — How does it show in history? | **Clearly marked as automatic, with timestamps.** | Auditability; the task's own legal-hold framing requires proving *when* and *how* approval happened. |
| Q6 — Timing rule (never early, may be late)? | **Yes — deadline is a minimum; late is fine, early is a bug.** | Stated verbatim in the task ("auto approve time is the min it can ever be"); drives the entire design (§2). |

Implications carried through the rest of the plan:

- v1 is: per-stage optional duration, default off; manual approve/reject
  always win the race; one pre-deadline reminder; auto-approvals are
  unmistakable in history, timeline, and the stage report.
- If Q3 is later answered "true minimum hold" (no early approve), §4.4 and
  the `/advance` route guard must be re-scoped before implementation — that
  answer changes an existing user-facing endpoint, not just new code.
- If Q1 is later answered "both" (per-run override), the per-task deadline
  stamp (§2.2) already supports it: the override would only change what value
  gets stamped at stage entry. No redesign needed.

---

## 1. Goals and non-goals

### 1.1 Goals (acceptance-criteria mapping)

| # | Criterion | Plan section |
|---|---|---|
| G1 | **A human stage can carry an optional auto-approve duration, default off.** Absent/zero means today's behaviour exactly (wait forever). | §4.2 |
| G2 | **A task parked at such a stage auto-advances once its hold has fully elapsed — never before.** The elapsed hold is always `>=` the configured duration, even across restarts, config edits, and clock reads. | §2, §4.3, §4.4 |
| G3 | **Scales to many concurrent timers with O(1) timers.** One sweeper, not one timer per task; bounded work per sweep; no per-task `setTimeout`/`setInterval`. | §2.1, §4.3 |
| G4 | **Manual approve/reject during the wait behave exactly as today and cancel the timer.** No double-advance, no auto-approve after a human already acted. | §4.4, §6.1 |
| G5 | **Auto-approvals are auditable:** history, timeline, stage report, and (where configured) alerts/push all say *automatic*, with the deadline and fire time. | §4.5 |
| G6 | **One pre-deadline reminder** goes out through the existing alert seam shortly before auto-approve (configurable lead time, default sensible, disable-able). | §4.6 |
| G7 | **Change is verifiable:** automated tests pin every behaviour above (incl. never-early and restart recovery); docs updated alongside; `npm run test:unit` + `npm run docs:check` green. | §6, §7 |

### 1.2 Non-goals (explicit follow-ups, not v1)

- True minimum-hold mode (blocking early manual approve) — needs Q3
  confirmation and changes `POST /tasks/:id/advance` semantics.
- Per-run / per-task duration overrides and snooze/extend — needs Q1/Q4
  confirmation; the deadline-stamp design (§2.2) keeps them cheap later.
- Exact-time firing, sub-second precision, or distributed/multi-process
  leader election. v1 assumes the existing single-host scheduler model.
- New UI for configuring the duration. The task mandates backend-only; v1
  exposes the field through the existing stage-config persistence +
  validation so a later UI (or API client) can set it without backend
  changes. A minimal read-back in task payloads (§4.7) is in scope so the
  value is observable.
- New scheduler/queue model, new timer infrastructure (no Redis, no job
  queue, no cron daemon), bulk backfill of deadlines for historical tasks.

---

## 2. Key design decisions (settle early — everything else hangs off these)

### 2.1 One sweeper, zero per-task timers (the scalability decision)

**Recommended:** a single low-frequency sweeper that scans for *due*
human-parked tasks and advances them, reusing the exact `advanceStage` path
a human approval takes.

- **Why not one timer per task:** a `setTimeout` per waiting task dies on
  restart (all deadlines must be rebuilt from disk anyway), leaks when tasks
  are moved/rejected/deleted out from under it, and scales with waiting-task
  count. The task explicitly demands scalability across many concurrent
  timers, so per-task timers are rejected.
- **Why not piggyback every 3s scheduler tick:** the dispatch tick is a
  hot, latency-sensitive path with circuit/wedge/watchdog branches; human
  holds are day-scale. Scanning all waiting tasks every 3s is wasted work
  and risks slowing dispatch. A dedicated sweeper on its own slow cadence
  (default e.g. 60s, env-configurable) keeps both paths clean. It still
  shares the scheduler's lifecycle (`startScheduler`/`stopScheduler`,
  `schedulerDisabled` honoured) so there is one loop model, not two.
- **Bounded work per sweep:** cap advances per sweep (e.g. 25, env-tunable)
  ordered by earliest deadline first; leftover due tasks wait for the next
  sweep. Late is acceptable per Q6, so shedding load by deferring is always
  safe. The sweep counts outcomes on `schedulerStats` (same pattern as
  `scheduleTick`) for idle-vs-stuck diagnosis.
- **Rejected alternative — exact `setTimeout` scheduled for the nearest
  deadline:** more precise but reintroduces restart-rebuild, re-arm-on-every-
  mutation complexity, and a second scheduling model. Q6 explicitly trades
  precision for scalability, so this is over-engineering for v1.

### 2.2 Stamp the deadline once at stage entry (the never-early decision)

**Recommended:** when a task *enters* a human stage with auto-approve
configured, compute `autoApproveAt = enteredStageAt + duration` once, persist
it on the task (frontmatter, like `enteredStageAt`), and have the sweeper
fire only when `now >= autoApproveAt`.

- **Why stamp, not recompute:** recomputing `enteredStageAt + currentStageConfig`
  at sweep time lets a mid-wait config edit *shorten* the hold (legal risk:
  a "10 day hold" edited to "1 day" on day 2 would fire early relative to
  the original promise). A stamp makes the deadline immutable for that
  visit: later config edits affect only future entries. The stamp is also
  what makes restart recovery trivial (no rebuild — the deadline is on disk).
- **Never-early enforcement points:** (1) the sweeper predicate is strictly
  `Date.now() >= Date.parse(autoApproveAt)` — no rounding down, no
  "close enough" epsilon; (2) any duration parsing rounds *up* to the next
  whole second/millisecond so `10 days` can never become 9.999 days through
  float math; (3) a missing/unparseable stamp never fires (fail closed).
- **Clock note:** server wall-clock (`Date.now`) is the single time source,
  consistent with `enteredStageAt`/`stageElapsedSeconds` today. Document that
  an operator moving the system clock backwards delays firing (safe
  direction) and moving it forwards can only fire tasks whose stamped
  deadline has genuinely passed in wall-clock terms. No monotonic-clock
  machinery in v1.

### 2.3 Reuse the human-approval exit path (the "no second approval" decision)

**Recommended:** the sweeper advances via `advanceStage` (the same function
`POST /tasks/:id/advance` calls), passing an `automated: true`-style marker
through `humanReview`, so branch-ref ensure, prompt curation, engine release,
timeline/diff-stat rows, and terminal-stage completion all behave identically
to a manual approve.

- What differs is *attribution only*: the history line, timeline row, stage
  report header, and alert say "automatic" with deadline + fire timestamps
  (Q5). No parallel advance implementation may be written — a second path
  would drift from the first (the exact failure this principle prevents).
- The manual routes need no behaviour change in v1 (Q3 default): approve,
  reject, move, jump, pause, and abort all implicitly cancel the timer
  because the sweeper only fires on tasks still `waiting_human` at the same
  stage with a live stamp. Leaving the stage clears the stamp (§4.4).

### 2.4 Duration format and storage (the config-shape decision)

**Recommended:** canonical stored form is an integer millisecond count
`autoApproveAfterMs` on the stage (`undefined`/absent/`0` = off); a shared
parser accepts human strings (`"10 days"`, `"36 hours"`, `"1 week"`,
`"90m"`) at the config boundary and converts once.

- **Why ms integer canonical:** unambiguous, locale-free, trivially
  comparable, matches the codebase's `*Ms` env-knob convention
  (`schedulerIntervalMs`, `alertTimeoutMs`). The human string is UX sugar
  parsed at write time, never re-parsed at sweep time.
- Validation at the same boundary that rejects unknown `runnerPolicy` modes
  with 400 today: reject negative/NaN/unparseable, clamp to a documented max
  (e.g. 365 days) to catch unit mistakes (`"10000"` meaning seconds vs ms),
  require a documented minimum (e.g. 60s) so a typo cannot create a
  sub-minute "hold". Normalization lives in `normalizeStage` following the
  existing additive-field pattern (legacy stages round-trip byte-identical).

---

## 3. "Make change easy, then make the change"

Before any behaviour change, land research spikes and low-risk preparatory
edits so the real change is mechanical. Big/uncertain work comes first.

### Phase E0 — Research + preparation (no behaviour change)

#### E0.1 — Research spike R1: timer/scheduler/persistence truth (biggest risk first)

Answer in writing (a short spike note, `docs/research/` or task-dir appendix):

1. **Waiting-state durability:** confirm `waiting_human` + `enteredStageAt`
   round-trip through task markdown frontmatter today (which keys are
   persisted vs memory-only — cf. `supersededStageId` being memory-only in
   `moveToStage`). A new persisted stamp must follow the persisted path, not
   the memory-only one. Note the exact read/write helpers to reuse.
2. **Sweeper insertion point:** read `startScheduler`/`stopScheduler`/
   `ensureScheduler`/`kickScheduler` and decide the exact wiring for a second
   `setInterval` (same lifecycle, independent cadence): where the timer
   handle lives on the store, how `schedulerDisabled` and tests disable it,
   whether `runScheduledTick`-style error swallowing is reused.
3. **Auto-advance engine semantics:** trace what `advanceStage` does to
   engine ownership when called outside an HTTP request (checkpoint release
   in `moveToStage`, `lastCompletedTask` follow-on interplay in
   `findNextCandidateTask`, queue-empty latch in `scheduleTick`). Decide
   whether the sweeper should `kickScheduler` after advancing so the next
   stage dispatches promptly.
4. **Runner-lease interplay:** a task under a Runner lease (`claimStore`)
   must never be auto-advanced out-of-band (D1 — one holder, one runner).
   Confirm the check the sweeper must perform (mirror the `/execute` 409
   guard) and what "claimed" means for a `waiting_human` task (expected:
   rare/impossible, but the guard must exist).
5. **Restart catch-up:** confirm no existing startup path touches
   `waiting_human` tasks destructively (`reconcileInterruptedRuns`,
   `performStartupRecovery` — orphaned *running* statuses collapse, waiting
   ones must be left alone). The sweeper's first tick after boot is the
   catch-up; overdue tasks fire in deadline order within the batch cap.

#### E0.2 — Research spike R2: duration/config conventions + reminder seam

1. **Duration parsing precedent:** grep for existing duration/interval parsing
   (`schedulerIntervalMs`, CI stall/keep-alive knobs in `api/config/schema.js`,
   any `ms`-style helpers). Reuse if one exists; otherwise specify the v1
   grammar (`s/m/h/d/w` + long forms + bare numbers-as-what — decide and
   document; recommend bare numbers = seconds is WRONG, bare = ms is
   confusing — pick one, document loudly, validate loudly).
2. **Stage-config write boundary:** find where stage saves are validated
   today (the 400-on-unknown-`runnerPolicy`-mode site) and where
   `normalizeStage` is invoked on load vs save, so the new field gets
   validated in exactly one place and normalized idempotently.
3. **Reminder seam:** read `emitAlert` callers + `fireQueueEmptyPush` +
   push settings to decide the reminder shape: a new `ALERT_EVENTS` entry
   (e.g. `task.auto_approve_soon`) vs reusing `task.checkpoint_wait`. Read
   the webhook contract tests to size the change. Decide the default lead
   time (proposal: 24h before deadline, but not less than 1h for short
   holds — e.g. `min(24h, duration/2)`; needs one line of product
   confirmation) and the once-per-deadline marker (`autoApproveRemindedAt`).
4. **Frontend read surface (backend-only constraint):** confirm that adding a
   persisted stage field + task stamp needs no frontend change to stay safe
   (unknown-field tolerance on both sides — the `normalizeStage*` comments
   already promise pass-through). Note the follow-up UI ticket shape.

#### E0.3 — Test-harness + seam preparation (no behaviour change)

- Locate the fake-timer scheduler tests (`taskScheduler.test.js`:
  `startScheduler`/`stopScheduler` idempotency, `scheduleTick` stats) and
  the `advanceStage`-via-`app.inject` integration pattern
  (`reviewAssembly.integration.test.js`) for reuse; note file/line in the
  spike note.
- Add the sweeper stats keys to `freshSchedulerStats` now (zeroed, inert)
  and a tolerant assertion seam (a test that lists waiting tasks and
  tolerates absent stamps), so later wiring is pure fill-in.
- Keep `npm run test:unit` green throughout E0. Nothing user-visible changes.

_Phase E0 must keep `npm run test:unit` green. Nothing a user sees changes._

---

## 4. The product changes (the change, now easy)

### 4.1 Shared duration parser (new, pure, no deps)

- New small module (proposal: `shared/autoApproveDuration.js`, co-located
  with the other shared stage helpers) exporting `parseAutoApproveDuration`
  (string|number -> integer ms, or `null` when off/absent) and
  `formatAutoApproveDuration` (ms -> `"10 days"` for history/report text).
- Rules: reject negative/NaN/empty-with-garbage; round UP to whole ms;
  enforce documented min/max (proposal: min 60s, max 365d — confirm in E0/R2);
  bare numbers mean milliseconds ONLY if the codebase already does that,
  else require a unit (decide in E0, document loudly).
- Pure + shared so the API boundary, a future UI, and tests use one grammar.

### 4.2 Stage config: `autoApproveAfterMs` (default off)

- `normalizeStage` gains the additive field following the `runnerPolicy`
  pattern: absent stays absent (legacy round-trip byte-identical); present
  values are coerced via the §4.1 parser; invalid values are dropped on load
  (tolerant read) but rejected with 400 at the stage-save boundary (strict
  write) — the same split the codebase uses for `runnerPolicy` today.
- Only meaningful on `human` stages: setting it on `agent`/`ci`/`merge` is
  ignored (or 400 — decide in E0/R2; proposal: ignore-with-warning, matching
  the harness-unknown fallback philosophy, so pipeline reordering never
  breaks saves).
- Non-human stages and off-by-default stages behave exactly as today (G1).

### 4.3 The sweeper (new module, one slow timer)

- New module (proposal: `api/flow/scheduler/autoApproveSweep.js` + wiring in
  `startScheduler`/`stopScheduler`), cadence env-knob
  (proposal: `KAINBAIN_AUTO_APPROVE_SWEEP_MS`, default 60_000; `0` disables
  the sweeper independently of the dispatch scheduler).
- Each sweep: (1) list projects/tasks once (mirror the
  `countHumanPendingTasks` scan, but collect instead of count); (2) keep
  tasks with `status === "waiting_human"`, current stage resolving to
  `human`, a live `autoApproveAt` stamp, `now >= stamp`, not blocked/paused/
  claimed/terminally-settled; (3) sort by stamp ascending; (4) advance up to
  the batch cap (proposal: `KAINBAIN_AUTO_APPROVE_BATCH`, default 25) via
  the §4.4 path; (5) count everything on `schedulerStats`
  (`autoApproveSweeps`, `autoApproved`, `autoApproveDeferred`, `lastOutcome`
  variants) without disturbing existing keys.
- Failure isolation: one task's advance throwing must not abort the sweep
  (try/catch per task, counted, logged); the sweep itself never throws out
  of the tick (mirror `runScheduledTick`).
- First tick after boot is the restart catch-up: overdue stamps fire in
  deadline order within the cap (E0/R1-5 confirms waiting tasks are
  untouched by recovery).

### 4.4 Deadline stamping + auto-advance path (the core lifecycle edit)

- **Stamp on entry:** in `moveToStage`, when the destination normalizes to
  `human` and carries `autoApproveAfterMs > 0`, set
  `task.autoApproveAt = new Date(enteredStageAtMs + duration).toISOString()`
  and clear `task.autoApproveRemindedAt`. When the destination is not human
  (or the duration is off), clear both keys. Persist via the existing
  `_saveTaskMarkdown` call already in `moveToStage` — no new write path.
- **Clear on every exit:** any transition out of the stage (advance, reject/
  failback, move, jump, pause, abort, complete, terminal settle) clears the
  stamp. Centralize in the transition helpers (`moveToStage`,
  `failbackStage`, `completeTask`, `rejectTask`, pause/abort paths) — audit
  in E0/R1 and list the exact sites; missing one is the "timer fires after a
  human acted" bug, so this gets its own test per exit (§6.1).
- **Fire:** the sweeper re-validates the predicate immediately before each
  advance (re-read the task; skip if status/stage/stamp changed — the
  sweep-then-act race window), then calls the same `advanceStage` the route
  uses, with `humanReview: { automated: true, autoApproveAt, firedAt }`.
  `advanceStage` folds the marker into the history line, timeline row, and
  report content (§4.5). After advancing, `kickScheduler` (decision from
  E0/R1-3) so the newly-entered automated stage dispatches promptly instead
  of waiting for the next dispatch tick.
- **Single-flight:** the sweeper processes tasks serially within a sweep and
  skips any task the engine currently owns as `running` (a human-parked task
  should never be running, but the guard is one line and closes the
  double-advance class entirely).

### 4.5 Automatic attribution (history, timeline, report, alerts)

- History line (proposal): `Auto-approved after <duration> (automatic):
  held since <enteredStageAt>, deadline <autoApproveAt>, fired <firedAt>`.
- Timeline row: same `Advanced` shape as today (analytics untouched) with an
  `automated: true`-style marker field so displays can badge it; confirm the
  exact field with the timeline consumer (`buildDisplayTimeline`) in E0.
- Stage report: extend `buildHumanApprovalContent` with an
  `automated: { autoApproveAt, firedAt }` option rendering an
  `# Human approval (automatic): <name>` header variant + a line stating the
  configured hold, deadline, and fire time. Manual approvals render
  byte-identically to today.
- Alert: `emitAlert` on auto-approve (proposal: reuse the checkpoint family —
  exact event from E0/R2-3) so webhook/push consumers see it; severity
  `info`, never paging.

### 4.6 Pre-deadline reminder (one, idempotent, through existing seams)

- Same sweep, same scan: a waiting task with a live stamp, not yet reminded
  (`!autoApproveRemindedAt`), and `now >= autoApproveAt - leadTime` gets one
  reminder via `emitAlert` (+ push where configured), then stamps
  `autoApproveRemindedAt` and persists. Lead time: env-knob with a duration-
  relative default (proposal from E0/R2-3: `min(24h, duration/2)`, min 5m;
  `0` disables reminders).
- Reminder copy names the stage, the deadline, and that silence = approval
  ("speak now or forever hold your peace" made explicit).

### 4.7 Observability read-back (minimal, additive)

- Task payloads already serialize the whole task object — confirm in E0/R2-4
  that `autoApproveAt`/`autoApproveRemindedAt` and the stage's
  `autoApproveAfterMs` are visible to API clients with no serializer change.
  If a pick-list serializer exists, add the keys there (additive only).
- Scheduler stats keys from E0.3 become live; the `/engine/state` snapshot
  shows sweeper health for free.

### 4.8 What is deliberately *not* changed

- Dispatch tick hot path (`findNextCandidateTask`, `isSchedulerRunnable`,
  `executeStage`): untouched. The sweeper is a separate module + timer.
- Manual route semantics (`/advance`, `/reject`, `/move`, `/jump`, `/pause`,
  `/abort`, `/complete`): behaviour-identical; they only gain stamp cleanup.
- Report/timeline shapes for manual approvals: byte-identical.
- Engine/concurrency model: still one engine, one dispatch at a time; the
  sweeper advances serially and never executes agent/CI work itself.
- Frontend: no UI changes in v1 (backend-only mandate). Unknown-field
  tolerance (E0/R2-4) keeps old clients safe.

---

## 5. Rollout, compatibility, and ops

- **Default-off = zero-blast-radius rollout:** with no stage configured, the
  only new runtime cost is one slow scan that finds no stamps (short-circuit
  on zero human-parked tasks, mirroring `countHumanPendingTasks` cost).
- **Existing waiting tasks:** stamps are written only on *entry*; tasks
  already `waiting_human` when the feature ships get no stamp until they
  next enter a configured human stage (no backfill — §1.2 non-goal). Document
  this: operators move/re-enter such tasks if they want the timer.
- **Config edits mid-wait:** safe by design (§2.2) — the stamp is immutable
  for that visit. Document that raising the duration does not extend a live
  wait and lowering it never shortens one.
- **Kill switches:** `KAINBAIN_AUTO_APPROVE_SWEEP_MS=0` disables the sweeper;
  `schedulerDisabled` disables everything (existing). Both are restart-safe
  because stamps persist — re-enabling resumes firing overdue tasks oldest-
  first, never early.
- **Monitoring:** `schedulerStats.autoApproved/autoApproveDeferred` +
  `lastTickAt`-style sweep timestamps in `/engine/state`; alert pipeline
  (webhook/push) covers reminder + auto-approve events.

---

## 6. Testing and quality gates

### 6.1 Unit tests (primary gate, `npm run test:unit`)

Co-locate with the touched modules, following the one-function-per-file +
`.test.js` convention (`scripts/check-one-function-per-file.mjs` must pass):

- **Duration parser** (§4.1): every supported unit, long/short/plural forms,
  whitespace/case tolerance, bare-number rule, min/max clamp + rejection,
  round-up-never-down (e.g. fractional ms), invalid -> `null`/throw per
  contract. Pure-function table tests.
- **Stage normalization** (§4.2): legacy stage without the field round-trips
  byte-identical; valid values coerce to integer ms; invalid values dropped
  on load; save-boundary 400 on invalid; non-human stage with the field set
  is ignored per E0 decision.
- **Stamp lifecycle** (§4.4): entering a configured human stage writes
  `autoApproveAt = enteredStageAt + duration` exactly; entering an
  unconfigured human stage clears; one test *per exit path* (advance,
  reject, move, jump, pause, abort, complete) asserting the stamp is gone.
- **Never-early predicate** (the legal property): boundary tests at
  `stamp - 1ms` (must NOT fire), `stamp` exactly (fires), `stamp + 1ms`
  (fires); unparseable/missing stamp never fires; float-duration inputs
  always round the deadline up. Use injected `now` (no real timers).
- **Sweeper selection** (§4.3): mixed fixture (due, not-yet-due, no stamp,
  wrong status, non-human stage, paused stage, blocked, claimed, terminal)
  -> only the due-and-live set advances, earliest-deadline-first, batch cap
  respected with the remainder deferred to the next sweep; per-task throw
  does not abort the sweep; stats keys counted.
- **Race/double-advance**: task approved manually between scan and fire is
  skipped (re-validation); task already `completed`/`failed` is skipped;
  engine-owned `running` task is skipped.
- **Attribution** (§4.5): auto-advance writes the "automatic" history line
  with all three timestamps, the timeline marker, and the automatic report
  header; manual-approval report output is byte-identical to today
  (golden-string test on `buildHumanApprovalContent` without the marker).
- **Reminder** (§4.6): fires once when entering the lead window; never
  before; never twice (marker persisted); disabled when lead time is 0;
  short holds get the relative default per E0 decision.
- **Restart recovery**: stamp survives serialize/deserialize round-trip
  (frontmatter write + read); overdue-after-boot task fires on first sweep
  in tests using fake timers + temp dirs.

### 6.2 Integration tests (real temp repos, established pattern)

- Temp-repo + `app.inject` (as in `reviewAssembly.integration.test.js`):
  create project with a human stage configured with a short hold (seconds —
  test-only durations must be allowed despite the 60s production minimum;
  decide the escape hatch in E0, e.g. env override or explicit test-only
  bypass), move a task in, run the sweeper with fake/advanced time, assert
  end state via API + task markdown on disk (status advanced, stamp cleared,
  report file contains the automatic header).
- **Early-manual-wins**: same setup, but `POST /advance` (and separately
  `POST /reject`) before the deadline -> sweeper later does nothing; task
  state is exactly today's manual outcome.
- **No long-lived background server.** In-process temp dirs + fake timers
  only, per the Testing & Verification Guidance (headless, isolated, or
  mock fixtures).

### 6.3 Scale test (the task's explicit scalability demand)

- Seed N waiting tasks (proposal: N=1000 across several projects, a mix of
  due/not-due/unstamped) in temp dirs; run one sweep with a batch cap;
  assert: wall time bounded (proposal: <5s on CI-class hardware — calibrate
  in E0), only the cap advanced, memory flat (no per-task timer handles —
  assert via handle counts or code inspection that zero `setTimeout` are
  created per task), second sweep continues where the first left off.
- This test exists to fail if anyone later "simplifies" to per-task timers.

### 6.4 Docs tests (existing gates, no new harness)

- `npm run docs:check` (frontmatter/order/link integrity +
  `check-jsdoc-example.mjs`) passes with all doc updates included; every new
  JSDoc `@example` is exercised by the example checker.

### 6.5 Manual walkthrough (human gate)

```text
Walkthrough: auto-approve a human stage
1. On a scratch project, set a human stage hold to a short test value
   (per the E0 test-hatch) and enter a task into it; record enteredStageAt.
2. Confirm the task payload shows autoApproveAt = enteredStageAt + hold.
3. Wait past (deadline - leadTime); confirm ONE reminder arrived (UI event
   and, if configured, webhook/push) naming the deadline.
4. Manual path: approve a second waiting task early; confirm it advances
   normally and never auto-fires afterwards.
5. Auto path: let the first task pass its deadline; confirm it advances
   within ~2 sweep intervals, history/timeline/report all say "automatic"
   with matching timestamps, and the next automated stage dispatches.
6. Restart the API mid-wait on a third task; confirm the deadline survived
   and the task still fired late-or-on-time, never early.
7. Attach payload excerpts + timestamps to the stage report as evidence.
```

### 6.6 Commands to run before submitting

```text
npm run test:unit          # primary gate — must be green
npm run test:api           # if run separately from test:unit
npm run docs:check         # site-docs + JSDoc integrity — must be green
npm run lint               # no new lint violations
```

Do not spawn a long-lived preview server — headless/in-process tests and
existing mock fixtures only (`npm run capture:screenshot` is N/A: v1 has no
UI surface).

---

## 7. Documentation plan

### 7.1 Docs to write during implementation (not after)

- **This file** (`docs/tasks/e1fb125a-7fe5-4f57-ad35-6b5ab875f410/IMPLEMENTATION_PLAN.md`)
  — the plan itself.
- **Spike notes** from E0 (R1 + R2 findings): timer/persistence truth,
  duration-grammar choice, reminder-event choice, serializer audit. Saved
  under `docs/research/` or as a task-dir appendix — decide in E0, link
  from the implementation report either way.

### 7.2 Docs to update at implementation time

- **Product docs:** extend `site-docs/review-gates.md` with an "Automatic
  approval after a hold" section (what it is, both use cases from the task,
  default-off, deadline-is-minimum rule, mid-wait edit semantics, no-backfill
  note, reminder behaviour, audit trail fields). One-line pointer from
  `site-docs/pipeline-stages.md` (`waiting_human` row). If the section grows
  past ~60 lines, split to a new `site-docs/auto-approve.md` article instead
  (frontmatter/order/link contract per `site-docs/README.md`) — decide while
  writing, keep `docs:check` green either way.
- **Config reference:** document `KAINBAIN_AUTO_APPROVE_SWEEP_MS`,
  `KAINBAIN_AUTO_APPROVE_BATCH`, reminder lead-time knob, and the stage
  field grammar wherever env knobs + stage fields are referenced
  (`api/config/schema.js` doc strings are the source of truth; mirror in the
  `.env.example` block if that file lists scheduler knobs).
- **Code-adjacent docs:** JSDoc on the new parser, sweeper, stamp sites, and
  the extended `buildHumanApprovalContent` (each with a runnable `@example`
  — the example checker runs them); `moveToStage`/`advanceStage` header notes
  on stamp write/clear; `CHANGELOG.md` entry if repo convention requires one
  for user-visible behaviour.
- **Runbook:** save the §6.5 walkthrough as
  `docs/manual-testing/auto-approve-walkthrough.md` so the next operator can
  re-run the human gate.

### 7.3 What the implementation stage's report should contain

- E0 spike notes (or links) + which §0 defaults were confirmed vs changed.
- Files changed per §4 section (or "verification only" with pinning tests).
- Test evidence: `npm run test:unit` + `npm run docs:check` green snippets;
  scale-test (§6.3) wall-time number.
- Walkthrough evidence: §6.5 payload/timestamp excerpts.
- The exact never-early predicate + stamp field names, for the legal-hold
  audit trail.

---

## 8. Implementation sequence (ordered, big pieces and research first)

Each step keeps `npm run test:unit` green before proceeding. Steps are sized
to one commit each.

| Order | Step | Touch points | Evidence this step is done |
|---|---|---|---|
| **R1** | **Research spike E0.1** (timer/scheduler/persistence truth): durability audit, sweeper insertion point, auto-advance engine semantics, Runner-lease guard, restart catch-up. No code. | Docs only | Spike note committed; §4.3/§4.4 scope confirmed or re-scoped in writing. |
| **R2** | **Research spike E0.2** (duration grammar, save-boundary validation site, reminder-event choice, serializer tolerance audit). No code. | Docs only | Grammar + event + knob defaults chosen; §4.1/§4.2/§4.6/§4.7 validated against reality. |
| **R3** | **Test-harness prep E0.3**: inert sweeper stats keys, tolerant seams, reuse notes for fake-timer + `app.inject` patterns. No behaviour change. | `freshSchedulerStats`, test files only | `test:unit` green; seams in place. |
| **R4** | **Shared duration parser** (§4.1) + unit tests. | `shared/autoApproveDuration.js` (new), tests | Parser table tests green; grammar doc'd. |
| **R5** | **Stage config field** (§4.2): normalize + save-boundary validation + tests. Still inert (nothing reads it yet). | `stageNormalizers.js`, save boundary, tests | Round-trip + 400 tests green; legacy stages byte-identical. |
| **R6** | **Stamp on entry / clear on exit** (§4.4 first half) + lifecycle tests. Still inert (nothing fires on it yet). | `stageTransitions.js`, pause/abort/reject paths, tests | Per-entry/exit tests green; frontmatter round-trip proven. |
| **R7** | **Auto-advance + attribution** (§4.4 second half, §4.5): `advanceStage` automated marker, history/timeline/report/alert text + tests (manual output byte-identical). | `stageTransitions.js`, `reviewCommentFormatter.js`, `alerts.js` call site, tests | Attribution tests green incl. manual golden strings. |
| **R8** | **The sweeper** (§4.3): scan/select/advance/cap/stats + lifecycle wiring (start/stop/disabled) + tests incl. restart catch-up. Feature goes live here. | New sweeper module, `startScheduler`/`stopScheduler`, tests | Selection/cap/race/recovery tests green; scale test (§6.3) written and passing. |
| **R9** | **Reminder** (§4.6) + tests. | Sweeper scan, `emitAlert` call site, tests | Once-only/lead-window/disabled tests green. |
| **R10** | **Observability read-back** (§4.7): serializer keys if needed + stats live. | Serializer (if any), tests | Keys visible in task payload test; `/engine/state` shows sweeper stats. |
| **R11** | **Docs** (§7.2): `review-gates.md` section (or new article), config refs, JSDoc, CHANGELOG, walkthrough runbook. | `site-docs/*`, `schema.js` docs, `CHANGELOG.md` | `docs:check` green; new content serves. |
| **R12** | **Final verification pass** (§6.5 + §6.6): full gates + manual walkthrough; evidence into the stage report. | Repo-wide | `test:unit` + `docs:check` + `lint` green; walkthrough excerpts attached; ready for review. |

Big research (R1–R2) comes before any wiring, per the stage instructions.
R4–R7 are "make change easy" slices (each independently shippable and inert
until R8); R8 is the single behaviour-flip commit; R9–R11 complete the
feature; R12 is the combined "assure the change was implemented" gate
(automated + scale + manual walkthrough).

---

## 9. Risks and mitigations specific to this change

| Risk | Why it matters | Mitigation |
|---|---|---|
| Survey unanswered — §0 defaults may not match what was wanted. | Building backup-timer when a true hold was wanted (or vice versa) wastes the stage. | §0 defaults are explicit and flagged; R1–R2 do not depend on them, so confirmation can land any time before R6. Q3-flip re-scope is pre-planned (§0). |
| Early-fire through float/rounding or predicate error (legal risk). | The task's hard constraint; a hold firing early breaks legal compliance. | Stamp-once (§2.2) + strict `>=` predicate + round-up parsing + dedicated boundary tests (§6.1) + fail-closed on bad stamps. |
| Double-advance (human + sweeper race). | Task jumps two stages or report/history corrupt. | Re-validate-before-fire, serial sweeps, stamp cleared on every exit (§4.4), engine-running skip; race tests in §6.1. |
| Missed stamp-clear on one exit path. | Timer fires after a human already acted — the worst UX failure. | Exit-path audit in R1 + one test per exit (§6.1); centralize clearing. |
| Sweeper slows or wedges the dispatch scheduler. | 3s dispatch path is latency-sensitive. | Separate module + slow timer (§2.1); batch cap; per-task try/catch; sweep never throws; scale test (§6.3) guards. |
| Restart loses or duplicates timers. | Holds are day-scale; restarts *will* happen mid-wait. | Deadline-on-disk (§2.2); first-tick catch-up; no in-memory timer state; recovery tests (§6.1/§6.2). |
| Reminder spam or missing reminders. | Spam pages operators; silence defeats the advice use case. | Once-per-deadline persisted marker; lead-window predicate tested both sides; `0` disables. |
| Duration-grammar footgun (bare numbers, unit typos). | `"10000"` misread fires years early/late. | Strict grammar + min/max (R2), 400 at save boundary, canonical ms storage, loud docs. |
| Frontend/API clients break on new fields. | Unknown keys can break strict serializers. | Additive-only + tolerance audit in R2; no required fields added. |
| Scope creep into UI / true-hold / snooze. | Each doubles the stage; UI violates the backend-only mandate. | §1.2 non-goals are explicit; stamp design keeps them cheap later without building them now. |

---

## 10. Open (intentionally undecided) items

1. **Survey confirmation** — all six §0 defaults await confirmation. If the
   survey is later answered, update §0 and re-scope before R6 (R4–R5 are
   unaffected by most answers; a Q3 flip affects R7 + route guards).
2. **Missing idea file** — `idea-20261109-221309.md` was listed as a prior
   report but is absent from the task directory. If it surfaces, reconcile
   it with this plan before R4.
3. **Exact knob values** — sweep interval default (60s?), batch cap (25?),
   duration min/max (60s/365d?), reminder lead default (`min(24h,d/2)`?):
   proposals only; R1/R2 calibrate with measurements, and all ship as env
   knobs so operators can tune without code changes.
4. **Reminder alert event name** — new `task.auto_approve_soon` vs reusing
   `task.checkpoint_wait`: decided in R2 after reading the webhook contract
   tests.
5. **Non-human stages carrying the field** — ignore-with-warning vs 400:
   decided in R2 (proposal: ignore, so pipeline reordering never breaks
   saves).
6. **Test-only short holds** — production min (60s) vs integration tests
   needing second-scale holds: escape hatch decided in R2 (env override
   proposal), documented, never reachable by accident in prod.
