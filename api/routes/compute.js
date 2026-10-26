import {
	publicModelJsonSchema,
	discoveryErrorJsonSchema,
	providerAuthSummary,
	withRunnableFlags,
	aggregateModelCatalog,
} from "../models.js";
export { clearModelsCache, getAvailableModels, harnessesView, listHarnessModelsWithTimeout } from "../crew/index.js";

/***
 * MARK: computeRoutes
 * @description Compute control (start/stop), context usage, credential-aware model
 *   discovery, steering and follow-up, plus the test-only state reset endpoint.
 *
 * Optional harness capabilities (steer/followUp/compact/getContextUsage — see
 * api/agent/harnessContract.js) are guarded with `guardSessionCapability`: a
 * session that lacks a capability gets a standardized
 * `501 { code: "unsupported_by_harness" }` instead of a 500 TypeError.
 * @example app.register(computeRoutes, { deps })
 ***/

/***
 * MARK: unsupportedByHarnessResponseSchema
 * @description OpenAPI schema for the standardized capability-degradation error
 *   payload sent by `guardSessionCapability` (api/index.js).
 ***/
const unsupportedByHarnessResponseSchema = {
	type: "object",
	properties: {
		error: { type: "string" },
		code: { type: "string" },
		capability: { type: "string" },
	},
};

/***
 * MARK: isBenignNoOpCompactionError
 * @description Whether a compaction failure is the harness's benign
 *   "nothing to compact" condition (the session is too small to compact),
 *   which the HTTP layer treats as an idempotent success. The dependency on
 *   the harness's message wording is deliberately isolated to this helper, and
 *   the capability guard always runs first so an unsupported harness never
 *   reaches it.
 * @param {unknown} error
 * @returns {boolean}
 * @example isBenignNoOpCompactionError(new Error("Nothing to compact (session too small)")) => true
 ***/
export function isBenignNoOpCompactionError(error) {
	return error instanceof Error && /nothing to compact/i.test(error.message);
}
export default async function computeRoutes(app, { deps }) {
	const {
		resolveAndGuardProject,
		guardSessionCapability,
		getOrCreateSession,
		disposeSession,
		sessionStore,
		projectStore,
		taskStore,
		harnessRegistry,
	} = deps;

	/***
	 * MARK: getModels
	 * @description Lists the models the DEFAULT harness (the process-wide agent
	 *   harness owned by the SessionStore) offers, through its `listModels()`
	 *   contract method — the same source of truth sessions resolve models
	 *   against. `?refresh=true` asks the harness for a network-free disk
	 *   refresh and bypasses the TTL cache; a harness that yields nothing (or
	 *   fails) falls back to the curated model list so the picker never renders
	 *   empty — except a default harness with no model catalogue (e.g.
	 *   custom), which honestly serves `[]`. Responses are projected to the
	 *   public model shape and cached per harness id, shared with
	 *   `/harnesses/:id/models`.
	 *
	 *   Credential-aware enrichment (additive): every model is additionally
	 *   flagged with `runnable` / `authConfigured` / `authSource` / `authLabel` /
	 *   `statusLabel` read duck-typed from the harness's shared ModelRuntime —
	 *   `runnable: true` only when the model's identity is present in the
	 *   availability snapshot (the SDK populates it only for providers with VALID
	 *   credentials), so synthetic fallback entries are labelled honestly.
	 *   Runtime failure degrades to plain catalogue output; the additive top-level
	 *   `auth` summary carries the same per-provider state. Both additions are
	 *   declared in the response schema (Fastify strips undeclared fields).
	 *
	 *   Additive harness view: the response also carries `harnesses[]` — the
	 *   same catalogue described per registered harness (see `harnessesView`)
	 *   for the harness-first model selector. `models` keeps its pre-existing
	 *   flat shape so older clients are unaffected; the field must stay declared
	 *   in the response schema (Fastify strips undeclared response fields).
	 ***/
	app.get(
		"/compute/models",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						refresh: { type: "string" },
					},
				},
				response: {
					200: {
						type: "object",
						properties: {
							models: {
								type: "array",
								items: publicModelJsonSchema,
							},
							// Additive harness view of the catalogue (harness-first
							// model selector). Must stay declared — Fastify strips
							// response fields missing from this schema.
							harnesses: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										label: { type: "string" },
										description: { type: "string" },
										modelSelection: { type: "string" },
										modelFlag: { type: ["string", "null"] },
										reasoningLevels: { type: ["array", "null"], items: { type: "string" } },
										supportsDiagnosis: { type: "boolean" },
										isDefault: { type: "boolean" },
										available: { type: ["boolean", "null"] },
										detectionSource: { type: "string" },
										hint: { type: ["string", "null"] },
										models: {
											type: "array",
											items: publicModelJsonSchema,
										},
										// Additive discovery failure (present only
										// when the harness reported one — must stay
										// declared or Fastify strips it).
										discoveryError: discoveryErrorJsonSchema,
									},
									required: ["id", "label", "models"],
								},
							},
							// Per-provider credential summary (optional; present only
							// when the model runtime is reachable).
							auth: {
								type: "object",
								properties: {
									providers: {
										type: "array",
										items: {
											type: "object",
											properties: {
												provider: { type: "string" },
												configured: { type: "boolean" },
												source: { type: "string" },
												label: { type: "string" },
											},
											additionalProperties: true,
										},
									},
									error: { type: "string" },
								},
								additionalProperties: true,
							},
						},
					},
				},
			},
		},
		async (request) => {
			const refresh = request.query?.refresh === "true";
			// The harness that owns discovery scopes every model key it emits
			// (harness identity comes from the single getHarness() source). A
			// default harness with no model catalogue (e.g. custom)
			// honestly serves [] here too — never the curated fallback.
			// The domain aggregator assembles the flat catalog + per-harness
			// view in one pass (live listings, availability-aware, curated
			// fallback for the default harness only).
			const harness = sessionStore.getHarness();
			const catalog = await aggregateModelCatalog({
				registry: harnessRegistry,
				defaultHarness: harness,
				refresh,
			});
			const models = catalog.models;

			// Credential-aware enrichment layer over the public catalogue (the raw
			// availability snapshot is matched in both key grammars — harness-scoped
			// public keys and legacy provider::id — see withRunnableFlags). Any
			// runtime failure degrades to plain catalogue output — the model list
			// endpoint must never break because the runtime is unavailable. Fallback
			// entries get the same honest flags (never a synthetic "Ready").
			let runtime = null;
			try {
				runtime =
					typeof sessionStore.getModelRuntime === "function"
						? await sessionStore.getModelRuntime()
						: null;
			} catch {
				runtime = null;
			}
			const enriched = withRunnableFlags(models, runtime);

			// The default harness's entry reuses the enriched flat array (one
			// listing, two views) — same identity the view had before.
			for (const entry of catalog.harnesses) {
				if (entry.isDefault) entry.models = enriched;
			}
			const response = {
				models: enriched,
				harnesses: catalog.harnesses,
			};
			if (runtime) {
				const summary = providerAuthSummary(runtime);
				if (summary) {
					response.auth = {
						providers: summary.providers,
						...(summary.error ? { error: summary.error } : {}),
					};
				}
			}
			return response;
		},
	);

	app.get(
		"/compute/status",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: { running: { type: "boolean" } },
					},
				},
			},
		},
		async () => {
			return { running: sessionStore.size > 0 };
		},
	);

	app.post(
		"/compute/start",
		{
			schema: {
				// Body is optional (projectId falls back to the active project), so no
				// body schema is declared to avoid rejecting empty requests.
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							running: { type: "boolean" },
							projectId: { type: "string" },
						},
					},
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.body?.projectId, reply);
			if (!id) return;

			await getOrCreateSession(id);
			// Resume autonomous dispatch only when a previous stop halted
			// it; otherwise a plain start must not wake a scheduler that was
			// never running (or change its cadence when it already is).
			if (taskStore.schedulerHaltedByOperator) {
				taskStore.schedulerHaltedByOperator = false;
				taskStore.startScheduler?.();
			}
			return { status: "started", running: true, projectId: id };
		},
	);

	app.post("/compute/stop", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		// Stopping the engine must actually stop it: halt the autonomous
		// scheduler loop (it used to keep dispatching every few seconds)
		// and interrupt live runs (the in-flight agent used to run to
		// completion and advance behind the operator's back).
		taskStore.cancelProjectExecutions(id);
		taskStore.stopScheduler?.();
		taskStore.schedulerHaltedByOperator = true;
		await disposeSession(id);
		return { status: "stopped", running: false, projectId: id };
	});

	/***
	 * MARK: testReset
	 * @description Disposes the session and clears all tasks for a project to establish a clean state for testing.
	 ***/
	app.post("/test/reset", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const project = projectStore.getProject(id);
		if (project) {
			await sessionStore.clearSession(project);
		}
		taskStore.clearProject(id, project?.cwd);
		return { status: "reset", projectId: id };
	});

	/***
	 * MARK: Capability Guards
	 * Optional-surface calls below are wrapped with guardSessionCapability so
	 * harnesses without a capability degrade to 501 unsupported_by_harness.
	 ***/

	/***
	 * MARK: contextUsage
	 * @description Reports the session's context usage as a {current, limit}
	 *   pair (normalized at the harness boundary). Degrades to 501 when the
	 *   harness does not support context usage reporting.
	 ***/
	app.get(
		"/compute/context",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							current: { type: "number" },
							limit: { type: "number" },
						},
					},
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.query?.projectId, reply);
			if (!id) return;

			const session = await getOrCreateSession(id);
			if (
				!guardSessionCapability(
					reply,
					session,
					"getContextUsage",
					"Context usage reporting",
				)
			) {
				return;
			}
			const usage = await session.getContextUsage();
			return usage ?? { current: 0, limit: 0 };
		},
	);

	/***
	 * MARK: manualCompaction
	 * @description Compacts the session context to free token headroom.
	 *   Degrades to 501 when the harness does not support compaction; a session
	 *   too small to compact is an idempotent success (200), matching the
	 *   harness's benign "nothing to compact" condition.
	 ***/
	app.post(
		"/compute/compact",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							projectId: { type: "string" },
						},
					},
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.body?.projectId, reply);
			if (!id) return;

			const session = await getOrCreateSession(id);
			if (
				!guardSessionCapability(
					reply,
					session,
					"compact",
					"Manual context compaction",
				)
			) {
				return;
			}
			try {
				await session.compact();
			} catch (err) {
				// A session too small to compact is an idempotent no-op, not a failure.
				if (!isBenignNoOpCompactionError(err)) throw err;
				request.log.debug(
					{ projectId: id },
					"compact skipped: session has nothing to compact",
				);
			}
			return { status: "compacted", projectId: id };
		},
	);

	/***
	 * MARK: resolveGoalAndProject
	 * @description Validates a goal + project for steering and follow-up endpoints.
	 * @example resolveGoalAndProject(request, reply) => { goal: 'Refine', id: 'proj-1' }
	 * @param {Object} request
	 * @param {Object} reply
	 * @returns {{goal: string, id: string}|null}
	 ***/
	const resolveGoalAndProject = (request, reply) => {
		const { goal } = request.body;
		if (!goal) {
			reply.status(400).send({ error: "Goal is required" });
			return null;
		}
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return null;
		return { goal, id };
	};

	app.post(
		"/compute/steer",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							projectId: { type: "string" },
						},
					},
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveGoalAndProject(request, reply);
			if (!ctx) return;

			const session = await getOrCreateSession(ctx.id);
			if (!guardSessionCapability(reply, session, "steer", "Steering")) {
				return;
			}
			await session.steer(ctx.goal);
			return { status: "steered", projectId: ctx.id };
		},
	);

	app.post(
		"/compute/follow-up",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							projectId: { type: "string" },
						},
					},
					501: unsupportedByHarnessResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveGoalAndProject(request, reply);
			if (!ctx) return;

			const session = await getOrCreateSession(ctx.id);
			if (
				!guardSessionCapability(reply, session, "followUp", "Follow-up dispatch")
			) {
				return;
			}
			await session.followUp(ctx.goal);
			return { status: "followed_up", projectId: ctx.id };
		},
	);
}
