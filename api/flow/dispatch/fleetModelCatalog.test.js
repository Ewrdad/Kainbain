import { describe, test, expect } from "vitest";
import { buildFleetModelCatalog } from "./fleetModelCatalog.js";

const record = (over = {}) => ({
	status: "active",
	paused: false,
	runnerId: "r1",
	capabilities: { harnesses: [{ id: "pi" }], models: ["m1"], tiers: ["T0", "T1"] },
	operatorConfig: { availableModels: null },
	...over,
});

describe("buildFleetModelCatalog", () => {
	test("dedupes the same id across machines with a runner count", () => {
		const catalogue = buildFleetModelCatalog([
			record({
				runnerId: "box-a",
				capabilities: {
					harnesses: [{ id: "muse" }],
					models: ["muse::meta::muse-spark-1.3"],
					tiers: ["T0", "T1"],
				},
			}),
			record({
				runnerId: "box-b",
				capabilities: {
					harnesses: [{ id: "muse" }],
					models: ["muse::meta::muse-spark-1.3", "other-model"],
					tiers: ["T1"],
				},
			}),
		]);
		expect(catalogue.models).toEqual([
			{
				id: "muse::meta::muse-spark-1.3",
				harnesses: ["muse"],
				tiers: ["T0", "T1"],
				runnerCount: 2,
				runnerIds: ["box-a", "box-b"],
			},
			{
				id: "other-model",
				harnesses: ["muse"],
				tiers: ["T1"],
				runnerCount: 1,
				runnerIds: ["box-b"],
			},
		]);
	});

	test("excludes non-active and paused Runners", () => {
		const catalogue = buildFleetModelCatalog([
			record({ runnerId: "pending", status: "pending" }),
			record({ runnerId: "paused", paused: true }),
			record({ runnerId: "revoked", status: "revoked" }),
			record({ runnerId: "live" }),
		]);
		expect(catalogue.models).toEqual([
			{ id: "m1", harnesses: ["pi"], tiers: ["T0", "T1"], runnerCount: 1, runnerIds: ["live"] },
		]);
	});

	test("uses the operator allowlist instead of advertised models", () => {
		const catalogue = buildFleetModelCatalog([
			record({
				capabilities: { harnesses: [{ id: "pi" }], models: [], tiers: ["T0"] },
				operatorConfig: { availableModels: ["declared-model"] },
			}),
		]);
		expect(catalogue.models).toEqual([
			{
				id: "declared-model",
				harnesses: ["pi"],
				tiers: ["T0"],
				runnerCount: 1,
				runnerIds: ["r1"],
			},
		]);
	});

	test("skips blank ids and malformed records without throwing", () => {
		const catalogue = buildFleetModelCatalog([
			null,
			"nope",
			record({ runnerId: "", capabilities: { harnesses: [], models: ["m1"], tiers: [] } }),
			record({ capabilities: { harnesses: ["pi"], models: ["  ", null, "m2"], tiers: [null] } }),
			record({ capabilities: null, operatorConfig: { availableModels: ["m3"] } }),
		]);
		expect(catalogue.models).toEqual([
			{ id: "m2", harnesses: ["pi"], tiers: [], runnerCount: 1, runnerIds: ["r1"] },
			{ id: "m3", harnesses: [], tiers: [], runnerCount: 1, runnerIds: ["r1"] },
		]);
	});

	test("returns an empty catalogue when the fleet serves nothing", () => {
		expect(buildFleetModelCatalog([])).toEqual({ models: [] });
		expect(buildFleetModelCatalog()).toEqual({ models: [] });
		expect(buildFleetModelCatalog([record({ status: "revoked" })])).toEqual({ models: [] });
	});
});
