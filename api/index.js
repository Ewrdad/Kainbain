import fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import path from "node:path";
import fs from "node:fs";

// Custom TLS trust comes ONLY from an explicitly set NODE_EXTRA_CA_CERTS
// (honored natively by Node) — there is no implicit CA path fallback, so the
// server boots identically on machines without the homelab CA (audit H-1).
import { eventBridge } from "./eventBridge.js";
// Harness registrations live in the registry module (pi, antigravity,
// opencode); the OpenCode SDK still loads lazily on first use.
import "./agent/harnessRegistry.js";
import { disposeAllOpencodeServers } from "./agent/harnesses/opencode/OpencodeServerManager.js";
import { PromptCurationEngine } from "./promptCuration.js";
import { config } from "./config.js";
import { ProjectStore } from "./projectStore.js";
import { isAllowedCorsOrigin } from "./cors.js";
import { createProjectResolvers } from "./projectResolution.js";
import { createSessionHelpers } from "./sessionResolution.js";
import { taskStore } from "./taskStore.js";
import { sessionStore } from "./sessionStore.js";
import { ClaimStore } from "./flow/claimStore.js";
import { SteerStore } from "./flow/steerStore.js";
import { RunnerRegistry } from "./flow/runnerRegistry.js";
import { ExecutionLedger } from "./flow/executionLedger.js";
import { workflowRegistry } from "./workflowRegistry.js";
import { createAgentRunner } from "./agentRunner.js";
import { ORPHANED_RUNNING_STATUSES } from "./flow/taskScheduler.js";
import { installKainbainSelfDeployContinuity } from "./continuity/kainbainSelfDeploy.js";
import { DeployManager } from "./deployManager.js";
import { healthChecker } from "./healthChecker.js";
import { buildHarnessRoster, hasSessionCapability, guardSessionCapability } from "./crew/index.js";
import { prepareProjects, projectsRootBootWarning } from "./house/index.js";
export { hasSessionCapability, guardSessionCapability } from "./crew/index.js";
export { isAllowedCorsOrigin } from "./cors.js";

import statusRoutes from "./routes/status.js";
import deployRoutes from "./routes/deploy.js";
import projectsRoutes from "./routes/projects.js";
import computeRoutes from "./routes/compute.js";
import harnessesRoutes from "./routes/harnesses.js";
import sessionsRoutes from "./routes/sessions.js";
import tasksRoutes from "./routes/tasks.js";
import { registerRunnerRoutes } from "./flow/runnerRoutes.js";
import workflowsRoutes from "./routes/workflows.js";
import filesRoutes from "./routes/files.js";
import taskImagesRoutes from "./routes/taskImages.js";
import skillsRoutes from "./routes/skills.js";
import { skillsRegistry } from "./skills/skillsRegistry.js";
import wsRoutes from "./routes/ws.js";
import pushRoutes from "./routes/push.js";
import { setPushServiceLogger } from "./push/index.js";
import promptLayoutRoutes from "./routes/promptLayout.js";
import agentRoutes from "./routes/agent.js";
import reviewRoutes from "./routes/review.js";
import retrospectiveRoutes from "./routes/retrospective.js";
import siteDocsRoutes from "./routes/docs.js";

/***
 * Task Queue, Prompt Engine and Project Store instances.
 ***/
const promptEngine = new PromptCurationEngine();
// Native (non-Docker) boot against a missing projects root means every
// project silently vanishes: Docker refuse-to-boots via the entrypoint, so
// native boots log the same failure loudly instead of serving an empty board.
// Only warn when NONE of the configured roots exist (extra roots count).
const projectsRootWarning = projectsRootBootWarning([
	config.projectsRoot,
	...(Array.isArray(config.projectsRoots) ? config.projectsRoots : []),
]);
if (projectsRootWarning) {
	console.error(projectsRootWarning);
}
const projectStore = new ProjectStore();
taskStore.setProjectStore(projectStore);
prepareProjects(projectStore, taskStore);

const { resolveProjectId, requireProject, resolveAndGuardProject } = createProjectResolvers(projectStore);
const { getOrCreateSession, disposeSession, isAgentRunning } = createSessionHelpers({
	projectStore,
	sessionStore,
});

const app = fastify({ logger: true });

// Push delivery outcomes are persisted through the same structured logger
// the request logs use, so "did the server deliver to this browser?" stays
// answerable from the journal after the fact (the WebSocket event bridge
// alone loses the record on restart).
setPushServiceLogger(app.log);

app.register(fastifyCors, {
	origin: (origin, cb) => {
		if (isAllowedCorsOrigin(origin) || process.env.NODE_ENV === "test") {
			cb(null, true);
		} else {
			cb(new Error("CORS origin not allowed"), false);
		}
	},
	// The API serves GET/POST/PATCH/PUT/DELETE; the plugin default
	// (GET,HEAD,POST) would CORS-block every browser-issued PATCH/PUT/DELETE
	// on split-origin stacks (scratch e2e, LAN installs) — e.g. the project
	// settings save PATCH.
	methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

app.register(fastifyWebsocket);

// Multipart support for task image uploads (POST .../tasks/:taskId/images).
// The plugin's fileSize limit throws the standardized 413
// FST_REQ_FILE_TOO_LARGE error, which the route maps onto its own response.
app.register(fastifyMultipart, {
	limits: { fileSize: config.taskImageMaxBytes, files: 1 },
});

// OpenAPI documentation (served at /documentation). Route schemas are defined
// inline on each route; see the KB Code Standards requirement for a documented
// API layer.
app.register(fastifySwagger, {
	openapi: {
		info: {
			title: "KainBain API",
			description: "KainBain orchestrator backend",
			version: "1.0.0",
		},
		servers: [{ url: `http://localhost:${config.port}` }],
	},
});

// Serve the OpenAPI spec + Swagger UI at /documentation.
app.register(fastifySwaggerUi, {
	routePrefix: "/documentation",
});

// Shared dependencies injected into each route module.
const agentRunner = createAgentRunner({
	getOrCreateSession,
	// Project lookup for alias resolution: stages on the virtual `alias`
	// harness resolve to the alias's current harness + model before dispatch.
	getProject: (projectId) => projectStore.getProject(projectId),
	// Heartbeat on streamed events so long headless stages are not disposed
	// by the idle-TTL sweep mid-run.
	touchSession: (projectId) => sessionStore.touch(projectId),
});
const deployManager = new DeployManager();
// Give the task store access to the durable deploy result files so it can
// reconcile tasks that were interrupted when a self-deploy restarted the API.
taskStore.deployManager = deployManager;
taskStore.sessionStore = sessionStore;

const harnessRegistry = buildHarnessRoster(sessionStore);

// Phase 2 Runner ledger (D1/D4, ADR 0009): in-memory while the backend is
// the single writer; durability is Phase 4. The join token comes from
// config (empty disables registration); claims share the ClaimStore TTL.
const runnerRegistry = new RunnerRegistry({
	joinToken: config.runnerJoinToken,
	staleAfterMs: config.runnerStaleAfterMs,
});
const claimStore = new ClaimStore({ ttlMs: config.claimTtlMs });
const steerStore = new SteerStore();
const executionLedger = new ExecutionLedger();
// Leases live outside the task store, but the scheduler and the embedded
// execute path must see them to avoid double-dispatching a Runner-held
// task (same precedent as taskStore.sessionStore).
taskStore.claimStore = claimStore;

const deps = {
	projectStore,
	taskStore,
	sessionStore,
	promptEngine,
	eventBridge,
	workflowRegistry,
	agentRunner,
	resolveProjectId,
	resolveAndGuardProject,
	hasSessionCapability,
	guardSessionCapability,
	getOrCreateSession,
	disposeSession,
	isAgentRunning,
	requireProject,
	deployManager,
	healthChecker,
	skillsRegistry,
	harnessRegistry,
	runnerRegistry,
	claimStore,
	steerStore,
	executionLedger,
};

// Wire the DEFAULT harness's optional probeHealth member into the health
// aggregate as a duck-typed adapter: index.js never imports a harness SDK —
// it only asks the session store's harness whether it exposes a probe. The
// probe is registered under the default harness's own id (usually "pi") so
// non-pi defaults (e.g. mock on evaluation boxes) report under their own
// key instead of polluting "pi". Harnesses without probeHealth report an
// error check for that name; the HealthChecker normalizes rejections/
// timeouts the same way (see healthChecker.js registerProbe).
const defaultProbeHarnessId = sessionStore.getHarness()?.id;
const defaultProbeName =
	typeof defaultProbeHarnessId === "string" &&
	/^[a-z][a-z0-9-]*$/.test(defaultProbeHarnessId)
		? defaultProbeHarnessId
		: "pi";
healthChecker.registerProbe({
	name: defaultProbeName,
	probe: async (options = {}) => {
		const harness = sessionStore.getHarness();
		if (typeof harness?.probeHealth !== "function") {
			return {
				name: defaultProbeName,
				status: "error",
				timestamp: new Date().toISOString(),
				message: "Harness probe unavailable",
			};
		}
		return harness.probeHealth?.(options);
	},
});

app.register(statusRoutes, { deps });
app.register(deployRoutes, { deps });
app.register(projectsRoutes, { deps });
app.register(computeRoutes, { deps });
app.register(harnessesRoutes, { deps });
app.register(sessionsRoutes, { deps });
app.register(tasksRoutes, { deps });
app.register(registerRunnerRoutes, { deps });
app.register(workflowsRoutes, { deps });
app.register(filesRoutes, { deps });
app.register(taskImagesRoutes, { deps });
app.register(wsRoutes, { deps });
app.register(pushRoutes, { deps });
app.register(promptLayoutRoutes, { deps });
app.register(agentRoutes, { deps });
app.register(siteDocsRoutes);
app.register(reviewRoutes, { deps });
app.register(retrospectiveRoutes, { deps });
app.register(skillsRoutes, { deps: { projectStore, skillsRegistry } });

// Serve the built frontend (frontend/dist) from the same origin as the API so
// a single port (and a single nginx upstream) hosts both the UI and the
// backend. The deploy script points KAINBAIN_DIST at the production build; in
// dev it falls back to ../frontend/dist relative to this file.
const distDir = path.resolve(config.distDir);
/* eslint-disable security/detect-non-literal-fs-filename */
if (fs.existsSync(distDir)) {
	app.register(fastifyStatic, { root: distDir, prefix: "/" });
	// SPA fallback: any unmatched GET (e.g. a hard refresh on a client route)
	// returns index.html. API routes are registered above and take precedence.
	app.setNotFoundHandler((request, reply) => {
		if (request.method === "GET") {
			return reply.sendFile("index.html");
		}
		reply.code(404).send({ error: "Not found" });
	});
}
/* eslint-enable security/detect-non-literal-fs-filename */

/***
 * MARK: setupGracefulShutdown
 * @description Registers SIGTERM / SIGINT listeners to safely persist running task states,
 * stop cleanup timers, notify connected WebSocket clients, and close Fastify cleanly.
 * @param {Object} server - The Fastify server instance.
 * @param {Object} stores - References to taskStore, sessionStore, workflowRegistry, eventBridge.
 ***/
export function setupGracefulShutdown(
	server,
	{ taskStore, sessionStore, workflowRegistry, eventBridge },
) {
	const handleSignal = async (signal) => {
		try {
			taskStore?.stopScheduler?.();
			sessionStore?.stopCleanup?.();
			workflowRegistry?.stopCleanup?.();

			// Persist any active running tasks safely. The covered set is
			// shared with the scheduler's orphan reconciliation
			// (ORPHANED_RUNNING_STATUSES) so a new running_* status can
			// never be missed here and strand a task across a restart.
			if (taskStore && taskStore.tasksByProject) {
				for (const [_, map] of taskStore.tasksByProject.entries()) {
					for (const task of map.values()) {
						if (ORPHANED_RUNNING_STATUSES.has(task.status)) {
							task.status = "interrupted";
							task.wasInterrupted = true;
							taskStore._recordHistory?.(
								task,
								`Server received ${signal} - task state safely preserved`,
							);
							taskStore._saveTaskMarkdown?.(null, task);
						}
					}
				}
			}

			eventBridge?.broadcastGlobal?.("SYSTEM_LOG", {
				level: "warn",
				tag: "[SHUTDOWN]",
				message: `Server is shutting down (${signal}) - all active sessions and tasks safely persisted.`,
			});

			// Stop any OpenCode servers this process spawned (zombie prevention).
			disposeAllOpencodeServers();

			if (server && typeof server.close === "function") {
				await server.close();
			}
		} catch {
			// ignore cleanup error on forced exit
		} finally {
			process.exit(0);
		}
	};

	process.once("SIGTERM", () => handleSignal("SIGTERM"));
	process.once("SIGINT", () => handleSignal("SIGINT"));
}

/***
 * MARK: start
 * @description Boots the Fastify server, starts the TTL sweeps, and logs the
 *   listening URL.
 * @example start()
 ***/
const start = async () => {
	try {
		// KainBain uses a dedicated API port (3000 is commonly taken on dev hosts).
		// Aligns with the frontend's VITE_API_BASE/VITE_WS_URL (see frontend/.env).
		// Both come validated from the config schema (PORT 1-65535, HOST).
		const port = config.port;
		const host = config.host;
		// Long-turn support: Node's own HTTP requestTimeout default (300s)
		// would kill a long chat turn mid-flight with a bare 408, so the
		// ceiling comes from config (env KAINBAIN_SERVER_REQUEST_TIMEOUT_MS;
		// 0 disables it — Node treats 0 as no timeout — and chat turns run
		// with no timeout by default).
		if (app.server && Number.isFinite(config.serverRequestTimeoutMs)) {
			app.server.requestTimeout = config.serverRequestTimeoutMs;
			app.log.info(
				config.serverRequestTimeoutMs > 0
					? `HTTP requestTimeout set to ${config.serverRequestTimeoutMs}ms for long chat turns`
					: "HTTP requestTimeout disabled (0) so chat turns run until cancelled",
			);
		}
		await app.listen({ port, host });
		// Start the idle-session TTL sweep so abandoned sessions are cleaned up,
		// and the workflow-run TTL sweep so the registry does not grow unboundedly.
		sessionStore.startCleanup();
		workflowRegistry.startCleanup();
		// The shutdown hook is armed before recovery transitions any state,
		// so a SIGTERM/SIGINT landing mid-recovery still persists running
		// tasks as `interrupted` instead of stranding them as `running_*`.
		setupGracefulShutdown(app, {
			taskStore,
			sessionStore,
			workflowRegistry,
			eventBridge,
		});
		// Establish the initial queue before the scheduler ticks: orphaned
		// runs collapse to `interrupted`, installed continuity plugins
		// resolve their interruptions (awaited — never racing a dispatch),
		// eligible interruptions flip back to runnable and prioritised, and
		// only then does the scheduler start with a kick for ~150 ms pickup.
		// The scheduler also reconciles on each tick as a liveness backstop.
		// Recovery never rejects (worst case: nothing resumed, scheduler
		// ticking), so a corrupt task list cannot fail the boot.
		// KainBain self-deploy continuity installs only when the explicit
		// implementation flag is set; generic projects run with no plugin.
		installKainbainSelfDeployContinuity();
		const recovery = await taskStore.performStartupRecovery({
			promptEngine,
			agentRunner,
		});
		app.log.info(recovery.summary);
		// Operator-visible proof of which skills build shipped: the resolved
		// library dir plus its shipped-default count. When the Settings tab
		// shows zero KainBain defaults, this line tells whether the running
		// process sees the library at all (a count of 0 here means the
		// process started with a missing/misconfigured skills dir, not a
		// listing bug). Never throws: the scan path already fails safe.
		const shippedDefaults = skillsRegistry.listSkills();
		app.log.info(
			`Stage-skills library: ${shippedDefaults.length} shipped default(s) from ${path.resolve(skillsRegistry.skillsDir)}`,
		);
		app.log.info(`API running on http://localhost:${port}`);
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
};

if (import.meta.main) {
	start();
}

export default app;
