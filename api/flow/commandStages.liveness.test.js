import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/***
 * MARK: commandStages liveness tests
 * @description The compressed reproduction of the CI false-stall incident:
 *   a command stage whose child produces ZERO output for longer than the
 *   silence threshold used to be killed by the watchdog while perfectly
 *   healthy (the gate's slowest branch was silent for ~300s, the threshold
 *   was 300000ms — a coin flip). With the keep-alive ticker the stage must
 *   complete; with the keep-alive disabled the watchdog must still catch a
 *   genuinely silent stage (the guard was not deleted, only made honest).
 *   Everything runs on fake clocks — the runner settles only when the test
 *   advances time, and no assertion touches wall-clock durations.
 * @example run `npm run test:api -- commandStages.liveness`
 ***/

// The keep-alive interval resolves from the config singleton; the control
// case needs it disabled, so the shim import is mocked with a mutable twin
// carrying just the keys the command runner reads.
const configStub = vi.hoisted(() => ({
	config: { ciHeartbeatIntervalMs: 30000, ciTimeoutMs: 60000 },
}));
vi.mock("../config.js", () => ({ config: configStub.config }));

const {
	runCommandStage,
} = await import("./commandStages.js");
const { watchdogTick, getStageHeartbeat, noteStallKill } = await import(
	"./stageHeartbeat.js"
);

function stageFixture(overrides = {}) {
	return {
		id: "ci-1",
		name: "Automated tests",
		type: "ci",
		command: "npm run test",
		...overrides,
	};
}

function taskFixture() {
	return {
		id: "task-1",
		projectId: "proj-1",
		currentStageId: "ci-1",
		status: "running_ci",
		branch: "kb/task-1",
		history: [],
		timeline: [],
		logEntries: [],
	};
}

function livenessStore(stage, task) {
	const project = { id: "proj-1", cwd: "/repo", stages: [stage] };
	const store = {
		eventBridge: null,
		engineState: {
			status: "running",
			activeTaskId: "task-1",
			activeProjectId: "proj-1",
		},
		schedulerStats: { stallRecoveries: 0 },
		projectStore: {
			getProject: vi.fn(() => project),
			listProjects: vi.fn(() => [project]),
		},
		getTask: vi.fn(() => task),
		updateTask: vi.fn(),
		saveStageReport: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => false),
		advanceStage: vi.fn(),
		handleStageFailure: vi.fn(async () => ({ status: "failed" })),
		handleTransientFailure: vi.fn(() => ({ status: "in_stage" })),
		killTaskProcess: vi.fn(),
		_recordHistory: vi.fn((t, action, timestamp) => {
			t.history.push({ action, timestamp });
		}),
		_recordTimeline: vi.fn((t, entry) => {
			t.timeline.push(entry);
		}),
		setEngineState: vi.fn((next) => {
			Object.assign(store.engineState, next);
		}),
	};
	return store;
}

/** A silent runner: no onStdout/onStderr ever, settles only when time advances. */
const silentRunner = (command, opts) =>
	new Promise((resolve) => {
		setTimeout(() => resolve({ exitCode: 0, stdout: "", stderr: "" }), 600000, opts);
	});

function runStage(store, stage, execRunner) {
	return runCommandStage(store, "proj-1", "task-1", stage, {
		stages: [stage],
		cwd: "/repo",
		kind: "ci",
		label: "CI",
		logTag: "CI/CMD",
		reportTitle: "CI Stage Report",
		statusValue: "running_ci",
		defaultCommand: "npm run test",
		execRunner,
	});
}

describe("runCommandStage liveness (the false-stall incident)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		configStub.config.ciHeartbeatIntervalMs = 30000;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("a zero-output child is not stalled and the stage completes (RC-1)", async () => {
		const stage = stageFixture();
		const task = taskFixture();
		const store = livenessStore(stage, task);
		const runPromise = runStage(store, stage, silentRunner);

		// Advance past the 300000ms silence threshold with zero output: the
		// keep-alive ticker must have kept the heartbeat fresh.
		await vi.advanceTimersByTimeAsync(1000);
		const beatBefore = getStageHeartbeat(store, "task-1").lastBeatAt;
		await vi.advanceTimersByTimeAsync(310000);
		const beatAfter = getStageHeartbeat(store, "task-1").lastBeatAt;
		expect(beatAfter).toBeGreaterThan(beatBefore);

		const outcome = watchdogTick(store, {
			now: Date.now(),
			cfg: { ciStallTimeoutMs: 300000 },
		});
		expect(outcome).toBeNull();
		expect(store.killTaskProcess).not.toHaveBeenCalled();
		expect(task.timeline.some((e) => e.status === "Stalled")).toBe(false);

		// The child settles and the stage completes normally.
		await vi.advanceTimersByTimeAsync(290000);
		const result = await runPromise;
		expect(result.status).toBe("passed");
		expect(result.exitCode).toBe(0);
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("with the keep-alive disabled a silent child is still stalled (guard intact)", async () => {
		configStub.config.ciHeartbeatIntervalMs = 0;
		const stage = stageFixture();
		const task = taskFixture();
		const store = livenessStore(stage, task);
		const runPromise = runStage(store, stage, silentRunner);

		await vi.advanceTimersByTimeAsync(310000);
		const outcome = watchdogTick(store, {
			now: Date.now(),
			cfg: { ciStallTimeoutMs: 300000 },
		});
		expect(outcome).toBeDefined();
		expect(store.killTaskProcess).toHaveBeenCalledTimes(1);
		expect(task.timeline.some((e) => e.status === "Stalled")).toBe(true);
		expect(task.stallKill).toMatchObject({
			stageId: "ci-1",
			silenceMs: 310000,
			thresholdMs: 300000,
		});
		expect(store.handleTransientFailure).toHaveBeenCalledTimes(1);
		// Keep the dangling runner promise from leaking into other tests.
		vi.advanceTimersByTimeAsync(600000).catch(() => {});
	});

	it("a wedged child is still bounded by the stage timeout (RC-6)", async () => {
		const stage = stageFixture({ timeout: 5000 });
		const task = taskFixture();
		const store = livenessStore(stage, task);
		// A runner that honours its timeout budget the way the real exec
		// runner does: after `timeout` ms the wedged child is killed and the
		// runner settles with the timeout's exit code.
		const wedgedRunner = (command, { timeout }) =>
			new Promise((resolve) => {
				setTimeout(
					() => resolve({ exitCode: 124, stdout: "", stderr: "killed after timeout" }),
					timeout,
				);
			});
		const runPromise = runStage(store, stage, wedgedRunner);

		await vi.advanceTimersByTimeAsync(6000);
		const result = await runPromise;
		expect(result.status).toBe("failed");
		// The failure the router sees carries the timeout kill's exit code.
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure.mock.calls[0][3].exitCode).toBe(124);
	});

	it("the ticker stops on every exit path and never resurrects a finished stage", async () => {
		const exitPaths = [
			{
				title: "success",
				runner: silentRunner,
				expected: "passed",
			},
			{
				title: "non-zero exit",
				runner: async () => ({ exitCode: 3, stdout: "", stderr: "boom" }),
				expected: "failed",
			},
			{
				title: "runner throws",
				runner: async () => {
					throw new Error("spawn broke");
				},
				expected: "failed",
			},
		];
		for (const path of exitPaths) {
			const stage = stageFixture();
			const task = taskFixture();
			const store = livenessStore(stage, task);
			const runPromise = runStage(store, stage, path.runner);
			await vi.advanceTimersByTimeAsync(1200000);
			const result = await runPromise;
			expect(result.status).toBe(path.expected);

			// The heartbeat is cleared at exit and the stopped ticker must not
			// re-record one: a resurrected heartbeat on a finished stage is a
			// phantom the watchdog could chase forever.
			expect(getStageHeartbeat(store, "task-1")).toBeNull();
			await vi.advanceTimersByTimeAsync(120000);
			expect(getStageHeartbeat(store, "task-1")).toBeNull();
		}
	});

	it("a watchdog-killed stage's report names the stall (RC-4)", async () => {
		const stage = stageFixture();
		const task = taskFixture();
		const store = livenessStore(stage, task);
		// The watchdog half (watchdogTick) is covered above; this pins the
		// report writer: a fresh stall context becomes an explicit banner.
		noteStallKill(task, {
			at: new Date().toISOString(),
			stageId: "ci-1",
			stageName: "Automated tests",
			stageType: "ci",
			silenceMs: 302546,
			thresholdMs: 300000,
			stageTimeoutMs: 1800000,
		});
		const runPromise = runStage(store, stage, async () => ({
			exitCode: 1,
			stdout: "",
			stderr: "",
		}));
		await vi.advanceTimersByTimeAsync(1000);
		const result = await runPromise;
		expect(result.status).toBe("failed");

		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.status).toBe("FAILED");
		expect(report.content).toContain("Killed by the stall watchdog");
		expect(report.content).toContain("302546ms");
		expect(report.content).toContain("threshold 300000ms");
		expect(report.content).toContain("stage timeout 1800000ms");
		expect(report.content).toContain("synthetic");
		// Single-use: the context is consumed, never re-reported.
		expect(task.stallKill).toBeUndefined();
	});

	it("a stale stall context from an old incident is never re-reported", async () => {
		const stage = stageFixture();
		const task = taskFixture();
		const store = livenessStore(stage, task);
		noteStallKill(task, {
			at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
			stageId: "ci-1",
			silenceMs: 302546,
			thresholdMs: 300000,
			stageTimeoutMs: 1800000,
		});
		const runPromise = runStage(store, stage, async () => ({
			exitCode: 1,
			stdout: "",
			stderr: "real failure",
		}));
		await vi.advanceTimersByTimeAsync(1000);
		await runPromise;
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).not.toContain("Killed by the stall watchdog");
	});
});
