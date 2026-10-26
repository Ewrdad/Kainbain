import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	SWEEPABLE_DIR_PREFIXES,
	SWEEPABLE_BASENAME_PATTERNS,
	assessDirtyTree,
	recoverDirtyTree,
	requireCleanWorkingTree,
	drainDirtyTreeRecoveries,
	formatDirtyTreeRecoveryNotice,
} from "./workingTreeRecovery.js";
import { GitDirtyTreeError } from "./errors.js";

/***
 * MARK: git working-tree recovery unit tests
 * @description Direct tests for the `api/git/workingTreeRecovery.js`
 *   ladder: dirty-tree classification, debris sweeping, marked stashing,
 *   the clean-tree guard, and the audit journal. spawn is mocked; sweep
 *   targets live in throwaway os.tmpdir() dirs.
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

describe("assessDirtyTree", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("reports a clean tree with empty buckets", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		const res = await assessDirtyTree("/repo");
		expect(res).toEqual({
			clean: true,
			dirtyPaths: [],
			sweepablePaths: [],
			stashablePaths: [],
			blockingPaths: [],
		});
	});

	it("classifies sweepable, stashable, and blocking paths", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({
				stdout: "?? notes.tmp\n M src/tracked.js\n?? user-notes.txt\n",
			}),
		);
		const res = await assessDirtyTree("/repo");
		expect(res.clean).toBe(false);
		expect(res.sweepablePaths).toEqual(["notes.tmp"]);
		expect(res.stashablePaths).toEqual(["src/tracked.js"]);
		expect(res.blockingPaths).toEqual(["user-notes.txt"]);
		expect(res.dirtyPaths).toHaveLength(3);
	});

	it("classifies engine-prefix debris as sweepable when ignores are opted out", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({
				stdout: "?? .kainbain/tmp/scratch.txt\n",
			}),
		);
		const res = await assessDirtyTree("/repo", { ignorePaths: [] });
		expect(res.clean).toBe(false);
		expect(res.sweepablePaths).toEqual([".kainbain/tmp/scratch.txt"]);
		expect(res.blockingPaths).toEqual([]);
	});

	it("treats machine-debris basenames as sweepable anywhere", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ stdout: "?? src/.DS_Store\n?? src/notes.bak\n" }),
		);
		const res = await assessDirtyTree("/repo");
		expect(res.sweepablePaths).toEqual(
			expect.arrayContaining(["src/.DS_Store", "src/notes.bak"]),
		);
		expect(res.blockingPaths).toEqual([]);
	});
});

describe("recoverDirtyTree", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("returns alreadyClean without journaling on a clean tree", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		const res = await recoverDirtyTree("/repo", { taskId: "t-1" });
		expect(res).toMatchObject({ recovered: true, alreadyClean: true });
		expect(res.recoveryAttempts).toEqual([]);
		expect(await drainDirtyTreeRecoveries("/repo")).toHaveLength(0);
	});

	it("sweeps real engine debris from a throwaway dir and recovers", async () => {
		/* eslint-disable security/detect-non-literal-fs-filename -- throwaway os.tmpdir() dirs only; spawn is mocked */
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-recover-"));
		try {
			const debrisPath = path.join(cwd, "notes.tmp");
			fs.writeFileSync(debrisPath, "x");
			let statusCalls = 0;
			spawnMock.mockImplementation(() => {
				statusCalls += 1;
				// First assessment sees the debris; after the sweep it is gone.
				return fakeChildFromResponse({
					stdout: statusCalls === 1 ? "?? notes.tmp\n" : "",
				});
			});
			const res = await recoverDirtyTree(cwd, { taskId: "t-sweep" });
			expect(res.recovered).toBe(true);
			expect(res.recoveryAttempts[0]).toMatchObject({ step: "sweep", ok: true });
			expect(fs.existsSync(debrisPath)).toBe(false);
			const entries = await drainDirtyTreeRecoveries(cwd);
			expect(entries).toHaveLength(1);
			expect(entries[0].recovered).toBe(true);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	});

	it("stashes tracked modifications with a task marker when sweeping is not enough", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args[0] === "status") {
				const stashDone = calls.some(
					(a) => a[0] === "stash" && a[1] === "push",
				);
				return fakeChildFromResponse({
					stdout: stashDone ? "" : " M src/tracked.js\n",
				});
			}
			if (args[0] === "stash") return fakeChildFromResponse({ stdout: "" });
			if (args[0] === "rev-parse") {
				return fakeChildFromResponse({ stdout: "stash-sha" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await recoverDirtyTree("/repo", { taskId: "t-2" });
		expect(res.recovered).toBe(true);
		expect(res.stashRef).toBe("stash-sha");
		expect(calls).toContainEqual([
			"stash",
			"push",
			"-m",
			"kainbain-task-t-2",
		]);
	});

	it("reports unrecovered when only blocking user files remain", async () => {
		spawnMock.mockImplementation(() => {
			return fakeChildFromResponse({ stdout: "?? user-notes.txt\n" });
		});
		const res = await recoverDirtyTree("/repo", { taskId: "t-3" });
		expect(res.recovered).toBe(false);
		expect(res.dirtyPaths).toEqual(["user-notes.txt"]);
		expect(res.recoveryAttempts).toEqual([]);
	});
});

describe("requireCleanWorkingTree", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("resolves clean on an empty tree", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		await expect(requireCleanWorkingTree("/repo")).resolves.toMatchObject({
			clean: true,
		});
	});

	it("throws GitDirtyTreeError listing paths with recovery off", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ stdout: " M src/one.js\n M src/two.js\n" }),
		);
		await expect(
			requireCleanWorkingTree("/repo", { recovery: "off", context: "checkout" }),
		).rejects.toThrow(GitDirtyTreeError);
		await expect(
			requireCleanWorkingTree("/repo", { recovery: "off" }),
		).rejects.toMatchObject({
			dirtyPaths: expect.arrayContaining(["src/one.js", "src/two.js"]),
		});
	});

	it("runs the ladder by default and throws with a ladder report when blocked", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ stdout: "?? user-notes.txt\n" }),
		);
		const err = await requireCleanWorkingTree("/repo", {
			context: "checkout",
		}).catch((e) => e);
		expect(err).toBeInstanceOf(GitDirtyTreeError);
		expect(err.message).toContain("checkout");
		expect(err.dirtyPaths).toEqual(["user-notes.txt"]);
	});
});

describe("formatDirtyTreeRecoveryNotice", () => {
	it("renders sweep and stash steps", () => {
		const line = formatDirtyTreeRecoveryNotice({
			recovered: true,
			recoveryAttempts: [
				{ step: "sweep", removed: ["a.tmp"] },
				{ step: "stash", ref: "abc" },
			],
		});
		expect(line).toContain("restored a clean tree");
		expect(line).toContain("swept 1 artifact(s)");
		expect(line).toContain("stashed to 'abc'");
	});

	it("renders an unrecovered run honestly", () => {
		expect(
			formatDirtyTreeRecoveryNotice({ recovered: false, recoveryAttempts: [] }),
		).toContain("without restoring a clean tree");
	});
});

describe("sweep constants", () => {
	it("covers the engine-owned prefixes and debris patterns", () => {
		expect(SWEEPABLE_DIR_PREFIXES).toContainEqual(".kainbain/tmp/");
		expect(SWEEPABLE_DIR_PREFIXES).toContainEqual(".kainbain/quarantine/");
		expect(SWEEPABLE_BASENAME_PATTERNS.some((re) => re.test(".DS_Store"))).toBe(true);
		expect(SWEEPABLE_BASENAME_PATTERNS.some((re) => re.test("notes.bak"))).toBe(true);
	});
});
