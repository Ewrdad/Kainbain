import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	DEFAULT_IGNORED_PATHS,
	_parsePorcelainEntries,
	_resolveIgnorePaths,
	getWorkingTreeStatus,
	isWorkingTreeClean,
} from "./workingTreeStatus.js";

/***
 * MARK: git working-tree status unit tests
 * @description Direct tests for the `api/git/workingTreeStatus.js`
 *   porcelain parsing, ignore-path resolution, and cleanliness
 *   classification. child_process.spawn is mocked — no real git runs.
 ***/

/** Builds a fake spawn child that replays a mocked git response. */
function fakeChildFromResponse(
	{ stdout = "", stderr = "", code = 0, error = null } = {},
) {
	return {
		pid: 4242,
		stdout: {
			on: (ev, fn) => {
				if (ev === "data" && stdout) setImmediate(() => fn(Buffer.from(stdout)));
			},
		},
		stderr: {
			on: (ev, fn) => {
				if (ev === "data" && stderr) setImmediate(() => fn(Buffer.from(stderr)));
			},
		},
		on: (ev, fn) => {
			if (ev === "close") setImmediate(() => fn(error ? null : code, null));
			if (ev === "error" && error) setImmediate(() => fn(error));
		},
		kill: vi.fn(),
	};
}

/** Configures spawnMock to immediately replay one mocked git response. */
function mockGitResponse(
	{ stdout = "", stderr = "", code = 0, error = null } = {},
) {
	spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout, stderr, code, error }));
	return spawnMock;
}

describe("_parsePorcelainEntries", () => {
	it("preserves leading-space status columns (unstaged entries)", () => {
		expect(_parsePorcelainEntries(" M src/app.js\n")).toEqual([
			{ status: " M", path: "src/app.js" },
		]);
	});

	it("parses staged, untracked, and rename entries", () => {
		expect(_parsePorcelainEntries("M  package.json\n?? new.txt\n")).toEqual([
			{ status: "M ", path: "package.json" },
			{ status: "??", path: "new.txt" },
		]);
		const renamed = _parsePorcelainEntries('R  "old name.js" -> "new name.js"\n');
		expect(renamed).toHaveLength(1);
		expect(renamed[0].status).toBe("R ");
	});

	it("skips blank lines and empty output", () => {
		expect(_parsePorcelainEntries("")).toEqual([]);
		expect(_parsePorcelainEntries("\n\n")).toEqual([]);
	});
});

describe("_resolveIgnorePaths", () => {
	it("ignores engine artifact prefixes by default", () => {
		const paths = _resolveIgnorePaths();
		expect(paths).toContainEqual("docs/tasks/");
		expect(paths).toContainEqual(DEFAULT_IGNORED_PATHS[0]);
	});

	it("honors an explicit ignorePaths list verbatim", () => {
		expect(_resolveIgnorePaths({ ignorePaths: [] })).toEqual([]);
		expect(_resolveIgnorePaths({ ignorePaths: ["custom/"] })).toEqual(["custom/"]);
	});

	it("adds a custom docs link name and state folder from a project hint", () => {
		const paths = _resolveIgnorePaths({
			project: { docsDirName: "kainbain-docs", kainbainDirName: ".kb" },
		});
		expect(paths).toContainEqual("kainbain-docs/tasks/");
		expect(paths).toContainEqual(".kb/");
	});
});

describe("working tree cleanliness", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("is clean when porcelain output is empty", async () => {
		mockGitResponse({ stdout: "" });
		expect(await isWorkingTreeClean("/repo")).toBe(true);
	});

	it("is dirty for modified tracked files (staged or unstaged)", async () => {
		mockGitResponse({ stdout: " M src/app.js\nM  package.json\n" });
		expect(await isWorkingTreeClean("/repo")).toBe(false);
	});

	it("is dirty for untracked files (strict default)", async () => {
		mockGitResponse({ stdout: "?? build-artifact.bin\n" });
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo");
		expect(clean).toBe(false);
		expect(dirtyPaths).toEqual(["build-artifact.bin"]);
	});

	it("ignores KainBain artifact paths (docs/tasks/, .kainbain/)", async () => {
		mockGitResponse({
			stdout:
				" M docs/tasks/task-1/task.md\n?? .kainbain/project.json\n?? newfile.txt\n",
		});
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo");
		expect(dirtyPaths).toEqual(["newfile.txt"]);
		expect(clean).toBe(false);
	});

	it("handles rename entries (R old -> new)", async () => {
		mockGitResponse({ stdout: 'R  "old name.js" -> "new name.js"\n' });
		const { clean } = await getWorkingTreeStatus("/repo", { ignorePaths: [] });
		expect(clean).toBe(false);
	});

	it("ignores untracked engine files in docs/tasks/ and .kainbain/", async () => {
		mockGitResponse({ stdout: "?? docs/tasks/report.md\n?? .kainbain/project.json\n" });
		expect(await isWorkingTreeClean("/repo")).toBe(true);
	});

	it("marks non-engine docs and .gitignore as dirty (not ignored)", async () => {
		mockGitResponse({
			stdout: " M docs/README.md\n M .gitignore\n",
		});
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo");
		expect(clean).toBe(false);
		expect(dirtyPaths).toEqual(["docs/README.md", ".gitignore"]);
	});

	it("ignores a custom docs link name when given a project hint", async () => {
		mockGitResponse({ stdout: "?? kainbain-docs/tasks/t-1/task.md\n" });
		const { clean } = await getWorkingTreeStatus("/repo", {
			project: { docsDirName: "kainbain-docs" },
		});
		expect(clean).toBe(true);
	});

	it("still flags a custom docs link name without a project hint", async () => {
		mockGitResponse({ stdout: "?? kainbain-docs/tasks/t-1/task.md\n" });
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo");
		expect(clean).toBe(false);
		expect(dirtyPaths).toEqual(["kainbain-docs/tasks/t-1/task.md"]);
	});

	it("ignores a project's custom state folder (kainbainDirName)", async () => {
		mockGitResponse({
			stdout:
				"?? .kb/project.json\n?? .kb/sessions/s.md\n?? .kb/worktrees/t-1/x\n?? src/new.js\n",
		});
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo", {
			project: { kainbainDirName: ".kb" },
		});
		expect(clean).toBe(false);
		expect(dirtyPaths).toEqual(["src/new.js"]);
	});

	it("still flags a custom state folder without a project hint", async () => {
		mockGitResponse({ stdout: "?? .kb/project.json\n" });
		const { clean, dirtyPaths } = await getWorkingTreeStatus("/repo");
		expect(clean).toBe(false);
		expect(dirtyPaths).toEqual([".kb/project.json"]);
	});
});
