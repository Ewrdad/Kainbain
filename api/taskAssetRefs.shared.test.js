import { describe, it, expect } from "vitest";
import {
	extractAssetRefs,
	normalizeAssetSrc,
} from "../shared/taskAssetRefs/index.js";

// The shared task-asset ref grammar: one tolerant parser for `assets/<name>`
// markdown destinations, used by backend prompt curation (missing-asset
// warnings) and the frontend viewer (resolveTaskImageUrl), so detection can
// never drift from what the viewer resolves. Corpus below mirrors the real
// refs inventoried in docs/tasks (plain `![x](assets/x.png)` dominant) plus
// the prefix/title variants the viewer already tolerates.

describe("normalizeAssetSrc", () => {
	it("normalizes the plain relative form", () => {
		expect(normalizeAssetSrc("assets/image.png")).toBe("assets/image.png");
		expect(normalizeAssetSrc("  assets/a.png  ")).toBe("assets/a.png");
	});

	it("tolerates ./, / and task-folder prefixes", () => {
		expect(normalizeAssetSrc("./assets/a.png")).toBe("assets/a.png");
		expect(normalizeAssetSrc("/assets/a.png")).toBe("assets/a.png");
		expect(normalizeAssetSrc("docs/tasks/t1/assets/a.png")).toBe(
			"assets/a.png",
		);
		expect(normalizeAssetSrc("./docs/tasks/t1/assets/a.png")).toBe(
			"assets/a.png",
		);
	});

	it("strips a trailing quoted title and unwraps angle destinations", () => {
		expect(normalizeAssetSrc('assets/a.png "shot"')).toBe("assets/a.png");
		expect(normalizeAssetSrc("assets/a.png 'shot'")).toBe("assets/a.png");
		expect(normalizeAssetSrc("<assets/a.png>")).toBe("assets/a.png");
	});

	it("unwraps angle destinations carrying a trailing title", () => {
		expect(normalizeAssetSrc('<assets/a.png> "shot"')).toBe("assets/a.png");
		expect(normalizeAssetSrc("<./assets/a.png>")).toBe("assets/a.png");
	});

	it("drops a stray trailing angle bracket like the serve sanitizer", () => {
		expect(normalizeAssetSrc("assets/a.png>")).toBe("assets/a.png");
	});

	it("keeps unquoted spaced remainders whole (viewer parity)", () => {
		expect(normalizeAssetSrc("assets/my shot.png")).toBe(
			"assets/my shot.png",
		);
	});

	it("rejects absolute and protocol URLs", () => {
		expect(normalizeAssetSrc("https://x/y.png")).toBe(null);
		expect(normalizeAssetSrc("http://x/assets/a.png")).toBe(null);
		expect(normalizeAssetSrc("//x/assets/a.png")).toBe(null);
		expect(normalizeAssetSrc("javascript:alert(1)")).toBe(null);
		expect(normalizeAssetSrc("data:image/png;base64,xx")).toBe(null);
	});

	it("rejects non-asset paths and query/fragment suffixed refs", () => {
		expect(normalizeAssetSrc("docs/notes.md")).toBe(null);
		expect(normalizeAssetSrc("assets/a.png?v=1")).toBe(null);
		expect(normalizeAssetSrc("assets/a.png#frag")).toBe(null);
		expect(normalizeAssetSrc("")).toBe(null);
		expect(normalizeAssetSrc(null)).toBe(null);
		expect(normalizeAssetSrc(undefined)).toBe(null);
	});
});

describe("extractAssetRefs", () => {
	it("extracts image refs in order, deduped", () => {
		expect(
			extractAssetRefs(
				"See ![one](assets/a.png) then ![two](assets/b.png) then ![one](assets/a.png).",
			),
		).toEqual(["assets/a.png", "assets/b.png"]);
	});

	it("extracts plain link refs as well as image refs", () => {
		expect(extractAssetRefs("See [shot](assets/a.png) for detail.")).toEqual([
			"assets/a.png",
		]);
	});

	it("normalizes prefixes and titles inside markdown", () => {
		expect(
			extractAssetRefs(
				'![a](./assets/a.png "shot") and ![b](docs/tasks/t1/assets/b.png)',
			),
		).toEqual(["assets/a.png", "assets/b.png"]);
	});

	it("captures angle destinations holding parens whole", () => {
		expect(extractAssetRefs("![a](<assets/my (1).png>)")).toEqual([
			"assets/my (1).png",
		]);
	});

	it("ignores absolute URLs and non-asset destinations", () => {
		expect(
			extractAssetRefs(
				"![a](https://x/y.png) ![b](docs/notes.md) ![c](assets/ok.png)",
			),
		).toEqual(["assets/ok.png"]);
	});

	it("returns [] for empty and non-string input", () => {
		expect(extractAssetRefs("")).toEqual([]);
		expect(extractAssetRefs("no refs here")).toEqual([]);
		expect(extractAssetRefs(null)).toEqual([]);
		expect(extractAssetRefs(undefined)).toEqual([]);
		expect(extractAssetRefs(42)).toEqual([]);
	});
});
