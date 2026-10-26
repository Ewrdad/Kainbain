/* eslint-disable security/detect-non-literal-fs-filename */
// Domain: The Work — unit tests for history diff-stat measurement.
import { describe, it, expect } from "vitest";
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

function runGit(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

function initRangeRepo() {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-range-"));
	runGit(cwd, "init", "-b", "main");
	runGit(cwd, "config", "user.email", "kainbain-test@example.com");
	runGit(cwd, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(cwd, "a.txt"), "one\ntwo\n");
	runGit(cwd, "add", "-A");
	runGit(cwd, "commit", "-m", "base");
	const base = runGit(cwd, "rev-parse", "HEAD").trim();
	fs.appendFileSync(path.join(cwd, "a.txt"), "three\nfour\nfive\n");
	runGit(cwd, "add", "-A");
	runGit(cwd, "commit", "-m", "head");
	const head = runGit(cwd, "rev-parse", "HEAD").trim();
	return { cwd, base, head };
}
import {
	summarizeDiffStat,
	parseNumstatStdout,
	computeStageDelta,
	getTaskDiffStat,
	getCommitRangeDiffStat,
	filesToRangeStat,
} from "./taskDiffStat.js";

describe("The Work: task diff stat", () => {
	describe("summarizeDiffStat", () => {
		it("sums additions and deletions across files", () => {
			expect(
				summarizeDiffStat([
					{ path: "a.js", additions: 10, deletions: 2, binary: false },
					{ path: "b.js", additions: 2, deletions: 1, binary: false },
				]),
			).toEqual({ additions: 12, deletions: 3 });
		});

		it("counts binary rows as zero without dropping countable files", () => {
			expect(
				summarizeDiffStat([
					{ path: "img.png", additions: 0, deletions: 0, binary: true },
					{ path: "a.js", additions: 4, deletions: 1, binary: false },
				]),
			).toEqual({ additions: 4, deletions: 1 });
		});

		it("returns null for an empty diff", () => {
			expect(summarizeDiffStat([])).toBeNull();
			expect(summarizeDiffStat(null)).toBeNull();
			expect(summarizeDiffStat("nope")).toBeNull();
		});

		it("returns null when no file has countable lines", () => {
			expect(
				summarizeDiffStat([
					{ path: "a.png", additions: 0, deletions: 0, binary: true },
				]),
			).toBeNull();
		});

		it("keeps a real zero-line total when a countable file exists", () => {
			expect(
				summarizeDiffStat([
					{ path: "a.js", additions: 0, deletions: 0, binary: false },
				]),
			).toEqual({ additions: 0, deletions: 0 });
		});
	});

	describe("parseNumstatStdout", () => {
		it("parses added/removed counts per file", () => {
			expect(parseNumstatStdout("10\t2\tsrc/a.js\n1\t0\tsrc/b.js\n")).toEqual([
				{
					path: "src/a.js",
					oldPath: null,
					status: "modified",
					additions: 10,
					deletions: 2,
					binary: false,
				},
				{
					path: "src/b.js",
					oldPath: null,
					status: "modified",
					additions: 1,
					deletions: 0,
					binary: false,
				},
			]);
		});

		it("marks binary files and zeroes their counts", () => {
			const rows = parseNumstatStdout("-\t-\tassets/img.png\n");
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				path: "assets/img.png",
				additions: 0,
				deletions: 0,
				binary: true,
			});
		});

		it("skips blank and malformed lines", () => {
			expect(parseNumstatStdout("\nnot-a-numstat-line\n3\t1\tok.js\n")).toEqual([
				{
					path: "ok.js",
					oldPath: null,
					status: "modified",
					additions: 3,
					deletions: 1,
					binary: false,
				},
			]);
			expect(parseNumstatStdout("")).toEqual([]);
		});
	});

	describe("computeStageDelta", () => {
		it("subtracts the entry baseline from the current cumulative total", () => {
			expect(
				computeStageDelta(
					{ additions: 1000, deletions: 7 },
					{ additions: 200, deletions: 2 },
				),
			).toEqual({ additions: 800, deletions: 5 });
		});

		it("reports a zero delta when nothing changed during the stage", () => {
			expect(
				computeStageDelta(
					{ additions: 1000, deletions: 0 },
					{ additions: 1000, deletions: 0 },
				),
			).toEqual({ additions: 0, deletions: 0 });
		});

		it("clamps rewritten history at zero instead of going negative", () => {
			expect(
				computeStageDelta(
					{ additions: 10, deletions: 1 },
					{ additions: 1000, deletions: 50 },
				),
			).toEqual({ additions: 0, deletions: 0 });
		});

		it("resolves null when either side is unknown", () => {
			expect(
				computeStageDelta({ additions: 3, deletions: 1 }, null),
			).toBeNull();
			expect(
				computeStageDelta(null, { additions: 3, deletions: 1 }),
			).toBeNull();
			expect(computeStageDelta(null, null)).toBeNull();
			expect(computeStageDelta(undefined, undefined)).toBeNull();
		});

		it("resolves null for non-integer or negative counts", () => {
			expect(
				computeStageDelta(
					{ additions: "3", deletions: 1 },
					{ additions: 0, deletions: 0 },
				),
			).toBeNull();
			expect(
				computeStageDelta(
					{ additions: 3, deletions: 1 },
					{ additions: -1, deletions: 0 },
				),
			).toBeNull();
			expect(computeStageDelta({}, {})).toBeNull();
		});
	});

	describe("getTaskDiffStat", () => {
		const task = { id: "task-1", branch: "kb/task-1" };

		it("diffs the task branch against the default branch in branch mode", async () => {
			const seen = {};
			const stat = await getTaskDiffStat("/repo", task, {
				useBranches: true,
				defaultBranchFn: async (cwd) => {
					seen.cwd = cwd;
					return "main";
				},
				diffFilesFn: async (cwd, base, head) => {
					seen.diff = [cwd, base, head];
					return [{ path: "a.js", additions: 7, deletions: 2, binary: false }];
				},
			});
			expect(stat).toEqual({ additions: 7, deletions: 2 });
			expect(seen.cwd).toBe("/repo");
			expect(seen.diff).toEqual(["/repo", "main", "kb/task-1"]);
		});

		it("derives kb/<id> when the task has no stored branch", async () => {
			let head = null;
			const stat = await getTaskDiffStat("/repo", { id: "abc" }, {
				useBranches: true,
				defaultBranchFn: async () => "main",
				diffFilesFn: async (cwd, base, h) => {
					head = h;
					return [{ path: "a.js", additions: 1, deletions: 0, binary: false }];
				},
			});
			expect(head).toBe("kb/abc");
			expect(stat).toEqual({ additions: 1, deletions: 0 });
		});

		it("falls back to the working tree outside branch mode", async () => {
			let calledWith = null;
			const stat = await getTaskDiffStat("/repo", task, {
				useBranches: false,
				workingTreeDiffFn: async (cwd) => {
					calledWith = cwd;
					return [{ path: "a.js", additions: 3, deletions: 3, binary: false }];
				},
				diffFilesFn: async () => {
					throw new Error("must not shell out to branch diff");
				},
			});
			expect(calledWith).toBe("/repo");
			expect(stat).toEqual({ additions: 3, deletions: 3 });
		});

		it("resolves null — never throws — on every failure shape", async () => {
			const throwing = async () => {
				throw new Error("git exploded");
			};
			await expect(
				getTaskDiffStat("/repo", task, {
					useBranches: true,
					defaultBranchFn: throwing,
					diffFilesFn: throwing,
				}),
			).resolves.toBeNull();
			await expect(
				getTaskDiffStat("/repo", task, {
					useBranches: true,
					defaultBranchFn: async () => "main",
					diffFilesFn: throwing,
				}),
			).resolves.toBeNull();
			await expect(
				getTaskDiffStat("/repo", task, {
					workingTreeDiffFn: throwing,
				}),
			).resolves.toBeNull();
			await expect(getTaskDiffStat(null, task, {})).resolves.toBeNull();
			await expect(getTaskDiffStat("/repo", null, {})).resolves.toBeNull();
		});

		it("resolves null when the diff has nothing countable", async () => {
			await expect(
				getTaskDiffStat("/repo", task, {
					workingTreeDiffFn: async () => [],
				}),
			).resolves.toBeNull();
		});
	});

	describe("filesToRangeStat", () => {
		it("totals per-file rows for a measured range", () => {
			expect(
				filesToRangeStat([
					{ path: "a.js", additions: 10, deletions: 2, binary: false },
					{ path: "b.js", additions: 0, deletions: 5, binary: false },
				]),
			).toEqual({ additions: 10, deletions: 7 });
		});

		it("reports a measured empty range as an honest +0 -0", () => {
			expect(filesToRangeStat([])).toEqual({ additions: 0, deletions: 0 });
		});

		it("resolves null when the range has nothing countable", () => {
			expect(
				filesToRangeStat([
					{ path: "img.png", additions: 0, deletions: 0, binary: true },
				]),
			).toBeNull();
			expect(filesToRangeStat(null)).toBeNull();
			expect(filesToRangeStat("nope")).toBeNull();
		});
	});

	describe("getCommitRangeDiffStat", () => {
		it("rejects blank inputs without touching git", async () => {
			const mustNotRun = async () => {
				throw new Error("must not shell out");
			};
			await expect(
				getCommitRangeDiffStat("", "abc", "def", { gitFn: mustNotRun }),
			).resolves.toBeNull();
			await expect(
				getCommitRangeDiffStat("/repo", "  ", "def", { gitFn: mustNotRun }),
			).resolves.toBeNull();
			await expect(
				getCommitRangeDiffStat("/repo", "abc", null, { gitFn: mustNotRun }),
			).resolves.toBeNull();
		});

		it("measures one stage's range from injected per-file rows", async () => {
			const seen = {};
			const stat = await getCommitRangeDiffStat("/repo", "base", "head", {
				rangeFilesFn: async (cwd, from, to) => {
					seen.args = [cwd, from, to];
					return [
						{ path: "a.js", additions: 4, deletions: 1, binary: false },
					];
				},
			});
			expect(stat).toEqual({ additions: 4, deletions: 1 });
			expect(seen.args).toEqual(["/repo", "base", "head"]);
		});

		it("reports an empty range as +0 -0 via rows and via git", async () => {
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", {
					rangeFilesFn: async () => [],
				}),
			).resolves.toEqual({ additions: 0, deletions: 0 });
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", {
					gitFn: async () => ({ stdout: "\n" }),
				}),
			).resolves.toEqual({ additions: 0, deletions: 0 });
		});

		it("passes the two-dot range to the git runner and parses numstat", async () => {
			const seen = {};
			const stat = await getCommitRangeDiffStat("/repo", "base", "head", {
				gitFn: async (cwd, from, to, opts) => {
					seen.args = [cwd, from, to, opts];
					return { stdout: "10\t2\ta.js\n1\t0\tb.js\n" };
				},
			});
			expect(stat).toEqual({ additions: 11, deletions: 2 });
			expect(seen.args[0]).toBe("/repo");
			expect(seen.args[1]).toBe("base");
			expect(seen.args[2]).toBe("head");
			expect(seen.args[3]).toMatchObject({ timeout: expect.any(Number) });
		});

		it("resolves null — never throws — on every failure shape", async () => {
			const throwing = async () => {
				throw new Error("git exploded");
			};
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", {
					rangeFilesFn: throwing,
				}),
			).resolves.toBeNull();
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", { gitFn: throwing }),
			).resolves.toBeNull();
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", {
					rangeFilesFn: async () => null,
				}),
			).resolves.toBeNull();
			await expect(
				getCommitRangeDiffStat("/repo", "base", "head", {
					gitFn: async () => ({ stdout: "-\t-\timg.png\n" }),
				}),
			).resolves.toBeNull();
		});

		// Independent oracle: real commits in a throwaway repo prove the
		// two-dot range owns exactly its own commits — never the repo, only
		// this temp dir.
		it.runIf(gitAvailable)(
			"measures exactly one stage's commits against real git",
			async () => {
				const { cwd, base, head } = initRangeRepo();
				try {
					await expect(
						getCommitRangeDiffStat(cwd, base, head),
					).resolves.toEqual({ additions: 3, deletions: 0 });
					// An unchanged stage (empty range) is an honest +0 -0.
					await expect(
						getCommitRangeDiffStat(cwd, head, head),
					).resolves.toEqual({ additions: 0, deletions: 0 });
					// Unknown refs are "no badge", never a zero badge.
					await expect(
						getCommitRangeDiffStat(cwd, "0".repeat(40), head),
					).resolves.toBeNull();
				} finally {
					fs.rmSync(cwd, { recursive: true, force: true });
				}
			},
		);
	});
});
