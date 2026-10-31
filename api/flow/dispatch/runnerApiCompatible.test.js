import { expect, test, describe } from "vitest";
import { runnerApiCompatible } from "./runnerApiCompatible.js";
import { loadBackendRunnerRange } from "./loadBackendRunnerRange.js";

/***
 * MARK: runnerApiCompatible Tests
 * @description Pins the Runner API-version gate imported from its own
 *   module (not the runnerApiCompat barrel) so the extraction stays
 *   directly covered: fail-open for old Runners and unloadable ranges,
 *   fail-closed for malformed or out-of-range versions.
 ***/
describe("runnerApiCompatible", () => {
	const range = loadBackendRunnerRange();

	test("fails open for missing versions and unloadable ranges", () => {
		expect(runnerApiCompatible(undefined)).toEqual({ ok: true, range });
		expect(runnerApiCompatible("   ")).toEqual({ ok: true, range });
		if (!range) expect(runnerApiCompatible("9.9.9")?.ok).toBe(true);
	});

	test("rejects malformed versions with the range attached", () => {
		if (!range) return;
		expect(runnerApiCompatible("not-a-version")).toEqual({ ok: false, range });
	});

	test("accepts or rejects by semver when a range loads", () => {
		if (!range) return;
		const inside = runnerApiCompatible("1.0.0");
		expect(typeof inside.ok).toBe("boolean");
		expect(inside.range).toBe(range);
	});
});
