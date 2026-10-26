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
