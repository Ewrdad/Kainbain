# KainBain — Manual Regression Tests

Manual tests for humans and AI agents to run **before and after a major refactor**.
Goal: prove user-visible behaviour did not regress, without polluting live data.

> Write-up date: 2026-10-25. Verified against build 536 (`28fc5ba`) on a disposable
> scratch instance (see [00-setup-and-teardown.md](00-setup-and-teardown.md)).
> Re-check endpoint shapes with `GET /agent` after the refactor — that guide is
> the live contract and wins over this pack if they disagree.

## Rules (read first)

1. **Never mutate the live service on `:3100` by default.** Run everything
   mutating on the isolated scratch stack in
   [00-setup-and-teardown.md](00-setup-and-teardown.md) (API `:3417`, UI `:5417`,
   mock harness, scheduler off, throwaway roots under `/tmp`).
   The live `:3100` service may only be used for the explicitly read-only tests.
2. **Every test cleans up after itself.** Each test ends with a `Cleanup`
   section. A test is not `PASS` until its cleanup checks pass.
3. **Name everything with your run id.** Projects: `MT <RUN_ID> …`,
   tasks: `MT <RUN_ID> …` where `RUN_ID` is e.g. `20261025-a1`.
   Cleanup searches by that prefix — no prefix, no safe cleanup.
4. **Record evidence, not impressions.** Paste the exact HTTP status, JSON
   field, or UI text you observed into the run log
   ([run-log-template.md](run-log-template.md)).
5. **Agents:** use only the commands in each test. Do not invent endpoints,
   do not call `POST /deploy`, `POST /deploy/rollback`, or `POST /push/test`
   on any shared/live stack, and do not kill processes you did not start
   (use only the PIDs recorded in setup).

## Test index

| File | Area | Tests | Mutating? |
| --- | --- | --- | --- |
| [00-setup-and-teardown.md](00-setup-and-teardown.md) | Scratch stack lifecycle | MT-SETUP-01…03 | Scratch only |
| [01-smoke-and-discovery.md](01-smoke-and-discovery.md) | Health, status, agent guide, OpenAPI | MT-SMOKE-01…06 | No (read-only) |
| [02-projects-and-workflows.md](02-projects-and-workflows.md) | Projects, activation, workflows, stages | MT-PROJ-01…08 | Scratch |
| [03-tasks-lifecycle.md](03-tasks-lifecycle.md) | Task CRUD, preview, move/advance/jump/complete, blockedBy | MT-TASK-01…12 | Scratch |
| [04-execution-engine-and-compute.md](04-execution-engine-and-compute.md) | Execute, human/CI stages, pause/resume/retry/abort, engine, circuit, sessions | MT-EXEC-01…11 | Scratch |
| [05-ui-board-and-views.md](05-ui-board-and-views.md) | Kanban, detail, review, survey, explorer, observability, docs, routing | MT-UI-01…12 | Scratch UI |
| [06-files-docs-skills-review.md](06-files-docs-skills-review.md) | Files, docs, skills, review comments, reports, images | MT-DOC-01…10 | Scratch |
| [07-settings-push-deploy-safety.md](07-settings-push-deploy-safety.md) | Config, prompt layout, push, harnesses/models, deploy (read-only) | MT-SET-01…09 | Scratch, mostly read-only |
| [08-negative-security-and-recovery.md](08-negative-security-and-recovery.md) | Validation, traversal, 404/409, restart persistence, WebSocket | MT-NEG-01…10 | Scratch |

## Suggested refactor run order

1. `00` setup → `01` smoke (5 min, catches boot/config breakage).
2. `02` + `03` (core data model — highest regression risk).
3. `04` (engine semantics).
4. `05` + `06` (user-visible surfaces).
5. `07` + `08` (settings, safety, recovery).
6. `00` teardown + final "no leftovers" check.
7. Only then, optionally, the read-only subset (`01`, `07` read-only tests)
   against live `:3100` to confirm the deployed build.

## Result values

Use exactly: `PASS`, `FAIL`, `BLOCKED` (environment/credential missing),
`SKIP` (optional/real-harness only). `FAIL` requires the observed output.

## Known behaviour to not "fix" during the run

- `DELETE` with header `Content-Type: application/json` and an empty body
  returns `400 FST_ERR_CTP_EMPTY_JSON_BODY`. Send deletes with no JSON
  content-type, or with body `{}` (as written in the cleanups).
- The mock harness echoes the curated prompt, which contains the verdict
  template text. A mock agent run therefore produces dispatch + log + report
  evidence and may fail-back/retry — assert those, not a clean `PASS`
  (see MT-EXEC-01). Deterministic progression uses
  advance/move/jump/complete and human/CI stages.
- `projectId` is optional on most routes and falls back to the active
  project. Tests always pass it explicitly; omission behaviour is checked
  once, deliberately, in MT-TASK-11.
