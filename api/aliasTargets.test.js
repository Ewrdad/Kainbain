import { describe, it, expect } from "vitest";
import {
	defaultModelIdsFor,
	modelRefMatchesIds,
	sanitizeAliasTargetModels,
	stripUnsupportedReasoningLevel,
	validateAliasTargetModels,
	validateDefaultModelCombination,
} from "./aliasTargets.js";

/***
 * MARK: aliasTargets tests
 * @description Pins the harness-aware alias target rules in two tiers: HARD
 *   errors refuse structurally impossible combinations (`none` harnesses
 *   paired with a model string, unknown harness ids, malformed refs) while
 *   SOFT warnings surface catalog-miss combinations (valid shape, absent
 *   from the target harness's catalog right now — never blocking). Legacy
 *   rows blank on load with a report of what was dropped.
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
	it("refuses a muse + model target, naming the alias and harness", async () => {
		const { error } = await validateAliasTargetModels(
			{
				name: "worker",
				targets: [
					{ harness: "muse", model: "antigravity::google::gemini-x", percent: 100 },
				],
			},
			opts,
		);
		expect(error).toContain("worker");
		expect(error).toContain("muse");
		expect(error).toContain("manages its own model");
	});

	it("refuses the legacy single-target shape on custom", async () => {
		const { error } = await validateAliasTargetModels(
			{ name: "cli", harness: "custom", model: "pi::m" },
			opts,
		);
		expect(error).toContain("cli");
		expect(error).toContain("custom");
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
		expect(
			(await validateAliasTargetModels({ name: "w", harness: "muse", model: "m" }))
				.error,
		).toContain("muse");
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

describe("sanitizeAliasTargetModels", () => {
	it("blanks none-harness models and reports the drops", () => {
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
		const { aliases, dropped } = sanitizeAliasTargetModels(input, {
			modelSelectionFor,
		});
		expect(aliases).toEqual([
			{
				name: "worker",
				harness: "muse",
				model: "",
				targets: [{ harness: "muse", model: "", percent: 100 }],
			},
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		expect(dropped).toEqual([
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
		expect(aliases[0].model).toBe("");
		expect(aliases[0].targets[1]).toEqual({
			harness: "pi",
			model: "google::m",
			percent: 50,
		});
	});

	it("passes non-array input through as no aliases", () => {
		expect(sanitizeAliasTargetModels(undefined, { modelSelectionFor })).toEqual({
			aliases: [],
			dropped: [],
		});
	});
});
