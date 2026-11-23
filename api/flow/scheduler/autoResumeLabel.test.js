// Domain: The Flow — S6 resume-label contract: the history line names the
// actual recovery route instead of one string for both.
import { describe, it, expect, vi } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { ExecutionLedger } from "../executionLedger.js";
import { autoResumeTask } from "./autoResumeTask.js";
import { resolveResumeLabel } from "./resolveResumeLabel.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RESTART_LABEL = "Auto-resumed after server restart — prioritised in queue";
const RUNNER_BASE = "Auto-resumed after runner interrupt — prioritised in queue";

const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-resume-label-")), "claims.json");

function makeStore(task) {
	const tasks = new Map([[task.id, task]]);
	return {
		projectStore: { getProject: () => null },
		getTask: (pid, tid) => tasks.get(tid),
		_resetAutoIteration: vi.fn(),
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		_recordTimeline: vi.fn((t, entry) => {
			t.timeline = t.timeline || [];
			t.timeline.push({ timestamp: new Date().toISOString(), ...entry });
		}),
		_resolveProjectCwd: (pid, cwd) => cwd || "/repo",
		_saveTaskMarkdown: vi.fn(),
	};
}

function interruptedTask(overrides = {}) {
	return {
		id: "t-1",
		status: "interrupted",
		wasInterrupted: true,
		currentStageId: "s-1",
		history: [],
		timeline: [],
		...overrides,
	};
}

/***
 * MARK: autoResumeLabel contract tests
 * @description S6 pins the resume-label contract: genuine reconcile
 *   recoveries keep the server-restart string; runner-path resumes write the
 *   runner string with runner id + reason. Already-written histories are
 *   never rewritten.
 ***/
describe("resolveResumeLabel", () => {
	it("writes the server-restart string for a genuine restart-route task (no runner marker)", () => {
		expect(resolveResumeLabel(interruptedTask())).toBe(RESTART_LABEL);
	});

	it("writes the runner string with id + reason for a runner-route task", () => {
		const task = interruptedTask({
			interruptedBy: { runnerId: "r-7", reason: "socket hangup", at: "2026-11-23T00:00:00.000Z" },
		});
		expect(resolveResumeLabel(task)).toBe(
			`${RUNNER_BASE} (runner r-7, reason: socket hangup)`,
		);
	});

	it("stays well-formed when the runner reason is missing or blank", () => {
		expect(
			resolveResumeLabel(interruptedTask({ interruptedBy: { runnerId: "r-7" } })),
		).toBe(`${RUNNER_BASE} (runner r-7)`);
		expect(
			resolveResumeLabel(
				interruptedTask({ interruptedBy: { runnerId: "r-7", reason: "   " } }),
			),
		).toBe(`${RUNNER_BASE} (runner r-7)`);
		expect(
			resolveResumeLabel(interruptedTask({ interruptedBy: { runnerId: "r-7" } })),
		).not.toContain("undefined");
	});

	it("falls back to the bare runner string when the marker carries no usable runner id", () => {
		expect(resolveResumeLabel(interruptedTask({ interruptedBy: {} }))).toBe(RUNNER_BASE);
		expect(
			resolveResumeLabel(interruptedTask({ interruptedBy: { reason: "x" } })),
		).toBe(RUNNER_BASE);
	});

	it("fails safe on missing or malformed input, keeping the restart string", () => {
		expect(resolveResumeLabel(null)).toBe(RESTART_LABEL);
		expect(resolveResumeLabel(undefined)).toBe(RESTART_LABEL);
		expect(resolveResumeLabel({})).toBe(RESTART_LABEL);
		expect(resolveResumeLabel(interruptedTask({ interruptedBy: "r-7" }))).toBe(
			RESTART_LABEL,
		);
	});
});

describe("autoResumeTask label routes", () => {
	it("records the server-restart string on the genuine restart route", () => {
		const task = interruptedTask();
		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(store._recordHistory).toHaveBeenCalledWith(task, RESTART_LABEL, expect.any(String));
	});

	it("records the runner string (id + reason) after a real runner interrupt", () => {
		// End-to-end across the seam: interruptExecution stamps the marker,
		// autoResumeTask reads it. The runner id and reason must survive.
		const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
		const task = interruptedTask({ status: "in_stage", currentStageId: "s-1" });
		const taskStore = { getTask: () => task };
		const ledger = new ExecutionLedger();
		const { executionId } = claimStore.claim("t-1", "r-7");
		ledger.interruptExecution({
			claimStore,
			taskStore,
			projectId: "p-1",
			taskId: "t-1",
			runnerId: "r-7",
			executionId,
			reason: "socket hangup",
		});
		expect(task.status).toBe("interrupted");

		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		expect(store._recordHistory).toHaveBeenCalledWith(
			task,
			`${RUNNER_BASE} (runner r-7, reason: socket hangup)`,
			expect.any(String),
		);
	});

	it("gives the Resumed timeline row the picked label in both routes (default reason)", () => {
		const restartTask = interruptedTask({ id: "t-restart" });
		const restartStore = makeStore(restartTask);
		autoResumeTask(restartStore, "p-1", "t-restart", "/repo");
		expect(
			restartTask.timeline.find((e) => e.status === "Resumed")?.reason,
		).toBe(RESTART_LABEL);

		const runnerTask = interruptedTask({
			id: "t-runner",
			interruptedBy: { runnerId: "r-7", reason: "socket hangup" },
		});
		const runnerStore = makeStore(runnerTask);
		autoResumeTask(runnerStore, "p-1", "t-runner", "/repo");
		expect(
			runnerTask.timeline.find((e) => e.status === "Resumed")?.reason,
		).toBe(`${RUNNER_BASE} (runner r-7, reason: socket hangup)`);
	});

	it("never rewrites already-written history rows (backward compat)", () => {
		const oldAction = "Auto-resumed after server restart — prioritised in queue";
		const task = interruptedTask({
			history: [{ timestamp: "2026-01-01T00:00:00.000Z", action: oldAction }],
			interruptedBy: { runnerId: "r-7", reason: "socket hangup" },
		});
		const store = makeStore(task);
		autoResumeTask(store, "p-1", "t-1", "/repo");
		// The old row is byte-identical; the new resume appends a new row.
		expect(task.history[0]).toEqual({
			timestamp: "2026-01-01T00:00:00.000Z",
			action: oldAction,
		});
		expect(task.history).toHaveLength(2);
		expect(task.history[1].action).toBe(
			`${RUNNER_BASE} (runner r-7, reason: socket hangup)`,
		);
	});
});
