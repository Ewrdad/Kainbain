import { expect, test, describe } from "vitest";
import { readApiVersion } from "./readApiVersion.js";

/***
 * MARK: readApiVersion Tests
 * @description Pins the backend API-version source imported from its own
 *   module (not the status barrel) so the extraction stays directly
 *   covered: a semver string from version.json, or null (never a throw)
 *   when the file is missing or invalid.
 ***/
describe("readApiVersion", () => {
	test("returns the version.json apiVersion or null", () => {
		const version = readApiVersion();
		expect(version === null || /^\d+\.\d+\.\d+$/.test(version)).toBe(true);
	});
});
