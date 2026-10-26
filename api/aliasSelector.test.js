import { describe, it, expect, beforeEach } from "vitest";
import {
	counterKeyFor,
	resetAliasCounters,
	selectAliasTarget,
} from "./aliasSelector.js";

/***
 * MARK: aliasSelector unit tests
 * @description Pins weighted alias resolution: exact 90/10 counts over 100
 *   resolutions with an even spread, strict 50/50 alternation, legacy
 *   single-target passthrough (no rotation state), unknown-harness targets
 *   skipped with their share redistributed, per-alias counter isolation,
 *   deterministic replay from fresh state, peek reads without advancing,
 *   and counter resets when the split is edited.
 ***/

function weightedProject(id, targets) {
	return {
		id,
		harness: "pi",
		defaultModel: "base",
		modelAliases: [{ name: "review", targets }],
	};
}

const NINETY_TEN = [
	{ harness: "muse", model: "spark", percent: 90 },
	{ harness: "antigravity", model: "gem", percent: 10 },
];

beforeEach(() => {
	resetAliasCounters();
});

describe("counterKeyFor", () => {
	it("scopes counters by project and alias", () => {
		expect(counterKeyFor({ id: "p1" }, "small")).toBe("p1:small");
		expect(counterKeyFor({}, "small")).toBe("default:small");
		expect(counterKeyFor({ id: "p1" }, "small")).not.toBe(
			counterKeyFor({ id: "p2" }, "small"),
		);
	});
});

describe("selectAliasTarget (legacy passthrough)", () => {
	it("resolves a legacy single-target alias without rotating", () => {
		const project = {
			id: "proj-legacy",
			modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
		};
		for (let i = 0; i < 5; i++) {
			expect(selectAliasTarget(project, "small")).toEqual({
				harness: "pi",
				model: "google::m",
				aliasName: "small",
				targetIndex: 0,
			});
		}
	});

	it("returns null for unknown, blank, sentinel, and loop aliases", () => {
		const project = {
			id: "proj-missing",
			modelAliases: [{ name: "loop", harness: "alias", model: "small" }],
		};
		expect(selectAliasTarget(project, "ghost")).toBe(null);
		expect(selectAliasTarget(project, "")).toBe(null);
		expect(selectAliasTarget(project, "default")).toBe(null);
		expect(selectAliasTarget(project, "loop")).toBe(null);
	});
});

describe("selectAliasTarget (weighted rotation)", () => {
	it("serves 90/10 exactly over 100 resolutions", () => {
		const project = weightedProject("proj-90-10", NINETY_TEN);
		const picks = [];
		for (let i = 0; i < 100; i++) picks.push(selectAliasTarget(project, "review"));
		expect(picks.filter((p) => p.targetIndex === 0)).toHaveLength(90);
		expect(picks.filter((p) => p.targetIndex === 1)).toHaveLength(10);
		for (const pick of picks) {
			expect(pick.aliasName).toBe("review");
			expect(["muse", "antigravity"]).toContain(pick.harness);
		}
	});

	it("spreads the minority pick evenly (never bunched, never starved)", () => {
		const project = weightedProject("proj-spread", NINETY_TEN);
		const gaps = [];
		let sinceMinority = 0;
		for (let i = 0; i < 100; i++) {
			const pick = selectAliasTarget(project, "review");
			sinceMinority += 1;
			if (pick.targetIndex === 1) {
				gaps.push(sinceMinority);
				sinceMinority = 0;
			}
		}
		expect(gaps).toHaveLength(10);
		// First minority lands on the 6th run, then exactly every 10th:
		// no clumps, no window of 10 runs starved of the minority target.
		expect(gaps[0]).toBe(6);
		for (const gap of gaps.slice(1)) expect(gap).toBe(10);
		expect(sinceMinority).toBeLessThanOrEqual(10);
	});

	it("alternates strictly on 50/50", () => {
		const project = weightedProject("proj-50-50", [
			{ harness: "a", model: "m", percent: 50 },
			{ harness: "b", model: "n", percent: 50 },
		]);
		const picks = [];
		for (let i = 0; i < 6; i++) picks.push(selectAliasTarget(project, "review").targetIndex);
		expect(picks).toEqual([0, 1, 0, 1, 0, 1]);
	});

	it("splits thirds within ±1 of exact", () => {
		const project = weightedProject("proj-thirds", [
			{ harness: "a", model: "m", percent: 33 },
			{ harness: "b", model: "n", percent: 33 },
			{ harness: "c", model: "o", percent: 34 },
		]);
		const counts = [0, 0, 0];
		for (let i = 0; i < 100; i++) {
			counts[selectAliasTarget(project, "review").targetIndex] += 1;
		}
		expect(counts).toEqual([33, 33, 34]);
	});

	it("isolates counters per alias and per project", () => {
		const project = {
			id: "proj-isolation",
			modelAliases: [
				{ name: "a", targets: NINETY_TEN },
				{ name: "b", targets: NINETY_TEN },
			],
		};
		const other = {
			id: "proj-other",
			modelAliases: [{ name: "a", targets: NINETY_TEN }],
		};
		for (let i = 0; i < 5; i++) selectAliasTarget(project, "a");
		// Untouched aliases replay from zero: first pick is the majority.
		expect(selectAliasTarget(project, "b").targetIndex).toBe(0);
		expect(selectAliasTarget(other, "a").targetIndex).toBe(0);
		// And the drained alias is mid-rotation, not restarted.
		expect(selectAliasTarget(project, "a").targetIndex).toBe(1);
	});

	it("replays deterministically from fresh counters", () => {
		const run = (id) => {
			const project = weightedProject(id, NINETY_TEN);
			const picks = [];
			for (let i = 0; i < 20; i++) {
				picks.push(selectAliasTarget(project, "review").targetIndex);
			}
			return picks;
		};
		resetAliasCounters();
		const first = run("proj-replay");
		resetAliasCounters();
		expect(run("proj-replay")).toEqual(first);
	});

	it("resets the rotation when the split is edited", () => {
		const project = weightedProject("proj-edit", NINETY_TEN);
		for (let i = 0; i < 5; i++) selectAliasTarget(project, "review");
		project.modelAliases = [
			{
				name: "review",
				targets: [
					{ harness: "muse", model: "spark", percent: 50 },
					{ harness: "antigravity", model: "gem", percent: 50 },
				],
			},
		];
		expect(selectAliasTarget(project, "review").targetIndex).toBe(0);
	});
});

describe("selectAliasTarget (unknown harnesses)", () => {
	const known = (name) => name !== "ghost-harness";

	it("skips unknown targets and redistributes their share", () => {
		const project = weightedProject("proj-skip", [
			{ harness: "ghost-harness", model: "m", percent: 90 },
			{ harness: "pi", model: "n", percent: 10 },
		]);
		for (let i = 0; i < 10; i++) {
			const pick = selectAliasTarget(project, "review", {
				isHarnessKnown: known,
			});
			expect(pick.harness).toBe("pi");
			expect(pick.targetIndex).toBe(1);
		}
	});

	it("returns null when no target has a known harness", () => {
		const project = weightedProject("proj-all-unknown", [
			{ harness: "ghost-harness", model: "m", percent: 100 },
		]);
		expect(
			selectAliasTarget(project, "review", { isHarnessKnown: known }),
		).toBe(null);
	});
});

describe("selectAliasTarget (injectable state + peek)", () => {
	it("drives the rotation from injected state for deterministic tests", () => {
		const project = weightedProject("proj-injected", NINETY_TEN);
		const state = {};
		const picks = [];
		for (let i = 0; i < 10; i++) {
			picks.push(selectAliasTarget(project, "review", { state }).targetIndex);
		}
		expect(picks.filter((p) => p === 1)).toHaveLength(1);
		// Shared counters untouched: a live resolution still starts fresh.
		expect(selectAliasTarget(project, "review").targetIndex).toBe(0);
	});

	it("peek reports the next target without consuming a step", () => {
		const project = weightedProject("proj-peek", NINETY_TEN);
		const peeked = selectAliasTarget(project, "review", { peek: true });
		expect(peeked.targetIndex).toBe(0);
		// Five peeks never advance: the live rotation still starts at zero.
		for (let i = 0; i < 5; i++) {
			expect(selectAliasTarget(project, "review", { peek: true }).targetIndex).toBe(0);
		}
		expect(selectAliasTarget(project, "review").targetIndex).toBe(0);
	});
});
