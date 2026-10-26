import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll } from "vitest";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FALLBACK_MODELS } from "../models.js";
import { clearDiscoveryCache } from "../agent/harnessDiscovery.js";

/**
 * MARK: /harnesses endpoint tests
 * @description Verifies the harness discovery API: `GET /harnesses` lists the
 *   registered harnesses (id, name, description, capabilities, isDefault —
 *   computed live against the SessionStore's default harness) and
 *   `GET /harnesses/:id/models` serves that harness's models through its
 *   `listModels()` contract method with the same projection, TTL-cache and
 *   network-free refresh semantics as `/compute/models`, answering 404 for
 *   unknown ids. Only the pi SDK (the agent layer) is mocked; the route
 *   wiring, registry and harness are authentic.
 */

const modelRuntimeMock = vi.hoisted(() => {
	const runtime = {
		snapshot: [],
		getAvailableSnapshot: () => [...runtime.snapshot],
		refresh: vi.fn(async () => ({ aborted: false, errors: new Map() })),
		getModels: vi.fn(() => []),
		getModel: vi.fn(() => null),
	};
	return runtime;
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
	ModelRuntime: { create: vi.fn(async () => modelRuntimeMock) },
	SessionManager: {
		create: vi.fn(() => ({ entries: [], getEntries: () => [] })),
	},
	createAgentSession: vi.fn(async () => ({
		session: {
			messages: [],
			isStreaming: false,
			subscribe: () => () => {},
			dispose: () => {},
		},
	})),
}));

vi.mock("../eventBridge.js", () => ({
	eventBridge: { emitSystemLog: vi.fn(), clearSession: vi.fn() },
}));

import app from "../index.js";
import { modelListCache } from "../models.js";
import Fastify from "fastify";
import harnessesRoutes from "./harnesses.js";

const HARNESS_SNAPSHOT = [
	{
		id: "kimi-k3:cloud",
		name: "Kimi K3 (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
		contextWindow: 262144,
		maxTokens: 8192,
		cost: { input: 0, output: 0 },
	},
];

describe("/harnesses API", () => {
	beforeAll(async () => {
		await app.ready();
	});

	beforeEach(() => {
		modelListCache.clear();
		modelRuntimeMock.snapshot = [];
		modelRuntimeMock.refresh = vi.fn(async () => ({
			aborted: false,
			errors: new Map(),
		}));
	});

	it("exposes both endpoints in the OpenAPI spec served at /documentation", async () => {
		const spec = app.swagger();
		expect(Object.keys(spec.paths)).toContain("/harnesses");
		// fastify-swagger serializes Fastify ':id' params in OpenAPI '{id}' style.
		expect(Object.keys(spec.paths)).toContain("/harnesses/{id}/models");
		// The model item schema mirrors /compute/models (same public projection).
		expect(
			JSON.stringify(spec.paths["/harnesses/{id}/models"]),
		).toContain("contextWindow");
	});

	it("GET /harnesses lists the registered pi harness with capabilities and isDefault (T5)", async () => {
		// Hermetic discovery: an empty fake HOME + empty PATH pins the
		// availability projection exactly (no dependence on the box running
		// the suite). Restored in finally so later tests see the real env.
		const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "harness-list-"));
		vi.stubEnv("HOME", fakeHome);
		vi.stubEnv("PATH", "");
		vi.stubEnv("OPENCODE_URL", "");
		vi.stubEnv("KAINBAIN_AGY_BIN", "");
		vi.stubEnv("KAINBAIN_MUSE_BIN", "");
		vi.stubEnv("KAINBAIN_CODEX_BIN", "");
		vi.stubEnv("KAINBAIN_OPENCODE_BIN", "");
		clearDiscoveryCache();
		try {
			const res = await app.inject({ method: "GET", url: "/harnesses" });
			expect(res.statusCode).toBe(200);

			const body = JSON.parse(res.payload);
			expect(Array.isArray(body.harnesses)).toBe(true);
			// Eight built-in registrations: pi (default), custom, antigravity, opencode, muse, vibe, codex, mock.
			expect(body.harnesses).toHaveLength(8);

			const [pi, custom, antigravity, opencode, muse, vibe, codex, mock] = body.harnesses;
			// No pi snapshot in the fake HOME: unknown (not missing — the SDK
			// registry may still serve) with a guidance hint.
			expect(pi).toEqual({
				id: "pi",
				name: "pi coding agent",
				description: expect.any(String),
				capabilities: expect.objectContaining({
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				}),
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: [
					"off",
					"minimal",
					"low",
					"medium",
					"high",
					"xhigh",
					"max",
				],
				isDefault: true,
				supportTier: "1",
				supportTierLabel: "Tier 1",
				supportTierSummary: "Direct integration in KainBain",
				testOnly: false,
				available: null,
				detectionSource: "unknown",
				hint: expect.stringContaining("PI_AGENT_DIR"),
			});
			// The custom-command harness is discoverable for the harness dropdowns
			// but takes NO model selection (model flags bake into the command).
			// Available by definition (the user supplies the command line).
			expect(custom).toEqual({
				id: "custom",
				name: "Custom command",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: false,
					resolveModelRef: false,
					readHistoryFromDisk: false,
				},
				modelSelection: "none",
				modelFlag: null,
				reasoningLevels: null,
				isDefault: false,
				supportTier: "3",
				supportTierLabel: "Tier 3",
				supportTierSummary: "Exec / -p functionality",
				testOnly: false,
				available: true,
				detectionSource: "builtin",
			});
			// Antigravity and OpenCode are discoverable with full capabilities.
			// No binaries in the fake env: honestly missing with fix hints.
			expect(antigravity).toEqual({
				id: "antigravity",
				name: "Antigravity",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				},
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: ["low", "medium", "high"],
				isDefault: false,
				supportTier: "2",
				supportTierLabel: "Tier 2",
				supportTierSummary: "ACP / programmatic invocation",
				testOnly: false,
				available: false,
				detectionSource: "not-found",
				hint: expect.stringContaining("KAINBAIN_AGY_BIN"),
			});
			expect(opencode).toEqual({
				id: "opencode",
				name: "OpenCode server",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				},
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: null,
				isDefault: false,
				supportTier: "2",
				supportTierLabel: "Tier 2",
				supportTierSummary: "ACP / programmatic invocation",
				testOnly: false,
				available: false,
				detectionSource: "not-found",
				hint: expect.stringContaining("OPENCODE_URL"),
			});
			// Muse Code is discoverable with session + model-catalogue
			// capabilities over its two-way MSP session (`muse serve`); in this
			// hermetic suite the transport is pinned to exec (vitest env), so
			// `modelSelection` reads "none" and the catalogue is empty, while the
			// capability flags stay honest for the MSP path.
			expect(muse).toEqual({
				id: "muse",
				name: "Muse Code",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				},
				modelSelection: "none",
				modelFlag: null,
				reasoningLevels: null,
				isDefault: false,
				supportTier: "2",
				supportTierLabel: "Tier 2",
				supportTierSummary: "ACP / programmatic invocation",
				testOnly: false,
				available: false,
				detectionSource: "not-found",
				hint: expect.stringContaining("KAINBAIN_MUSE_BIN"),
			});
			// Mistral Vibe is discoverable with session + model-catalogue
			// capabilities over its two-way ACP session (the live model list
			// comes from the vibe-acp handshake; in this fake env the CLI is
			// missing so `available` is false with the fix hint).
			expect(vibe).toEqual({
				id: "vibe",
				name: "Mistral Vibe",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: false,
				},
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: null,
				isDefault: false,
				supportTier: "2",
				supportTierLabel: "Tier 2",
				supportTierSummary: "ACP / programmatic invocation",
				testOnly: false,
				available: false,
				detectionSource: "not-found",
				hint: expect.stringContaining("KAINBAIN_VIBE_BIN"),
			});
			// Codex is discoverable as a Tier 2 theoretical shim: no binary in
			// the fake env, so it is honestly missing with the fix hint (the
			// unavailable-until-detected badge), an empty-catalogue "list"
			// selection, and full session-shaped capabilities.
			expect(codex).toEqual({
				id: "codex",
				name: "Codex",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				},
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: null,
				isDefault: false,
				supportTier: "2",
				supportTierLabel: "Tier 2",
				supportTierSummary: "ACP / programmatic invocation",
				testOnly: false,
				available: false,
				detectionSource: "not-found",
				hint: expect.stringContaining("KAINBAIN_CODEX_BIN"),
			});
			// The mock harness is always available (zero-credential built-in).
			expect(mock).toEqual({
				id: "mock",
				name: "Mock",
				description: expect.any(String),
				capabilities: {
					createSession: true,
					listModels: true,
					resolveModelRef: true,
					readHistoryFromDisk: true,
				},
				modelSelection: "list",
				modelFlag: null,
				reasoningLevels: ["low", "medium", "high"],
				isDefault: false,
				supportTier: "1",
				supportTierLabel: "Tier 1",
				supportTierSummary: "Direct integration in KainBain",
				testOnly: true,
				available: true,
				detectionSource: "builtin",
			});
		} finally {
			vi.unstubAllEnvs();
			clearDiscoveryCache();
			fs.rmSync(fakeHome, { recursive: true, force: true });
		}
	});

	it("projects additive availability fields without removing the old shape", async () => {
		const res = await app.inject({ method: "GET", url: "/harnesses" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		// Old clients keep working: every previous key is still present;
		// binPath/hint are additive (present only when discovery reported
		// them — a found binary, or a missing-binary fix hint).
		const baseKeys = [
			"available",
			"capabilities",
			"description",
			"detectionSource",
			"id",
			"isDefault",
			"modelFlag",
			"modelSelection",
			"reasoningLevels",
			"name",
			"supportTier",
			"supportTierLabel",
			"supportTierSummary",
			"testOnly",
		].sort();
		const optionalKeys = ["binPath", "hint"];
		for (const harness of body.harnesses) {
			const keys = Object.keys(harness).sort();
			for (const key of baseKeys) expect(keys).toContain(key);
			for (const key of keys) {
				expect([...baseKeys, ...optionalKeys]).toContain(key);
			}
			if (harness.binPath !== undefined) {
				expect(typeof harness.binPath).toBe("string");
			}
			if (harness.hint !== undefined) {
				expect(typeof harness.hint).toBe("string");
			}
			expect([true, false, null]).toContain(harness.available);
			expect(["1", "2", "3", "4", "unsupported"]).toContain(harness.supportTier);
			expect(typeof harness.supportTierLabel).toBe("string");
			expect(typeof harness.supportTierSummary).toBe("string");
			expect(typeof harness.testOnly).toBe("boolean");
			expect([
				"env",
				"path",
				"local-bin",
				"home-bin",
				"localappdata",
				"userprofile-bin",
				"opencode-bin",
				"pi-snapshot",
				"builtin",
				"not-found",
				"unknown",
			]).toContain(harness.detectionSource);
		}
	});

	it("GET /harnesses?refresh=true re-probes discovery past the cache", async () => {
		const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "harness-refresh-"));
		vi.stubEnv("HOME", fakeHome);
		vi.stubEnv("PATH", "");
		vi.stubEnv("OPENCODE_URL", "");
		vi.stubEnv("KAINBAIN_AGY_BIN", "");
		vi.stubEnv("KAINBAIN_MUSE_BIN", "");
		vi.stubEnv("KAINBAIN_CODEX_BIN", "");
		vi.stubEnv("KAINBAIN_OPENCODE_BIN", "");
		vi.stubEnv("KAINBAIN_VIBE_BIN", "");
		clearDiscoveryCache();
		try {
			const missing = JSON.parse(
				(await app.inject({ method: "GET", url: "/harnesses" })).payload,
			).harnesses.find((h) => h.id === "antigravity");
			expect(missing.available).toBe(false);

			// An agy binary appears after the first probe: the cached listing
			// stays stale…
			const binDir = path.join(fakeHome, ".local", "bin");
			fs.mkdirSync(binDir, { recursive: true });
			const bin = path.join(binDir, "agy");
			fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n");
			fs.chmodSync(bin, 0o755);
			const stale = JSON.parse(
				(await app.inject({ method: "GET", url: "/harnesses" })).payload,
			).harnesses.find((h) => h.id === "antigravity");
			expect(stale.available).toBe(false);

			// …until ?refresh=true re-probes and reports the binary.
			const fresh = JSON.parse(
				(await app.inject({ method: "GET", url: "/harnesses?refresh=true" }))
					.payload,
			).harnesses.find((h) => h.id === "antigravity");
			expect(fresh.available).toBe(true);
			expect(fresh.detectionSource).toBe("local-bin");
			expect(fresh.binPath).toBe(bin);
			expect(fresh.hint).toBeUndefined();
		} finally {
			vi.unstubAllEnvs();
			clearDiscoveryCache();
			fs.rmSync(fakeHome, { recursive: true, force: true });
		}
	});

	it("GET /harnesses/:id/models serves the harness snapshot through listModels with the public projection (T6)", async () => {
		modelRuntimeMock.snapshot = HARNESS_SNAPSHOT;

		const res = await app.inject({
			method: "GET",
			url: "/harnesses/pi/models",
		});
		expect(res.statusCode).toBe(200);

		const models = JSON.parse(res.payload).models;
		// Same projection as /compute/models: harness-scoped key added, SDK
		// internals dropped.
		expect(models).toEqual([
			{
				key: "pi::ollama-cloud::kimi-k3:cloud",
				harness: "pi",
				id: "kimi-k3:cloud",
				name: "Kimi K3 (Cloud)",
				provider: "ollama-cloud",
				contextWindow: 262144,
				input: ["text", "image"],
			},
		]);
	});

	it("GET /harnesses/:id/models answers 404 for unknown harness ids (T6)", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/harnesses/no-such-harness/models",
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload).error).toMatch(/no-such-harness/);
	});

	it("shares the TTL cache and supports refresh=true (network-free) like /compute/models (T6)", async () => {
		modelRuntimeMock.snapshot = HARNESS_SNAPSHOT;
		const snapshotReader = vi.fn(() => [...modelRuntimeMock.snapshot]);
		modelRuntimeMock.getAvailableSnapshot = snapshotReader;

		// First read lists and caches; the immediate repeat is a cache hit.
		await app.inject({ method: "GET", url: "/harnesses/pi/models" });
		expect(snapshotReader).toHaveBeenCalledTimes(1);
		await app.inject({ method: "GET", url: "/harnesses/pi/models" });
		expect(snapshotReader).toHaveBeenCalledTimes(1);

		// refresh=true bypasses the cache and refreshes from disk (no network).
		const refreshed = await app.inject({
			method: "GET",
			url: "/harnesses/pi/models?refresh=true",
		});
		expect(snapshotReader).toHaveBeenCalledTimes(2);
		expect(modelRuntimeMock.refresh).toHaveBeenCalledWith({
			allowNetwork: false,
		});
		expect(JSON.parse(refreshed.payload).models).toHaveLength(1);
	});

	it("falls back to the curated model list when the harness yields nothing (T6)", async () => {
		modelRuntimeMock.snapshot = [];
		const res = await app.inject({
			method: "GET",
			url: "/harnesses/pi/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const models = JSON.parse(res.payload).models;
		expect(models.length).toBeGreaterThan(0);
		expect(models.every((m) => m.key && m.id && m.provider)).toBe(true);
	});

	it("serves an honest empty list for the custom harness (no model registry, no fallback)", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/harnesses/custom/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const models = JSON.parse(res.payload).models;
		// A free-text command has no model catalogue: serving the curated
		// fallback here would offer models that cannot run on this harness,
		// so the route serves [] and the UI hides model selection instead.
		expect(models).toEqual([]);
	});

	it("serves the discovery reason alongside the antigravity catalogue (additive discoveryError)", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/harnesses/antigravity/models?refresh=true",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		if (body.models.length === 0) {
			// No working agy CLI in this environment: the honest empty list
			// must explain itself (code + reason + fix) instead of shrugging.
			expect(body.discoveryError).toEqual({
				code: expect.stringMatching(/^AGY_/),
				message: expect.any(String),
				hint: expect.any(String),
			});
		} else {
			// A real agy CLI answered here: healthy discovery carries no error.
			expect(body).not.toHaveProperty("discoveryError");
		}

		// Harnesses without the discovery-status contract serve exactly the
		// old shape (no discoveryError key).
		const piRes = await app.inject({
			method: "GET",
			url: "/harnesses/pi/models?refresh=true",
		});
		expect(JSON.parse(piRes.payload)).not.toHaveProperty("discoveryError");
	});

	it("exposes the reliability endpoint in the OpenAPI spec", async () => {
		const spec = app.swagger();
		expect(Object.keys(spec.paths)).toContain("/harnesses/reliability");
		expect(JSON.stringify(spec.paths["/harnesses/reliability"])).toContain(
			"successRate",
		);
	});

	it("GET /harnesses/reliability answers 200 with the reliability shape", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/harnesses/reliability",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(Array.isArray(body.reliability)).toBe(true);
		for (const entry of body.reliability) {
			expect(Object.keys(entry).sort()).toEqual(
				[
					"excludedRejected",
					"harnessId",
					"infraFailures",
					"lastRunAt",
					"recent",
					"runs",
					"successRate",
					"successes",
				].sort(),
			);
		}
	});

	it("GET /harnesses/reliability aggregates attributed reports and excludes rejections", async () => {
		// Hermetic wiring: the real route module + real aggregation over a
		// canned store, so fixture reports give exact assertions without
		// touching the live project dirs the shared app scans.
		const hermetic = Fastify();
		await hermetic.register(harnessesRoutes, {
			deps: {
				harnessRegistry: { list: () => [], get: () => null },
				sessionStore: { getHarness: () => null },
				taskStore: {
					projectStore: { listProjects: () => [{ id: "p1", cwd: null }] },
					listTasks: () => [
						{
							id: "t1",
							reports: [
								{
									harnessId: "pi",
									failureKind: "none",
									status: "PASSED",
									createdAt: "2026-10-01T10:00:00.000Z",
								},
								{
									harnessId: "pi",
									failureKind: "infrastructure",
									status: "FAILED",
									createdAt: "2026-10-01T11:00:00.000Z",
								},
								{
									harnessId: "pi",
									failureKind: "rejected",
									status: "FAILED",
									createdAt: "2026-10-01T12:00:00.000Z",
								},
								{ status: "PASSED", createdAt: "2026-10-01T13:00:00.000Z" },
							],
						},
					],
				},
			},
		});
		await hermetic.ready();

		const res = await hermetic.inject({
			method: "GET",
			url: "/harnesses/reliability",
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({
			reliability: [
				{
					harnessId: "pi",
					runs: 2,
					successes: 1,
					infraFailures: 1,
					excludedRejected: 1,
					successRate: 50,
					lastRunAt: "2026-10-01T12:00:00.000Z",
					recent: {
						runs: 2,
						successes: 1,
						infraFailures: 1,
						excludedRejected: 1,
						successRate: 50,
					},
				},
			],
		});
		await hermetic.close();
	});

	it("GET /harnesses/reliability counts reliability samples (run-driven, not report-driven)", async () => {
		// A task whose samples exist must count ONLY its samples — its
		// reports (opt-in success traces) are not double-counted, and a
		// sample-only task counts with no reports at all.
		const hermetic = Fastify();
		await hermetic.register(harnessesRoutes, {
			deps: {
				harnessRegistry: { list: () => [], get: () => null },
				sessionStore: { getHarness: () => null },
				taskStore: {
					projectStore: { listProjects: () => [{ id: "p1", cwd: null }] },
					listTasks: () => [
						{
							id: "t1",
							reliabilitySamples: [
								{ harnessId: "vibe", failureKind: "none", at: 1, atRaw: "2026-10-02T10:00:00.000Z" },
								{ harnessId: "vibe", failureKind: "none", at: 2 },
								{ harnessId: "vibe", failureKind: "none", at: 3 },
								{ harnessId: "vibe", failureKind: "none", at: 4 },
								{ harnessId: "vibe", failureKind: "infrastructure", at: 5 },
							],
							reports: [
								{ harnessId: "vibe", failureKind: "none", status: "PASSED", createdAt: "2026-10-01T10:00:00.000Z" },
							],
						},
						{
							id: "t2",
							reliabilitySamples: [
								{ harnessId: "vibe", failureKind: "rejected", at: 6, atRaw: "2026-10-02T12:00:00.000Z" },
							],
						},
					],
				},
			},
		});
		await hermetic.ready();

		const res = await hermetic.inject({
			method: "GET",
			url: "/harnesses/reliability",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.reliability).toHaveLength(1);
		expect(body.reliability[0]).toMatchObject({
			harnessId: "vibe",
			runs: 5,
			successes: 4,
			infraFailures: 1,
			excludedRejected: 1,
			successRate: 80,
			lastRunAt: "2026-10-02T12:00:00.000Z",
		});
		await hermetic.close();
	});

	it("never serves the curated fallback for non-default harnesses", async () => {
		// Regression: the curated fallback used to be served for EVERY
		// harness, so the antigravity picker offered pi-flavored entries
		// (antigravity::ollama-cloud::…) that can never resolve there.
		const fallbackIds = new Set(FALLBACK_MODELS.map((m) => m.id));
		for (const id of ["antigravity", "opencode"]) {
			const res = await app.inject({
				method: "GET",
				url: `/harnesses/${id}/models?refresh=true`,
			});
			expect(res.statusCode).toBe(200);
			const models = JSON.parse(res.payload).models;
			for (const model of models) {
				expect(model.harness).toBe(id);
				expect(model.key.startsWith(`${id}::`)).toBe(true);
				expect(fallbackIds.has(model.id)).toBe(false);
			}
		}
	});
});