import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	checkoutBranch,
	createBranch,
	ensureBranchCheckedOut,
	defaultBranch,
	returnToDefaultBranch,
	deleteBranch,
	withCheckedOutBranch,
} from "./branch.js";
import { GitError, GitDirtyTreeError } from "./errors.js";

/***
 * MARK: git branch unit tests
 * @description Direct tests for the `api/git/branch.js` command family:
 *   guarded checkout, idempotent creation, the ensure entrypoint, default
 *   branch resolution, deletion, and scoped branch execution.
 *   child_process.spawn is mocked — no real git is ever invoked.
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

describe("checkoutBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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
		spawnMock.mockImplementation((cmd, args) => {
			if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main\n" });
			if (args[0] === "status") return fakeChildFromResponse({ stdout: " M dirty.js\n" });
			return fakeChildFromResponse({ stdout: "" });
		});
		await expect(checkoutBranch("/repo", "kb/task-1")).rejects.toBeInstanceOf(
			GitDirtyTreeError,
		);
		// Never spawned the checkout — and never committed real work.
		expect(
			spawnMock.mock.calls.some(([, args]) => args[0] === "checkout"),
		).toBe(false);
		expect(
			spawnMock.mock.calls.some(([, args]) => args[0] === "commit"),
		).toBe(false);
	});

	it("checks out when the tree is clean", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main\n" });
			if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
			if (args[0] === "checkout") {
				return fakeChildFromResponse({ stdout: "Switched to branch 'kb/task-1'" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await checkoutBranch("/repo", "kb/task-1");
		expect(res).toEqual({ switched: true });
		expect(spawnMock.mock.calls.at(-1)[1]).toEqual(["checkout", "kb/task-1"]);
	});

	it("auto-commits engine snapshots before switching (real dirt still refuses)", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args.includes("--abbrev-ref")) return fakeChildFromResponse({ stdout: "main\n" });
			if (args[0] === "status") {
				return fakeChildFromResponse({ stdout: " M docs/tasks/t/task.md\n" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await checkoutBranch("/repo", "kb/task-1");
		expect(res).toEqual({ switched: true });
		// Only the snapshot path was staged and committed — nothing else.
		expect(calls).toContainEqual(["add", "--", "docs/tasks/t/task.md"]);
		const commit = calls.find((a) => a[0] === "commit");
		expect(commit).toBeTruthy();
		expect(commit.slice(3)).toEqual(["--", "docs/tasks/t/task.md"]);
		expect(calls.at(-1)).toEqual(["checkout", "kb/task-1"]);
	});

	it("rejects invalid branch names without spawning", async () => {
		await expect(checkoutBranch("/repo", "--force")).rejects.toBeInstanceOf(
			GitError,
		);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});

describe("createBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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
	beforeEach(() => {
		spawnMock.mockReset();
	});

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

describe("defaultBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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

	it("falls back to the supplied fallback (default 'main')", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ code: 128, stderr: "fatal" }),
		);
		expect(await defaultBranch("/repo", { fallback: "trunk" })).toBe("trunk");
		expect(await defaultBranch("/repo")).toBe("main");
	});
});

describe("deleteBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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

	it("rejects invalid names without spawning", async () => {
		await expect(deleteBranch("/repo", "--force")).rejects.toBeInstanceOf(GitError);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});

describe("returnToDefaultBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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

describe("withCheckedOutBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("runs fn as-is when no branch is given (zero checkouts)", async () => {
		const res = await withCheckedOutBranch("/repo", null, async () => "value");
		expect(res).toBe("value");
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("runs fn as-is when already on the branch (zero checkouts)", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args.includes("refs/remotes/origin/HEAD")) {
				return fakeChildFromResponse({ code: 128, stderr: "fatal" });
			}
			if (args.includes("refs/heads/main")) {
				return fakeChildFromResponse({ stdout: "abc" });
			}
			if (args.includes("--abbrev-ref")) {
				return fakeChildFromResponse({ stdout: "kb/task-1" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const calls = [];
		const res = await withCheckedOutBranch("/repo", "kb/task-1", async () => {
			calls.push("fn");
			return 42;
		});
		expect(res).toBe(42);
		expect(calls).toEqual(["fn"]);
		expect(
			spawnMock.mock.calls.some(([, args]) => args[0] === "checkout"),
		).toBe(false);
	});

	it("checks out, runs, and restores the default branch", async () => {
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
				// Before fn: on main; restore check: on kb/task-1.
				const seenCheckout = calls.some(
					(a) => a[0] === "checkout" && a[1] === "kb/task-1",
				);
				return fakeChildFromResponse({
					stdout: seenCheckout ? "kb/task-1" : "main",
				});
			}
			if (args[0] === "status") return fakeChildFromResponse({ stdout: "" });
			if (args[0] === "checkout") return fakeChildFromResponse({ stdout: "" });
			return fakeChildFromResponse({ stdout: "" });
		});
		const seen = [];
		const res = await withCheckedOutBranch("/repo", "kb/task-1", async () => {
			seen.push("fn");
			return "done";
		});
		expect(res).toBe("done");
		expect(seen).toEqual(["fn"]);
		expect(calls).toContainEqual(["checkout", "kb/task-1"]);
		expect(calls).toContainEqual(["checkout", "main"]);
	});

	it("refuses a dirty tree before switching (recovery off)", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args.includes("refs/remotes/origin/HEAD")) {
				return fakeChildFromResponse({ code: 128, stderr: "fatal" });
			}
			if (args.includes("refs/heads/main")) {
				return fakeChildFromResponse({ stdout: "abc" });
			}
			if (args.includes("--abbrev-ref")) {
				return fakeChildFromResponse({ stdout: "main" });
			}
			if (args[0] === "status") {
				return fakeChildFromResponse({ stdout: " M dirty.js\n" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		await expect(
			withCheckedOutBranch("/repo", "kb/task-1", async () => "never"),
		).rejects.toBeInstanceOf(GitDirtyTreeError);
	});

	it("rejects invalid branch names without running fn", async () => {
		let ran = false;
		await expect(
			withCheckedOutBranch("/repo", "--force", async () => {
				ran = true;
			}),
		).rejects.toBeInstanceOf(GitError);
		expect(ran).toBe(false);
	});
});
