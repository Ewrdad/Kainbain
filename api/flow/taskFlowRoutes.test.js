import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The human-approval advance route only ensures the task-branch ref exists
// (create-only) after the checkpoint is approved — it never finalises
// (no commit, push, or checkout), so the operator's live tree is untouched.
// Verified here through the real route handler with a stub app and stub
// stores — no HTTP, no git, no background servers.
const { registerTaskFlowRoutes } = await import("./taskFlowRoutes.js");

const STAGES = [
	{ id: "build", name: "Build", type: "agent" },
	{ id: "review", name: "Review", type: "human" },
	{ id: "integrate", name: "Integrate", type: "merge" },
];

function setup({ exitingStageId = "review", branchMode = true } = {}) {
	const routes = new Map();
	const fakeApp = {
		post: (routePath, handler) => {
			routes.set(routePath, handler);
		},
		get: (routePath, handler) => {
			routes.set(routePath, handler);
		},
	};
	const task = {
		id: "task-1",
		projectId: "proj-1",
		branch: "kb/task-1",
		currentStageId: exitingStageId,
		status: "waiting_human",
		history: [],
	};
	const taskStore = {
		eventBridge: null,
		getTask: vi.fn(() => task),
		advanceStage: vi.fn(() => ({ ...task, currentStageId: "integrate" })),
		updateTask: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => branchMode),
		ensureTaskBranchRef: vi.fn(async () => ({ created: true })),
		finalizeTaskBranch: vi.fn(async () => ({ returnError: null })),
	};
	const projectStore = {
		getProject: vi.fn(() => ({ id: "proj-1", cwd: "/repo", stages: STAGES })),
	};
	const promptEngine = { curatePrompt: vi.fn(() => "curated") };
	return { routes, fakeApp, task, taskStore, projectStore, promptEngine };
}

async function invokeAdvance(routes, taskId = "task-1", body = {}) {
	const handler = routes.get("/tasks/:id/advance");
	expect(handler).toBeTypeOf("function");
	const reply = { status: vi.fn(() => ({ send: vi.fn() })) };
	const result = await handler(
		{ body: { projectId: "proj-1", ...body }, params: { id: taskId } },
		reply,
	);
	return { result, reply };
}

describe("advance route human-stage branch-ref ensure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ensures the branch ref without finalising when approving a human checkpoint", async () => {
		const { routes, fakeApp, task, taskStore, projectStore, promptEngine } =
			setup({ exitingStageId: "review" });
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		const { result } = await invokeAdvance(routes);

		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
		expect(taskStore.ensureTaskBranchRef).toHaveBeenCalledTimes(1);
		expect(taskStore.ensureTaskBranchRef).toHaveBeenCalledWith(
			expect.objectContaining({ id: "task-1" }),
			"/repo",
			expect.objectContaining({ stageName: "Review" }),
		);
		// Approval never commits, pushes, or switches branches.
		expect(taskStore.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(result.currentStageId).toBe("integrate");
	});

	it("curates the next prompt before ensuring the ref", async () => {
		const { routes, fakeApp, taskStore, projectStore, promptEngine } = setup({
			exitingStageId: "review",
		});
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		await invokeAdvance(routes);

		expect(taskStore.updateTask).toHaveBeenCalledWith(
			"proj-1",
			"task-1",
			{ prompt: "curated" },
			"/repo",
		);
		expect(taskStore.ensureTaskBranchRef).toHaveBeenCalledTimes(1);
		expect(
			taskStore.updateTask.mock.invocationCallOrder[0],
		).toBeLessThan(
			taskStore.ensureTaskBranchRef.mock.invocationCallOrder[0],
		);
	});

	it("does not ensure the ref when the exiting stage is not human", async () => {
		const { routes, fakeApp, taskStore, projectStore, promptEngine } = setup({
			exitingStageId: "build",
		});
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		await invokeAdvance(routes);

		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
		expect(taskStore.ensureTaskBranchRef).not.toHaveBeenCalled();
		expect(taskStore.finalizeTaskBranch).not.toHaveBeenCalled();
	});

	it("ensures the branch ref when approving a legacy review checkpoint", async () => {
		// A stage typed `review` (the pre-human label) is normalized to human,
		// so approval takes the same branch-ref path as an explicit human gate.
		const legacyStages = [
			{ id: "build", name: "Build", type: "agent" },
			{ id: "gate", name: "Gate", type: "review" },
			{ id: "integrate", name: "Integrate", type: "merge" },
		];
		const { routes, fakeApp, taskStore, projectStore, promptEngine } = setup({
			exitingStageId: "gate",
		});
		projectStore.getProject = vi.fn(() => ({
			id: "proj-1",
			cwd: "/repo",
			stages: legacyStages,
		}));
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		const { result } = await invokeAdvance(routes);

		expect(taskStore.ensureTaskBranchRef).toHaveBeenCalledTimes(1);
		expect(taskStore.ensureTaskBranchRef).toHaveBeenCalledWith(
			expect.objectContaining({ id: "task-1" }),
			"/repo",
			expect.objectContaining({ stageName: "Gate" }),
		);
		expect(taskStore.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(result.currentStageId).toBe("integrate");
	});

	it("does not ensure the ref when branch mode is off", async () => {
		const { routes, fakeApp, taskStore, projectStore, promptEngine } = setup({
			exitingStageId: "review",
			branchMode: false,
		});
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		await invokeAdvance(routes);

		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
		expect(taskStore.ensureTaskBranchRef).not.toHaveBeenCalled();
	});

	it("still returns the advanced task when ref-ensure throws", async () => {
		const { routes, fakeApp, taskStore, projectStore, promptEngine } = setup({
			exitingStageId: "review",
		});
		taskStore.ensureTaskBranchRef.mockRejectedValueOnce(new Error("git exploded"));
		const systemLog = vi.fn();
		taskStore.eventBridge = { emitSystemLog: systemLog };
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		const { result } = await invokeAdvance(routes);

		// The approval itself stands; the failure is surfaced as a warning.
		expect(result.currentStageId).toBe("integrate");
		expect(systemLog).toHaveBeenCalledWith(
			"proj-1",
			expect.stringContaining("Human-stage branch-ref ensure skipped"),
			expect.objectContaining({ taskId: "task-1" }),
		);
	});
});

describe("reject route guards and validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// MARK: reject route guards and validation
	// POST /tasks/:id/reject through the real route handler with stub stores:
	// input validation, state guards (consistent with /advance), and the
	// happy-path contract (trimmed feedback echoed, curated prompt refreshed).
	function setupReject({ status = "waiting_human", task: taskOverrides = {} } = {}) {
		const routes = new Map();
		const fakeApp = {
			post: (routePath, handler) => {
				routes.set(routePath, handler);
			},
			get: (routePath, handler) => {
				routes.set(routePath, handler);
			},
		};
		const task = {
			id: "task-1",
			projectId: "proj-1",
			currentStageId: "build",
			status,
			history: [],
			...taskOverrides,
		};
		const rejectedTask = { ...task, currentStageId: "build", status: "in_stage" };
		const taskStore = {
			getTask: vi.fn(() => task),
			rejectTask: vi.fn(() => rejectedTask),
			updateTask: vi.fn(),
		};
		const projectStore = {
			getProject: vi.fn(() => ({ id: "proj-1", cwd: "/repo", stages: STAGES })),
		};
		const promptEngine = { curatePrompt: vi.fn(() => "curated with feedback") };
		return { routes, fakeApp, task, rejectedTask, taskStore, projectStore, promptEngine };
	}

	async function registerRejectRoutes(s) {
		await registerTaskFlowRoutes(s.fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore: s.projectStore,
			taskStore: s.taskStore,
			promptEngine: s.promptEngine,
		});
	}

	function makeReply() {
		const send = vi.fn();
		const status = vi.fn(() => ({ send }));
		return { status, send };
	}

	async function invokeReject(routes, body = {}) {
		const handler = routes.get("/tasks/:id/reject");
		expect(handler).toBeTypeOf("function");
		const reply = makeReply();
		const result = await handler(
			{ body: { projectId: "proj-1", ...body }, params: { id: "task-1" } },
			reply,
		);
		return { result, reply };
	}

	it("rejects missing or blank feedback with 400", async () => {
		const s = setupReject();
		await registerRejectRoutes(s);

		for (const body of [{}, { feedback: "   " }, { feedback: "" }]) {
			const { reply } = await invokeReject(s.routes, body);
			expect(reply.status).toHaveBeenCalledWith(400);
			expect(reply.send).toHaveBeenCalledWith(
				expect.objectContaining({ error: "Feedback is required" }),
			);
		}
		expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
	});

	it("rejects unknown tasks with 404", async () => {
		const s = setupReject();
		s.taskStore.getTask.mockReturnValueOnce(null);
		await registerRejectRoutes(s);

		const { reply } = await invokeReject(s.routes, { feedback: "nope" });
		expect(reply.status).toHaveBeenCalledWith(404);
		expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
	});

	it("rejects completed tasks with 409", async () => {
		const s = setupReject({ status: "completed" });
		await registerRejectRoutes(s);

		const { reply } = await invokeReject(s.routes, { feedback: "too late" });
		expect(reply.status).toHaveBeenCalledWith(409);
		expect(reply.send).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Task is already completed" }),
		);
		expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
	});

	it.each([
		"running_agent",
		"running_ci",
		"running_deploy",
		"running_merge",
		"advancing",
	])("rejects processing tasks (%s) with 409", async (status) => {
		const s = setupReject({ status });
		await registerRejectRoutes(s);

		const { reply } = await invokeReject(s.routes, { feedback: "race" });
		expect(reply.status).toHaveBeenCalledWith(409);
		expect(reply.send).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Task cannot be rejected while processing",
			}),
		);
		expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
	});

	it("fails the task back with a freshly curated prompt containing the feedback", async () => {
		const s = setupReject({ status: "waiting_human" });
		await registerRejectRoutes(s);

		const { result, reply } = await invokeReject(s.routes, {
			feedback: "  add empty-input validation  ",
		});
		expect(reply.status).not.toHaveBeenCalled();
		expect(s.taskStore.rejectTask).toHaveBeenCalledWith(
			"proj-1",
			"task-1",
			expect.any(Array),
			"  add empty-input validation  ",
			undefined,
			"/repo",
			[],
		);
		expect(s.promptEngine.curatePrompt).toHaveBeenCalledWith(
			expect.objectContaining({ id: "task-1" }),
			expect.objectContaining({ id: "build" }),
			expect.objectContaining({ feedback: "add empty-input validation" }),
		);
		expect(s.taskStore.updateTask).toHaveBeenCalledWith(
			"proj-1",
			"task-1",
			{ prompt: "curated with feedback" },
			"/repo",
		);
		expect(result).toMatchObject({
			feedback: "add empty-input validation",
			curatedPrompt: "curated with feedback",
		});
	});
});

describe("human-review comment carry-through", () => {
	// The advance/reject routes read the task's review-comments sidecar so a
	// line-by-line checkpoint review is preserved in the approval/rejection
	// report and reaches the next agent stage through the task goal.
	let cwd;

	beforeEach(() => {
		vi.clearAllMocks();
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-flow-comments-"));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	function writeSidecar(taskId, comments) {
		const dir = path.join(cwd, "docs", "tasks", taskId);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "review-comments.json"),
			JSON.stringify({ comments }),
		);
	}

	const REPORT_COMMENT = {
		id: "rc-1",
		filePath: "./docs/tasks/task-1/IMPLEMENTATION_PLAN.md",
		scope: "line",
		line: 3,
		body: "Tighten the retry budget",
		author: "human",
		resolved: false,
		replies: [],
	};

	it("advance folds report comments into the goal and forwards them to advanceStage", async () => {
		const s = setup();
		s.taskStore._recordHistory = vi.fn();
		writeSidecar("task-1", [REPORT_COMMENT]);
		s.projectStore.getProject = vi.fn(() => ({ id: "proj-1", cwd, stages: STAGES }));
		await registerTaskFlowRoutes(s.fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore: s.projectStore,
			taskStore: s.taskStore,
			promptEngine: s.promptEngine,
		});

		await invokeAdvance(s.routes, "task-1", { guidance: "Ship it" });

		expect(s.task.goal).toContain("## Human Guidance");
		expect(s.task.goal).toContain("Tighten the retry budget");
		expect(s.task.goal).toContain("Ship it");
		const args = s.taskStore.advanceStage.mock.calls[0];
		expect(args[4]).toBe(cwd);
		expect(args[5].comments).toHaveLength(1);
		expect(args[5].guidance).toBe("Ship it");
	});

	it("advance leaves the goal untouched when there are no comments or guidance", async () => {
		const s = setup();
		s.taskStore._recordHistory = vi.fn();
		await registerTaskFlowRoutes(s.fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore: s.projectStore,
			taskStore: s.taskStore,
			promptEngine: s.promptEngine,
		});

		await invokeAdvance(s.routes);

		expect(s.taskStore._recordHistory).not.toHaveBeenCalled();
		expect(s.taskStore.advanceStage.mock.calls[0][5].comments).toEqual([]);
	});

	it("reject forwards sidecar comments to rejectTask", async () => {
		const routes = new Map();
		const fakeApp = {
			post: (routePath, handler) => routes.set(routePath, handler),
			get: (routePath, handler) => routes.set(routePath, handler),
		};
		const task = {
			id: "task-1",
			projectId: "proj-1",
			currentStageId: "review",
			status: "waiting_human",
			history: [],
		};
		const taskStore = {
			getTask: vi.fn(() => task),
			rejectTask: vi.fn(() => ({ ...task, status: "in_stage" })),
			updateTask: vi.fn(),
		};
		const projectStore = {
			getProject: vi.fn(() => ({ id: "proj-1", cwd, stages: STAGES })),
		};
		const promptEngine = { curatePrompt: vi.fn(() => "curated") };
		writeSidecar("task-1", [REPORT_COMMENT]);
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore,
			taskStore,
			promptEngine,
		});

		const handler = routes.get("/tasks/:id/reject");
		const reply = { status: vi.fn(() => ({ send: vi.fn() })) };
		await handler(
			{ body: { projectId: "proj-1", feedback: "Not ready" }, params: { id: "task-1" } },
			reply,
		);

		expect(taskStore.rejectTask).toHaveBeenCalledTimes(1);
		const args = taskStore.rejectTask.mock.calls[0];
		expect(args[5]).toBe(cwd);
		expect(args[6]).toHaveLength(1);
		expect(args[6][0].body).toBe("Tighten the retry budget");
	});
});

describe("advance route on terminal-failed tasks", () => {
	function setupFailed() {
		const routes = new Map();
		const fakeApp = {
			post: (routePath, handler) => {
				routes.set(routePath, handler);
			},
			get: (routePath, handler) => {
				routes.set(routePath, handler);
			},
		};
		const task = {
			id: "task-9",
			projectId: "proj-1",
			branch: "kb/task-9",
			currentStageId: "review",
			status: "failed",
			failureReason: "git checkout master failed (exit 128)",
			history: [],
		};
		const taskStore = {
			eventBridge: null,
			engineState: { status: "idle", activeTaskId: null },
			getTask: vi.fn(() => task),
			advanceStage: vi.fn(() => task),
			updateTask: vi.fn(),
			_isBranchModeEnabled: vi.fn(() => true),
			ensureTaskBranchRef: vi.fn(async () => ({ created: false })),
			retryStage: vi.fn(),
			resumeTask: vi.fn(),
		};
		const projectStore = {
			getProject: vi.fn(() => ({ id: "proj-1", cwd: "/repo", stages: STAGES })),
		};
		const promptEngine = { curatePrompt: vi.fn(() => "curated") };
		return { routes, fakeApp, task, taskStore, projectStore, promptEngine };
	}

	it("answers 409 with an actionable message instead of a silent no-op", async () => {
		const s = setupFailed();
		await registerTaskFlowRoutes(s.fakeApp, {
			resolveAndGuardProject: () => "proj-1",
			projectStore: s.projectStore,
			taskStore: s.taskStore,
			promptEngine: s.promptEngine,
		});
		const handler = s.routes.get("/tasks/:id/advance");
		const send = vi.fn();
		const reply = { status: vi.fn(() => ({ send })) };
		await handler(
			{ body: { projectId: "proj-1" }, params: { id: "task-9" } },
			reply,
		);

		expect(reply.status).toHaveBeenCalledWith(409);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.stringMatching(/retry/i),
			}),
		);
		expect(s.taskStore.advanceStage).not.toHaveBeenCalled();
	});
});

describe("retry/resume engine-busy guards", () => {
	function setupBusy(route) {
		const routes = new Map();
		const fakeApp = {
			post: (routePath, handler) => {
				routes.set(routePath, handler);
			},
			get: (routePath, handler) => {
				routes.set(routePath, handler);
			},
		};
		const task = {
			id: "task-1",
			projectId: "proj-1",
			currentStageId: "build",
			status: "failed",
			history: [],
		};
		const taskStore = {
			eventBridge: null,
			engineState: {
				status: "running",
				activeTaskId: "task-other",
			},
			getTask: vi.fn(() => task),
			retryStage: vi.fn(async () => task),
			resumeTask: vi.fn(async () => task),
			executeStage: vi.fn(),
		};
		const projectStore = {
			getProject: vi.fn(() => ({ id: "proj-1", cwd: "/repo", stages: STAGES })),
		};
		return { routes, fakeApp, task, taskStore, projectStore, route };
	}

	it.each(["/tasks/:id/retry", "/tasks/:id/resume"])(
		"%s answers 409 naming the owner while another task runs",
		async (route) => {
			const s = setupBusy(route);
			await registerTaskFlowRoutes(s.fakeApp, {
				resolveAndGuardProject: () => "proj-1",
				projectStore: s.projectStore,
				taskStore: s.taskStore,
				promptEngine: { curatePrompt: vi.fn() },
				agentRunner: vi.fn(),
			});
			const handler = s.routes.get(route);
			expect(handler).toBeTypeOf("function");
			const send = vi.fn();
			const reply = { status: vi.fn(() => ({ send })) };
			await handler(
				{ body: { projectId: "proj-1" }, params: { id: "task-1" } },
				reply,
			);

			expect(reply.status).toHaveBeenCalledWith(409);
			expect(send).toHaveBeenCalledWith(
				expect.objectContaining({ activeTaskId: "task-other" }),
			);
			expect(s.taskStore.retryStage).not.toHaveBeenCalled();
			expect(s.taskStore.resumeTask).not.toHaveBeenCalled();
		},
	);
});
