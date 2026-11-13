import { describe, test, expect } from "vitest";
import { ingestAdvertisedId, ingestAdvertisedIds } from "./catalogIngest.js";

describe("ingestAdvertisedId", () => {
	test("keeps harness ids byte-identical with parsed attributes + provenance", () => {
		expect(
			ingestAdvertisedId("muse::meta::muse-spark-1.4", {
				runnerId: "box-a",
				harnesses: ["muse"],
				tiers: ["T0", "T1"],
				atMs: 123,
				source: "discovered",
			}),
		).toEqual({
			ok: true,
			entry: {
				id: "muse::meta::muse-spark-1.4",
				form: "harness",
				harness: "muse",
				provider: "meta",
				model: "muse-spark-1.4",
				reasoning: null,
				tiers: ["T0", "T1"],
				harnesses: ["muse"],
				runnerId: "box-a",
				atMs: 123,
				source: "discovered",
			},
		});
	});

	test("accepts single-colon ids exactly like the shared grammar", () => {
		const colon = ingestAdvertisedId("muse::meta::muse-spark-1.4:cloud", { runnerId: "r1" });
		expect(colon.ok).toBe(true);
		expect(colon.entry.model).toBe("muse-spark-1.4:cloud");
		const reasoning = ingestAdvertisedId("pi::ollama-cloud::glm-5.3-flash:cloud::high", { runnerId: "r1" });
		expect(reasoning.ok).toBe(true);
		expect(reasoning.entry).toMatchObject({ form: "harnessReasoning", reasoning: "high" });
	});

	test("accepts legacy provider and bare forms with null harness attribution", () => {
		expect(ingestAdvertisedId("prov::m1", { runnerId: "r1" }).entry).toMatchObject({
			form: "provider",
			harness: null,
			provider: "prov",
			model: "m1",
		});
		expect(ingestAdvertisedId("bare-model", { runnerId: "r1" }).entry).toMatchObject({
			form: "bare",
			harness: null,
			provider: null,
			model: "bare-model",
		});
	});

	test("quarantines malformed ids with a reason, never serving them", () => {
		const five = ingestAdvertisedId("a::b::c::d::e", { runnerId: "r1", atMs: 7 });
		expect(five.ok).toBe(false);
		expect(five.quarantined).toEqual({
			id: "a::b::c::d::e",
			reason: 'Model id "a::b::c::d::e" has 5 segments (want at most 4: harness::provider::id::reasoning).',
			runnerId: "r1",
			atMs: 7,
		});
		const empty = ingestAdvertisedId("muse::::x", { runnerId: "r1" });
		expect(empty.ok).toBe(false);
		expect(empty.quarantined.reason).toMatch(/empty segment/);
	});

	test("skips blanks and cleans attribution lists without throwing", () => {
		expect(ingestAdvertisedId("  ", { runnerId: "r1" })).toEqual({ ok: false, skipped: true });
		expect(ingestAdvertisedId(null, { runnerId: "r1" })).toEqual({ ok: false, skipped: true });
		const cleaned = ingestAdvertisedId("m1", {
			runnerId: "r1",
			harnesses: [" muse ", "", 42, "muse"],
			tiers: [null, "T0"],
			atMs: Number.NaN,
			source: "",
		});
		expect(cleaned.entry).toMatchObject({ harnesses: ["muse"], tiers: ["T0"], atMs: null, source: "unknown" });
	});
});

describe("ingestAdvertisedIds", () => {
	test("splits a batch into entries + quarantined, order-preserving, never throwing", () => {
		const { entries, quarantined } = ingestAdvertisedIds(
			["muse::meta::muse-spark-1.4", "a::b::c::d::e", "  ", "prov::m1", null],
			{ runnerId: "r1", harnesses: ["muse"], tiers: ["T0"], atMs: 9, source: "discovered" },
		);
		expect(entries.map((e) => e.id)).toEqual(["muse::meta::muse-spark-1.4", "prov::m1"]);
		expect(quarantined.map((q) => q.id)).toEqual(["a::b::c::d::e"]);
		expect(entries[0]).toMatchObject({ runnerId: "r1", atMs: 9, source: "discovered" });
		expect(ingestAdvertisedIds(null, {})).toEqual({ entries: [], quarantined: [] });
	});
});
