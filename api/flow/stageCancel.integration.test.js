import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { runCommandStage } from "./commandStages.js";
import {
	registerChild,
	unregisterChild,
	killTaskProcess,
} from "./taskControl.js";

/***
 * MARK: stageCancel integration tests
 * @description Proves the task Verification end to end on Linux: a long-running
 *   stage with a real grandchild is cancelled via killTaskProcess (and via the
 *   stage timeout path), and the parent AND the child are fully reaped — no
 *   orphans, no lingering registration, no unhandled rejections. A
 *   distinctive `exec -a` marker plus `pgrep -f` observes the grandchild, so
 *   the test proves the tree kill rather than just the parent kill. The
 *   Windows dispatch variant runs with taskkill mocked.
 ***/

function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function pgrepCount(marker) {
	try {
		const out = execFileSync("pgrep", ["-f", marker], {
			stdio: ["ignore", "pipe", "pipe"],
		})
			.toString()
			.trim();
		return out ? out.split("\n").length : 0;
	} catch {
		// pgrep exits 1 when nothing matches.
		return 0;
	}
}

async function waitForGone(check, { timeoutMs = 5000 } = {}) {
	const started = Date.now();
	for (;;) {
		if (!check()) return;
		if (Date.now() - started > timeoutMs) {
			throw new Error("waitForGone timed out: process(es) still alive");
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

async function waitForFound(check, { timeoutMs = 5000 } = {}) {
	const started = Date.now();
	for (;;) {
		if (check()) return;
		if (Date.now() - started > timeoutMs) {
			throw new Error("waitForFound timed out: process(es) never appeared");
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

function stubStore(task) {
	const store = {
		eventBridge: null,
		projectStore: undefined,
		_activeChildren: new Map(),
		getTask: vi.fn(() => task),
		updateTask: vi.fn(),
		saveStageReport: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		advanceStage: vi.fn(),
		handleStageFailure: vi.fn(async () => ({ status: "failed" })),
		_registerChild(taskId, child) {
			registerChild(store, taskId, child);
		},
		_unregisterChild(taskId) {
			unregisterChild(store, taskId);
		},
		killTaskProcess(taskId, opts) {
			return killTaskProcess(store, taskId, opts);
		},
	};
	return store;
}

function stageOpts() {
	return {
		cwd: process.cwd(),
		projectName: "StageCancelProbe",
		kind: "deploy",
		label: "Deploy",
		logTag: "DEPLOY/CMD",
		reportTitle: "Deploy Stage Report",
		statusValue: "running_deploy",
		defaultCommand: "echo noop",
	};
}

// Belt-and-braces: vitest already fails on unhandled rejections, but the
// Verification explicitly requires "no unhandled exceptions", so record and
// assert directly.
const strayErrors = [];
function onStray(reason) {
	strayErrors.push(reason);
}
process.on("unhandledRejection", onStray);
process.on("uncaughtException", onStray);

afterEach(() => {
	expect(strayErrors).toEqual([]);
	strayErrors.length = 0;
});

describe("stage cancel integration (launch + cleanup)", () => {
	it("cancel reaps the stage parent AND its grandchild, with no orphans", async () => {
		const marker = `kb-probe-cancel-${process.pid}`;
		const task = { id: "task-cancel", status: "running", history: [] };
		const store = stubStore(task);
		const seenPids = [];
		const origRegister = store._registerChild.bind(store);
		store._registerChild = (taskId, child) => {
			if (child?.pid) seenPids.push(child.pid);
			origRegister(taskId, child);
		};

		const stage = {
			id: "deploy",
			name: "deploy",
			type: "command",
			// Parent sh spawns a marker-tagged grandchild, then waits: both the
			// parent cmdline (the -c script text) and the grandchild (the $0
			// argument, preserved verbatim in argv even if the inner shell
			// exec-optimizes into sleep) match `pgrep -f <marker>`. Deliberately
			// POSIX-only: `exec -a` is a bashism that dash (/bin/sh) rejects,
			// which made the grandchild never appear when SHELL was unset.
			command: `sh -c 'sleep 30' ${marker} & wait`,
		};
		const runPromise = runCommandStage(store, "proj-1", task.id, stage, stageOpts());

		// Both parent and grandchild must exist before the cancel proves anything.
		await waitForFound(() => pgrepCount(marker) >= 2);
		expect(seenPids).toHaveLength(1);
		const [parentPid] = seenPids;
		expect(isAlive(parentPid)).toBe(true);
		expect(store._activeChildren.has(task.id)).toBe(true);

		expect(store.killTaskProcess(task.id)).toBe(true);
		const result = await runPromise;

		expect(result.status).toBe("failed");
		expect(store._activeChildren.has(task.id)).toBe(false);
		expect(isAlive(parentPid)).toBe(false);
		await waitForGone(() => pgrepCount(marker) > 0);
	}, 20000);

	it("stage timeout kills and reaps the child via the same path", async () => {
		const task = { id: "task-timeout", status: "running", history: [] };
		const store = stubStore(task);
		const seenPids = [];
		const origRegister = store._registerChild.bind(store);
		store._registerChild = (taskId, child) => {
			if (child?.pid) seenPids.push(child.pid);
			origRegister(taskId, child);
		};

		const stage = {
			id: "deploy",
			name: "deploy",
			type: "command",
			command: "sleep 30",
			timeout: 250,
		};
		const result = await runCommandStage(store, "proj-1", task.id, stage, stageOpts());

		expect(result.status).toBe("failed");
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failureErr = store.handleStageFailure.mock.calls[0][3];
		expect(String(failureErr?.message)).toContain("timed out");
		expect(seenPids).toHaveLength(1);
		expect(isAlive(seenPids[0])).toBe(false);
		expect(store._activeChildren.has(task.id)).toBe(false);
	}, 20000);

	it("Windows dispatch routes cancel through taskkill /T /F", () => {
		const task = { id: "task-win", status: "running", history: [] };
		const store = stubStore(task);
		store._activeChildren.set(task.id, { pid: 424242 });
		const execFileSyncFn = vi.fn();

		expect(
			store.killTaskProcess(task.id, { platform: "win32", execFileSyncFn }),
		).toBe(true);
		expect(execFileSyncFn).toHaveBeenCalledWith(
			"taskkill",
			["/PID", "424242", "/T", "/F"],
			expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
		);
		expect(store._activeChildren.has(task.id)).toBe(false);
	});
});
