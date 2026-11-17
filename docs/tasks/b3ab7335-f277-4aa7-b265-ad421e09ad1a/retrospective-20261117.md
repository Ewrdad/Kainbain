# Retrospective — Default screenshot capture output to the task docs folder

Task: `b3ab7335-f277-4aa7-b265-ad421e09ad1a` (branch `kb/b3ab7335-f277-4aa7-b265-ad421e09ad1a`, merged to main as `8b5904e0`).
Stage: retrospective (`stage-1794594754686`). Date: 2026-11-17.

## History reviewed

- `IMPLEMENTATION_PLAN.md` (plan + research spikes), `SURVEY.md` (3/3 Recommended answers),
  `review-pr-20261117.md` (all 4 acceptance criteria probed PASS, safe to integrate).
- Implementation commits: `cecb67ee` (plan/survey), `b2652c4e` + `cdf247e2` (script/tests/docs),
  `3c2df11c` (review). No failbacks or rework cycles on this ticket — the plan→implement→review
  path ran clean.
- Related chain: precursor `ef569a1a-d301-4e10-aaba-8cde942b97e8` (prevent PNG corruption),
  detection ticket `b1c069e0-1875-4aa7-b51d-4c4399b2be31`, both completed.

## Difficulties found (agent-effort costs)

1. **Undiscoverable runner env contract (structural — ticketed).**
   The plan's research (`IMPLEMENTATION_PLAN.md:20`) scoped its env search to `scripts/` and
   `docs/agent-docs/`, found "no existing `TASK_ID`/`KAINBAIN_TASK_ID` consumer", and burned a
   Phase 0 spike (Step 0.1: "inspect a live task worktree env / runner docs") to confirm the
   runner's variable name. In reality the runner DOES set these — but fragmented by stage type
   and documented nowhere:
   - CI stages: `KAINBAIN_TASK_ID` + `KAINBAIN_TASK_DOCS` (`runner/daemon.js:1908`).
   - Command stages: full `KAINBAIN_*` set (`api/flow/commandStages.js:522-523`).
   - Agent harnesses: `TASK_ID` at best, inconsistently (`harnessScaffold.js:93`,
     `codexHarness.js:369`); the muse harness allowlist (`musePermissions.js:404-422`) passes
     NO task vars at all — confirmed live: this retrospective stage's own shell showed zero
     `TASK_*`/`KAINBAIN_*` vars.
   - `runner/README.md` documents only runner-config vars; no per-stage-type contract doc exists.
   Consequence: the capture script re-derives `docs/tasks/<id>` via `kb/<task-id>` branch parsing
   (fragile on detached HEAD / non-`kb/` branches) instead of using the absolute
   `KAINBAIN_TASK_DOCS` var CI stages already receive (precedent consumer:
   `scripts/lib/fast-gate-verdict.mjs` `taskDocsDirOf`). Every future task-identity need repeats
   this research + branch-parsing workaround.

2. **Browser-path verification impossible in runner worktrees (not ticketed — duplicate).**
   Both this review and the `ef569a1a` review note full browser launch was impossible because the
   worktree lacks the installed `@playwright/test` npm package (declared in `package.json:47`,
   absent from `node_modules/`; browsers present). This is the same root cause as open ticket
   `44ee3404-7e6c-4134-90e7-df90e24beb4a` ("Make full test/lint gates re-runnable from runner
   worktrees (shared node_modules or a runner verify endpoint)", stage `1`, `waiting_human`),
   so no duplicate was created. The team's adaptation — pure injected resolver functions with
   browser-free unit tests — is the right pattern until that lands.

## Dedupe check

Queried `GET /tasks?workflowId=wf-default&projectId=0fd41821-...` (69 tasks) via the runner
backend (`http://192.168.1.206:3100`; `localhost:3100` refuses connections from runner hosts —
use `KAINBAIN_RUNNER_BACKEND`). No open ticket covers the stage-env contract; the Playwright
observation matches open `44ee3404` above.

## Ticket created (1 of max 10)

- **ID:** `92ed789c-bb6d-43c8-a094-9bf6a20aa188`
- **Title:** Unify runner stage env contract: inject task identity into agent stages and document it
- **Stage:** `1` (Idea) in `wf-default`, project `kainbain` — verified via re-read
  (`currentStageId: 1`, `status: waiting_human`). Current executing stage is
  `stage-1794594754686` (retrospective), so the recursion guard holds.
- **Idempotency key:** `b9a00b08fe52dd06d9c7fb8f28ac3c56` (sha256 of finding + stage + task id).
- **Ask:** pin `KAINBAIN_TASK_ID` + `KAINBAIN_TASK_DOCS` into every agent-harness child env via the
  shared scaffold, document the canonical per-stage-type contract, prefer `KAINBAIN_TASK_DOCS` in
  `capture-screenshot.mjs`, add mirror-style unit + harness-contract tests. Ticket text stands
  alone and cites this task (`b3ab7335-...`) as its case study.
