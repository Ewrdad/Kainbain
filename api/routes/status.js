import { healthChecker as defaultHealthChecker } from "../healthChecker.js";
import { getConfigSpec } from "../config/index.js";

/***
 * MARK: statusRoutes
 * @description Health-check and system status API endpoints including global engine state and minimal subsystem health.
 * @example app.register(statusRoutes, { deps })
 * @param {Object} app
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 ***/
export default async function statusRoutes(app, { deps } = {}) {
	const {
		taskStore,
		deployManager,
		healthChecker = defaultHealthChecker,
	} = deps || {};

	const healthSchema = {
		type: "object",
		properties: {
			status: { type: "string" },
			timestamp: { type: "string" },
			checks: {
				type: "object",
				properties: {
					litellm: {
						type: "object",
						properties: {
							status: { type: "string" },
							latencyMs: { type: ["number", "null"] },
							endpoint: { type: ["string", "null"] },
							message: { type: "string" },
						},
					},
					device: {
						type: "object",
						properties: {
							status: { type: "string" },
							memoryUsagePct: { type: "number" },
							freeMemMb: { type: "number" },
							totalMemMb: { type: "number" },
							loadAvg: { type: "array", items: { type: "number" } },
							cpuCount: { type: "number" },
							uptimeSec: { type: "number" },
							message: { type: "string" },
						},
					},
					ollamaCloud: {
						type: "object",
						properties: {
							status: { type: "string" },
							latencyMs: { type: ["number", "null"] },
							endpoint: { type: ["string", "null"] },
							message: { type: "string" },
						},
					},
					// Optional per-harness probe results (registered via
					// HealthChecker.registerProbe). Keyed by probe name; absent when no
					// probes are registered so older payloads stay byte-identical.
					harnesses: {
						type: "object",
						additionalProperties: {
							type: "object",
							properties: {
								name: { type: "string" },
								status: { type: "string" },
								latencyMs: { type: ["number", "null"] },
								timestamp: { type: "string" },
								message: { type: "string" },
							},
							additionalProperties: true,
						},
					},
				},
			},
		},
	};

	app.get(
		"/status",
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
							status: { type: "string" },
							timestamp: { type: "string" },
							build: { type: ["object", "null"], additionalProperties: true },
							engine: { type: "object", additionalProperties: true },
							health: healthSchema,
						},
					},
				},
			},
		},
		async (request) => {
			const refresh = request.query?.refresh === "true";
			const health = healthChecker?.checkAll
				? await healthChecker.checkAll({ refresh })
				: null;

			return {
				status: "ok",
				timestamp: new Date().toISOString(),
				build: deployManager?.readBuild ? deployManager.readBuild() : null,
				engine: taskStore?.getEngineState
					? taskStore.getEngineState()
					: { status: "idle" },
				health,
			};
		},
	);

	app.get(
		"/status/health",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						refresh: { type: "string" },
					},
				},
				response: {
					200: healthSchema,
				},
			},
		},
		async (request) => {
			const refresh = request.query?.refresh === "true";
			return healthChecker?.checkAll
				? await healthChecker.checkAll({ refresh })
				: {
						status: "ok",
						timestamp: new Date().toISOString(),
						checks: {},
					};
		},
	);

	const configSpecSchema = {
		response: {
			200: {
				type: "object",
				properties: {
					entries: {
						type: "array",
						items: {
							type: "object",
							properties: {
								key: { type: "string" },
								env: { type: "string" },
								value: {},
								default: {},
								type: { type: "string" },
								group: { type: "string" },
								doc: { type: "string" },
								source: { type: "string" },
								secret: { type: "boolean" },
							},
						},
					},
					warnings: { type: "array", items: { type: "string" } },
				},
			},
		},
	};

	const configSpecHandler = async () => getConfigSpec();

	// Introspection lives on the conventional status path; the ticket's
	// `/api/system/config-spec` path is served as an alias from the same
	// handler so both conventions stay reachable.
	app.get("/status/config", { schema: configSpecSchema }, configSpecHandler);
	app.get(
		"/api/system/config-spec",
		{ schema: configSpecSchema },
		configSpecHandler,
	);

	app.get(
		"/status/observability",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						projectId: { type: "string" },
						refresh: { type: "string" },
					},
				},
				response: {
					200: {
						type: "object",
						additionalProperties: true,
					},
				},
			},
		},
		async (request) => {
			const refresh = request.query?.refresh === "true";
			const projectId = request.query?.projectId;
			let health = null;
			if (healthChecker) {
				if (refresh && healthChecker.checkAll) {
					health = await healthChecker.checkAll({ refresh: true });
				} else if (healthChecker.getCachedHealth) {
					health = healthChecker.getCachedHealth();
				} else if (healthChecker.cachedHealth !== undefined) {
					health = healthChecker.cachedHealth;
				}
			}

			const observability = taskStore?.getObservabilityMetrics
				? await taskStore.getObservabilityMetrics(projectId)
				: null;

			return {
				status: "ok",
				timestamp: new Date().toISOString(),
				build: deployManager?.readBuild ? deployManager.readBuild() : null,
				engine: taskStore?.getEngineState
					? taskStore.getEngineState()
					: { status: "idle" },
				health,
				observability,
			};
		},
	);
}
