import {
	modelListCache,
	listPublicModels,
	publicModelJsonSchema,
	discoveryErrorJsonSchema,
	getHarnessDiscoveryStatus,
} from "../models.js";
import { discoverHarnesses } from "../agent/harnessDiscovery.js";
import { harnessSupportTierInfo } from "../agent/harnessSupportTiers.js";
import { computeHarnessReliability } from "../watch/harnessReliability.js";

/***
 * MARK: harnessesRoutes
 * @description Harness discovery API: lists the registered agent harnesses
 *   (id, name, description, capabilities, modelSelection, modelFlag,
 *   isDefault, supportTier, supportTierLabel, supportTierSummary, testOnly)
 *   and serves each harness's available models through its
 *   `listModels()` contract method. Both model views share the process-wide
 *   model-list cache keyed per harness id, so `/harnesses/:id/models` and
 *   `/compute/models` (the default harness) resolve from the same listing
 *   within the TTL window. Only the DEFAULT harness falls back to the curated
 *   list; every other harness serves an honest empty list on empty/failing
 *   discovery — never the curated fallback — so the UI never offers models
 *   that cannot run there.
 * @example app.register(harnessesRoutes, { deps })
 * @param {Object} app
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 * @param {Object} [opts.deps.harnessRegistry] - The id-keyed harness registry.
 * @param {Object} [opts.deps.sessionStore] - The SessionStore (owns the default harness).
 ***/
/***
 * MARK: harnessAvailability
 * @description Additive availability projection for one roster entry, backed
 *   by the shared discovery module (`api/agent/harnessDiscovery.js`): binary
 *   resolution for CLI harnesses, snapshot presence for pi, always-available
 *   for custom/mock. Listing still never spawns CLIs or stalls behind slow
 *   harnesses — discovery is local `fs` checks only, TTL-cached
 *   process-wide (`?refresh=true` re-probes). On-demand model probing lives
 *   behind `GET /harnesses/:id/models` as before. Any discovery failure
 *   (probe throw, unknown registry id) normalizes to today's
 *   `{ available: null, detectionSource: 'unknown' }` — never a 500.
 * @example harnessAvailability({ id: 'antigravity' }) => { available: true, detectionSource: 'local-bin', binPath: '/home/u/.local/bin/agy' }
 * @param {Object} entry - One roster entry from the harness registry.
 * @param {Object} [opts]
 * @param {boolean} [opts.refresh=false] - Bypass the discovery cache and re-probe.
 * @returns {{available: boolean|null, detectionSource: string, binPath?: string, hint?: string}} Availability (null = unknown/not probed; binPath/hint present only when discovery reported them).
 ***/
export function harnessAvailability(entry, { refresh = false } = {}) {
	try {
		const found = discoverHarnesses({ refresh }).find(
			(row) => row.id === entry?.id,
		);
		if (!found) return { available: null, detectionSource: "unknown" };
		const projected = {
			available: found.available,
			detectionSource: found.detectionSource,
		};
		if (found.binPath !== undefined) projected.binPath = found.binPath;
		if (found.hint !== undefined) projected.hint = found.hint;
		return projected;
	} catch {
		return { available: null, detectionSource: "unknown" };
	}
}

export default async function harnessesRoutes(app, { deps }) {
	const { harnessRegistry, sessionStore, taskStore } = deps;

	/***
	 * MARK: listHarnesses
	 * @description Lists the registered agent harnesses with their allow-listed
	 *   public fields. `isDefault` is computed live (the harness sessions
	 *   actually resolve through), not stored, so it cannot drift from the
	 *   SessionStore's configured harness. `modelSelection` tells the UI how
	 *   to render model selection for the harness (`"list"` = dropdown over
	 *   `models`, `"none"` = hide model selection); it defaults to `"list"`
	 *   for entries whose harness never declared one (older registrations).
	 ***/
	app.get(
		"/harnesses",
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
							harnesses: {
								type: "array",
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										name: { type: "string" },
										description: { type: "string" },
										capabilities: {
											type: "object",
											additionalProperties: true,
										},
										modelSelection: { type: "string" },
										modelFlag: { type: ["string", "null"] },
										reasoningLevels: { type: ["array", "null"], items: { type: "string" } },
										isDefault: { type: "boolean" },
										available: { type: ["boolean", "null"] },
										detectionSource: { type: "string" },
										binPath: { type: ["string", "null"] },
										hint: { type: ["string", "null"] },
										supportTier: { type: "string" },
										supportTierLabel: { type: "string" },
										supportTierSummary: { type: "string" },
										testOnly: { type: "boolean" },
									},
									required: [
										"id",
										"name",
										"capabilities",
										"modelSelection",
										"isDefault",
										"supportTier",
										"supportTierLabel",
										"supportTierSummary",
										"testOnly",
									],
									additionalProperties: false,
								},
							},
						},
					},
				},
			},
		},
		async (request) => {
			const refresh = request.query?.refresh === "true";
			const defaultHarness = sessionStore.getHarness();
			const harnesses = harnessRegistry.list().map((entry) => {
				// Always project a well-formed tier: an entry that never declared
				// one rounds down to the conservative Tier-4 default rather than
				// 500-ing the whole listing behind a required schema field.
				const tier = harnessSupportTierInfo(entry.supportTier);
				return {
					id: entry.id,
					name: entry.name,
					description: entry.description,
					capabilities: entry.capabilities || {},
					modelSelection:
						entry.modelSelection || entry.harness?.modelSelection || "list",
					modelFlag: entry.modelFlag ?? entry.harness?.modelFlag ?? null,
					reasoningLevels:
						entry.reasoningLevels ?? entry.harness?.reasoningLevels ?? null,
					isDefault: entry.harness === defaultHarness,
					supportTier: tier.level,
					supportTierLabel: tier.label,
					supportTierSummary: tier.summary,
					testOnly: entry.testOnly === true,
					...harnessAvailability(entry, { refresh }),
				};
			});
			return { harnesses };
		},
	);

	/***
	 * MARK: getHarnessModels
	 * @description Lists one harness's available models through its
	 *   `listModels()` contract method, projected onto the public model shape
	 *   (identical to `/compute/models`). `?refresh=true` asks the harness for a
	 *   best-effort, network-free disk refresh and bypasses the TTL cache. Unknown harness
	 *   ids answer 404. Only the DEFAULT harness falls back to the curated
	 *   model list when it yields nothing (offline resilience for the primary
	 *   picker); every other harness honestly serves `[]` on empty/failing
	 *   discovery — fallback models cannot run there, and serving them lets
	 *   users pick models that can never resolve (e.g. pi-flavored entries
	 *   for antigravity). When the harness reports a discovery failure behind
	 *   the optional `getModelDiscoveryStatus()` contract method, the response
	 *   additively carries `discoveryError: { code, message, hint }` alongside
	 *   `models` so the UI can name the cause + fix; harnesses without the
	 *   method serve exactly the old shape.
	 ***/
	app.get(
		"/harnesses/:id/models",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						refresh: { type: "string" },
					},
				},
				params: {
					type: "object",
					properties: {
						id: { type: "string" },
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
							// Additive discovery failure (present only when the
							// harness reported one — must stay declared or
							// Fastify strips it from the response).
							discoveryError: discoveryErrorJsonSchema,
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const entry = harnessRegistry.get(request.params.id);
			if (!entry) {
				return reply
					.status(404)
					.send({ error: `Harness '${request.params.id}' not found` });
			}

			const refresh = request.query?.refresh === "true";
			// Only the default harness gets the curated fallback (those
			// models cannot run anywhere else — every other harness serves
			// its listing honestly so the UI never offers unusable models).
			const fallbackWhenEmpty =
				entry.harness === sessionStore.getHarness();
			const models = await modelListCache.getOrLoad(
				entry.id,
				() =>
					listPublicModels({ harness: entry.harness, refresh, fallbackWhenEmpty }),
				{ refresh },
			);
			const response = { models };
			const discoveryError = await getHarnessDiscoveryStatus(entry.harness);
			if (discoveryError) response.discoveryError = discoveryError;
			return response;
		},
	);

	/***
	 * MARK: getHarnessReliability
	 * @description Serves per-harness reliability across every project from
	 *   recorded reliability SAMPLES (one per agent stage run, written at
	 *   dispatch regardless of the report-file opt-in), falling back to
	 *   attributed stage reports for pre-feature history: counted runs, clean successes,
	 *   infrastructure failures (timeouts, harness and model errors), and
	 *   the success rate — all-time plus the same over the recent window.
	 *   Deliberate agent stage-fails ride along as `excludedRejected` and
	 *   never touch the rate; harnesses with no attributed runs are absent
	 *   (the UI renders an honest "no data" state, never 0%).
	 ***/
	app.get(
		"/harnesses/reliability",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							reliability: {
								type: "array",
								items: {
									type: "object",
									properties: {
										harnessId: { type: "string" },
										runs: { type: "number" },
										successes: { type: "number" },
										infraFailures: { type: "number" },
										excludedRejected: { type: "number" },
										successRate: { type: ["number", "null"] },
										lastRunAt: { type: ["string", "null"] },
										recent: {
											type: "object",
											properties: {
												runs: { type: "number" },
												successes: { type: "number" },
												infraFailures: { type: "number" },
												excludedRejected: { type: "number" },
												successRate: { type: ["number", "null"] },
											},
											required: [
												"runs",
												"successes",
												"infraFailures",
												"excludedRejected",
												"successRate",
											],
											additionalProperties: false,
										},
									},
									required: [
										"harnessId",
										"runs",
										"successes",
										"infraFailures",
										"excludedRejected",
										"successRate",
										"lastRunAt",
										"recent",
									],
									additionalProperties: false,
								},
							},
						},
					},
				},
			},
		},
		async () => {
			return { reliability: computeHarnessReliability(taskStore) };
		},
	);
}
