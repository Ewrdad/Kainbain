import { expect, test, describe } from "vitest";
import { normalizeCapabilities } from "./normalizeCapabilities.js";

/***
 * MARK: normalizeCapabilities Tests
 * @description Verifies heartbeat facts normalize into a capability
 *   advertisement struct, and malformed shapes report errors instead of
 *   throwing.
 ***/
describe("normalizeCapabilities", () => {
	test("normalizes a full advertisement", () => {
		const out = normalizeCapabilities({
			harnesses: [{ id: "pi", version: "1.2.3" }, { id: "codex" }],
			models: ["m1", "  ", 42],
			tiers: ["T0", "T1", "T1"],
			runnable: true,
			diskHeadroomMb: 512,
			versions: { protocol: "v1" },
		});
		expect(out.errors).toEqual([]);
		expect(out.harnesses).toEqual([
			{ id: "pi", version: "1.2.3" },
			{ id: "codex", version: "unknown" },
		]);
		expect(out.models).toEqual(["m1"]);
		expect(out.tiers).toEqual(["T0", "T1"]);
		expect(out.runnable).toBe(true);
		expect(out.diskHeadroomMb).toBe(512);
	});

	test("defaults an empty advertisement and reports every problem", () => {
		const out = normalizeCapabilities({
			harnesses: "pi",
			models: "m1",
			tiers: ["T9", "T1"],
			runnable: "yes",
			diskHeadroomMb: -1,
		});
		expect(out.harnesses).toEqual([]);
		expect(out.models).toEqual([]);
		expect(out.tiers).toEqual(["T1"]);
		expect(out.runnable).toBe(true);
		expect(out.diskHeadroomMb).toBeNull();
		expect(out.errors.length).toBeGreaterThanOrEqual(4);
	});

	test("drops the default sentinel and duplicate models from the advertisement", () => {
		const out = normalizeCapabilities({
			models: ["default", " Default ", "m1", "m1", " m2 "],
		});
		expect(out.errors).toEqual([]);
		expect(out.models).toEqual(["m1", "m2"]);
	});

	test("accepts runnable false and null disk headroom", () => {
		const out = normalizeCapabilities({ runnable: false, diskHeadroomMb: null });
		expect(out.errors).toEqual([]);
		expect(out.runnable).toBe(false);
		expect(out.diskHeadroomMb).toBeNull();
	});

	test("passes discoveryStatus through (additive, old runners omit it)", () => {
		const status = {
			pi: { ok: true, count: 77, atMs: 123 },
			antigravity: { ok: false, count: 0, atMs: 124, error: { code: "AGY_BIN_MISSING", message: "no agy" } },
		};
		const out = normalizeCapabilities({ models: ["m1"], discoveryStatus: status });
		expect(out.errors).toEqual([]);
		expect(out.discoveryStatus).toEqual(status);
		const absent = normalizeCapabilities({ models: ["m1"] });
		expect(absent.errors).toEqual([]);
		expect("discoveryStatus" in absent).toBe(false);
		const nulled = normalizeCapabilities({ discoveryStatus: null });
		expect(nulled.errors).toEqual([]);
		expect(nulled.discoveryStatus).toBeNull();
	});

	test("rejects a malformed discoveryStatus without throwing", () => {
		const out = normalizeCapabilities({ discoveryStatus: ["pi"] });
		expect(out.errors).toContain("discoveryStatus must be an object or null");
		expect("discoveryStatus" in out).toBe(false);
	});
});
