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

	test("accepts runnable false and null disk headroom", () => {
		const out = normalizeCapabilities({ runnable: false, diskHeadroomMb: null });
		expect(out.errors).toEqual([]);
		expect(out.runnable).toBe(false);
		expect(out.diskHeadroomMb).toBeNull();
	});
});
