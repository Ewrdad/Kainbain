import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as gitBarrel from "./git.js";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

// Import after mocking.
const {
	GitError,
	GitMergeConflictError,
	GitDirtyTreeError,
	GitBranchMismatchError,
	git,
	currentBranch,
	branchExists,
	isMergeInProgress,
	hasCommits,
	isGitRepository,
	getWorkingTreeStatus,
	isWorkingTreeClean,
	requireCleanWorkingTree,
	checkoutBranch,
	createBranch,
	ensureBranchCheckedOut,
	commitAllIfNeeded,
	mergeBranch,
	abortMerge,
	countUniqueCommits,
	isBranchMergedInto,
	defaultBranch,
	deleteBranch,
	isValidBranchName,
	hasRemote,
	pushBranchIfRemote,
	returnToDefaultBranch,
	redactCredentials,
	ensureGitIdentity,
	DEFAULT_GIT_AUTHOR_NAME,
	DEFAULT_GIT_AUTHOR_EMAIL,
} = await import("./git.js");

/***
 * MARK: Git helper unit tests
 * @description Verifies the safety-first git wrapper: argv-array spawning (no
 * shell strings), typed errors, idempotent branch ops, dirty-tree refusal,
 * merge-conflict detection with automatic abort, and default-branch fallbacks.
 * child_process.spawn is mocked — no real git is ever invoked.
 ***/

/**
 * Builds a fake spawn result whose child emits the given data and exit code.
 */
function makeChild({ stdout = "", stderr = "", code = 0, error = null } = {}) {
	const listeners = {};
	return {
		pid: 4242,
		stdout: { on: (ev, fn) => listeners["stdout:" + ev] && listeners["stdout:" + ev](fn) },
		stderr: { on: (ev, fn) => listeners["stderr:" + ev](fn) },
		on: (ev, fn) => {
			if (ev === "close") {
				setImmediate(() => {
					if (error) fn(null, null);
					else fn(code, null);
				});
			} else if (ev === "error") {
				if (error) setImmediate(() => fn(error));
			}
			listeners[ev] = fn;
		},
	};
}

// Simpler helper: configure spawnMock to immediately wire data/close events.
function mockGitResponse({ stdout = "", stderr = "", code = 0, error = null } = {}) {
	spawnMock.mockImplementation((cmd, args, opts) => {
		const child = {
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
		return child;
	});
	return spawnMock;
}

describe("git helper", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	describe("isValidBranchName", () => {
		it("accepts safe names and rejects flag-injection / traversal shapes", () => {
			expect(isValidBranchName("kb/123e4567-e89b-12d3-a456-426614174000")).toBe(true);
			expect(isValidBranchName("main")).toBe(true);
			expect(isValidBranchName("feature/x_y-w.z")).toBe(true);
			expect(isValidBranchName("--force")).toBe(false);
			expect(isValidBranchName("-rf")).toBe(false);
			expect(isValidBranchName("../evil")).toBe(false);
			expect(isValidBranchName("a..b")).toBe(false);
			expect(isValidBranchName("a//b")).toBe(false);
			expect(isValidBranchName(".hidden")).toBe(false);
			expect(isValidBranchName("name.lock")).toBe(false);
			expect(isValidBranchName("ends.")).toBe(false);
			expect(isValidBranchName("")).toBe(false);
			expect(isValidBranchName(null)).toBe(false);
			expect(isValidBranchName("has space")).toBe(false);
			expect(isValidBranchName("tilde~")).toBe(false);
			expect(isValidBranchName("caret^")).toBe(false);
			expect(isValidBranchName("colon:x")).toBe(false);
			expect(isValidBranchName("star*")).toBe(false);
		});
	});

	describe("git()", () => {
		it("spawns git with an argv array (never a shell string)", async () => {
			mockGitResponse({ stdout: "ok" });
			await git("/repo", ["status", "--porcelain"]);
			expect(spawnMock).toHaveBeenCalledWith(
				"git",
				["status", "--porcelain"],
				expect.objectContaining({ cwd: "/repo" }),
			);
		});

		it("resolves stdout/stderr on exit 0", async () => {
			mockGitResponse({ stdout: "refs/heads/main", stderr: "" });
			const res = await git("/repo", ["rev-parse", "HEAD"]);
			expect(res.stdout).toBe("refs/heads/main");
			expect(res.code).toBe(0);
		});

		it("rejects with a GitError carrying code/args/stdout/stderr on non-zero exit", async () => {
			mockGitResponse({ stdout: "", stderr: "fatal: bad thing", code: 128 });
			await expect(git("/repo", ["merge", "nope"])).rejects.toMatchObject({
				name: "GitError",
				code: 128,
				message: expect.stringContaining("bad thing"),
			});
		});

		it("rejects non-string args (no shell interpolation ever)", async () => {
			await expect(git("/repo", ["status", 42])).rejects.toBeInstanceOf(GitError);
		});

		it("rejects when the binary cannot be spawned", async () => {
			mockGitResponse({ error: new Error("spawn git ENOENT") });
			await expect(git("/repo", ["status"])).rejects.toMatchObject({
				message: expect.stringContaining("Failed to start git"),
			});
		});

		describe("stale-lock holder-scan override (listLiveGitProcesses)", () => {
			/* eslint-disable security/detect-non-literal-fs-filename -- throwaway os.tmpdir() dirs only; spawn is mocked so no real git ever runs */
			const LOCK_STDERR =
				"fatal: Unable to create '/repo/.git/index.lock': File exists.";

			function fakeChild({ stdout = "", stderr = "", code = 0 } = {}) {
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
						if (ev === "close") setImmediate(() => fn(code, null));
					},
					kill: vi.fn(),
				};
			}

			function plantAgedLock(cwd) {
				fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
				const lockPath = path.join(cwd, ".git", "index.lock");
				fs.writeFileSync(lockPath, "");
				const old = new Date(Date.now() - 120_000);
				fs.utimesSync(lockPath, old, old);
				return lockPath;
			}

			it("recovers a provably stale lock and retries when the scan reports no holders", async () => {
				const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-seam-"));
				try {
					const lockPath = plantAgedLock(cwd);
					let calls = 0;
					spawnMock.mockImplementation(() => {
						calls += 1;
						return calls === 1
							? fakeChild({ code: 128, stderr: LOCK_STDERR })
							: fakeChild({ stdout: "other" });
					});
					const res = await git(cwd, ["checkout", "other"], {
						listLiveGitProcesses: async () => ({
							holders: [],
							inconclusive: false,
						}),
					});
					expect(res.stdout).toBe("other");
					expect(fs.existsSync(lockPath)).toBe(false);
				} finally {
					fs.rmSync(cwd, { recursive: true, force: true });
				}
			});

			it("leaves the lock alone and names the holder when the scan reports one", async () => {
				const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-seam-"));
				try {
					const lockPath = plantAgedLock(cwd);
					spawnMock.mockImplementation(() =>
						fakeChild({ code: 128, stderr: LOCK_STDERR }),
					);
					await expect(
						git(cwd, ["checkout", "other"], {
							listLiveGitProcesses: async () => ({
								holders: [{ pid: 424242, command: "git checkout" }],
								inconclusive: false,
							}),
						}),
					).rejects.toMatchObject({
						message: expect.stringContaining("live git process"),
					});
					expect(fs.existsSync(lockPath)).toBe(true);
				} finally {
					fs.rmSync(cwd, { recursive: true, force: true });
				}
			});
			/* eslint-enable security/detect-non-literal-fs-filename */
		});
	});

	describe("inspectors", () => {
		it("currentBranch returns the trimmed branch", async () => {
			mockGitResponse({ stdout: "main" });
			expect(await currentBranch("/repo")).toBe("main");
		});

		it("branchExists is true on exit 0 and false on failure", async () => {
			mockGitResponse({ stdout: "abc123" });
			expect(await branchExists("/repo", "kb/task-1")).toBe(true);
			mockGitResponse({ code: 1, stderr: "fatal: Needed a single revision" });
			expect(await branchExists("/repo", "kb/task-1")).toBe(false);
		});

		it("branchExists returns false for invalid names without spawning", async () => {
			expect(await branchExists("/repo", "--danger")).toBe(false);
			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("countUniqueCommits parses rev-list counts and fails closed", async () => {
			mockGitResponse({ stdout: "3\n" });
			expect(await countUniqueCommits("/repo", "main", "kb/task-1")).toBe(3);
			expect(spawnMock).toHaveBeenCalledWith(
				"git",
				["rev-list", "--count", "main..kb/task-1"],
				expect.objectContaining({ cwd: "/repo" }),
			);

			mockGitResponse({ stdout: "0" });
			expect(await countUniqueCommits("/repo", "main", "kb/task-1")).toBe(0);

			await expect(countUniqueCommits("/repo", "main", "--danger")).rejects.toBeInstanceOf(
				Error,
			);
			expect(spawnMock).not.toHaveBeenCalledWith(
				"git",
				expect.arrayContaining([expect.stringContaining("--danger")]),
				expect.anything(),
			);
		});

		it("isBranchMergedInto reads merge-base ancestry honestly and fails closed", async () => {
			mockGitResponse({ stdout: "" });
			expect(await isBranchMergedInto("/repo", "main", "kb/task-1")).toBe(true);
			expect(spawnMock).toHaveBeenCalledWith(
				"git",
				["merge-base", "--is-ancestor", "kb/task-1", "main"],
				expect.objectContaining({ cwd: "/repo" }),
			);

			// Exit 1 = not an ancestor (the normal unmerged case).
			mockGitResponse({ code: 1, stderr: "" });
			expect(await isBranchMergedInto("/repo", "main", "kb/task-1")).toBe(false);

			// Any other git failure (bad repo, bad ref) rethrows, never false.
			mockGitResponse({ code: 128, stderr: "fatal: not a git repository" });
			await expect(isBranchMergedInto("/repo", "main", "kb/task-1")).rejects.toBeInstanceOf(
				Error,
			);

			await expect(isBranchMergedInto("/repo", "main", "--danger")).rejects.toBeInstanceOf(
				Error,
			);
			expect(spawnMock).not.toHaveBeenCalledWith(
				"git",
				expect.arrayContaining([expect.stringContaining("--danger")]),
				expect.anything(),
			);
		});

		it("hasCommits / isGitRepository / isMergeInProgress map exit codes honestly", async () => {
			mockGitResponse({ stdout: "abc" });
			expect(await hasCommits("/repo")).toBe(true);
			mockGitResponse({ code: 1, stderr: "fatal: bad revision" });
			expect(await hasCommits("/repo")).toBe(false);

			mockGitResponse({ stdout: "" });
			expect(await isGitRepository("/repo")).toBe(true);
			mockGitResponse({ code: 128, stderr: "fatal: not a git repository" });
			expect(await isGitRepository("/repo")).toBe(false);

			mockGitResponse({ stdout: "abc" });
			expect(await isMergeInProgress("/repo")).toBe(true);
			mockGitResponse({ code: 1, stderr: "fatal" });
			expect(await isMergeInProgress("/repo")).toBe(false);
		});
	});

	describe("working tree cleanliness", () => {
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

		it("requireCleanWorkingTree throws GitDirtyTreeError listing paths", async () => {
			mockGitResponse({ stdout: " M src/one.js\n M src/two.js\n" });
			await expect(requireCleanWorkingTree("/repo", { context: "checkout" })).rejects.toThrow(
				GitDirtyTreeError,
			);
			await expect(requireCleanWorkingTree("/repo")).rejects.toMatchObject({
				dirtyPaths: expect.arrayContaining(["src/one.js", "src/two.js"]),
			});
		});
	});

	describe("checkoutBranch", () => {
		it("is a no-op when already on the requested branch (no spawn beyond rev-parse)", async () => {
			const responses = [
				{ stdout: "kb/task-1" }, // rev-parse --abbrev-ref HEAD
			];
			let call = 0;
			spawnMock.mockImplementation((cmd, args) => {
				const r = responses[Math.min(call++, responses.length - 1)];
				return fakeChildFromResponse(r);
			});
			const res = await checkoutBranch("/repo", "kb/task-1");
			expect(res).toEqual({ switched: false });
			expect(spawnMock).toHaveBeenCalledTimes(1);
		});

		it("refuses to switch on a dirty tree", async () => {
			const responses = [
				{ stdout: "main" }, // current branch
				{ stdout: " M dirty.js\n" }, // status --porcelain
			];
			let call = 0;
			spawnMock.mockImplementation(() => {
				return fakeChildFromResponse(responses[Math.min(call++, responses.length - 1)]);
			});
			await expect(checkoutBranch("/repo", "kb/task-1")).rejects.toBeInstanceOf(
				GitDirtyTreeError,
			);
			// Never spawned the checkout.
			expect(
				spawnMock.mock.calls.some(([, args]) => args[0] === "checkout"),
			).toBe(false);
		});

		it("checks out when the tree is clean", async () => {
			const responses = [
				{ stdout: "main" },
				{ stdout: "" },
				{ stdout: "Switched to branch 'kb/task-1'" },
			];
			let call = 0;
			spawnMock.mockImplementation(() => {
				return fakeChildFromResponse(responses[Math.min(call++, responses.length - 1)]);
			});
			const res = await checkoutBranch("/repo", "kb/task-1");
			expect(res).toEqual({ switched: true });
			expect(spawnMock.mock.calls.at(-1)[1]).toEqual(["checkout", "kb/task-1"]);
		});
	});

	describe("createBranch", () => {
		it("is idempotent: does nothing when the branch already exists", async () => {
			let call = 0;
			spawnMock.mockImplementation(() => {
				call++;
				return fakeChildFromResponse({ stdout: "abc123" });
			});
			const res = await createBranch("/repo", "kb/task-1");
			expect(res).toEqual({ created: false });
			expect(call).toBe(1); // only the exists check
		});

		it("creates the branch when missing", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				// First call: rev-parse fails (branch missing); second: git branch ok.
				if (calls.length === 1) return fakeChildFromResponse({ code: 1, stderr: "" });
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await createBranch("/repo", "kb/task-1");
			expect(res).toEqual({ created: true });
			expect(calls[1]).toEqual(["branch", "kb/task-1"]);
		});

		it("treats a concurrent create race as created:false instead of failing", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (calls.length <= 2) {
					// exists check (missing) then failed `git branch` (lost race)
					return fakeChildFromResponse({ code: 1, stderr: "already exists" });
				}
				// Re-check now reports it exists.
				return fakeChildFromResponse({ stdout: "abc123" });
			});
			const res = await createBranch("/repo", "kb/task-1");
			expect(res).toEqual({ created: false });
		});

		it("passes a validated start-point through to git branch", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (calls.length === 1) return fakeChildFromResponse({ code: 1, stderr: "" });
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await createBranch("/repo", "kb/task-1", { startPoint: "main" });
			expect(res).toEqual({ created: true });
			expect(calls[1]).toEqual(["branch", "kb/task-1", "main"]);
		});

		it("accepts HEAD and SHAs as start-points", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "rev-parse") {
					return fakeChildFromResponse({ code: 1, stderr: "" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			await expect(
				createBranch("/repo", "kb/task-1", { startPoint: "HEAD" }),
			).resolves.toEqual({ created: true });
			await expect(
				createBranch("/repo", "kb/task-2", {
					startPoint: "a".repeat(40),
				}),
			).resolves.toEqual({ created: true });
		});

		it("rejects invalid start-points without spawning git branch", async () => {
			spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
			for (const startPoint of ["--force", "main~1", "main^", "", "-b"]) {
				await expect(
					createBranch("/repo", "kb/task-1", { startPoint }),
				).rejects.toBeInstanceOf(GitError);
			}
			expect(
				spawnMock.mock.calls.some(([, args]) => args[0] === "branch"),
			).toBe(false);
		});

		it("still no-ops on existing branches when a start-point is given", async () => {
			spawnMock.mockImplementation(() =>
				fakeChildFromResponse({ stdout: "abc123" }),
			);
			const res = await createBranch("/repo", "kb/task-1", {
				startPoint: "main",
			});
			expect(res).toEqual({ created: false });
			expect(
				spawnMock.mock.calls.some(([, args]) => args[0] === "branch"),
			).toBe(false);
		});
	});

	describe("ensureBranchCheckedOut", () => {
		it("fails clearly when the directory is not a git repo", async () => {
			spawnMock.mockImplementation(() =>
				fakeChildFromResponse({ code: 128, stderr: "fatal: not a git repository" }),
			);
			await expect(ensureBranchCheckedOut("/not-repo", "kb/x")).rejects.toMatchObject({
				message: expect.stringContaining("not a git repository"),
			});
		});

		it("is a no-op when already on the branch (dirty tree allowed — agents work there)", async () => {
			spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "kb/task-1" }));
			const res = await ensureBranchCheckedOut("/repo", "kb/task-1");
			expect(res).toEqual({ created: false, checkedOut: true, switched: false });
			// Only the repo check + current-branch rev-parse ran; no status, no checkout.
			expect(spawnMock).toHaveBeenCalledTimes(2);
			expect(spawnMock.mock.calls.some(([, args]) => args[0] === "checkout")).toBe(false);
			expect(spawnMock.mock.calls.some(([, args]) => args[0] === "status")).toBe(false);
		});

		it("checks out an existing branch after a clean-tree guard", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (calls[0][0] === "rev-parse" && calls[0].includes("--abbrev-ref")) {
					return fakeChildFromResponse({ stdout: "main" });
				}
				if (calls[0][0] === "rev-parse" && args.includes("--inside-work-tree")) {
					return fakeChildFromResponse({ stdout: "" });
				}
				// Order driven by function logic: repo check, current, exists, status, HEAD, checkout.
				if (args[0] === "rev-parse" && args.includes("--verify") && String(args[1] || "").startsWith("refs/heads/")) {
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "checkout") return fakeChildFromResponse({ stdout: "" });
				return fakeChildFromResponse({ stderr: "" });
			});
			const res = await ensureBranchCheckedOut("/repo", "kb/task-1");
			expect(res.created).toBe(false);
			expect(res.switched).toBe(true);
			expect(calls.some((a) => a[0] === "checkout" && a[1] === "kb/task-1")).toBe(true);
		});

		it("blocks a dirty tree before checking out an existing branch", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (args.includes("--inside-work-tree")) {
					return fakeChildFromResponse({ stdout: "" });
				}
				if (args.includes("--abbrev-ref")) {
					return fakeChildFromResponse({ stdout: "main" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: " M x.js\n" });
				return fakeChildFromResponse({ stdout: "" });
			});
			await expect(ensureBranchCheckedOut("/repo", "kb/task-1")).rejects.toBeInstanceOf(
				GitDirtyTreeError,
			);
		});

		it("threads a custom state folder into the clean-tree guard", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (args.includes("--inside-work-tree")) return fakeChildFromResponse({ stdout: "" });
				if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main" });
				if (args[0] === "rev-parse" && args.includes("--verify")) {
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: "?? .kb/project.json\n" });
				}
				if (args[0] === "checkout") return fakeChildFromResponse({ stdout: "" });
				return fakeChildFromResponse({ stdout: "abc" });
			});
			const res = await ensureBranchCheckedOut("/repo", "kb/task-1", {
				project: { kainbainDirName: ".kb" },
			});
			expect(res.switched).toBe(true);
			expect(calls.some((a) => a[0] === "checkout" && a[1] === "kb/task-1")).toBe(true);
		});

		it("still blocks on an undeclared custom state folder (control)", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args.includes("--inside-work-tree")) return fakeChildFromResponse({ stdout: "" });
				if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main" });
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: "?? .kb/project.json\n" });
				}
				return fakeChildFromResponse({ stdout: "abc" });
			});
			await expect(
				ensureBranchCheckedOut("/repo", "kb/task-1"),
			).rejects.toBeInstanceOf(GitDirtyTreeError);
		});

		it("creates the missing branch pinned to the base branch on a clean tree", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (args[0] === "rev-parse") {
					// --inside-work-tree ok; --abbrev-ref = 'main'; refs/heads/kb/x missing;
					// refs/heads/main exists; HEAD ok.
					if (args.includes("--inside-work-tree")) return fakeChildFromResponse({ stdout: "" });
					if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main" });
					if (args.includes("refs/heads/kb/task-1")) {
						return fakeChildFromResponse({ code: 1, stderr: "fatal" });
					}
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "checkout" || args[0] === "branch") {
					return fakeChildFromResponse({ stdout: "" });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			const res = await ensureBranchCheckedOut("/repo", "kb/task-1", { baseBranch: "main" });
			expect(res.created).toBe(true);
			expect(res.switched).toBe(true);
			// Pinned to the base via an explicit start point — never a bare
			// `checkout -b` that would follow whatever HEAD happens to be.
			expect(calls.some((a) => a[0] === "branch" && a[1] === "kb/task-1" && a[2] === "main")).toBe(true);
			expect(calls.some((a) => a[0] === "checkout" && a[1] === "-b")).toBe(false);
		});

		it("never silently bases on the current HEAD when the base checkout fails (C4)", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				if (args[0] === "rev-parse") {
					if (args.includes("--inside-work-tree")) return fakeChildFromResponse({ stdout: "" });
					// Sitting on another task's branch: the dangerous HEAD.
					if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "kb/other-task" });
					if (args.includes("refs/heads/kb/task-1")) {
						return fakeChildFromResponse({ code: 1, stderr: "fatal" });
					}
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				// The base checkout fails (lock, corrupt ref) …
				if (args[0] === "checkout" && args[1] === "main") {
					return fakeChildFromResponse({ code: 128, stderr: "fatal: unable to checkout" });
				}
				if (args[0] === "branch" || args[0] === "checkout") {
					return fakeChildFromResponse({ stdout: "" });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			const res = await ensureBranchCheckedOut("/repo", "kb/task-1", { baseBranch: "main" });
			expect(res.created).toBe(true);
			expect(res.switched).toBe(true);
			// … so the start point is pinned explicitly to the base: no bare
			// `checkout -b` from kb/other-task's HEAD anywhere.
			expect(calls.some((a) => a[0] === "branch" && a[1] === "kb/task-1" && a[2] === "main")).toBe(true);
			expect(calls.some((a) => a[0] === "checkout" && a[1] === "-b")).toBe(false);
		});

		it("fails loudly when neither the base checkout nor pinning works (C4)", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "rev-parse") {
					if (args.includes("--inside-work-tree")) return fakeChildFromResponse({ stdout: "" });
					if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "kb/other-task" });
					if (args.includes("refs/heads/kb/task-1")) {
						return fakeChildFromResponse({ code: 1, stderr: "fatal" });
					}
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				return fakeChildFromResponse({ code: 128, stderr: "fatal: locked" });
			});
			await expect(
				ensureBranchCheckedOut("/repo", "kb/task-1", { baseBranch: "main" }),
			).rejects.toMatchObject({
				message: expect.stringContaining("main"),
			});
		});
	});

	describe("commitAllIfNeeded", () => {
		it("does nothing on a clean tree", async () => {
			let sawAdd = false;
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "add") sawAdd = true;
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await commitAllIfNeeded("/repo", "msg");
			expect(res.committed).toBe(false);
			expect(sawAdd).toBe(false);
		});

		it("adds and commits when there are changes", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push(args);
				// rev-parse calls: inside-work-tree ok, HEAD ok; status dirty; add; commit; rev-parse --short
				if (args[0] === "status") return fakeChildFromResponse({ stdout: " M file.js\n" });
				if (args[0] === "add") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "commit") return fakeChildFromResponse({ stdout: "[main abc] msg" });
				return fakeChildFromResponse({ stdout: "abc1234" });
			});
			const res = await commitAllIfNeeded("/repo", "KainBain: task work");
			expect(res.committed).toBe(true);
			expect(res.hash).toBe("abc1234");
			expect(calls.some((a) => a[0] === "add" && a[1] === "-A")).toBe(true);
			expect(calls.some((a) => a[0] === "commit")).toBe(true);
		});

		it("treats a failed commit with nothing left to commit as clean (ignored files only)", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "commit") {
					return fakeChildFromResponse({ code: 1, stderr: "nothing to commit" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			// After add -A the index is empty: post-commit status is clean → not fatal.
			const res = await commitAllIfNeeded("/repo", "msg");
			expect(res.committed).toBe(false);
		});

		it("refuses to commit when the checkout is on a different branch than expected", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
					return fakeChildFromResponse({ stdout: "kb/other-task\n" });
				}
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: " M file.js\n" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			await expect(
				commitAllIfNeeded("/repo", "msg", { expectedBranch: "kb/mine" }),
			).rejects.toMatchObject({
				name: "GitBranchMismatchError",
				expectedBranch: "kb/mine",
				actualBranch: "kb/other-task",
			});
			// The alien files must never be staged or committed.
			expect(calls.some((a) => a[0] === "add")).toBe(false);
			expect(calls.some((a) => a[0] === "commit")).toBe(false);
		});

		it("commits when the checkout is on the expected branch", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
					return fakeChildFromResponse({ stdout: "kb/mine\n" });
				}
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: " M file.js\n" });
				}
				if (args[0] === "add") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "commit") {
					return fakeChildFromResponse({ stdout: "[kb/mine abc] msg" });
				}
				return fakeChildFromResponse({ stdout: "abc1234" });
			});
			const res = await commitAllIfNeeded("/repo", "msg", {
				expectedBranch: "kb/mine",
			});
			expect(res.committed).toBe(true);
			expect(res.hash).toBe("abc1234");
			expect(calls.some((a) => a[0] === "add" && a[1] === "-A")).toBe(true);
		});

		it("fails closed when the branch cannot be read while expectedBranch is set", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
					return fakeChildFromResponse({ code: 128, stderr: "fatal: bad HEAD" });
				}
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: " M file.js\n" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			await expect(
				commitAllIfNeeded("/repo", "msg", { expectedBranch: "kb/mine" }),
			).rejects.toBeInstanceOf(GitBranchMismatchError);
			expect(calls.some((a) => a[0] === "commit")).toBe(false);
		});

		it("stays permissive when no expectedBranch is provided", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: " M file.js\n" });
				}
				if (args[0] === "add") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "commit") return fakeChildFromResponse({ stdout: "ok" });
				return fakeChildFromResponse({ stdout: "abc1234" });
			});
			const res = await commitAllIfNeeded("/repo", "msg");
			expect(res.committed).toBe(true);
			// No branch probe is made without the opt-in guard.
			expect(
				calls.some((a) => a[0] === "rev-parse" && a[1] === "--abbrev-ref"),
			).toBe(false);
		});
	});

	describe("mergeBranch", () => {
		it("resolves on a clean merge", async () => {
			let aborted = false;
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "merge" && args[1] === "--no-edit") {
					return fakeChildFromResponse({ stdout: "Merge made by the 'ort' strategy." });
				}
				if (args[0] === "merge" && args[1] === "--abort") aborted = true;
				return fakeChildFromResponse({ code: 1, stderr: "fatal" }); // MERGE_HEAD check
			});
			const res = await mergeBranch("/repo", "kb/task-1");
			expect(res.stdout).toContain("Merge made");
			expect(aborted).toBe(false);
		});

		it("throws GitMergeConflictError with the canonical message and aborts the merge", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				const joined = args.join(" ");
				if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
					// In merge state after conflict.
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args[0] === "merge" && args[1] === "--no-edit") {
					return fakeChildFromResponse({
						stdout:
							"Auto-merging file.js\nCONFLICT (content): Merge conflict in file.js\nAutomatic merge failed; fix conflicts and then commit the result.",
						code: 1,
					});
				}
				if (args[0] === "diff") {
					return fakeChildFromResponse({ stdout: "file.js\nother.js" });
				}
				if (args[0] === "merge" && args[1] === "--abort") {
					return fakeChildFromResponse({ stdout: "" });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			await expect(mergeBranch("/repo", "kb/task-1")).rejects.toMatchObject({
				name: "GitMergeConflictError",
				message: "Merge conflict: please resolve all merge conflicts with main",
				conflictedFiles: ["file.js", "other.js"],
			});
			expect(calls.some((a) => a[0] === "merge" && a[1] === "--abort")).toBe(true);
		});

		it("non-conflict merge failures surface as plain GitError (e.g. unknown branch)", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				const joined = args.join(" ");
				if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
					return fakeChildFromResponse({ code: 1, stderr: "fatal" }); // not in merge state
				}
				if (args[0] === "merge") {
					return fakeChildFromResponse({ code: 1, stderr: "merge: kb/nope - not something we can merge" });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			let caught = null;
			try {
				await mergeBranch("/repo", "kb/nope");
			} catch (e) {
				caught = e;
			}
			expect(caught).toBeInstanceOf(GitError);
			expect(caught).not.toBeInstanceOf(GitMergeConflictError);
			expect(caught.message).toContain("not something we can merge");
		});

		it("refuses to start a merge while another is in progress (auto-recovers by aborting first)", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				const joined = args.join(" ");
				if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
					// First check: in-progress → triggers abort; re-check → clean.
					return fakeChildFromResponse(calls.length <= 2 ? { stdout: "abc" } : { code: 1, stderr: "fatal" });
				}
				if (args[0] === "merge" && args[1] === "--abort") {
					return fakeChildFromResponse({ stdout: "" });
				}
				if (args[0] === "merge" && args[1] === "--no-edit") {
					return fakeChildFromResponse({ stdout: "Already up to date." });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			const res = await mergeBranch("/repo", "kb/task-1");
			expect(res.stdout).toContain("Already up to date");
			expect(calls.some((a) => a[0] === "merge" && a[1] === "--abort")).toBe(true);
		});
	});

	describe("abortMerge", () => {
		it("is idempotent when no merge is in progress", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "merge" && args[1] === "--abort") {
					return fakeChildFromResponse({ code: 1, stderr: "fatal: There is no merge to abort (MERGE_HEAD missing)." });
				}
				// Any other call (rev-parse --verify MERGE_HEAD) says: absent.
				return fakeChildFromResponse({ code: 1, stderr: "fatal: Needed a single revision" });
			});
			await expect(abortMerge("/repo")).resolves.toBeUndefined();
			expect(spawnMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("defaultBranch", () => {
		it("prefers remote origin/HEAD", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args.includes("refs/remotes/origin/HEAD")) {
					return fakeChildFromResponse({ stdout: "refs/remotes/origin/master" });
				}
				return fakeChildFromResponse({ stderr: "" });
			});
			expect(await defaultBranch("/repo")).toBe("master");
		});

		it("falls back to local main, then master, then the current branch", async () => {
			// No origin HEAD; local main missing; master exists.
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args.includes("refs/remotes/origin/HEAD")) {
					return fakeChildFromResponse({ code: 128, stderr: "fatal: not a valid ref" });
				}
				if (args.includes("refs/heads/main")) {
					return fakeChildFromResponse({ code: 128, stderr: "fatal" });
				}
				if (args.includes("refs/heads/master")) {
					return fakeChildFromResponse({ stdout: "abc" });
				}
				return fakeChildFromResponse({ stdout: "abc" });
			});
			expect(await defaultBranch("/repo")).toBe("master");
			expect(calls.length).toBeGreaterThan(0);
		});

		it("falls back to the current branch name when no known default exists", async () => {
			let originTried = false;
			spawnMock.mockImplementation((cmd, args) => {
				if (args.includes("refs/remotes/origin/HEAD")) {
					return fakeChildFromResponse({ code: 128, stderr: "fatal" });
				}
				if (args.includes("--abbrev-ref")) {
					return fakeChildFromResponse({ stdout: "develop" });
				}
				return fakeChildFromResponse({ code: 128, stderr: "fatal" });
			});
			expect(await defaultBranch("/repo")).toBe("develop");
		});
	});

	describe("deleteBranch", () => {
		it("deletes an existing branch with -D", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "rev-parse") return fakeChildFromResponse({ stdout: "abc" });
				if (args[0] === "branch") return fakeChildFromResponse({ stdout: "" });
				return fakeChildFromResponse({ stderr: "" });
			});
			const res = await deleteBranch("/repo", "kb/task-1");
			expect(res).toEqual({ deleted: true });
			expect(calls.some((a) => a[0] === "branch" && a[1] === "-D")).toBe(true);
		});

		it("is a no-op for missing branches", async () => {
			spawnMock.mockImplementation(() =>
				fakeChildFromResponse({ code: 1, stderr: "fatal" }),
			);
			const res = await deleteBranch("/repo", "kb/missing");
			expect(res).toEqual({ deleted: false });
		});
	});

	describe("hasRemote", () => {
		it("returns true when the remote URL resolves", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				expect(cmd).toBe("git");
				expect(args).toEqual(["remote", "get-url", "origin"]);
				return fakeChildFromResponse({ stdout: "/tmp/remote.git\n" });
			});
			expect(await hasRemote("/repo")).toBe(true);
		});

		it("returns false when no remote is configured (never throws)", async () => {
			spawnMock.mockImplementation(() =>
				fakeChildFromResponse({ code: 128, stderr: "fatal: No such remote 'origin'" }),
			);
			expect(await hasRemote("/repo")).toBe(false);
		});

		it("returns false for unsafe remote names without spawning", async () => {
			expect(await hasRemote("/repo", "--upload-pack=touch")).toBe(false);
			expect(spawnMock).not.toHaveBeenCalled();
		});
	});

	describe("pushBranchIfRemote", () => {
		it("skips with zero push spawned when no remote exists", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				return fakeChildFromResponse({ code: 128, stderr: "fatal: No such remote" });
			});
			const res = await pushBranchIfRemote("/repo", "kb/task-1");
			expect(res).toEqual({ pushed: false, skipped: "no-remote" });
			expect(calls.some((a) => a[0] === "push")).toBe(false);
		});

		it("pushes with -u on the first push (no upstream yet)", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
				if (args[0] === "rev-parse") {
					return fakeChildFromResponse({ code: 128, stderr: "fatal: no upstream" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await pushBranchIfRemote("/repo", "kb/task-1");
			expect(res).toEqual({ pushed: true, skipped: null });
			expect(calls).toContainEqual(["push", "-u", "origin", "kb/task-1"]);
		});

		it("pushes plainly when an upstream already exists", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
				if (args[0] === "rev-parse") {
					return fakeChildFromResponse({ stdout: "origin/kb/task-1" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await pushBranchIfRemote("/repo", "kb/task-1");
			expect(res).toEqual({ pushed: true, skipped: null });
			expect(calls).toContainEqual(["push", "origin", "kb/task-1"]);
			expect(calls.some((a) => a.includes("-u"))).toBe(false);
		});

		it("surfaces push failures as a catchable error (caller warns and continues)", async () => {
			spawnMock.mockImplementation((cmd, args) => {
				if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
				if (args[0] === "rev-parse") {
					return fakeChildFromResponse({ code: 128, stderr: "fatal: no upstream" });
				}
				return fakeChildFromResponse({ code: 128, stderr: "fatal: Authentication failed" });
			});
			await expect(pushBranchIfRemote("/repo", "kb/task-1")).rejects.toBeInstanceOf(
				GitError,
			);
		});

		it("rejects invalid branch names without spawning", async () => {
			await expect(pushBranchIfRemote("/repo", "--force")).rejects.toBeInstanceOf(
				GitError,
			);
			expect(spawnMock).not.toHaveBeenCalled();
		});
	});

	describe("returnToDefaultBranch", () => {
		it("is a no-op when already on the default branch", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args.includes("refs/remotes/origin/HEAD")) {
					return fakeChildFromResponse({ code: 128, stderr: "fatal" });
				}
				if (args.includes("refs/heads/main")) {
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args.includes("--abbrev-ref")) {
					return fakeChildFromResponse({ stdout: "main" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await returnToDefaultBranch("/repo");
			expect(res).toEqual({ switched: false, branch: "main" });
			expect(calls.some((a) => a[0] === "checkout")).toBe(false);
		});

		it("checks out the default branch when on a task branch", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args.includes("refs/remotes/origin/HEAD")) {
					return fakeChildFromResponse({ code: 128, stderr: "fatal" });
				}
				if (args.includes("refs/heads/main")) {
					return fakeChildFromResponse({ stdout: "abc" });
				}
				if (args.includes("--abbrev-ref")) {
					return fakeChildFromResponse({ stdout: "kb/task-1" });
				}
				if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
				if (args[0] === "checkout") return fakeChildFromResponse({ stdout: "" });
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await returnToDefaultBranch("/repo");
			expect(res).toEqual({ switched: true, branch: "main" });
			expect(calls).toContainEqual(["checkout", "main"]);
		});
	});

	describe("redactCredentials", () => {
		it("strips a token userinfo section from https remotes", () => {
			expect(
				redactCredentials("https://40hex-token-here@git.example.com/u/r.git"),
			).toBe("https://git.example.com/u/r.git");
		});

		it("strips user:password pairs (last @ wins)", () => {
			expect(redactCredentials("https://user:p%40ss@host/u/r.git")).toBe(
				"https://host/u/r.git",
			);
		});

		it("leaves credential-free URLs, scp remotes, and non-strings untouched", () => {
			expect(redactCredentials("https://host/u/r.git")).toBe(
				"https://host/u/r.git",
			);
			expect(redactCredentials("git@github.com:u/r.git")).toBe(
				"git@github.com:u/r.git",
			);
			expect(redactCredentials(null)).toBe(null);
			expect(redactCredentials(undefined)).toBe(undefined);
			expect(redactCredentials("")).toBe("");
		});
	});

	describe("ensureGitIdentity", () => {
		const OLD_NAME = process.env.KAINBAIN_GIT_AUTHOR_NAME;
		const OLD_EMAIL = process.env.KAINBAIN_GIT_AUTHOR_EMAIL;

		beforeEach(() => {
			delete process.env.KAINBAIN_GIT_AUTHOR_NAME;
			delete process.env.KAINBAIN_GIT_AUTHOR_EMAIL;
		});

		// Restore whatever the outer environment had (avoids leaking test state).
		afterEach(() => {
			if (OLD_NAME === undefined) delete process.env.KAINBAIN_GIT_AUTHOR_NAME;
			else process.env.KAINBAIN_GIT_AUTHOR_NAME = OLD_NAME;
			if (OLD_EMAIL === undefined) delete process.env.KAINBAIN_GIT_AUTHOR_EMAIL;
			else process.env.KAINBAIN_GIT_AUTHOR_EMAIL = OLD_EMAIL;
		});

		function mockIdentityReads({ name = "", email = "", isRepo = true } = {}) {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				// Record only config writes; reads are noise for these assertions.
				if (args[0] === "config" && args.includes("--local")) {
					calls.push([...args]);
				}
				if (args[0] === "rev-parse" && args[1] === "--inside-work-tree") {
					return fakeChildFromResponse(
						isRepo ? { stdout: "true" } : { code: 128, stderr: "fatal" },
					);
				}
				if (args[0] === "config" && args[1] === "user.name") {
					return name
						? fakeChildFromResponse({ stdout: name })
						: fakeChildFromResponse({ code: 1, stderr: "" });
				}
				if (args[0] === "config" && args[1] === "user.email") {
					return email
						? fakeChildFromResponse({ stdout: email })
						: fakeChildFromResponse({ code: 1, stderr: "" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			return calls;
		}

		it("provisions repo-local defaults when name and email are both unset", async () => {
			const writes = mockIdentityReads();
			const res = await ensureGitIdentity("/repo");
			expect(res).toEqual({
				provisioned: true,
				name: DEFAULT_GIT_AUTHOR_NAME,
				email: DEFAULT_GIT_AUTHOR_EMAIL,
			});
			expect(writes).toContainEqual([
				"config",
				"--local",
				"user.name",
				DEFAULT_GIT_AUTHOR_NAME,
			]);
			expect(writes).toContainEqual([
				"config",
				"--local",
				"user.email",
				DEFAULT_GIT_AUTHOR_EMAIL,
			]);
			// Never touches global config.
			expect(writes.some((a) => a.includes("--global"))).toBe(false);
		});

		it("honors KAINBAIN_GIT_AUTHOR_NAME/EMAIL overrides", async () => {
			process.env.KAINBAIN_GIT_AUTHOR_NAME = "Work Laptop";
			process.env.KAINBAIN_GIT_AUTHOR_EMAIL = "dev@corp.example";
			const writes = mockIdentityReads();
			const res = await ensureGitIdentity("/repo");
			expect(res.provisioned).toBe(true);
			expect(res.name).toBe("Work Laptop");
			expect(res.email).toBe("dev@corp.example");
			expect(writes).toContainEqual([
				"config",
				"--local",
				"user.name",
				"Work Laptop",
			]);
			expect(writes).toContainEqual([
				"config",
				"--local",
				"user.email",
				"dev@corp.example",
			]);
		});

		it("leaves a fully configured identity untouched", async () => {
			const writes = mockIdentityReads({
				name: "Ada",
				email: "ada@example.com",
			});
			const res = await ensureGitIdentity("/repo");
			expect(res).toEqual({
				provisioned: false,
				name: "Ada",
				email: "ada@example.com",
			});
			expect(writes).toEqual([]);
		});

		it("fills in only the missing half", async () => {
			const writes = mockIdentityReads({ name: "Ada" });
			const res = await ensureGitIdentity("/repo");
			expect(res).toEqual({
				provisioned: true,
				name: "Ada",
				email: DEFAULT_GIT_AUTHOR_EMAIL,
			});
			expect(writes).toEqual([
				["config", "--local", "user.email", DEFAULT_GIT_AUTHOR_EMAIL],
			]);
		});

		it("is a no-op outside a git repository", async () => {
			const writes = mockIdentityReads({ isRepo: false });
			const res = await ensureGitIdentity("/not-a-repo");
			expect(res).toEqual({ provisioned: false, name: null, email: null });
			expect(writes).toEqual([]);
		});

		it("commitAllIfNeeded provisions identity before committing on a fresh machine", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args[0] === "status") {
					return fakeChildFromResponse({ stdout: " M file.js\n" });
				}
				if (args[0] === "config" && !args.includes("--local")) {
					return fakeChildFromResponse({ code: 1, stderr: "" }); // unset
				}
				if (args[0] === "commit") {
					return fakeChildFromResponse({ stdout: "[main abc] msg" });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			const res = await commitAllIfNeeded("/repo", "msg");
			expect(res.committed).toBe(true);
			const writeIdx = calls.findIndex(
				(a) => a[0] === "config" && a.includes("--local"),
			);
			const commitIdx = calls.findIndex((a) => a[0] === "commit");
			expect(writeIdx).toBeGreaterThanOrEqual(0);
			expect(writeIdx).toBeLessThan(commitIdx);
		});

		it("mergeBranch provisions identity before merging on a fresh machine", async () => {
			const calls = [];
			spawnMock.mockImplementation((cmd, args) => {
				calls.push([...args]);
				if (args.join(" ").startsWith("rev-parse --verify MERGE_HEAD")) {
					return fakeChildFromResponse({ code: 1, stderr: "fatal" });
				}
				if (args[0] === "config" && !args.includes("--local")) {
					return fakeChildFromResponse({ code: 1, stderr: "" }); // unset
				}
				if (args[0] === "merge" && args[1] === "--no-edit") {
					return fakeChildFromResponse({ stdout: "Already up to date." });
				}
				return fakeChildFromResponse({ stdout: "" });
			});
			await mergeBranch("/repo", "kb/task-1");
			const writeIdx = calls.findIndex(
				(a) => a[0] === "config" && a.includes("--local"),
			);
			const mergeIdx = calls.findIndex(
				(a) => a[0] === "merge" && a[1] === "--no-edit",
			);
			expect(writeIdx).toBeGreaterThanOrEqual(0);
			expect(writeIdx).toBeLessThan(mergeIdx);
		});
	});
});

/***
 * MARK: Git barrel surface contract
 * @description Guards the WP-4 zero-caller-churn contract: `api/git.js` must
 *   re-export exactly the 48 canonical public symbols (classes, functions,
 *   constants) with identical names, so flow/work/store callers need no
 *   import changes. Command-family implementations live under `api/git/`
 *   and are covered directly by the co-located `api/git/*.test.js` suites.
 ***/
describe("git barrel surface contract", () => {
	const EXPECTED_EXPORTS = [
		"DEFAULT_GIT_AUTHOR_EMAIL",
		"DEFAULT_GIT_AUTHOR_NAME",
		"DEFAULT_IGNORED_PATHS",
		"GitBranchMismatchError",
		"GitDirtyTreeError",
		"GitError",
		"GitMergeConflictError",
		"MERGE_STRATEGY",
		"STALE_GIT_LOCK_AGE_MS",
		"SWEEPABLE_BASENAME_PATTERNS",
		"SWEEPABLE_DIR_PREFIXES",
		"abortMerge",
		"assessDirtyTree",
		"branchExists",
		"buildGitConflictDiagnostics",
		"checkoutBranch",
		"commitAllIfNeeded",
		"countBehindCommits",
		"countUniqueCommits",
		"createBranch",
		"currentBranch",
		"defaultBranch",
		"deleteBranch",
		"diffRangeNumstat",
		"drainDirtyTreeRecoveries",
		"drainGitLockRecoveries",
		"ensureBranchCheckedOut",
		"ensureGitIdentity",
		"formatDirtyTreeRecoveryNotice",
		"formatGitLockRecoveryNotice",
		"getWorkingTreeStatus",
		"git",
		"hasCommits",
		"hasRemote",
		"isBranchMergedInto",
		"isGitRepository",
		"isMergeInProgress",
		"isValidBranchName",
		"isWorkingTreeClean",
		"maybeRecoverStaleLock",
		"mergeBranch",
		"pushBranchIfRemote",
		"recoverDirtyTree",
		"redactCredentials",
		"requireCleanWorkingTree",
		"resolveSha",
		"returnToDefaultBranch",
		"withCheckedOutBranch",
	];

	it("exports exactly the 48 canonical public symbols", () => {
		expect(Object.keys(gitBarrel).sort()).toEqual(EXPECTED_EXPORTS);
	});

	it("exposes classes, functions, and constants under their original types", () => {
		expect(typeof gitBarrel.git).toBe("function");
		expect(typeof gitBarrel.checkoutBranch).toBe("function");
		expect(typeof gitBarrel.mergeBranch).toBe("function");
		expect(typeof gitBarrel.isValidBranchName).toBe("function");
		expect(typeof gitBarrel.redactCredentials).toBe("function");
		expect(gitBarrel.GitError).toBeInstanceOf(Function);
		expect(gitBarrel.GitMergeConflictError).toBeInstanceOf(Function);
		expect(gitBarrel.STALE_GIT_LOCK_AGE_MS).toBe(30000);
		expect(gitBarrel.MERGE_STRATEGY).toContain("auto-abort");
		expect(gitBarrel.DEFAULT_GIT_AUTHOR_NAME).toBe("KainBain Agent");
	});
});

/** Builds a fake spawn child that replays a mocked git response. */
function fakeChildFromResponse({ stdout = "", stderr = "", code = 0, error = null } = {}) {
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