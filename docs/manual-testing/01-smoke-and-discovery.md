# 01 — Smoke and discovery (read-only)

Run against scratch (`$BASE`, see 00-setup). MT-SMOKE-01…05 may also be run
read-only against live `http://localhost:3100` after deployment.
No test in this file creates, changes, or deletes anything.

Conventions: `$BASE` = scratch API base. "Cleanup: none" still requires the
final check that counts did not change.

## MT-SMOKE-01 — Global status

- **Priority:** P0. **Type:** API.
- Steps: `curl -s $BASE/status`
- Expected: `200`; JSON has `status:"ok"`, `timestamp`, `build`
  (`buildNumber`, `deployedAt`, `commit`), `engine.status` is `idle`
  (no run started yet), `engine.circuit.tripped:false`.
- Cleanup: none. Record `build.commit` in the run log — after the refactor
  this must be the new commit, not the pre-refactor one.

## MT-SMOKE-02 — Health aggregate

- **Priority:** P0. **Type:** API.
- Steps: `curl -s $BASE/status/health`
- Expected: `200`; `status` is `ok`/`warning`/`error` with a `checks` map
  (device always present; litellm/ollamaCloud/harnesses may be `error`
  in credential-free environments — that alone is not a regression if the
  same checks failed pre-refactor; compare, don't absolutise).
- Cleanup: none.

## MT-SMOKE-03 — Agent discovery guide (the live contract)

- **Priority:** P0. **Type:** API. This is the contract agents code against.
- Steps:
  1. `curl -s $BASE/agent`
  2. `curl -s $BASE/agent/guide` (human/markdown form)
  3. `curl -s $BASE/agent/schema`
- Expected: all `200`. `/agent` JSON has `name:"KainBain"`, `version`,
  `apiBase` matching the host you called, `concepts`, `taskStatuses`
  (including `in_stage`, `waiting_human`, `running_agent`, `failed`,
  `completed`), `taskBlocking`, `stageTypes` (`agent`/`human`/`ci`/`merge`),
  and an `endpoints` list covering projects, tasks, compute, session,
  skills, docs, files, deploy, prompt-layout. `_links.guide/schema/openapi`
  present.
- Cleanup: none.
- Regression note: diff the post-refactor `/agent` endpoint list against
  a saved pre-refactor copy (`curl -s $BASE/agent > /tmp/agent-before.json`
  *before* the refactor). Any removed endpoint = FAIL unless intentional
  and documented.

## MT-SMOKE-04 — OpenAPI documentation

- **Priority:** P1. **Type:** API/UI.
- Steps: `curl -s -o /dev/null -w "%{http_code}\n" $BASE/documentation`;
  open `$BASE/documentation` in a browser (or `$UI` → system menu → Docs).
- Expected: `200`; Swagger UI loads and lists the route groups
  (projects/tasks/compute/session/…). No 500s.
- Cleanup: none.

## MT-SMOKE-05 — Config surface, secrets redacted

- **Priority:** P0. **Type:** API.
- Steps: `curl -s $BASE/status/config`; `curl -s $BASE/api/system/config-spec`
- Expected: both `200` and the same payload shape (alias). One entry per
  variable with value/default/type/group/source (`env|alias|default`).
  No entry exposes a raw secret value (keys/tokens redacted). `PORT`
  entry shows the scratch port on scratch, `3100` on live.
- Cleanup: none.

## MT-SMOKE-06 — Observability snapshot

- **Priority:** P1. **Type:** API.
- Steps: `curl -s "$BASE/status/observability"`;
  with a seeded project id: `curl -s "$BASE/status/observability?projectId=<id>"`
- Expected: `200`; health plus per-project metrics; unknown `projectId`
  gives a clean 4xx/empty result, never a 500/stack trace.
- Cleanup: none.
