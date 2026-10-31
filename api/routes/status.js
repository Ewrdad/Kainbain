import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { healthChecker as defaultHealthChecker } from "../healthChecker.js";
import { getConfigSpec } from "../config/index.js";

/***
 * MARK: readApiVersion
 * @description Loads the backend API version from api/version.json (the only
 *   API-version source, DA1). Loaded once at module load; a missing or
 *   invalid file yields null, never a crash.
 * @example readApiVersion() => '1.0.0'
 * @returns {string|null}
 ***/
export const readApiVersion = () => {
	try {
		const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "version.json");
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return typeof parsed?.apiVersion === "string" && /^\d+\.\d+\.\d+$/.test(parsed.apiVersion)
			? parsed.apiVersion
			: null;
	} catch {
		return null;
	}
}

const API_VERSION = readApiVersion();

/***
 * MARK: withApiVersion
 * @description Additively stamps `apiVersion` onto a build record (or a
 *   fresh object when no build record exists).
 * @example withApiVersion({ commit: 'abc' }) => { commit: 'abc', apiVersion: '1.0.0' }
 * @param {Object|null} build - deployManager build record.
 * @returns {Object}
 ***/
export const withApiVersion = (build) => {
	return { ...(build && typeof build === "object" ? build : {}), apiVersion: API_VERSION };
}

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
				build: withApiVersion(deployManager?.readBuild ? deployManager.readBuild() : null),
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
				build: withApiVersion(deployManager?.readBuild ? deployManager.readBuild() : null),
				engine: taskStore?.getEngineState
					? taskStore.getEngineState()
					: { status: "idle" },
				health,
				observability,
			};
		},
	);
}
