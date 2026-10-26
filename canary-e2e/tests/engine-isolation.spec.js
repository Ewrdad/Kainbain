import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";

const API_BASE = API_URL;

/**
 * MARK: scratch-stack engine isolation
 * @description Regression pin for the shared-containment incident
 *   (2026-10-10): the engine persists the WP1 circuit-breaker trip at
 *   ~/.kainbain/engine/circuit.json by default, so a scratch-stack trip
 *   poisoned prod's next boot — and a stale prod trip 409ed every scratch
 *   /execute, failing the engine-driven canary specs. The scratch stack
 *   must resolve its containment-state file inside the scratch roots
 *   (playwright.config.js sets KAINBAIN_CIRCUIT_STATE_FILE), never the
 *   operator's file. Asserted against the live /status/config
 *   introspection endpoint, so a config refactor that drops the env
 *   override fails here instead of wedging the suite mid-run.
 */
test.describe("scratch-stack engine isolation", () => {
	test("containment-state file resolves inside the scratch roots", async ({
		request,
	}) => {
		const res = await request.get(`${API_BASE}/status/config`);
		expect(res.ok()).toBeTruthy();
		const payload = await res.json();
		const entry = (payload.entries || []).find(
			(e) => e.env === "KAINBAIN_CIRCUIT_STATE_FILE",
		);
		expect(entry).toBeTruthy();
		expect(entry.source).not.toBe("default");
		expect(String(entry.value)).toContain("kb-canary-e2e");
	});

	test("agent stages run on the mock harness, never ambient models", async ({
		request,
	}) => {
		const res = await request.get(`${API_BASE}/status/config`);
		expect(res.ok()).toBeTruthy();
		const payload = await res.json();
		const entry = (payload.entries || []).find(
			(e) => e.env === "KAINBAIN_DEFAULT_HARNESS",
		);
		expect(entry).toBeTruthy();
		expect(entry.source).not.toBe("default");
		expect(entry.value).toBe("mock");
	});
});
