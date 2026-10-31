import { expect, test, describe } from "vitest";
import { readApiVersion } from "./readApiVersion.js";
import { withApiVersion } from "./withApiVersion.js";

/***
 * MARK: withApiVersion Tests
 * @description Pins the additive apiVersion stamp imported from its own
 *   module (not the status barrel) so the extraction stays directly
 *   covered: build records keep their fields and gain the loaded version,
 *   and a missing build still yields a versioned object.
 ***/
describe("withApiVersion", () => {
	test("stamps the loaded version without dropping build fields", () => {
		const version = readApiVersion();
		expect(withApiVersion(null)).toEqual({ apiVersion: version });
		expect(withApiVersion({ commit: "abc" })).toEqual({ commit: "abc", apiVersion: version });
		expect(withApiVersion("nope")).toEqual({ apiVersion: version });
	});
});
