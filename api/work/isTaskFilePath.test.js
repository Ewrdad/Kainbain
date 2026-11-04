import { describe, it, expect } from "vitest";
import { isTaskFilePath } from "./isTaskFilePath.js";

describe("isTaskFilePath", () => {
	it("matches files inside the default task directory", () => {
		expect(isTaskFilePath("docs/tasks/t1/task.md", "docs/tasks/")).toBe(true);
		expect(isTaskFilePath("docs/tasks/t1/assets/image.png", "docs/tasks/")).toBe(
			true,
		);
		expect(isTaskFilePath("docs/tasks", "docs/tasks/")).toBe(true);
	});

	it("rejects sibling and unrelated paths", () => {
		expect(isTaskFilePath("docs/other.md", "docs/tasks/")).toBe(false);
		expect(isTaskFilePath("src/app.js", "docs/tasks/")).toBe(false);
		expect(isTaskFilePath("docs/tasksfoo/x.md", "docs/tasks/")).toBe(false);
		expect(isTaskFilePath("", "docs/tasks/")).toBe(false);
		expect(isTaskFilePath(null, "docs/tasks/")).toBe(false);
	});

	it("tolerates leading ./ and backslashes", () => {
		expect(isTaskFilePath("./docs/tasks/t1/report.md", "docs/tasks/")).toBe(true);
		expect(isTaskFilePath(".\\docs\\tasks\\t1\\report.md", "docs/tasks/")).toBe(
			true,
		);
	});

	it("honours a custom docs directory prefix", () => {
		expect(
			isTaskFilePath("k-docs/tasks/t1/plan.md", "k-docs/tasks/"),
		).toBe(true);
		expect(isTaskFilePath("docs/tasks/t1/plan.md", "k-docs/tasks/")).toBe(false);
	});

	it("handles a prefix without a trailing slash", () => {
		expect(isTaskFilePath("docs/tasks/t1/task.md", "docs/tasks")).toBe(true);
	});

	it("rejects missing or invalid prefix arguments", () => {
		expect(isTaskFilePath("docs/tasks/t1/task.md", "")).toBe(false);
		expect(isTaskFilePath("docs/tasks/t1/task.md", null)).toBe(false);
	});
});