import { describe, test, expect } from "vitest";
import { ingestAdvertisedId, ingestAdvertisedIds } from "./catalogIngest.js";

describe("ingestAdvertisedId", () => {
	test("keeps canonical harness ids byte-identical with parsed attributes + provenance", () => {
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

	test("quarantines legacy provider and bare forms as not harness-qualified", () => {
		for (const id of ["prov::m1", "ollama-cloud-direct::gemma4:31b-cloud", "deepseek-v4-flash:0731-cloud", "bare-model"]) {
			const result = ingestAdvertisedId(id, { runnerId: "r1", harnesses: ["muse"] });
			expect(result.ok).toBe(false);
			expect(result.quarantined).toEqual({
				id,
				reason: `Model id "${id}" is not harness-qualified (want harness::provider::model[::effort]).`,
				runnerId: "r1",
				atMs: null,
			});
		}
	});

	test("quarantines harness-scoped ids the runner does not serve, fail-open on empty lists", () => {
		const wrong = ingestAdvertisedId("vibe::p::m", { runnerId: "r1", harnesses: ["pi", "muse"] });
		expect(wrong.ok).toBe(false);
		expect(wrong.quarantined).toEqual({
			id: "vibe::p::m",
			reason: 'Model id "vibe::p::m" names harness "vibe", which runner r1 does not serve (harness not served by runner r1).',
			runnerId: "r1",
			atMs: null,
		});
		// An empty/absent reported harness list stays fail-open (old runners).
		expect(ingestAdvertisedId("vibe::p::m", { runnerId: "r1", harnesses: [] }).ok).toBe(true);
		expect(ingestAdvertisedId("vibe::p::m", { runnerId: "r1" }).ok).toBe(true);
	});

	test("attributes entries to the harness parsed from the id, never the runner list", () => {
		const result = ingestAdvertisedId("muse::meta::m", {
			runnerId: "r1",
			harnesses: ["antigravity", "muse", "pi", "vibe"],
		});
		expect(result.ok).toBe(true);
		expect(result.entry.harnesses).toEqual(["muse"]);
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
		const cleaned = ingestAdvertisedId("muse::meta::m", {
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
			["muse::meta::muse-spark-1.4", "a::b::c::d::e", "  ", "prov::m1", "bare-model", null],
			{ runnerId: "r1", harnesses: ["muse"], tiers: ["T0"], atMs: 9, source: "discovered" },
		);
		expect(entries.map((e) => e.id)).toEqual(["muse::meta::muse-spark-1.4"]);
		expect(quarantined.map((q) => q.id)).toEqual(["a::b::c::d::e", "prov::m1", "bare-model"]);
		expect(entries[0]).toMatchObject({ runnerId: "r1", atMs: 9, source: "discovered", harnesses: ["muse"] });
		expect(ingestAdvertisedIds(null, {})).toEqual({ entries: [], quarantined: [] });
	});

	test("quarantines wrong-harness ids per runner inside a batch", () => {
		const { entries, quarantined } = ingestAdvertisedIds(["muse::meta::m", "vibe::p::m"], {
			runnerId: "r1",
			harnesses: ["muse"],
		});
		expect(entries.map((e) => e.id)).toEqual(["muse::meta::m"]);
		expect(quarantined.map((q) => q.id)).toEqual(["vibe::p::m"]);
		expect(quarantined[0].reason).toMatch(/harness not served by runner r1/);
	});
});
