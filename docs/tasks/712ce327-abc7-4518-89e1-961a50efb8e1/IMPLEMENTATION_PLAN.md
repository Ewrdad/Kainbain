# Implementation Plan — Retrospective chat on Runners (impromptu T0 channel)

- Task: `712ce327-abc7-4518-89e1-961a50efb8e1`
- Goal: make retrospective chats work again under the runner-only architecture.
  `POST /retrospective/chat` must stop creating a local ephemeral harness session
  (the pre-runner path) and instead dispatch the turn to a Runner as an
  **impromptu, read-only (T0) job** on a queue separate from the main task
  queue. That lets users quiz tasks: ask about past tasks, their files/reports,
  and cross-task trends, with the Runner doing fresh read-only lookups on their
  behalf.
- Principle applied throughout: **make the change easy, then make the change.**
  Phases 1–2 build the seams and the new channel before any behaviour flips;
  the route rework (Phase 4) is then a small, testable swap behind an injected
  dependency.

## Survey decisions (SURVEY.md Round 1 — binding constraints)

- Q1: the chat answers questions about past tasks, about the selected tasks'
  files/reports, and across many tasks (trends/patterns). Notes: read-only
  queries generally.
- Q2: when fresh information is needed, the quick job runs **automatically** and
  the answer is shown; it must run on a queue **separate from the main task
  queue**.
- Q3: **look only** — never change files or tasks. File searches etc. are fine;
  running tests is not.
- Q4: use **any available runner** (fastest option); an **advanced override**
  (pin a specific runner) must be possible.
- Q5: today the chat **errors / fails to reply** — matches the diagnosis below.

## Current state (verified in repo)

- `api/routes/retrospective.js` — `POST /retrospective/chat` resolves a harness
  via the registry and calls `harness.createSession(project, RETROSPECTIVE_SESSION_META)`
  **on the backend**, then `runChatTurn()` (`api/routes/retrospectiveChat.js`)
  prompts that local session. That is the pre-runner architecture: agent work is
  runner-only now (`runner/README.md`: "the ONLY way agent stages run"), so the
  backend has no working local session path → the chat errors/fails to reply
  (survey Q5). Prompt assembly itself is already pure and reusable:
  `contextMetaForTasks`, `buildChatPrompt`, `parseTicketSuggestions`,
  skill injection via `buildSkillsPromptSections` + `retrospective-task-lookup`.
- Response contract (keep stable so the frontend barely changes):
  `{ reply, suggestions, harness, model, modelRequested, unknownTaskIds,
  contextTaskIds, contextTruncated, contextChars, output? }`, plus live
  `CHAT_PROGRESS { turnId, tail }` WebSocket frames via `eventBridge.broadcast`
  when the client sends `turnId`. Errors: 400 `chat_input_too_large`,
  404 `task_not_found`, 501 `unsupported_by_harness`, 502 `chat_prompt_failed`,
  504 `chat_prompt_timeout` (opt-in ceiling `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS`).
- Runner fleet machinery to reuse:
  - `api/flow/runnerRegistry.js` — runner records, freshness (`isFresh`),
    operator config incl. the already-existing `jobTypes.runsImpromptu` toggle
    (today only a "recorded preference" — nothing enforces it because no
    impromptu channel exists; see `api/flow/dispatch/operatorConfigVerdict.js`
    note and GAPS G9).
  - `api/flow/dispatch/runnerMatches.js` — capability matching (active, fresh,
    protocol v1, harness, model, `tier`, disk, operator config, policy).
  - `api/flow/claimStore.js` — `liveHolds()` tells which runners are busy with
    real task leases.
  - `api/flow/runnerRoutes.js` — runner-facing authenticated routes
    (`x-runner-credential`): register/heartbeat/dispatch/claim/progress/logs/
    complete/steer-ack, plus the heartbeat pull channel
    (`pendingSteers`, `pendingCommands`).
  - `runner/client.js` — thin fetch wrapper for the runner-facing API.
  - `runner/daemon.js` — dispatch loop: `joinAndHeartbeat` then per-iteration
    `client.dispatchClaim(...)`; idle polls with `dispatchPollMs`; runs
    assignments via `executeAssignment` → `runHarnessStage`
    (`runner/harness.js`), which creates a harness session with
    `harness.createSession(project, { taskId, stageId, sessionDir, model })`.
- Design intent already on record: MigrationPlan Phase 3 — "Queue tasks **plus**
  impromptu, almost-always-read-only requests (C2: retrospectives-style
  comments), tier `T0` only … separately authorised and logged";
  `docs/MuseCodeHackathon2026/Portability/GAPS.md` G9 — "add a T0-only impromptu
  endpoint; write-capable impromptu stays out of scope"; ADR 0009 explicitly
  deferred "impromptu read-only requests" past Phase 2. This task is that
  endpoint, scoped to the retrospective chat.
- Frontend: `frontend/src/services/retrospective/index.js` posts
  `/retrospective/chat` with no client timeout; `useRetrospectiveChat.js` renders
  `CHAT_PROGRESS` frames matched by `turnId` and maps errors via `readChatError`.
- Skill: `skills/retrospective-task-lookup/SKILL.md` already teaches the
  lookup ladder (injected context block → task files under
  `docs/tasks/<id>/` → `GET /tasks…` API) with a citation contract.
- Tests: `api/routes/retrospective.test.js` + `retrospectiveChat.test.js` build a
  scoped Fastify with injectable `deps` (mock harness registered in the registry
  today); runner suite is pinned file-by-file in `scripts/run-tests.mjs`
  (guarded by `tests/run-tests.test.mjs`).

## Target design

```
browser ──POST /retrospective/chat──▶ backend route (validates, builds prompt as today)
                                          │ enqueue impromptu job {jobId, projectId, kind:'retrospective-chat',
                                          │   prompt, harness, model, turnId, runnerId?}  ── separate queue
                                          ▼ await job completion (opt-in ceiling only)
runner daemon (idle) ──POST /runners/impromptu/poll──▶ pick oldest matching queued job
      │◀── { assigned:true, job } ──┐                       (runnerMatches + tier T0 + runsImpromptu
      │                              │                        + optional runnerId pin)
      │ run job read-only via harness session (NO worktree, NO git, read-only posture)
      ├──POST /runners/impromptu/:jobId/progress {seq, delta}──▶ backend → WS CHAT_PROGRESS {turnId, tail}
      └──POST /runners/impromptu/:jobId/complete {outcome, output}──▶ resolve waiting HTTP 200
```

- The impromptu queue is **not** the task queue: no task record, no stage, no
  verdict, no git branch/worktree, no commit/push. Jobs are in-memory with a cap
  and TTL (backend restart fails waiting turns with 502 — same durability story
  as `SteerStore` in Phase 3; Phase 4 durability is out of scope).
- Runner selection (survey Q4): any active, fresh, non-paused runner whose
  capabilities match `{ harness, model, tier: "T0" }`, whose operator
  `jobTypes.runsImpromptu` is not false, and within project scope — first
  (deterministic, like `selectRunnerForTask`). Request body may carry `runnerId`
  as the advanced override; the job is then delivered only to that runner.
- Read-only (survey Q3): (a) prompt-level — the compiled prompt states the turn
  is read-only, may read files/query the API, must not run tests or modify
  anything; (b) transport-level — the daemon runs impromptu jobs without claim/
  worktree/git; (c) harness-level where supported — pass a `readOnly` session
  meta/flag so sandboxing harnesses (pi etc.) enforce it in the harness.
- Streaming: runner progress frames are fanned out as the existing
  `CHAT_PROGRESS { turnId, tail }` WS frames (throttled exactly like today), so
  the UI's working card keeps working unchanged. HTTP settle stays the done
  signal.
- Errors: `503 { code: "no_runner_available" }` when no capable runner exists
  at all; `503 { code: "runner_unavailable" }` when only a pinned override runner
  is missing/stale; `502 { code: "chat_prompt_failed" }` when the runner reports
  failure; `504 { code: "chat_prompt_timeout" }` only under the opt-in ceiling;
  400/404 validation unchanged. The old `501 unsupported_by_harness` path dies
  with the local-session code (a harness that cannot chat simply has no capable
  runner → 503 with the miss reason).

## Phases

### Phase 1 — Design + ADR (research piece, first)

1. Write `docs/adr/0014-impromptu-t0-channel.md`: message set
   (`POST /runners/impromptu/poll`, `POST /runners/impromptu/:jobId/progress`,
   `POST /runners/impromptu/:jobId/complete`), job model, fencing (jobId +
   runnerId + claim TTL; stale claims requeue), error vocabulary, T0-only
   read-only guarantee, relation to ADR 0009 (deferred item now landed) and
   ADR 0011 (steers stay for live executions; impromptu is for idle runners).
2. Confirm read-only enforcement surface per harness: grep
   `api/agent/harnesses/*/…createSession` + `runner/harness.js` for existing
   sandbox/permission options; decide the `readOnly` meta flag semantics
   (harnesses without a mode rely on prompt-level + no-git transport).
3. Decide config knobs (added to `api/config/schema.js` + `.env.example`):
   `KAINBAIN_IMPROMPTU_ENABLED` (default on), `KAINBAIN_IMPROMPTU_QUEUE_MAX`
   (default 50), `KAINBAIN_IMPROMPTU_JOB_TTL_MS` (default 10 min),
   `KAINBAIN_IMPROMPTU_CLAIM_TTL_MS` (default 5 min, stale claim requeues),
   runner side `KAINBAIN_RUNNER_IMPROMPTU=0` opt-out in `runner/config.js`.

### Phase 2 — Backend: impromptu store + runner-facing routes (make the change easy)

4. New module `api/flow/impromptuStore.js` (pure, unit-testable, mirrors
   `steerStore.js` style): `enqueue(job) → jobId`, `pollForRunner(runnerRecord,
   matchFn) → job|null` (oldest queued job the runner matches, claim-fenced with
   TTL, optional `pinnedRunnerId`), `progress(jobId, runnerId, seq, delta)`,
   `complete(jobId, runnerId, { outcome, output, error })`, `expireStale(now)`
   (requeue stale claims, fail expired waiters), `get(jobId)`. In-memory +
   waiter promises; no persistence (Phase 4). Export a small
   `createImpromptuDispatcher({ runnerRegistry, claimStore, eventBridge })`
   facade with `dispatch(job) → Promise<{ reply, output, harness, model }>` so
   the chat route depends on one injectable seam.
5. New route module `api/flow/impromptuRoutes.js` registered in
   `api/flow/runnerRoutes.js` (or alongside it in `api/index.js` deps):
   - `POST /runners/impromptu/poll` — authed runner (`authedRunner`), freshness
     + paused + below-minimum gates copied from `/runners/dispatch`; match via
     `runnerMatches(record, { harness, model, tier: "T0", projectId })` plus
     `operatorConfig.jobTypes.runsImpromptu !== false` and
     `claimStore.liveHolds()` awareness (a runner holding a live task lease does
     not get impromptu work — it only polls when idle anyway, but enforce
     server-side); return `{ assigned: false, code: "NO_IMPROMPTU_WORK" }` or
     `{ assigned: true, job: { jobId, projectId, kind, prompt, harness, model,
     timeoutMs, turnId } }`. Respect `KAINBAIN_IMPROMPTU_ENABLED=0` → 404/409.
   - `POST /runners/impromptu/:jobId/progress` — validate claim
     (jobId+runnerId+fresh claim), append delta, forward to
     `eventBridge.broadcast(projectId, "CHAT_PROGRESS", { turnId, tail })`
     throttled like the route does today (`CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS`).
   - `POST /runners/impromptu/:jobId/complete` — validate claim, settle the
     waiter (`outcome: "completed"` → resolve `{ output }`; `"failed"` → reject
     with `code: "chat_prompt_failed"`), mark done. Idempotent (retried
     complete is a no-op).
6. Unit tests `api/flow/impromptuStore.test.js` + `impromptuRoutes.test.js`:
   enqueue/poll/claim-fencing/requeue-on-TTL/expiry, poll matching matrix
   (T0 tier, runsImpromptu false, pinned runnerId, busy runner, stale runner,
   disabled flag), progress → CHAT_PROGRESS forwarding, complete idempotency,
   auth rejections (401/403 wrong credential like other runner routes).

### Phase 3 — Runner side: client + daemon impromptu loop (make the change easy)

7. `runner/client.js`: add `impromptuPoll()`, `impromptuProgress({ jobId, seq,
   delta })`, `impromptuComplete({ jobId, outcome, output, error })` following
   the existing `call()` shape.
8. New `runner/impromptu.js`: `runImpromptuJob({ config, client, logger,
   harnesses, job })` — loads the project context (no worktree: reuse
   `effectiveDirectoriesFor(config)` master dir / adopted repo path, read-only),
   picks the harness the job requires (`harnesses[job.harness]` with the same
   fallback warning pattern as dispatch), creates a session via
   `harness.createSession(project, { taskId: "impromptu", stageId: job.jobId,
   sessionDir, model: job.model, readOnly: true })`, prompts with `job.prompt`,
   streams deltas via `client.impromptuProgress`, and completes with the final
   assistant text (`session.getLastAssistantText()`). Never claims, never
   branches, never commits — any git/write tool effect is blocked by the
   read-only posture, not by cleanup.
9. `runner/daemon.js` dispatch loop: when the loop is idle (no assignment this
   iteration — after a `NO_CLAIMABLE_TASKS` dispatch answer, before consuming
   idle budget), also `client.impromptuPoll()`; on assignment run
   `runImpromptuJob` inline (the loop is single-threaded per runner, so a
   runner serves at most one impromptu job at a time). `KAINBAIN_RUNNER_IMPROMPTU=0`
   skips the poll. Keep task dispatch priority: impromptu never preempts a
   claimable task (separate queue, survey Q2).
10. `runner/impromptu.test.js` + extend `runner/daemon.test.js` / `client.test.js`:
    mock client + mock harness; assert poll/execute/progress/complete ordering,
    failure → `outcome: "failed"`, no-git (assert no claim/worktree calls),
    opt-out flag, readOnly meta passed to createSession. **Add the new test file
    to the pinned list in `scripts/run-tests.mjs` and
    `tests/run-tests.test.mjs`.**

### Phase 4 — Rework the chat route (make the change)

11. In `api/routes/retrospective.js`, replace the session-creation block
    (`resolveHarness` + `harness.createSession(RETROSPECTIVE_SESSION_META)` +
    `guardSessionCapability` + `switchModel` + `runChatTurn`) with: keep all
    validation, alias/target resolution (`resolveStageTarget`), skill injection,
    `contextMetaForTasks`, `buildChatPrompt` **unchanged**; then call
    `deps.impromptuDispatcher.dispatch({ projectId, prompt: promptText,
    harness: chatTarget.harnessName, model, turnId, runnerId: body.runnerId,
    timeoutMs: promptTimeoutMs })` and map the result onto the existing response
    shape (`reply` = output, `suggestions` = `parseTicketSuggestions(output)`,
    `harness`, `model`, `modelRequested`, context fields). Wire the dispatcher's
    progress events into the existing `CHAT_PROGRESS` broadcast (the store already
    forwards runner progress; the route just keeps its throttled broadcast for
    symmetry or the store owns it — pick one owner, store recommended).
12. Accept optional `runnerId` in `chatBodySchema` (advanced override, survey Q4);
    when present, the job is pinned and a missing/stale pinned runner fails fast
    `503 { code: "runner_unavailable" }`.
13. `api/index.js`: construct the real `impromptuDispatcher` (from Phase 2) and add
    it to `deps` for `retrospectiveRoutes`; remove now-unused harness deps from
    this route only if nothing else in the file uses them (`runChatTurn`/
    `resolveChatReplyText`/`RETROSPECTIVE_SESSION_META` stay exported for tests
    or are removed with their tests updated — decide in code; prefer deleting
    dead code per repo standards).
14. Update `api/routes/retrospective.test.js` + `retrospectiveChat.test.js`: inject
    a fake `impromptuDispatcher` in `deps` (resolved/rejected/progress cases);
    assert the response contract is byte-shape-identical, 503/502/504 mappings,
    runnerId pin pass-through, prompt contents (context block + skill + transcript
    still folded the same way). Keep the pure-function tests
    (`buildChatPrompt`, `contextMetaForTasks`, `parseTicketSuggestions`) as-is.

### Phase 5 — Prompt + skill updates (quiz tasks, read-only rules)

15. `buildChatPrompt`: add an impromptu framing line — the turn runs as a T0
    read-only job on a Runner: "You may read files under the project and query
    the KainBain API. Do not run tests or build commands, and never modify,
    create, or delete files. Answer from evidence and cite task ids."
16. `skills/retrospective-task-lookup/SKILL.md`: add a section "Running as an
    impromptu runner job" — the session has read-only tools on the Runner host,
    `{{projectCwd}}` is the project checkout on that host, `{{kbApiBase}}` reaches
    the backend; the lookup ladder (context block → `docs/tasks/<id>/` files →
    API) applies unchanged; add the explicit no-tests/no-writes rule and the
    "separate from the task queue — you are not a stage, there is no verdict"
    note so the model never emits verdict blocks.

### Phase 6 — Frontend (small)

17. `frontend/src/services/retrospective/index.js`: pass through optional
    `runnerId` (advanced override) in the body.
18. `useRetrospectiveChat.js` `readChatError`: map `503 no_runner_available` /
    `runner_unavailable` to a clear "no runner available — check Settings ›
    Runners" notice (new `kind: 'no_runner'`), keep all existing mappings.
19. Optional UI: a runner picker in the chat header (advanced) — only if cheap;
    otherwise the API override suffices for this stage.
20. Frontend tests: `readChatError` new cases; service pass-through test in
    `frontend/src/services/retrospective/index.test.js`.

### Phase 7 — Tests (verification gate, see below)

21. Backend unit/integration: Phase 2 + Phase 4 test files above;
    an end-to-end route test with a **fake runner**: register a fake runner in
    `runnerRegistry`, start a poll loop against a scoped Fastify (or call
    `impromptuRoutes` handlers directly), `POST /retrospective/chat`, runner
    polls → gets job → posts progress + complete → assert the HTTP 200 body and
    the CHAT_PROGRESS frames. No-runner case → 503. Pinned-runner case.
22. Runner suite: `node --test` on the pinned list incl. new
    `runner/impromptu.test.js` (added to `scripts/run-tests.mjs`).
23. Run the gates: `npm run test:unit` (api + frontend), `npm run lint`,
    `npm run build`, `npm run docs:check`, `npm run check:one-function`,
    `npm run check:jsdoc-example`.

### Phase 8 — Documentation

24. `runner/README.md`: new "Impromptu read-only jobs (ADR 0014)" section —
    poll/progress/complete contract, T0 read-only guarantee, `runsImpromptu`
    operator toggle now enforced, `KAINBAIN_RUNNER_IMPROMPTU=0`.
25. `docs/adr/0014-impromptu-t0-channel.md` (from Phase 1) + mark GAPS.md G9
    RESOLVED with a pointer.
26. `site-docs/api-reference.md`: update the `/retrospective/chat` row (runner-
    dispatched, new 503 codes, `runnerId` field) and add the three
    `/runners/impromptu/*` rows; `site-docs/retrospective-review.md`: document
    "quiz tasks" — the chat runs on a runner, read-only, off the main queue.
27. `api/agentGuide.js`: update the retrospective + runner route entries.
28. `api/config/schema.js` docs + `.env.example` for the new `KAINBAIN_IMPROMPTU_*`
    / `KAINBAIN_RUNNER_IMPROMPTU` keys.

### Phase 9 — Manual / visual verification

29. With a local mock runner (`KAINBAIN_RUNNER_HARNESS=mock … node runner/main.js`
    per `runner/README.md`): open `#/retrospective`, select 2 tasks, ask "why did
    task X fail?" and "which stage is slowest across these?"; assert a real reply,
    live progress on the working card, citations, and that no task was created and
    no files changed on the runner host (git status clean).
30. No-runner drill: stop all runners → chat turn returns the new 503 notice in
    the UI within seconds. Re-enable → works again.
31. If any UI changed: `npm run capture:screenshot` on `#/retrospective` (headless,
    no long-lived server) before/after.

## Testing & verification plan (how we know it landed)

- **Automated gates (primary):** `npm run test:unit` must pass with the new
  suites green and the reworked retrospective route tests updated (not weakened
  — same response contract asserted, new 503 paths added). Runner daemon suite
  via the pinned `node --test` list in `scripts/run-tests.mjs` (the
  `tests/run-tests.test.mjs` guard fails loudly if a new runner test file is
  not pinned). `npm run lint`, `npm run build`, `npm run docs:check` (link
  integrity for edited site-docs), `npm run check:one-function`,
  `npm run check:jsdoc-example` for new MARK'd modules.
- **Contract tests:** the fake-runner end-to-end (Phase 7.21) pins the wire
  protocol: poll → progress → complete → resolved chat response; claim fencing
  (two runners polling, one job, exactly one assignment); stale-claim requeue.
- **Read-only proof:** unit assertion that impromptu execution performs no
  claim/worktree/commit calls, passes `readOnly` to the harness session, and the
  compiled prompt contains the no-tests/no-writes instruction; manual drill 29
  confirms `git status` clean on the runner host afterwards.
- **Manual drills:** 29–31 above, recorded in the task folder as a short
  verification note.
- **Non-goals pinned by tests:** impromptu jobs never appear in `GET /tasks`,
  never create reports/verdicts, never touch the main queue ordering.

## Risks & mitigations

- Waiting HTTP turns held open: client already uses `NO_REQUEST_TIMEOUT`; the
  opt-in `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS` ceiling (504) and job TTL (502 on
  expiry) bound the wait; reverse-proxy idle limits are documented in
  api-reference already.
- Runner dies mid-job: claim TTL requeues the job; the waiter is failed with
  502 after `KAINBAIN_IMPROMPTU_JOB_TTL_MS` — never hangs forever.
- Fleet with zero runners: fail fast 503 `no_runner_available` (loud, per ADR
  0009 error-vocabulary precedent) instead of today's silent local-session
  failure.
- Read-only is prompt- + transport-enforced; a YOLO harness could still write on
  a compromised prompt — mitigated by harness-level `readOnly` where supported
  and by the no-worktree/no-git transport. Write-capable impromptu stays out of
  scope (MigrationPlan).
- Rollout: old runners that don't poll impromptu simply never receive jobs
  (backend queue waits then 503/502) — no mixed-fleet hazard; new backend +
  old runner degrades to the new 503 notice, which is the correct loud signal.

## Open questions

- O1: should impromptu jobs be visible anywhere in the UI (e.g. Runners monitor
  "impromptu served" counter)? Recommend a monitor counter only, no task-like
  rows. Default: counter in `GET /runners/monitor`.
- O2: default `harness`/`model` for a chat turn when the client sends none —
  project default via existing `resolveStageTarget` (current behaviour; keep).
