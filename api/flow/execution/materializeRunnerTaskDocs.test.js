import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materializeRunnerTaskDocs } from "./materializeRunnerTaskDocs.js";

describe("materializeRunnerTaskDocs", () => {
	let cwd;
	beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-mat-")); });
	afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });
	it("writes runner files into the backend task folder", () => {
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [{ name: "IMPLEMENTATION_PLAN.md", content: "plan-body" }] });
		expect(out.written).toEqual(["IMPLEMENTATION_PLAN.md"]);
		expect(fs.readFileSync(path.join(cwd, "docs/tasks/t1/IMPLEMENTATION_PLAN.md"), "utf8")).toBe("plan-body");
	});
	it("never overwrites task.md, blocks traversal, caps size", () => {
		const out = materializeRunnerTaskDocs({ project: { cwd }, taskId: "t1", files: [
			{ name: "task.md", content: "evil" },
			{ name: "../../escape.md", content: "x" },
			{ name: "big.md", content: "x".repeat(300 * 1024) },
		]});
		expect(out.written).toEqual(["escape.md"]);
		expect(fs.existsSync(path.join(cwd, "docs/tasks/t1/task.md"))).toBe(false);
		expect(fs.existsSync(path.join(cwd, "escape.md"))).toBe(false);
		expect(fs.readFileSync(path.join(cwd, "docs/tasks/t1/escape.md"), "utf8")).toBe("x");
	});
});
