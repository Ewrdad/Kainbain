import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

const { runCommandStage } = await import("./commandStages.js");

function stubStore(overrides = {}) {
	return {
		eventBridge: null,
		getTask: vi.fn(),
		updateTask: vi.fn(),
		saveStageReport: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => false),
		_registerChild: vi.fn(),
		_unregisterChild: vi.fn(),
		killTaskProcess: vi.fn(),
		advanceStage: vi.fn(),
		handleStageFailure: vi.fn(async () => ({ status: "failed" })),
		...overrides,
	};
}

describe("commandStages platform characterization test (Linux default)", () => {
	beforeEach(() => {
		spawnMock.mockReset();
		// Pin SHELL so the host login shell cannot leak into the assertion:
		// an empty SHELL must fall back to /bin/sh (POSIX default).
		vi.stubEnv("SHELL", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("spawns /bin/sh with -c, detached: true, and sanitized environment on Linux", async () => {
		const fakeChild = {
			pid: 12345,
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn((event, cb) => {
				if (event === "close") {
					setTimeout(() => cb(0), 10);
				}
			}),
		};
		spawnMock.mockReturnValue(fakeChild);

		const store = stubStore({
			getTask: vi.fn(() => ({ id: "task-1", status: "running", history: [] })),
		});

		const stage = {
			type: "command",
			command: "echo test",
		};

		const promise = runCommandStage(store, "proj-1", "task-1", stage, {
			cwd: "/mock/cwd",
			projectName: "MyProject",
		});
		const result = await promise;

		expect(result.exitCode).toBe(0);
		expect(spawnMock).toHaveBeenCalledTimes(1);

		const [spawnFile, spawnArgs, spawnOpts] = spawnMock.mock.calls[0];
		expect(spawnFile).toBe("/bin/sh");
		expect(spawnArgs).toEqual(["-c", "echo test"]);
		expect(spawnOpts.cwd).toBe("/mock/cwd");
		expect(spawnOpts.detached).toBe(true);

		const env = spawnOpts.env;
		expect(env).toBeDefined();
		expect(env.PROJECT_CWD).toBe("/mock/cwd");
		expect(env.TASK_ID).toBe("task-1");
		expect(env.PATH).toBeDefined();
		expect(env.HOME).toBeDefined();
		expect(env.USER).toBeDefined();
		expect(env.LANG).toBeDefined();
		expect(env.NODE_ENV).toBeDefined();
	});
});
