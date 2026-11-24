import { expect, test, describe, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaimStore } from "./claimStore.js";
import {
	ExecutionLedger,
	MAX_RUNNER_INTERRUPTS,
	MAX_CAPACITY_REFUSALS_BEFORE_NOTE,
} from "./executionLedger.js";
import { isAutoResumableWithReason } from "./scheduler/isAutoResumableWithReason.js";

const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");

const CAP_REASON = "Runner workdir unavailable: Worktree cap reached (~5)";

/***
 * MARK: capacity-refusal interrupts never count as runner deaths
 * @description Task 3b82f6ae (S1): a WORKTREE_CAP_REACHED refusal arrives
 *   as an interrupt whose reason starts with "Runner workdir
 *   unavailable:". Those must NOT increment `runnerInterruptCount`, must
 *   never escalate, and must never park the task as `runner-death-loop`;
 *   they land on a separate visibility-only `capacityRefusalCount`. True
 *   bare/crash streaks still escalate and park at MAX_RUNNER_INTERRUPTS.
 ***/

function stores() {
	const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
	const task = {
		id: "t1",
		status: "in_stage",
		currentStageId: "s1",
		history: [],
	};
	const taskStore = { getTask: () => task };
	const projectStore = { getProject: () => ({ cwd: null }) };
	return { claimStore, taskStore, projectStore, task };
}

function interruptOnce(ctx, ledger, { reason = null } = {}) {
	const { executionId } = ctx.claimStore.claim("t1", "r1");
	return ledger.interruptExecution({
		claimStore: ctx.claimStore,
		taskStore: ctx.taskStore,
		projectId: "p1",
		taskId: "t1",
		runnerId: "r1",
		executionId,
		reason,
	});
}

describe("executionLedger capacity-refusal interrupts (task 3b82f6ae)", () => {
	let ctx;
	let ledger;
	beforeEach(() => {
		ctx = stores();
		ledger = new ExecutionLedger();
	});

	test("5 cap refusals: runnerInterruptCount stays 0, no escalation, no park", () => {
		let out;
		for (let i = 0; i < MAX_CAPACITY_REFUSALS_BEFORE_NOTE; i++) {
			out = interruptOnce(ctx, ledger, { reason: CAP_REASON });
		}
		// The refusal is recorded and visible…
		expect(out.interrupted).toBe(true);
		expect(out.capacityRefusal).toBe(true);
		expect(out.capacityRefusalCount).toBe(MAX_CAPACITY_REFUSALS_BEFORE_NOTE);
		expect(ctx.task.status).toBe("interrupted");
		expect(ctx.task.capacityRefusalCount).toBe(MAX_CAPACITY_REFUSALS_BEFORE_NOTE);
		expect(ctx.task.capacityRefusalStage).toBe("s1");
		expect(ledger.snapshot().interrupts).toBe(MAX_CAPACITY_REFUSALS_BEFORE_NOTE);
		expect(ledger.snapshot().capacityRefusals).toBe(MAX_CAPACITY_REFUSALS_BEFORE_NOTE);
		// …but never counted as a runner death, never escalated…
		expect(out.interruptCount).toBe(0);
		expect(out.escalated).toBe(false);
		expect(ctx.task.runnerInterruptCount ?? 0).toBe(0);
		expect(ledger.snapshot().interruptEscalations).toBe(0);
		// …and the task is NOT parked as a runner-death-loop.
		expect(isAutoResumableWithReason(ctx.task, { type: "agent" })).toEqual({
			resumable: true,
			reason: "automated-stage",
		});
	});

	test("cap refusals still record the reason in task history", () => {
		interruptOnce(ctx, ledger, { reason: CAP_REASON });
		const actions = ctx.task.history.map((h) => String(h.action));
		expect(actions.some((a) => a.includes("lease dropped"))).toBe(true);
		expect(actions.some((a) => a.includes(`Reason: ${CAP_REASON}`))).toBe(true);
	});

	test("a long cap-refusal streak gets a visibility note but still never parks", () => {
		for (let i = 0; i < MAX_CAPACITY_REFUSALS_BEFORE_NOTE + 3; i++) {
			interruptOnce(ctx, ledger, { reason: CAP_REASON });
		}
		expect(ctx.task.capacityRefusalCount).toBe(MAX_CAPACITY_REFUSALS_BEFORE_NOTE + 3);
		expect(ctx.task.runnerInterruptCount ?? 0).toBe(0);
		expect(ledger.snapshot().interruptEscalations).toBe(0);
		const actions = ctx.task.history.map((h) => String(h.action).toLowerCase());
		expect(
			actions.some(
				(a) => a.includes("capacity refusal") && a.includes("never parks"),
			),
		).toBe(true);
		expect(
			isAutoResumableWithReason(ctx.task, { type: "agent" }).reason,
		).not.toBe("runner-death-loop");
	});

	test("mixed streak: a cap refusal neither increments nor resets a death streak", () => {
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS - 1; i++) {
			interruptOnce(ctx, ledger); // bare crash interrupts
		}
		expect(ctx.task.runnerInterruptCount).toBe(MAX_RUNNER_INTERRUPTS - 1);
		// The cap refusal in the middle changes nothing about the death count.
		const mid = interruptOnce(ctx, ledger, { reason: CAP_REASON });
		expect(mid.capacityRefusal).toBe(true);
		expect(mid.interruptCount).toBe(MAX_RUNNER_INTERRUPTS - 1);
		expect(ctx.task.runnerInterruptCount).toBe(MAX_RUNNER_INTERRUPTS - 1);
		expect(ctx.task.capacityRefusalCount).toBe(1);
		// The next bare crash completes the death streak → escalates and parks.
		const last = interruptOnce(ctx, ledger);
		expect(last).toEqual({
			interrupted: true,
			interruptCount: MAX_RUNNER_INTERRUPTS,
			escalated: true,
		});
		expect(ledger.snapshot().interruptEscalations).toBe(1);
		expect(isAutoResumableWithReason(ctx.task, { type: "agent" })).toEqual({
			resumable: false,
			reason: "runner-death-loop",
		});
	});

	test("a stage change restarts the capacity-refusal streak", () => {
		for (let i = 0; i < 3; i++) interruptOnce(ctx, ledger, { reason: CAP_REASON });
		expect(ctx.task.capacityRefusalCount).toBe(3);
		ctx.task.currentStageId = "s2";
		const out = interruptOnce(ctx, ledger, { reason: CAP_REASON });
		expect(out.capacityRefusalCount).toBe(1);
		expect(ctx.task.capacityRefusalStage).toBe("s2");
		expect(ctx.task.runnerInterruptCount ?? 0).toBe(0);
	});

	test("cap refusal records the refusing runner for the scheduler hide window", () => {
		const out = interruptOnce(ctx, ledger, { reason: CAP_REASON });
		expect(out.lastCapacityRefusalRunnerId).toBe("r1");
		expect(ctx.task.lastCapacityRefusal?.runnerId).toBe("r1");
		expect(typeof ctx.task.lastCapacityRefusal?.at).toBe("string");
	});

	test("completion clears the capacity-refusal counters like the death counters", async () => {
		interruptOnce(ctx, ledger, { reason: CAP_REASON });
		interruptOnce(ctx, ledger, { reason: CAP_REASON });
		expect(ctx.task.capacityRefusalCount).toBe(2);
		const { executionId, epoch } = ctx.claimStore.claim("t1", "r1");
		await ledger.completeExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: ctx.projectStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		});
		expect(ctx.task.capacityRefusalCount).toBeUndefined();
		expect(ctx.task.capacityRefusalStage).toBeUndefined();
		expect(ctx.task.runnerInterruptCount).toBeUndefined();
		expect(ctx.task.consecutiveResumes).toBeUndefined();
	});

	test("bare crash interrupts still escalate at the bound (pin, unchanged behaviour)", () => {
		let out;
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS; i++) {
			out = interruptOnce(ctx, ledger);
		}
		expect(out).toEqual({
			interrupted: true,
			interruptCount: MAX_RUNNER_INTERRUPTS,
			escalated: true,
		});
		expect(ctx.task.capacityRefusalCount ?? 0).toBe(0);
		expect(isAutoResumableWithReason(ctx.task, { type: "agent" })).toEqual({
			resumable: false,
			reason: "runner-death-loop",
		});
	});
});
