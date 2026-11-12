/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { commitAllIfNeeded, isDocPath, discardChangesOutsideDocs } = await import("./commit.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo(docsDir) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-nocode-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.mkdirSync(path.join(dir, docsDir), { recursive: true });
	fs.writeFileSync(path.join(dir, docsDir, "keep.md"), "base doc\n");
	fs.mkdirSync(path.join(dir, "src"), { recursive: true });
	fs.writeFileSync(path.join(dir, "src", "app.js"), "base code\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	return dir;
}

function committedFiles(cwd) {
	return run(cwd, "show", "--name-only", "--format=", "HEAD")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

const tempDirs = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

describe("isDocPath", () => {
	it("treats the docs root and nested paths as docs", () => {
		expect(isDocPath("docs", "docs")).toBe(true);
		expect(isDocPath("docs/a.md", "docs")).toBe(true);
		expect(isDocPath("k-docs/tasks/t/plan.md", "k-docs")).toBe(true);
		expect(isDocPath("src/app.js", "docs")).toBe(false);
		expect(isDocPath("", "docs")).toBe(false);
	});
});

describe("discardChangesOutsideDocs (real git)", () => {
	it("keeps docs changes and erases tracked + untracked code changes", async () => {
		if (!gitAvailable) return;
		const dir = initRepo("docs");
		tempDirs.push(dir);
		fs.writeFileSync(path.join(dir, "docs", "new.md"), "new doc\n");
		fs.writeFileSync(path.join(dir, "src", "app.js"), "changed code\n");
		fs.writeFileSync(path.join(dir, "src", "extra.js"), "untracked\n");

		const res = await discardChangesOutsideDocs(dir, "docs");
		expect(res.discarded).toContain("src/app.js");
		expect(res.discarded).toContain("src/extra.js");
		expect(res.discarded).not.toContain("docs/new.md");

		expect(fs.readFileSync(path.join(dir, "src", "app.js"), "utf8")).toBe("base code\n");
		expect(fs.existsSync(path.join(dir, "src", "extra.js"))).toBe(false);
		expect(fs.readFileSync(path.join(dir, "docs", "new.md"), "utf8")).toBe("new doc\n");
	});

	it("does not throw outside a git repository", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-nocode-nogit-"));
		tempDirs.push(dir);
		const res = await discardChangesOutsideDocs(dir, "docs");
		expect(res.discarded).toEqual([]);
	});
});

describe("commitAllIfNeeded no-code (real git)", () => {
	let dir;
	beforeEach(() => {
		if (!gitAvailable) return;
		dir = initRepo("docs");
		tempDirs.push(dir);
	});

	it("commits only docs changes and discards code changes", async () => {
		if (!gitAvailable) return;
		fs.writeFileSync(path.join(dir, "docs", "new.md"), "new doc\n");
		fs.writeFileSync(path.join(dir, "src", "app.js"), "changed code\n");
		fs.writeFileSync(path.join(dir, "src", "extra.js"), "untracked\n");

		const res = await commitAllIfNeeded(dir, "stage work", {
			noCode: true,
			docsDirName: "docs",
		});

		expect(res.committed).toBe(true);
		expect(committedFiles(dir)).toEqual(["docs/new.md"]);
		expect(fs.readFileSync(path.join(dir, "src", "app.js"), "utf8")).toBe("base code\n");
		expect(fs.existsSync(path.join(dir, "src", "extra.js"))).toBe(false);
	});

	it("commits everything when noCode is false", async () => {
		if (!gitAvailable) return;
		fs.writeFileSync(path.join(dir, "docs", "new.md"), "new doc\n");
		fs.writeFileSync(path.join(dir, "src", "app.js"), "changed code\n");

		const res = await commitAllIfNeeded(dir, "stage work", { noCode: false });

		expect(res.committed).toBe(true);
		const files = committedFiles(dir);
		expect(files).toContain("docs/new.md");
		expect(files).toContain("src/app.js");
	});

	it("honours a custom docs directory name", async () => {
		if (!gitAvailable) return;
		const customDir = initRepo("kdocs");
		tempDirs.push(customDir);
		fs.writeFileSync(path.join(customDir, "kdocs", "new.md"), "new doc\n");
		fs.writeFileSync(path.join(customDir, "src", "app.js"), "changed code\n");

		const res = await commitAllIfNeeded(customDir, "stage work", {
			noCode: true,
			docsDirName: "kdocs",
		});

		expect(res.committed).toBe(true);
		expect(committedFiles(customDir)).toEqual(["kdocs/new.md"]);
	});
});
