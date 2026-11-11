import { describe, test, expect } from "vitest";
import {
	describeFleetSection,
	fleetEntriesForHarness,
	fleetOnlyHarnessIds,
	mergeFleetIntoSections,
	projectFleetEntry,
} from "./fleetSectionMerge.js";

/***
 * MARK: fleetSectionMerge tests
 * @description Pins the backend half of the central-list merge. The
 *   attribution cases below are a PARITY PAIR with
 *   `frontend/src/services/fleetModelOptions.test.js` (same fixtures,
 *   same verdicts, both directions): the rule lives twice (backend
 *   sections + the frontend safety-net merge) and these tests name
 *   drift the moment the two disagree.
 ***/

const fleetEntry = (id, harnesses, over = {}) => ({
	id,
	harnesses,
	tiers: [],
	runnerCount: 1,
	runnerIds: ["r1"],
	...over,
});

describe("fleetEntriesForHarness (frontend parity)", () => {
	test("attributes harness-scoped ids strictly to their own section", () => {
		const entries = [fleetEntry("muse::meta::muse-spark-1.3", ["muse", "pi"])];
		expect(fleetEntriesForHarness("muse", entries).map((e) => e.id)).toEqual([
			"muse::meta::muse-spark-1.3",
		]);
		// pi serves it per the union, but the id names muse: never for pi.
		expect(fleetEntriesForHarness("pi", entries)).toEqual([]);
	});

	test("offers legacy and bare ids on every served section", () => {
		const entries = [fleetEntry("prov::m1", ["muse", "pi"]), fleetEntry("m2", ["pi"])];
		expect(fleetEntriesForHarness("muse", entries).map((e) => e.id)).toEqual(["prov::m1"]);
		expect(fleetEntriesForHarness("pi", entries).map((e) => e.id)).toEqual(["prov::m1", "m2"]);
	});

	test("withholds ids from sections no serving runner offers", () => {
		const entries = [fleetEntry("muse::meta::m", ["pi"])];
		expect(fleetEntriesForHarness("muse", entries)).toEqual([]);
		expect(fleetEntriesForHarness("pi", entries)).toEqual([]);
	});

	test("skips malformed ids and stays empty without fleet data", () => {
		const entries = [fleetEntry("a::b::c::d::e", ["muse"]), fleetEntry("", ["muse"])];
		expect(fleetEntriesForHarness("muse", entries)).toEqual([]);
		expect(fleetEntriesForHarness("muse", undefined)).toEqual([]);
		expect(fleetEntriesForHarness("muse", [])).toEqual([]);
		expect(fleetEntriesForHarness("", entries)).toEqual([]);
	});
});

describe("projectFleetEntry", () => {
	test("projects the exact advertised id with fleet availability", () => {
		expect(
			projectFleetEntry(
				fleetEntry("muse::meta::muse-spark-1.4", ["muse"], {
					tiers: ["T0"],
					runnerCount: 2,
					runnerIds: ["box-a", "box-b"],
				}),
				"muse",
			),
		).toEqual({
			key: "muse::meta::muse-spark-1.4",
			id: "muse-spark-1.4",
			provider: "meta",
			name: "muse-spark-1.4",
			harness: "muse",
			fleet: true,
			runnerCount: 2,
			runnerIds: ["box-a", "box-b"],
			tiers: ["T0"],
			available: true,
			unavailableReason: null,
		});
	});

	test("carries unavailable entries with their reason (never hidden)", () => {
		const model = projectFleetEntry(
			fleetEntry("muse::meta::old", ["muse"], {
				runnerCount: 0,
				runnerIds: [],
				available: false,
				unavailableReason: "No claim-eligible runner serves this model right now.",
			}),
			"muse",
		);
		expect(model).toMatchObject({
			key: "muse::meta::old",
			fleet: true,
			runnerCount: 0,
			available: false,
			unavailableReason: "No claim-eligible runner serves this model right now.",
		});
	});

	test("projects legacy and bare ids, null for malformed input", () => {
		expect(projectFleetEntry(fleetEntry("prov::m1", ["pi"]), "pi")).toMatchObject({
			key: "prov::m1",
			id: "m1",
			provider: "prov",
			name: "m1",
		});
		expect(projectFleetEntry(fleetEntry("bare", ["pi"]), "pi")).toMatchObject({
			key: "bare",
			id: "bare",
			provider: "",
		});
		expect(projectFleetEntry(fleetEntry("a::b::c::d::e", ["pi"]), "pi")).toBeNull();
		expect(projectFleetEntry(null, "pi")).toBeNull();
	});
});

describe("fleetOnlyHarnessIds", () => {
	test("collects fleet-only harness ids from strict segments and serving unions", () => {
		expect(
			fleetOnlyHarnessIds(
				[
					fleetEntry("muse::meta::m", ["muse"]),
					fleetEntry("prov::m1", ["muse", "pi"]),
					fleetEntry("brand::new::m", ["brand"]),
					fleetEntry("a::b::c::d::e", ["muse"]),
				],
				["pi"],
			),
		).toEqual(["brand", "muse"]);
	});

	test("ignores overreach ids and unknown-attribution legacy ids", () => {
		expect(
			fleetOnlyHarnessIds(
				[fleetEntry("muse::meta::m", ["pi"]), fleetEntry("prov::m1", [])],
				["pi"],
			),
		).toEqual([]);
	});
});

describe("describeFleetSection", () => {
	test("builds an honest unknown-backend section over attributable ids", () => {
		const section = describeFleetSection("muse", [
			fleetEntry("muse::meta::m", ["muse"]),
			fleetEntry("pi::p::x", ["pi"]),
		]);
		expect(section).toMatchObject({
			id: "muse",
			label: "muse",
			modelSelection: "list",
			isDefault: false,
			available: null,
			detectionSource: "fleet",
			fleetOnly: true,
		});
		expect(section.models.map((m) => m.key)).toEqual(["muse::meta::m"]);
	});

	test("returns null when nothing attributes", () => {
		expect(describeFleetSection("muse", [fleetEntry("pi::p::x", ["pi"])])).toBeNull();
		expect(describeFleetSection("", [fleetEntry("muse::meta::m", ["muse"])])).toBeNull();
	});
});

describe("mergeFleetIntoSections", () => {
	test("merges fleet-only ids into their section, backend entries win ties", () => {
		const views = [
			{
				id: "muse",
				models: [{ key: "muse::meta::muse-spark-1.3", id: "muse-spark-1.3", provider: "meta", name: "Spark 1.3" }],
			},
		];
		const merged = mergeFleetIntoSections(views, [
			fleetEntry("muse::meta::muse-spark-1.3", ["muse"], { runnerCount: 2 }),
			fleetEntry("muse::meta::muse-spark-1.4", ["muse"]),
		]);
		expect(merged[0].models.map((m) => m.key)).toEqual([
			"muse::meta::muse-spark-1.3",
			"muse::meta::muse-spark-1.4",
		]);
		// The backend entry (richer label) survives the tie untouched.
		expect(merged[0].models[0].name).toBe("Spark 1.3");
		// Inputs are never mutated.
		expect(views[0].models).toHaveLength(1);
	});

	test("appends union sections for fleet-only harnesses, sorted", () => {
		const merged = mergeFleetIntoSections([{ id: "pi", models: [] }], [
			fleetEntry("muse::meta::m", ["muse"]),
			fleetEntry("vibe::mistral::large", ["vibe"]),
		]);
		expect(merged.map((v) => v.id)).toEqual(["pi", "muse", "vibe"]);
		expect(merged[1].fleetOnly).toBe(true);
	});

	test("passes views through unchanged without fleet data", () => {
		const views = [{ id: "pi", models: [] }];
		expect(mergeFleetIntoSections(views, [])).toBe(views);
		expect(mergeFleetIntoSections(views)).toBe(views);
	});

	test("builds union sections even without backend views", () => {
		const merged = mergeFleetIntoSections(null, [fleetEntry("muse::meta::m", ["muse"])]);
		expect(merged.map((v) => v.id)).toEqual(["muse"]);
	});
});
