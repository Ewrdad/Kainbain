# Implementation Plan — Central Queue Across Pipelines / Projects

Task: `16d6fbd6-5c15-4d4f-adca-255e89176bc9`
Stage: plan (docs-only). No code changed in this stage.
Companion input: [SURVEY.md](./SURVEY.md) (grill-me survey; answers empty at plan time — carried as open decisions with defaults below).

## Goal

Make waiting work run in the background across ALL pipelines/projects fairly, regardless of which pipeline (if any) the UI has focused — and give the operator one combined view of that central queue. This restores the kainbain premise: normalise work across multiple projects and pipelines.

## Success Criteria

1. A task waiting on a non-focused pipeline is picked up without any UI navigation, within a bounded worst-case wait (no starvation).
2. Dispatch order across projects is deterministic, documented, and fair per the chosen policy (survey q3), not biased to the focused/longest-running pipeline.
3. Workers (embedded scheduler and runner fleet) draw from one central queue abstraction; no dispatch path filters by UI focus.
4. One combined queue surface shows all waiting work (all projects), with per-project/pipeline counts and current worker activity (survey q5).
5. `npm run test:unit` green; new regression tests reproduce the original symptom and fail without the fix.
6. Queueing/scheduling docs updated so a future reader can answer "how is the next task chosen?" from one place.

## What We Already Know (grounded pre-research)

This plan is grounded in code read on 2026-11-11. Nothing below is assumed:

- **A global scan already exists on both dispatch paths.**
  - Embedded: `api/flow/scheduler/findNextCandidateTask.js` scans all projects (Rule 0 resumed-first, Rule 1 follow-on from just-completed task, Rule 2 furthest-along, Rule 3 oldest).
  - Runner fleet: `api/flow/dispatch/scanClaimableTasks.js` scans all projects with the same furthest-along/oldest ordering.
- **Prime suspects for the reported symptom** (unfocused pipelines stall):
  1. **Single-active serialization** — `api/flow/scheduler/scheduleTick.js` busy gate + `ExecutionQueue` (`api/flow/executionQueue.js`) allow one live execution; characterised by `api/flow/singleActiveInvariant.test.js`. One long task on pipeline A blocks every other pipeline behind it.
  2. **Follow-on stickiness (Rule 1)** — after a task completes, its own pipeline is re-offered first, biasing dispatch toward the already-busy pipeline.
  3. **No fairness / starvation bound by default** — the starvation guard (`dispatchMaxWaitMs`) is opt-in and defaults to 0 = off (`scanClaimableTasks.js`); nothing bounds worst-case wait under perpetual late-stage influx.
  4. **Runner self-scoping** — `POST /runners/dispatch` accepts a runner-declared `projectIds` allowlist (`api/flow/runnerRoutes.js`), sourced from `KAINBAIN_RUNNER_PROJECTS` (`runner/config.js`, sent by `runner/daemon.js`). A scoped runner legitimately ignores other pipelines — must be distinguished from a bug during diagnosis.
  5. **UI-focus coupling is NOT yet proven in dispatch code** — scheduler ticks run on a server interval (`api/flow/scheduler/startScheduler.js`, default 3 s) plus mutation kicks (`api/work/kickIfRunnable.js`); neither takes a "focused pipeline" input. Phase 0 must confirm or refute the user's fear with a repro, including checking for frontend-triggered `execute` calls and per-project engine-state gates.
- **Queue display already has global-capable seams**: `GET /tasks/queue` (optional `?projectId=` filter, `api/work/taskWorkRoutes.js`), `getScheduledQueue(store, filterProjectId)` (`api/flow/scheduler/getScheduledQueue.js`), `useScheduledQueue({ projectScope: 'all' })` (`frontend/src/hooks/useScheduledQueue.js`) feeding the Now Playing queue popup, and `QueueOrderList`/`QueueOrderWidget` (`frontend/src/components/observability/widgets/`). The main board remains per-pipeline; there is no first-class "all work" board view.

## Survey Integration (SURVEY.md)

All five survey questions were unanswered at plan time, so each is carried as an **open decision with a recommended default**. Confirm with the user before Phase 2; Phase 0/1 proceed regardless.

| # | Question | Recommended default | Rationale |
|---|----------|---------------------|-----------|
| q1 | What happens today on unfocused pipelines? | Phase 0 answers empirically (repro first, no assumption) | Must distinguish stall vs slow vs starvation; each implies a different fix |
| q2 | Main fix wanted? | Both: background run + combined list | Matches the task title ("central queue") and kainbain's normalise-work premise |
| q3 | Cross-project ordering? | Oldest-waiting-first with furthest-along tiebreak, plus a starvation bound | Smallest change to existing Rule 2/3; fairness without inventing a new scheduler |
| q4 | Run with nobody in the app? | Yes, keep working (server scheduler already does); add a global pause switch | Pause switch is cheap insurance and answers the "runaway fleet" worry |
| q5 | Combined list contents? | All waiting jobs + per-project/pipeline counts + worker activity; defer pause/reorder to follow-up | First three are read-only views over existing data; reorder changes dispatch semantics and needs its own design |

## Approach — Make Change Easy, Then Make the Change

Big/risky unknowns go first. The order is deliberate:

1. **Phase 0 — Diagnose before designing.** Reproduce the symptom in a controlled two-pipeline setup and attribute it to one of the suspects above. No fix is designed until the repro names the cause; a wrong-guess fix (e.g. rebuilding dispatch when the cause is runner scoping) is the biggest risk.
2. **Phase 1 — Make the change easy.** Without altering dispatch behaviour: centralise queue access behind one seam, add cross-pipeline observability (per-pipeline wait-time metrics, dispatch-decision log), and build the regression harness. After Phase 1, any dispatch change is a small, measurable diff.
3. **Phase 2 — Make the change.** The minimal dispatch fix Phase 0 prescribes (expected: starvation bound + de-stickied follow-on + central queue ordering shared by both paths), plus the combined queue UI.
4. **Phase 3 — Assure it.** Verification matrix, docs, rollout/rollback.

## Steps

### Phase 0 — Reproduce and attribute (research-first, no behaviour change)

- **0.1 Two-pipeline repro harness.** Stand up two projects/pipelines with waiting agent tasks (reuse `api/isolatedTestRoots.js` temp-root pattern and existing scheduler/runner test doubles). Drive the embedded scheduler tick loop and assert pickup order/timing on the *non-focused* pipeline. No UI involved — if the repro needs a browser, the coupling is frontend-side, which itself is a finding.
  - Surfaces: `api/flow/scheduler/scheduleTick.js`, `findNextCandidateTask.js`, `api/flow/dispatch/scanClaimableTasks.js`.
- **0.2 Attribute the stall.** With the harness, test each suspect in isolation:
  1. Single-active blocking (long task on pipe A, waiting task on pipe B — measure pipe B wait).
  2. Rule 1 follow-on stickiness (repeated completions on pipe A — does pipe B ever win?).
  3. Runner scoping (`KAINBAIN_RUNNER_PROJECTS` set vs unset; `recordDispatchScope` audit).
  4. Frontend-triggered execution (does anything in `frontend/src` call `executeTaskStage` on view/focus? does any route kick the scheduler with a project filter?).
  5. Engine-state gating (`api/work/resolveEngineState.js` — global or per-project? does a wedged state on one pipeline gate others?).
- **0.3 Confirm survey q1 empirically.** Classify the symptom as stall / slowdown / starvation from measured waits, and record which suspect(s) reproduce it. Output: a short diagnosis note in this task folder (`DIAGNOSIS.md`) naming the cause and the prescribed fix. **Gate:** Phase 2 scope is frozen from this note; if the cause is configuration (runner scoping / caps), Phase 2 becomes "config + docs + guardrails", not a scheduler rewrite.
- **0.4 Confirm survey q2–q5 with the user.** One round of answers (or explicit acceptance of the defaults above) before Phase 2 build starts.

### Phase 1 — Make the change easy (no behaviour change)

- **1.1 One central-queue seam.** Introduce a single `getCentralQueue(store)` (name TBD at implementation; exact seam TBD) that both `getScheduledQueue` and `scanClaimableTasks` read through, returning identical cross-project ordering. Behaviour byte-identical; existing tests must pass unmodified. This collapses two orderings that "mirror" each other by convention today into one enforced source.
- **1.2 Dispatch-decision observability.** Log/emit, per tick and per runner-dispatch: candidate set size, chosen task + project, rule/reason that chose it, and per-pipeline oldest-wait age. Reuse `schedulerStats` (`freshSchedulerStats.js`) and the observability snapshot path (`api/watch/observabilityMetrics.js`). This is what makes Phase 2 reviewable and Phase 3 verifiable.
- **1.3 Per-pipeline wait metrics.** Add oldest-waiting-age and queue-depth per project/pipeline to the observability snapshot so "pipe B is starving" is a number, not a feeling. Read-only; feeds the Phase 2 UI counts.
- **1.4 Regression harness hardening.** Promote the Phase 0 repro into committed tests: multi-project fixtures asserting bounded wait for the non-focused pipeline on both dispatch paths. They pass on current code only where current behaviour is already correct (documented as characterisation), and encode the Phase 2 target where it is not (marked accordingly, not skipped).
- **1.5 Kill-switch / pause design (survey q4).** Design the global pause (scheduler stop + dispatch 409 vs soft drain) as a small RFC in the task folder; implementation in Phase 2 only if q4_answer ∈ {always-run, pause-switch} — either way the switch is cheap, so default to building it.

### Phase 2 — Make the change (minimal fix + combined view)

Scope is confirmed by Phase 0; expected shape:

- **2.1 Fair cross-pipeline ordering.** Most likely: enable-by-default starvation bound (configure `dispatchMaxWaitMs` default or an equivalent oldest-wait ceiling), soften Rule 1 follow-on so it cannot indefinitely pre-empt older cross-pipeline work (e.g. follow-on wins only within an age window), keep Rule 2/3 otherwise. Both dispatch paths inherit it via the Phase 1 seam. If Phase 0 instead finds single-active serialization is the binding constraint, this step also scopes a principled concurrency change (fleet cap defaults / embedded parallelism) — explicitly a bigger design, gated on Phase 0 evidence, not assumed here.
- **2.2 UI-focus decoupling proof.** Remove or guard any focus-coupled pickup found in 0.2-item-4; add a test asserting dispatch outcome is identical with no UI session, a focused session, and a differently-focused session.
- **2.3 Central queue UI.** One combined view (all waiting work in dispatch order, per-project/pipeline counts, worker activity) reusing `QueueOrderList` + `useScheduledQueue({ projectScope: 'all' })` and the Phase 1 metrics. Placement TBD at implementation (Now Playing popup promotion vs new board view) — reuse existing components, no new design system. Defer pause/reorder controls (survey q5d) to a follow-up unless q5 explicitly demands them.
- **2.4 Runner-scope transparency.** Surface each runner's effective `projectIds` scope (from `recordDispatchScope`) in the runners UI/monitor so "scoped runner ignoring my pipeline" reads as configuration, never as a stall. Cheap, high-value regardless of Phase 0 outcome.
- **2.5 Global pause switch** (per 1.5 RFC, default: build it).

### Phase 3 — Assure, document, roll out

- **3.1 Verification matrix** (see Validation Plan). All rows green before merge.
- **3.2 Docs.** Update/extend: the one canonical "how is the next task chosen?" doc (covering both dispatch paths, ordering rules, starvation bound, runner scoping, caps, pause); runner scoping runbook (`KAINBAIN_RUNNER_PROJECTS` + fleet/per-project caps); queue UI help text. Link from `docs/queue-scheduler-idle.md` or its successor — check that file first and extend rather than fork.
- **3.3 Rollout.** Feature-flag or config-default the ordering change if it risks surprising single-pipeline users (ordering changes are user-visible); announce in CHANGELOG.md. Rollback: revert to previous ordering defaults via config (no migration involved — queue state is derived, not stored).

## Validation Plan

Primary gate for every phase: `npm run test:unit` (plus `npm run lint` and the repo's `npm test` full gate before merge). Visual checks use `npm run capture:screenshot` or headless runners only — no long-lived background servers.

| # | Check | Evidence |
|---|-------|----------|
| V0 | Phase 0 repro demonstrates the symptom on current code | Committed repro test + `DIAGNOSIS.md` naming the cause with measured waits |
| V1 | Phase 1 changes alter no behaviour | Full existing suite green unmodified; new observability covered by new tests |
| V2 | Non-focused pipeline pickup bounded | Regression test: waiting task on pipe B dispatches within N ticks / M seconds while pipe A stays busy, on both embedded and runner-dispatch paths |
| V3 | No UI-focus coupling | Test: identical dispatch outcome with no session vs focused sessions (or the removed coupling covered by a test) |
| V4 | Ordering matches documented policy | Unit tests on the central seam: oldest-wait ceiling, follow-on window, tiebreak order; property-style multi-project fixture |
| V5 | Combined queue UI correct | Headless/component tests: all-projects list in dispatch order, counts, worker activity; screenshot capture of the view |
| V6 | Runner scope transparency | Test + UI check: scoped runner shows its scope; unscoped runner sees all |
| V7 | Pause switch (if built) | Test: paused ⇒ no new dispatch on either path, resume ⇒ pickup resumes; in-flight work drains safely |
| V8 | No single-pipeline regression | Existing scheduler/runner suites green; single-project ordering unchanged where Phase 2 did not intend change (characterisation tests from 1.4) |

Highest-risk validation: **V2** — it is the acceptance test for the whole task. If V2 cannot be made deterministic (timing flakes), fix the harness (injectable clocks/tick control, following existing `queueEmptyDebounceMs`-style overrides) rather than weakening the assertion.

## Risks and Open Questions

- **R1 — Cause misattribution.** Mitigated by Phase 0 gate: no fix built until the repro names the cause.
- **R2 — Single-active is load-bearing.** If the invariant (`singleActiveInvariant.test.js`) exists for safety (git workspace isolation, deploy serialisation — see `docs/git-runner-coordination-spike.md`), raising embedded concurrency is dangerous; prefer fairness + runner-fleet parallelism instead. Phase 0 must read those constraints before proposing concurrency.
- **R3 — Ordering change surprises.** Users may rely on follow-on/furthest-along behaviour. Mitigated by docs + CHANGELOG + config-default rollback (3.3).
- **R4 — Survey unanswered.** Proceeding on the defaults table above; q2–q5 confirmation is a Phase 2 entry gate (0.4).
- **Q1 (q1):** Stall, slowdown, or starvation in the user's setup? → Phase 0 measures.
- **Q2 (q3):** Confirm fairness policy (default: oldest-first + furthest-along tiebreak + starvation bound)?
- **Q3 (q4):** Confirm background-always + pause switch?
- **Q4:** Embedded scheduler, runner fleet, or both in the user's setup? (Phase 0 asks/observes; fix must cover the used path, ideally both via the shared seam.)
- **Q5:** Intended semantics of `runnerMaxConcurrentFleet: 0` ("single-Runner behaviour") — cap off, or one-at-a-time? Read the cap code path in Phase 0; the answer affects the concurrency story.

## Non-Goals

- Rebuilding the scheduler/execution engine or changing stage semantics.
- Per-project priority settings (survey q3 option 4) — revisit only if the user picks it in 0.4.
- Queue pause/reorder controls (survey q5d) — follow-up unless explicitly demanded.
- New design system or dashboard framework for the queue UI — reuse existing components.
