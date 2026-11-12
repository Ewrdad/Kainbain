import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFleetModelCatalog } from "./fleetModelCatalog.js";
import {
	FLEET_ENTRY_UNAVAILABLE_REASON,
	createFleetModelSnapshotStore,
	normalizeSnapshotState,
	resolveFleetSnapshotPath,
} from "./fleetModelSnapshot.js";
import { NEW_MODEL_ID, fleetRunnerRecord } from "./fleetModelFixtures.mjs";

const tmpDirs = [];
afterEach(() => {
	while (tmpDirs.length > 0) {
		try {
			fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});
const tempFile = (name) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-snapshot-"));
	tmpDirs.push(dir);
	return path.join(dir, name);
};
// Every store under test mints its own temp file: no suite may read or
// write the live `~/.kainbain/engine/fleet-catalog.json`.
let tmpCounter = 0;
const tempStore = () => createFleetModelSnapshotStore({ filePath: tempFile(`fleet-${tmpCounter++}.json`) });

describe("createFleetModelSnapshotStore", () => {
	test("serves normalized harness::model::effort entries with provenance", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: [NEW_MODEL_ID],
					modelSource: "discovered",
					modelProvenance: { [NEW_MODEL_ID]: { harness: "muse", atMs: 1700000000000 } },
				},
			}),
		]);
		expect(snapshot.models).toEqual([
			{
				id: NEW_MODEL_ID,
				form: "harness",
				harness: "muse",
				provider: "meta",
				model: "muse-spark-1.4",
				reasoning: null,
				harnesses: ["muse"],
				tiers: ["T0", "T1"],
				runnerIds: ["box-a"],
				runnerCount: 1,
				claimedBy: [],
				available: true,
				unavailableReason: null,
				firstSeenAtMs: snapshot.updatedAtMs,
				lastSeenAtMs: snapshot.updatedAtMs,
				provenance: { "box-a": { harnesses: ["muse"], atMs: 1700000000000, source: "discovered" } },
			},
		]);
		expect(snapshot.quarantined).toEqual([]);
		expect(typeof snapshot.updatedAtMs).toBe("number");
	});

	test("unions tiers and runners across machines, old runners read as unknown source", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({ runnerId: "box-a", capabilities: { tiers: ["T0"] } }),
			fleetRunnerRecord({ runnerId: "box-b", capabilities: { tiers: ["T1"] } }),
		]);
		expect(snapshot.models[0]).toMatchObject({
			tiers: ["T0", "T1"],
			runnerIds: ["box-a", "box-b"],
			runnerCount: 2,
			provenance: {
				"box-a": { harnesses: ["muse"], atMs: null, source: "unknown" },
				"box-b": { harnesses: ["muse"], atMs: null, source: "unknown" },
			},
		});
	});

	test("marks missing entries unavailable with a reason instead of deleting them", () => {
		const store = tempStore();
		store.update([fleetRunnerRecord({ runnerId: "box-a" })], { atMs: 1000 });
		const snapshot = store.update([], { atMs: 2000 });
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: NEW_MODEL_ID,
			available: false,
			unavailableReason: FLEET_ENTRY_UNAVAILABLE_REASON,
			runnerIds: [],
			runnerCount: 0,
			firstSeenAtMs: 1000,
			lastSeenAtMs: 1000,
			harnesses: ["muse"],
		});
		// A returning runner flips the entry back to available.
		const back = store.update([fleetRunnerRecord({ runnerId: "box-a" })], { atMs: 3000 });
		expect(back.models[0]).toMatchObject({
			available: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			firstSeenAtMs: 1000,
			lastSeenAtMs: 3000,
		});
	});

	test("quarantines malformed ids with a reason, never serving them", () => {
		const store = tempStore();
		const snapshot = store.update(
			[fleetRunnerRecord({ capabilities: { models: ["a::b::c::d::e", "muse::::x", NEW_MODEL_ID] } })],
			{ atMs: 500 },
		);
		expect(snapshot.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		expect(snapshot.quarantined).toEqual([
			{
				id: "a::b::c::d::e",
				reason: 'Model id "a::b::c::d::e" has 5 segments (want at most 4: harness::provider::id::reasoning).',
				runnerIds: ["fleet-fixture-1"],
				firstSeenAtMs: 500,
				lastSeenAtMs: 500,
			},
			{
				id: "muse::::x",
				reason: 'Model id "muse::::x" has an empty segment (every part between :: must be non-empty).',
				runnerIds: ["fleet-fixture-1"],
				firstSeenAtMs: 500,
				lastSeenAtMs: 500,
			},
		]);
	});

	test("serves legacy and bare ids (accepted forms, never quarantined)", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({ capabilities: { models: ["prov::m1", "bare-model"] } }),
		]);
		expect(snapshot.models.map((m) => [m.id, m.form])).toEqual([
			["bare-model", "bare"],
			["prov::m1", "provider"],
		]);
		expect(snapshot.quarantined).toEqual([]);
	});

	test("ignores ineligible runners and honors the operator allowlist", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({ runnerId: "paused", paused: true }),
			fleetRunnerRecord({ runnerId: "pending", status: "pending" }),
			fleetRunnerRecord({ runnerId: "revoked", status: "revoked" }),
			fleetRunnerRecord({
				runnerId: "live",
				capabilities: { models: [] },
				operatorConfig: { availableModels: ["declared-model"] },
			}),
		]);
		expect(snapshot.models.map((m) => m.id)).toEqual(["declared-model"]);
		expect(snapshot.models[0].runnerIds).toEqual(["live"]);
	});

	test("matches the live fleet builder on well-formed inputs (core-field parity)", () => {
		const runners = [
			fleetRunnerRecord({ runnerId: "box-a" }),
			fleetRunnerRecord({
				runnerId: "box-b",
				capabilities: { models: [NEW_MODEL_ID, "other-model"], tiers: ["T1"] },
			}),
		];
		const store = tempStore();
		const snapshot = store.update(runners);
		const live = buildFleetModelCatalog(runners);
		expect(
			snapshot.models.map((m) => ({
				id: m.id,
				harnesses: m.harnesses,
				tiers: m.tiers,
				runnerCount: m.runnerCount,
				runnerIds: m.runnerIds,
			})),
		).toEqual(live.models);
	});

	test("persists across restarts and degrades a rotted file to empty", () => {
		const file = tempFile("fleet-catalog.json");
		const first = createFleetModelSnapshotStore({ filePath: file });
		first.update([fleetRunnerRecord({ runnerId: "box-a" })], { atMs: 1000 });
		expect(fs.existsSync(file)).toBe(true);
		const second = createFleetModelSnapshotStore({ filePath: file });
		expect(second.read().models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		// A rotted file loads as empty, never throws.
		fs.writeFileSync(file, "{not json");
		const third = createFleetModelSnapshotStore({ filePath: file });
		expect(third.read()).toEqual({ models: [], quarantined: [], updatedAtMs: null });
	});

	test("runs memory-only when persistence is disabled", () => {
		const store = createFleetModelSnapshotStore({ filePath: "" });
		const snapshot = store.update([fleetRunnerRecord({ runnerId: "box-a" })]);
		expect(snapshot.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		// null disables too — an explicit null must never read/write the
		// configured live engine file.
		const nullStore = createFleetModelSnapshotStore({ filePath: null });
		expect(nullStore.update([fleetRunnerRecord({ runnerId: "box-a" })]).models.map((m) => m.id)).toEqual([
			NEW_MODEL_ID,
		]);
		expect(nullStore.read().models).toHaveLength(1);
	});

	test("evicts oldest-unavailable entries first under the cap", () => {
		const store = tempStore();
		const runners = [];
		for (let i = 0; i < 10005; i += 1) {
			runners.push(
				fleetRunnerRecord({ runnerId: `r${i}`, capabilities: { models: [`stale-${i}`] } }),
			);
		}
		store.update(runners, { atMs: 1000 });
		// All unavailable now: entries exceed the cap, oldest evicted.
		const snapshot = store.update([], { atMs: 2000 });
		expect(snapshot.models.length).toBeLessThanOrEqual(10000);
	});

	test("marks pin-only ids stale when a successful scan contradicts them (never served as available)", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: ["muse::meta::retired-pin-model"],
					modelSource: "pinned+discovered",
					// Present-but-empty provenance from a new runner: the scan
					// ran and confirmed nothing, so the pin is contradicted.
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 2, atMs: 1700000000000 } },
				},
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: "muse::meta::retired-pin-model",
			available: false,
			runnerIds: [],
			runnerCount: 0,
			claimedBy: ["box-a"],
			// Attribution survives: the entry still lands in its section,
			// marked unavailable — never hidden, never normal-looking.
			harnesses: ["muse"],
			tiers: ["T0", "T1"],
		});
		expect(snapshot.models[0].unavailableReason).toMatch(/stale/i);
		expect(snapshot.quarantined).toEqual([]);
	});

	test("a confirming runner keeps the entry available while stale claimants are named", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					modelProvenance: { [NEW_MODEL_ID]: { harness: "muse", atMs: 1700000000000 } },
					discoveryStatus: { muse: { ok: true, count: 1, atMs: 1700000000000 } },
				},
			}),
			fleetRunnerRecord({
				runnerId: "box-b",
				capabilities: {
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 3, atMs: 1700000000000 } },
				},
			}),
		]);
		expect(snapshot.models[0]).toMatchObject({
			id: NEW_MODEL_ID,
			available: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			runnerCount: 1,
			claimedBy: ["box-b"],
		});
	});

	test("serves operator-asserted ids as available despite a contradicting scan", () => {
		// The availableModels override is an explicit servability
		// declaration: it wins over the runner's own scan, in the
		// snapshot exactly as in dispatch.
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: [],
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 2, atMs: 1700000000000 } },
				},
				operatorConfig: { availableModels: ["muse::meta::declared-model"] },
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: "muse::meta::declared-model",
			available: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			runnerCount: 1,
			claimedBy: [],
		});
	});

	test("trusts pins when the scan cannot speak: failed, missing, or old-runner signals", () => {
		const store = tempStore();
		const snapshot = store.update([
			// Failed scan: inconclusive, the pin may still be right.
			fleetRunnerRecord({
				runnerId: "scan-failed",
				capabilities: {
					models: ["muse::meta::maybe-here"],
					modelProvenance: {},
					discoveryStatus: { muse: { ok: false, count: 0, atMs: 1, error: { code: "MUSE_MSP_TIMEOUT" } } },
				},
			}),
			// Never scanned this harness: no slice, nothing to contradict.
			fleetRunnerRecord({
				runnerId: "never-scanned",
				capabilities: {
					models: ["muse::meta::maybe-here-too"],
					modelProvenance: {},
					discoveryStatus: {},
				},
			}),
			// Old runner: no provenance signal at all, trusted as before.
			fleetRunnerRecord({
				runnerId: "old-runner",
				capabilities: { models: ["muse::meta::old-pin"] },
			}),
		]);
		expect(snapshot.models).toMatchObject([
			{ id: "muse::meta::maybe-here", available: true, runnerIds: ["scan-failed"], claimedBy: [] },
			{ id: "muse::meta::maybe-here-too", available: true, runnerIds: ["never-scanned"], claimedBy: [] },
			{ id: "muse::meta::old-pin", available: true, runnerIds: ["old-runner"], claimedBy: [] },
		]);
	});

	test("never marks legacy or bare ids stale (their attribution is lenient by design)", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: ["prov::m1", "bare-model"],
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 1, atMs: 1 } },
				},
			}),
		]);
		expect(snapshot.models).toMatchObject([
			{ id: "bare-model", available: true, runnerIds: ["box-a"], claimedBy: [] },
			{ id: "prov::m1", available: true, runnerIds: ["box-a"], claimedBy: [] },
		]);
	});

	test("a stale entry recovers when a later scan confirms it", () => {
		const store = tempStore();
		const stale = store.update(
			[
				fleetRunnerRecord({
					runnerId: "box-a",
					capabilities: {
						modelProvenance: {},
						discoveryStatus: { muse: { ok: true, count: 1, atMs: 1000 } },
					},
				}),
			],
			{ atMs: 1000 },
		);
		expect(stale.models[0]).toMatchObject({ available: false, claimedBy: ["box-a"] });
		const back = store.update(
			[
				fleetRunnerRecord({
					runnerId: "box-a",
					capabilities: {
						modelProvenance: { [NEW_MODEL_ID]: { harness: "muse", atMs: 2000 } },
						discoveryStatus: { muse: { ok: true, count: 1, atMs: 2000 } },
					},
				}),
			],
			{ atMs: 2000 },
		);
		expect(back.models[0]).toMatchObject({
			available: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			claimedBy: [],
			firstSeenAtMs: 1000,
			lastSeenAtMs: 2000,
		});
	});
});

describe("normalizeSnapshotState", () => {
	test("keeps well-formed entries and drops garbage", () => {
		expect(normalizeSnapshotState(null)).toEqual({ models: [], quarantined: [], updatedAtMs: null });
		expect(normalizeSnapshotState({ models: "nope", quarantined: [null, { id: "q", reason: 42 }] })).toEqual({
			models: [],
			quarantined: [{ id: "q", reason: "Malformed model id.", runnerIds: [], firstSeenAtMs: null, lastSeenAtMs: null }],
			updatedAtMs: null,
		});
	});
});

describe("resolveFleetSnapshotPath", () => {
	test("resolves explicit, null/empty disable, else configured default", () => {
		expect(resolveFleetSnapshotPath("/tmp/x.json")).toBe("/tmp/x.json");
		expect(resolveFleetSnapshotPath("")).toBeNull();
		expect(resolveFleetSnapshotPath(null)).toBeNull();
		expect(resolveFleetSnapshotPath(undefined)).toMatch(/fleet-catalog\.json$/);
	});
});
