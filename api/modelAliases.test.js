import { describe, it, expect } from "vitest";
import {
	ALIAS_HARNESS_ID,
	ALIAS_NAME_PATTERN,
	aliasTargetsSignature,
	getAliasTargets,
	normalizeAliasName,
	normalizeTargetPercents,
	selectWeightedIndex,
	validateAliasName,
	validateAliasTarget,
	validateAliasTargets,
	validateModelAlias,
	isAliasRef,
	normalizeModelAliases,
	getAliasList,
	resolveAlias,
	findAliasUsages,
	applyAliasRename,
	aliasPseudoModels,
} from "../shared/modelAliases.js";

/***
 * MARK: modelAliases unit tests
 * @description Pins the shared alias grammar: name validation, record
 *   validation (incl. the alias-target loop guard), reference detection,
 *   write-time normalization, lookup, usage finding, atomic rename
 *   migration, and catalogue pseudo-model projection.
 ***/

describe("normalizeAliasName", () => {
	it("trims names and blanks to empty", () => {
		expect(normalizeAliasName("  small ")).toBe("small");
		expect(normalizeAliasName("")).toBe("");
		expect(normalizeAliasName("   ")).toBe("");
		expect(normalizeAliasName(undefined)).toBe("");
		expect(normalizeAliasName(42)).toBe("");
	});
});

describe("validateAliasName", () => {
	it("accepts lowercase slug names", () => {
		for (const name of ["small", "medium", "large", "design", "a", "x-1_y"]) {
			expect(validateAliasName(name)).toBe(null);
		}
	});

	it("rejects blank, uppercase, spaced, and over-long names", () => {
		expect(validateAliasName("")).toMatch(/required/);
		expect(validateAliasName("   ")).toMatch(/required/);
		expect(validateAliasName("Small")).toMatch(/lowercase/);
		expect(validateAliasName("my alias")).toMatch(/lowercase/);
		expect(validateAliasName("-lead")).toMatch(/lowercase/);
		expect(validateAliasName("a".repeat(65))).toMatch(/at most/);
		expect(validateAliasName("a".repeat(64))).toBe(null);
	});
});

describe("validateModelAlias", () => {
	it("accepts a complete binding", () => {
		expect(
			validateModelAlias({ name: "small", harness: "pi", model: "google::m" }),
		).toBe(null);
	});

	it("rejects non-objects and bad names", () => {
		expect(validateModelAlias(null)).toMatch(/object/);
		expect(validateModelAlias([])).toMatch(/object/);
		expect(validateModelAlias({ name: "Small", harness: "pi", model: "m" })).toMatch(
			/lowercase/,
		);
	});

	it("rejects blank harness and alias-target loops", () => {
		expect(validateModelAlias({ name: "s", harness: "", model: "m" })).toMatch(
			/harness/,
		);
		expect(validateModelAlias({ name: "s", harness: "pi", model: 42 })).toMatch(
			/model/,
		);
		// Blank models are allowed: the target harness manages its own model
		// (`modelSelection: "none"` — dispatch skips the model switch).
		expect(validateModelAlias({ name: "s", harness: "custom", model: "" })).toBe(
			null,
		);
		expect(
			validateModelAlias({ name: "s", harness: "alias", model: "other" }),
		).toMatch(/cannot point at aliases/);
	});
});

describe("isAliasRef", () => {
	it("detects harness=alias pairs only", () => {
		expect(isAliasRef("alias", "small")).toBe(true);
		expect(isAliasRef(" alias ", "small")).toBe(true);
		expect(isAliasRef("alias", "")).toBe(false);
		expect(isAliasRef("alias", undefined)).toBe(false);
		expect(isAliasRef("pi", "small")).toBe(false);
		expect(isAliasRef("", "small")).toBe(false);
	});
});

describe("normalizeModelAliases", () => {
	it("trims, strips extras, drops invalids, and dedupes by name", () => {
		const out = normalizeModelAliases([
			{ name: " small ", harness: " pi ", model: " m ", extra: true },
			{ name: "small", harness: "other", model: "m2" },
			{ name: "Small", harness: "pi", model: "m" },
			{ name: "loop", harness: "alias", model: "small" },
			null,
			"nope",
		]);
		expect(out).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "m",
				targets: [{ harness: "pi", model: "m", percent: 100 }],
			},
		]);
	});

	it("returns [] for non-arrays", () => {
		expect(normalizeModelAliases(undefined)).toEqual([]);
		expect(normalizeModelAliases("small")).toEqual([]);
	});
});

describe("resolveAlias", () => {
	const project = {
		modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
	};
	it("hits on trimmed names and misses otherwise", () => {
		expect(resolveAlias(project, "small")).toEqual({
			name: "small",
			harness: "pi",
			model: "google::m",
			targets: [{ harness: "pi", model: "google::m", percent: 100 }],
		});
		expect(resolveAlias(project, " small ")).toEqual({
			name: "small",
			harness: "pi",
			model: "google::m",
			targets: [{ harness: "pi", model: "google::m", percent: 100 }],
		});
		expect(resolveAlias(project, "Small")).toBe(null);
		expect(resolveAlias(project, "missing")).toBe(null);
		expect(resolveAlias({}, "small")).toBe(null);
	});
});

describe("findAliasUsages", () => {
	it("finds stage references across workflows plus the project default", () => {
		const project = {
			harness: "alias",
			defaultModel: "small",
			workflows: [
				{
					id: "wf-1",
					stages: [
						{ id: "1", name: "A", harness: "alias", model: "small" },
						{ id: "2", name: "B", harness: "pi", model: "small" },
						{ id: "3", name: "C", harness: "alias", model: "large" },
					],
				},
			],
			stages: [{ id: "1", name: "A", harness: "alias", model: "small" }],
		};
		const usages = findAliasUsages(project, "small");
		expect(usages.usesAsDefault).toBe(true);
		// Legacy root list mirrors the workflow stage — deduped to one entry.
		expect(usages.stages).toHaveLength(1);
		expect(usages.stages[0]).toMatchObject({ stageId: "1", stageName: "A" });
		expect(findAliasUsages(project, "large").usesAsDefault).toBe(false);
		expect(findAliasUsages(project, "missing").stages).toEqual([]);
	});
});

describe("applyAliasRename", () => {
	it("migrates default + stage references and counts them", () => {
		const project = {
			harness: "alias",
			defaultModel: "small",
			workflows: [
				{
					id: "wf-1",
					stages: [
						{ id: "1", name: "A", harness: "alias", model: "small" },
						{ id: "2", name: "B", harness: "pi", model: "small" },
					],
				},
			],
			stages: [],
		};
		expect(applyAliasRename(project, "small", "medium")).toBe(2);
		expect(project.defaultModel).toBe("medium");
		expect(project.workflows[0].stages[0].model).toBe("medium");
		// Same-named model on another harness is untouched.
		expect(project.workflows[0].stages[1].model).toBe("small");
	});

	it("is a no-op for blank or identical names", () => {
		const project = { defaultModel: "small" };
		expect(applyAliasRename(project, "small", "small")).toBe(0);
		expect(applyAliasRename(project, "small", "")).toBe(0);
		expect(project.defaultModel).toBe("small");
	});
});

describe("validateModelAlias (weighted records)", () => {
	it("accepts a multi-target record whose percents sum to 100", () => {
		expect(
			validateModelAlias({
				name: "review",
				targets: [
					{ harness: "muse", model: "muse::muse-spark", percent: 90 },
					{ harness: "antigravity", model: "google::gemini-3", percent: 10 },
				],
			}),
		).toBe(null);
	});

	it("rejects bad percents, non-100 sums, and alias-target loops", () => {
		expect(
			validateModelAlias({
				name: "s",
				targets: [
					{ harness: "pi", model: "m", percent: 60 },
					{ harness: "custom", model: "", percent: 30 },
				],
			}),
		).toMatch(/100/);
		expect(
			validateModelAlias({
				name: "s",
				targets: [{ harness: "pi", model: "m", percent: 0 }],
			}),
		).toMatch(/percent/);
		expect(
			validateModelAlias({
				name: "s",
				targets: [{ harness: "pi", model: "m", percent: 50.5 }],
			}),
		).toMatch(/percent/);
		expect(
			validateModelAlias({ name: "s", targets: [] }),
		).toMatch(/at least one target/);
		expect(
			validateModelAlias({
				name: "s",
				targets: [{ harness: "alias", model: "other", percent: 100 }],
			}),
		).toMatch(/cannot point at aliases/);
	});

	it("still accepts the legacy single-target shape", () => {
		expect(
			validateModelAlias({ name: "small", harness: "pi", model: "google::m" }),
		).toBe(null);
		expect(validateModelAlias({ name: "s", harness: "custom", model: "" })).toBe(
			null,
		);
	});
});

describe("validateAliasTarget / validateAliasTargets", () => {
	it("checks percent bounds per target", () => {
		expect(
			validateAliasTarget({ harness: "pi", model: "m", percent: 100 }, "s"),
		).toBe(null);
		expect(
			validateAliasTarget({ harness: "", model: "m", percent: 100 }, "s"),
		).toMatch(/harness/);
		expect(
			validateAliasTarget({ harness: "pi", model: 42, percent: 100 }, "s"),
		).toMatch(/model/);
		expect(
			validateAliasTarget({ harness: "pi", model: "m", percent: 101 }, "s"),
		).toMatch(/percent/);
	});

	it("requires the split to total exactly 100", () => {
		const ok = [
			{ harness: "a", model: "m", percent: 33 },
			{ harness: "b", model: "n", percent: 33 },
			{ harness: "c", model: "o", percent: 34 },
		];
		expect(validateAliasTargets(ok, "s")).toBe(null);
		expect(
			validateAliasTargets(
				[
					{ harness: "a", model: "m", percent: 50 },
					{ harness: "b", model: "n", percent: 49 },
				],
				"s",
			),
		).toMatch(/100/);
	});
});

describe("getAliasTargets", () => {
	it("reads legacy records as one 100% target", () => {
		expect(
			getAliasTargets({ name: "s", harness: "pi", model: "google::m" }),
		).toEqual([{ harness: "pi", model: "google::m", percent: 100 }]);
	});

	it("returns weighted targets trimmed", () => {
		expect(
			getAliasTargets({
				name: "r",
				targets: [
					{ harness: " muse ", model: "spark", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			}),
		).toEqual([
			{ harness: "muse", model: "spark", percent: 90 },
			{ harness: "antigravity", model: "gem", percent: 10 },
		]);
	});

	it("drops alias-loop targets and yields [] for garbage", () => {
		expect(getAliasTargets({ name: "l", harness: "alias", model: "s" })).toEqual(
			[],
		);
		expect(getAliasTargets(null)).toEqual([]);
		expect(getAliasTargets({ name: "s" })).toEqual([]);
	});
});

describe("aliasTargetsSignature", () => {
	it("matches legacy and equivalent weighted records", () => {
		expect(
			aliasTargetsSignature({ name: "s", harness: "pi", model: "m" }),
		).toBe("pi::m@100");
		expect(
			aliasTargetsSignature({
				name: "s",
				targets: [{ harness: "pi", model: "m", percent: 100 }],
			}),
		).toBe("pi::m@100");
		expect(
			aliasTargetsSignature({
				name: "s",
				targets: [
					{ harness: "a", model: "m", percent: 90 },
					{ harness: "b", model: "n", percent: 10 },
				],
			}),
		).toBe("a::m@90|b::n@10");
	});
});

describe("normalizeTargetPercents", () => {
	it("spreads 100 evenly and sums exactly", () => {
		expect(
			normalizeTargetPercents([
				{ harness: "a", model: "m" },
				{ harness: "b", model: "n" },
			]),
		).toEqual([
			{ harness: "a", model: "m", percent: 50 },
			{ harness: "b", model: "n", percent: 50 },
		]);
		const thirds = normalizeTargetPercents([
			{ harness: "a", model: "m" },
			{ harness: "b", model: "n" },
			{ harness: "c", model: "o" },
		]);
		expect(thirds.reduce((sum, t) => sum + t.percent, 0)).toBe(100);
		expect(thirds.map((t) => t.percent).sort()).toEqual([33, 33, 34]);
		expect(normalizeTargetPercents([])).toEqual([]);
	});
});

describe("normalizeModelAliases (weighted upgrade)", () => {
	it("keeps weighted splits and mirrors the first target on the legacy fields", () => {
		const out = normalizeModelAliases([
			{
				name: "review",
				targets: [
					{ harness: "muse", model: "spark", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			},
		]);
		expect(out).toEqual([
			{
				name: "review",
				harness: "muse",
				model: "spark",
				targets: [
					{ harness: "muse", model: "spark", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			},
		]);
	});

	it("drops weighted rows whose split misses 100", () => {
		expect(
			normalizeModelAliases([
				{
					name: "bad",
					targets: [
						{ harness: "a", model: "m", percent: 60 },
						{ harness: "b", model: "n", percent: 30 },
					],
				},
			]),
		).toEqual([]);
	});
});

describe("selectWeightedIndex (smooth weighted round-robin)", () => {
	it("serves 90/10 exactly over 100 picks with the minority every 10th", () => {
		const scores = [0, 0];
		const picks = [];
		for (let i = 0; i < 100; i++) picks.push(selectWeightedIndex([90, 10], scores));
		expect(picks.filter((p) => p === 0)).toHaveLength(90);
		expect(picks.filter((p) => p === 1)).toHaveLength(10);
		const gaps = picks
			.map((p, i) => (p === 1 ? i : -1))
			.filter((i) => i >= 0);
		expect(gaps).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
	});

	it("alternates strictly on 50/50 and replays deterministically", () => {
		const first = [];
		const scoresA = [0, 0];
		for (let i = 0; i < 6; i++) first.push(selectWeightedIndex([50, 50], scoresA));
		expect(first).toEqual([0, 1, 0, 1, 0, 1]);
		const scoresB = [0, 0];
		for (let i = 0; i < 6; i++) {
			expect(selectWeightedIndex([50, 50], scoresB)).toBe(first[i]);
		}
	});

	it("yields -1 when there is nothing to pick", () => {
		expect(selectWeightedIndex([], [])).toBe(-1);
		expect(selectWeightedIndex([0, 0], [0, 0])).toBe(-1);
	});
});

describe("aliasPseudoModels", () => {
	it("projects aliases onto catalogue rows keyed by name", () => {
		expect(
			aliasPseudoModels([{ name: "small", harness: "pi", model: "m" }]),
		).toEqual([
			{
				id: "small",
				name: "small",
				provider: ALIAS_HARNESS_ID,
				key: "small",
				harness: ALIAS_HARNESS_ID,
			},
		]);
		expect(ALIAS_NAME_PATTERN.test("small")).toBe(true);
	});
});
