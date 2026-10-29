import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareIntegrationAttempt } from "./runnerRoutes.js";
import { applyIntegrationReport } from "./execution/applyIntegrationReport.js";

function git(cwd, args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function originWithTask() {
	const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intd-origin-"));
	execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
	const backend = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intd-backend-"));
	execFileSync("git", ["clone", "-q", origin, backend], { stdio: "ignore" });
	const work = fs.mkdtempSync(path.join(os.tmpdir(), "kb-intd-work-"));
	execFileSync("git", ["clone", "-q", origin, work], { stdio: "ignore" });
	for (const dir of [backend, work]) {
		execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
	}
	fs.writeFileSync(path.join(work, "base.txt"), "base");
	execFileSync("git", ["add", "."], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "init"], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["branch", "-M", "main"], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["push", "-q", "origin", "main"], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["checkout", "-qb", "kb/t1"], { cwd: work, stdio: "ignore" });
	fs.writeFileSync(path.join(work, "task.txt"), "work");
	execFileSync("git", ["add", "."], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "work"], { cwd: work, stdio: "ignore" });
	execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: work, stdio: "ignore" });
	return { origin, backend, work };
}

const storesFor = (backend, task) => {
	const updated = {};
	const taskStore = {
		resolveTaskBranch: (t) => t.branch || `kb/${t.id}`,
		updateTask: (projectId, taskId, updates) => {
			Object.assign(updated, updates);
			Object.assign(task, updates);
		},
		getTask: () => task,
		saveStageReport: () => {},
		_saveTaskMarkdown: () => {},
		advanceStage: () => {},
		handleStageFailure: (...args) => ({ parked: true, args }),
		_isBranchModeEnabled: () => true,
		eventBridge: null,
	};
	const projectStore = { getProject: () => ({ id: "p1", cwd: backend }) };
	return { taskStore, projectStore, updated };
};

describe("prepareIntegrationAttempt", () => {
	it("reads remote SHAs and pins a stable mergeAttemptId", async () => {
		const { origin, backend, work } = originWithTask();
		try {
			const task = { id: "t1", branch: "kb/t1" };
			const { taskStore, projectStore } = storesFor(backend, task);
			const first = await prepareIntegrationAttempt({ taskStore, projectStore, projectId: "p1", task });
			expect(first.targetBranch).toBe("main");
			expect(first.taskBranch).toBe("kb/t1");
			expect(first.expectedTargetSha).toBe(git(work, ["rev-parse", "main"]));
			expect(first.expectedTaskSha).toBe(git(work, ["rev-parse", "kb/t1"]));
			expect(task.mergeAttemptId).toBe(first.mergeAttemptId);
			const second = await prepareIntegrationAttempt({ taskStore, projectStore, projectId: "p1", task });
			expect(second.mergeAttemptId).toBe(first.mergeAttemptId);
		} finally {
			for (const d of [origin, backend, work]) fs.rmSync(d, { recursive: true, force: true });
		}
	});

	it("rotates the attempt id after a failed attempt and refuses unpushed task work", async () => {
		const { origin, backend, work } = originWithTask();
		try {
			const task = { id: "t1", branch: "kb/t1", mergeAttemptId: "merge-old", lastError: { message: "boom", stageId: "merge-1" } };
			const { taskStore, projectStore } = storesFor(backend, task);
			const out = await prepareIntegrationAttempt({ taskStore, projectStore, projectId: "p1", task });
			expect(out.mergeAttemptId).not.toBe("merge-old");
			// Unpushed task branch: the origin ref does not exist.
			execFileSync("git", ["push", "-q", "origin", ":kb/t1"], { cwd: work, stdio: "ignore" });
			const fresh = { id: "t1", branch: "kb/t1" };
			const s2 = storesFor(backend, fresh);
			await expect(
				prepareIntegrationAttempt({ taskStore: s2.taskStore, projectStore: s2.projectStore, projectId: "p1", task: fresh }),
			).rejects.toMatchObject({ code: "INTEGRATION_UNPREPARED" });
		} finally {
			for (const d of [origin, backend, work]) fs.rmSync(d, { recursive: true, force: true });
		}
	});
});

describe("applyIntegrationReport", () => {
	const MERGE_STAGE = { id: "merge-1", name: "Merge", type: "merge" };

	it("verifies ancestry, freezes the baseline, and advances", async () => {
		const { origin, backend, work } = originWithTask();
		try {
			const preMergeMain = git(work, ["rev-parse", "main"]);
			const taskTip = git(work, ["rev-parse", "kb/t1"]);
			// Runner-run merge on the work side, CAS-pushed to the origin.
			execFileSync("git", ["checkout", "-q", "main"], { cwd: work, stdio: "ignore" });
			execFileSync("git", ["merge", "-q", "--no-edit", "kb/t1"], { cwd: work, stdio: "ignore" });
			const mergeSha = git(work, ["rev-parse", "HEAD"]);
			execFileSync("git", ["push", "-q", "origin", `${mergeSha}:main`], { cwd: work, stdio: "ignore" });
			const task = { id: "t1", branch: "kb/t1", status: "in_stage", currentStageId: "merge-1", history: [], reviewBaseline: null };
			const { taskStore, projectStore } = storesFor(backend, task);
			let advanced = false;
			taskStore.advanceStage = () => {
				advanced = true;
			};
			const out = await applyIntegrationReport({
				store: taskStore,
				projectStore,
				projectId: "p1",
				taskId: "t1",
				stage: MERGE_STAGE,
				stages: [MERGE_STAGE],
				integration: {
					outcome: "landed", mergeSha, taskBranch: "kb/t1",
					expectedTaskSha: taskTip, targetBranch: "main",
					expectedTargetSha: preMergeMain, mergeAttemptId: "merge-t1-1",
				},
				runnerId: "r1",
			});
			expect(out.advanced).toBe(true);
			expect(out.mergeSha).toBe(mergeSha);
			expect(advanced).toBe(true);
			expect(task.reviewBaseline).toMatchObject({
				baseSha: preMergeMain,
				headSha: taskTip,
				mainSha: mergeSha,
				stageId: "merge-1",
			});
			expect(task.pendingPushVerification).toMatchObject({ sha: mergeSha, verified: true });
		} finally {
			for (const d of [origin, backend, work]) fs.rmSync(d, { recursive: true, force: true });
		}
	});

	it("parks with skipFailback when the merge is not on the remote", async () => {
		const { origin, backend, work } = originWithTask();
		try {
			const task = { id: "t1", branch: "kb/t1", status: "in_stage", currentStageId: "merge-1", history: [], reviewBaseline: null };
			const { taskStore, projectStore } = storesFor(backend, task);
			let parked = null;
			taskStore.handleStageFailure = (projectId, taskId, stage, err, opts) => {
				parked = { err, opts };
				return { parked: true };
			};
			const out = await applyIntegrationReport({
				store: taskStore,
				projectStore,
				projectId: "p1",
				taskId: "t1",
				stage: MERGE_STAGE,
				stages: [MERGE_STAGE],
				integration: {
					outcome: "landed", mergeSha: "f".repeat(40), taskBranch: "kb/t1",
					expectedTaskSha: git(work, ["rev-parse", "kb/t1"]), targetBranch: "main",
					expectedTargetSha: git(work, ["rev-parse", "main"]), mergeAttemptId: "merge-t1-9",
				},
				runnerId: "r1",
			});
			expect(out.parked).toBe(true);
			expect(parked.opts.skipFailback).toBe(true);
			expect(parked.err.gitDiagnostics.kind).toBe("sync-blocked");
		} finally {
			for (const d of [origin, backend, work]) fs.rmSync(d, { recursive: true, force: true });
		}
	});
});
