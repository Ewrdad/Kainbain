import { describe, it, expect } from "vitest";
import { generateUuidV7 } from "./uuidv7.js";

describe("generateUuidV7", () => {
	it("produces standard 36-char lowercase UUID format", () => {
		const id = generateUuidV7();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it("sets version bits to 7 and variant bits to RFC 4122/9562 variant 1", () => {
		for (let i = 0; i < 50; i += 1) {
			const id = generateUuidV7();
			expect(id.charAt(14)).toBe("7");
			expect(["8", "9", "a", "b"]).toContain(id.charAt(19));
		}
	});

	it("maintains strict monotonicity under burst generation", () => {
		const ids = [];
		for (let i = 0; i < 1000; i += 1) {
			ids.push(generateUuidV7());
		}
		for (let i = 1; i < ids.length; i += 1) {
			expect(ids[i] > ids[i - 1]).toBe(true);
		}
	});
});
