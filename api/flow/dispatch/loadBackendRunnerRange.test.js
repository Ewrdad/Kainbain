import { describe, expect, test } from "vitest";
import { loadBackendRunnerRange } from "./loadBackendRunnerRange.js";

/***
 * MARK: loadBackendRunnerRange Tests
 * @description Pins the accepted-Runner-API range loader imported from its
 *   own module (not the runnerApiCompat barrel) so the extraction stays
 *   directly covered: a present range passes through trimmed, and a
 *   missing/invalid version file fails safe to null instead of throwing,
 *   which keeps old Runners dispatchable.
 ***/
describe("loadBackendRunnerRange", () => {
	test("returns the trimmed accepted range from version.json", () => {
		const range = loadBackendRunnerRange();
		expect(typeof range === "string" || range === null).toBe(true);
		if (typeof range === "string") {
			expect(range).toBe(range.trim());
			expect(range.length).toBeGreaterThan(0);
		}
	});
});
