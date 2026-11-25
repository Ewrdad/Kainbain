/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FEEDBACK_VALIDATION_CODE } from "../../shared/feedbackValidation/index.js";

const { default: reviewRoutes } = await import("./review.js");

function setup({ files = {} } = {}) {
	const routes = new Map();
	const capture = (method) => (routePath, ...rest) => {
		routes.set(`${method} ${routePath}`, rest[rest.length - 1]);
	};
	const fakeApp = {
		get: capture("GET"),
		post: capture("POST"),
		patch: capture("PATCH"),
		delete: capture("DELETE"),
	};
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-review-feedback-"));
	const assetsDir = path.join(root, "docs", "tasks", "task-1", "assets");
	fs.mkdirSync(assetsDir, { recursive: true });
	for (const [name, bytes] of Object.entries(files)) {
		fs.writeFileSync(path.join(assetsDir, name), bytes);
	}
	const task = { id: "task-1", projectId: "proj-1" };
	const project = { id: "proj-1", cwd: root, useBranches: false };
	const taskStore = {
		getTask: vi.fn(() => task),
		getTaskReports: vi.fn(() => []),
	};
	const projectStore = { getProject: vi.fn(() => project) };
	const eventBridge = { broadcastGlobal: vi.fn() };
	return { routes, fakeApp, root, task, project, taskStore, projectStore, eventBridge };
}

async function register(s) {
	await reviewRoutes(s.fakeApp, {
		deps: {
			projectStore: s.projectStore,
			taskStore: s.taskStore,
			eventBridge: s.eventBridge,
			resolveAndGuardProject: (id) => id || "proj-1",
		},
	});
}

function makeReply() {
	const send = vi.fn();
	const status = vi.fn(() => ({ send }));
	return { status, send };
}

async function invoke(routes, method, routePath, { body = {}, params = {} } = {}) {
	const handler = routes.get(`${method} ${routePath}`);
	expect(handler).toBeTypeOf("function");
	const reply = makeReply();
	const result = await handler(
		{
			body: { projectId: "proj-1", ...body },
			params: { projectId: "proj-1", taskId: "task-1", ...params },
			query: {},
		},
		reply,
	);
	return { result, reply };
}

const COMMENTS = "/projects/:projectId/tasks/:taskId/review/comments";
const COMMENT_ONE =
	"/projects/:projectId/tasks/:taskId/review/comments/:commentId";
const REPLIES =
	"/projects/:projectId/tasks/:taskId/review/comments/:commentId/replies";

describe("review routes submit-time feedback validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("comment create: refuses dangling refs with 422 naming the file", async () => {
		const s = setup();
		try {
			await register(s);
			const { reply } = await invoke(s.routes, "POST", COMMENTS, {
				body: {
					scope: "file",
					filePath: "src/app.js",
					body: "See ![gone](assets/gone.png) please take a look",
				},
			});
			expect(reply.status).toHaveBeenCalledWith(422);
			const sent = reply.send.mock.calls[0][0];
			expect(sent.code).toBe(FEEDBACK_VALIDATION_CODE);
			expect(sent.error).toContain("assets/gone.png");
			expect(sent.missing).toEqual([
				expect.objectContaining({ ref: "assets/gone.png" }),
			]);
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("comment create: refuses image-only bodies, accepts healthy ones", async () => {
		const s = setup({ files: { "a.png": "bytes" } });
		try {
			await register(s);
			const refused = await invoke(s.routes, "POST", COMMENTS, {
				body: { scope: "file", filePath: "src/app.js", body: "![a](assets/a.png)" },
			});
			expect(refused.reply.status).toHaveBeenCalledWith(422);
			expect(refused.reply.send.mock.calls[0][0].imageOnly).toBe(true);

			const healthy = await invoke(s.routes, "POST", COMMENTS, {
				body: {
					scope: "file",
					filePath: "src/app.js",
					body: "Broken here — see ![a](assets/a.png)",
				},
			});
			expect(healthy.reply.status).not.toHaveBeenCalled();
			expect(healthy.result).toMatchObject({
				body: "Broken here — see ![a](assets/a.png)",
			});
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("comment update: refuses dangling body edits, skips resolved-only toggles", async () => {
		const s = setup();
		try {
			await register(s);
			const created = await invoke(s.routes, "POST", COMMENTS, {
				body: {
					scope: "file",
					filePath: "src/app.js",
					body: "Needs a null check here please",
				},
			});
			const commentId = created.result.id;

			const refused = await invoke(s.routes, "PATCH", COMMENT_ONE, {
				body: { body: "See ![gone](assets/gone.png) please take a look" },
				params: { commentId },
			});
			expect(refused.reply.status).toHaveBeenCalledWith(422);

			const toggled = await invoke(s.routes, "PATCH", COMMENT_ONE, {
				body: { resolved: true },
				params: { commentId },
			});
			expect(toggled.reply.status).not.toHaveBeenCalled();
			expect(toggled.result).toMatchObject({ resolved: true });
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});

	it("reply: refuses dangling refs, accepts healthy replies", async () => {
		const s = setup();
		try {
			await register(s);
			const created = await invoke(s.routes, "POST", COMMENTS, {
				body: {
					scope: "file",
					filePath: "src/app.js",
					body: "Needs a null check here please",
				},
			});
			const commentId = created.result.id;

			const refused = await invoke(s.routes, "POST", REPLIES, {
				body: { body: "See ![gone](assets/gone.png) please take a look" },
				params: { commentId },
			});
			expect(refused.reply.status).toHaveBeenCalledWith(422);
			expect(refused.reply.send.mock.calls[0][0].error).toContain(
				"assets/gone.png",
			);

			const healthy = await invoke(s.routes, "POST", REPLIES, {
				body: { body: "Good catch, fixing it now" },
				params: { commentId },
			});
			expect(healthy.reply.status).not.toHaveBeenCalled();
			expect(healthy.result).toMatchObject({ body: "Good catch, fixing it now" });
		} finally {
			fs.rmSync(s.root, { recursive: true, force: true });
		}
	});
});
