import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import {
	describe,
	it,
	expect,
	beforeAll,
	afterAll,
	afterEach,
	vi,
} from "vitest";
import fs from "node:fs";
import {
	isBenignNoOpCompactionError,
	getAvailableModels,
	clearModelsCache,
} from "../routes/compute.js";
import {
	withRunnableFlags,
	FALLBACK_MODELS,
	toPublicModel,
	resolveModel,
} from "../models.js";
import { sessionStore } from "../sessionStore.js";
import { taskStore } from "../taskStore.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js (first
// import above) — the config loader snapshots process.env at first
// evaluation.

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const isTestEnv = process.env.NODE_ENV === "test";

/**
 * MARK: Compute API Integration
 * @description Verifies compute control endpoints: start/stop/status, context
 *   usage, manual context compaction, steering, follow-up, credential-aware
 *   model discovery, and the test-only reset endpoint.
 *
 *   Sessions here run on the mock harness (TEST ENV CONTRACT,
 *   api/sessionStore.js): no real model runtime or on-disk pi sessions are
 *   reached, so every assertion below is contract-shaped — including the 501
 *   capability-degradation block, which strips optional capabilities from the
 *   live mock session through the full HTTP stack.
 */

describe("Compute API Integration", () => {
	let testProject;

	beforeAll(async () => {
		await app.ready();
		// Dedicated fixture project under the throwaway roots (see top of
		// file): compute sessions and task writes stay inside temp dirs.
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Compute API Test Project" },
		});
		expect(res.statusCode).toBe(201);
		testProject = JSON.parse(res.payload);
	});

	async function activeProject() {
		return testProject;
	}

	it("should start and stop compute", async () => {
		const project = await activeProject();

		const startRes = await app.inject({
			method: "POST",
			url: "/compute/start",
			payload: { projectId: project.id },
		});
		expect(startRes.statusCode).toBe(200);
		expect(JSON.parse(startRes.payload).running).toBe(true);
		expect(JSON.parse(startRes.payload).projectId).toBe(project.id);

		const statusRes = await app.inject({
			method: "GET",
			url: "/compute/status",
		});
		expect(JSON.parse(statusRes.payload).running).toBe(true);

		const stopRes = await app.inject({
			method: "POST",
			url: "/compute/stop",
			payload: { projectId: project.id },
		});
		expect(stopRes.statusCode).toBe(200);
		expect(JSON.parse(stopRes.payload).running).toBe(false);
	});

	it("POST /compute/stop halts the scheduler and /compute/start resumes it", async () => {
		const project = await activeProject();
		try {
			const stopRes = await app.inject({
				method: "POST",
				url: "/compute/stop",
				payload: { projectId: project.id },
			});
			expect(stopRes.statusCode).toBe(200);
			expect(taskStore.schedulerRunning).toBe(false);
			expect(taskStore.schedulerHaltedByOperator).toBe(true);

			const startRes = await app.inject({
				method: "POST",
				url: "/compute/start",
				payload: { projectId: project.id },
			});
			expect(startRes.statusCode).toBe(200);
			expect(taskStore.schedulerHaltedByOperator).toBe(false);
		} finally {
			taskStore.stopScheduler();
			taskStore.schedulerHaltedByOperator = false;
		}
	});

	it("GET /compute/context returns context usage for a project", async () => {
		const project = await activeProject();
		// The session here is the mock harness session (TEST ENV CONTRACT), so
		// context usage is the mock's contract surface: a current/limit pair
		// (normalized at the harness boundary).
		const res = await app.inject({
			method: "GET",
			url: `/compute/context?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(typeof body.current).toBe("number");
		expect(typeof body.limit).toBe("number");
	});

	it("POST /compute/compact compacts the session context", async () => {
		const project = await activeProject();
		// The mock harness session compacts unconditionally (no "session too
		// small" state), so the route always reports success on the seam.
		const res = await app.inject({
			method: "POST",
			url: "/compute/compact",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual(
			expect.objectContaining({ status: "compacted", projectId: project.id }),
		);
	});

	it("POST /compute/steer requires a goal", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/compute/steer",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(400);
	});

	it("POST /compute/steer dispatches a steering message", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/compute/steer",
			payload: { projectId: project.id, goal: "Please refine" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).status).toBe("steered");
	});

	it("POST /compute/follow-up dispatches a follow-up message", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/compute/follow-up",
			payload: { projectId: project.id, goal: "Also do X" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).status).toBe("followed_up");
	});

	it("POST /test/reset clears the session and tasks for a project", async () => {
		const project = await activeProject();
		// Seed a task so there is something to reset.
		await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "To be reset" },
		});
		const listBefore = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}`,
		});
		expect(JSON.parse(listBefore.payload).length).toBeGreaterThan(0);

		const res = await app.inject({
			method: "POST",
			url: "/test/reset",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual(
			expect.objectContaining({ status: "reset", projectId: project.id }),
		);

		const listAfter = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}`,
		});
		expect(JSON.parse(listAfter.payload)).toHaveLength(0);
	});

	it("GET /compute/models returns discovered models with input capabilities", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(Array.isArray(body.models)).toBe(true);
		expect(body.models.length).toBeGreaterThan(0);
		expect(body.models[0]).toHaveProperty("id");
		expect(body.models[0]).toHaveProperty("name");
		expect(body.models[0]).toHaveProperty("input");
		expect(Array.isArray(body.models[0].input)).toBe(true);

		// Every listed model reflects valid input capabilities (contract shape
		// only — no live-registry model ids are asserted here: the served list
		// is host state, projected through the harness boundary).
		for (const model of body.models) {
			expect(Array.isArray(model.input)).toBe(true);
			expect(model.input.length).toBeGreaterThan(0);
		}
	});

	it("GET /compute/models enriches models with credential-aware runnable flags", async () => {
		// The listing flows through the configured harness (host state, never
		// asserted by id); the ENRICHMENT source is stubbed to a duck-typed fake
		// runtime so the flag semantics are deterministic regardless of this
		// machine's live credential state. The fake mirrors the served catalogue
		// (read once from the real runtime) and configures auth for exactly one
		// provider — the first served model's — whatever the host lists.
		clearModelsCache();
		const baseline = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(baseline.statusCode).toBe(200);
		const served = JSON.parse(baseline.payload).models;
		expect(served.length).toBeGreaterThan(0);
		const configuredProvider = served[0].provider;

		const fakeRuntime = {
			getAvailableSnapshot: () => [],
			getModels: () => served.map((m) => ({ provider: m.provider, id: m.id })),
			getProviderAuthStatus: (provider) =>
				provider === configuredProvider
					? { configured: true, source: "models_json_key", label: "models.json" }
					: undefined,
			getError: () => undefined,
		};
		const originalRuntime = sessionStore.getModelRuntime;
		sessionStore.getModelRuntime = async () => fakeRuntime;
		clearModelsCache();
		try {
			const res = await app.inject({
				method: "GET",
				url: "/compute/models?refresh=true",
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(body.models.length).toBeGreaterThan(0);

			for (const model of body.models) {
				expect(typeof model.runnable).toBe("boolean");
				expect(model).toHaveProperty("statusLabel");
				if (model.runnable) expect(model.statusLabel).toBe("Ready");
			}

			// Every served model is listed BY the harness's availability snapshot;
			// with the snapshot stubbed empty they are all flagged NOT runnable —
			// but the configured-auth provider is labelled "Unavailable", never a
			// synthetic "Ready".
			const configured = body.models.find(
				(m) => m.provider === configuredProvider,
			);
			expect(configured).toBeTruthy();
			expect(configured.runnable).toBe(false);
			expect(configured.authConfigured).toBe(true);
			expect(configured.authSource).toBe("models_json_key");
			expect(configured.statusLabel).toBe("Unavailable");

			// Top-level per-provider auth summary (covers the served providers).
			expect(body.auth).toBeTruthy();
			expect(Array.isArray(body.auth.providers)).toBe(true);
			const providerAuth = body.auth.providers.find(
				(p) => p.provider === configuredProvider,
			);
			expect(providerAuth).toEqual(
				expect.objectContaining({ configured: true, source: "models_json_key" }),
			);
		} finally {
			sessionStore.getModelRuntime = originalRuntime;
			clearModelsCache();
		}
	});

	it("GET /compute/models reflects snapshot membership as runnable (live runtime)", async () => {
		// With the real (unstubbed) runtime the snapshot decides runnability:
		// every served model is listed BY the snapshot, so all are runnable.
		clearModelsCache();
		const res = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.models.length).toBeGreaterThan(0);
		const runtime = await sessionStore.getModelRuntime();
		const snapshot = runtime.getAvailableSnapshot?.() || [];
		for (const model of body.models) {
			const inSnapshot = snapshot.some(
				(m) => m.provider === model.provider && m.id === model.id,
			);
			expect(model.runnable).toBe(inSnapshot);
		}
		// If the snapshot is empty (no configured models on the host), the
		// harness falls back — the fallback test below covers those flags.
	});

	it("GET /compute/models degrades to plain catalogue output when the runtime fails", async () => {
		const originalRuntime = sessionStore.getModelRuntime;
		sessionStore.getModelRuntime = async () => {
			throw new Error("runtime unavailable");
		};
		clearModelsCache();
		try {
			const res = await app.inject({
				method: "GET",
				url: "/compute/models?refresh=true",
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);
			expect(Array.isArray(body.models)).toBe(true);
			// No runtime ⇒ no enrichment fields, no auth summary.
			for (const model of body.models) {
				expect(model).not.toHaveProperty("runnable");
			}
			expect(body.auth).toBeUndefined();
		} finally {
			sessionStore.getModelRuntime = originalRuntime;
			clearModelsCache();
		}
	});

	it("GET /compute/models falls back to the DE-STALED curated list when the harness yields nothing", async () => {
		// The curated fallback stays non-empty (the picker must never render
		// empty) but carries no stale entries: only models that can actually
		// run (providers with a live registry presence — ollama-cloud today).
		const stubHarness = {
			id: "pi",
			listModels: async () => [],
		};
		const fakeRuntime = {
			getAvailableSnapshot: () => [],
			getModels: () => [],
			getProviderAuthStatus: (provider) =>
				provider === "ollama-cloud"
					? { configured: true, source: "models_json_key", label: "models.json" }
					: undefined,
			getError: () => undefined,
		};
		const originalHarness = sessionStore.getHarness;
		const originalRuntime = sessionStore.getModelRuntime;
		sessionStore.getHarness = () => stubHarness;
		sessionStore.getModelRuntime = async () => fakeRuntime;
		clearModelsCache();
		try {
			const res = await app.inject({
				method: "GET",
				url: "/compute/models?refresh=true",
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload);

			// The fallback list, harness-scoped and honestly flagged: the empty
			// snapshot makes every entry not-runnable, while the configured
			// provider auth shows as "Unavailable" — never a synthetic "Ready".
			const expected = FALLBACK_MODELS.map((m) => toPublicModel(m, "pi"));
			expect(body.models.length).toBe(expected.length);
			expect(body.models.map((m) => m.key)).toEqual(expected.map((m) => m.key));
			expect(body.models.every((m) => m.provider === "ollama-cloud")).toBe(true);
			// The stale google/anthropic fallback entries must never reappear.
			expect(body.models.some((m) => m.provider === "google")).toBe(false);
			expect(body.models.some((m) => m.provider === "anthropic")).toBe(false);
			for (const model of body.models) {
				expect(model.runnable).toBe(false);
				expect(model.authConfigured).toBe(true);
				expect(model.statusLabel).toBe("Unavailable");
			}
			// getAvailableModels itself serves the fallback (never empty).
			const listed = await getAvailableModels({
				refresh: true,
				harness: stubHarness,
			});
			expect(listed.length).toBeGreaterThan(0);
		} finally {
			sessionStore.getHarness = originalHarness;
			sessionStore.getModelRuntime = originalRuntime;
			clearModelsCache();
		}
	});

	/***
	 * MARK: capability degradation (501)
	 * @description Proves the 501 unsupported_by_harness degradation through the
		 *   full HTTP stack by stripping each optional capability from the live
		 *   session. Stripping requires the mock seam (TEST ENV CONTRACT), so these
		 *   tests are gated to NODE_ENV=test; bare runs skip them.
	 ***/
	describe.skipIf(!isTestEnv)(
		"capability degradation (501 unsupported_by_harness)",
		() => {
			const stripped = [];

			/**
			 * Removes a capability from the live session for one test.
			 */
			function stripCapability(obj, key) {
				/* eslint-disable security/detect-object-injection -- capability keys are engine-controlled literals from the call sites below, never user input */
				stripped.push({ obj, key, value: obj[key] });
				delete obj[key];
				/* eslint-enable security/detect-object-injection */
			}

			afterEach(() => {
				while (stripped.length > 0) {
					const { obj, key, value } = stripped.pop();
					/* eslint-disable-next-line security/detect-object-injection -- capability keys are engine-controlled literals (see stripCapability) */
					obj[key] = value;
					// Assert restoration so a leak cannot affect other tests.
					/* eslint-disable-next-line security/detect-object-injection -- capability keys are engine-controlled literals (see stripCapability) */
					expect(typeof obj[key]).toBe("function");
				}
			});

			async function liveSessionFor(projectId) {
				await app.inject({
					method: "POST",
					url: "/compute/start",
					payload: { projectId },
				});
				const session = sessionStore.get(projectId);
				expect(session).toBeTruthy();
				return session;
			}

			it("GET /compute/context returns 501 unsupported_by_harness when getContextUsage is missing", async () => {
				const project = await activeProject();
				stripCapability(await liveSessionFor(project.id), "getContextUsage");

				const res = await app.inject({
					method: "GET",
					url: `/compute/context?projectId=${project.id}`,
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Context usage reporting is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "getContextUsage",
				});
			});

			it("POST /compute/compact returns 501 unsupported_by_harness when compact is missing", async () => {
				const project = await activeProject();
				stripCapability(await liveSessionFor(project.id), "compact");

				const res = await app.inject({
					method: "POST",
					url: "/compute/compact",
					payload: { projectId: project.id },
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Manual context compaction is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "compact",
				});
			});

			it("POST /compute/steer returns 501 unsupported_by_harness when steer is missing", async () => {
				const project = await activeProject();
				stripCapability(await liveSessionFor(project.id), "steer");

				const res = await app.inject({
					method: "POST",
					url: "/compute/steer",
					payload: { projectId: project.id, goal: "Refine the API" },
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Steering is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "steer",
				});
			});

			it("POST /compute/follow-up returns 501 unsupported_by_harness when followUp is missing", async () => {
				const project = await activeProject();
				stripCapability(await liveSessionFor(project.id), "followUp");

				const res = await app.inject({
					method: "POST",
					url: "/compute/follow-up",
					payload: { projectId: project.id, goal: "Also do X" },
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Follow-up dispatch is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "followUp",
				});
			});

			it("POST /compute/compact treats the benign 'nothing to compact' condition as idempotent success", async () => {
				const project = await activeProject();
				const session = await liveSessionFor(project.id);
				// Simulate the real harness's benign condition for a too-small session.
				stripped.push({ obj: session, key: "compact", value: session.compact });
				session.compact = async () => {
					throw new Error("Nothing to compact (session too small)");
				};

				const res = await app.inject({
					method: "POST",
					url: "/compute/compact",
					payload: { projectId: project.id },
				});
				expect(res.statusCode).toBe(200);
				expect(JSON.parse(res.payload)).toEqual(
					expect.objectContaining({ status: "compacted", projectId: project.id }),
				);
			});
		},
	);

	// --- Harness-scoped model keys served by the API ---
	it("GET /compute/models serves harness-scoped keys through the configured harness, while legacy references still resolve", async () => {
		// Route the model list through the registry: the configured harness's
		// listModels() must produce the same payload the route serves
		// (refresh=true bypasses the route's cache).
		const res = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		const expected = await getAvailableModels({
			refresh: true,
			harness: sessionStore.getHarness(),
		});
		// The route serves the catalogue PLUS the credential-aware enrichment
		// layer (read from the same shared runtime the harness owns).
		const runtime = await sessionStore.getModelRuntime();
		expect(body.models).toEqual(withRunnableFlags(expected, runtime));
		expect(body.models.every((m) => m.key && m.id && m.provider)).toBe(true);

		const { models } = body;
		expect(models.length).toBeGreaterThan(0);

		const sample = models[0];
		// The route's harness (the engine's single getHarness() source) scopes
		// every key it emits.
		expect(sample.harness).toBe("pi");
		expect(sample.key).toBe(`pi::${sample.provider}::${sample.id}`);

		// A legacy 2-part reference stored before this change still resolves.
		const legacyKey = `${sample.provider}::${sample.id}`;
		expect(resolveModel(models, legacyKey)).toBe(sample);
		// As does a bare id.
		expect(resolveModel(models, sample.id)).toBe(sample);
		// And the canonical 3-part key matches exactly.
		expect(resolveModel(models, sample.key)).toBe(sample);
	});

	// --- Additive harness view served by the API (harness-first selector) ---
	it("GET /compute/models additively returns the harness view of the catalogue", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);

		// `models` keeps its pre-existing flat shape for older clients...
		expect(Array.isArray(body.models)).toBe(true);
		expect(body.models.length).toBeGreaterThan(0);

		// ...and `harnesses` describes the same catalogue per harness. The
		// response schema must declare it — Fastify strips undeclared fields.
		expect(Array.isArray(body.harnesses)).toBe(true);
		expect(body.harnesses).toHaveLength(8);
		expect(body.harnesses[0].id).toBe("pi");
		expect(body.harnesses[0].label).toBe("pi coding agent");
		expect(typeof body.harnesses[0].description).toBe("string");
		expect(body.harnesses[0].description.length).toBeGreaterThan(0);
		// The default harness's entry reuses the flat catalogue: one listing,
		// two views (flat + per-harness) of the same payload.
		expect(body.harnesses[0].models).toEqual(body.models);
		expect(body.harnesses[0].modelSelection).toBe("list");
		// The custom-command harness is discoverable but takes NO model
		// selection: it honestly serves [] (never the curated fallback) and
		// declares "none" so the UI hides the model control.
		expect(body.harnesses[1].id).toBe("custom");
		expect(body.harnesses[1].label).toBe("Custom command");
		expect(typeof body.harnesses[1].description).toBe("string");
		expect(body.harnesses[1].description.length).toBeGreaterThan(0);
		expect(body.harnesses[1].modelSelection).toBe("none");
		expect(body.harnesses[1].modelFlag).toBeNull();
		expect(body.harnesses[1].models).toEqual([]);
		// Antigravity, OpenCode, and Muse are discoverable in the same view.
		expect(body.harnesses[2].id).toBe("antigravity");
		expect(body.harnesses[3].id).toBe("opencode");
		expect(Array.isArray(body.harnesses[2].models)).toBe(true);
		expect(Array.isArray(body.harnesses[3].models)).toBe(true);
		expect(body.harnesses[4].id).toBe("muse");
		expect(body.harnesses[4].modelSelection).toBe("none");
		expect(body.harnesses[4].models).toEqual([]);
		expect(body.harnesses[5].id).toBe("vibe");
		// Tier 2 ACP transport: modelSelection "list" with the live vibe-acp
		// catalogue when the agent resolves. This suite pins the vibe transport
		// to exec via isolatedTestRoots (hermetic — never spawns the host's real
		// vibe-acp), so the catalogue here is the honest [] (same host-tolerance
		// as antigravity/opencode above).
		expect(body.harnesses[5].modelSelection).toBe("list");
		expect(Array.isArray(body.harnesses[5].models)).toBe(true);
		for (const model of body.harnesses[5].models) {
			expect(model.harness).toBe("vibe");
			expect(model.key.startsWith("vibe::")).toBe(true);
		}
		// Codex is discoverable too — Tier 2 theoretical shim serving the
		// honestly empty catalogue (never the curated fallback).
		expect(body.harnesses[6].id).toBe("codex");
		expect(body.harnesses[6].modelSelection).toBe("list");
		expect(body.harnesses[6].models).toEqual([]);
		// The mock harness is projected last with its synthetic catalogue.
		expect(body.harnesses[7].id).toBe("mock");
		expect(body.harnesses[7].modelSelection).toBe("list");
		expect(body.harnesses[7].models).toEqual([
			expect.objectContaining({
				key: "mock::mock::echo-v1",
				harness: "mock",
				id: "echo-v1",
			}),
		]);
	});

	it("GET /compute/models serves the same catalogue with and without refresh (cached snapshot)", async () => {
		const cached = await app.inject({ method: "GET", url: "/compute/models" });
		expect(cached.statusCode).toBe(200);
		const cachedBody = JSON.parse(cached.payload);

		const forced = await app.inject({
			method: "GET",
			url: "/compute/models?refresh=true",
		});
		expect(forced.statusCode).toBe(200);
		const forcedBody = JSON.parse(forced.payload);

		// Same discovery source => same catalogue content; the ids/keys must
		// not drift between the cached and the refreshed response.
		expect(forcedBody.models.map((m) => m.key)).toEqual(
			cachedBody.models.map((m) => m.key),
		);
		// The harness view stays consistent across both responses too.
		expect(forcedBody.harnesses[0].models).toEqual(forcedBody.models);
		expect(cachedBody.harnesses[0].models).toEqual(cachedBody.models);
	});
});

/***
 * MARK: isBenignNoOpCompactionError Unit Tests
 * @description Verifies the harness-message matcher used for the idempotent
 *   no-op compaction mapping (see routes/compute.js).
 ***/
describe("isBenignNoOpCompactionError", () => {
	it("matches the harness's benign nothing-to-compact condition", () => {
		expect(
			isBenignNoOpCompactionError(
				new Error("Nothing to compact (session too small)"),
			),
		).toBe(true);
		expect(isBenignNoOpCompactionError(new Error("nothing to compact"))).toBe(true);
	});

	it("rejects real failures and non-errors", () => {
		expect(isBenignNoOpCompactionError(new Error("Entry e-1 not found"))).toBe(false);
		expect(isBenignNoOpCompactionError("nothing to compact")).toBe(false);
		expect(isBenignNoOpCompactionError(null)).toBe(false);
	});
});
