// Domain: The Flow — S6 hardening: untrusted marker/reason text must collapse
// to one bounded line before it reaches a single-line history string.
import { describe, it, expect } from "vitest";
import { cleanSingleLineText } from "./cleanSingleLineText.js";

/***
 * MARK: cleanSingleLineText contract tests
 * @description Pins the single-line cleaner: plain text passes through,
 *   whitespace runs collapse, length caps, and anything unusable reads as "".
 ***/
describe("cleanSingleLineText", () => {
	it("passes plain text through trimmed", () => {
		expect(cleanSingleLineText({ text: "socket hangup" })).toBe("socket hangup");
		expect(cleanSingleLineText({ text: "  r-7  " })).toBe("r-7");
	});

	it("collapses every whitespace run to one space, so history lines stay single-line", () => {
		expect(cleanSingleLineText({ text: "socket\n\nhangup" })).toBe("socket hangup");
		expect(cleanSingleLineText({ text: "a\tb\rc\nd" })).toBe("a b c d");
		expect(cleanSingleLineText({ text: "spaced    out" })).toBe("spaced out");
		// A forged second history line cannot survive the collapse.
		expect(cleanSingleLineText({ text: "x\n- 2026-01-01: FAKE" })).toBe("x - 2026-01-01: FAKE");
	});

	it("caps the length at maxLength and never leaves a cut trailing space", () => {
		expect(cleanSingleLineText({ text: "abcdef", maxLength: 4 })).toBe("abcd");
		expect(cleanSingleLineText({ text: "ab cd", maxLength: 3 })).toBe("ab");
		expect(cleanSingleLineText({ text: "x".repeat(600) })).toHaveLength(500);
	});

	it("fails safe on unusable input and bad caps", () => {
		expect(cleanSingleLineText({ text: null })).toBe("");
		expect(cleanSingleLineText({ text: undefined })).toBe("");
		expect(cleanSingleLineText({ text: 123 })).toBe("");
		expect(cleanSingleLineText({ text: { reason: "x" } })).toBe("");
		expect(cleanSingleLineText({ text: "   " })).toBe("");
		expect(cleanSingleLineText()).toBe("");
		expect(cleanSingleLineText({ text: "x".repeat(600), maxLength: 0 })).toHaveLength(500);
		expect(cleanSingleLineText({ text: "x".repeat(600), maxLength: -5 })).toHaveLength(500);
		expect(cleanSingleLineText({ text: "x".repeat(600), maxLength: "many" })).toHaveLength(500);
	});
});
