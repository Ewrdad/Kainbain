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
	it("converges a behind checkout to the remote tip", async () => {
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "file.txt", "two\n", "two");
		git(dir, "push", "origin", "main");
		git(dir, "reset", "--hard", "HEAD~1");
		const before = git(dir, "rev-parse", "main");
		const tip = git(dir, "rev-parse", "origin/main");
		expect(before).not.toBe(tip);

		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.synced).toBe(true);
		expect(res.mainBranch).toBe("main");
		expect(git(dir, "rev-parse", "main")).toBe(tip);
		expect(git(dir, "rev-parse", "HEAD")).toBe(tip);
	});

	it("checks out the integration branch when the tree sits elsewhere", async () => {
		const { dir } = initSyncedRepoPair();
		git(dir, "checkout", "-b", "kb/other");
		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.skipped ?? null).not.toBe("checkout-refused");
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
		expect(git(dir, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "origin/main"));
	});

	it("discards tracked dirt on the tip loudly instead of shipping it", async () => {
		// Same contract as the pickup/merge/finalize syncs: the remote is
		// authoritative, prior state stays in the reflog, and the discard
		// is journaled — the deploy then builds the pure tip.
		const { dir } = initSyncedRepoPair();
		fs.writeFileSync(path.join(dir, "file.txt"), "operator edits\n");
		const task = deployTask();
		const store = fakeStore(task);
		const res = await syncDeploySourceToTip(store, task, dir);

		expect(res.synced).toBe(true);
		expect(git(dir, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "origin/main"));
		expect(fs.readFileSync(path.join(dir, "file.txt"), "utf8")).toBe("one\n");
		expect(
			task.history.some((h) => String(h.action).includes("discarded")),
		).toBe(true);
	});

	it("stashes tracked dirt before hopping branches (work preserved, tip deployed)", async () => {
		// The dirty-tree recovery ladder stashes tracked modifications
		// instead of refusing: the deploy builds the tip and the work
		// survives in the stash.
		const { dir } = initSyncedRepoPair();
		git(dir, "checkout", "-b", "kb/other");
		fs.writeFileSync(path.join(dir, "file.txt"), "operator edits\n");
		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.skipped ?? null).not.toBe("checkout-refused");
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
		expect(git(dir, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "origin/main"));
		expect(git(dir, "stash", "list")).toContain("kainbain-task-auto");
	});

	it("refuses when untracked files block the hop (work untouched, tip guard parks)", async () => {
		// An untracked file that the tip tracks with different content
		// cannot be stashed or set aside: the checkout is refused, the
		// source stays put, and deploy.sh's tip guard parks loudly.
		// Setup: kb/other stops tracking conflict.txt, then an untracked
		// file of the same name appears — hopping to main (which tracks it)
		// would overwrite it, so git refuses.
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "conflict.txt", "main side\n", "conflict");
		git(dir, "push", "origin", "main");
		git(dir, "checkout", "-b", "kb/other");
		git(dir, "rm", "-q", "conflict.txt");
		git(
			dir,
			"-c",
			"user.email=stage-entry@test",
			"-c",
			"user.name=stage-entry",
			"commit",
			"-qm",
			"untrack conflict",
		);
		fs.writeFileSync(path.join(dir, "conflict.txt"), "branch side\n");
		const task = deployTask();
		const res = await syncDeploySourceToTip(fakeStore(task), task, dir);

		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("checkout-refused");
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("kb/other");
		expect(fs.readFileSync(path.join(dir, "conflict.txt"), "utf8")).toBe("branch side\n");
	});

	it("is a quiet no-op when already in sync", async () => {
		const { dir } = initSyncedRepoPair();
		const task = deployTask();
		const store = fakeStore(task);
		const res = await syncDeploySourceToTip(store, task, dir);

		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("already-in-sync");
		expect(store._recordHistory).not.toHaveBeenCalled();
	});

	it("never throws: no cwd, non-repo dir, and missing remote all skip", async () => {
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
		const { dir } = initSyncedRepoPair();
		git(dir, "remote", "remove", "origin");
		const res = await syncDeploySourceToTip(store, task, dir);
		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("no-remote");
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

	it("mints attempt env and converges the source before marking entry", async () => {
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "file.txt", "two\n", "two");
		git(dir, "push", "origin", "main");
		git(dir, "reset", "--hard", "HEAD~1");

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
		// The source now matches the landed tip: the deploy builds this.
		expect(git(dir, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "origin/main"));
	});

	it("still mints env when the sync refuses (deploy.sh tip guard then parks)", async () => {
		// Untracked files blocking the hop: the checkout is refused, the
		// source stays put, but entry markers are still stamped — the tip
		// guard in deploy.sh parks loudly instead of shipping the wrong tree.
		const { dir } = initSyncedRepoPair();
		commitFile(dir, "conflict.txt", "main side\n", "conflict");
		git(dir, "push", "origin", "main");
		git(dir, "checkout", "-b", "kb/other");
		git(dir, "rm", "-q", "conflict.txt");
		git(
			dir,
			"-c",
			"user.email=stage-entry@test",
			"-c",
			"user.name=stage-entry",
			"commit",
			"-qm",
			"untrack conflict",
		);
		fs.writeFileSync(path.join(dir, "conflict.txt"), "branch side\n");
		const task = deployTask();
		const store = fakeStore(task);
		const out = await recordContinuityStageEntry(store, {
			projectId: "p-1",
			taskId: "t-1",
			stage: DEPLOY_STAGE,
			cwd: dir,
		});

		expect(out?.env?.KAINBAIN_DEPLOY_ATTEMPT_ID).toBeTruthy();
		expect(task.deployAttemptId).toBeTruthy();
		expect(git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("kb/other");
	});
});
