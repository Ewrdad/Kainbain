/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for the post-stage finalisation helper: commit → push
// (remote-only) → return to default. Everything happens inside throwaway temp
// directories — never the KainBain repo itself.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { currentBranch, ensureBranchCheckedOut } = await import("../git.js");
const { ensureTaskBranch, resolveTaskBranch } = await import("./taskBranches.js");
const {
	finalizeTaskBranch,
	commitFailedStageWork,
	buildStageCommitMessage,
	STAGE_COMMIT_BODY_MAX_CHARS,
} = await import("./taskFinalize.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo(cwd) {
	fs.mkdirSync(cwd, { recursive: true });
	run(cwd, "init", "-b", "main");
	run(cwd, "config", "user.email", "kainbain-test@example.com");
	run(cwd, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(cwd, "README.md"), "# init\n");
	run(cwd, "add", "-A");
	run(cwd, "commit", "-m", "init");
}

// Minimal store double: finalize only needs cwd resolution, markdown
// persistence, and an (optional) event bridge.
function fakeStore() {
	return {
		_resolveProjectCwd: (_projectId, explicitCwd) => explicitCwd,
		_saveTaskMarkdown: () => {},
		eventBridge: null,
	};
}

function fakeTask(id = "task-1") {
	return {
		id,
		projectId: "proj-1",
		history: [],
		logEntries: [],
	};
}

/** Text view over the task's structured entries (the only log storage). */
const logText = (task) => (task.logEntries || []).map((e) => e.text).join("\n");

describe("buildStageCommitMessage (pure, no git needed)", () => {
	it("returns subject + whole prompt body when a curated prompt exists", () => {
		const prompt = "# Task\nDo the thing.\n\n# Stage\nDo it now.\n";
		const { subject, body } = buildStageCommitMessage(
			{ id: "t1", goal: "Fix the login redirect", prompt },
			"Plan",
		);
		expect(subject).toBe(
			"KainBain (task t1): auto-commit work after stage 'Plan' — Fix the login redirect",
		);
		expect(body).toBe(prompt);
	});

	it("falls back to the legacy subject-only message without a prompt", () => {
		for (const task of [
			{ id: "t1" },
			{ id: "t1", prompt: "" },
			{ id: "t1", prompt: "   \n  " },
			{ id: "t1", prompt: 42 },
			{ id: "t1", prompt: null },
		]) {
			const { subject, body } = buildStageCommitMessage(task, "Plan");
			expect(subject).toBe(
				"KainBain (task t1): auto-commit work after stage 'Plan'",
			);
			expect(body).toBeNull();
		}
	});

	it("falls back to 'stage' for a missing or blank stage label", () => {
		for (const label of [undefined, null, "", "   "]) {
			const { subject } = buildStageCommitMessage({ id: "t1" }, label);
			expect(subject).toContain("after stage 'stage'");
		}
	});

	it("uses the first non-empty goal line and truncates a long goal", () => {
		const { subject } = buildStageCommitMessage(
			{ id: "t1", goal: "\n  \nFirst line\nSecond line" },
			"Plan",
		);
		expect(subject).toContain("— First line");
		expect(subject).not.toContain("Second line");

		const longGoal = `goal:${"x".repeat(200)}`;
		const clipped = buildStageCommitMessage(
			{ id: "t1", goal: longGoal },
			"Plan",
		).subject;
		expect(clipped).toContain("...");
		expect(clipped.length).toBeLessThan(
			"KainBain (task t1): auto-commit work after stage 'Plan' — ".length +
				103 +
				1,
		);
	});

	it("truncates an oversized prompt with a marker instead of dropping it", () => {
		const prompt = `head-${"y".repeat(STAGE_COMMIT_BODY_MAX_CHARS + 100)}-tail`;
		const { subject, body } = buildStageCommitMessage(
			{ id: "t1", prompt },
			"Plan",
		);
		expect(subject).toContain("after stage 'Plan'");
		expect(body).toContain("head-");
		expect(body).toContain("[truncated:");
		expect(body).not.toContain("-tail");
	});

	it("truncates on code-point boundaries (no split surrogate pairs)", () => {
		const prompt = `🎉`.repeat(STAGE_COMMIT_BODY_MAX_CHARS + 5);
		const { body } = buildStageCommitMessage({ id: "t1", prompt }, "Plan");
		const [kept] = body.split("\n\n[truncated:");
		expect([...kept].length).toBe(STAGE_COMMIT_BODY_MAX_CHARS);
		expect(kept).toBe(`🎉`.repeat(STAGE_COMMIT_BODY_MAX_CHARS));
	});
});

describe.skipIf(!gitAvailable)("finalizeTaskBranch against a real repository", () => {
	let base;

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-finalize-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("commits work and returns to default on a pure-local repo without pushing", async () => {
		const repo = path.join(base, "local-only");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("local-1");

		await ensureTaskBranch(store, task, repo);
		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(true);
		expect(summary.hash).toBeTruthy();
		expect(summary.commitError).toBeNull();
		expect(summary.pushed).toBe(false);
		expect(summary.pushSkipped).toBe("no-remote");
		expect(summary.pushError).toBeNull();
		expect(summary.defaultBranch).toBe("main");
		expect(summary.switched).toBe(true);
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		// The commit landed on the task branch.
		expect(run(repo, "log", "--oneline", resolveTaskBranch(task))).toContain(
			"auto-commit work after stage 'Plan'",
		);
		// Auditable trail in history and process logs.
		expect(
			task.history.some((h) => h.action.includes("Auto-committed task work")),
		).toBe(true);
		expect(
			task.history.some((h) => h.action.includes("Returned to default branch")),
		).toBe(true);
		expect(logText(task)).toContain("[GIT]");
	});

	it("pushes the task branch to a file remote and ends on the default branch", async () => {
		const repo = path.join(base, "with-remote");
		initRepo(repo);
		const remoteDir = path.join(base, "with-remote-origin.git");
		run(base, "init", "--bare", "with-remote-origin.git");
		run(repo, "remote", "add", "origin", remoteDir);

		const store = fakeStore();
		const task = fakeTask("remote-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "feature.txt"), "feature\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(true);
		expect(summary.pushed).toBe(true);
		expect(summary.pushSkipped).toBeNull();
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		expect(
			run(remoteDir, "log", "--oneline", `refs/heads/${resolveTaskBranch(task)}`),
		).toContain("auto-commit work");
	});

	it("treats push failure as a warning: the tree still returns to default", async () => {
		const repo = path.join(base, "unreachable-remote");
		initRepo(repo);
		run(repo, "remote", "add", "origin", "/nonexistent/kainbain-remote.git");

		const store = fakeStore();
		const task = fakeTask("unreachable-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		// The stage outcome this summary drives must still pass.
		expect(summary.committed).toBe(true);
		expect(summary.pushed).toBe(false);
		expect(summary.pushError).toBeTruthy();
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		expect(logText(task)).toContain("stage still passes");
	});

	it("still attempts the return when the commit is blocked, reporting loudly", async () => {
		const repo = path.join(base, "blocked-commit");
		initRepo(repo);
		// A failing pre-commit hook blocks the auto-commit and leaves the tree dirty.
		const hookPath = path.join(repo, ".git", "hooks", "pre-commit");
		fs.writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
		fs.chmodSync(hookPath, 0o755);

		const store = fakeStore();
		const task = fakeTask("blocked-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(false);
		expect(summary.commitError).toBeTruthy();
		// The tree is dirty, so the return is refused loudly instead of
		// stranding the branch silently.
		expect(summary.returnError).toBeTruthy();
		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		expect(logText(task)).toContain("[ERROR]");
	});

	it("is a no-op success when there is nothing to commit", async () => {
		const repo = path.join(base, "clean-tree");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("clean-1");
		await ensureTaskBranch(store, task, repo);

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(false);
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
	});

	it("returns null when the task or cwd cannot be resolved", async () => {
		const store = fakeStore();
		expect(await finalizeTaskBranch(store, null, "/repo")).toBeNull();
		const unresolvable = {
			_resolveProjectCwd: () => null,
			_saveTaskMarkdown: () => {},
			eventBridge: null,
		};
		expect(
			await finalizeTaskBranch(unresolvable, fakeTask("x"), undefined),
		).toBeNull();
	});

	it("never throws outside a git repository", async () => {
		const plain = path.join(base, "not-a-repo");
		fs.mkdirSync(plain, { recursive: true });
		const summary = await finalizeTaskBranch(fakeStore(), fakeTask("plain-1"), plain, {
			stageName: "Plan",
		});
		expect(summary?.skipped).toBe("no-git");
		expect(summary?.returnError).toBeNull();
	});

	it("accepts a commit message override", async () => {
		const repo = path.join(base, "custom-message");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("custom-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		await finalizeTaskBranch(store, task, repo, {
			message: "Custom subject line",
		});
		expect(run(repo, "log", "--format=%s", "-1", resolveTaskBranch(task))).toContain(
			"Custom subject line",
		);
	});

	it("commits the whole curated prompt verbatim in the body", async () => {
		const repo = path.join(base, "prompt-body");
		initRepo(repo);
		const store = fakeStore();
		const task = {
			...fakeTask("prompt-1"),
			goal: "Fix the login redirect",
			prompt: [
				"# Task",
				"Fix the login redirect.",
				"",
				"# Stage",
				"Please execute the plan.",
				`Quotes: "double" 'single` + " `backtick`",
				"Unicode: héllo wörld ✓ emoji 🎉",
				"padded line:   ",
				"",
			].join("\n"),
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});
		expect(summary.committed).toBe(true);

		const branch = resolveTaskBranch(task);
		const expectedSubject =
			"KainBain (task prompt-1): auto-commit work after stage 'Plan' — Fix the login redirect";
		expect(run(repo, "log", "--format=%s", "-1", branch)).toContain(
			expectedSubject,
		);
		expect(run(repo, "log", "--oneline", branch)).toContain(expectedSubject);
		const full = run(repo, "log", "--format=%B", "-1", branch);
		// The full prompt survives round-trip, including `#` headings,
		// quotes, unicode, and even trailing whitespace (verbatim cleanup).
		expect(full).toContain(task.prompt);
		expect(full).toContain("# Task");
		expect(full).toContain("padded line:   ");
	});

	it("lets an explicit message override win over the curated prompt", async () => {
		const repo = path.join(base, "override-wins");
		initRepo(repo);
		const store = fakeStore();
		const task = {
			...fakeTask("override-1"),
			goal: "Some goal",
			prompt: "# Task\nSome curated prompt body.\n",
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		await finalizeTaskBranch(store, task, repo, {
			message: "Custom subject line",
		});
		const branch = resolveTaskBranch(task);
		expect(run(repo, "log", "--format=%s", "-1", branch)).toContain(
			"Custom subject line",
		);
		expect(run(repo, "log", "--format=%B", "-1", branch)).not.toContain(
			"Some curated prompt body.",
		);
	});

	it("truncates an oversized prompt with a marker and still commits", async () => {
		const repo = path.join(base, "prompt-truncated");
		initRepo(repo);
		const store = fakeStore();
		const tail = "tail-unique-xyz-123";
		const task = {
			...fakeTask("trunc-1"),
			prompt: `head-${"y".repeat(STAGE_COMMIT_BODY_MAX_CHARS + 100)}${tail}`,
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});
		expect(summary.committed).toBe(true);
		expect(summary.commitError).toBeNull();
		const full = run(
			repo,
			"log",
			"--format=%B",
			"-1",
			resolveTaskBranch(task),
		);
		expect(full).toContain("head-");
		expect(full).toContain("[truncated:");
		expect(full).not.toContain(tail);
	});

	it("keeps pickup order default-first (existing branch via the default branch)", async () => {
		const repo = path.join(base, "pickup-order");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("pickup-1");
		await ensureTaskBranch(store, task, repo);
		// Strand the tree on an unrelated branch, then pick the task back up.
		await ensureBranchCheckedOut(repo, "kb/other-task", { baseBranch: "main" });
		expect(await currentBranch(repo)).toBe("kb/other-task");

		task.history = [];
		await ensureTaskBranch(store, task, repo);

		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		const actions = task.history.map((h) => h.action);
		const viaDefault = actions.findIndex((a) =>
			a.includes("Returned to default branch 'main'"),
		);
		const pickedUp = actions.findIndex((a) =>
			a.includes(`Checked out task branch '${resolveTaskBranch(task)}'`),
		);
		expect(viaDefault).toBeGreaterThanOrEqual(0);
		expect(pickedUp).toBeGreaterThan(viaDefault);
	});
});

describe.skipIf(!gitAvailable)("commitFailedStageWork against a real repository", () => {
	function setupRepo(name) {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), `kainbain-failed-${name}-`));
		initRepo(repo);
		return { repo, store: fakeStore(), task: fakeTask(`failed-${name}`) };
	}

	function teardown(repo) {
		try {
			fs.rmSync(repo, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	it("commits dirty partial work with a '... (failed)' message and bounds the range", async () => {
		const { repo, store, task } = setupRepo("commit");
		try {
			await ensureTaskBranch(store, task, repo);
			task.branch = resolveTaskBranch(task);
			const branch = task.branch;
			expect(await currentBranch(repo)).toBe(branch);
			fs.writeFileSync(path.join(repo, "partial.txt"), "partial\n");

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res?.committed).toBe(true);
			expect(res?.hash).toBeTruthy();
			expect(run(repo, "log", "-1", "--format=%s", branch)).toContain(
				"... (failed)",
			);
			// The failed attempt's end boundary is recorded so a retry
			// starts after this commit instead of absorbing it.
			expect(task.currentStageEndSha).toBeTruthy();
			expect(
				task.history.some((h) => h.action.includes("partial work")),
			).toBe(true);
			expect(logText(task)).toContain("[GIT]");
		} finally {
			teardown(repo);
		}
	});

	it("is a clean-tree no-op that still resolves an end boundary", async () => {
		const { repo, store, task } = setupRepo("clean");
		try {
			await ensureTaskBranch(store, task, repo);
			task.branch = resolveTaskBranch(task);

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res).toMatchObject({ committed: false });
			expect(
				task.history.some((h) => h.action.includes("partial work")),
			).toBe(false);
		} finally {
			teardown(repo);
		}
	});

	it("leaves tasks without a branch alone (single-branch mode)", async () => {
		const { repo, store, task } = setupRepo("nobranch");
		try {
			const before = run(repo, "rev-list", "--count", "HEAD");
			fs.writeFileSync(path.join(repo, "stray.txt"), "stray\n");

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res).toBeNull();
			expect(run(repo, "rev-list", "--count", "HEAD")).toBe(before);
		} finally {
			teardown(repo);
		}
	});

	it("never throws outside a repository", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-failed-norepo-"));
		try {
			const store = fakeStore();
			const task = { ...fakeTask("failed-norepo"), branch: "kb/failed-norepo" };
			await expect(
				commitFailedStageWork(store, task, dir, { stageName: "Dev" }),
			).resolves.toBeNull();
		} finally {
			teardown(dir);
		}
	});
});
