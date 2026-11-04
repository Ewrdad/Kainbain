import { describe, it, expect } from "vitest";
import {
	isTruthySkillConditionalValue,
	renderSkillConditionals,
} from "../shared/skillConditionals.js";

/**
 * MARK: skillConditionals
 * @description `{{#if key}} … {{/if}}` blocks let one skill body serve
 *   configurations with and without an optional section (the question-me
 *   `imageGen` prompt section is the first consumer). Falsy (`none`/empty/
 *   missing) drops the block whole — including any placeholders inside it —
 *   while texts without a conditional opener pass through byte-identical.
 */
describe("isTruthySkillConditionalValue", () => {
	it.each([["muse"], ["MUSE"], [" mock "], ["0"], ["false"], ["SURVEY.md"]])(
		"treats %j as truthy",
		(value) => {
			expect(isTruthySkillConditionalValue(value)).toBe(true);
		},
	);

	it.each([[undefined], [null], [""], ["   "], ["none"], ["None"], [" NONE "]])(
		"treats %j as falsy",
		(value) => {
			expect(isTruthySkillConditionalValue(value)).toBe(false);
		},
	);
});

describe("renderSkillConditionals", () => {
	it("returns texts without a conditional opener byte-identical", () => {
		const text = "Target: {{outputFile}} and {{mystery}} stay.\nSecond line.";
		expect(renderSkillConditionals(text, { imageGen: "muse" })).toBe(text);
	});

	it("keeps the block for a truthy keyword", () => {
		const out = renderSkillConditionals("a{{#if imageGen}}b{{/if}}c", {
			imageGen: "muse",
		});
		expect(out).toBe("abc");
	});

	it.each([[{}], [{ imageGen: "none" }], [{ imageGen: "" }], [{ imageGen: "  " }]])(
		"drops the block whole for falsy map %j",
		(map) => {
			const out = renderSkillConditionals(
				"a{{#if imageGen}}b {{outputFile}}{{/if}}c",
				map,
			);
			expect(out).toBe("ac");
		},
	);

	it("resolves each block against its own key", () => {
		const out = renderSkillConditionals(
			"{{#if a}}A{{/if}}{{#if b}}B{{/if}}",
			{ a: "yes", b: "none" },
		);
		expect(out).toBe("A");
	});

	it("tolerates whitespace around the key", () => {
		expect(
			renderSkillConditionals("a{{#if   imageGen   }}b{{/if}}c", { imageGen: "muse" }),
		).toBe("abc");
	});

	it("composes with nesting (innermost first)", () => {
		const text = "a{{#if outer}}O{{#if inner}}I{{/if}}o{{/if}}c";
		expect(renderSkillConditionals(text, { outer: "x", inner: "y" })).toBe("aOIoc");
		expect(renderSkillConditionals(text, { outer: "x", inner: "none" })).toBe("aOoc");
		expect(renderSkillConditionals(text, { outer: "none", inner: "y" })).toBe("ac");
	});

	it("preserves an unclosed opener verbatim", () => {
		const text = "a{{#if imageGen}}b (never closed)";
		expect(renderSkillConditionals(text, { imageGen: "muse" })).toBe(text);
	});

	it("preserves a stray closer verbatim", () => {
		const text = "a{{/if}}b";
		expect(renderSkillConditionals(text, {})).toBe(text);
	});

	it("preserves an empty key verbatim", () => {
		const text = "a{{#if }}b{{/if}}c";
		expect(renderSkillConditionals(text, {})).toBe(text);
	});

	it("keeps unknown placeholders both inside kept blocks and outside", () => {
		const out = renderSkillConditionals("{{mystery}}{{#if k}}{{other}}{{/if}}", {
			k: "v",
		});
		expect(out).toBe("{{mystery}}{{other}}");
	});

	it("tolerates non-string input and non-object maps", () => {
		expect(renderSkillConditionals("", {})).toBe("");
		expect(renderSkillConditionals(null)).toBe("");
		expect(renderSkillConditionals(undefined)).toBe("");
		expect(renderSkillConditionals("a{{#if k}}b{{/if}}", null)).toBe("a");
		expect(renderSkillConditionals("a{{#if k}}b{{/if}}", "nope")).toBe("a");
	});
});
