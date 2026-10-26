# 09 — Runner chaos, durability, and rotation (scratch only)

Setup: file 00 (scratch stack API `:3417`, mock harness, scheduler off,
throwaway roots) + one adopted local-only project and one mock-harness
Runner onboarded per the Runner README (dispatch mode,
`KAINBAIN_RUNNER_DISPATCH=1`, `PROJECTS=<scratch project>`). Theme: the
Phase 4 gate — **backend restart under load loses no completions,
re-queues in-flight as interrupted; rotation completes with zero stage
failures; N Runners never double-execute.** After **every** test, health
probe (`curl -s $BASE/status` → `ok`) and confirm the scratch board task
count only moves the way the test says.

Env knobs under test (set on the scratch backend, defaults shown):
`KAINBAIN_CLAIM_TTL_MS` (lease TTL), `KAINBAIN_RUNNER_MAX_CONCURRENT_PER_PROJECT=0`,
`KAINBAIN_RUNNER_MAX_CONCURRENT_FLEET=0`, `KAINBAIN_DISPATCH_MAX_WAIT_MS`.

## MT-CHAOS-01 — Kill a Runner mid-stage, work re-queues

- **Priority:** P0.
- Steps: create task T (`MT <RUN_ID> chaos`), dispatch it to Runner R
  (poll `POST /runners/dispatch` until assigned, or run the daemon);
  `kill -9` the daemon mid-stage (before `finished` progress).
- Expected: T stays lease-held until TTL, then re-queues as `interrupted`;
  a second dispatch claims it at a HIGHER epoch; the dead Runner's late
  `complete` (replay with the old `executionId`/`epoch` if you captured
  them) → `409 STALE_EPOCH`, never applied. `GET /runners/monitor`
  `liveAssignments` no longer lists R on T.
- Cleanup: complete or delete T; health probe.

## MT-CHAOS-02 — Partition and return (stale Runner)

- **Priority:** P0.
- Steps: claim T on Runner R; stop R's heartbeats (SIGSTOP the daemon,
  or revoke nothing — just silence); wait past
  `KAINBAIN_RUNNER_STALE_AFTER_MS`; `POST /runners/dispatch` from a
  second Runner R2.
- Expected: dispatch serves R2 (R is stale); R's heartbeat on return
  still succeeds (stale is not revoked); if R's lease lapsed, R's next
  `progress`/`complete` → `409 STALE_EPOCH`. No double execution:
  exactly one `executionId` per epoch in the task reports.
- Cleanup: resume/kill R; finish T; health probe.

## MT-CHAOS-03 — Five Runners, one host, one queue

- **Priority:** P1.
- Steps: create 5+ claimable tasks; boot 5 dispatch daemons (distinct
  `KAINBAIN_RUNNER_ID`, same backend, idle limit high); let them drain.
- Expected: every task completes exactly once (reports show one
  completion each); `NO_CLAIMABLE_TASKS` idles the surplus daemons;
  `GET /runners/monitor` during the run shows ≤5 live assignments and
  no task twice. Set `KAINBAIN_RUNNER_MAX_CONCURRENT_PER_PROJECT=2`
  and re-run: dispatch skips with `PROJECT_BUSY`, still exactly-once.
- Cleanup: all daemons exited or killed; tasks complete; health probe.

## MT-CHAOS-04 — Version-skew dispatch

- **Priority:** P1.
- Steps: register a Runner with `versions.protocol` outside the N-1
  window (e.g. `v0`); heartbeat; poll dispatch.
- Expected: heartbeat/register → `409 PROTOCOL_VERSION_UNSUPPORTED`;
  dispatch → `409 STALE_RUNNER` or no assignment (never silent
  best-effort dispatch). Record the exact code observed.
- Cleanup: revoke the skewed Runner; health probe.

## MT-CHAOS-05 — Rotation rehearsal, zero stage failures

- **Priority:** P0.
- Steps: with Runner R idle, `POST /runners/<id>/rotate`; note the new
  credential; heartbeat with the OLD credential; heartbeat with the NEW
  one; run one full assignment on the new credential.
- Expected: old credential → `401 INVALID_CREDENTIAL` everywhere
  immediately; new credential works first try (no re-approval);
  the assignment passes (exit 0, task advanced); `GET /runners`
  shows a fresh `credentialIssuedAt` for R.
- Cleanup: health probe; record credential ages observed.

## MT-CHAOS-06 — Backend restart under load

- **Priority:** P0 (Phase 4 gate).
- Steps: with 2+ tasks in-flight on Runners (holds live) and 1 task
  already completed this boot, restart ONLY the scratch backend
  (leave daemons running); immediately: `GET /runners/monitor`,
  re-dispatch, and replay the pre-restart completion for the finished
  task.
- Expected: completed execution stays completed (replayed `complete` →
  idempotent `{ accepted: true, duplicate: true }`, never re-applied);
  in-flight tasks re-queue as `interrupted` (holds are memory-only by
  design) and re-dispatch at HIGHER epochs; Runners re-heartbeat from
  stale (no re-approval — `GET /runners` still lists them `active`
  after the first beat); zero completions lost, zero double-applied.
- Cleanup: finish interrupted tasks; health probe; confirm
  `~/.kainbain/engine/` (or the scratch state dir) holds `claims.json`,
  `runners.json`, `steers.json` with mode `0600`.

## State locations, backup, and the accepted SPOF

- Backend-owned durable state (all JSON, atomic tmp+rename writes):
  `~/.kainbain/engine/claims.json` (lease epochs + completed
  execution IDs), `runners.json` (registrations + credentials, 0600),
  `steers.json` (pending steers + receipts), `circuit.json`
  (containment). Task/project state lives under the projects root
  (see file 00 for the scratch layout).
- Off-host backup is an operator copy: snapshot the projects root plus
  the four engine JSON files. Nothing in the backend replicates them;
  the backend is an accepted single point of failure (R03 residual) —
  the state files above are the whole replica seed, and a fresh backend
  pointed at a restored copy resumes with approvals, epochs, and
  completions intact (holds deliberately re-queue as interrupted).
