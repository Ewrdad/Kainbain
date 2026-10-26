import { describe, expect, it } from "vitest";
import { slugifyProjectName } from "./projectSlug.js";

describe("slugifyProjectName", () => {
	it("slugifies a name", () => {
		expect(slugifyProjectName("My Awesome Project!")).toBe("my-awesome-project");
	});

	it("matches the oracle examples", () => {
		expect(slugifyProjectName("My Project 123")).toBe("my-project-123");
		expect(slugifyProjectName("Test / Slash & Symbols")).toBe("test-slash-symbols");
	});

	it("falls back for empty", () => {
		expect(slugifyProjectName("")).toBe("untitled-project");
	});

	it("falls back when nothing slug-safe remains", () => {
		expect(slugifyProjectName("!!!")).toBe("untitled-project");
		expect(slugifyProjectName("---")).toBe("untitled-project");
	});

	it("trims, lowercases, and collapses separators", () => {
		expect(slugifyProjectName("  Foo__Bar  ")).toBe("foo__bar");
		expect(slugifyProjectName("a--b")).toBe("a-b");
		expect(slugifyProjectName(42)).toBe("42");
	});
});
