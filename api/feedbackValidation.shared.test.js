import { describe, it, expect } from "vitest";
import {
	FEEDBACK_VALIDATION_CODE,
	MIN_FEEDBACK_PROSE_CHARS,
	feedbackProseChars,
	findMissingRefsAgainst,
	formatFeedbackValidationError,
	isImageOnlyFeedback,
	stripAssetRefs,
	validateHumanFeedback,
} from "../shared/feedbackValidation/index.js";

// Submit-time human-feedback validation: the one decision the UI pre-check
// and the API 422 shell share. Corpus covers the Step 0c shapes (angle
// destinations, titles, multi-image, mixed link+image) plus the parity
// cases (drifted-but-servable never blocks, external URLs never block).

describe("feedbackProseChars", () => {
	it("counts plain prose without whitespace", () => {
		expect(feedbackProseChars("Fix the retry path")).toBe(15);
		expect(feedbackProseChars("  spaced\tout\n")).toBe(9);
	});

	it("drops image markup entirely, including alt text", () => {
		expect(feedbackProseChars("![shot](assets/shot.png)")).toBe(0);
		expect(feedbackProseChars("See ![a long alt](assets/a.png) here")).toBe(7);
	});

	it("keeps plain-link text but drops the destination", () => {
		expect(feedbackProseChars("[see this](assets/a.png)")).toBe(7);
		expect(feedbackProseChars("[see this](https://example.com/x)")).toBe(7);
	});

	it("tolerates angle destinations, titles, and prefixes", () => {
		expect(feedbackProseChars("![a](<assets/my (1).png>)")).toBe(0);
		expect(feedbackProseChars('![a](assets/a.png "shot")')).toBe(0);
		expect(feedbackProseChars("Note ![a](./docs/tasks/t1/assets/a.png)")).toBe(4);
	});

	it("reads non-strings as zero prose", () => {
		expect(feedbackProseChars("")).toBe(0);
		expect(feedbackProseChars(null)).toBe(0);
		expect(feedbackProseChars(undefined)).toBe(0);
		expect(feedbackProseChars(42)).toBe(0);
	});
});

describe("isImageOnlyFeedback", () => {
	it("flags the case-study shape: a lone dangling image ref", () => {
		expect(isImageOnlyFeedback("![image.png](assets/image.png)")).toBe(true);
	});

	it("flags image-only drafts even when the file is attached", () => {
		expect(isImageOnlyFeedback("![a](assets/a.png)\n\n![b](assets/b.png)")).toBe(
			true,
		);
	});

	it("flags external-image-only drafts (prose is still missing)", () => {
		expect(isImageOnlyFeedback("![a](https://example.com/a.png)")).toBe(true);
	});

	it("flags asset-link-only drafts with near-empty link text", () => {
		expect(isImageOnlyFeedback("[a](assets/a.png)")).toBe(true);
	});

	it("passes when a short note accompanies the pictures", () => {
		expect(
			isImageOnlyFeedback(
				"The retry path drops the error — see ![shot](assets/shot.png)",
			),
		).toBe(false);
		expect(isImageOnlyFeedback("Broken on save ![a](assets/a.png)")).toBe(false);
	});

	it("never flags plain-text feedback, however short", () => {
		expect(isImageOnlyFeedback("fix it")).toBe(false);
		expect(isImageOnlyFeedback("LGTM")).toBe(false);
		expect(isImageOnlyFeedback("")).toBe(false);
		expect(isImageOnlyFeedback("   ")).toBe(false);
		expect(isImageOnlyFeedback(null)).toBe(false);
	});

	it("ignores plain external links without visual content", () => {
		expect(isImageOnlyFeedback("[docs](https://example.com/docs)")).toBe(false);
	});

	it("honours the prose-bar override", () => {
		const draft = "ok see ![a](assets/a.png)";
		expect(isImageOnlyFeedback(draft)).toBe(true);
		expect(isImageOnlyFeedback(draft, { minProseChars: 5 })).toBe(false);
		expect(isImageOnlyFeedback(draft, { minProseChars: 0 })).toBe(true);
		expect(isImageOnlyFeedback(draft, { minProseChars: "many" })).toBe(true);
	});

	it("treats a null options bag as the default bar (never throws)", () => {
		expect(isImageOnlyFeedback("![a](assets/a.png)", null)).toBe(true);
		expect(isImageOnlyFeedback("Broken on save ![a](assets/a.png)", null)).toBe(
			false,
		);
		expect(isImageOnlyFeedback("fix it", null)).toBe(false);
	});

	it("holds the bar at the named constant", () => {
		expect(MIN_FEEDBACK_PROSE_CHARS).toBe(10);
		// Exactly at the bar passes: 10 non-space chars + one image.
		expect(isImageOnlyFeedback("0123456789 ![a](assets/a.png)")).toBe(false);
		expect(isImageOnlyFeedback("012345678 ![a](assets/a.png)")).toBe(true);
	});
});

describe("findMissingRefsAgainst", () => {
	it("names dangling refs in first-appearance order", () => {
		expect(
			findMissingRefsAgainst(
				"See ![b](assets/b.png) and ![a](assets/a.png)",
				[],
			),
		).toEqual(["assets/b.png", "assets/a.png"]);
	});

	it("accepts literally present names", () => {
		expect(
			findMissingRefsAgainst("![a](assets/a.png)", ["a.png", "b.png"]),
		).toEqual([]);
	});

	it("never blocks drifted-but-servable refs (serve parity)", () => {
		// Wrong case, spaces, punctuation: the serve route canonicalises
		// these to the stored bytes, so the pre-check must too.
		expect(findMissingRefsAgainst("![a](assets/Shot.png)", ["shot.png"])).toEqual(
			[],
		);
		expect(
			findMissingRefsAgainst("![a](assets/My Shot.PNG)", ["my-shot.png"]),
		).toEqual([]);
		expect(
			findMissingRefsAgainst("![a](<assets/My Shot (1).PNG>)", [
				"my-shot-1.png",
			]),
		).toEqual([]);
	});

	it("still names truly absent refs", () => {
		expect(
			findMissingRefsAgainst("![a](assets/gone.png)", ["kept.png"]),
		).toEqual(["assets/gone.png"]);
	});

	it("scans plain asset links as well as images", () => {
		expect(findMissingRefsAgainst("[shot](assets/gone.png)", [])).toEqual([
			"assets/gone.png",
		]);
	});

	it("ignores external URLs and non-asset paths exactly like curation", () => {
		expect(
			findMissingRefsAgainst(
				"![a](https://example.com/assets/a.png) ![b](/tmp/b.png) ![c](data:image/png;base64,xx)",
				[],
			),
		).toEqual([]);
	});

	it("dedupes repeat mentions and tolerates title/angle spellings", () => {
		expect(
			findMissingRefsAgainst(
				'![a](assets/gone.png) ![a](assets/gone.png "again") ![a](<assets/gone.png>)',
				[],
			),
		).toEqual(["assets/gone.png"]);
	});

	it("reads untrusted input as no refs", () => {
		expect(findMissingRefsAgainst("", [])).toEqual([]);
		expect(findMissingRefsAgainst(null, [])).toEqual([]);
		expect(findMissingRefsAgainst("![a](assets/a.png)", null)).toEqual([
			"assets/a.png",
		]);
		expect(findMissingRefsAgainst("![a](assets/a.png)")).toEqual([
			"assets/a.png",
		]);
	});
});

describe("stripAssetRefs", () => {
	it("removes exactly the dangling full-line refs", () => {
		expect(
			stripAssetRefs("Fix it\n\n![a](assets/gone.png)\n", ["assets/gone.png"]),
		).toBe("Fix it");
	});

	it("leaves prose and healthy refs byte-identical", () => {
		const draft =
			"Fix it\n\n![kept](assets/kept.png)\n\n![gone](assets/gone.png)\n";
		expect(stripAssetRefs(draft, ["assets/gone.png"])).toBe(
			"Fix it\n\n![kept](assets/kept.png)",
		);
	});

	it("removes inline matches but keeps the surrounding words", () => {
		expect(
			stripAssetRefs("See ![a](assets/gone.png) here", ["assets/gone.png"]),
		).toBe("See here");
	});

	it("keeps plain-link text when stripping a dead link", () => {
		expect(
			stripAssetRefs("See [shot](assets/gone.png) here", ["assets/gone.png"]),
		).toBe("See shot here");
	});

	it("strips every spelling that resolves to the ref", () => {
		const draft =
			'![a](./assets/gone.png) and ![b](<assets/gone.png>) and ![c](assets/gone.png "t")';
		expect(stripAssetRefs(draft, ["assets/gone.png"])).toBe("and and");
	});

	it("is a no-op for empty targets or untrusted input", () => {
		expect(stripAssetRefs("Fix it", [])).toBe("Fix it");
		expect(stripAssetRefs("Fix it", null)).toBe("Fix it");
		expect(stripAssetRefs("", ["assets/a.png"])).toBe("");
		expect(stripAssetRefs(null, ["assets/a.png"])).toBe("");
	});
});

describe("validateHumanFeedback", () => {
	it("passes healthy drafts with the full decision shape", () => {
		expect(validateHumanFeedback("Please add tests", [])).toEqual({
			ok: true,
			missing: [],
			imageOnly: false,
			proseChars: 14,
			minProseChars: MIN_FEEDBACK_PROSE_CHARS,
		});
	});

	it("blocks dangling refs and names them", () => {
		const decision = validateHumanFeedback(
			"See ![a](assets/gone.png) please take a look",
			["kept.png"],
		);
		expect(decision.ok).toBe(false);
		expect(decision.missing).toEqual(["assets/gone.png"]);
		expect(decision.imageOnly).toBe(false);
	});

	it("blocks image-only drafts", () => {
		const decision = validateHumanFeedback("![a](assets/a.png)", ["a.png"]);
		expect(decision.ok).toBe(false);
		expect(decision.missing).toEqual([]);
		expect(decision.imageOnly).toBe(true);
	});

	it("reports both findings together", () => {
		const decision = validateHumanFeedback("![a](assets/gone.png)", []);
		expect(decision.ok).toBe(false);
		expect(decision.missing).toEqual(["assets/gone.png"]);
		expect(decision.imageOnly).toBe(true);
	});

	it("passes attached images with a note, and short plain text", () => {
		expect(
			validateHumanFeedback("Broken on save ![a](assets/a.png)", ["a.png"]).ok,
		).toBe(true);
		expect(validateHumanFeedback("LGTM", []).ok).toBe(true);
		expect(validateHumanFeedback("", []).ok).toBe(true);
	});

	it("downgrades to advisory with strict: false (the q1 switch)", () => {
		const decision = validateHumanFeedback("![a](assets/gone.png)", [], {
			strict: false,
		});
		expect(decision.ok).toBe(true);
		expect(decision.missing).toEqual(["assets/gone.png"]);
		expect(decision.imageOnly).toBe(true);
	});

	it("tolerates untrusted input", () => {
		expect(validateHumanFeedback(null, null).ok).toBe(true);
		expect(validateHumanFeedback("![a](assets/a.png)", null).ok).toBe(false);
		expect(validateHumanFeedback("![a](assets/a.png)", [], null).ok).toBe(false);
		expect(validateHumanFeedback(null, null, null).ok).toBe(true);
	});
});

describe("formatFeedbackValidationError", () => {
	it("names every missing file", () => {
		const message = formatFeedbackValidationError({
			missing: ["assets/a.png", "assets/b.png"],
			imageOnly: false,
		});
		expect(message).toContain("assets/a.png");
		expect(message).toContain("assets/b.png");
		expect(message).toContain("2 files");
	});

	it("uses the singular form for one file", () => {
		expect(
			formatFeedbackValidationError({
				missing: ["assets/gone.png"],
				imageOnly: false,
			}),
		).toContain("1 file that is not attached: assets/gone.png");
	});

	it("asks for the description on image-only drafts", () => {
		const message = formatFeedbackValidationError({
			missing: [],
			imageOnly: true,
			minProseChars: 10,
		});
		expect(message).toContain("only images");
		expect(message).toContain("10 characters");
	});

	it("joins both findings and stays silent when valid", () => {
		const both = formatFeedbackValidationError({
			missing: ["assets/gone.png"],
			imageOnly: true,
		});
		expect(both).toContain("assets/gone.png");
		expect(both).toContain("only images");
		expect(formatFeedbackValidationError({ missing: [], imageOnly: false })).toBe(
			"",
		);
		expect(formatFeedbackValidationError()).toBe("");
	});
});

describe("feedback validation contract", () => {
	it("pins the 422 code both shells share", () => {
		expect(FEEDBACK_VALIDATION_CODE).toBe("FEEDBACK_VALIDATION_FAILED");
	});
});
