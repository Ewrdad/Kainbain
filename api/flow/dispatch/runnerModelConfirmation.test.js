import { describe, test, expect } from "vitest";
import { MODEL_PROVENANCE_TRUST_CAP, confirmRunnerModel } from "./runnerModelConfirmation.js";

const record = (capabilities) => ({ status: "active", paused: false, runnerId: "r1", capabilities });

describe("confirmRunnerModel", () => {
	test("confirms ids a scan listed, even alongside a successful leg", () => {
		expect(
			confirmRunnerModel(
				record({
					modelProvenance: { "muse::meta::m": { harness: "muse", atMs: 1 } },
					discoveryStatus: { muse: { ok: true, count: 1, atMs: 1 } },
				}),
				"muse::meta::m",
			),
		).toEqual({ status: "confirmed", harness: "muse" });
	});

	test("marks harness-scoped pin-only ids stale when the leg succeeded without them", () => {
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { muse: { ok: true, count: 2, atMs: 1 } } }),
				"muse::meta::retired",
			),
		).toEqual({ status: "stale", harness: "muse" });
		// Reasoning-suffixed ids name the same leg.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { pi: { ok: true, count: 1, atMs: 1 } } }),
				"pi::google::m::high",
			),
		).toEqual({ status: "stale", harness: "pi" });
	});

	test("fails open to unknown whenever the scan cannot speak", () => {
		// Failed scan.
		expect(
			confirmRunnerModel(
				record({ modelProvenance: {}, discoveryStatus: { muse: { ok: false, count: 0, atMs: 1 } } }),
				"muse::meta::m",
			).status,
		).toBe("unknown");
		// No slice for the harness.
		expect(
			confirmRunnerModel(record({ modelProvenance: {}, discoveryStatus: {} }), "muse::meta::m").status,
		).toBe("unknown");
		// Old runner: no provenance key at all (even with a healthy leg).
		expect(
			confirmRunnerModel(record({ discoveryStatus: { muse: { ok: true, count: 1, atMs: 1 } } }), "muse::meta::m")
				.status,
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
				record({ modelProvenance: provenance, discoveryStatus: { muse: { ok: true, count: 1000, atMs: 1 } } }),
				"muse::meta::truncated-away",
			).status,
		).toBe("unknown");
	});

	test("never judges legacy, bare, blank, or malformed ids (no single leg owns them)", () => {
		const caps = { modelProvenance: {}, discoveryStatus: { muse: { ok: true, count: 1, atMs: 1 } } };
		expect(confirmRunnerModel(record(caps), "prov::m1").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "bare-model").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "").status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), null).status).toBe("unknown");
		expect(confirmRunnerModel(record(caps), "a::b::c::d::e").status).toBe("unknown");
	});
});

