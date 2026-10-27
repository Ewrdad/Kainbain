---
title: API reference
section: working-with
order: 80
slug: api-reference
---

# API Reference

Prose companion to the machine-readable OpenAPI spec served at `/documentation`
(Swagger UI). This article documents intent and usage for every REST route
group in `api/routes/*.js`: method, path, purpose, project scoping, and error
shapes. For exact request/response field lists, defer to the Swagger UI —
schemas live inline on each route and are the source of truth.

Owning modules are named per section so you can jump from a row below to the
code that implements it.

## Base URL and conventions

- Same origin serves API and frontend (default `http://localhost:3100`).
- JSON request/response bodies unless noted (`GET /docs/:slug` returns raw
  markdown; `/ws` is a websocket).
- No auth tokens. Browser `Origin` headers are allowlisted: loopback
  (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`) plus exact matches from
  `CORS_ALLOWED_ORIGINS` (comma-separated); origin-less clients (curl,
  server-to-server) are always allowed. There are no implicit `.home`, LAN, or
  Tailscale allowances — list every non-loopback origin explicitly. See
  `isAllowedCorsOrigin` in `api/index.js`.

## Project scoping and 404 semantics

Most routes take an optional `projectId` (query string on reads, body on
writes). `resolveProjectId` in `api/index.js` falls back to the active project
only when the caller omits `projectId`; a provided-but-unknown id resolves to
null and the handler returns `404 { error: "Project not found" }` instead of
operating on the wrong project. Always pass `projectId` explicitly — the
fallback exists for legacy clients and tests.

## Error envelope

- `404 { error: "Project not found" }` — unknown or unresolvable project.
- `404 { error: "Doc not found" }` — unknown docs slug.
- `409 { ok: false, error }` — deploy/rollback already running.
- `501` — harness without the capability (`guardSessionCapability`), e.g.
  context/compact/steer on minimal harnesses.

## Status (`api/routes/status.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/status` | Liveness + version summary. |
| GET | `/status/health` | Aggregate health checks (probes incl. harness). |
| GET | `/status/observability` | Observability snapshot (tasks/sessions summary). |
| GET | `/status/config` | Active configuration (values, defaults, sources; secrets redacted). |
| GET | `/api/system/config-spec` | Alias of `/status/config`. |

`activeTask` and queue items report the run's picked harness/model plus, for
alias runs, a separate `alias: { name, targetIndex }` (the alias behind the
run and the picked weighted-target index; `modelDetails.source` is `"alias"`
unless a live session was observed, which stays `"session"`).
Unknown/deleted/blank aliases report `alias: null` plus
`aliasMissing: "<name>"` with the fallback actually shown; non-alias runs
report `alias: null` / `aliasMissing: null`. Queued/idle picks are peek
previews of the next rotation slot (reads never consume an alias rotation
step); live-session values are actuals.

## Projects (`api/routes/projects.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/projects` | List projects. |
| POST | `/projects` | Create a project. |
| POST | `/projects/register` | Register/adopt an existing project directory (`{ path, name?, kainbainDirName? }`). Idempotent. |
| GET | `/projects/:id` | Get one project. |
| PATCH | `/projects/:id` | Update project fields, including the Retry & Timeouts overrides (`maxAutoIterations`, `maxTransientRetries`, `autoIterationEnabled`, `agentTimeoutMs`, `ciTimeoutMs`, `mergeTimeoutMs`; `null` clears one back to the global default). A persisted `deployTimeoutMs` still loads but is ignored — a deploy command follows `ciTimeoutMs`. |
| DELETE | `/projects/:id` | Delete a project. |
| POST | `/projects/:id/activate` | Set the active project. |
| GET | `/projects/:id/workflow` | Get the project's active workflow state. |
| PUT | `/projects/:id/workflow` | Replace the project's workflow state. |
| GET | `/projects/:id/workflows` | List saved workflows for the project. |
| POST | `/projects/:id/workflows` | Save a workflow for the project. |
| PATCH | `/projects/:id/workflows/:workflowId` | Update a saved workflow. |
| DELETE | `/projects/:id/workflows/:workflowId` | Delete a saved workflow. |
| POST | `/projects/:id/workflows/:workflowId/switch` | Switch the active workflow. |
| POST | `/projects/:id/workflow/jump` | Jump the active workflow to a stage. |
| POST | `/projects/:id/workflow/skip` | Skip the current workflow stage. |
| PATCH | `/projects/:id/app-status` | Set the project's "Go to App" link (`{ url, networkHost, status, healthEndpoint }`; partial updates merge, `url: null` clears). Broadcasts `APP_STATUS_UPDATED`. |
| GET | `/projects/:id/app-status/health` | Probe the project's app link (`url + healthEndpoint`) server-side; records `isHealthy`/`lastHealthCheck` and broadcasts `APP_STATUS_UPDATED`. |
| GET | `/projects/:id/aliases/reliability` | Per-alias model+harness target success rates for the project (infra failures count; deliberate agent stage-fails excluded). |

`modelAliases` on create/patch must satisfy the shared alias grammar (unique names, percents summing to 100) and must not pair a self-managed `none` harness (`muse`, `custom`) with a model — such rows are refused with a 400 naming the alias and harness. Blank models on `none` harnesses are the valid shape.

## Tasks (`api/work/taskWorkRoutes.js`, `api/flow/taskFlowRoutes.js`, `api/watch/taskWatchRoutes.js`)

Board lists return duration-enriched summaries; open one full task via
`GET /tasks/:id`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/tasks` | List tasks (`projectId`, optional `workflowId` query). |
| GET | `/tasks/queue` | Scheduled queue order for a project. |
| POST | `/tasks` | Create a task. |
| POST | `/tasks/preview` | Preview the curated prompt without creating a task. |
| GET | `/tasks/:id` | Full task detail. |
| PATCH | `/tasks/:id` | Update a task. |
| DELETE | `/tasks/:id` | Delete a task. |
| POST | `/tasks/:id/execute` | Execute the task's current stage. |
| POST | `/tasks/:id/advance` | Advance to the next stage. |
| POST | `/tasks/:id/follow-up` | Send a follow-up into the run. |
| POST | `/tasks/:id/steer` | D5 unified steer (ADR 0011, C2 impromptu-T0): guidance for the live execution — queued against the Runner lease for heartbeat pull + ack when a Runner holds the task, else steers the embedded session. |
| POST | `/tasks/:id/steer-ack` | Runner-only: ack one pulled steer exactly once. |
| GET | `/tasks/:id/steers` | Pending steers + ack receipts for one execution (`?executionId=`). |
| POST | `/tasks/:id/pause` | Pause execution. |
| POST | `/tasks/:id/resume` | Resume a paused task. |
| POST | `/tasks/:id/retry` | Retry the failed stage with a fresh attempt budget: auto-iteration and transient counters restart at zero and the stage clock re-enters. The last failure is preserved as context for the next attempt and clears once the stage consumes it. (Plain `execute` keeps counting from the current values.) |
| POST | `/tasks/:id/abort` | Abort the run. |
| POST | `/tasks/:id/failback` | Fail back to a previous stage. |
| POST | `/tasks/:id/reject` | Reject the current output. |
| POST | `/tasks/:id/move` | Move the task (board/stage). |
| POST | `/tasks/:id/jump` | Jump to a named stage. |
| POST | `/tasks/:id/complete` | Mark the task complete. |
| POST | `/tasks/:id/claim` | Runner-only: atomically claim a task (`x-runner-credential` header; 200 + lease or 409 + holder). |

## Runners (`api/flow/runnerRoutes.js`, `api/flow/runnerRegistry.js`)

Runner identity (D4, ADR 0009): join with the operator token, wait for human
approval, then heartbeat and claim with the issued per-Runner credential.

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/runners/register` | Join request (`runnerId`, `joinToken`, `facts`); 202 + `pending`. |
| POST | `/runners/heartbeat` | Capability/version refresh (`x-runner-credential` header). |
| GET | `/runners` | List registrations for the approval UI. |
| POST | `/runners/:id/approve` | Approve; issues the per-Runner credential. |
| POST | `/runners/:id/deny` | Deny a pending join request. |
| POST | `/runners/:id/revoke` | Revoke; the credential stops working immediately. |
| GET | `/runners/monitor` | Phase 2 monitor counters (stale rejections, divergences, unverifiable SHAs) plus `liveAssignments` per live lease for the multi-Runner UI. |
| POST | `/runners/:id/rotate` | WP-4.1 rotation: fresh credential for an active Runner, old one dies immediately; pending Runners 409. |
| POST | `/runners/dispatch` | Runner-only (WP-3.1/3.2/3.3): backend-routed dispatch poll; scan has a wait-based starvation guard; alias stages resolve through the shared backend-central smooth-WRR rotation (D3, attribution in `requirements.alias`); D8 concurrency caps (429 fleet-wide, `PROJECT_BUSY` per project); 200 `assigned` + lease, or 200 unassigned (`NO_CLAIMABLE_TASKS` / `NO_CLAIMABLE_MATCH` + miss histogram); 409 `STALE_RUNNER` when the Runner is stale. |
| POST | `/tasks/:id/progress` | Runner-only: record a stage lifecycle event keyed by execution ID (idempotent). |
| POST | `/tasks/:id/logs` | Runner-only: ingest one sequenced log frame (gaps marked, never hidden). |
| POST | `/tasks/:id/complete-execution` | Runner-only: idempotent completion with epoch fence and SHA check; releases the lease and applies the engine-owned finish (report, survey park, failure routing, advance). |
| POST | `/tasks/:id/claim-heartbeat` | Runner-only: renew a live claim mid-stage (extends the lease TTL; 409 `STALE_EPOCH` when superseded) so long harness runs keep their fence. |
| POST | `/tasks/:id/interrupt` | Runner-only: park a task as interrupted and drop its lease. |

## Engine containment (`api/flow/taskFlowRoutes.js`, `api/flow/circuitBreaker.js`)

The Tier-5 global circuit breaker. When the engine is tripped, **no task is
dispatched** except a single half-open canary probe; queued tasks stay
`in_stage` and no transient/auto-iteration budget is consumed. State persists
across restarts at `KAINBAIN_CIRCUIT_STATE_FILE` (default
`~/.kainbain/engine/circuit.json`). Trip/reset broadcast `ENGINE_STATE` plus a
`NOTIFICATION` toast. See `docs/circuit-breaker-runbook.md`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/engine/state` | Global engine + containment snapshot (`circuit.tripped`, reason, source, `trippedAt`, canary, scheduler stats). Un-scoped: containment is host-wide. |
| POST | `/engine/trip` | Operator emergency stop. Body `{ reason, operator? }`; `reason` is required (400 otherwise). |
| POST | `/engine/reset` | Lift containment. Body `{ reason, operator? }`; `reason` is required and logged/broadcast (400 otherwise). |
| GET | `/tasks/:id/logs` | Task logs, one feed per call: `?feed=main\|thinking\|tools` (default `main`) and `?format=entries\|text` (default `entries`). Structured entries (`task.logEntries`) are the only stored log representation — `format=text` is a derived view rendered at read time, and legacy `processLogs` text is no longer stored or persisted. **Read logs through this endpoint rather than scraping rendered text.** |
| POST | `/tasks/:id/stuck-check` | Run the stuck checker for the task. |
| GET | `/tasks/:id/reports` | Stage reports for the task. |
| POST | `/tasks/:id/report` | Submit a stage report. |
| GET | `/tasks/:id/survey` | Read the task's question-me survey (`SURVEY.md` by default, or the configured `outputFile`) rounds, file status, missing required questions. Query `?projectId=` and optional `?file=` (safe basename, normalized). Response includes `outputFile`. |
| POST | `/tasks/:id/survey` | Save survey answers (merge-only: `{ projectId, answers }`) or skip (`{ projectId, action: 'skip' }`). Partial saves stay parked; a complete submit advances the task. Optional `file`/`outputFile` override and response include `outputFile`. |

## Sessions (`api/routes/sessions.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/session/status` | Agent running state for the session. |
| POST | `/session/restore` | Restore a session. |
| GET | `/session/history` | Message history. |
| GET | `/session/tree` | Session tree (branches/forks). |
| POST | `/session/navigate` | Navigate the session tree. |
| POST | `/session/fork` | Fork the session. |

## Agent (`api/routes/agent.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/agent` | Agent status for the project session. |
| GET | `/agent/guide` | Agent guide (prompt/contract for harnesses). |
| GET | `/agent/schema` | Agent JSON schema. |

## Skills (`api/routes/skills.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/skills` | List registered skills. |
| GET | `/skills/:name` | Get one skill by name. |
| POST | `/projects/:id/skills/import` | Import one custom skill from a `.md` file or single-skill `.zip` (multipart `file` field; optional `name` slug override and `overwrite=true` text fields) into the project's overlay. Returns `201 { skills, warnings }`; `400` validation/zip-guard details, `404` unknown project, `409` name clash (retry with `overwrite=true`), `413` over the `KAINBAIN_SKILL_IMPORT_MAX_BYTES` cap. Failures write nothing. |
| DELETE | `/projects/:id/skills/:name` | Delete one project-overlay skill. Global defaults are read-only (`404` with a descriptive error). |

Import contract: slug rule `/^[a-z0-9][a-z0-9-]*$/`; slug derives from the
explicit `name`, else frontmatter `name`, else the sanitized filename; the
description falls back to the first `#` heading, else a generated placeholder —
every normalization is reported in `warnings[]`. Zip layouts: `SKILL.md` at the
root, or exactly one top-level `<folder>/` holding `SKILL.md`, each with an
optional sibling `KB_config.json`; anything else (multi-skill zips, traversal
entries, symlinks, oversized contents) is rejected. Importing a global skill's
name is allowed but flagged (`shadows a KainBain default skill`).

## Harnesses (`api/routes/harnesses.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/harnesses` | Harness roster (pi, antigravity, opencode). |
| GET | `/harnesses/:id/models` | Models available on one harness. |
| GET | `/harnesses/reliability` | Per-harness success rates (infra failures count; deliberate agent stage-fails excluded). |

## Compute (`api/routes/compute.js`)

Optional-surface calls degrade to `501` on harnesses without the capability.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/compute/models` | Available models. |
| GET | `/compute/status` | Compute/started state. |
| POST | `/compute/start` | Start the session compute. |
| POST | `/compute/stop` | Stop compute and dispose the session. |
| GET | `/compute/context` | Context usage `{ current, limit }`. |
| POST | `/compute/compact` | Compact session context. |
| POST | `/compute/steer` | Steer the running session. |
| POST | `/compute/follow-up` | Send a follow-up message. |

Test utility (no guard — registered in all envs, intended for test harnesses):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/test/reset` | Dispose the session and clear all tasks for a project. |

## Workflows (`api/routes/workflows.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/workflows` | List registered workflow definitions. |
| POST | `/workflows/start` | Start a workflow run. |

## Files (`api/routes/files.js`)

Paths are repo-relative and safety-checked (`isPathSafe`); traversal escapes
are rejected.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/projects/:id/files` | List directory entries for a project path (each entry carries `kind` and `mime`). |
| GET | `/projects/:id/files/content` | Read one project file's content (UTF-8 text; images and binaries answer `415` with a `previewUrl`). |
| GET | `/projects/:id/files/raw` | Serve one project file's exact bytes (`inline`, `nosniff`; SVG adds a `sandbox` CSP; files over 15 MB answer `413`). |

## Task images (`api/routes/taskImages.js`)

Image assets live in `docs/tasks/<taskId>/assets/` and are referenced from
task markdown with relative paths (`![alt](assets/<name>)`). Uploads are
multipart with an extension allowlist, a per-file size cap and a per-task
count cap; serving is binary-safe with an explicit Content-Type.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/projects/:id/tasks/:taskId/images` | Upload one image (`image` file field) into the task's `assets/` folder. |
| GET | `/projects/:id/tasks/:taskId/images` | List the task's image assets. |
| GET | `/projects/:id/tasks/:taskId/images/:name` | Serve one image binary-safe (`inline`, `nosniff`). |
| DELETE | `/projects/:id/tasks/:taskId/images/:name` | Delete one image asset. |

## Review (`api/routes/review.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/projects/:projectId/tasks/:taskId/review` | Get the task review state. |
| POST | `/projects/:projectId/tasks/:taskId/review/comments` | Add a review comment. |
| PATCH | `/projects/:projectId/tasks/:taskId/review/comments/:commentId` | Update a comment. |
| DELETE | `/projects/:projectId/tasks/:taskId/review/comments/:commentId` | Delete a comment. |
| POST | `/projects/:projectId/tasks/:taskId/review/comments/:commentId/replies` | Reply to a comment. |

## Retrospective (`api/routes/retrospective.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/retrospective/chat` | One stateless retrospective chat turn (`{ messages, taskIds?, harness?, model?, strictTaskIds?, turnId? }` → `{ reply, suggestions, harness, model, modelRequested, unknownTaskIds, contextTaskIds, contextTruncated, contextChars, output? }`, where `output` is the bounded (2000-char) tail of assistant text observed during the turn, also present on 502/504 bodies when anything streamed; when the client sends a `turnId`, streamed deltas are also broadcast live as `CHAT_PROGRESS` WebSocket frames (`{ turnId, tail }`, throttled) and the HTTP settle stays the done signal; input caps 50 messages / 8000 chars per message / 40000 transcript chars; 501 `unsupported_by_harness` when the harness cannot chat; 400 `chat_input_too_large` on oversized input; 404 `task_not_found` when all task ids are unknown (or any, with `strictTaskIds: true`); 502 `chat_prompt_failed` when the model errors; chat turns run with no timeout by default — they settle when the model answers or when the caller cancels (a 504 `chat_prompt_timeout` only occurs when an operator re-imposes an opt-in server ceiling via `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS`, default `0` = disabled; keep `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS`, default `0` = disabled, above any opt-in ceiling or long turns die with a bare 408; reverse proxies may still impose their own idle ceilings); never creates tasks). |

## Deploy (`api/routes/deploy.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/deploy/status` | Deploy manager status. |
| POST | `/deploy` | Trigger a self-deploy (`{ fast: true }` skips tests/scans; 409 when busy). |
| POST | `/deploy/rollback` | Roll back to the last known-good deployment. |
| GET | `/deploy/log` | Tail of the deploy log (`?maxLines`, default 200). |
| GET | `/deploy/changelog` | Baked Kainbain changelog, newest first (`?limit`, default 100; `changelog: null` with `reason: "not-baked"`/`"generation-failed"` when unavailable). |

## Docs (`api/routes/docs.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/docs` | Index JSON `{ sections, docs }` of all articles. |
| GET | `/docs/:slug` | One article as raw markdown (`text/markdown`). |

## Realtime (`api/routes/ws.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/ws` | Websocket relay for live events (task updates, logs, deploy output). Connect with `ws`; the frontend's transport falls back to polling on failure. |

## Push notifications (`api/routes/push.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/push/vapid-key` | Return the VAPID public key for Web Push subscriptions. |
| GET | `/push/settings` | Get current push notification settings and trigger preferences. |
| PUT | `/push/settings` | Update push notification settings (triggers, enabled). |
| POST | `/push/subscribe` | Register or update a browser Web Push subscription. |
| POST | `/push/unsubscribe` | Unregister a browser Web Push subscription by endpoint. |
| POST | `/push/subscription-status` | Check whether a subscription endpoint is registered (`{ endpoint }` → `{ ok, registered }`; 400 on an invalid endpoint). |
| POST | `/push/test` | Dispatch a test push notification to all active subscribers. |
| GET | `/push/status` | Push notification configuration status and subscriber count. |

Web Push follows the W3C Push API / Web Push Protocol (RFC 8030). The
browser Service Worker (`frontend/public/sw.js`, served as `/sw.js`) shows
system-level notifications even with all KainBain tabs closed, and clicking
one focuses or opens the client. Push requires a secure context (HTTPS or
localhost); unsupported browsers get a guidance hint in System Settings
(`#/system-settings` → Notifications) instead of controls.

VAPID keys are generated lazily on first use into `~/.kainbain/push/push-vapid.json`
(mode `0600`), or supplied via `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` with
contact subject `VAPID_SUBJECT` (`mailto:` or URL, also settable as the
`vapidSubject` server config). Subscriptions persist in
`~/.kainbain/push/push-subscriptions.json` and preferences in
`~/.kainbain/push/push-settings.json`; dead endpoints (HTTP 404/410 from the
browser push service) are pruned automatically on send.

Two triggers exist today, each with a per-trigger toggle in System Settings
(the standalone `#/system-settings` screen → Notifications tab) under the
`KAINBAIN_PUSH_NOTIFICATIONS_ENABLED` master switch:

- Queue empty: fires once when the scheduler transitions from dispatching to
  zero runnable candidates (latched, so idle polling ticks never spam). A
  short debounce re-checks the queue before notifying, so a stage handover
  never triggers it; when only human-checkpoint work remains the body says
  how many tasks are waiting for human input.
- Stage error needing human intervention: fires when a stage parks with an
  unrecoverable error (bad credentials, quota, refused connection, exhausted
  retries). Normal CI exit-code failures and deliberate agent fail verdicts
  auto-iterate or fail back through the normal workflow and never alert.

`PUT /push/settings` accepts a partial `{ enabled, triggers: {
queueEmpty, unrecoverableStageError } }` patch. The settings object reserves a
`stages` namespace for future per-stage overrides.

## Prompt layout (`api/routes/promptLayout.js`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/settings/prompt-layout` | Get current prompt layout, whether factory default is active, any token warnings, and consecutive fallback count. |
| PUT | `/settings/prompt-layout` | Save a new default prompt layout markdown template (`{ layout }`). Validates mandatory stage-contract tokens and unknown tokens (returns 400 on violations). |
| POST | `/settings/prompt-layout/reset` | Reset prompt layout back to the factory default template and clear fallback counters. |
| POST | `/settings/prompt-layout/dry-run` | Validate and test-render a candidate layout against sample or provided task/stage context (`{ layout?, taskId?, stageId? }` → `{ renderedMarkdown, warnings, autoReinjected, fallbackUsed }`) without persisting. |


