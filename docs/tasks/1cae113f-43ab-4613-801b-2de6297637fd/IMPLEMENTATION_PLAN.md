# Implementation Plan — Surface runner commit/hook failures in the task UI

## Phase-0 record (added during implementation)

**Survey reconciliation.** SURVEY.md `answers` were empty when this plan was
written but are now recorded: q1 new status, q2 "3 retries then park", q3 all
git problems, q4 detail page + timeline/logs, q5 full detail, q6 auto-retry
with `--no-verify`, q7 agent-first with human fallback. The approved plan
below stands, reconciled as follows: q2 honored exactly (3 strikes then
park); q4/q5 honored (plus a card label as a cheap third surface); q1 honored
in intent via streak-based parking with no new status; q3/q7 partially (the
envelope reserves push/auth kinds; `gitDiagnostics` already rides the Tier-3
failback prompt to agents). **q6 is explicitly NOT honored**: automatically
bypassing the guard that caught real corruption would destroy the safety
property the hook exists for — `--no-verify` stays a documented manual escape
hatch only (Decision 5, Non-goals, and the runner grep-guard test enforce
this).

**Lease-state finding (Decision 6).** `complete-execution` accepts reports
before `progress: started`: `executionLedger.completeExecution` and
`claimStore.complete` fence only on the claim hold (executionId/epoch), and
the runner holds the lease from claim time (before `prepareWorkdir`). No
interrupt+`gitFailure` fallback is needed — Step 18 is skipped deliberately,
and worktree-setup failures report via `complete({ outcome: "failed",
gitFailure })` like every other phase.

## Goal

When a runner's `git commit` (or any git step around it) fails — in
particular when a repo hook such as the pre-commit binary guard rejects the
commit — the failure must be captured as structured data on the runner,
reported to the backend, and rendered clearly in the task detail UI,
instead of dying in the runner's systemd journal while the task shows a
stale error and the runner crash-loops.

Incident reference: task `7f6220c3-c536-489c-b952-9858aae9ef21`, runner
`local-alpha`: the binary-guard hook rejected 3 corrupt PNGs during a
recovery commit, the runner exited 1 and restarted 10,776 times, and the
task UI showed only status `interrupted` with the previous human rejection
(`Cant see settings in the Ui`).

## Success Criteria

1. A hook-rejected commit on the runner produces a structured
   `GitFailureDetails` record: failing git command, exit code, hook name,
   hook stderr/stdout, affected file paths, failure phase
   (worktree-setup / recovery / stage-commit / merge), and a remediation hint.
2. The backend records the new failure in `lastError` (replacing the stale
   one), timeline, history, log entries, and a `-failure-` stage report —
   for failures in worktree setup, stage execution end (`commitAndPush`),
   and the merge/integration path alike.
3. The task detail UI shows a dedicated commit/hook-failure callout near
   the top (why the commit failed, which hook/files, how to fix, full
   output expandable), in both the full page and the overlay details tab.
4. A deterministic commit/hook failure no longer crash-loops the runner:
   the runner reports and stays alive (or parks the task), with zero
   systemd restarts attributable to the failure.
5. `npm run test:unit` (api + frontend suites) passes, plus new
   regression tests that replay the incident end to end at each layer.

## Context and grounded facts

All paths below were read in this checkout (branch
`kb/1cae113f-43ab-4613-801b-2de6297637fd` @ `8460e4a8`).

### Runner: where commits happen and how they fail today

- `runner/project.js` — `runGit()` / `toRunnerGitError()` classify every
  git failure into `git-timeout` / `git-lock` / `git-failed`
  (`RunnerGitError` carries `code`, `args`, `stdout`, `stderr`, `cwd`).
  A hook rejection today is an undifferentiated `git-failed`.
- `runner/project.js` `ensureRepoHooksPath()` sets
  `core.hooksPath=scripts/githooks`, activating the binary guard in every
  runner worktree — the runner arms the hook that can then reject its own
  commits.
- Commit sites:
  - `refreshWorktreeToRemote()` (`runner/project.js` ~746-795): the
    reused-worktree **recovery commit** (`commit -m "recovery: unpushed
    work from reused worktree …"`). Throws unguarded. This is the
    incident's crash path: dirty worktree + corrupt PNGs → hook rejects
    → `prepareWorkdir` throws → daemon rethrows → exit 1 → systemd
    restarts → same task re-claimed → same rejection, forever.
  - `commitAndPush()` (`runner/gitOps.js` ~94-193): the stage-end
    commit/merge/push. Called unguarded at `runner/daemon.js:2171`; a
    throw lands in the generic catch (`daemon.js:2243`), which calls
    `client.interrupt()` with **no reason** and rethrows → same crash loop.
  - `preserveEvictedWorkdir()` (`runner/project.js` ~434-475): the
    eviction/reap recovery commit. Its throw is swallowed by
    `evictOldestWorkdir` (tries the next candidate) and by the reap
    helpers — degrades to `WORKTREE_CAP_REACHED`, no crash, but the hook
    detail is lost.
- Daemon catch (`runner/daemon.js:2243-2333`) already contains the pattern
  to copy: the `WORKTREE_CAP_REACHED` branch (2246-2261) interrupts
  **with** a reason and **returns** instead of throwing (added after the
  e79b1d25 restart storm). Hook failures need the same treatment.
- Crash-loop mechanics: units generated by `startRunner.sh` carry
  `Restart=always` + `RestartSec=5`, so every uncaught throw is a restart
  5s later, re-claiming the same poisoned task.
- Merge path `executeIntegrationAssignment` (`runner/daemon.js`
  ~2424-2537) is the model citizen: merge conflicts are detected
  (`diff --name-only --diff-filter=U`), reported via
  `client.integrationReport({ outcome: "conflict", detail })` plus
  `client.complete({ outcome: "failed", failureReason: detail })`, and
  never rethrown. Non-conflict merge errors still take the
  interrupt-without-reason + rethrow path (2519-2536).

### Runner → backend transport (already exists)

- `runner/client.js`: `complete()` (~140-197) supports
  `outcome: "failed"` + `failureKind` + `failureReason`, but has **no
  structured git-failure field**; `interrupt()` (~198-207) takes an
  optional 500-char `reason`; `logs()` / `logEvents()` carry log bytes.
- `runner/logEvents.js`: structured, redacted, batched event transport
  to `POST /tasks/:id/log-events` with text fallback — the right vehicle
  for hook output lines if needed.

### Backend: what happens to runner reports today

- `POST /tasks/:id/complete-execution`
  (`api/flow/runnerRoutes.js` ~1019) → `applyRunnerReport()`
  (`api/flow/execution/applyRunnerReport.js`) → failed outcomes go
  through `routeStageError` → `handleStageFailure()`, which sets
  `task.failureReason` + `task.lastError`
  (`api/flow/routing/orchestrators/handleStageFailure.js:210-222`),
  appends history + `[ERROR]` log line, records a `Failed` timeline row
  with reason/excerpts, writes a `-failure-` stage report, and emits
  `process:exit` / `stage:failback` events. `err.stdout` is rendered
  into the report, `lastError`, and timeline excerpt. **A
  `complete({ outcome: "failed", … })` from the runner therefore already
  reaches every surface the goal names** — the missing piece is the
  structured git payload inside it.
- `POST /tasks/:id/interrupt` → `executionLedger.interruptExecution()`
  (`api/flow/executionLedger.js:608-678`) sets status `interrupted` and
  appends a history line, but **never touches `task.lastError`** — this
  is the exact stale-error mechanism from the incident.
- `task.lastError.gitDiagnostics` already exists as the structured-git
  channel: `gitDiagnosticsOf(error)`
  (`api/flow/routing/resolvers/gitDiagnosticsOf.js`) copies
  `error.gitDiagnostics` into `lastError`, consumed today by the Tier-3
  failback prompt. Producers to mirror: `{ kind: "merge-conflict", … }`
  (`api/flow/commandStages.js:1931`), `{ kind: "sync-blocked", … }`
  (`api/flow/execution/applyIntegrationReport.js:71`). **No frontend
  consumer reads `gitDiagnostics` yet** — UI rendering is greenfield.
- Crash-loop backstop exists but is history-only:
  `MAX_RUNNER_INTERRUPTS = 5` (`api/flow/executionLedger.js:17`) counts
  consecutive same-stage interrupts and appends a "needs operator
  attention" line while auto re-queue continues.
- `failureKind` taxonomy in use: `"rejected"` (deliberate
  human/agent reject), `"timeout"`, `"none"`.

### Frontend: how failures render today

- Two "Stage Execution Failed" banners share `FailureMessage.jsx`
  (300-char preview + Show more/less + asset thumbnails):
  `frontend/src/components/tasks/TaskDetailsTabContent.jsx` (~83-139)
  and `TaskDetailPageContent.jsx` (~885). Card-level indicator in
  `TaskCard.jsx` (~637).
- Banner visibility is `isTaskFailed(task)`
  (`frontend/src/components/tasks/taskFormatters.js:115`): status
  `failed`, OR a `failureReason` with no retry/auto-iteration in
  progress (rejections excepted). An `interrupted` task with a stale
  `failureReason` renders the **stale** banner — matching the incident.
- `frontend/src/components/tasks/failureReason.js` holds the
  truncation/kind helpers the new block should reuse.

### Hook output format (what the parser must read)

- `scripts/githooks/pre-commit` runs
  `node scripts/check-binary-guard.mjs --staged --root <root>` on
  stderr; exit 1 = corrupt binary, exit 2 = usage error.
- `scripts/check-binary-guard.mjs` prints
  `binary-guard check FAILED (<n> corrupt …):` followed by one line per
  file: `<relPath>: expected magic <exp>, found <actual> (…remedy…)`
  (`formatGuardFailure`, ~167-180). Rel paths, expected/actual magic,
  and a concrete remedy are all machine-readable from these lines.

### Prior-stage inputs (provenance note)

- The worktree checkout does not contain
  `docs/tasks/1cae113f-43ab-4613-801b-2de6297637fd/` (local branch is at
  the base merge `8460e4a8`). `SURVEY.md` and
  `idea-20261120-163359.md` were read from
  `origin/kb/1cae113f-43ab-4613-801b-2de6297637fd` commit `26215b5d`.
- The survey's `answers` object is **empty** — the human never recorded
  answers. Every survey question is resolved below with a recommended
  default grounded in the stage goal; Step 0 asks for confirmation.

## Survey resolutions (SURVEY.md q1–q7)

| # | Question | Recommended resolution | Rationale |
|---|----------|------------------------|-----------|
| q1 | What should the task show? | Clear "commit failed" error **replacing** the stale error | The stage goal explicitly requires the new failure in `lastError`/timeline/logs instead of stale errors. No new task status (cheaper, reuses `isTaskFailed` + failback routing). |
| q2 | What ends the 10k-restart loop? | Classify, then park: deterministic hook/commit rejections report once and never rethrow; transient git faults (lock/timeout) keep bounded retries, then park with the error shown | Retrying a hook rejection is provably futile (same tree → same rejection); transient faults genuinely recover. Mirrors the existing `WORKTREE_CAP_REACHED` report-and-return precedent. |
| q3 | Which git problems surface? | Commit/hook failures **plus merge conflicts** in this change (the goal names "merge/commit paths"); push/network/auth stay generic errors but flow through the same new envelope so extending them later is one parser | Bounds scope while the shared contract keeps the door open. |
| q4 | Where is it visible? | Task detail banner/callout **and** timeline + logs/history (both required by the goal); task-card indicator as a cheap third (it already reads `lastError`); team webhook as follow-up | Covers goal-mandated surfaces first; `api/observability/webhookNotifier.js` already touches `lastError`, so the follow-up is small. |
| q5 | How much detail? | Capture **full** detail (command, exit code, complete hook output, files, remedy) in the payload; render **summary + expandable** full output in the UI | Full data for agents/debugging, progressive disclosure for humans. `FailureMessage.jsx` already implements the Show more/less pattern. |
| q6 | May KainBain auto-fix (bypass hooks / delete files)? | **No — hard constraint.** Never `--no-verify`, never auto-delete. Show what failed and how to fix it; a human or a later agent stage decides | Bypassing the guard that caught real corruption (or deleting user files) destroys the safety property the hook exists for. `--no-verify` is documented only as the manual escape hatch. |
| q7 | Who fixes a blocked commit? | This change: surface + explain so a **human can act immediately**; design `gitDiagnostics` so a **follow-up agent-remediation/failback stage** can consume it (path to "both") | Keeps this change shippable; the Tier-3 failback prompt already consumes `gitDiagnostics`, proving the agent-handoff shape works. Auto-remediation itself is a separate task. |

## Key decisions

1. **Contract first, in `shared/`.** One `GitFailureDetails` shape
   (plus a binary-guard output parser and remedy builder) implemented
   once in `shared/` and imported by runner, backend, and frontend.
   No layer invents its own field names.
2. **`complete({ outcome: "failed", … })` is the reporting vehicle**,
   not `interrupt()`. Only the complete path flows through
   `routeStageError` → `lastError` + timeline + report + failback;
   `interrupt()` deliberately leaves `lastError` alone. The runner
   therefore reports hook/commit failures as failed completions with an
   additive `gitFailure` payload field (old backends ignore unknown
   fields, so this is wire-safe).
3. **No rethrow for deterministic git failures.** Like the
   `WORKTREE_CAP_REACHED` branch, the daemon reports and returns, so
   the process stays alive and systemd never restarts.
4. **Extend `lastError.gitDiagnostics`, don't invent a parallel
   channel.** New `kind` values (`hook-rejected`, `commit-failed`)
   beside the existing `merge-conflict` / `sync-blocked`, following
   the `commandStages.js:1931` producer pattern.
5. **Never bypass or auto-repair.** q6's "no" is a constraint on every
   phase: no `--no-verify` in runner code paths, no file deletion, no
   hook disabling. The one allowed automation is *parking* (stop
   retrying), never *mutating*.
6. **Worktree-setup failures must also complete-fail, not interrupt.**
   `refreshWorktreeToRemote` throws before the harness ever runs; Step 2
   verifies the lease/claim state at that point accepts
   `complete-execution`, with a specified fallback (interrupt carrying
   `gitFailure` + backend records `lastError` from it).

## Approach — make the change easy, then make the change

**Make the change easy (Phases 0–2):** lock the survey resolutions;
write a failing incident-replay fixture (a repo with the binary-guard
hook + corrupt PNGs) that proves today's behavior end to end (generic
`git-failed`, reason-less interrupt, stale `lastError`, rethrow);
then land the shared `GitFailureDetails` contract + parser with unit
tests, so the runner/backend/frontend changes become thin adapters.

**Make the change (Phases 3–5):** runner classifies hook/commit
failures and reports failed completions without rethrowing (all four
commit sites); backend accepts and persists the payload through the
existing failure pipeline; frontend renders a dedicated callout.

**Prove it (Phases 6–7):** crash-loop hardening + full verification
(green suites, incident replay green, headless UI check) and docs.

## Steps

### Phase 0 — Confirm resolutions + green baseline (first, unblocks all)

1. Present the q1–q7 resolution table to the human (survey answers were
   never recorded). Proceed on the recommendations above unless
   overridden; record any override at the top of this file.
2. Run the primary gates untouched and record the baseline:
   `npm run test:unit` (api + frontend vitest suites) **and** the
   runner suite (`node --test` over the explicit file list in
   `scripts/run-tests.mjs` — runner tests are not part of either
   vitest suite), plus `npm run lint` if time allows. The change is
   done only when the same commands pass with the new tests included.
3. Identify the exact daemon call site of `prepareWorkdir` (worktree
   setup) and confirm the lease/claim state there: can that phase call
   `complete-execution`, or must setup failures travel via `interrupt`
   + a backend `lastError` extension (Decision 6 fallback)? Record the
   answer — Phase 3 branches on it.

### Phase 1 — Incident-replay fixtures (research spike; biggest risk first)

Goal: a deterministic, hermetic reproduction of the live incident that
fails today and passes after the change. No production code touched.

4. Build a fixture-repo helper (test-only) that creates a temp git repo
   with `core.hooksPath` pointed at a copy of `scripts/githooks`, one
   valid + 2–3 corrupt PNGs (bad magic bytes, e.g. `ef bf bd` header),
   and asserts `git commit` exits 1 with the binary-guard stderr.
   Cover: recovery commit (`refreshWorktreeToRemote` on a dirty reused
   worktree), stage commit (`commitAndPush`), and a foreign-hook variant
   (a hook script that exits 1 with arbitrary stderr) to prove the
   parser degrades gracefully on unknown hooks.
5. Write characterization tests (expected to FAIL before the change,
   documenting today's behavior):
   - runner: hook rejection surfaces only as `RunnerGitError`
     `git-failed` with no hook/files fields;
   - daemon catch path: reason-less `interrupt()` + rethrow (assert via
     stubbed client: `interrupt` called with no `reason`, error
     propagates);
   - backend: `interruptExecution` leaves a pre-seeded stale `lastError`
     untouched and sets status `interrupted`;
   - contract: no `gitFailure`/`gitDiagnostics` hook kind exists.
6. Fixture hygiene: temp dirs under the test root, `git -c` identity
   overrides only (never touch repo config), no network, and binary
   fixture files committed per `docs/tasks/_PROOF_RULE.md` (generate
   bytes in-test where possible to avoid tripping the guard itself).

### Phase 2 — Shared `GitFailureDetails` contract (make the change easy)

7. Add `shared/gitFailure.js` (house style: MARK/JSDoc, dependency-free
   like `shared/stageVerdict.js`):
   - `GIT_FAILURE_KINDS`: `hook-rejected`, `commit-failed`,
     `merge-conflict` (reuse), plus reserved `push-failed`,
     `auth-failed` for the q3 follow-up.
   - `parseHookFailure({ command, exitCode, stdout, stderr })` →
     `{ kind, hookName, files[], hookOutput, remedy }`: recognizes the
     binary-guard signature (`binary-guard check FAILED`, per-file
     `<relPath>: expected magic …` lines, `pre-commit:` wrapper lines);
     unknown hooks yield `kind: "hook-rejected"` with
     `hookName` best-effort (or `"unknown"`), `files: []`, full output
     preserved, generic remedy ("inspect the hook output, fix or
     unstage the files, retry; `--no-verify` only as a manual,
     intentional escape hatch").
   - `buildGitFailureDetails({ phase, command, exitCode, … })` envelope
     with `phase ∈ worktree-setup | recovery | stage-commit | merge`,
     caps (hook output ≤ 8k chars, files ≤ 50) so payloads stay
     transport-safe beside the 20k output cap and 500-char reason cap.
   - `isDeterministicGitFailure(kind)` → true for hook/commit/merge
     rejections (never rethrow, never auto-retry the same tree).
8. Unit tests in `shared/` (mirroring `*.shared.test.js` convention):
   binary-guard output → files + remedy; foreign hook → graceful
   degradation; caps/truncation markers; kind taxonomy incl. reserved
   kinds. Wire the runner to import it exactly as it already imports
   `shared/redactSecrets.js` (bundling precedent exists).

### Phase 3 — Runner: classify, report, don't crash (the change, part 1)

9. `runner/project.js` `toRunnerGitError()`: detect hook rejection
   (commit/merge argv + exit code + stderr markers from Phase 2) and
   throw `RunnerGitError("git-hook-rejected", …)` carrying the parsed
   `gitFailure` details object; plain commit failures keep
   `git-failed` but gain `exitCode`. Keep `git-lock`/`git-timeout`
   untouched. Unit tests in `runner/gitOps.test.js` /
   `runner/project.test.js` with captured real outputs.
10. `runner/client.js` `complete()`: additive `gitFailure` field
    (passed through verbatim; old backends ignore it). Update
    `runner/client.test.js`.
11. `runner/daemon.js` stage-execution catch (~2243): add a branch
    before the generic interrupt (after `WORKTREE_CAP_REACHED`,
    mirroring its shape): if `isDeterministicGitFailure(err)` →
    flush structured sender → `sendLogs` one-line summary →
    `client.complete({ outcome: "failed", failureKind: "commit-failed",
    failureReason: <one-line>, gitFailure: <details>, committed: false,
    … })` → `return` (never rethrow). Transient `git-lock` /
    `git-timeout` keep today's interrupt+rethrow (bounded by the
    existing `MAX_RUNNER_INTERRUPTS` escalation), but now
    interrupt **with** the reason so history names the cause.
12. Worktree-setup path (`prepareWorkdir` /
    `refreshWorktreeToRemote` throw, per the Phase-0 finding): same
    report-and-return via `complete-failed` when the lease allows it;
    otherwise `interrupt({ reason })` carrying `gitFailure` (client
    extension) for the Phase-4 backend fallback. Either way: no rethrow
    for deterministic failures.
13. `preserveEvictedWorkdir` callers: log the structured detail at
    `logger.error` (today it is swallowed silently) so eviction-time
    hook blocks are diagnosable; still degrade to
    `WORKTREE_CAP_REACHED`, never crash.
14. Integration path (`executeIntegrationAssignment` ~2519): route
    `git-hook-rejected` / commit failures through `failTask(detail,
    { gitFailure })` like conflicts; only genuinely unknown errors keep
    interrupt+rethrow (with reason).
15. Regression tests: incident replay green — fixture repo → daemon
    handler with stubbed client asserts `complete-failed` with
    `gitFailure` (command, exit code, 3 PNG paths, remedy), `interrupt`
    not called, no throw. Add a "no `--no-verify` in runner code"
    grep-guard test (q6 enforcement). If new `runner/*.test.js` files
    are added (rather than extending existing ones), register each in
    the explicit list in `scripts/run-tests.mjs`
    (`tests/run-tests.test.mjs` fails the gate for unregistered
    files).

### Phase 4 — Backend: accept and persist (the change, part 2)

16. `POST /tasks/:id/complete-execution`
    (`api/flow/runnerRoutes.js` ~1019): accept additive
    `gitFailure`, validate shape loosely (unknown fields tolerated,
    sizes capped), redact via `redactSecretsText`, pass into
    `applyRunnerReport` outcome.
17. `applyRunnerReport` failed branch (~164): attach
    `err.gitDiagnostics = { kind, …gitFailure }` (mirroring
    `commandStages.js:1931` / `applyIntegrationReport.js:71`) and set
    `err.stdout` to the full hook output so the existing pipeline
    renders it into the failure report, `lastError`, and timeline
    excerpt with zero further changes. Register `failureKind:
    "commit-failed"` in the classification path (`classificationMetaOf`
    / failback routing) as non-retryable-by-default (same tree would
    fail again) while keeping operator retry available.
18. Fallback only if Phase 0 requires it: `interruptExecution` accepts
    `gitFailure` and, when present, writes a minimal `lastError`
    (message + `gitDiagnostics` + timestamp) instead of leaving the
    stale one — the single sanctioned exception to "interrupt never
    touches `lastError`", covered by a dedicated test.
19. Old-runner / old-payload compatibility: absent `gitFailure`
    behaves exactly as today; malformed `gitFailure` is dropped with a
    warning, never a 400 (a reporting failure must not mask the stage
    failure). Contract tests for both.
20. Backend tests: route-level test posts a failed completion with
    `gitFailure` and asserts `lastError.gitDiagnostics`, replaced
    `failureReason`, timeline `Failed` row with hook excerpt, history
    entry, `-failure-` report containing file list + remedy, and
    `process:exit` emission.

### Phase 5 — Frontend: dedicated commit-failure callout (the change, part 3)

21. Add `GitFailureDetails.jsx` beside `FailureMessage.jsx`: renders
    `task.lastError.gitDiagnostics` as a structured block — title
    ("Commit blocked by pre-commit hook" / "Commit failed"),
    failing command + exit code (mono, one line), hook output files as
    a list, remedy text, and the full hook output inside the existing
    Show more/less pattern. Pure presentational component with
    `data-testid` hooks; null-safe on absent/malformed diagnostics.
22. Mount it inside both failure banners (`TaskDetailsTabContent.jsx`
    ~83-139, `TaskDetailPageContent.jsx` ~885) directly under
    `FailureMessage`, shown only when `gitDiagnostics?.kind` is a
    commit/hook kind. Banner heading switches to "Commit Failed" for
    these kinds (a `failureReason.js` helper, tested). No change to
    `isTaskFailed` semantics — the banner appears because the backend
    now writes a fresh `failureReason`, which also fixes the stale
    display from the incident.
23. `TaskCard.jsx` (~637): extend the card indicator to label
    commit/hook failures distinctly (same helper as the banner).
    Timeline tab needs no change (reason/excerpt already flow), but add
    a test pinning that a hook-failure timeline row shows the file list.
24. Frontend tests (`*.test.jsx` beside the components): full-detail
    render, summary-collapsed default, expand toggle, absent-diagnostics
    (renders nothing, banner unchanged), malformed-diagnostics
    degradation, card label. Headless check via repo fixtures (no
    long-lived servers): render with a mock task carrying the incident
    payload; screenshot the banner with `npm run capture:screenshot`
    only if a pixel proof is required by the stage checklist.

### Phase 6 — Crash-loop hardening (park, don't spin)

25. Runner: after reporting a deterministic git failure for a task, do
    not immediately re-claim the same task+stage in the same poll
    cycle (short per-task backoff in the daemon dispatch loop); the
    process stays alive and takes other work.
26. Backend: when `interruptCount` hits `MAX_RUNNER_INTERRUPTS`
    (`executionLedger.js:659`), also pin the latest known error onto
    the task (history line already exists; add `lastError` only via the
    Phase-4 fallback rule — never overwrite a fresher `lastError`) and
    confirm dispatch/claim skips or deprioritizes the escalated
    task+stage until operator retry — verify against the scheduler
    (`api/flow/taskScheduler.js`, `findResumedCandidate.js`); if the
    scheduler cannot express "parked", record that as a named
    follow-up instead of inventing a new status (q1).
27. Add a regression test proving the loop is dead: N consecutive
    deterministic git failures → N reports, 0 process exits, 0
    reason-less interrupts (daemon-level, stubbed client + systemd
    restart counting out of scope).

### Phase 7 — Verification and rollout

28. Full gates: `npm run test:unit`, the runner `node --test`
    suite, `npm run lint`, plus `npm run docs:check` after the doc
    updates (JSDoc examples and doc links are gated). Fix nothing by
    narrowing suites — failures are requirements.
29. Incident replay end to end (the Phase-1 fixtures, now green):
    corrupt-PNG repo → runner reports `complete-failed` with
    `gitFailure` → backend `lastError`/timeline/report carry hook
    detail → frontend banner renders files + remedy. Record the
    evidence (test names + output excerpts) in the stage report.
30. Manual smoke (staging or local self-host): push a branch with a
    corrupt PNG through a runner task, confirm the UI callout and zero
    runner restarts (`systemctl --user status`, restart counter), then
    resolve by re-capturing the PNG per the shown remedy and retrying
    the stage. Rollout is safe by construction: additive wire field,
    old runners/backends interoperate, no migration.

## Validation plan (evidence-oriented)

How the implementer proves the change worked (not just "tests pass"):

- **Primary gates:** `npm run test:unit` (api + frontend vitest
  suites) **and** the runner `node --test` suite green on the touched
  tree, with the new tests included. Baseline recorded in Phase 0 for
  comparison.
- **Incident replay:** the Phase-1 fixture suite must fail on the base
  commit and pass after the change — the single strongest proof. Keep
  these tests committed beside the code they cover
  (`runner/*.test.js`, `api/flow/**/*.test.js`,
  `frontend/src/components/tasks/*.test.jsx`), not in `/tmp`.
- **Layer-by-layer assertions (each a committed test):**
  - parser: binary-guard stderr → exact file list + remedy; foreign
    hook → `hookName`/`files: []` degradation; caps + truncation
    markers present;
  - runner: hook rejection → `git-hook-rejected` with details;
    daemon → `complete-failed` called with `gitFailure`, `interrupt`
    not called, no throw; grep-guard: no `--no-verify` in `runner/`;
  - backend: `lastError.gitDiagnostics` persisted, stale `lastError`
    replaced, timeline/history/report/log entries carry the detail,
    `process:exit` emitted; old/malformed payloads degrade without
    400s;
  - frontend: callout renders files + remedy + expandable output in
    both detail views; card label; absent/malformed diagnostics render
    nothing extra (banner unchanged).
- **Loop-dead proof:** daemon-level test — N consecutive deterministic
  failures → N reports, 0 exits, 0 reason-less interrupts — plus the
  manual staging smoke recording the systemd restart counter at 0.
- **UI check without servers:** mock-task render tests + repo fixtures
  only; `npm run capture:screenshot` solely if the stage checklist
  demands pixel proof. No long-lived background servers.
- **Negative cases:** clean tree (commit skipped, no failure);
  foreign hook; hook exit 2 (usage error); eviction-path swallow still
  degrades to `WORKTREE_CAP_REACHED`; `git-lock`/`git-timeout` still
  interrupt (now with reason) and still escalate at 5.

## Documentation plan

- **This file** stays the source of truth through implementation;
  record the Phase-0 survey confirmation and the lease-state finding
  here.
- **Code docs (required, gated by `npm run docs:check`):** MARK/JSDoc
  on `shared/gitFailure.js` and every touched function, with runnable
  `@example`s; keep JSON shapes in prose + tests identical.
- **Runbook:** extend `docs/git-runner-coordination-spike.md` (or the
  closest runner/git runbook) with a "commit/hook failure" section:
  what the UI callout means, the remedy steps (re-capture via
  `node scripts/capture-screenshot.mjs --out <path>`, or
  `git checkout <ref> -- <path>`, re-verify with `xxd`/`file`), and
  the manual `--no-verify` escape hatch with its "intentional baseline
  only" warning. Link it from the frontend remedy text if a stable URL
  exists, else keep the remedy self-contained.
- **Hook docs:** one-line pointer in `scripts/githooks/pre-commit`
  header comment and `docs/tasks/_PROOF_RULE.md` noting failures now
  surface in the task UI.
- **ADR (short):** record in `docs/adr/` the `GitFailureDetails`
  contract choice, the complete-not-interrupt reporting decision, and
  the never-bypass constraint (q6), so future agent-remediation work
  inherits the rationale.
- **Changelog:** add a `CHANGELOG.md` entry under the current
  unreleased section describing the user-visible fix.

## Risks and open questions

1. **Lease state at worktree-setup time (Decision 6).** If
   `complete-execution` rejects a report before `progress: started`
   (fencing/epoch rules in `executionLedger`), setup failures must use
   the interrupt+`gitFailure` fallback — Phase 0 settles this before
   any production code is written.
2. **Scheduler parking expressiveness.** q2's "park and wait" may
   exceed what dispatch/claim can express without a new status (q1
   forbids one). Worst case: report-and-return stops the restart
   storm, and re-queue continues visibly until a human retries — still
   a strict improvement, with scheduler parking as a named follow-up.
3. **Hook-output size and secrets.** Hook stderr is capped (8k) and
   redacted (`redactSecretsText` on ingest, `redactDeepStrings` on the
   sender), but a pathological hook could still spam — the caps plus
   the existing 20k output / 500-entry log bounds contain it.
4. **Foreign hooks.** Repos with other hook managers produce arbitrary
   stderr; the parser must degrade (Phase 2), never throw, and the
   full output is always preserved so nothing is lost.
5. **Failure-kind routing side effects.** Registering
   `failureKind: "commit-failed"` must not accidentally opt into
   auto-retry/auto-iteration loops or alerting meant for infra faults
   — verify against `classificationMetaOf`, `handleTransientFailure`,
   and `api/observability/alerts.js` during Phase 4.
6. **Frontend `lastError` staleness in flight.** The banner reads the
   task object; confirm the websocket/task-refresh path delivers the
   fresh `lastError` without a manual reload (the `TASK_UPDATED` /
   `process:exit` events suggest yes — assert in test).

## Non-goals

- Automatic remediation of any kind: no `--no-verify` retries, no file
  deletion/restore, no hook disabling, no agent auto-fix loop (q6/q7 —
  the structured payload is the handoff point for a future task).
- Surfacing push/network/auth failures beyond today's generic errors
  (q3 follow-up; the envelope reserves kinds for it).
- Team notifications/webhooks on hook failure (q4 follow-up).
- New task statuses (q1), backend-side git execution changes for
  Runner work (ADR 0009: the runner owns git), and systemd unit
  changes (`Restart=always` stays — the fix is to stop throwing, not
  to stop restarting).
