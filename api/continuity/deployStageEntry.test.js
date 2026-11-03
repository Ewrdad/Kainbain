/* eslint-disable security/detect-non-literal-fs-filename -- temp dirs and fixed repo-relative paths under test */
import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	recordContinuityStageEntry,
	syncDeploySourceToTip,
} from "./deployReconcile.js";

/**
 * MARK: Deploy stage-entry pre-deploy sync tests
 * @description The entry hook converges the deploy source checkout to the
 *   integration tip before the deploy builds it (Runner merges land on the
 *   remote, never in this checkout). Uses real throwaway git repos; skips
 *   entirely when git is unavailable.
 * @example run `npm run test --prefix api -- deployStageEntry`
 */

function hasGit() {
	try {
		const probe = spawnSync("git", ["--version"], { stdio: "ignore" });
		return !probe.error;
	} catch {
		return false;
	}
}

const describeIfGit = hasGit() ? describe : describe.skip;

function git(cwd, ...args) {
	const probe = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
	if (probe.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${probe.stderr}`);
	}
	return probe.stdout.trim();
}

function commitFile(cwd, name, content, message) {
	fs.writeFileSync(path.join(cwd, name), content);
	git(cwd, "add", name);
	git(
		cwd,
		"-c",
		"user.email=stage-entry@test",
		"-c",
		"user.name=stage-entry",
		"commit",
		"-m",
		message,
	);
}

/**
 * Builds a repo pair: a working checkout backed by a bare `origin`, both on
 * `main`, pushed and in sync.
 */
function initSyncedRepoPair() {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-stage-entry-"));
	const remote = path.join(base, "origin.git");
	const dir = path.join(base, "work");
	const nocwd = (args) => {
		const probe = spawnSync("git", args, { encoding: "utf8" });
		if (probe.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${probe.stderr}`);
		}
		return probe.stdout.trim();
	};
	nocwd(["init", "--bare", remote]);
	nocwd(["init", "-b", "main", dir]);
	git(dir, "config", "user.email", "stage-entry@test");
	git(dir, "config", "user.name", "stage-entry");
	commitFile(dir, "file.txt", "one\n", "one");
	git(dir, "remote", "add", "origin", remote);
	git(dir, "push", "-u", "origin", "main");
	return { base, dir, remote };
}

function fakeStore(task) {
	return {
		getTask: vi.fn(() => task),
		updateTask: vi.fn((pid, tid, patch) => Object.assign(task, patch)),
		deployManager: {},
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
	};
}

function deployTask() {
	return { id: "t-1", projectId: "p-1", status: "in_stage", currentStageId: "s-d", history: [] };
}

const DEPLOY_STAGE = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };

describeIfGit("syncDeploySourceToTip (real git repos)", () => {
	// Asymmetric contract: tasks, merges, and deploys move independently.
	// The primary checkout belongs to whichever task sits on it (usually a
	// kb/* branch with WIP); the deploy source does NOT. Stage entry must
	// never switch, reset, stash, or discard the primary — deploy.sh
	// materializes origin/<default> in its own tip worktree instead.
	it("leaves a behind primary checkout exactly where it is", async () => {
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "file.txt", "two\n", "two");
		git(dir, "push", "origin", "main");
		git(dir, "reset", "--hard", "HEAD~1");
		const before = git(dir, "rev-parse", "HEAD");

		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("primary-untouched");
		expect(res.mainBranch).toBe("main");
		expect(git(dir, "rev-parse", "HEAD")).toBe(before);
	});

	it("does not hop branches when the primary sits on a task branch", async () => {
		const { dir } = initSyncedRepoPair();
		git(dir, "checkout", "-b", "kb/other");
		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.skipped).toBe("primary-untouched");
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("kb/other");
	});

	it("preserves tracked dirt and creates no stash", async () => {
		const { dir } = initSyncedRepoPair();
		git(dir, "checkout", "-b", "kb/other");
		fs.writeFileSync(path.join(dir, "file.txt"), "operator edits\n");
		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.skipped).toBe("primary-untouched");
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("kb/other");
		expect(fs.readFileSync(path.join(dir, "file.txt"), "utf8")).toBe("operator edits\n");
		expect(git(dir, "stash", "list")).toBe("");
	});

	it("never throws: no cwd and non-repo dir skip", async () => {
		const task = deployTask();
		const store = fakeStore(task);
		await expect(syncDeploySourceToTip(store, task, "")).resolves.toMatchObject({
			synced: false,
			skipped: "no-cwd",
		});
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-stage-entry-plain-"));
		await expect(syncDeploySourceToTip(store, task, plain)).resolves.toMatchObject({
			synced: false,
		});
	});
});

describeIfGit("recordContinuityStageEntry pre-deploy sync wiring", () => {
	it("returns null for non-deploy stages (no sync, no markers)", async () => {
		const task = deployTask();
		const store = fakeStore(task);
		const out = await recordContinuityStageEntry(store, {
			projectId: "p-1",
			taskId: "t-1",
			stage: { id: "s-1", name: "Build", type: "agent" },
			cwd: "/nonexistent",
		});
		expect(out).toBeNull();
		expect(store.updateTask).not.toHaveBeenCalled();
	});

	it("mints attempt env without moving the primary checkout", async () => {
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "file.txt", "two\n", "two");
		git(dir, "push", "origin", "main");
		git(dir, "reset", "--hard", "HEAD~1");
		const before = git(dir, "rev-parse", "HEAD");

		const task = deployTask();
		const store = fakeStore(task);
		const out = await recordContinuityStageEntry(store, {
			projectId: "p-1",
			taskId: "t-1",
			stage: DEPLOY_STAGE,
			cwd: dir,
		});

		expect(out?.env?.KAINBAIN_DEPLOY_ATTEMPT_ID).toMatch(/^deploy-t-1-/);
		expect(out?.env?.KAINBAIN_DEPLOY_OPERATION_KEY).toMatch(/^merge-deploy:/);
		expect(task.deployAttemptId).toBe(out.env.KAINBAIN_DEPLOY_ATTEMPT_ID);
		expect(task.deployOperationKey).toBe(out.env.KAINBAIN_DEPLOY_OPERATION_KEY);
		// deploy.sh builds origin/main from its tip worktree; this checkout
		// (behind, possibly mid-task) is not the deploy source any more.
		expect(git(dir, "rev-parse", "HEAD")).toBe(before);
	});
});
