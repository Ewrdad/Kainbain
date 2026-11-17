# WP1 — Retrospective (stage: retrospective)

Reference ticket (case study for follow-ups): audit task
`5fdea223-6b10-460e-8ae7-388526798085` (multi-project audit; findings H-1 fail-open
active-project fallback, H-4 ledger never compares `hold.projectId`; work package WP1).
This task `db24c124-4244-4341-9d23-bad111889645` implemented WP1.

## History reviewed

- Task record via API (`GET /tasks/db24c124-…`): status `in_stage` at the
  `retrospective` stage; 17 reliability samples, all `failureKind: none`; no
  failbacks, no interruptions, `stallCount: 0`. Stage chain Idea → Plan → CI →
  Risk review → catchup → In Progress → automated tests → … → Final review all
  PASSED. So this ticket had **no failed stages**; the difficulties below are
  structural, observed from the reports and the prompt, not from retries.
- Task folder reports: `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_NOTES.md`,
  `REVIEW.md`, `SURVEY.md` (all present on disk in this worktree).
- Source audit task `5fdea223-…`: all five of its reports
  (`INTENT-SURVEY.md`, `FEEDBACK_SURVEY.md`, `FRAMEWORKS.md`, `AUDIT.md`,
  `DELIVERABLES.md`) are recorded `missingOnDisk: true` — they exist only on the
  audit branch `kb/5fdea223-…`, not in downstream runner worktrees.

## Difficulties / friction found

1. **Dead cross-task citations in the prompt (biggest effort sink).** The WP1
   prompt cited `docs/tasks/5fdea223-…/AUDIT.md`, `DELIVERABLES.md`,
   `FRAMEWORKS.md`, `FEEDBACK_SURVEY` and `/tmp/kb-q4-probe.mjs`. None exist in
   the runner checkout (verified on disk and via the API `missingOnDisk` flags).
   The agent had to re-verify every cited file/line against live code and
   re-author the Q4 probe from scratch ("Evidence gaps" in IMPLEMENTATION_PLAN.md).
   The same dead refs appear in the WP3 ticket `b21fa94e-…`, so this recurs on
   every audit-derived ticket. Related patterns already fixed for *same-task*
   reports (`4f927ecb-…`) and image assets (`b31cab50-…`) but not for cross-task
   docs or `/tmp` paths.
2. **Route classification is documentary, not structural.** WP1's Phase 0 manual
   route inventory (12 strict mutating routes vs view/exempt) lives in a comment +
   `IMPLEMENTATION_NOTES.md` table. The Q4 suite pins existing routes but cannot
   catch a *future* route that silently reuses the fallback resolver — the exact
   H-1 failure mode. Two accepted warts remain unpinned: fallback resolvers
   derivable from `projectStore` in hand-built test deps, and legacy
   `projectId: null` holds still honored at the ledger (REVIEW.md non-blocking
   notes).
3. **Survey answers never arrived** (`SURVEY.md` `answers: {}`); the plan locked
   the Recommended options as recorded assumptions. Already covered by completed
   ticket `73f23a38-…` ("Gate implementation on answered requirement survey"),
   so **no new ticket raised** for this — dedupe.

## Tickets raised this stage (target: project `kainbain` `0fd41821-…`, `wf-default`, stage `1` "Idea", execute=false)

| Ticket id | Title | Why |
|---|---|---|
| `549cebb9-ca36-4441-8546-e5a949a9fe2a` | Materialize cross-task referenced docs and cited files into runner worktrees (or inline them into stage prompts) | Fixes friction #1 structurally: cross-task `docs/tasks/<id>/…` refs get `git checkout kb/<id> -- <path>` into the worktree (or inlined), `/tmp` citations become durable `attachments/`, unresolvable refs become explicit `MISSING-REF` warnings. Case study references `5fdea223-…` and this task. |
| `df723e4d-8445-4cba-a3ca-12bf923ba43d` | Declarative runner-route guard registry with fail-closed coverage test | Fixes friction #2 structurally: registry `{method, path, guard: strict|view|exempt}` next to `registerRunnerRoutes` + a test that fails on any unregistered/misclassified mutating route, and pins the two REVIEW.md warts. Prevents H-1-class regressions. References `5fdea223-…` H-1/H-4 and this task's reports. |

Both verified after creation via `GET /tasks/<id>?projectId=…`:
`currentStageId = 1`, `workflowId = wf-default`, goal text intact with references
to `5fdea223-6b10-460e-8ae7-388526798085` and `db24c124-4244-4341-9d23-bad111889645`.
Idempotency checked: re-POSTing the first payload returned the same id
(`549cebb9-…`), no duplicate. Dedupe: no open ticket in `wf-default` stage `1`
covers either goal (checked all 71 project tasks; `4f927ecb`, `b31cab50`,
`73f23a38` are completed and scoped to same-task reports / assets / survey gating).
Neither ticket targets the currently executing stage (`stage-1794594754686`).

## Not raised (deliberately)

- Survey gating — already covered by completed `73f23a38-…`.
- Retiring legacy `null`-projectId holds — back-compat by design per REVIEW.md;
  folded into ticket `df723e4d-…` as a pinned assertion rather than a behavior
  change.
- WP5 load testing — already open as `a6023708-…` ("Run production-scale SLO
  gate…"), blocked on WP1 which is now merged.
