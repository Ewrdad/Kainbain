# Feedback-loop retrospective — db49d6c6 (recovery `--no-verify` + dispatch containment)

Date: 2026-11-22. Case study: task `db49d6c6-bdd5-4600-aaea-15a71042ae20`
("Fix runner recovery commits failing on pre-commit hooks and crash-looping",
merged to main as `64e428e6`).

## Ticket history reviewed

- `IMPLEMENTATION_PLAN.md` + `SURVEY.md`: plan was written against unanswered
  survey questions (adopted recommendations as assumptions); answers arrived
  later and q1's answer ("skip checks for all automatic runner saves")
  conflicted with the task goal's recovery-only scope. The review stage
  adjudicated correctly (task goal authoritative) and pinned task-branch
  hook behavior with a scope test — no rework resulted, but the conflict
  cost review attention.
- `review-20261121-stage.md`: PASS with full red→green proof (449/449 runner
  tests). Two residual risks were explicitly accepted: (1) persistently
  failing tasks flap forever (interrupt/re-queue/reclaim, zero backoff);
  (2) bypassed snapshots park corrupt binaries by design.
- Git history: sibling task `1cae113f` ("Surface runner git/commit and
  pre-commit hook failures clearly in the UI", merged as `7ac148ce`) worked
  the same incident from the reporting side and needed an explicit
  reconciliation merge (`d6fa0c44`, `bb996858`) plus an ADR
  (`docs/adr/0017-commit-hook-failure-surfacing.md`) to align its original
  no-bypass stance with this ticket's scoped bypass. Its q6 survey
  originally forbade all bypass — near-miss of two concurrent tickets
  shipping contradictory designs for one incident.
- Verified on `main`: the dispatch-loop `catch` path has no backoff at all
  (only `gitFailureReported` gets one poll-cycle pause); backend 3-strikes
  parking covers only `gitFailureStreak`; the hook-bypass scope test
  (`runner/project.test.js` "allows --no-verify only inside
  commitRecoverySnapshot") pins bypass placement but not the reverse (new
  inline recovery commits would pass); no boot-id/restart-count
  crash-loop detection exists anywhere (only prose mentions).

## Agent difficulties / structural fails found

1. Containment without backoff trades a restart storm for a reclaim flap:
   a poisoned task can now pin runner capacity forever with no parking.
   Flagged as out-of-scope in the plan, accepted in review — needs its own
   ticket (created below).
2. One-directional scope test: the bypass is centralized but a future agent
   adding a third inline recovery commit gets no test failure. Cheap to
   pin (created below).
3. 10,776 silent systemd restarts: no runner restart observability
   anywhere in the stack, so the next daemon-death bug will hide the same
   way (created below).
4. Process note (no ticket — needs human judgment, not code): two
   concurrent tickets nearly shipped contradictory designs for one
   incident, and survey answers arrived after planning with one answer
   contradicting the task goal. Worth a human look at incident-linked
   ticket grouping, but not a well-specified agent ticket.

## Dedupe performed

- API base `http://localhost:3100` was unreachable (nothing listening; only
  the runner daemon runs on this host). Resolved the live backend from the
  runner env (`KAINBAIN_RUNNER_BACKEND=http://192.168.1.206:3100`) and used
  it for all skill operations.
- Resolved: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain),
  workflow `wf-default` (Feature Pipeline), stage `1` (Idea). Current
  executing stage is `stage-1794594754686` (retrospective) — no recursion.
- Listed all 66 tasks in `wf-default`; 13 open. None covers backoff/
  parking for generic setup failures, recovery-helper enforcement, or
  restart detection. Cross-checked git history (`--grep` for
  recover/hook/backoff/circuit/flap/crash-loop/restart) and the stale
  local task mirrors — no duplicates.

## Tickets created (3, all `execute:false`, verified in stage `1`)

1. `e3d4e9db-031c-43a9-a8e7-1e44cb1839b2` — "Back off and park assignments
   that repeatedly fail setup after containment" (generalizes the
   git-only backoff/parking to the contained-catch path).
2. `20143759-ab55-4576-be22-3e3dc44f2296` — "Pin all kb-recovery snapshot
   commits to the commitRecoverySnapshot helper" (reverse scope test +
   README rule).
3. `fd5a74bf-7f95-413c-99d6-f8a12efb489b` — "Detect and surface runner
   rapid-restart (crash-loop) storms" (boot-id heartbeats, threshold,
   degraded flag + UI banner + runbook).

Each ticket body stands alone and cites this task id as its case study.
Idempotency keys were derived as
`sha256(finding + "1" + currentTaskId)[:32]`; re-verified each ticket via
`GET /tasks/<id>?projectId=...` (all `currentStageId: 1`,
`workflowId: wf-default`, `status: waiting_human` as expected for the
human Idea stage).
