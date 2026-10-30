/***
 * MARK: agentGuide
 * @description Single source of truth for the machine-readable agent guide served
 *   by GET /agent. This is the entry point a non-KainBain AI agent uses to learn
 *   how to discover projects, create/view/manage tasks, and subscribe to live
 *   events, so it can integrate with KainBain without reading the source code.
 *
 * The data lives here (not inline in the route) so it is unit-testable and so the
 * route handler stays a thin HTTP layer, matching the project's layering
 * conventions.
 *
 * @example import { AGENT_GUIDE } from './agentGuide.js'
 ***/

import { config } from "./config.js";

/***
 * MARK: API_BASE
 * @description The origin a remote agent should use. Localhost in development;
 *   production serves the API behind nginx at https://kainbain.home (same origin
 *   as the UI). Validated from PUBLIC_KB_URL by the config schema.
 * @example API_BASE => 'http://localhost:3100'
 ***/
export const API_BASE = config.publicKbUrl;

/***
 * MARK: BASE_PATH_PREFIX
 * @description Most resource routes are grouped under a stable path. Kept here so
 *   the guide can be regenerated consistently.
 * @example BASE_PATH_PREFIX => '/'
 ***/
export const BASE_PATH_PREFIX = "/";

/***
 * MARK: ENDPOINTS
 * @description The full catalog of HTTP endpoints an agent may call. Each entry
 *   records the method, path, purpose, and the request/response body fields the
 *   agent should send/expect. `projectId` is optional everywhere: when omitted
 *   the API falls back to the currently active project.
 * @example ENDPOINTS[0] => { method: 'GET', path: '/projects', ... }
 ***/
export const ENDPOINTS = [
	// ---- Discovery & health -------------------------------------------------
	{
		method: "GET",
		path: "/status",
		purpose:
			"Global health, engine snapshot, and build info. Engine.status is 'idle' when no agent stage is running and 'running' during execution; engine.activeTaskId identifies the current task.",
		body: null,
	},
	{
		method: "GET",
		path: "/status/observability",
		purpose:
			"Health plus per-project observability metrics (optional ?projectId, ?refresh=true).",
		body: null,
	},
	{
		method: "GET",
		path: "/status/config",
		purpose:
			"Active configuration: one entry per variable with value, default, type, group, and source (env|alias|default); secrets redacted.",
		body: null,
	},
	{
		method: "GET",
		path: "/api/system/config-spec",
		purpose: "Alias of /status/config (same payload).",
		body: null,
	},
	// ---- Projects -----------------------------------------------------------
	{
		method: "GET",
		path: "/projects",
		purpose: "List every project with its id, name, cwd, and stages.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id",
		purpose: "Fetch one project including its workflow stages.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects",
		purpose: "Create a project. Requires a name; stages/model optional.",
		body: { name: "string (required)", cwd: "string", stages: "object[]" },
	},
	{
		method: "PATCH",
		path: "/projects/:id",
		purpose: "Update a project (name, stages, defaults).",
		body: { name: "string", stages: "object[]" },
	},
	{
		method: "POST",
		path: "/projects/:id/activate",
		purpose: "Mark a project as the active default for omitting projectId.",
		body: null,
	},
	{
		method: "PATCH",
		path: "/projects/:id/app-status",
		purpose:
			"Point the project's 'Go to App' link at a running dev server. Partial updates merge; url null clears the link. Broadcasts APP_STATUS_UPDATED.",
		body: {
			url: "string (absolute http(s), e.g. http://localhost:5173)",
			networkHost: "string (LAN override for loopback, e.g. home.home)",
			status: "running|starting|degraded|stopped",
			healthEndpoint: "string (e.g. /health)",
		},
	},
	{
		method: "GET",
		path: "/projects/:id/app-status/health",
		purpose:
			"Probe the project's app link server-side (url + healthEndpoint) and record isHealthy/lastHealthCheck on the link. Broadcasts APP_STATUS_UPDATED.",
		body: null,
	},
	// ---- Workflow / stages ---------------------------------------------------
	{
		method: "GET",
		path: "/projects/:id/workflow",
		purpose:
			"Return the project's stages, currentStageId, activeWorkflowId, and workflows.",
		body: null,
	},
	{
		method: "PUT",
		path: "/projects/:id/workflow",
		purpose: "Replace the project's stage list. Body: { stages: [...] }.",
		body: { stages: "object[] (required)" },
	},
	{
		method: "GET",
		path: "/projects/:id/workflows",
		purpose: "List named workflows for a project.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/workflows",
		purpose: "Create a named workflow. Body: { name, stages }.",
		body: { name: "string (required)", stages: "object[]" },
	},
	// ---- Tasks ---------------------------------------------------------------
	{
		method: "GET",
		path: "/tasks",
		purpose:
			"List tasks for a project (defaults to the active project). Optional ?workflowId to filter.",
		body: null,
	},
	{
		method: "GET",
		path: "/tasks/queue",
		purpose: "Return the scheduled execution queue in priority order.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/preview",
		purpose:
			"Return the curated prompt a task WOULD get, without creating or executing it. Body: { goal, projectId, stageId }.",
		body: { goal: "string (required)", projectId: "string", stageId: "string" },
	},
	{
		method: "POST",
		path: "/tasks",
		purpose:
			"Create a task. Set execute:true to dispatch it to the AI agent queue immediately, or followUp:true to prompt the running session. idempotencyKey prevents duplicate creation.",
		body: {
			title: "string",
			goal: "string (required unless title)",
			projectId: "string",
			stageId: "string",
			workflowId: "string",
			execute: "boolean",
			followUp: "boolean",
			idempotencyKey: "string",
			blockedBy: "string[]",
		},
	},
	{
		method: "GET",
		path: "/tasks/:id",
		purpose:
			"Fetch one task. Pass projectId as ?projectId or in the body to target a specific project.",
		body: null,
	},
	{
		method: "PATCH",
		path: "/tasks/:id",
		purpose:
			"Edit a task's title, goal, status, or blockedBy. Sending stageId moves the task between stages.",
		body: {
			title: "string",
			goal: "string",
			status: "string",
			blockedBy: "string[]",
			stageId: "string",
		},
	},
	{
		method: "DELETE",
		path: "/tasks/:id",
		purpose: "Delete a task.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/execute",
		purpose: "Run the current stage of a task (agent, ci/script, human).",
		body: { priority: "'normal' | 'high'" },
	},
	{
		method: "POST",
		path: "/tasks/:id/advance",
		purpose:
			"Approve and advance a task to its next stage. Optional guidance is appended to the goal.",
		body: { guidance: "string" },
	},
	{
		method: "POST",
		path: "/tasks/:id/reject",
		purpose:
			"Reject a task with human feedback and fail it back to the previous stage. Feedback is required.",
		body: { feedback: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/failback",
		purpose:
			"Route a task back to a specific earlier stage (or a stage in the workflow).",
		body: { fallbackStageId: "string" },
	},
	{
		method: "POST",
		path: "/tasks/:id/move",
		purpose: "Move a task to a specific stage.",
		body: { stageId: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/jump",
		purpose: "Move a task non-linearly to any stage.",
		body: { stageId: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/complete",
		purpose: "Mark a task complete.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/claim",
		purpose:
			"Runner-only: atomically claim a task (200 + lease { executionId, epoch } or 409 + holder). Requires the x-runner-credential header.",
		body: { projectId: "string (required)" },
	},
	// ---- Runners (D4, ADR 0009) -------------------------------------------
	{
		method: "POST",
		path: "/runners/register",
		purpose:
			"Runner join request with the operator join token; pending until approved.",
		body: { runnerId: "string (required)", joinToken: "string (required)", facts: "object" },
	},
	{
		method: "POST",
		path: "/runners/heartbeat",
		purpose:
			"Runner capability/version refresh. Requires the x-runner-credential header.",
		body: { runnerId: "string (required)", facts: "object" },
	},
	{
		method: "GET",
		path: "/runners",
		purpose: "List Runner registrations for the approval UI.",
		body: null,
	},
	{
		method: "GET",
		path: "/runners/monitor",
		purpose: "Phase 2 monitor counters (progress/log ingest, stale rejections, divergences, unverifiable SHAs) plus WP-3.4 liveAssignments (runnerId, projectId, taskId, epoch per live lease) for the multi-Runner UI.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/rotate",
		purpose:
			"WP-4.1 fleet credential rotation rehearsal: issues a fresh credential for an ACTIVE Runner, invalidating the old one immediately (401 everywhere). Pending Runners 409 (ROTATE_INVALID_STATE). Rotate idle Runners; in-flight leases are epoch-fenced and keep working.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/dispatch",
		purpose:
			"Runner-only (WP-3.1/3.2/3.3): backend-routed dispatch poll — scan claimable tasks (starvation guard past KAINBAIN_DISPATCH_MAX_WAIT_MS), resolve alias stages through the shared backend-central smooth-WRR rotation (D3; attribution stamped as requirements.alias), enforce D8 concurrency caps (429 fleet-wide, PROJECT_BUSY per project), match against this Runner's capabilities, and claim-fence the winner (200 assigned + lease, or 200 unassigned with NO_CLAIMABLE_TASKS / NO_CLAIMABLE_MATCH + miss histogram). Stale Runners get 409 STALE_RUNNER. Requires the x-runner-credential header.",
		body: { projectIds: "string[] (optional allowlist)" },
	},
	{
		method: "POST",
		path: "/runners/integration/acquire",
		purpose:
			"Runner-only: lease the head queued integration for a project + target branch (200 leased + executionId/epoch, 200 unassigned when the queue is empty, 409 INTEGRATION_BUSY when a live lease is held). Requires the x-runner-credential header.",
		body: { projectId: "string (required)", targetBranch: "string (required)" },
	},
	{
		method: "POST",
		path: "/runners/integration/heartbeat",
		purpose:
			"Runner-only: renew a live integration lease (409 STALE_EPOCH when superseded). Requires the x-runner-credential header.",
		body: { projectId: "string (required)", targetBranch: "string (required)", executionId: "string (required)", epoch: "number (required)" },
	},
	{
		method: "POST",
		path: "/runners/integration/report",
		purpose:
			"Runner-only: record a terminal integration report (outcome landed|conflict|stale-head|needs-sync|failed; idempotent re-reports, stale executions rejected). Requires the x-runner-credential header.",
		body: { projectId: "string (required)", targetBranch: "string (required)", executionId: "string (required)", epoch: "number (required)", outcome: "string (required)" },
	},
	{
		method: "GET",
		path: "/runners/integration",
		purpose: "Per-scope integration queue depth, live lease, and global lease counters for the multi-Runner UI.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/verify-sha",
		purpose:
			"Runner-only: confirm a reported push SHA against a fresh fetch (claim-lease fenced; refuted SHAs park visibly). Requires the x-runner-credential header.",
		body: { projectId: "string (required)", executionId: "string (required)", epoch: "number (required)", sha: "string (required)", present: "boolean" },
	},
	{
		method: "POST",
		path: "/tasks/:id/progress",
		purpose:
			"Runner-only: record a stage lifecycle event keyed by execution ID (idempotent; stale epochs rejected). Requires the x-runner-credential header.",
		body: { executionId: "string (required)", epoch: "number (required)", stageId: "string (required)", event: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/logs",
		purpose:
			"Runner-only: ingest one sequenced log frame (gaps marked, never hidden). Requires the x-runner-credential header.",
		body: { executionId: "string (required)", epoch: "number (required)", seq: "number (required)", bytes: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/complete-execution",
		purpose:
			"Runner-only: idempotent execution completion with epoch fence and SHA presence check (records the report, releases the lease, applies the engine-owned finish: report, survey park, failure routing, advance). Requires the x-runner-credential header.",
		body: { executionId: "string (required)", epoch: "number (required)", outcome: "passed|failed" },
	},
	{
		method: "POST",
		path: "/tasks/:id/claim-heartbeat",
		purpose:
			"Runner-only: renew a live claim mid-stage (extends the lease TTL; 409 STALE_EPOCH when superseded) so long harness runs keep their fence. Requires the x-runner-credential header.",
		body: { projectId: "string (required)", executionId: "string (required)", epoch: "number (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/interrupt",
		purpose:
			"Runner-only: park a task as interrupted and drop its lease (kill-mid-stage path; re-queues via startup recovery). Requires the x-runner-credential header.",
		body: { executionId: "string (optional)" },
	},
	{
		method: "POST",
		path: "/runners/:id/approve",
		purpose: "Approve a pending Runner; issues its per-Runner credential.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/deny",
		purpose: "Deny a pending Runner join request.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/revoke",
		purpose:
			"Revoke a Runner; its credential stops working immediately and leases expire.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/pause",
		purpose:
			"Pause an active Runner; it keeps heartbeating but takes no new tasks (claim and dispatch-match fail fast with 409 RUNNER_PAUSED). Idempotent.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/resume",
		purpose:
			"Clears the pause flag so the Runner picks up new tasks again. Idempotent: resuming an unpaused Runner is a no-op success.",
		body: null,
	},
	{
		method: "POST",
		path: "/runners/:id/skip",
		purpose:
			"Operator skip: advance the task this Runner currently holds past its stage and release the lease (in-flight Runner reports land stale). 404 when the Runner is unknown or holds nothing; 409 when its task is already on the last stage.",
		body: null,
	},
	{
		method: "GET",
		path: "/runners/:id/config",
		purpose:
			"Operator-owned Runner configuration for the System Settings Runner screen (display name, tool filter, job-type switches, directories, project override). No Runner credential needed.",
		body: null,
	},
	{
		method: "PATCH",
		path: "/runners/:id/config",
		purpose:
			"Update one Runner's operator-owned configuration (partial object: displayName, availableTools, jobTypes, directories, projectScope). Heartbeat facts are never touched. 400 on invalid fields, 404 on unknown Runner.",
		body: {
			displayName: "string (optional, null resets)",
			jobTypes: "object (optional, boolean runsCi/runsMerges/runsImpromptu)",
			directories: "object (optional, non-empty masterDir/worktreeDir)",
			availableTools: "array (optional, subset of advertised ids, null resets)",
			projectScope: "array (optional, project ids, null serves all)",
		},
	},
	{
		method: "POST",
		path: "/tasks/:id/pause",
		purpose: "Pause an in-progress or queued task.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/resume",
		purpose: "Resume a paused/interrupted task and dispatch its stage.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/retry",
		purpose:
			"Retry a failed/aborted/rejected stage; the stage prompt is freshly curated.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/abort",
		purpose: "Abort active execution for a task and reset the engine to idle.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/follow-up",
		purpose:
			"Inject follow-up guidance into a task and dispatch to the running session.",
		body: { prompt: "string (required)" },
	},
	{
		method: "POST",
		path: "/tasks/:id/steer",
		purpose:
			"D5 unified steer (ADR 0011, C2 impromptu-T0 channel): guidance for the LIVE execution — queued against the Runner lease for heartbeat pull + ack when a Runner holds the task (returns steerId, via runner), else steers the embedded session. Body: { guidance } or { goal }.",
		body: { guidance: "string" },
	},
	{
		method: "POST",
		path: "/tasks/:id/steer-ack",
		purpose:
			"Runner-only: ack one pulled steer exactly once (ok or UNSUPPORTED_HARNESS NACK). Requires the x-runner-credential header.",
		body: { executionId: "string (required)", epoch: "number (required)", steerId: "string (required)", ok: "boolean" },
	},
	{
		method: "GET",
		path: "/tasks/:id/steers",
		purpose:
			"Read pending steers + ack receipts for one execution (?executionId=). Operator/UI read-back for steering delivery.",
		body: null,
	},
	{
		method: "GET",
		path: "/tasks/:id/reports",
		purpose: "List the stage reports (artifacts) produced for a task.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/report",
		purpose: "Save a stage report for a task. Body: { stageName, content }.",
		body: { stageName: "string", content: "string" },
	},
	{
		method: "GET",
		path: "/tasks/:id/survey",
		purpose:
			"Read a task's question-me survey (SURVEY.md rounds, status, missing required questions). Query: ?projectId=.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/survey",
		purpose:
			"Save survey answers (merge-only) and advance when complete. Body: { projectId, answers } or { projectId, action: 'skip' }.",
		body: { projectId: "string" },
	},
	// ---- Compute / model discovery ------------------------------------------
	{
		method: "GET",
		path: "/compute/models",
		purpose:
			"List the models available to run agent stages (?refresh=true to bypass cache).",
		body: null,
	},
	{
		method: "GET",
		path: "/compute/status",
		purpose: "Whether any compute sessions are active.",
		body: null,
	},
	{
		method: "POST",
		path: "/compute/start",
		purpose: "Start a session for a project.",
		body: { projectId: "string" },
	},
	{
		method: "POST",
		purpose: "Stop sessions and cancel queued executions for a project.",
		path: "/compute/stop",
		body: { projectId: "string" },
	},
	{
		method: "POST",
		path: "/compute/steer",
		purpose: "Steer the active session with a goal.",
		body: { goal: "string (required)" },
	},
	{
		method: "POST",
		path: "/compute/follow-up",
		purpose: "Send a follow-up goal to the live session.",
		body: { goal: "string (required)" },
	},
	// ---- Session history ------------------------------------------------------
	{
		method: "GET",
		path: "/session/history",
		purpose:
			"Full message + tool history for a project's session (use after a reconnect).",
		body: null,
	},
	{
		method: "GET",
		path: "/session/tree",
		purpose: "Return the session's branching message tree.",
		body: null,
	},
	{
		method: "GET",
		path: "/session/status",
		purpose: "Session activity + disk-persistence diagnostics.",
		body: null,
	},
	{
		method: "POST",
		path: "/session/fork",
		purpose: "Branch the session at a tree entry. Body: { entryId }.",
		body: { entryId: "string (required)" },
	},
	{
		method: "POST",
		path: "/session/navigate",
		purpose: "Move the session leaf to a tree entry. Body: { targetId }.",
		body: { targetId: "string" },
	},
	// ---- Stage skills -------------------------------------------------------------
	{
		method: "GET",
		path: "/skills",
		purpose:
			"List the stage-skill packages available for prompt injection (global library + optional project overlay when ?projectId is given). Skills are user-authored markdown (SKILL.md) plus an optional tolerant KB_config.json.",
		body: null,
	},
	{
		method: "GET",
		path: "/skills/:name",
		purpose:
			"Fetch one skill's raw SKILL.md content and parsed KB_config (?projectId optional for the project overlay). Used to preview or self-read an option-mode skill.",
		body: null,
	},
	// ---- Site docs (agent knowledge base) ---------------------------------------
	{
		method: "GET",
		path: "/docs",
		purpose:
			"List the markdown knowledge-base articles (site Docs section): [{ slug, title, section, order }]. Sections are 'how-it-works' and 'working-with'.",
		body: null,
	},
	{
		method: "GET",
		path: "/docs/:slug",
		purpose:
			"Fetch one knowledge-base article as raw markdown (Content-Type text/markdown). Same source the Docs UI renders.",
		body: null,
	},
	// ---- Files ------------------------------------------------------------------
	{
		method: "GET",
		path: "/projects/:id/files",
		purpose: "List directory entries inside a project. Optional ?path= subpath.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/files/content",
		purpose:
			"Read a file's UTF-8 content inside a project (path-traversal guarded). Requires ?path=.",
		body: null,
	},
	// ---- Deploy -------------------------------------------------------------------
	{
		method: "GET",
		path: "/deploy/status",
		purpose: "Self-deploy status, last result, and rollback history.",
		body: null,
	},
	{
		method: "POST",
		path: "/deploy",
		purpose:
			"Trigger a production self-deploy. Body: { fast: true } to skip tests.",
		body: { fast: "boolean" },
	},
	{
		method: "POST",
		path: "/deploy/rollback",
		purpose: "Roll back to the last known-good deployment.",
		body: null,
	},
	// ---- Registered routes added by docs parity -----------------------------------
	{
		method: "GET",
		path: "/deploy/log",
		purpose: "Tail of the deploy log (`?maxLines`, default 200).",
		body: null,
	},
	{
		method: "GET",
		path: "/deploy/changelog",
		purpose: "Baked Kainbain changelog, newest first (`?limit`, default 100; `changelog: null` with `reason: \"not-baked\"`/`\"generation-failed\"` when unavailable).",
		body: null,
	},
	{
		method: "GET",
		path: "/status/health",
		purpose: "Aggregate health checks (probes incl. harness).",
		body: null,
	},
	{
		method: "POST",
		path: "/session/restore",
		purpose: "Restore a session.",
		body: null,
	},
	{
		method: "GET",
		path: "/settings/prompt-layout",
		purpose: "Get current prompt layout, whether factory default is active, any token warnings, and consecutive fallback count.",
		body: null,
	},
	{
		method: "PUT",
		path: "/settings/prompt-layout",
		purpose: "Save a new default prompt layout markdown template (`{ layout }`). Validates mandatory stage-contract tokens and unknown tokens (returns 400 on violations).",
		body: null,
	},
	{
		method: "POST",
		path: "/settings/prompt-layout/reset",
		purpose: "Reset prompt layout back to the factory default template and clear fallback counters.",
		body: null,
	},
	{
		method: "POST",
		path: "/settings/prompt-layout/dry-run",
		purpose: "Validate and test-render a candidate layout against sample or provided task/stage context (`{ layout?, taskId?, stageId? }` \u2192 `{ renderedMarkdown, warnings, autoReinjected, fallbackUsed }`) without persisting.",
		body: null,
	},
	{
		method: "GET",
		path: "/agent",
		purpose: "Agent status for the project session.",
		body: null,
	},
	{
		method: "GET",
		path: "/agent/guide",
		purpose: "Agent guide (prompt/contract for harnesses).",
		body: null,
	},
	{
		method: "GET",
		path: "/agent/schema",
		purpose: "Agent JSON schema.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/register",
		purpose: "Register/adopt an existing project directory (`{ path, name?, kainbainDirName? }`). Idempotent.",
		body: null,
	},
	{
		method: "DELETE",
		path: "/projects/:id",
		purpose: "Delete a project.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/aliases/reliability",
		purpose: "Per-alias model+harness target success rates for the project (infra failures count; deliberate agent stage-fails excluded).",
		body: null,
	},
	{
		method: "PATCH",
		path: "/projects/:id/workflows/:workflowId",
		purpose: "Update a saved workflow.",
		body: null,
	},
	{
		method: "DELETE",
		path: "/projects/:id/workflows/:workflowId",
		purpose: "Delete a saved workflow.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/workflows/:workflowId/switch",
		purpose: "Switch the active workflow.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/workflow/jump",
		purpose: "Jump the active workflow to a stage.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/workflow/skip",
		purpose: "Skip the current workflow stage.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/files/raw",
		purpose: "Serve one project file's exact bytes (`inline`, `nosniff`; SVG adds a `sandbox` CSP; files over 15 MB answer `413`).",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/tasks/:taskId/images",
		purpose: "Upload one image (`image` file field) into the task's `assets/` folder.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/tasks/:taskId/images",
		purpose: "List the task's image assets.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/tasks/:taskId/images/:name",
		purpose: "Serve one image binary-safe (`inline`, `nosniff`).",
		body: null,
	},
	{
		method: "DELETE",
		path: "/projects/:id/tasks/:taskId/images/:name",
		purpose: "Delete one image asset.",
		body: null,
	},
	{
		method: "GET",
		path: "/projects/:id/tasks/:taskId/review",
		purpose: "Get the task review state.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/tasks/:taskId/review/comments",
		purpose: "Add a review comment.",
		body: null,
	},
	{
		method: "PATCH",
		path: "/projects/:id/tasks/:taskId/review/comments/:commentId",
		purpose: "Update a comment.",
		body: null,
	},
	{
		method: "DELETE",
		path: "/projects/:id/tasks/:taskId/review/comments/:commentId",
		purpose: "Delete a comment.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/tasks/:taskId/review/comments/:commentId/replies",
		purpose: "Reply to a comment.",
		body: null,
	},
	{
		method: "POST",
		path: "/projects/:id/skills/import",
		purpose: "Import one custom skill from a `.md` file or single-skill `.zip` (multipart `file` field; optional `name` slug override and `overwrite=true` text fields) into the project's overlay. Returns `201 { skills, warnings }`; `400` validation/zip-guard details, `404` unknown project, `409` name clash (retry with `overwrite=true`), `413` over the `KAINBAIN_SKILL_IMPORT_MAX_BYTES` cap. Failures write nothing.",
		body: null,
	},
	{
		method: "DELETE",
		path: "/projects/:id/skills/:name",
		purpose: "Delete one project-overlay skill. Global defaults are read-only (`404` with a descriptive error).",
		body: null,
	},
	{
		method: "GET",
		path: "/push/vapid-key",
		purpose: "Return the VAPID public key for Web Push subscriptions.",
		body: null,
	},
	{
		method: "GET",
		path: "/push/settings",
		purpose: "Get current push notification settings and trigger preferences.",
		body: null,
	},
	{
		method: "PUT",
		path: "/push/settings",
		purpose: "Update push notification settings (triggers, enabled).",
		body: null,
	},
	{
		method: "POST",
		path: "/push/subscribe",
		purpose: "Register or update a browser Web Push subscription.",
		body: null,
	},
	{
		method: "POST",
		path: "/push/subscription-status",
		purpose: "Check whether a subscription endpoint is registered (`{ endpoint }` \u2192 `{ ok, registered }`; 400 on an invalid endpoint).",
		body: null,
	},
	{
		method: "GET",
		path: "/push/status",
		purpose: "Push notification configuration status and subscriber count.",
		body: null,
	},
	{
		method: "POST",
		path: "/push/unsubscribe",
		purpose: "Unregister a browser Web Push subscription by endpoint.",
		body: null,
	},
	{
		method: "POST",
		path: "/push/test",
		purpose: "Dispatch a test push notification to all active subscribers.",
		body: null,
	},
	{
		method: "GET",
		path: "/compute/context",
		purpose: "Context usage `{ current, limit }`.",
		body: null,
	},
	{
		method: "POST",
		path: "/compute/compact",
		purpose: "Compact session context.",
		body: null,
	},
	{
		method: "POST",
		path: "/test/reset",
		purpose: "Dispose the session and clear all tasks for a project.",
		body: null,
	},
	{
		method: "POST",
		path: "/tasks/:id/stuck-check",
		purpose: "Run the stuck checker for the task.",
		body: null,
	},
	{
		method: "GET",
		path: "/tasks/:id/logs",
		purpose: "Task logs, one feed per call: `?feed=main\\",
		body: null,
	},
	{
		method: "GET",
		path: "/harnesses",
		purpose: "Harness roster (pi, antigravity, opencode).",
		body: null,
	},
	{
		method: "GET",
		path: "/harnesses/reliability",
		purpose: "Per-harness success rates (infra failures count; deliberate agent stage-fails excluded).",
		body: null,
	},
	{
		method: "GET",
		path: "/harnesses/:id/models",
		purpose: "Models available on one harness.",
		body: null,
	},
	{
		method: "GET",
		path: "/engine/state",
		purpose: "Global engine + containment snapshot (`circuit.tripped`, reason, source, `trippedAt`, canary, scheduler stats). Un-scoped: containment is host-wide.",
		body: null,
	},
	{
		method: "POST",
		path: "/engine/trip",
		purpose: "Operator emergency stop. Body `{ reason, operator? }`; `reason` is required (400 otherwise).",
		body: null,
	},
	{
		method: "POST",
		path: "/engine/reset",
		purpose: "Lift containment. Body `{ reason, operator? }`; `reason` is required and logged/broadcast (400 otherwise).",
		body: null,
	},
	{
		method: "GET",
		path: "/workflows",
		purpose: "List registered workflow definitions.",
		body: null,
	},
	{
		method: "POST",
		path: "/workflows/start",
		purpose: "Start a workflow run.",
		body: null,
	},
	{
		method: "POST",
		path: "/retrospective/chat",
		purpose: "One stateless retrospective chat turn (`{ messages, taskIds?, harness?, model?, strictTaskIds?, turnId? }` \u2192 `{ reply, suggestions, harness, model, modelRequested, unknownTaskIds, contextTaskIds, contextTruncated, contextChars, output? }`, where `output` is the bounded (2000-char) tail of assistant text observed during the turn, also present on 502/504 bodies when anything streamed; when the client sends a `turnId`, streamed deltas are also broadcast live as `CHAT_PROGRESS` WebSocket frames (`{ turnId, tail }`, throttled) and the HTTP settle stays the done signal; input caps 50 messages / 8000 chars per message / 40000 transcript chars; 501 `unsupported_by_harness` when the harness cannot chat; 400 `chat_input_too_large` on oversized input; 404 `task_not_found` when all task ids are unknown (or any, with `strictTaskIds: true`); 502 `chat_prompt_failed` when the model errors; chat turns run with no timeout by default \u2014 they settle when the model answers or when the caller cancels (a 504 `chat_prompt_timeout` only occurs when an operator re-imposes an opt-in server ceiling via `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS`, default `0` = disabled; keep `KAINBAIN_SERVER_REQUEST_TIMEOUT_MS`, default `0` = disabled, above any opt-in ceiling or long turns die with a bare 408; reverse proxies may still impose their own idle ceilings); when no `taskIds` are sent the model may use the generic task-listing path to inspect recent jobs itself (staying within current project scoping) and cites the task ids it touches; never creates tasks).",
		body: null,
	},
];

/***
 * MARK: TASK_STATUSES
 * @description The possible values of a task's `status` field, with what each means.
 * @example TASK_STATUSES['in_stage'] => 'Created/ready; not yet dispatched.'
 ***/
export const TASK_STATUSES = {
	idle: "Created but not yet in a stage.",
	in_stage: "Sitting in a stage, awaiting dispatch to the queue.",
	waiting_human:
		"Blocked at a human/review stage awaiting approval or rejection.",
	running_agent: "An agent is actively executing this task's stage.",
	running_ci: "A CI/script stage is actively executing.",
	running_deploy: "Legacy alias for running_ci (kept so old task records still read).",
	advancing: "The task is transitioning to the next stage.",
	checkpoint: "Engine paused at a human review checkpoint.",
	blocked: "Blocked by unresolved dependencies (see blockedBy).",
	paused: "Paused by an operator or engine.",
	interrupted: "Interrupted (e.g. server shutdown); may be resumed.",
	failed: "The current stage failed; use retry or failback.",
	passed: "A CI or merge stage passed.",
	completed: "Task finished through its pipeline.",
};

/***
 * MARK: STAGE_TYPES
 * @description The authoritative stage types a task can pass through.
 * @example STAGE_TYPES['agent'] => 'Automated AI execution.'
 ***/
export const STAGE_TYPES = {
	agent: "Automated execution by the AI agent.",
	human: "Manual checkpoint requiring human approval/rejection.",
	ci: "Automated bash/script verification command. A stage whose command runs the deploy script (e.g. ./deploy.sh --prod) is an ordinary CI stage: on failure it routes to its configured fallback like any other CI stage.",
	merge: "Git operations only: integrates the task's branch into the default main branch, auto-commits, records the review baseline, and pushes. Never runs a command.",
};

/***
 * MARK: RECOMMENDED_WORKFLOW
 * @description A suggested sequence of calls for an agent that wants to create a
 *   task and drive it through review. Every step is available on the HTTP API.
 * @example RECOMMENDED_WORKFLOW[0] => { title: 'Discover projects', ... }
 ***/
export const RECOMMENDED_WORKFLOW = [
	{
		title: "Discover projects",
		call: "GET /projects",
		why: "Pick the projectId to work on (or omit it to target the active project).",
	},
	{
		title: "Inspect the pipeline",
		call: "GET /projects/:id/workflow",
		why: "See the ordered stages so you know what a task will pass through.",
	},
	{
		title: "Create a task",
		call: "POST /tasks { projectId, title, goal }",
		why: "Create a discrete task. Set execute:true to dispatch it to the agent queue.",
	},
	{
		title: "View it",
		call: "GET /tasks/:id?projectId=...",
		why: "Read its current stage, status, and history.",
	},
	{
		title: "Drive it forward",
		call:
			"POST /tasks/:id/execute | advance | reject | failback | move | jump | complete",
		why: "Advance it, reject it with feedback, route it elsewhere, or complete it.",
	},
	{
		title: "Subscribe to live events",
		call: "WebSocket /ws?projectId=...",
		why: "Receive real-time agent/process/stage events without polling.",
	},
];

/***
 * MARK: WS_EVENT_TYPES
 * @description The WebSocket event types an agent can subscribe to via /ws?projectId=.
 *   Each frame is JSON: { type, sessionId, payload, timestamp }. `type` is one of
 *   these; `payload` carries taskId/projectId plus event-specific fields.
 * @example WS_EVENT_TYPES[0] => 'MSG_START'
 ***/
export const WS_EVENT_TYPES = [
	"CONNECTED",
	"MSG_START",
	"MSG_UPDATE",
	"TOOL_START",
	"TOOL_UPDATE",
	"TOOL_END",
	"AGENT_DONE",
	"STREAMING_UPDATE",
	"PROCESS_START",
	"PROCESS_STDOUT",
	"PROCESS_STDERR",
	"PROCESS_EXIT",
	"STAGE_ENTER",
	"STAGE_CHECKPOINT_WAIT",
	"STAGE_COMPLETE",
	"STAGE_FAILBACK",
	"NOTIFICATION",
	"ENGINE_STATE",
	"SYSTEM_LOG",
	"APP_STATUS_UPDATED",
];

/***
 * MARK: renderMarkdownGuide
 * @description Renders the guide as a readable markdown document (served by
 *   GET /agent/guide) so a human or agent can paste it into context.
 * @param {Object} [opts]
 * @param {boolean} [opts.withExamples=true] - Include the recommended workflow.
 * @returns {string} Markdown string.
 * @example renderMarkdownGuide() => '# KainBain Agent Integration Guide\\n...'
 ***/
export function renderMarkdownGuide({ withExamples = true } = {}) {
	const lines = [];
	lines.push("# KainBain Agent Integration Guide");
	lines.push("");
	lines.push(
		"KainBain is an AI task orchestrator. Non-KainBain AI agents can integrate with the",
	);
	lines.push(
		"live service over HTTP + WebSocket to discover projects, create/view/manage tasks,",
	);
	lines.push(
		"and watch the agent engine run them through a multi-stage pipeline.",
	);
	lines.push("");
	lines.push(
		`API base: \`${API_BASE}\` (interactive OpenAPI docs: \`${API_BASE}/documentation\`)`,
	);
	lines.push("");
	lines.push("## Concepts");
	lines.push("");
	lines.push(
		"- **Project** — a workspace with an ordered list of **stages** (a workflow pipeline).",
	);
	lines.push(
		"- **Stage** — one step a task passes through. Types: " +
			Object.entries(STAGE_TYPES)
				.map(([k, v]) => `\`${k}\` (${v})`)
				.join(", ") +
			".",
	);
	lines.push(
		"- **Task** — a discrete unit of work created in a stage. Tasks are the primary object you create and manage.",
	);
	lines.push(
		"- **projectId** — optional on most routes; when omitted the API uses the currently **active** project.",
	);
	lines.push("");
	lines.push("## Task statuses");
	lines.push("");
	for (const [k, v] of Object.entries(TASK_STATUSES)) {
		lines.push(`- \`${k}\` — ${v}`);
	}
	lines.push("");
	lines.push("## Endpoints");
	lines.push("");
	for (const ep of ENDPOINTS) {
		const bodyStr = ep.body ? ` Body: \`${JSON.stringify(ep.body)}\`.` : "";
		lines.push(`### \`${ep.method} ${ep.path}\``);
		lines.push("");
		lines.push(ep.purpose + bodyStr);
		lines.push("");
	}

	if (withExamples) {
		lines.push("## Recommended workflow for an integrating agent");
		lines.push("");
		for (const step of RECOMMENDED_WORKFLOW) {
			lines.push(`1. **${step.title}** — \`${step.call}\`. ${step.why}`);
		}
		lines.push("");
		lines.push("## Live events (WebSocket)");
		lines.push("");
		lines.push(
			"Connect to `" +
				API_BASE.replace(/^http/, "ws") +
				"/ws?projectId=<id>` and receive JSON frames of type " +
				WS_EVENT_TYPES.map((t) => `\`${t}\``).join(", ") +
				".",
		);
		lines.push("");
	}
	return lines.join("\n");
}

/***
 * MARK: AGENT_GUIDE
 * @description The full structured guide object returned by GET /agent.
 * @example AGENT_GUIDE.intro => 'KainBain is an AI task orchestrator...'
 ***/
/***
 * MARK: TASK_BLOCKING
 * @description How task dependencies work: chaining, validation, and release.
 * @example TASK_BLOCKING.release => 'Completing every blocker id ...'
 ***/
export const TASK_BLOCKING = {
	shape: "blockedBy is a string array of same-project task ids the task waits on before it may execute.",
	chains:
		"Create audit-safe serial chains by giving each task the previous task's id as its single blockedBy entry (C waits on B, B waits on A).",
	release:
		"Completing every blocker id releases the dependent on the next scheduler tick with no manual step; the queue ranks blocked tasks last with a 'Blocked by: ...' reason.",
	failClosed:
		"A blocker that failed or was cancelled keeps dependents blocked so work whose premise failed never runs silently; cancel or re-point the dependent instead.",
	validation:
		"Create and PATCH reject with HTTP 400 when blockedBy names the task itself, an unknown same-project id, or an edit that would create a dependency cycle. Executing a blocked task is rejected with HTTP 409.",
};

export const AGENT_GUIDE = {
	name: "KainBain",
	version: "1.0.0",
	apiBase: API_BASE,
	description:
		"KainBain is an AI task orchestrator. Agents integrate over HTTP + WebSocket to create, view, manage, and execute tasks through a per-project multi-stage pipeline.",
	introduction: [
		"This guide lets a non-KainBain agent operate the live service.",
		"Every project exposes an ordered list of stages; tasks are created into a stage and advanced through it.",
		"projectId is optional on most routes and falls back to the currently active project.",
		"The interactive OpenAPI spec is served at /documentation.",
	],
	concepts: {
		project:
			"A workspace with an ordered list of stages (a workflow). Agents list projects to find a workspace to act in.",
		stage:
			"A single step in the pipeline a task passes through. Authoritative types: agent (AI execution), human (review checkpoint), ci (script verification).",
		task:
			"A discrete unit of work created into a stage. Create, view, advance, reject, move, and complete tasks via HTTP.",
		projectId:
			"Optional on most routes; omitted defaults to the currently active project.",
	},
	taskStatuses: TASK_STATUSES,
	taskBlocking: TASK_BLOCKING,
	stageTypes: STAGE_TYPES,
	endpoints: ENDPOINTS,
	websocket: {
		url: "/ws?projectId=<projectId>",
		eventTypes: WS_EVENT_TYPES,
		notes: [
			"Frames are JSON: { type, sessionId, payload, timestamp }.",
			"payload.taskId / payload.projectId identify the task an event belongs to.",
			"Use GET /session/history after (re)connecting to reconcile missed events.",
		],
	},
	recommendedWorkflow: RECOMMENDED_WORKFLOW,
	sampleCreateTask: {
		method: "POST",
		path: "/tasks",
		body: {
			projectId: "<projectId>",
			title: "Implement health endpoint",
			goal: "Add GET /health returning a JSON status object.",
			execute: true,
		},
		note:
			"Set execute:true to dispatch to the agent queue immediately. Use idempotencyKey to safely retry.",
	},
};
