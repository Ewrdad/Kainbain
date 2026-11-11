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
		expect(buildFleetModelCatalog([])).toEqual({ models: [], quarantined: [] });
		expect(buildFleetModelCatalog()).toEqual({ models: [], quarantined: [] });
		expect(buildFleetModelCatalog([record({ status: "revoked" })])).toEqual({ models: [], quarantined: [] });
	});

	test("quarantines malformed advertised ids with a reason — never serves them", () => {
		const catalogue = buildFleetModelCatalog([
			record({
				runnerId: "bad-box",
				capabilities: {
					harnesses: [{ id: "pi" }],
					models: ["a::b::c::d::e", "ok::model", "pi::p::m"],
					tiers: ["T0"],
				},
			}),
			record({
				runnerId: "bad-box-2",
				capabilities: {
					harnesses: [{ id: "muse" }],
					models: ["a::b::c::d::e"],
					tiers: [],
				},
			}),
		]);
		expect(catalogue.models.map((m) => m.id).sort()).toEqual(["ok::model", "pi::p::m"]);
		expect(catalogue.quarantined).toEqual([
			{
				id: "a::b::c::d::e",
				reason: "malformed model key (empty segment or 5+ '::' segments)",
				runnerIds: ["bad-box", "bad-box-2"],
			},
		]);
	});

	test("single-colon ids are valid grammar and stay served", () => {
		const catalogue = buildFleetModelCatalog([
			record({
				capabilities: {
					harnesses: [{ id: "pi" }],
					models: ["pi::ollama-cloud::glm-5.3-flash:cloud"],
					tiers: [],
				},
			}),
		]);
		expect(catalogue.models).toEqual([
			{
				id: "pi::ollama-cloud::glm-5.3-flash:cloud",
				harnesses: ["pi"],
				tiers: [],
				runnerCount: 1,
				runnerIds: ["r1"],
			},
		]);
		expect(catalogue.quarantined).toEqual([]);
	});
});
