/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FEEDBACK_VALIDATION_CODE } from "../../shared/feedbackValidation/index.js";

const { registerTaskFlowRoutes } = await import("./taskFlowRoutes.js");

const STAGES = [
	{ id: "build", name: "Build", type: "agent" },
	{ id: "review", name: "Review", type: "human" },
];

function seedAssets(root, taskId, files) {
	const dir = path.join(root, "docs", "tasks", taskId, "assets");
	fs.mkdirSync(dir, { recursive: true });
	for (const [name, bytes] of Object.entries(files)) {
		fs.writeFileSync(path.join(dir, name), bytes);
	}
}

function setup({ taskOverrides = {}, projectOverrides = {} } = {}) {
	const routes = new Map();
	const fakeApp = {
		post: (routePath, handler) => {
			routes.set(routePath, handler);
		},
		get: (routePath, handler) => {
			routes.set(routePath, handler);
		},
	};
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-flow-feedback-"));
	const task = {
		id: "task-1",
		projectId: "proj-1",
		currentStageId: "review",
		status: "waiting_human",
		goal: "Do it",
		history: [],
		...taskOverrides,
	};
	const taskStore = {
		eventBridge: null,
		engineState: { status: "idle" },
		getTask: vi.fn(() => task),
		rejectTask: vi.fn(() => ({ ...task, status: "in_stage" })),
		advanceStage: vi.fn(() => ({ ...task, currentStageId: "build" })),
		followUpTask: vi.fn(async () => task),
		steerTask: vi.fn(async () => task),
		updateTask: vi.fn(),
		_recordHistory: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => false),
	};
	const projectStore = {
		getProject: vi.fn(() => ({
			id: "proj-1",
			cwd: root,
			stages: STAGES,
			...projectOverrides,
		})),
	};
	const promptEngine = { curatePrompt: vi.fn(() => "curated") };
	return { routes, fakeApp, root, task, taskStore, projectStore, promptEngine };
}

async function register(s, extraDeps = {}) {
	await registerTaskFlowRoutes(s.fakeApp, {
		resolveAndGuardProject: (id) => id || "proj-1",
		getOrCreateSession: async () => null,
		projectStore: s.projectStore,
		taskStore: s.taskStore,
		promptEngine: s.promptEngine,
		agentRunner: null,
		claimStore: null,
		steerStore: null,
		executionLedger: null,
		...extraDeps,
	});
}

function makeReply() {
	const send = vi.fn();
	const status = vi.fn(() => ({ send }));
	return { status, send };
}

async function invoke(routes, routePath, body = {}) {
	const handler = routes.get(routePath);
	expect(handler).toBeTypeOf("function");
	const reply = makeReply();
	const result = await handler(
		{ body: { projectId: "proj-1", ...body }, params: { id: "task-1" } },
		reply,
	);
	return { result, reply };
}

describe("flow routes submit-time feedback validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reject: refuses dangling refs with 422 naming the file", async () => {
		const s = setup();
		try {
			await register(s);
			const { reply } = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "See ![gone](assets/gone.png) please take a look",
			});
			expect(reply.status).toHaveBeenCalledWith(422);
			expect(reply.send).toHaveBeenCalledWith(
				expect.objectContaining({
					code: FEEDBACK_VALIDATION_CODE,
					imageOnly: false,
				}),
			);
			const body = reply.send.mock.calls[0][0];
			expect(body.error).toContain("assets/gone.png");
			expect(body.missing).toEqual([
				expect.objectContaining({
					ref: "assets/gone.png",
					expectedPath: "docs/tasks/task-1/assets/gone.png",
				}),
			]);
			expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("reject: refuses the case-study shape (lone dangling image ref)", async () => {
		const s = setup();
		try {
			await register(s);
			const { reply } = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "![image.png](assets/image.png)",
			});
			expect(reply.status).toHaveBeenCalledWith(422);
			const body = reply.send.mock.calls[0][0];
			expect(body.code).toBe(FEEDBACK_VALIDATION_CODE);
			expect(body.missing.map((entry) => entry.ref)).toEqual([
				"assets/image.png",
			]);
			expect(body.imageOnly).toBe(true);
			expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("reject: refuses image-only drafts even when attached", async () => {
		const s = setup();
		seedAssets(s.root, "task-1", { "a.png": "bytes" });
		try {
			await register(s);
			const { reply } = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "![a](assets/a.png)",
			});
			expect(reply.status).toHaveBeenCalledWith(422);
			const body = reply.send.mock.calls[0][0];
			expect(body.missing).toEqual([]);
			expect(body.imageOnly).toBe(true);
			expect(body.error).toContain("only images");
			expect(s.taskStore.rejectTask).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("reject: accepts attached images with a note, byte-identical behavior", async () => {
		const s = setup();
		seedAssets(s.root, "task-1", { "a.png": "bytes" });
		try {
			await register(s);
			const { result, reply } = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "Broken on save — see ![a](assets/a.png)",
			});
			expect(reply.status).not.toHaveBeenCalled();
			expect(s.taskStore.rejectTask).toHaveBeenCalled();
			expect(result).toMatchObject({
				feedback: "Broken on save — see ![a](assets/a.png)",
			});
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("reject: accepts drifted-but-servable refs and external URLs", async () => {
		const s = setup();
		seedAssets(s.root, "task-1", { "shot.png": "bytes" });
		try {
			await register(s);
			const drifted = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "Compare ![a](assets/Shot.PNG) with main please",
			});
			expect(drifted.reply.status).not.toHaveBeenCalled();
			const external = await invoke(s.routes, "/tasks/:id/reject", {
				feedback: "See https://example.com/assets/x.png for context here",
			});
			expect(external.reply.status).not.toHaveBeenCalled();
			expect(s.taskStore.rejectTask).toHaveBeenCalledTimes(2);
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("advance: refuses dangling guidance, skips empty guidance", async () => {
		const s = setup();
		try {
			await register(s);
			const refused = await invoke(s.routes, "/tasks/:id/advance", {
				guidance: "See ![gone](assets/gone.png) please take a look",
			});
			expect(refused.reply.status).toHaveBeenCalledWith(422);
			expect(s.taskStore.advanceStage).not.toHaveBeenCalled();

			const empty = await invoke(s.routes, "/tasks/:id/advance", {});
			expect(empty.reply.status).not.toHaveBeenCalledWith(422);
			expect(s.taskStore.advanceStage).toHaveBeenCalledTimes(1);
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("follow-up: refuses dangling refs and image-only prompts", async () => {
		const s = setup();
		try {
			await register(s);
			const dangling = await invoke(s.routes, "/tasks/:id/follow-up", {
				prompt: "See ![gone](assets/gone.png) please take a look",
			});
			expect(dangling.reply.status).toHaveBeenCalledWith(422);
			const imageOnly = await invoke(s.routes, "/tasks/:id/follow-up", {
				prompt: "![a](assets/a.png)",
			});
			expect(imageOnly.reply.status).toHaveBeenCalledWith(422);
			expect(s.taskStore.followUpTask).not.toHaveBeenCalled();

			const healthy = await invoke(s.routes, "/tasks/:id/follow-up", {
				prompt: "Also cover the retry path please",
			});
			expect(healthy.reply.status).not.toHaveBeenCalled();
			expect(s.taskStore.followUpTask).toHaveBeenCalledTimes(1);
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("steer: refuses before the Runner-lease queue path", async () => {
		const s = setup();
		const steerStore = { queue: vi.fn(() => ({ steerId: "st-1" })) };
		const claimStore = {
			describe: vi.fn(() => ({
				runnerId: "r1",
				epoch: 3,
				executionId: "ex-1",
				projectId: "proj-1",
			})),
		};
		try {
			await register(s, { steerStore, claimStore });
			const { reply } = await invoke(s.routes, "/tasks/:id/steer", {
				guidance: "See ![gone](assets/gone.png) please take a look",
			});
			expect(reply.status).toHaveBeenCalledWith(422);
			expect(steerStore.queue).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("steer: refuses image-only guidance on the embedded path, accepts healthy", async () => {
		const s = setup();
		try {
			await register(s);
			const refused = await invoke(s.routes, "/tasks/:id/steer", {
				goal: "![a](assets/a.png)",
			});
			expect(refused.reply.status).toHaveBeenCalledWith(422);
			expect(s.taskStore.steerTask).not.toHaveBeenCalled();

			const healthy = await invoke(s.routes, "/tasks/:id/steer", {
				guidance: "Slow down and explain each step",
			});
			expect(healthy.reply.status).not.toHaveBeenCalled();
			expect(s.taskStore.steerTask).toHaveBeenCalledTimes(1);
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});
});
