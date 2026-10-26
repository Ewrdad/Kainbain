import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	agyModelsExitError,
	classifyAgyModelsFailure,
	createAgyModelCatalog,
	parseAgyModelsOutput,
	parseAgyModelRef,
} from "./agyModelCatalog.js";

/**
 * MARK: agyModelCatalog tests
 * @description Fixture-based coverage of the antigravity model catalog: the
 *   `agy models` output parser (including blank lines, bullets and header
 *   prose), TTL caching, resolveModelRef for bare slugs and
 *   `antigravity::<id>` composite keys, and the `:effort` suffix convention.
 */

const MODELS_OUTPUT = [
	"Available models:",
	"",
	"• gemini-3.8-flash-high    Fast everyday reasoning model",
	"gemini-3.1-pro-high      Most capable reasoning model",
	"gemini-2.5-pro           Previous-generation pro model",
	"claude-sonnet-4-6        Anthropic Claude Sonnet 4.6",
	"",
].join("\n");

describe("agy models output parser", () => {
	it("parses slug/description lines into provider-tagged, key-attached models", () => {
		const models = parseAgyModelsOutput(MODELS_OUTPUT);
		expect(models).toHaveLength(4);
		expect(models[0]).toEqual({
			provider: "antigravity",
			id: "gemini-3.8-flash-high",
			name: "Fast everyday reasoning model",
			key: "antigravity::antigravity::gemini-3.8-flash-high",
			harness: "antigravity",
		});
		expect(models[3].id).toBe("claude-sonnet-4-6");
	});

	it("skips blank lines, bullets and header prose", () => {
		const models = parseAgyModelsOutput("\n\n# section\nAvailable models:\n\n  gemini-3.1-pro-high\n\n");
		expect(models).toHaveLength(1);
		expect(models[0].id).toBe("gemini-3.1-pro-high");
	});

	it("treats a missing description as the slug itself", () => {
		const models = parseAgyModelsOutput("gemini-3.8-flash-high\n");
		expect(models[0].name).toBe("gemini-3.8-flash-high");
	});

	it("keeps digit-leading slugs intact (never strips bare digits/dots)", () => {
		// Regression: the old character-class prefix strip ate leading
		// digits/dots, corrupting `4o-mini` to `o-mini` and dropping
		// `2024.10-model` entirely (`model` is not slug-like).
		const models = parseAgyModelsOutput(
			"4o-mini                Fast small model\n2024.10-model          Dated release model\n",
		);
		expect(models.map((model) => model.id)).toEqual([
			"4o-mini",
			"2024.10-model",
		]);
		expect(models[0].name).toBe("Fast small model");
	});

	it("strips ordered-list markers and every bullet shape", () => {
		const models = parseAgyModelsOutput(
			[
				"1. gemini-3.1-pro-high      Numbered dot",
				"2) gemini-2.5-pro           Numbered paren",
				"10. claude-sonnet-4-6       Multi-digit marker",
				"- gemini-3.8-flash-high     Dash bullet",
				"* gemini-2.0-flash          Star bullet",
				"• gemini-1.5-pro            Dot bullet",
			].join("\n"),
		);
		expect(models.map((model) => model.id)).toEqual([
			"gemini-3.1-pro-high",
			"gemini-2.5-pro",
			"claude-sonnet-4-6",
			"gemini-3.8-flash-high",
			"gemini-2.0-flash",
			"gemini-1.5-pro",
		]);
	});

	it("does not mistake a version-like slug for an ordered-list marker", () => {
		// No whitespace after the dot/paren ⇒ not a list marker: the token
		// is the slug itself.
		const models = parseAgyModelsOutput("1.gemini-x   Tight version\n");
		expect(models.map((model) => model.id)).toEqual(["1.gemini-x"]);
	});

	it("returns an empty list for empty output", () => {
		expect(parseAgyModelsOutput("")).toEqual([]);
		expect(parseAgyModelsOutput(null)).toEqual([]);
	});
});

describe("agy model catalog (TTL cache + resolution)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads once and serves the cached list within the TTL", async () => {
		let loads = 0;
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => {
				loads += 1;
				return MODELS_OUTPUT;
			},
			ttlMs: 10_000,
		});

		const first = await catalog.listAgyModels();
		const second = await catalog.listAgyModels();
		expect(first).toBe(second); // cached identity
		expect(loads).toBe(1);

		vi.advanceTimersByTime(10_001);
		await catalog.listAgyModels();
		expect(loads).toBe(2);
	});

	it("degrades to an empty list when discovery fails", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => {
				throw new Error("agy not installed");
			},
		});
		const models = await catalog.listAgyModels();
		expect(models).toEqual([]);
		expect(catalog.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_MODELS_FAILED" }),
		});
		expect(catalog.lastDiscoveryError().message).toContain("agy not installed");
	});

	it("records an AGY_BIN_MISSING discovery error with a PATH hint on ENOENT", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => {
				throw new Error("spawn agy ENOENT");
			},
		});
		expect(await catalog.listAgyModels()).toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_BIN_MISSING",
		});
		expect(catalog.lastDiscoveryError().hint).toMatch(/KAINBAIN_AGY_BIN/);
		expect(catalog.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_BIN_MISSING" }),
		});
	});

	it("resolves bare slugs and composite provider::id keys", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => MODELS_OUTPUT,
		});
		const bare = await catalog.resolveModelRef("gemini-3.1-pro-high");
		expect(bare.id).toBe("gemini-3.1-pro-high");
		expect(bare.key).toBe("antigravity::antigravity::gemini-3.1-pro-high");

		// Canonical harness-scoped key resolves exactly.
		const scoped = await catalog.resolveModelRef("antigravity::antigravity::gemini-3.8-flash-high");
		expect(scoped.id).toBe("gemini-3.8-flash-high");

		// Legacy 2-part refs (pre-harness-scoping) still resolve via provider+id.
		const composite = await catalog.resolveModelRef("antigravity::gemini-3.8-flash-high");
		expect(composite.id).toBe("gemini-3.8-flash-high");

		expect(await catalog.resolveModelRef("no-such-model")).toBeNull();
	});

	it("resolves effort-suffixed refs and attaches the effort level", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => MODELS_OUTPUT,
		});
		const resolved = await catalog.resolveModelRef("gemini-2.5-pro:high");
		expect(resolved.id).toBe("gemini-2.5-pro");
		expect(resolved.effort).toBe("high");
		// The catalog has no model literally named "gemini-2.5-pro:high" — the
		// suffix convention is the only way this ref resolves.
		expect(await catalog.resolveModelRef("gemini-2.5-pro:ultra")).toBeNull();
	});

	it("resolves an effort-suffixed ref against the joined slug when the base slug is absent", async () => {
		// Real agy slugs embed the effort level (gemini-3.1-pro-high); the bare
		// base slug gemini-3.1-pro does NOT exist in this catalog, so the ref
		// resolves against the joined form <ref>-<effort> instead of soft-failing.
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => MODELS_OUTPUT,
		});
		const resolved = await catalog.resolveModelRef("gemini-3.1-pro:high");
		expect(resolved.id).toBe("gemini-3.1-pro-high");
		expect(resolved.effort).toBe("high");
		// Still null when neither the base nor the joined slug exists.
		expect(await catalog.resolveModelRef("no-such-model:high")).toBeNull();
	});

	it("prefers an exact slug over the suffix convention", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => MODELS_OUTPUT,
		});
		// gemini-3.8-flash-high contains "-high" (a dash, not a colon suffix) —
		// exact resolution wins and no effort is attached.
		const resolved = await catalog.resolveModelRef("gemini-3.8-flash-high");
		expect(resolved.effort).toBeUndefined();
	});

	it("keeps the provider:: part intact when splitting the effort suffix", () => {
		expect(parseAgyModelRef("antigravity::gemini-3.1-pro:high")).toEqual({
			ref: "antigravity::gemini-3.1-pro",
			effort: "high",
		});
		expect(parseAgyModelRef("antigravity::deepseek-v4-flash:0731-cloud")).toEqual({
			ref: "antigravity::deepseek-v4-flash:0731-cloud",
			effort: null,
		});
		expect(parseAgyModelRef("gemini-3.1-pro-high")).toEqual({
			ref: "gemini-3.1-pro-high",
			effort: null,
		});
	});
});

describe("agy models discovery spawn watchdog", () => {
	const MOCK_AGY = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		"fixtures",
		"mock-agy.mjs",
	);

	afterEach(() => {
		delete process.env.AGY_MOCK_MODELS_MODE;
	});

	it("bounds a hung `agy models` spawn: kills the child and degrades to empty list", async () => {
		// Without the watchdog, a hung discovery spawn pinned listModels() (and
		// agentRunner's model-selection await) until the stage timeout.
		process.env.AGY_MOCK_MODELS_MODE = "hang";
		const catalog = createAgyModelCatalog({
			agyBin: MOCK_AGY,
			spawnTimeoutMs: 150,
		});

		const started = performance.now();
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(performance.now() - started).toBeLessThan(5000);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_TIMEOUT",
		});
		expect(catalog.getModelDiscoveryStatus().ok).toBe(false);

		// The failed load is not cached: a retry re-runs discovery (and the
		// watchdog bounds it again rather than hanging).
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
	});

	it("still discovers models through the real spawn path when the CLI answers", async () => {
		const catalog = createAgyModelCatalog({ agyBin: MOCK_AGY });
		const models = await catalog.listAgyModels();
		expect(models.map((model) => model.id)).toEqual([
			"gemini-3.8-flash-high",
			"gemini-3.1-pro-high",
			"claude-sonnet-4-6",
		]);
	});
});

describe("agy models failure taxonomy", () => {
	it("builds the exit-code rejection from the child's code and stderr", () => {
		// The default spawn hands this error to the classifier; it is pure so the
		// mapping is provable without starting a real subprocess on a loaded host.
		expect(agyModelsExitError({ bin: "agy", code: 1, stderr: "boom\n" })).toEqual(
			expect.objectContaining({
				message: "'agy models' exited with code 1: boom",
			}),
		);
		expect(agyModelsExitError({ bin: "/opt/agy", code: 3 })).toEqual(
			expect.objectContaining({ message: "'/opt/agy models' exited with code 3: " }),
		);
	});

	it("tail-truncates long stderr so the useful end of a CLI failure survives", () => {
		const stderr = `${'x'.repeat(500)}TAIL`;
		const message = agyModelsExitError({ bin: "agy", code: 1, stderr }).message;
		expect(message).toHaveLength(400 + "'agy models' exited with code 1: ".length);
		expect(message.endsWith("TAIL")).toBe(true);
	});

	it("classifies a missing binary as AGY_BIN_MISSING with the KAINBAIN_AGY_BIN hint", () => {
		const error = classifyAgyModelsFailure(
			new Error("Failed to run 'agy models': spawn agy ENOENT"),
		);
		expect(error.code).toBe("AGY_BIN_MISSING");
		expect(error.message).toMatch(/not found/);
		expect(error.hint).toMatch(/KAINBAIN_AGY_BIN/);
	});

	it("classifies a watchdog trip as AGY_MODELS_TIMEOUT", () => {
		const error = classifyAgyModelsFailure(
			new Error("'agy models' timed out after 15000ms"),
		);
		expect(error.code).toBe("AGY_MODELS_TIMEOUT");
		expect(error.message).toMatch(/timed out/);
		expect(error.hint).toBeTruthy();
	});

	it("classifies auth failures as AGY_MODELS_AUTH with the login hint", () => {
		const error = classifyAgyModelsFailure(
			agyModelsExitError({
				bin: "agy",
				code: 1,
				stderr: "error: authentication required. Run `agy auth login` first.",
			}),
		);
		expect(error.code).toBe("AGY_MODELS_AUTH");
		expect(error.hint).toMatch(/agy auth login/);
	});

	it("classifies any other non-zero exit as AGY_MODELS_FAILED", () => {
		const error = classifyAgyModelsFailure(
			agyModelsExitError({ bin: "agy", code: 1, stderr: "boom" }),
		);
		expect(error.code).toBe("AGY_MODELS_FAILED");
		expect(error.message).toMatch(/boom/);
		expect(error.hint).toBeTruthy();
	});
});

describe("agy model catalog discovery status", () => {
	const MOCK_AGY = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		"fixtures",
		"mock-agy.mjs",
	);

	afterEach(() => {
		delete process.env.AGY_MOCK_MODELS_MODE;
	});

	it("retains the last discovery error and reports it via getModelDiscoveryStatus", async () => {
		const catalog = createAgyModelCatalog({
			agyBin: "/definitely/not/a/real/agy-binary",
		});
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_BIN_MISSING",
		});
		expect(catalog.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_BIN_MISSING" }),
		});
	});

	it("reports ok before any load and after a successful load clears a prior error", async () => {
		let failNext = true;
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () => {
				if (failNext) throw new Error("spawn agy ENOENT");
				return MODELS_OUTPUT;
			},
		});
		expect(catalog.getModelDiscoveryStatus()).toEqual({ ok: true });
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.getModelDiscoveryStatus().ok).toBe(false);
		failNext = false;
		await expect(catalog.listAgyModels()).resolves.toHaveLength(4);
		expect(catalog.lastDiscoveryError()).toBeNull();
		expect(catalog.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	// The classification matrix runs through the documented `spawnAgyModels`
	// seam. Each case reproduces exactly what the real spawn path rejects with
	// (see `agyModelsExitError` / the empty-output branch of `loadModels`), so
	// the taxonomy is provable without paying a real `node` child's startup on
	// a loaded gate host — a slow fork used to be misread as AGY_MODELS_TIMEOUT
	// and flaked the whole CI gate. Real-spawn coverage lives in the watchdog
	// and happy-path tests above/below, whose assertions hold regardless of how
	// long the host takes to schedule the child.
	const rejectingCatalog = (error) =>
		createAgyModelCatalog({
			spawnAgyModels: async () => {
				throw error;
			},
		});

	it("classifies auth failures as AGY_MODELS_AUTH", async () => {
		const catalog = rejectingCatalog(
			agyModelsExitError({
				bin: "agy",
				code: 1,
				stderr: "error: authentication required. Run `agy auth login` first.",
			}),
		);
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_AUTH",
			hint: expect.stringMatching(/agy auth login/),
		});
	});

	it("classifies other non-zero exits as AGY_MODELS_FAILED", async () => {
		const catalog = rejectingCatalog(
			agyModelsExitError({ bin: "agy", code: 1, stderr: "mock-agy: simulated models failure" }),
		);
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_FAILED",
		});
	});

	it("classifies exit-0 output with zero recognizable slugs as AGY_MODELS_UNPARSEABLE", async () => {
		const catalog = createAgyModelCatalog({
			spawnAgyModels: async () =>
				"Available models:\n\nComing soon in this region\nPlease try again later\n",
		});
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_UNPARSEABLE",
		});
	});

	it("classifies exit-0 empty output as AGY_MODELS_UNPARSEABLE", async () => {
		const catalog = createAgyModelCatalog({ spawnAgyModels: async () => "" });
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_UNPARSEABLE",
		});
	});

	it("surfaces a discovery failure as a non-ok status carrying the error", async () => {
		const catalog = rejectingCatalog(new Error("'agy models' exited with code 1: boom"));
		await catalog.listAgyModels();
		expect(catalog.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_MODELS_FAILED" }),
		});
	});

	it("classifies a hung spawn as AGY_MODELS_TIMEOUT through the watchdog", async () => {
		// The only real-spawn failure test: whether the child starts instantly or
		// the loaded host delays the fork past the watchdog, the outcome is the
		// same AGY_MODELS_TIMEOUT, so this assertion cannot flake on scheduling.
		process.env.AGY_MOCK_MODELS_MODE = "hang";
		const catalog = createAgyModelCatalog({
			agyBin: MOCK_AGY,
			spawnTimeoutMs: 150,
		});
		await expect(catalog.listAgyModels()).resolves.toEqual([]);
		expect(catalog.lastDiscoveryError()).toMatchObject({
			code: "AGY_MODELS_TIMEOUT",
		});
	});
});
