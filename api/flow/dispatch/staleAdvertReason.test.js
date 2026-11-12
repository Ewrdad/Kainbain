import { describe, test, expect } from "vitest";
import { staleAdvertReason } from "./staleAdvertReason.js";

describe("staleAdvertReason", () => {
	test("words singular and plural claims with the denying harness", () => {
		expect(staleAdvertReason("muse", 1)).toBe(
			"1 runner advertises this model but its latest successful muse scan did not list it — the runner model pin may be stale.",
		);
		expect(staleAdvertReason("pi", 3)).toBe(
			"3 runners advertise this model but their latest successful pi scan did not list it — the runner model pin may be stale.",
		);
		expect(staleAdvertReason("", 0)).toMatch(/its harness/);
	});
});
