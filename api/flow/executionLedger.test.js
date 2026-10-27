import { expect, test, describe, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaimStore } from "./claimStore.js";
import { ExecutionLedger, MAX_RUNNER_INTERRUPTS } from "./executionLedger.js";
const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");



/***
 * MARK: ExecutionLedger Unit Tests
 * @description Verifies the wire receiving side: lease-first fencing on
 *   every call, per-execution progress dedupe, sequenced log ingest with
 *   gap markers, idempotent completion with SHA presence states,
 *   reconciler divergence counting, and interruption.
 ***/

function stores() {
	const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
	const task = {
		id: "t1",
		status: "in_stage",
		currentStageId: "s1",
		history: [],
	};
	const taskStore = {
		getTask: () => task,
	};
	const projectStore = { getProject: () => ({ cwd: null }) };
	return { claimStore, taskStore, projectStore, task: { ref: task } };
}

function claimed(ctx, runnerId = "r1") {
	const { executionId, epoch } = ctx.claimStore.claim("t1", runnerId);
	return { executionId, epoch };
}

function gitRepoWithCommit() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-ledger-"));
	execSync("git init -q . && git config user.email t@t.t && git config user.name t", { cwd: dir });
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	execSync("git add . && git commit -qm init", { cwd: dir });
	const sha = execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
	return { dir, sha };
}

describe("ExecutionLedger", () => {
	let ctx;
	let ledger;
	beforeEach(() => {
		ctx = stores();
		ledger = new ExecutionLedger();
	});

	test("records progress once; retried reports are no-ops", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
			event: "started",
		};
		expect(ledger.recordProgress(base)).toEqual({ recorded: true, duplicate: false });
		expect(ledger.recordProgress(base)).toEqual({ recorded: true, duplicate: true });
		expect(ledger.snapshot().progressRecorded).toBe(1);
		expect(ledger.snapshot().progressDuplicates).toBe(1);
		expect(ctx.taskStore.getTask().history).toHaveLength(1);
		expect(ledger.stageFor(executionId)).toBe("s1");
		expect(ledger.stageFor("unknown-exec")).toBeNull();
	});

	test("stores the reported stage prompt and drops it on completion", async () => {
		const ctx = stores();
		const ledger = new ExecutionLedger();
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
		};
		expect(ledger.promptFor(executionId)).toBeNull();
		ledger.recordProgress({ ...base, event: "started" });
		expect(ledger.promptFor(executionId)).toBeNull();
		expect(ledger.servingFor(executionId)).toBeNull();
		ledger.recordProgress({
			...base,
			event: "prompted",
			prompt: "# Do the thing",
			harness: "pi",
			model: "muse-spark",
		});
		expect(ledger.promptFor(executionId)).toBe("# Do the thing");
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: "muse-spark" });
		const { dir, sha } = gitRepoWithCommit();
		await ledger.completeExecution({
			...base,
			projectStore: { getProject: () => ({ cwd: dir }) },
			sha,
			branch: "kb/t1",
			posture: "T1:pi:model",
			outcome: { status: "passed" },
		});
		expect(ledger.promptFor(executionId)).toBeNull();
		expect(ledger.servingFor(executionId)).toBeNull();
	});

	test("rejects progress on a stale epoch before touching state", () => {
		claimed(ctx);
		try {
			ledger.recordProgress({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: "wrong",
				epoch: 99,
				stageId: "s1",
				event: "started",
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("STALE_EPOCH");
		}
		expect(ledger.snapshot().staleRejected).toBe(1);
		expect(ctx.taskStore.getTask().history).toHaveLength(0);
	});

	test("ingests ordered frames, dedupes retries, marks gaps", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		expect(ledger.ingestLogs({ ...base, seq: 0, bytes: "hello" })).toMatchObject({ accepted: true, duplicate: false });
		expect(ledger.ingestLogs({ ...base, seq: 0, bytes: "hello" })).toMatchObject({ accepted: true, duplicate: true });
		expect(ledger.ingestLogs({ ...base, seq: 3, bytes: "late" })).toMatchObject({ accepted: true, duplicate: false });
		const snap = ledger.snapshot();
		expect(snap.logFrames).toBe(2);
		expect(snap.logGaps).toBe(1);
		expect(snap.logDuplicates).toBe(1);
	});

	test("completes once, releases the lease, stays idempotent", async () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: ctx.projectStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		const first = await ledger.completeExecution(base);
		expect(first).toMatchObject({ accepted: true, duplicate: false });
		expect(ctx.claimStore.describe("t1")).toBeNull();
		const second = await ledger.completeExecution(base);
		expect(second).toEqual({ accepted: true, duplicate: true });
		expect(ledger.snapshot().completions).toBe(1);
		expect(ledger.snapshot().completionDuplicates).toBe(1);
	});

	test("completing with a superseded epoch is stale", async () => {
		const first = claimed(ctx, "r1");
		ctx.claimStore.invalidate("t1");
		claimed(ctx, "r2");
		try {
			await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: ctx.projectStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: first.executionId,
				epoch: first.epoch,
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("STALE_EPOCH");
		}
	});

	test("verifies SHA presence in the backend-visible repo", async () => {
		const { dir, sha } = gitRepoWithCommit();
		try {
			const local = {
				getProject: () => ({ cwd: dir, hasUpstreamRepo: false }),
			};
			const { executionId, epoch } = claimed(ctx);
			const ok = await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: local,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
				epoch,
				sha,
				branch: "kb/t1",
			});
			expect(ok.shaState).toBe("present");

			ctx.claimStore.invalidate("t1");
			const next = ctx.claimStore.claim("t1", "r1");
			const bad = await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: local,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: next.executionId,
				epoch: next.epoch,
				sha: "0123456789abcdef0123456789abcdef01234567",
			});
			expect(bad.shaState).toBe("unverifiable");
			expect(ledger.snapshot().unverifiedSha).toBe(1);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("counts divergence when the task moved past the reported stage", async () => {
		const { executionId, epoch } = claimed(ctx);
		ledger.recordProgress({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
			event: "finished",
		});
		ctx.taskStore.getTask().currentStageId = "s2";
		const out = await ledger.completeExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: ctx.projectStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		});
		expect(out.accepted).toBe(true);
		expect(ledger.snapshot().divergences).toBe(1);
	});

	test("interrupts: drops the lease and parks the task", () => {
		const { executionId } = claimed(ctx);
		const out = ledger.interruptExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
		});
		expect(out).toEqual({ interrupted: true, interruptCount: 1, escalated: false });
		expect(ctx.taskStore.getTask().status).toBe("interrupted");
		expect(ctx.claimStore.describe("t1")).toBeNull();
		expect(ledger.snapshot().interrupts).toBe(1);
	});

	test("interrupts: escalates past the consecutive bound on the same stage", () => {
		const interruptOnce = () => {
			const { executionId } = claimed(ctx);
			return ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
			});
		};
		let out;
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS - 1; i++) {
			out = interruptOnce();
			expect(out.escalated).toBe(false);
		}
		out = interruptOnce();
		expect(out).toEqual({
			interrupted: true,
			interruptCount: MAX_RUNNER_INTERRUPTS,
			escalated: true,
		});
		expect(ledger.snapshot().interruptEscalations).toBe(1);
		expect(
			ctx.taskStore
				.getTask()
				.history.some((h) => String(h.action).includes("escalated")),
		).toBe(true);
		// The task still re-queues as interrupted — escalation is
		// visibility, not a lifecycle change.
		expect(ctx.taskStore.getTask().status).toBe("interrupted");
	});

	test("interrupts: a stage change restarts the consecutive count", () => {
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS - 1; i++) {
			const { executionId } = claimed(ctx);
			ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
			});
		}
		ctx.taskStore.getTask().currentStageId = "s2";
		const { executionId } = claimed(ctx);
		const out = ledger.interruptExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
		});
		expect(out).toEqual({ interrupted: true, interruptCount: 1, escalated: false });
		expect(ledger.snapshot().interruptEscalations).toBe(0);
	});

	test("interrupt refuses terminal tasks", () => {
		claimed(ctx);
		ctx.taskStore.getTask().status = "complete";
		try {
			ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("NOTHING_TO_INTERRUPT");
		}
	});
});
