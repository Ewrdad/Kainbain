import { describe, it, expect } from "vitest";
import {
	DEFAULT_HARNESS_SUPPORT_TIER,
	normalizeHarnessSupportTier,
	harnessSupportTierInfo,
} from "./harnessSupportTiers.js";

/**
 * MARK: harnessSupportTiers unit tests
 * @description Pins the canonical tier vocabulary projected by `/harnesses`:
 *   the exact `1`..`4`/`unsupported` keys, the human label + summary wording
 *   from docs/EngineDetails/HarnessSupportTeirs.md, the conservative Tier-4
 *   round-down for unset harnesses, and a loud throw for a typo'd tier so a
 *   mislabel never reaches the UI.
 */

describe("normalizeHarnessSupportTier", () => {
	it("passes through every canonical tier key", () => {
		for (const key of ["1", "2", "3", "4", "unsupported"]) {
			expect(normalizeHarnessSupportTier(key)).toBe(key);
		}
	});

	it("accepts numeric input by stringifying it", () => {
		expect(normalizeHarnessSupportTier(2)).toBe("2");
		expect(normalizeHarnessSupportTier(4)).toBe("4");
	});

	it("rounds unset values down to the conservative Tier-4 default", () => {
		expect(DEFAULT_HARNESS_SUPPORT_TIER).toBe("4");
		expect(normalizeHarnessSupportTier(undefined)).toBe("4");
		expect(normalizeHarnessSupportTier(null)).toBe("4");
		expect(normalizeHarnessSupportTier("")).toBe("4");
		expect(normalizeHarnessSupportTier("   ")).toBe("4");
	});

	it("throws on an explicitly unknown tier so a typo fails loudly", () => {
		expect(() => normalizeHarnessSupportTier("0")).toThrow(/Unknown harness support tier/);
		expect(() => normalizeHarnessSupportTier("5")).toThrow(/Unknown harness support tier/);
		expect(() => normalizeHarnessSupportTier("tier-1")).toThrow(
			/Unknown harness support tier/,
		);
	});
});

describe("harnessSupportTierInfo", () => {
	it("returns the label and summary for each tier", () => {
		expect(harnessSupportTierInfo("1")).toEqual({
			level: "1",
			label: "Tier 1",
			summary: "Direct integration in KainBain",
		});
		expect(harnessSupportTierInfo("2")).toEqual({
			level: "2",
			label: "Tier 2",
			summary: "ACP / programmatic invocation",
		});
		expect(harnessSupportTierInfo("3")).toEqual({
			level: "3",
			label: "Tier 3",
			summary: "Exec / -p functionality",
		});
		expect(harnessSupportTierInfo("4")).toEqual({
			level: "4",
			label: "Tier 4",
			summary: "Separate invocation needed",
		});
		expect(harnessSupportTierInfo("unsupported")).toEqual({
			level: "unsupported",
			label: "Not supported",
			summary: "No integration path",
		});
	});

	it("defaults an unset tier to the Tier-4 projection (never undefined)", () => {
		expect(harnessSupportTierInfo(undefined)).toMatchObject({ level: "4", label: "Tier 4" });
	});

	it("safely falls back to Tier-4 projection on invalid tier input (never throws)", () => {
		expect(harnessSupportTierInfo("bogus")).toMatchObject({ level: "4", label: "Tier 4" });
		expect(harnessSupportTierInfo(999)).toMatchObject({ level: "4", label: "Tier 4" });
		expect(harnessSupportTierInfo({})).toMatchObject({ level: "4", label: "Tier 4" });
	});
});
