# Retrospective — follow-on tickets raised from task `05b5d046-9480-40e3-8ec9-c06596c51acc`

Stage: retrospective (`stage-1794594754686`), docs-only. No source files touched;
only this report and `drafts/*.md` were added under `docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/`.

## 1. History reviewed

- `IMPLEMENTATION_PLAN.md`, `implementation-report-20261123.md`, `cleanup-report-20261123.md`,
  `review-20261123.md`, `automated-tests-failure-20261123-085218.md` (+ `ci-fast-gate-20261123-083258/`),
  `SURVEY.md`, human-stage reports, and the cited source research at
  `/home/server/projects/kainbain/docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
  (RESPONSE.md S7, GUIDE-06 §2/§4, WIDE_NET Cause 6).
- Git history of branch `kb/05b5d046-9480-40e3-8ec9-c06596c51acc`.

## 2. Frictions found (evidence in the reports above)

| # | Friction | Evidence | Disposition |
|---|---|---|---|
| F1 | Cited cross-task docs (`docs/tasks/2e663986-…/GUIDE-06…`) absent from the runner worktree; spec had to be reconstructed from code; real docs only at `/home/server/projects/kainbain/docs/tasks/2e663986-…/` (branch cut from a `main` without that dir) | `IMPLEMENTATION_PLAN.md` §0.3, `implementation-report-20261123.md` §1, `git ls-tree HEAD -- docs/tasks/ \| grep 2e66` → empty | **Ticket `e6bf87c6-3cda-477d-a785-870f971b72fd`** |
| F2 | GUIDE-06 §4 PROD-READ-ONLY recount deferred in both implementation and cleanup stages ("needs operator permission") — the check that keeps Cause 6 ruled out never ran; same manual handoff repeats on sibling S-tasks (`78eac844`, `810acb8f`) | `implementation-report-20261123.md` §4, `cleanup-report-20261123.md` ops handoff | **Ticket `7c1f49fc-2c6d-4703-81eb-f66f2c77dca5`** |
| F3 | Task declared "Change: NONE to behaviour" but the cleanup stage edited prod `reconcileInterruptedRuns.js`; review had to do manual case-by-case regression analysis to accept the disclosed deviation | `review-20261123.md` "Plan deviation (disclosed, accepted)" | **Ticket `35d239cf-744a-4241-a957-de8c360a223d`** |
| F4 | `api/node_modules` absent in runner checkout → agent ran `npm ci --prefix api`; CI gate re-installs missing workspace deps every run (api 117 pkgs, frontend 535 pkgs, canary 5 pkgs) | `implementation-report-20261123.md` §3 note; `automated-tests-failure-20261123-085218.md` CI output | **Ticket `6e9c2928-f78e-4c0f-88f7-60e3842e30df`** |
| F5 | Canary e2e flake (`footer-overlay.spec.js:188`, "Target page, context or browser has been closed") failed the whole CI stage though all 13 fast branches passed | `ci-fast-gate-20261123-083258/canary-tests.full.log` tail | **Already covered — no new ticket.** Open task `44125086-d5aa-4bd3-a6c7-04eef809f59e3` ("Survive dead-browser canary flakes without failing the whole gate") plus completed `8769b002` (quarantine flaky CI tests). |
| F6 | Stage prompt listed a previous-report file that did not exist on disk | `IMPLEMENTATION_PLAN.md` §0.2 | **Already covered** by completed `4f927ecb` (list only existing reports); not re-raised. |

## 3. Dedupe check performed

`GET /tasks?workflowId=wf-default&projectId=0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`
(78 tasks) — goals scanned for `docs/tasks/`, `canary`, `flake`, `PROD-READ-ONLY`,
`server restart`, `orphan`, `node_modules`, `scope drift`, `deviation`, etc.
Findings F5/F6 matched existing tickets; F1–F4 had no open or completed ticket
with the same goal (`7f6220c3` is a different scope: separate remote docs repo).

## 4. Tickets created (target: project `kainbain` = `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`, workflow `wf-default`, stage `1`, `execute:false`)

| Ticket id | Title | Stage | Blockers |
|---|---|---|---|
| `e6bf87c6-3cda-477d-a785-870f971b72fd` | # Resolve cross-task `docs/tasks/<id>/` references in stage prompts (materialize into the runner workspace or warn MISSING) | 1 | none (`blockedBy: []`) |
| `7c1f49fc-2c6d-4703-81eb-f66f2c77dca5` | # Automate the read-only prod "interrupted by server restart" recount so Cause 6 stays ruled out without a manual operator handoff | 1 | none (`blockedBy: []`) |
| `35d239cf-744a-4241-a957-de8c360a223d` | # Fail the fast gate when a "no behaviour change / test-only PIN" task modifies prod files without a disclosed deviation | 1 | none (`blockedBy: []`) |
| `6e9c2928-f78e-4c0f-88f7-60e3842e30df` | # Pre-warm workspace `node_modules` in runner images so stages and CI skip per-run `npm install` | 1 | none (`blockedBy: []`) |

Each ticket's goal is the byte-for-byte content of its Stage-1 draft in
`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/drafts/`, opens with the `# <title>`
line, is self-contained (zero external context required), and cites this task
(`05b5d046-9480-40e3-8ec9-c06596c51acc`) as the case study.

## 5. Verification

For each created id, `GET /tasks/<id>?projectId=0fd41821-…` confirmed:
`currentStageId == "1"`, `blockedBy == []`, `status == waiting_human`, and
`goal` byte-identical to the draft file. The stored `title` equals the goal's
first line with the leading `# ` stripped (the API additionally drops a trailing
backtick on the prewarm ticket's title; the goal itself is byte-exact, and the
display title is derived from the goal's first line).

Idempotency keys (sha256 of finding + stage + this task id, first 32 hex):
`6ebe67bc42bad85c0d8304690e5b74c3`, `5ac06c6ec20c9090659d37aee1a7c70e`,
`741f8dc63d9a8f4cd02f46561cd91af1`, `d5fc5c6410ad55f5c577965342087011`.

## 6. Not targeted

The currently executing stage (`stage-1794594754686`, retrospective) was not
targeted by any ticket (recursion guard).
