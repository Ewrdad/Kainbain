import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFleetModelCatalog } from "./fleetModelCatalog.js";
import {
	createFleetModelSnapshotStore,
	deriveUnavailableReason,
	formatAge,
	normalizeSnapshotState,
	resolveFleetSnapshotPath,
	summarizeFleetHarnesses,
	FLEET_SNAPSHOT_MAX_QUARANTINED,
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

// A claim the runner's own discovery CONFIRMED: provenance lists the id
// and the naming leg succeeded just now (fresh per the WP-C window).
const confirmedCaps = (id, { harness = "muse", source = "discovered", tiers } = {}) => {
	const atMs = Date.now();
	return {
		models: [id],
		modelSource: source,
		modelProvenance: { [id]: { harness, atMs } },
		discoveryStatus: { [harness]: { ok: true, count: 1, atMs } },
		...(tiers !== undefined ? { tiers } : {}),
	};
};

describe("createFleetModelSnapshotStore", () => {
	test("serves normalized entries with verified counts and provenance", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: confirmedCaps(NEW_MODEL_ID),
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
				declaredBy: [],
				claimedBy: [],
				verified: true,
				available: true,
				unavailableReason: null,
				firstSeenAtMs: snapshot.updatedAtMs,
				lastSeenAtMs: snapshot.updatedAtMs,
				lastServedAtMs: snapshot.updatedAtMs,
				lastServedRunnerIds: ["box-a"],
				provenance: { "box-a": { harnesses: ["muse"], atMs: expect.any(Number), source: "discovered" } },
			},
		]);
		expect(snapshot.quarantined).toEqual([]);
		expect(typeof snapshot.updatedAtMs).toBe("number");
	});

	test("quarantines non-canonical ids even when the runner serves other harnesses today", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "local-alpha",
				capabilities: {
					harnesses: [{ id: "pi" }, { id: "muse" }],
					models: ["ollama-cloud-direct::gemma4:31b-cloud", "deepseek-v4-flash:0731-cloud"],
					tiers: ["T0"],
				},
			}),
		]);
		expect(snapshot.models).toEqual([]);
		expect(snapshot.quarantined).toEqual([
			{
				id: "deepseek-v4-flash:0731-cloud",
				reason:
					'Model id "deepseek-v4-flash:0731-cloud" is not harness-qualified (want harness::provider::model[::effort]).',
				runnerIds: ["local-alpha"],
				firstSeenAtMs: snapshot.updatedAtMs,
				lastSeenAtMs: snapshot.updatedAtMs,
			},
			{
				id: "ollama-cloud-direct::gemma4:31b-cloud",
				reason:
					'Model id "ollama-cloud-direct::gemma4:31b-cloud" is not harness-qualified (want harness::provider::model[::effort]).',
				runnerIds: ["local-alpha"],
				firstSeenAtMs: snapshot.updatedAtMs,
				lastSeenAtMs: snapshot.updatedAtMs,
			},
		]);
	});

	test("quarantines harness-scoped ids naming a harness the runner does not serve", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "r1",
				capabilities: {
					harnesses: [{ id: "pi" }, { id: "muse" }],
					models: ["vibe::prov::m"],
				},
			}),
		]);
		expect(snapshot.models).toEqual([]);
		expect(snapshot.quarantined).toHaveLength(1);
		expect(snapshot.quarantined[0]).toMatchObject({
			id: "vibe::prov::m",
			runnerIds: ["r1"],
		});
		expect(snapshot.quarantined[0].reason).toMatch(/harness not served by runner r1/);
	});

	test("attributes entries to the harness parsed from the id, never the runner list", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					...confirmedCaps(NEW_MODEL_ID),
					harnesses: [{ id: "antigravity" }, { id: "muse" }, { id: "pi" }, { id: "vibe" }],
				},
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0].harnesses).toEqual(["muse"]);
		expect(snapshot.models[0].provenance).toEqual({
			"box-a": { harnesses: ["muse"], atMs: expect.any(Number), source: "discovered" },
		});
	});

	test("counts only discovery-confirmed runners; pins land in declaredBy, still selectable", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "r1",
				capabilities: { models: ["muse::meta::x"], modelSource: "pinned", discoveryStatus: {} },
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: "muse::meta::x",
			runnerIds: [],
			runnerCount: 0,
			declaredBy: ["r1"],
			claimedBy: [],
			verified: false,
			available: false,
			harnesses: ["muse"],
		});
		expect(snapshot.models[0].unavailableReason).toMatch(/declared by 1 runner/);
		expect(snapshot.quarantined).toEqual([]);
	});

	test("confirmed-only counting across mixed claimants", () => {
		const store = tempStore();
		const snapshot = store.update([
			// Provenance hit on a stale leg: unconfirmed, never counted.
			fleetRunnerRecord({
				runnerId: "stale-leg",
				capabilities: {
					models: [NEW_MODEL_ID],
					modelProvenance: { [NEW_MODEL_ID]: { harness: "muse", atMs: 1 } },
					discoveryStatus: { muse: { ok: true, count: 1, atMs: 1 } },
				},
			}),
			// One confirmed runner carries the entry.
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: confirmedCaps(NEW_MODEL_ID),
			}),
			// One bare pin with no discovery signal: declared, not counted.
			fleetRunnerRecord({
				runnerId: "pin-only",
				capabilities: { models: [NEW_MODEL_ID], discoveryStatus: {} },
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: NEW_MODEL_ID,
			runnerIds: ["box-a"],
			runnerCount: 1,
			declaredBy: ["pin-only", "stale-leg"],
			claimedBy: [],
			verified: true,
			available: true,
			unavailableReason: null,
		});
	});

	test("unions tiers and runners across confirmed machines", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: { ...confirmedCaps(NEW_MODEL_ID), tiers: ["T0"] },
			}),
			fleetRunnerRecord({
				runnerId: "box-b",
				capabilities: { ...confirmedCaps(NEW_MODEL_ID), tiers: ["T1"] },
			}),
		]);
		expect(snapshot.models[0]).toMatchObject({
			tiers: ["T0", "T1"],
			runnerIds: ["box-a", "box-b"],
			runnerCount: 2,
			verified: true,
			available: true,
		});
	});

	test("keeps 0-runner entries indefinitely with last-served memory", () => {
		const store = tempStore();
		const servedAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
		store.update([fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })], {
			atMs: servedAt,
		});
		// Rounds with no runners: the entry survives, last-seen untouched.
		let snapshot = store.update([], { atMs: servedAt + 1000 });
		snapshot = store.update([], { atMs: servedAt + 2000 });
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: NEW_MODEL_ID,
			available: false,
			verified: false,
			runnerIds: [],
			runnerCount: 0,
			claimedBy: [],
			declaredBy: [],
			firstSeenAtMs: servedAt,
			lastSeenAtMs: servedAt,
			lastServedAtMs: servedAt,
			lastServedRunnerIds: ["box-a"],
			harnesses: ["muse"],
		});
		expect(snapshot.models[0].unavailableReason).toMatch(/0 runners -- last served 3d ago by box-a/);
		// A returning confirmed runner flips the entry back to available.
		const back = store.update(
			[fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })],
			{ atMs: servedAt + 3000 },
		);
		expect(back.models[0]).toMatchObject({
			available: true,
			verified: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			firstSeenAtMs: servedAt,
			lastSeenAtMs: servedAt + 3000,
			lastServedAtMs: servedAt + 3000,
		});
	});

	test("derives availability on read and never persists it", () => {
		const file = tempFile("fleet-derive.json");
		const store = createFleetModelSnapshotStore({ filePath: file });
		store.update([fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })]);
		const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
		expect(persisted.models).toHaveLength(1);
		expect(persisted.models[0]).not.toHaveProperty("available");
		expect(persisted.models[0]).not.toHaveProperty("unavailableReason");
		expect(persisted.models[0]).not.toHaveProperty("verified");
		expect(persisted.models[0]).toMatchObject({
			runnerIds: ["box-a"],
			runnerCount: 1,
			declaredBy: [],
			lastServedRunnerIds: ["box-a"],
		});
		// ...while reads carry the derived fields for back-compat.
		expect(store.read().models[0]).toMatchObject({
			available: true,
			verified: true,
			unavailableReason: null,
		});
	});

	test("quarantines malformed ids with a reason, never serving them", () => {
		const store = tempStore();
		const snapshot = store.update(
			[fleetRunnerRecord({ capabilities: { models: ["a::b::c::d::e", "muse::::x", NEW_MODEL_ID] } })],
			{ atMs: 500 },
		);
		// The bare-form newcomer is declared (unconfirmed), never available.
		expect(snapshot.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		expect(snapshot.models[0]).toMatchObject({ runnerCount: 0, declaredBy: ["fleet-fixture-1"] });
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

	test("ignores ineligible runners and lists allowlist ids as declared", () => {
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({ runnerId: "paused", paused: true }),
			fleetRunnerRecord({ runnerId: "pending", status: "pending" }),
			fleetRunnerRecord({ runnerId: "revoked", status: "revoked" }),
			fleetRunnerRecord({
				runnerId: "live",
				capabilities: { models: [], discoveryStatus: {} },
				operatorConfig: { availableModels: ["muse::meta::declared-model"] },
			}),
		]);
		expect(snapshot.models.map((m) => m.id)).toEqual(["muse::meta::declared-model"]);
		expect(snapshot.models[0]).toMatchObject({
			runnerIds: [],
			runnerCount: 0,
			declaredBy: ["live"],
			available: false,
			verified: false,
		});
		expect(snapshot.models[0].unavailableReason).toMatch(/declared by 1 runner/);
	});

	test("matches the live fleet builder on fully-confirmed inputs (core-field parity)", () => {
		const runners = [
			fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) }),
			fleetRunnerRecord({
				runnerId: "box-b",
				capabilities: { ...confirmedCaps("muse::meta::other-model"), tiers: ["T1"] },
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
		first.update([fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })], {
			atMs: 1000,
		});
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
		const snapshot = store.update([
			fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) }),
		]);
		expect(snapshot.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		// null disables too — an explicit null must never read/write the
		// configured live engine file.
		const nullStore = createFleetModelSnapshotStore({ filePath: null });
		expect(
			nullStore.update([fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })])
				.models.map((m) => m.id),
		).toEqual([NEW_MODEL_ID]);
		expect(nullStore.read().models).toHaveLength(1);
	});

	test("keeps every model without a size cap", () => {
		const store = tempStore();
		const runners = [];
		for (let i = 0; i < 10005; i += 1) {
			runners.push(
				fleetRunnerRecord({ runnerId: `r${i}`, capabilities: { models: [`muse::meta::stale-${i}`] } }),
			);
		}
		const snapshot = store.update(runners, { atMs: 1000 });
		// Unconfirmed pins are kept as declared entries — nothing evicted.
		expect(snapshot.models.length).toBe(10005);
		const after = store.update([], { atMs: 2000 });
		expect(after.models.length).toBe(10005);
	});

	test("skips a poisoned runner record instead of failing the catalogue", () => {
		const store = tempStore();
		const evil = {
			runnerId: "evil",
			status: "active",
			get capabilities() {
				throw new Error("boom");
			},
		};
		const snapshot = store.update([
			evil,
			fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) }),
		]);
		expect(snapshot.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
		expect(snapshot.models[0]).toMatchObject({ runnerIds: ["box-a"], runnerCount: 1 });
		expect(() => store.update([evil])).not.toThrow();
	});

	test("keeps the quarantine cap (oldest last-seen drops first)", () => {
		const store = tempStore();
		const runners = [];
		for (let i = 0; i < FLEET_SNAPSHOT_MAX_QUARANTINED + 5; i += 1) {
			runners.push(fleetRunnerRecord({ runnerId: `q${i}`, capabilities: { models: [`bad-${i}:::`] } }));
		}
		const snapshot = store.update(runners, { atMs: 1000 });
		expect(snapshot.quarantined.length).toBeLessThanOrEqual(FLEET_SNAPSHOT_MAX_QUARANTINED);
	});

	test("marks pin-only ids stale when a successful scan contradicts them (never served as available)", () => {
		const store = tempStore();
		const atMs = Date.now();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: ["muse::meta::retired-pin-model"],
					modelSource: "pinned+discovered",
					// Present-but-empty provenance from a new runner: the scan
					// ran and confirmed nothing, so the pin is contradicted.
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 2, atMs } },
				},
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: "muse::meta::retired-pin-model",
			available: false,
			verified: false,
			runnerIds: [],
			runnerCount: 0,
			declaredBy: [],
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
				capabilities: confirmedCaps(NEW_MODEL_ID),
			}),
			fleetRunnerRecord({
				runnerId: "box-b",
				capabilities: {
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 3, atMs: Date.now() } },
				},
			}),
		]);
		expect(snapshot.models[0]).toMatchObject({
			id: NEW_MODEL_ID,
			available: true,
			verified: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			runnerCount: 1,
			claimedBy: ["box-b"],
			declaredBy: [],
		});
	});

	test("lists operator-asserted ids as declared instead of serving them as available", () => {
		// The availableModels override is an explicit declaration, not a
		// discovery confirmation: dispatch still honors it (only `stale`
		// refuses), but the catalogue no longer counts it as verified.
		const store = tempStore();
		const snapshot = store.update([
			fleetRunnerRecord({
				runnerId: "box-a",
				capabilities: {
					models: [],
					modelProvenance: {},
					discoveryStatus: { muse: { ok: true, count: 2, atMs: Date.now() } },
				},
				operatorConfig: { availableModels: ["muse::meta::declared-model"] },
			}),
		]);
		expect(snapshot.models).toHaveLength(1);
		expect(snapshot.models[0]).toMatchObject({
			id: "muse::meta::declared-model",
			available: false,
			verified: false,
			unavailableReason: expect.stringMatching(/declared by 1 runner/),
			runnerIds: [],
			runnerCount: 0,
			declaredBy: ["box-a"],
			claimedBy: [],
		});
	});

	test("never serves unverified pins as available: failed, missing, or old-runner signals", () => {
		const store = tempStore();
		const snapshot = store.update([
			// Failed scan: inconclusive, declared but never counted.
			fleetRunnerRecord({
				runnerId: "scan-failed",
				capabilities: {
					models: ["muse::meta::maybe-here"],
					modelProvenance: {},
					discoveryStatus: { muse: { ok: false, count: 0, atMs: 1, error: { code: "MUSE_MSP_TIMEOUT" } } },
				},
			}),
			// Never scanned this harness: no slice, nothing to confirm.
			fleetRunnerRecord({
				runnerId: "never-scanned",
				capabilities: {
					models: ["muse::meta::maybe-here-too"],
					modelProvenance: {},
					discoveryStatus: {},
				},
			}),
			// Old runner: no provenance signal and no discovery status at
			// all, declared as before.
			fleetRunnerRecord({
				runnerId: "old-runner",
				capabilities: { models: ["muse::meta::old-pin"], discoveryStatus: undefined, modelProvenance: undefined },
			}),
		]);
		expect(snapshot.models).toMatchObject([
			{ id: "muse::meta::maybe-here", available: false, runnerIds: [], declaredBy: ["scan-failed"], claimedBy: [] },
			{ id: "muse::meta::maybe-here-too", available: false, runnerIds: [], declaredBy: ["never-scanned"], claimedBy: [] },
			{ id: "muse::meta::old-pin", available: false, runnerIds: [], declaredBy: ["old-runner"], claimedBy: [] },
		]);
	});

	test("a stale entry recovers when a later scan confirms it", () => {
		const store = tempStore();
		const atMs = Date.now();
		const stale = store.update(
			[
				fleetRunnerRecord({
					runnerId: "box-a",
					capabilities: {
						modelProvenance: {},
						discoveryStatus: { muse: { ok: true, count: 1, atMs } },
					},
				}),
			],
			{ atMs },
		);
		expect(stale.models[0]).toMatchObject({ available: false, claimedBy: ["box-a"] });
		const back = store.update(
			[
				fleetRunnerRecord({
					runnerId: "box-a",
					capabilities: confirmedCaps(NEW_MODEL_ID),
				}),
			],
			{ atMs: atMs + 1000 },
		);
		expect(back.models[0]).toMatchObject({
			available: true,
			verified: true,
			unavailableReason: null,
			runnerIds: ["box-a"],
			claimedBy: [],
			declaredBy: [],
			firstSeenAtMs: atMs,
			lastSeenAtMs: atMs + 1000,
		});
	});

	test("remove() and removeQuarantined() delete one record and persist", () => {
		const file = tempFile("fleet-remove.json");
		const store = createFleetModelSnapshotStore({ filePath: file });
		const atMs = Date.now();
		store.update(
			[
				fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) }),
				fleetRunnerRecord({ runnerId: "box-b", capabilities: { models: ["prov::gone"] } }),
			],
			{ atMs },
		);
		expect(store.remove(NEW_MODEL_ID)).toBe(true);
		expect(store.remove(NEW_MODEL_ID)).toBe(false);
		expect(store.remove("  ")).toBe(false);
		expect(store.removeQuarantined("prov::gone")).toBe(true);
		expect(store.removeQuarantined("prov::gone")).toBe(false);
		expect(store.read().models).toEqual([]);
		expect(store.read().quarantined).toEqual([]);
		// Persisted: a reopened store stays empty ...
		const reopened = createFleetModelSnapshotStore({ filePath: file });
		expect(reopened.read().models).toEqual([]);
		// ... until the id is re-advertised, when it reappears.
		const back = reopened.update(
			[fleetRunnerRecord({ runnerId: "box-a", capabilities: confirmedCaps(NEW_MODEL_ID) })],
			{ atMs: atMs + 1000 },
		);
		expect(back.models.map((m) => m.id)).toEqual([NEW_MODEL_ID]);
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

	test("migrates persisted bare/provider entries to quarantine and rewrites attribution", () => {
		const loaded = normalizeSnapshotState({
			models: [
				{
					id: "prov::m1",
					form: "provider",
					harness: null,
					provider: "prov",
					model: "m1",
					harnesses: ["muse", "pi"],
					tiers: ["T0"],
					runnerIds: ["box-a"],
					runnerCount: 1,
					claimedBy: ["box-b"],
					available: true,
					unavailableReason: null,
					firstSeenAtMs: 1000,
					lastSeenAtMs: 2000,
					provenance: {},
				},
				{
					id: "bare-model",
					form: "bare",
					harnesses: [],
					runnerIds: [],
					runnerCount: 0,
					claimedBy: [],
					available: false,
					unavailableReason: "gone",
					firstSeenAtMs: 500,
					lastSeenAtMs: 600,
					provenance: {},
				},
				{
					id: "muse::meta::old",
					form: "harness",
					harness: "muse",
					provider: "meta",
					model: "old",
					harnesses: ["antigravity", "muse", "pi", "vibe"],
					tiers: ["T1"],
					runnerIds: ["box-a"],
					runnerCount: 1,
					claimedBy: [],
					available: true,
					unavailableReason: null,
					verified: true,
					firstSeenAtMs: 1000,
					lastSeenAtMs: 2000,
					provenance: { "box-a": { harnesses: ["muse"], atMs: 2000, source: "pinned" } },
				},
			],
			quarantined: [],
			updatedAtMs: 2000,
		});
		expect(loaded.models.map((m) => m.id)).toEqual(["muse::meta::old"]);
		expect(loaded.quarantined.map((q) => q.id)).toEqual(["prov::m1", "bare-model"]);
		expect(loaded.quarantined.find((q) => q.id === "prov::m1")).toMatchObject({
			reason:
				'Model id "prov::m1" is not harness-qualified (want harness::provider::model[::effort]).',
			runnerIds: ["box-a", "box-b"],
			firstSeenAtMs: 1000,
			lastSeenAtMs: 2000,
		});
		const kept = loaded.models[0];
		expect(kept.harnesses).toEqual(["muse"]);
		expect(kept.declaredBy).toEqual([]);
		// Stored availability is dropped — derived on read now.
		expect(kept).not.toHaveProperty("available");
		expect(kept).not.toHaveProperty("unavailableReason");
		expect(kept).not.toHaveProperty("verified");
		// Last-served memory seeds from the stored served entry.
		expect(kept.lastServedAtMs).toBe(2000);
		expect(kept.lastServedRunnerIds).toEqual(["box-a"]);
		// Provenance (including the pinned source) survives the migration.
		expect(kept.provenance).toEqual({ "box-a": { harnesses: ["muse"], atMs: 2000, source: "pinned" } });
	});

	test("recomputes runnerCount from runnerIds and unions every claimant list on migration", () => {
		const loaded = normalizeSnapshotState({
			models: [
				// Hand-edited count disagrees with the list: the list wins.
				{
					id: "muse::meta::fixed",
					runnerIds: ["box-a"],
					runnerCount: 99,
					claimedBy: [],
					declaredBy: [],
					firstSeenAtMs: 1000,
					lastSeenAtMs: 2000,
				},
				// Pre-canonical entry with reporters in every claimant
				// list: all three survive the move to quarantine.
				{
					id: "prov::m1",
					runnerIds: ["box-a"],
					runnerCount: 1,
					declaredBy: ["box-b"],
					claimedBy: ["box-c"],
					firstSeenAtMs: 1000,
					lastSeenAtMs: 2000,
				},
			],
			quarantined: [],
			updatedAtMs: 2000,
		});
		expect(loaded.models).toHaveLength(1);
		expect(loaded.models[0]).toMatchObject({ id: "muse::meta::fixed", runnerIds: ["box-a"], runnerCount: 1 });
		expect(loaded.quarantined).toHaveLength(1);
		expect(loaded.quarantined[0]).toMatchObject({
			id: "prov::m1",
			runnerIds: ["box-a", "box-b", "box-c"],
		});
	});

	test("migration is idempotent", () => {
		const oldShape = {
			models: [
				{ id: "prov::m1", runnerIds: ["box-a"], runnerCount: 1, firstSeenAtMs: 1000, lastSeenAtMs: 2000 },
				{ id: "muse::meta::old", harnesses: ["muse", "pi"], runnerIds: ["box-a"], runnerCount: 1, available: true, firstSeenAtMs: 1000, lastSeenAtMs: 2000 },
			],
			quarantined: [],
			updatedAtMs: 2000,
		};
		const once = normalizeSnapshotState(oldShape);
		const twice = normalizeSnapshotState({
			models: once.models,
			quarantined: once.quarantined,
			updatedAtMs: once.updatedAtMs,
		});
		expect(twice).toEqual(once);
	});
});

describe("formatAge", () => {
	test("formats seconds, minutes, hours, and days", () => {
		expect(formatAge(3000)).toBe("3s");
		expect(formatAge(59 * 1000)).toBe("59s");
		expect(formatAge(5 * 60 * 1000)).toBe("5m");
		expect(formatAge(3 * 60 * 60 * 1000)).toBe("3h");
		expect(formatAge(3 * 24 * 60 * 60 * 1000)).toBe("3d");
		expect(formatAge(Number.NaN)).toBe("0s");
		expect(formatAge(-1000)).toBe("0s");
	});
});

describe("deriveUnavailableReason", () => {
	const now = Date.now();
	test("served entries have no reason; priority is declared, stale, last-served, never-served", () => {
		expect(
			deriveUnavailableReason({ runnerIds: ["r1"], declaredBy: [], claimedBy: [] }, now),
		).toBeNull();
		expect(
			deriveUnavailableReason(
				{ runnerIds: [], declaredBy: ["r1", "r2"], claimedBy: ["r3"], harness: "muse" },
				now,
			),
		).toBe("declared by 2 runners, not verified by discovery");
		expect(
			deriveUnavailableReason({ runnerIds: [], declaredBy: ["r1"], claimedBy: [], harness: "muse" }, now),
		).toBe("declared by 1 runner, not verified by discovery");
		expect(
			deriveUnavailableReason({ runnerIds: [], declaredBy: [], claimedBy: ["r1"], harness: "muse" }, now),
		).toMatch(/stale/i);
		expect(
			deriveUnavailableReason(
				{
					runnerIds: [],
					declaredBy: [],
					claimedBy: [],
					harness: "muse",
					lastServedAtMs: now - 3 * 24 * 60 * 60 * 1000,
					lastServedRunnerIds: ["box-a"],
				},
				now,
			),
		).toBe("0 runners -- last served 3d ago by box-a");
		expect(
			deriveUnavailableReason({ runnerIds: [], declaredBy: [], claimedBy: [], harness: "muse" }, now),
		).toBe("never served by any runner");
	});
});

describe("summarizeFleetHarnesses", () => {
	test("skips poisoned records without losing healthy runners", () => {
		const evil = {
			runnerId: "evil",
			status: "active",
			get capabilities() {
				throw new Error("boom");
			},
		};
		expect(
			summarizeFleetHarnesses([
				evil,
				fleetRunnerRecord({ runnerId: "box-a", capabilities: { harnesses: [{ id: "muse" }] } }),
			]),
		).toEqual([{ id: "muse", runnerCount: 1, runnerIds: ["box-a"] }]);
	});

	test("summarizes claim-eligible runners by harness id, sorted", () => {
		expect(
			summarizeFleetHarnesses([
				fleetRunnerRecord({ runnerId: "box-a", capabilities: { harnesses: [{ id: "pi" }, { id: "muse" }] } }),
				fleetRunnerRecord({ runnerId: "box-b", capabilities: { harnesses: ["pi"] } }),
				fleetRunnerRecord({ runnerId: "paused", paused: true, capabilities: { harnesses: ["vibe"] } }),
			]),
		).toEqual([
			{ id: "muse", runnerCount: 1, runnerIds: ["box-a"] },
			{ id: "pi", runnerCount: 2, runnerIds: ["box-a", "box-b"] },
		]);
		expect(summarizeFleetHarnesses([])).toEqual([]);
		expect(summarizeFleetHarnesses(null)).toEqual([]);
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
