import { expect, test, describe, beforeEach } from "vitest";
import { resetAliasCounters } from "../../aliasSelector.js";
import { resolveAliasRequirement } from "./resolveAliasRequirement.js";

/***
 * MARK: resolveAliasRequirement Tests
 * @description Verifies D3 alias resolution for dispatch: exact smooth-WRR
 *   rotation over the shared backend-central counters, redistribution when
 *   no Runner serves a target harness, and loud nulls (never silent
 *   substitution) for unknown or blank aliases.
 ***/
describe("resolveAliasRequirement", () => {
	const project = {
		id: "p1",
		modelAliases: [
			{
				name: "fast",
				targets: [
					{ harness: "mock", model: "m1", percent: 90 },
					{ harness: "other", model: "m2", percent: 10 },
				],
			},
		],
	};

	beforeEach(() => {
		resetAliasCounters();
	});

	test("rotates 90/10 exactly: minority first on the 6th, then every 10th", () => {
		const picks = [];
		for (let i = 0; i < 20; i += 1) {
			const out = resolveAliasRequirement({
				project,
				aliasName: "fast",
				isHarnessKnown: () => true,
			});
			picks.push(out.targetIndex);
		}
		expect(picks.filter((t) => t === 1)).toHaveLength(2);
		expect(picks[5]).toBe(1);
		expect(picks[15]).toBe(1);
	});

	test("skips targets no Runner serves and redistributes the share", () => {
		for (let i = 0; i < 10; i += 1) {
			const out = resolveAliasRequirement({
				project,
				aliasName: "fast",
				isHarnessKnown: (h) => h === "mock",
			});
			expect(out).toMatchObject({ harness: "mock", model: "m1", targetIndex: 0 });
		}
	});

	test("returns null for unknown, blank, and missing aliases", () => {
		expect(
			resolveAliasRequirement({ project, aliasName: "nope", isHarnessKnown: () => true }),
		).toBeNull();
		expect(
			resolveAliasRequirement({ project, aliasName: "  ", isHarnessKnown: () => true }),
		).toBeNull();
		expect(resolveAliasRequirement({ project: {}, aliasName: "fast" })).toBeNull();
	});

	test("shares one rotation with the embedded path (backend-central)", async () => {
		const { selectAliasTarget } = await import("../../aliasSelector.js");
		for (let i = 0; i < 5; i += 1) {
			resolveAliasRequirement({ project, aliasName: "fast", isHarnessKnown: () => true });
		}
		// Five dispatch advances consumed the 90% head: the engine's very
		// next pick is the 6th-step minority. Separate counters would
		// restart at the head (0) instead.
		const viaEngine = selectAliasTarget(project, "fast", { isHarnessKnown: () => true });
		expect(viaEngine.targetIndex).toBe(1);
	});
});
