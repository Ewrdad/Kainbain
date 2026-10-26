// Domain: The Flow — operator aborts must settle quietly, never retry.
// Regression test: pausing/stopping the engine (or a deploy restart) aborts
// the live agent run with "This operation was aborted". That abort used to be
// classified as a transient infrastructure failure, so the task was flipped
// back to in_stage with retry budget consumed (and re-dispatched while the
// scheduler ran) — the engine flapped running/idle, retry/failback events
// fired, and no stage ever completed.
import { describe, it, expect } from "vitest";
import { TaskStore } from "../taskStore.js";
import {
	isOperatorAbortError,
	isTransientInfrastructureError,
} from "../work/taskErrors.js";

// The exact failure shape the runner produces when the session is aborted
// (api/agentRunner.js tags every promptException failureKind infrastructure).
const abortResult = () => ({
	output: "[Agent Execution Error] This operation was aborted",
	content: "[Agent Execution Error] This operation was aborted",
	failed: true,
	failureReason: "[Agent Execution Error] This operation was aborted",
	failureKind: "infrastructure",
	fallbackStageId: null,
});

const quietBridge = () => {
	const emitted = [];
	return {
		emitted,
		bridge: {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ eventName, payload });
			},
			emitSystemLog: () => {},
			emitNotification: () => {},
			broadcastGlobal: () => {},
		},
	};
};

const wf = [
	{ id: "1", name: "Idea", type: "human", failback: "start" },
	{ id: "3", name: "Plan", type: "agent", failback: "previous" },
];

describe("The Flow: operator abort settles quietly", () => {
	it("recognises operator-abort signatures", () => {
		expect(isOperatorAbortError("This operation was aborted")).toBe(true);
		expect(
			isOperatorAbortError("[Agent Execution Error] This operation was aborted"),
		).toBe(true);
		expect(
			isOperatorAbortError(Object.assign(new Error("x"), { name: "AbortError" })),
		).toBe(true);
		expect(isOperatorAbortError(abortResult())).toBe(true);
		// Genuine infrastructure stays non-abort.
		expect(isOperatorAbortError("503 Service Unavailable")).toBe(false);
		expect(isOperatorAbortError("socket hang up")).toBe(false);
		expect(isOperatorAbortError("connect ECONNABORTED 1.2.3.4:443")).toBe(false);
		expect(isOperatorAbortError("[Agent Review Rejection] nope")).toBe(false);
	});

	it("never classifies an abort as transient infrastructure failure", () => {
		expect(
			isTransientInfrastructureError("[Agent Execution Error] This operation was aborted"),
		).toBe(false);
		expect(isTransientInfrastructureError("This operation was aborted")).toBe(
			false,
		);
		expect(isTransientInfrastructureError(abortResult())).toBe(false);
		// Existing contract: tagged infrastructure without abort still transient.
		expect(
			isTransientInfrastructureError({ failed: true, failureKind: "infrastructure" }),
		).toBe(true);
		expect(
			isTransientInfrastructureError("[Agent Execution Error] 503 Internal server error"),
		).toBe(true);
	});

	it("an aborted run does not retry, fail back, or consume budget", async () => {
		const { bridge, emitted } = quietBridge();
		const store = new TaskStore({ eventBridge: bridge });
		const task = store.createTask("p1", {
			title: "Aborted plan task",
			goal: "Write a plan",
			stageId: "3",
		});

		const result = await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => abortResult(),
		});

		expect(result.status).not.toBe("retrying");
		const updated = store.getTask("p1", task.id);
		expect(updated.currentStageId).toBe("3");
		expect(updated.status).toBe("in_stage");
		expect(updated.infraRetryCount || 0).toBe(0);
		expect(updated.autoIterationCount || 0).toBe(0);
		expect(updated.autoRetrying).toBeFalsy();
		expect(
			emitted.some(
				(e) => e.eventName === "stage:retry" || e.eventName === "stage:failback",
			),
		).toBe(false);
	});

	it("a thrown abort settles the same way", async () => {
		const { bridge, emitted } = quietBridge();
		const store = new TaskStore({ eventBridge: bridge });
		const task = store.createTask("p1", {
			title: "Thrown abort task",
			goal: "Write a plan",
			stageId: "3",
		});

		const result = await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => {
				throw new Error("This operation was aborted");
			},
		});

		expect(result.status).not.toBe("retrying");
		const updated = store.getTask("p1", task.id);
		expect(updated.currentStageId).toBe("3");
		expect(updated.status).toBe("in_stage");
		expect(updated.infraRetryCount || 0).toBe(0);
		expect(
			emitted.some(
				(e) => e.eventName === "stage:retry" || e.eventName === "stage:failback",
			),
		).toBe(false);
	});

	it("an abort settling after engine stop keeps the interrupted state", async () => {
		const { bridge } = quietBridge();
		const store = new TaskStore({ eventBridge: bridge });
		const task = store.createTask("p1", {
			title: "Stopped plan task",
			goal: "Write a plan",
			stageId: "3",
		});
		const result = await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => {
				// What /compute/stop records for a live run before its abort settles.
				store.updateTask("p1", task.id, { status: "interrupted" });
				store.getTask("p1", task.id).wasInterrupted = true;
				return abortResult();
			},
		});

		expect(result.status).not.toBe("retrying");
		const updated = store.getTask("p1", task.id);
		expect(updated.status).toBe("interrupted");
		expect(updated.currentStageId).toBe("3");
		expect(updated.infraRetryCount || 0).toBe(0);
	});
});
