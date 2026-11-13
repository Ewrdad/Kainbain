import { describe, test, expect } from "vitest";
import {
	DISCOVERY_LEG_MAX_AGE_MS,
	confirmRunnerModel,
	discoveryLegFresh,
	MODEL_PROVENANCE_TRUST_CAP,
} from "./runnerModelConfirmation.js";

const NOW = Date.now();
const freshLeg = (atMs = NOW) => ({ ok: true, count: 1, atMs });
const staleLeg = () => ({ ok: true, count: 1, atMs: NOW - DISCOVERY_LEG_MAX_AGE_MS - 1000 });

const record = (capabilities) => ({ status: "active", paused: false, runnerId: "r1", capabilities });

describe("discoveryLegFresh", () => {
	test("a successful recent leg confirms; old, failed, or missing legs do not", () => {
		expect(discoveryLegFresh(freshLeg(), NOW)).toBe(true);
		expect(discoveryLegFresh(staleLeg(), NOW)).toBe(false);
		expect(discoveryLegFresh({ ok: false, count: 0, atMs: NOW }, NOW)).toBe(false);
		expect(discoveryLegFresh(null, NOW)).toBe(false);
		expect(discoveryLegFresh("muse", NOW)).toBe(false);
	});

	test("a successful leg with no usable timestamp stays fail-open", () => {
		expect(discoveryLegFresh({ ok: true, count: 1 }, NOW)).toBe(true);
		expect(discoveryLegFresh({ ok: true, count: 1, atMs: null }, NOW)).toBe(true);
	});

	test("the window constant is a day", () => {
		expect(DISCOVERY_LEG_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
	});
});

describe("confirmRunnerModel", () => {
	test("confirms ids a scan listed while the naming leg is fresh", () => {
		expect(
			confirmRunnerModel(
				record({
					modelProvenance: { "muse::meta::m": { harness: "muse", atMs: NOW } },
					discoveryStatus: { muse: freshLeg() },
				}),
				"muse::meta::m",
			),
		).toEqual({ status: "confirmed", harness: "muse" });
		// Reasoning-suffixed ids name the same leg.
		expect(
			confirmRunnerModel(
				record({
					modelProvenance: { "pi::google::m::high": { harness: "pi", atMs: NOW } },
					discoveryStatus: { pi: freshLeg() },
				}),
				"pi::google::m::high",
			),
		).toEqual({ status: "confirmed", harness: "pi" });
	});

	test("a provenance hit on a stale, failed, or missing leg is unconfirmed, never confirmed", () => {
		const hit = { "muse::meta::m": { harness: "muse", atMs: NOW } };
		// Stale leg: the scan that listed the id no longer speaks for it.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: hit, discoveryStatus: { muse: staleLeg() } }),
				"muse::meta::m",
			).status,
		).toBe("unknown");
		// Failed leg.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: hit, discoveryStatus: { muse: { ok: false, count: 0, atMs: NOW } } }),
				"muse::meta::m",
			).status,
		).toBe("unknown");
		// Missing slice for the harness.
		expect(
			confirmRunnerModel(record({ modelProvenance: hit, discoveryStatus: {} }), "muse::meta::m").status,
		).toBe("unknown");
		// The clock seam pins the verdict: the same old leg is fresh at its own time.
		const atMs = 1700000000000;
		expect(
			confirmRunnerModel(
				record({
					modelProvenance: { "muse::meta::m": { harness: "muse", atMs } },
					discoveryStatus: { muse: { ok: true, count: 1, atMs } },
				}),
				"muse::meta::m",
				{ now: atMs },
			).status,
		).toBe("confirmed");
		expect(
			confirmRunnerModel(
				record({
					modelProvenance: { "muse::meta::m": { harness: "muse", atMs } },
					discoveryStatus: { muse: { ok: true, count: 1, atMs } },
				}),
				"muse::meta::m",
				{ now: atMs + DISCOVERY_LEG_MAX_AGE_MS + 1 },
			).status,
		).toBe("unknown");
	});

	test("the clock seam accepts a function, a number, or an object", () => {
		const caps = {
			modelProvenance: { "muse::meta::m": { harness: "muse", atMs: NOW } },
			discoveryStatus: { muse: freshLeg() },
		};
		expect(confirmRunnerModel(record(caps), "muse::meta::m", () => NOW).status).toBe("confirmed");
		expect(confirmRunnerModel(record(caps), "muse::meta::m", NOW).status).toBe("confirmed");
		expect(confirmRunnerModel(record(caps), "muse::meta::m", { now: NOW }).status).toBe("confirmed");
		expect(confirmRunnerModel(record(caps), "muse::meta::m", { now: () => NOW }).status).toBe("confirmed");
	});

	test("marks harness-scoped pin-only ids stale when the leg succeeded without them", () => {
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { muse: freshLeg() } }),
				"muse::meta::retired",
			),
		).toEqual({ status: "stale", harness: "muse" });
		// Reasoning-suffixed ids name the same leg.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { pi: freshLeg() } }),
				"pi::google::m::high",
			),
		).toEqual({ status: "stale", harness: "pi" });
	});

	test("stale verdicts ignore leg age (dispatch refusal is byte-identical)", () => {
		// An old-but-successful scan still contradicts a pin it never listed.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { muse: staleLeg() } }),
				"muse::meta::retired",
				{ now: NOW },
			).status,
		).toBe("stale");
	});

	test("fails open to unknown whenever the scan cannot speak", () => {
		// Failed scan.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { muse: { ok: false, count: 0, atMs: NOW } } }),
				"muse::meta::m",
			).status,
		).toBe("unknown");
		// No slice for the harness.
		expect(
			confirmRunnerModel(record({ modelProvenance: {}, discoveryStatus: {} }), "muse::meta::m").status,
		).toBe("unknown");
		// Old runner: no provenance key at all (even with a healthy leg).
		expect(
			confirmRunnerModel(record({ discoveryStatus: { muse: freshLeg() } }), "muse::meta::m").status,
		).toBe("unknown");
		// Null/odd provenance shapes are dropped, never stale.
		expect(confirmRunnerModel(record({ modelProvenance: null }), "muse::meta::m").status).toBe("unknown");
		expect(confirmRunnerModel(record({ modelProvenance: [] }), "muse::meta::m").status).toBe("unknown");
		// No capabilities at all.
		expect(confirmRunnerModel({}, "muse::meta::m").status).toBe("unknown");
	});

	test("treats a full provenance map as inconclusive (ingest may have truncated it)", () => {
		const provenance = {};
		for (let i = 0; i < MODEL_PROVENANCE_TRUST_CAP; i += 1) provenance[`muse::meta::m${i}`] = { atMs: 1 };
		expect(
			confirmRunnerModel(
				record({ modelProvenance: provenance, discoveryStatus: { muse: freshLeg() } }),
				"muse::meta::truncated-away",
			).status,
		).toBe("unknown");
	});

	test("never judges legacy, bare, blank, or malformed ids (no single leg owns them)", () => {
		const caps = { modelProvenance: {}, discoveryStatus: { muse: freshLeg() } };
		expect(confirmRunnerModel(record(caps), "prov::m1").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "bare-model").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), null).status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "a::b::c::d::e").status).toBe("unknown");
	});

	test("marks ids stale when they scope a harness the runner never reported", () => {
		// String and {id} harness shapes both speak (registry vs raw facts).
		for (const harnesses of [[{ id: "pi", version: "x" }], ["pi"]]) {
			expect(
				confirmRunnerModel(record({ harnesses }), "muse::meta::muse-spark-1.4").status,
			).toBe("stale");
		}
		// The reported harness itself stays trusted (nothing contradicts yet).
		expect(confirmRunnerModel(record({ harnesses: [{ id: "muse" }] }), "muse::meta::m").status).toBe(
			"unknown",
		);
		// No harness signal at all (old runners, bare fixtures): fail open.
		expect(confirmRunnerModel(record({}), "muse::meta::m").status).toBe("unknown");
		expect(confirmRunnerModel(record({ harnesses: [] }), "muse::meta::m").status).toBe("unknown");
	});

	test("trusts operator-asserted override ids over every runner-reported signal", () => {
		const contradicting = {
			harnesses: [{ id: "pi" }],
			modelProvenance: {},
			discoveryStatus: { muse: freshLeg() },
		};
		const asserted = (availableModels) => ({
			...record(contradicting),
			operatorConfig: { availableModels },
		});
		// Without the override both stale rules fire.
		expect(confirmRunnerModel(record(contradicting), "muse::meta::old").status).toBe("stale");
		// The override wins over the scan contradiction AND the harness gap.
		expect(confirmRunnerModel(asserted(["muse::meta::old"]), "muse::meta::old").status).toBe("unknown");
		// Whitespace-tolerant, exact-id match only.
		expect(confirmRunnerModel(asserted(["  muse::meta::old  "]), "muse::meta::old").status).toBe("unknown");
		expect(confirmRunnerModel(asserted(["muse::meta::other"]), "muse::meta::old").status).toBe("stale");
		// A non-array override (null = advertised) asserts nothing.
		expect(confirmRunnerModel(asserted(null), "muse::meta::old").status).toBe("stale");
		expect(confirmRunnerModel(asserted("muse::meta::old"), "muse::meta::old").status).toBe("stale");
	});
});
