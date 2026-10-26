import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { sessionStore, isTestSeamActive } from "./sessionStore.js";

/**
 * MARK: Test environment guard
 * @description Fails loudly when the api test suite is not running on the
 *   mock-session seam. The TEST ENV CONTRACT (api/sessionStore.js) requires
 *   NODE_ENV=test so the sessionStore singleton engages its mock session
 *   factory and throwaway session directory; `api/vitest.config.js` pins
 *   that value so an inherited NODE_ENV (e.g. production from a deployed
 *   service shell) can never disengage the seam and reach a real pi agent
 *   runtime. This guard turns a silent contract violation into an explicit
 *   failure that points at the contract.
 */
describe("test environment guard (TEST ENV CONTRACT)", () => {
	it("runs with NODE_ENV=test pinned by vitest config", () => {
		expect(process.env.NODE_ENV).toBe("test");
	});

	it("runs on the mock session seam, not a real pi harness", () => {
		expect(isTestSeamActive()).toBe(true);
		expect(typeof sessionStore.createSession).toBe("function");
	});

	it("uses a throwaway session base directory under the OS temp dir", () => {
		expect(sessionStore.baseDir).toBeTruthy();
		expect(sessionStore.baseDir.startsWith(tmpdir())).toBe(true);
	});
});
