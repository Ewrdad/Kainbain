/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { currentBranch } from "../git.js";
import {
	isReviewDiffPreserved,
	shouldResetReviewBaseline,
	isValidReviewBaseline,
	resolveDirtyTreeRecoveryMode,
	syncMainToRemoteBestEffort,
} from "./taskBranches.js";

/***
 * MARK: Task branch pickup tests
 * @description Proves the deterministic pickup lifecycle against real
 *   repositories in throwaway temp directories: picking up a task always
 *   passes through the default branch first, so a tree stranded on another
 *   task branch never carries its state into the next stage. Branch mode is
 *   flipped on only after task creation so the creation-time provisioning
 *   race cannot flake these tests.
 ***/

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

function initRepo(dir, branch = "master") {
	fs.mkdirSync(dir, { recursive: true });
	git(dir, "init", "-b", branch);
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
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

function makeStore(cwd) {
	const dir = cwd || fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-pickup-"));
	tempDirs.push(dir);
	if (!cwd) initRepo(dir);
	const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	// Create while branch mode is off (no background provisioning race),
	// then flip it on and point the task at its branch like the engine does.
	const task = store.createTask("p1", { goal: "pickup test", projectCwd: dir });
	project.useBranches = true;
	task.branch = `kb/${task.id}`;
	return { store, dir, task };
}

function historyText(task) {
	return (task.history || []).map((h) => h.action || "").join(" | ");
}

function logText(task) {
	return (task.logEntries || []).map((e) => e.text || "").join("\n");
}

describe("review-diff preservation policy accessors", () => {
	it("preserves only when explicitly opted in (default off)", () => {
		expect(isReviewDiffPreserved(undefined)).toBe(false);
		expect(isReviewDiffPreserved({})).toBe(false);
		expect(isReviewDiffPreserved({ preserveReviewDiffAfterMerge: false })).toBe(
			false,
		);
		expect(isReviewDiffPreserved({ preserveReviewDiffAfterMerge: true })).toBe(
			true,
		);
	});

	it("resets the baseline on each merge unless explicitly disabled", () => {
		expect(shouldResetReviewBaseline(undefined)).toBe(true);
		expect(shouldResetReviewBaseline({})).toBe(true);
		expect(
			shouldResetReviewBaseline({ resetReviewBaselineOnMerge: true }),
		).toBe(true);
		expect(
			shouldResetReviewBaseline({ resetReviewBaselineOnMerge: false }),
		).toBe(false);
	});

	it("accepts only baselines with usable SHAs", () => {
		expect(isValidReviewBaseline(undefined)).toBe(false);
		expect(isValidReviewBaseline(null)).toBe(false);
		expect(isValidReviewBaseline("sha")).toBe(false);
		expect(isValidReviewBaseline({})).toBe(false);
		expect(
			isValidReviewBaseline({ baseSha: "a".repeat(40), headSha: "" }),
		).toBe(false);
		expect(
			isValidReviewBaseline({
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
			}),
		).toBe(true);
	});
});

describe("dirty-tree recovery mode resolution", () => {
	const storeFor = (project) => ({ projectStore: { getProject: () => project } });

	it("defaults to the recovery ladder", () => {
		expect(resolveDirtyTreeRecoveryMode(storeFor({}), "p1")).toBe("ladder");
		expect(
			resolveDirtyTreeRecoveryMode(storeFor({ workspaceIsolation: "quarantine" }), "p1"),
		).toBe("ladder");
		expect(
			resolveDirtyTreeRecoveryMode(storeFor({ dirtyTreeRecovery: "ladder" }), "p1"),
		).toBe("ladder");
	});

	it("goes strict when either opt-out flag is set", () => {
		expect(
			resolveDirtyTreeRecoveryMode(storeFor({ dirtyTreeRecovery: "off" }), "p1"),
		).toBe("off");
		expect(
			resolveDirtyTreeRecoveryMode(storeFor({ workspaceIsolation: "off" }), "p1"),
		).toBe("off");
	});

	it("degrades to the ladder when the project store throws or is absent", () => {
		const throwing = {
			projectStore: {
				getProject: () => {
					throw new Error("no store");
				},
			},
		};
		expect(resolveDirtyTreeRecoveryMode(throwing, "p1")).toBe("ladder");
		expect(resolveDirtyTreeRecoveryMode(undefined, "p1")).toBe("ladder");
	});
});

describe("ensureTaskBranch default-first pickup", () => {
	it("passes through the default branch when the tree sits on another task branch", async () => {
		const { store, dir, task } = makeStore();
		git(dir, "checkout", "-b", "kb/other-task");
		fs.writeFileSync(path.join(dir, "other.txt"), "other work\n");

		const outcome = await store.ensureTaskBranch(task, dir);

		expect(outcome.branch).toBe(task.branch);
		expect(await currentBranch(dir)).toBe(task.branch);
		// The task branch is new, so there is no hop record: it is created
		// from the default branch after the other branch's dirty work is
		// auto-committed in place.
		expect(historyText(task)).toContain(
			`Created and checked out task branch '${task.branch}' from 'master'`,
		);
		// The other branch's work was auto-committed there, not carried over.
		expect(git(dir, "show", "kb/other-task:other.txt").trim()).toBe("other work");
		// C4: the new branch is pinned to the default-branch tip — never to
		// the other task branch the tree was sitting on.
		const masterTip = git(dir, "rev-parse", "master").trim();
		const otherTip = git(dir, "rev-parse", "kb/other-task").trim();
		expect(git(dir, "rev-parse", task.branch).trim()).toBe(masterTip);
		expect(masterTip).not.toBe(otherTip);
	});

	it("switches straight from the default branch without a redundant hop", async () => {
		const { store, dir, task } = makeStore();
		expect(await currentBranch(dir)).toBe("master");

		await store.ensureTaskBranch(task, dir);

		expect(await currentBranch(dir)).toBe(task.branch);
		expect(historyText(task)).not.toContain("before picking up");
		expect(historyText(task)).toContain(`Created and checked out task branch '${task.branch}'`);
	});

	it("is a no-op when already on the task branch", async () => {
		const { store, dir, task } = makeStore();
		await store.ensureTaskBranch(task, dir);
		const historyBefore = historyText(task);

		const outcome = await store.ensureTaskBranch(task, dir);

		expect(outcome.switched).toBe(false);
		expect(await currentBranch(dir)).toBe(task.branch);
		expect(historyText(task)).toBe(historyBefore);
	});

	it("warns loudly when the main sync refuses to reset an ahead ref", async () => {
		const { store, dir, task } = makeStore();
		const parent = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ahead-remote-"));
		tempDirs.push(parent);
		git(parent, "init", "--bare", "origin.git");
		const remoteDir = path.join(parent, "origin.git");
		git(dir, "remote", "add", "origin", remoteDir);
		git(dir, "push", "-u", "origin", "master:master");
		fs.writeFileSync(path.join(dir, "ahead.txt"), "unpushed\n");
		git(dir, "add", "-A");
		git(dir, "commit", "-m", "ahead commit");
		const before = git(dir, "rev-parse", "master").trim();

		const res = await syncMainToRemoteBestEffort(store, task, dir, null, "test");

		expect(res.skipped).toBe("local-ahead");
		// The ref is untouched and the skip is loud in the process log.
		expect(git(dir, "rev-parse", "master").trim()).toBe(before);
		expect(JSON.stringify(task.logEntries)).toContain("local-ahead");
	});

	it("merges remote advances into the task branch on pickup (never works stale)", async () => {
		const { store, dir, task } = makeStore();
		const parent = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-pickup-remote-"));
		tempDirs.push(parent);
		git(parent, "init", "--bare", "origin.git");
		const remoteDir = path.join(parent, "origin.git");
		git(dir, "remote", "add", "origin", remoteDir);

		await store.ensureTaskBranch(task, dir);
		git(dir, "push", "-u", "origin", task.branch);

		// A second writer advances the remote out of band (restart,
		// operator push, sibling checkout).
		const other = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-pickup-other-"));
		tempDirs.push(other);
		git(parent, "clone", remoteDir, other);
		git(other, "config", "user.email", "kainbain-test@example.com");
		git(other, "config", "user.name", "KainBain Test");
		git(other, "checkout", task.branch);
		fs.writeFileSync(path.join(other, "remote-work.txt"), "remote work\n");
		git(other, "add", "-A");
		git(other, "commit", "-m", "remote advance");
		git(other, "push", "origin", task.branch);
		const remoteTip = git(other, "rev-parse", "HEAD").trim();

		await store.ensureTaskBranch(task, dir);

		expect(git(dir, "rev-parse", task.branch).trim()).toBe(remoteTip);
		expect(historyText(task)).toContain(`Synced task branch '${task.branch}'`);
	});

	it("still provisions on an unborn repo with no default branch to hop through", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-pickup-unborn-"));
		tempDirs.push(dir);
		git(dir, "init", "-b", "master");
		git(dir, "config", "user.email", "kainbain-test@example.com");
		git(dir, "config", "user.name", "KainBain Test");
		const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
		const store = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => project },
		});
		const task = store.createTask("p1", { goal: "unborn", projectCwd: dir });
		project.useBranches = true;
		task.branch = `kb/${task.id}`;

		const outcome = await store.ensureTaskBranch(task, dir);

		expect(outcome.branch).toBe(task.branch);
		expect(git(dir, "symbolic-ref", "HEAD").trim()).toBe(`refs/heads/${task.branch}`);
	});
});

describe("ensureTaskBranchRef human-review policy", () => {
	it("creates the missing ref from the default tip without checkout or commit", async () => {
		const { store, dir, task } = makeStore();
		fs.writeFileSync(path.join(dir, "live-work.txt"), "operator live work\n");
		const statusBefore = git(dir, "status", "--porcelain");
		const masterTip = git(dir, "rev-parse", "master").trim();

		const outcome = await store.ensureTaskBranchRef(task, dir, {
			stageName: "Review",
		});

		expect(outcome.created).toBe(true);
		expect(outcome.existed).toBe(false);
		expect(outcome.deferred).toBeNull();
		expect(outcome.switched).toBe(false);
		expect(outcome.checkedOut).toBe(false);
		expect(outcome.branch).toBe(task.branch);
		expect(await currentBranch(dir)).toBe("master");
		expect(git(dir, "status", "--porcelain")).toBe(statusBefore);
		expect(git(dir, "rev-parse", task.branch).trim()).toBe(masterTip);
		expect(historyText(task)).toContain(
			`Created task-branch ref '${task.branch}' from 'master' without checkout`,
		);
		expect(logText(task)).toContain("without checkout");
		// live-work.txt plus the engine's own task markdown are left behind.
		expect(logText(task)).toMatch(/leaving \d+ uncommitted paths?/);
	});

	it("is a no-op when the ref already exists", async () => {
		const { store, dir, task } = makeStore();
		git(dir, "branch", task.branch, "master");
		const statusBefore = git(dir, "status", "--porcelain");

		const outcome = await store.ensureTaskBranchRef(task, dir, {
			stageName: "Review",
		});

		expect(outcome.created).toBe(false);
		expect(outcome.existed).toBe(true);
		expect(outcome.deferred).toBeNull();
		expect(await currentBranch(dir)).toBe("master");
		expect(git(dir, "status", "--porcelain")).toBe(statusBefore);
		expect(historyText(task)).toContain("already exists — no checkout performed");
	});

	it("stays on another branch with a dirty tree (never hits the clean-tree guard)", async () => {
		const { store, dir, task } = makeStore();
		git(dir, "branch", "kb/other", "master");
		git(dir, "checkout", "-q", "kb/other");
		fs.writeFileSync(path.join(dir, "other.txt"), "other work\n");
		// Stage only the operator file: the engine's docs/ must stay untracked
		// so task-markdown writes cannot move `git status` under the test.
		git(dir, "add", "other.txt");
		git(dir, "commit", "-qm", "other work");
		fs.appendFileSync(path.join(dir, "README.md"), "operator edit\n");
		const statusBefore = git(dir, "status", "--porcelain");
		const masterTip = git(dir, "rev-parse", "master").trim();

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(true);
		expect(await currentBranch(dir)).toBe("kb/other");
		expect(git(dir, "status", "--porcelain")).toBe(statusBefore);
		// Created from the default tip, not from the branch the tree sits on.
		expect(git(dir, "rev-parse", task.branch).trim()).toBe(masterTip);
	});

	it("falls back to HEAD when no default branch resolves", async () => {
		const { store, dir, task } = makeStore();
		// No main/master ref and a detached HEAD: defaultBranch can only
		// return its unresolvable 'main' fallback, forcing the HEAD path.
		git(dir, "branch", "-m", "master", "trunk");
		git(dir, "checkout", "-q", "--detach", "HEAD");
		const headSha = git(dir, "rev-parse", "HEAD").trim();

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(true);
		expect(outcome.startPoint).toBe("HEAD");
		expect(git(dir, "rev-parse", task.branch).trim()).toBe(headSha);
	});

	it("derives and persists task.branch when it is missing", async () => {
		const { store, dir, task } = makeStore();
		delete task.branch;

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.branch).toBe(`kb/${task.id}`);
		expect(task.branch).toBe(`kb/${task.id}`);
	});

	it("defers without throwing on an unborn repo", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ref-unborn-"));
		tempDirs.push(dir);
		git(dir, "init", "-b", "master");
		git(dir, "config", "user.email", "kainbain-test@example.com");
		git(dir, "config", "user.name", "KainBain Test");
		const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
		const store = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => project },
		});
		const task = store.createTask("p1", { goal: "unborn", projectCwd: dir });
		task.branch = `kb/${task.id}`;
		const symrefBefore = git(dir, "symbolic-ref", "HEAD").trim();

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(false);
		expect(outcome.deferred).toContain("no commits");
		expect(task.branchProvisionError).toContain("no commits");
		expect(logText(task)).toContain("provisioning deferred");
		expect(git(dir, "symbolic-ref", "HEAD").trim()).toBe(symrefBefore);
	});

	it("defers without throwing outside a git repository", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ref-plain-"));
		tempDirs.push(dir);
		const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
		const store = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => project },
		});
		const task = store.createTask("p1", { goal: "plain", projectCwd: dir });
		task.branch = `kb/${task.id}`;

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(false);
		expect(outcome.deferred).toBe("not a git repository");
	});

	it("defers without throwing on an invalid branch name", async () => {
		const { store, dir, task } = makeStore();
		task.branch = "--evil";

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(false);
		expect(outcome.deferred).toContain("invalid task-branch name");
	});

	it("returns null when the task is missing or the cwd cannot be resolved", async () => {
		const { store, dir } = makeStore();
		expect(await store.ensureTaskBranchRef(null, dir)).toBeNull();
		const orphan = new TaskStore({ eventBridge: {} });
		const task = { id: "t1", projectId: "missing", history: [] };
		expect(await orphan.ensureTaskBranchRef(task, undefined)).toBeNull();
	});

	it("clears a stale branchProvisionError once the ref is created", async () => {
		const { store, dir, task } = makeStore();
		task.branchProvisionError = "repository has no commits yet";

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.created).toBe(true);
		expect(outcome.deferred).toBeNull();
		expect(task.branchProvisionError).toBeUndefined();
	});

	it("clears a stale branchProvisionError when the ref already exists", async () => {
		const { store, dir, task } = makeStore();
		git(dir, "branch", task.branch, "master");
		task.branchProvisionError = "not a git repository";

		const outcome = await store.ensureTaskBranchRef(task, dir);

		expect(outcome.existed).toBe(true);
		expect(outcome.deferred).toBeNull();
		expect(task.branchProvisionError).toBeUndefined();
	});
});
