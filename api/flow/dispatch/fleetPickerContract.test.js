import { describe, test, expect } from "vitest";
import {
	createFleetModelSnapshotStore,
	summarizeFleetHarnesses,
} from "./fleetModelSnapshot.js";
import { fleetRunnerRecord } from "./fleetModelFixtures.mjs";
// Picker-map + strict harness gate (pure frontend modules, zero React):
// the same functions the pickers call, pinned against real store output.
import { fleetCountsById } from "../../../frontend/src/hooks/useFleetModelCatalog/fleetCountsById.js";
import { fleetModelsForHarness } from "../../../frontend/src/services/fleetModelOptions/fleetModelsForHarness.js";

/***
 * MARK: fleetPickerContract tests
 * @description A4 integration (WP-C-merge gate): the picker badge contract
 *   against a REAL `createFleetModelSnapshotStore({ filePath: null })` —
 *   no fixtures. Feeds runner registrations through `update()`, then
 *   through `fleetCountsById` + `fleetModelsForHarness`, asserting the
 *   exact picker inputs A1/A2/A3 render from (the counts→badge-label pins
 *   live in the frontend suites: `modelStatus.test.js`,
 *   `ModelSelector.test.jsx`). A frontend suite cannot host this: the
 *   repo forbids frontend→api imports (`tests/run-parallel.test.mjs`
 *   node-env contract, no escape hatch).
 */
const LIVE_ID = "muse::meta::muse-spark-1.3";
const RETIRED_ID = "custom::acme::retired";
const UNVERIFIED_ID = "muse::meta::unverified-9";
const PROVIDER_ID = "ollama-cloud-direct::gemma4:31b-cloud";

// Discovery-CONFIRMED capabilities: provenance lists the ids and each named
// leg succeeded just now (fresh per the WP-C window).
const confirmedCaps = (ids, legs = ["muse"]) => {
	const atMs = Date.now();
	return {
		harnesses: legs.map((id) => ({ id })),
		models: ids,
		modelSource: "discovered",
		modelProvenance: Object.fromEntries(ids.map((id) => [id, { harness: "muse", atMs }])),
		discoveryStatus: Object.fromEntries(
			legs.map((leg) => [leg, { ok: true, count: ids.length, atMs }]),
		),
	};
};

// An old-runner declaration: no provenance signal at all, so the snapshot
// counts the runner as declared (verified:false), never as serving.
const declaringRecord = (runnerId, id) =>
	fleetRunnerRecord({
		runnerId,
		capabilities: { harnesses: [{ id: "muse" }], models: [id], modelProvenance: undefined },
	});

const buildCatalogue = () => {
	const store = createFleetModelSnapshotStore({ filePath: null });
	// Round 1: box-a confirms the live + retired ids and a provider-form id.
	const round1 = fleetRunnerRecord({
		runnerId: "box-a",
		capabilities: confirmedCaps([LIVE_ID, RETIRED_ID, PROVIDER_ID], ["muse", "custom"]),
	});
	store.update([round1, declaringRecord("local-alpha", UNVERIFIED_ID)]);
	// Round 2: box-a withdraws the retired + provider ids (stops advertising).
	const round2 = fleetRunnerRecord({
		runnerId: "box-a",
		capabilities: confirmedCaps([LIVE_ID]),
	});
	const snapshot = store.update([round2, declaringRecord("local-alpha", UNVERIFIED_ID)]);
	return { snapshot, liveRunners: [round2] };
};

describe("fleet picker contract (real WP-C snapshot store)", () => {
	test("serves derived available/verified consistent with runnerCount > 0", () => {
		const { snapshot } = buildCatalogue();
		expect(snapshot.models.length).toBeGreaterThan(0);
		for (const entry of snapshot.models) {
			const served = entry.runnerCount > 0;
			expect(entry.verified, `${entry.id} verified`).toBe(served);
			expect(entry.available, `${entry.id} available`).toBe(served);
		}
		// The provider-form id quarantines with a reason instead of serving.
		expect(snapshot.quarantined.map((q) => q.id)).toContain(PROVIDER_ID);
		expect(snapshot.models.map((m) => m.id)).not.toContain(PROVIDER_ID);
	});

	test("A1: the withdrawn entry feeds {available:false, runnerCount:0} to the row badge", () => {
		const { snapshot } = buildCatalogue();
		const counts = fleetCountsById(snapshot);
		const retired = snapshot.models.find((m) => m.id === RETIRED_ID);
		expect(retired.runnerCount).toBe(0);
		expect(retired.available).toBe(false);
		// The exact input `fleetModelRowBadge` renders as "0 runners"
		// (label pinned in frontend `modelStatus.test.js`).
		// eslint-disable-next-line security/detect-object-injection -- constant fixture id, not user input
		expect(counts[RETIRED_ID].runnerCount).toBe(0);
	});

	test("A2: provider/bare ids never join a harness section", () => {
		const { snapshot } = buildCatalogue();
		const counts = fleetCountsById(snapshot);
		const muse = fleetModelsForHarness("muse", counts).map((m) => m.key);
		expect(muse).toContain(LIVE_ID);
		expect(muse).toContain(UNVERIFIED_ID);
		expect(muse).not.toContain(PROVIDER_ID);
		expect(muse).not.toContain(RETIRED_ID);
		// Verbatim brief case: serving-list admission alone never admits.
		expect(
			fleetModelsForHarness("muse", {
				"ollama-cloud-direct::gemma4:31b-cloud": { harnesses: ["muse", "pi"] },
			}),
		).toEqual([]);
	});

	test("A3: the muse harness feeds runnerCount 1 despite backend available:false", () => {
		const { liveRunners } = buildCatalogue();
		// The backend container has no muse binary (available:false) while the
		// fleet serves muse — counts win.
		const backendEntry = { id: "muse", available: false };
		expect(backendEntry.available).toBe(false);
		const harnesses = summarizeFleetHarnesses(liveRunners);
		const muse = harnesses.find((h) => h.id === "muse");
		// The exact input `fleetHarnessBadgeNode` renders as "1 runner"
		// (label pinned in frontend `ModelSelector.test.jsx`).
		expect(muse.runnerCount).toBe(1);
	});

	test("marks the unverified declaration without blocking it", () => {
		const { snapshot } = buildCatalogue();
		const counts = fleetCountsById(snapshot);
		// eslint-disable-next-line security/detect-object-injection -- constant fixture id, not user input
		const info = counts[UNVERIFIED_ID];
		expect(info.runnerCount).toBe(0);
		expect(info.verified).toBe(false);
		expect(info.declaredBy).toEqual(["local-alpha"]);
		// Still admitted to its section (selectable, annotated downstream).
		expect(fleetModelsForHarness("muse", counts).map((m) => m.key)).toContain(UNVERIFIED_ID);
	});
});
