import { describe, it, expect } from "vitest";
import {
	defaultModelIdsFor,
	fleetAwareValidationProbes,
	fleetModelIdsByHarness,
	modelRefMatchesIds,
	sanitizeAliasTargetModels,
	stripUnsupportedReasoningLevel,
	validateAliasTargetModels,
	validateDefaultModelCombination,
} from "./aliasTargets.js";

/***
 * MARK: aliasTargets tests
 * @description Pins the harness-aware alias target rules in two tiers: HARD
 *   errors refuse structurally impossible combinations (unknown harness
 *   ids, malformed refs) while SOFT warnings surface catalog-miss
 *   combinations (valid shape, absent from the target harness's catalog
 *   right now — never blocking) and models stored on `none` harnesses
 *   (kept with a warning — alias trust). Stored rows survive load+save
 *   round-trips byte-identical, with warnings for the kept models.
 ***/

const noneHarnesses = new Set(["muse", "custom"]);
const modelSelectionFor = (harnessId) =>
	noneHarnesses.has(harnessId) ? "none" : "list";
const knownHarnesses = new Set(["pi", "antigravity", "mock", "muse", "custom"]);
const isKnownHarness = (harnessId) => knownHarnesses.has(harnessId);
// Catalog probe with one known model per harness; null = unreadable catalog.
const modelIdsFor = async (harnessId) =>
	harnessId === "antigravity"
		? null
		: new Set([`${harnessId}::known-model`, "known-model"]);

const opts = { modelSelectionFor, isKnownHarness, modelIdsFor };

describe("validateAliasTargetModels", () => {
	it("saves a muse + model target with a warning, naming the alias and harness", async () => {
		// Alias trust: a stored model on a self-managed harness is kept
		// (the backend's `none` is transient — fleet coverage can lift it
		// at any time), so the save succeeds with a loud warning.
		const { error, warnings } = await validateAliasTargetModels(
			{
				name: "worker",
				targets: [
					{ harness: "muse", model: "antigravity::google::gemini-x", percent: 100 },
				],
			},
			opts,
		);
		expect(error).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("worker");
		expect(warnings[0]).toContain("muse");
		expect(warnings[0]).toContain("manages its own model");
		expect(warnings[0]).toContain("kept");
	});

	it("saves the legacy single-target shape on custom with a warning", async () => {
		const { error, warnings } = await validateAliasTargetModels(
			{ name: "cli", harness: "custom", model: "pi::m" },
			opts,
		);
		expect(error).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("cli");
		expect(warnings[0]).toContain("custom");
	});

	it("accepts blank models on none harnesses and models on list harnesses", async () => {
		expect(
			(
				await validateAliasTargetModels(
					{ name: "w", harness: "muse", model: "" },
					opts,
				)
			).error,
		).toBeNull();
		expect(
			await validateAliasTargetModels(
				{
					name: "w",
					targets: [
						{ harness: "muse", model: "", percent: 80 },
						{ harness: "pi", model: "pi::known-model", percent: 20 },
					],
				},
				opts,
			),
		).toEqual({ error: null, warnings: [] });
		expect(
			(
				await validateAliasTargetModels(
					{ name: "s", harness: "pi", model: "pi::known-model" },
					opts,
				)
			).error,
		).toBeNull();
	});

	it("refuses unknown harness ids (structurally impossible, not drift)", async () => {
		// Was: tolerated ("dispatch warns + falls back"). Now: hard error —
		// an unknown harness can never resolve, so saving it only warns
		// forever at spawn.
		const { error } = await validateAliasTargetModels(
			{ name: "s", harness: "brand-new-harness", model: "m" },
			opts,
		);
		expect(error).toContain("brand-new-harness");
		expect(error).toContain("unknown harness");
	});

	it("refuses malformed model refs", async () => {
		const { error } = await validateAliasTargetModels(
			{ name: "s", harness: "pi", model: "a::b::c::d::e" },
			opts,
		);
		expect(error).toContain("malformed");
		expect(error).toContain("a::b::c::d::e");
	});

	it("warns softly (never blocks) on catalog misses", async () => {
		const { error, warnings } = await validateAliasTargetModels(
			{ name: "s", harness: "pi", model: "pi::missing-model" },
			opts,
		);
		expect(error).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("pi::missing-model");
		expect(warnings[0]).toContain("not in that harness's model catalog");
	});

	it("warns nothing when the catalog cannot be read (probe null)", async () => {
		expect(
			await validateAliasTargetModels(
				{ name: "s", harness: "antigravity", model: "anything::at-all" },
				opts,
			),
		).toEqual({ error: null, warnings: [] });
	});

	it("warns nothing when the probe throws (unhealthy harness, not a bad save)", async () => {
		const throwing = async () => {
			throw new Error("discovery down");
		};
		expect(
			await validateAliasTargetModels(
				{ name: "s", harness: "pi", model: "pi::missing-model" },
				{ ...opts, modelIdsFor: throwing },
			),
		).toEqual({ error: null, warnings: [] });
	});

	describe("reasoning levels (4th :: segment)", () => {
		const reasoningOpts = {
			...opts,
			reasoningLevelsFor: (harnessId) =>
				harnessId === "pi"
					? ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
					: harnessId === "mock"
						? ["low", "medium", "high"]
						: null,
		};

		it("saves a supported level on a reasoning harness", async () => {
			expect(
				await validateAliasTargetModels(
					{ name: "fast", harness: "pi", model: "pi::google::known-model::high" },
					reasoningOpts,
				),
			).toEqual({ error: null, warnings: [] });
		});

		it("accepts a 4-part model when harness is omitted on target, deriving harness from the model ref", async () => {
			expect(
				await validateAliasTargetModels(
					{ name: "fast", model: "pi::google::known-model::high" },
					reasoningOpts,
				),
			).toEqual({ error: null, warnings: [] });
		});

		it("refuses a level on a harness without adjustable reasoning", async () => {
			const { error } = await validateAliasTargetModels(
				{ name: "fast", harness: "opencode", model: "opencode::p::m::high" },
				{
					...reasoningOpts,
					isKnownHarness: (id) => isKnownHarness(id) || id === "opencode",
				},
			);
			expect(error).toContain("does not support");
			expect(error).toContain("adjustable reasoning");
		});

		it("refuses an unadvertised level, naming what the harness supports", async () => {
			const { error } = await validateAliasTargetModels(
				{ name: "fast", harness: "mock", model: "mock::provider::known-model::max" },
				reasoningOpts,
			);
			expect(error).toContain("max");
			expect(error).toContain("low, medium, high");
		});

		it("refuses a padded level as malformed", async () => {
			const { error } = await validateAliasTargetModels(
				{ name: "fast", harness: "pi", model: "pi::google::known-model:: high" },
				reasoningOpts,
			);
			expect(error).toContain("malformed");
		});

		it("hard-rejects bad defaultModel levels on payload saves, softly warns stored ones", async () => {
			const hard = await validateDefaultModelCombination(
				{ defaultModel: "pi::google::known-model::ultra", harness: "pi", fromPayload: true },
				reasoningOpts,
			);
			expect(hard.error).toContain("ultra");
			const soft = await validateDefaultModelCombination(
				{ defaultModel: "pi::google::known-model::ultra", harness: "pi", fromPayload: false },
				reasoningOpts,
			);
			expect(soft.error).toBeNull();
			expect(soft.warnings).toHaveLength(1);
			expect(soft.warnings[0]).toContain("stored value kept");
			expect(
				await validateDefaultModelCombination(
					{ defaultModel: "pi::google::known-model::high", harness: "pi", fromPayload: true },
					reasoningOpts,
				),
			).toEqual({ error: null, warnings: [] });
		});
	});

	describe("stripUnsupportedReasoningLevel (runtime fail-safe)", () => {
		const levelsFor = (harnessId) =>
			harnessId === "pi" ? ["low", "high"] : null;

		it("keeps supported levels and refs without one", () => {
			expect(
				stripUnsupportedReasoningLevel({
					modelRef: "pi::p::m::high",
					harnessName: "pi",
					reasoningLevelsFor: levelsFor,
				}),
			).toBe("pi::p::m::high");
			expect(
				stripUnsupportedReasoningLevel({
					modelRef: "pi::p::m",
					harnessName: "pi",
					reasoningLevelsFor: levelsFor,
				}),
			).toBe("pi::p::m");
		});

		it("strips unsupported levels, falling back to the ref's own harness", () => {
			expect(
				stripUnsupportedReasoningLevel({
					modelRef: "pi::p::m::ultra",
					harnessName: "pi",
					reasoningLevelsFor: levelsFor,
				}),
			).toBe("pi::p::m");
			// Unknown run harness: the level still holds when the ref's own
			// harness advertises it (the scope that owns its meaning).
			expect(
				stripUnsupportedReasoningLevel({
					modelRef: "pi::p::m::high",
					harnessName: "",
					reasoningLevelsFor: levelsFor,
				}),
			).toBe("pi::p::m::high");
			expect(
				stripUnsupportedReasoningLevel({
					modelRef: "opencode::p::m::high",
					harnessName: "",
					reasoningLevelsFor: levelsFor,
				}),
			).toBe("opencode::p::m");
		});
	});

	it("resolves against the real registry by default (muse is none, pi is list)", async () => {
		// muse on the exec transport is backend-`none`: the stored model
		// saves with a warning (kept), never refused.
		const kept = await validateAliasTargetModels({ name: "w", harness: "muse", model: "m" });
		expect(kept.error).toBeNull();
		expect(kept.warnings).toHaveLength(1);
		expect(kept.warnings[0]).toContain("muse");
		// Unknown harness against the real registry: hard error, no probe needed.
		expect(
			(
				await validateAliasTargetModels({
					name: "s",
					harness: "brand-new-harness",
					model: "m",
				})
			).error,
		).toContain("unknown harness");
	});
});

describe("validateDefaultModelCombination", () => {
	it("passes blank and sentinel defaults on every harness", async () => {
		for (const defaultModel of ["", "   ", "default", undefined]) {
			expect(
				await validateDefaultModelCombination(
					{ defaultModel, harness: "pi" },
					opts,
				),
			).toEqual({ error: null, warnings: [] });
		}
	});

	it("hard-rejects malformed payload refs, softly warns stored ones", async () => {
		const hard = await validateDefaultModelCombination(
			{ defaultModel: "a::b::c::d::e", harness: "pi", fromPayload: true },
			opts,
		);
		expect(hard.error).toContain("malformed");
		const soft = await validateDefaultModelCombination(
			{ defaultModel: "a::b::c::d::e", harness: "pi", fromPayload: false },
			opts,
		);
		expect(soft.error).toBeNull();
		expect(soft.warnings).toHaveLength(1);
		expect(soft.warnings[0]).toContain("malformed");
	});

	it("softly warns (never blocks) when a none harness ignores a stored default", async () => {
		const { error, warnings } = await validateDefaultModelCombination(
			{
				defaultModel: "antigravity::google::gemini-x",
				harness: "muse",
				fromPayload: true,
			},
			opts,
		);
		expect(error).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("manages its own model");
	});

	it("softly warns on catalog misses, stays silent on hits and unreadable catalogs", async () => {
		const miss = await validateDefaultModelCombination(
			{ defaultModel: "pi::missing-model", harness: "pi" },
			opts,
		);
		expect(miss.error).toBeNull();
		expect(miss.warnings).toHaveLength(1);
		expect(miss.warnings[0]).toContain("pi::missing-model");
		expect(
			await validateDefaultModelCombination(
				{ defaultModel: "pi::known-model", harness: "pi" },
				opts,
			),
		).toEqual({ error: null, warnings: [] });
		expect(
			await validateDefaultModelCombination(
				{ defaultModel: "anything::at-all", harness: "antigravity" },
				opts,
			),
		).toEqual({ error: null, warnings: [] });
	});

	it("checks alias-harness defaults as alias names (never as model refs)", async () => {
		// An unresolvable alias name warns softly, even when shaped like a
		// malformed ref (names are not refs on the alias harness).
		const { error, warnings } = await validateDefaultModelCombination(
			{ defaultModel: "a::b::c::d", harness: "alias" },
			{ ...opts, resolveAliasDefault: () => null },
		);
		expect(error).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("does not resolve");
		// A resolvable name stays silent.
		expect(
			await validateDefaultModelCombination(
				{ defaultModel: "worker", harness: "alias" },
				{ ...opts, resolveAliasDefault: () => ({ harness: "pi" }) },
			),
		).toEqual({ error: null, warnings: [] });
	});
});

describe("modelRefMatchesIds", () => {
	const ids = new Set(["pi::google::m", "google::m", "m", "Pretty M"]);

	it("matches 3-part keys by full key, provider pair, or bare id", () => {
		expect(modelRefMatchesIds("pi::google::m", ids)).toBe(true);
		expect(modelRefMatchesIds("pi::google::m::high", ids)).toBe(true);
		expect(modelRefMatchesIds("other::google::m", ids)).toBe(true);
		expect(modelRefMatchesIds("other::google::m::high", ids)).toBe(true);
		expect(modelRefMatchesIds("other::unknown::m", ids)).toBe(true);
		expect(modelRefMatchesIds("other::unknown::zzz", ids)).toBe(false);
		expect(modelRefMatchesIds("other::unknown::zzz::high", ids)).toBe(false);
	});

	it("matches 2-part keys and bare refs", () => {
		expect(modelRefMatchesIds("google::m", ids)).toBe(true);
		expect(modelRefMatchesIds("m", ids)).toBe(true);
		expect(modelRefMatchesIds("Pretty M", ids)).toBe(true);
		expect(modelRefMatchesIds("nope", ids)).toBe(false);
		expect(modelRefMatchesIds("", ids)).toBe(false);
		expect(modelRefMatchesIds("m", null)).toBe(false);
	});
});

describe("defaultModelIdsFor", () => {
	it("reads the mock harness catalog without network or CLI", async () => {
		const ids = await defaultModelIdsFor("mock");
		expect(ids).toBeInstanceOf(Set);
		expect(ids.has("mock::echo-v1")).toBe(true);
		expect(ids.has("echo-v1")).toBe(true);
	});

	it("returns null for unknown harnesses", async () => {
		expect(await defaultModelIdsFor("no-such-harness")).toBeNull();
		expect(await defaultModelIdsFor("")).toBeNull();
	});
});

describe("fleet-aware validation probes", () => {
	const fleetRegistry = {
		list: () => [
			{
				status: "active",
				paused: false,
				runnerId: "box-a",
				capabilities: {
					harnesses: [{ id: "muse" }],
					models: ["muse::meta::fleet-model"],
					tiers: ["T0"],
				},
			},
			{
				status: "active",
				paused: true,
				runnerId: "box-paused",
				capabilities: {
					harnesses: [{ id: "custom" }],
					models: ["custom::paused-only"],
					tiers: ["T0"],
				},
			},
		],
	};

	it("groups exact advertised ids by harness, skipping ineligible runners", () => {
		const byHarness = fleetModelIdsByHarness(fleetRegistry);
		expect([...(byHarness.get("muse") || [])]).toEqual(["muse::meta::fleet-model"]);
		expect(byHarness.has("custom")).toBe(false);
		expect(fleetModelIdsByHarness(null).size).toBe(0);
		expect(fleetModelIdsByHarness({ list: () => { throw new Error("down"); } }).size).toBe(0);
	});

	it("unions fleet ids into the catalog probe, preserving null-unknown", async () => {
		const { modelIdsFor } = fleetAwareValidationProbes(fleetRegistry);
		const mockIds = await modelIdsFor("mock");
		expect(mockIds.has("mock::echo-v1")).toBe(true);
		const museIds = await modelIdsFor("muse");
		expect(museIds.has("muse::meta::fleet-model")).toBe(true);
		expect(await modelIdsFor("no-such-harness")).toBeNull();
		const degraded = fleetAwareValidationProbes(null);
		expect(await degraded.modelIdsFor("mock")).toEqual(await defaultModelIdsFor("mock"));
	});

	it("reports list for a none harness the fleet serves, backend modes otherwise", () => {
		const { modelSelectionFor } = fleetAwareValidationProbes(fleetRegistry);
		expect(modelSelectionFor("mock")).toBe("list");
		// custom is backend-none; the paused runner does not count as serving.
		expect(modelSelectionFor("custom")).toBe("none");
		const degraded = fleetAwareValidationProbes(null);
		expect(degraded.modelSelectionFor("mock")).toBe("list");
	});

	it("accepts a fleet-only model on a fleet-served harness", async () => {
		const serving = {
			list: () => [
				{
					status: "active",
					paused: false,
					runnerId: "box-a",
					capabilities: {
						harnesses: [{ id: "custom" }],
						models: ["custom::fleet-model"],
						tiers: ["T0"],
					},
				},
			],
		};
		const probes = fleetAwareValidationProbes(serving);
		expect(probes.modelSelectionFor("custom")).toBe("list");
		const { error, warnings } = await validateAliasTargetModels(
			{ name: "w", targets: [{ harness: "custom", model: "custom::fleet-model", percent: 100 }] },
			{ modelSelectionFor: probes.modelSelectionFor, modelIdsFor: probes.modelIdsFor },
		);
		expect(error).toBeNull();
		expect(warnings).toEqual([]);
	});
});

describe("sanitizeAliasTargetModels", () => {
	it("keeps none-harness models and reports the kept values", () => {
		// Alias trust: the load path never destroys a stored target — a
		// model on a `none` harness survives verbatim, with one warning
		// per kept model for the load log.
		const input = [
			{
				name: "worker",
				harness: "muse",
				model: "antigravity::google::gemini-legacy",
				targets: [
					{ harness: "muse", model: "antigravity::google::gemini-legacy", percent: 100 },
				],
			},
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		];
		const { aliases, warnings } = sanitizeAliasTargetModels(input, {
			modelSelectionFor,
		});
		expect(aliases).toEqual([
			{
				name: "worker",
				harness: "muse",
				model: "antigravity::google::gemini-legacy",
				targets: [
					{ harness: "muse", model: "antigravity::google::gemini-legacy", percent: 100 },
				],
			},
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		expect(warnings).toEqual([
			{
				alias: "worker",
				harness: "muse",
				model: "antigravity::google::gemini-legacy",
			},
		]);
		// The input is never mutated.
		expect(input[0].model).toBe("antigravity::google::gemini-legacy");
	});

	it("recomputes the legacy mirror from the first target", () => {
		const { aliases } = sanitizeAliasTargetModels(
			[
				{
					name: "w",
					harness: "muse",
					model: "stale",
					targets: [
						{ harness: "muse", model: "stale", percent: 50 },
						{ harness: "pi", model: "google::m", percent: 50 },
					],
				},
			],
			{ modelSelectionFor },
		);
		// The legacy mirror recomputes from the first target — whose
		// stored model is kept, never blanked.
		expect(aliases[0].model).toBe("stale");
		expect(aliases[0].targets[1]).toEqual({
			harness: "pi",
			model: "google::m",
			percent: 50,
		});
	});

	it("passes non-array input through as no aliases", () => {
		expect(sanitizeAliasTargetModels(undefined, { modelSelectionFor })).toEqual({
			aliases: [],
			warnings: [],
		});
	});

	it("keeps none-harness models with a warning instead of wiping them (alias trust)", () => {
		// A stored target the user saved must survive load even when the
		// backend harness currently reports `none` (muse on the exec
		// transport): keep the last working value, warn loudly, never blank.
		const { aliases, warnings } = sanitizeAliasTargetModels(
			[
				{
					name: "worker",
					harness: "muse",
					model: "muse::meta::muse-spark-1.3",
					targets: [{ harness: "muse", model: "muse::meta::muse-spark-1.3", percent: 100 }],
				},
			],
			{ modelSelectionFor },
		);
		expect(aliases[0].model).toBe("muse::meta::muse-spark-1.3");
		expect(aliases[0].targets[0].model).toBe("muse::meta::muse-spark-1.3");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			alias: "worker",
			harness: "muse",
			model: "muse::meta::muse-spark-1.3",
		});
	});

	it("byte-survives catalogue churn across save+load round-trips (phase 5 gate)", async () => {
		// Save a muse alias target, then churn the world around it: the
		// harness flaps none→list→none, the catalog empties, a new model
		// arrives. The stored target must survive every round-trip
		// byte-identical, with a warning whenever the harness cannot
		// serve it right now — never a wipe, never a retarget.
		const stored = "muse::meta::muse-spark-1.3";
		const row = {
			name: "worker",
			harness: "muse",
			model: stored,
			targets: [{ harness: "muse", model: stored, percent: 100 }],
		};
		const noneThenList = (harnessId) =>
			harnessId === "muse" ? "none" : "list";
		// 1. Exec backend (muse is none): save succeeds with a warning.
		const saved = await validateAliasTargetModels(row, {
			...opts,
			modelSelectionFor: noneThenList,
		});
		expect(saved.error).toBeNull();
		expect(saved.warnings).toHaveLength(1);
		// 2. Load on the exec backend keeps the value with a warning.
		const loaded = sanitizeAliasTargetModels([row], {
			modelSelectionFor: noneThenList,
		});
		expect(loaded.aliases[0].targets[0].model).toBe(stored);
		expect(loaded.warnings).toHaveLength(1);
		// 3. Fleet coverage arrives (muse behaves as list, new model in
		// the catalog): the stored target still saves, unmoved.
		const fleetList = (harnessId) => "list";
		const fleetCatalog = async (harnessId) =>
			new Set([`${harnessId}::known-model`, stored, "muse::meta::muse-spark-1.4"]);
		const covered = await validateAliasTargetModels(row, {
			...opts,
			modelSelectionFor: fleetList,
			modelIdsFor: fleetCatalog,
		});
		expect(covered.error).toBeNull();
		// 4. Coverage lapses and the catalog empties: still saves with a
		// soft catalog-miss warning, still byte-identical.
		const emptyCatalog = async () => new Set();
		const lapsed = await validateAliasTargetModels(row, {
			...opts,
			modelSelectionFor: fleetList,
			modelIdsFor: emptyCatalog,
		});
		expect(lapsed.error).toBeNull();
		expect(lapsed.warnings).toHaveLength(1);
		expect(lapsed.warnings[0]).toContain(stored);
		const reloaded = sanitizeAliasTargetModels([row], {
			modelSelectionFor: noneThenList,
		});
		expect(reloaded.aliases[0].model).toBe(stored);
	});
});
