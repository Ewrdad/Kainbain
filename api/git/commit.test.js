import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	DEFAULT_GIT_AUTHOR_NAME,
	DEFAULT_GIT_AUTHOR_EMAIL,
	ensureGitIdentity,
	commitAllIfNeeded,
	commitEngineSnapshots,
} from "./commit.js";
import { GitBranchMismatchError } from "./errors.js";

/***
 * MARK: git commit unit tests
 * @description Direct tests for the `api/git/commit.js` command family:
 *   repo-local identity provisioning and the auto-commit reliability
 *   fallback with its expected-branch affinity guard.
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

describe("ensureGitIdentity", () => {
	const OLD_NAME = process.env.KAINBAIN_GIT_AUTHOR_NAME;
	const OLD_EMAIL = process.env.KAINBAIN_GIT_AUTHOR_EMAIL;

	beforeEach(() => {
		spawnMock.mockReset();
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

	it("exposes the documented default author constants", () => {
		expect(DEFAULT_GIT_AUTHOR_NAME).toBe("KainBain Agent");
		expect(DEFAULT_GIT_AUTHOR_EMAIL).toBe("kainbain@local");
	});
});

describe("commitAllIfNeeded", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

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

	it("commits a body verbatim with a second -m when opts.body is set", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args[0] === "status") return fakeChildFromResponse({ stdout: " M file.js\n" });
			if (args[0] === "add") return fakeChildFromResponse({ stdout: "" });
			if (args[0] === "commit") return fakeChildFromResponse({ stdout: "ok" });
			return fakeChildFromResponse({ stdout: "abc1234" });
		});
		const res = await commitAllIfNeeded("/repo", "subject", {
			body: "# Heading\nprompt body",
		});
		expect(res.committed).toBe(true);
		const commit = calls.find((a) => a[0] === "commit");
		expect(commit).toEqual([
			"commit",
			"--cleanup=verbatim",
			"-m",
			"subject",
			"-m",
			"# Heading\nprompt body",
		]);
	});
});

describe("commitEngineSnapshots", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	/** Routes status output per test; everything else succeeds. */
	function routeStatus(statusStdout, { current = "kb/t", tracked = "" } = {}) {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args.includes("--abbrev-ref")) {
				return fakeChildFromResponse({ stdout: `${current}\n` });
			}
			if (args[0] === "status") return fakeChildFromResponse({ stdout: statusStdout });
			if (args[0] === "ls-files") return fakeChildFromResponse({ stdout: tracked });
			return fakeChildFromResponse({ stdout: "" });
		});
		return calls;
	}

	it("commits only snapshot paths and leaves real dirt uncommitted", async () => {
		const calls = routeStatus(" M docs/tasks/t/report.md\n M dirty.js\n");
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res.committed).toBe(true);
		expect(calls).toContainEqual(["add", "--", "docs/tasks/t/report.md"]);
		// Plumbing commit: scratch-index commit-tree + CAS update-ref.
		expect(calls.some((a) => a[0] === "commit-tree")).toBe(true);
		const updateRef = calls.find((a) => a[0] === "update-ref");
		expect(updateRef?.[1]).toBe("HEAD");
		expect(calls.some((a) => a.slice(1).some((x) => String(x).includes("dirty.js")))).toBe(false);
	});

	it("never stages the live task.md snapshot (Step 5: untracked, not committed)", async () => {
		const calls = routeStatus(
			" M docs/tasks/t/task.md\n M docs/tasks/t/report.md\n",
		);
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res.committed).toBe(true);
		const adds = calls.filter((a) => a[0] === "add");
		expect(adds.length).toBeGreaterThan(0);
		for (const add of adds) {
			expect(add.some((a) => String(a).endsWith("task.md"))).toBe(false);
		}
		expect(calls.some((a) => a[0] === "commit-tree")).toBe(true);
		expect(calls.some((a) => a[0] === "update-ref")).toBe(true);
	});

	it("is a no-op when only an already-untracked task.md snapshot is dirty", async () => {
		const calls = routeStatus("?? docs/tasks/t/task.md\n");
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res).toEqual({ committed: false, hash: null });
		expect(calls.some((a) => a[0] === "commit-tree")).toBe(false);
		expect(calls.some((a) => a[0] === "update-ref")).toBe(false);
	});

	it("commits the untrack removal (staged deletion rides along) without staging content", async () => {
		const calls = routeStatus(" M docs/tasks/t/task.md\n", {
			tracked: "docs/tasks/t/task.md",
		});
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res.committed).toBe(true);
		// Content is never staged: no `add` carries task.md ...
		for (const add of calls.filter((a) => a[0] === "add")) {
			expect(add.some((a) => String(a).endsWith("task.md"))).toBe(false);
		}
		// ... but the removal is recorded via the scratch index so the
		// pending switch can proceed.
		const rm = calls.find((a) => a[0] === "rm");
		expect(rm).toContain("--cached");
		expect(calls.some((a) => a[0] === "commit-tree")).toBe(true);
		expect(calls.some((a) => a[0] === "update-ref")).toBe(true);
	});

	it("is a no-op when only real dirt exists (never stages it)", async () => {
		const calls = routeStatus(" M dirty.js\n");
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res).toEqual({ committed: false, hash: null });
		expect(calls.some((a) => a[0] === "add" || a[0] === "commit")).toBe(false);
	});

	it("refuses the wrong branch without staging anything", async () => {
		const calls = routeStatus(" M docs/tasks/t/task.md\n", { current: "main" });
		await expect(
			commitEngineSnapshots("/repo", "snapshots", { expectedBranch: "kb/t" }),
		).rejects.toBeInstanceOf(GitBranchMismatchError);
		expect(calls.some((a) => a[0] === "add" || a[0] === "commit")).toBe(false);
	});

	it("is a no-op outside a repository", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args.includes("--inside-work-tree")) {
				return fakeChildFromResponse({ code: 128, stderr: "fatal" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await commitEngineSnapshots("/repo", "snapshots");
		expect(res).toEqual({ committed: false, hash: null });
	});
});

describe("isLiveTaskSnapshotPath", () => {
	it("matches task.md under task-docs prefixes only", async () => {
		const { isLiveTaskSnapshotPath } = await import("./commit.js");
		expect(isLiveTaskSnapshotPath("docs/tasks/abc/task.md")).toBe(true);
		expect(isLiveTaskSnapshotPath("docs/tasks/abc/report.md")).toBe(false);
		expect(isLiveTaskSnapshotPath("docs/tasks/abc/assets/image.png")).toBe(false);
		expect(isLiveTaskSnapshotPath("task.md")).toBe(false);
		expect(isLiveTaskSnapshotPath("src/task.md")).toBe(false);
		expect(isLiveTaskSnapshotPath("docs/tasks.md")).toBe(false);
		expect(isLiveTaskSnapshotPath("")).toBe(false);
		expect(isLiveTaskSnapshotPath(null)).toBe(false);
	});
});

describe("untrackLiveTaskSnapshots", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	function routeLsFiles(tracked) {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args.includes("--abbrev-ref")) {
				return fakeChildFromResponse({ stdout: "main\n" });
			}
			if (args[0] === "ls-files") {
				return fakeChildFromResponse({ stdout: tracked });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		return calls;
	}

	it("removes tracked task.md snapshots from the index, keeps everything else", async () => {
		const { untrackLiveTaskSnapshots } = await import("./commit.js");
		const calls = routeLsFiles("docs/tasks/t/task.md\0src/code.js\0");
		const res = await untrackLiveTaskSnapshots("/repo");
		expect(res).toEqual({ untracked: ["docs/tasks/t/task.md"] });
		const rm = calls.find((a) => a[0] === "rm");
		expect(rm).toBeTruthy();
		expect(rm).toContain("--cached");
		expect(rm).toContain("docs/tasks/t/task.md");
		expect(rm.some((a) => String(a).includes("code.js"))).toBe(false);
	});

	it("is a no-op when no live snapshot is tracked", async () => {
		const { untrackLiveTaskSnapshots } = await import("./commit.js");
		const calls = routeLsFiles("src/code.js\0");
		const res = await untrackLiveTaskSnapshots("/repo");
		expect(res).toEqual({ untracked: [] });
		expect(calls.some((a) => a[0] === "rm")).toBe(false);
	});
});
