import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerTaskWatchRoutes } from "./taskWatchRoutes.js";

function setup({ guardProjectId = "p-1" } = {}) {
	const routes = new Map();
	const fakeApp = {
		get: (routePath, a, b) => routes.set(`GET ${routePath}`, b || a),
		post: (routePath, handler) => routes.set(`POST ${routePath}`, handler),
		log: { error: vi.fn() },
	};
	const stored = { id: "t-1", projectId: "p-1", title: "Task one" };
	const taskStore = {
		getTask: vi.fn(() => ({ ...stored })),
		getTaskLogFeed: vi.fn(() => ({ entries: [] })),
		getTaskReports: vi.fn(() => []),
		saveStageReport: vi.fn(() => ({ id: "r-1" })),
	};
	const projectStore = { getProject: vi.fn(() => ({ id: "p-1", cwd: "/repo" })) };
	const stuckChecker = { checkStuck: vi.fn(async () => ({ stuck: false })) };
	const deps = {
		resolveAndGuardProject: vi.fn(() => guardProjectId),
		projectStore,
		taskStore,
		stuckChecker,
	};
	return { routes, fakeApp, stored, taskStore, projectStore, stuckChecker, deps };
}

async function register(s) {
	await registerTaskWatchRoutes(s.fakeApp, s.deps);
	return s;
}

function reply() {
	const send = vi.fn();
	return { status: vi.fn(() => ({ send })), send };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /tasks/:id/logs", () => {
	it("returns the requested feed with defaults", async () => {
		const s = await register(setup());
		const payload = { entries: [{ id: "1" }] };
		s.taskStore.getTaskLogFeed = vi.fn(() => payload);
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const result = await s.routes.get("GET /tasks/:id/logs")(
			{ params: { id: "t-1" }, query: { projectId: "p-1" } },
			reply(),
		);
		expect(s.taskStore.getTaskLogFeed).toHaveBeenCalledWith("p-1", "t-1", {
			feed: "main",
			format: "entries",
		});
		expect(result).toBe(payload);
	});

	it("passes explicit feed and format through", async () => {
		const s = await register(setup());
		await s.routes.get("GET /tasks/:id/logs")(
			{ params: { id: "t-1" }, query: { projectId: "p-1", feed: "tools", format: "text" } },
			reply(),
		);
		expect(s.taskStore.getTaskLogFeed).toHaveBeenCalledWith("p-1", "t-1", {
			feed: "tools",
			format: "text",
		});
	});

	it("rejects unknown feeds and formats with 400", async () => {
		const s = await register(setup());
		const badFeed = reply();
		await s.routes.get("GET /tasks/:id/logs")(
			{ params: { id: "t-1" }, query: { projectId: "p-1", feed: "nope" } },
			badFeed,
		);
		expect(badFeed.status).toHaveBeenCalledWith(400);
		expect(badFeed.send).toHaveBeenCalledWith({
			error: "Unknown log feed 'nope' (expected main, thinking, tools, telemetry or raw)",
		});
		const badFormat = reply();
		await s.routes.get("GET /tasks/:id/logs")(
			{ params: { id: "t-1" }, query: { projectId: "p-1", format: "pdf" } },
			badFormat,
		);
		expect(badFormat.status).toHaveBeenCalledWith(400);
		expect(badFormat.send).toHaveBeenCalledWith({
			error: "Unknown log format 'pdf' (expected entries or text)",
		});
	});

	it("returns 404 when the task has no feed and undefined without a project", async () => {
		const s = await register(setup());
		s.taskStore.getTaskLogFeed = vi.fn(() => null);
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("GET /tasks/:id/logs")(
			{ params: { id: "ghost" }, query: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("GET /tasks/:id/logs")(
				{ params: { id: "t-1" }, query: {} },
				reply(),
			),
		).resolves.toBeUndefined();
	});
});

describe("POST /tasks/:id/stuck-check", () => {
	it("runs the stuck check with the request fields", async () => {
		const s = await register(setup());
		s.stuckChecker.checkStuck = vi.fn(async () => ({ stuck: true, reason: "quiet" }));
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const result = await s.routes.get("POST /tasks/:id/stuck-check")(
			{
				params: { id: "t-1" },
				body: { projectId: "p-1", model: "m", harness: "pi", question: "stuck?" },
			},
			reply(),
		);
		expect(s.stuckChecker.checkStuck).toHaveBeenCalledWith({
			projectId: "p-1",
			taskId: "t-1",
			model: "m",
			harness: "pi",
			question: "stuck?",
		});
		expect(result).toEqual({ stuck: true, reason: "quiet" });
	});

	it("returns 404 for unknown tasks and undefined without a project", async () => {
		const s = await register(setup());
		s.taskStore.getTask = vi.fn(() => undefined);
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("POST /tasks/:id/stuck-check")(
			{ params: { id: "ghost" }, body: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("POST /tasks/:id/stuck-check")(
				{ params: { id: "t-1" }, body: {} },
				reply(),
			),
		).resolves.toBeUndefined();
	});

	it("maps checker failures to their status code, defaulting to 502", async () => {
		const s = await register(setup());
		const coded = Object.assign(new Error("bad model"), { statusCode: 400 });
		s.stuckChecker.checkStuck = vi.fn(async () => {
			throw coded;
		});
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("POST /tasks/:id/stuck-check")(
			{ params: { id: "t-1" }, body: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.send).toHaveBeenCalledWith({ error: "bad model" });
		expect(s.fakeApp.log.error).toHaveBeenCalled();

		s.stuckChecker.checkStuck = vi.fn(async () => {
			throw new Error("");
		});
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const fallback = reply();
		await s.routes.get("POST /tasks/:id/stuck-check")(
			{ params: { id: "t-1" }, body: { projectId: "p-1" } },
			fallback,
		);
		expect(fallback.status).toHaveBeenCalledWith(502);
		expect(fallback.send).toHaveBeenCalledWith({ error: "Stuck check failed" });
	});
});

describe("GET /tasks/:id/reports", () => {
	it("dedupes reports by filename or path", async () => {
		const s = await register(setup());
		s.taskStore.getTaskReports = vi.fn(() => [
			{ filename: "a.md", content: "1" },
			{ filename: "a.md", content: "2" },
			{ path: "/x/b.md", content: "3" },
			{ path: "/x/b.md", content: "4" },
			{ content: "keyless" },
		]);
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const result = await s.routes.get("GET /tasks/:id/reports")(
			{ params: { id: "t-1" }, query: { projectId: "p-1" } },
			reply(),
		);
		expect(s.taskStore.getTaskReports).toHaveBeenCalledWith("p-1", "t-1", "/repo");
		expect(result).toEqual([
			{ filename: "a.md", content: "1" },
			{ path: "/x/b.md", content: "3" },
		]);
	});

	it("accepts the project id from the body and undefined without a project", async () => {
		const s = await register(setup());
		const result = await s.routes.get("GET /tasks/:id/reports")(
			{ params: { id: "t-1" }, query: {}, body: { projectId: "p-1" } },
			reply(),
		);
		expect(s.deps.resolveAndGuardProject).toHaveBeenCalledWith("p-1", expect.anything());
		expect(result).toEqual([]);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("GET /tasks/:id/reports")(
				{ params: { id: "t-1" }, query: {} },
				reply(),
			),
		).resolves.toBeUndefined();
	});
});

describe("POST /tasks/:id/report", () => {
	it("saves a manual report and confirms creation", async () => {
		const s = await register(setup());
		const result = await s.routes.get("POST /tasks/:id/report")(
			{
				params: { id: "t-1" },
				body: { projectId: "p-1", stageName: "Build", content: "# report" },
			},
			reply(),
		);
		expect(s.taskStore.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ stageName: "Build", content: "# report", auto: false }),
		);
		expect(result).toEqual({ status: "created", report: { id: "r-1" } });
	});

	it("returns 404 when the task is unknown and undefined without a project", async () => {
		const s = await register(setup());
		s.taskStore.saveStageReport = vi.fn(() => null);
		await registerTaskWatchRoutes(s.fakeApp, s.deps);
		const res = reply();
		await s.routes.get("POST /tasks/:id/report")(
			{ params: { id: "ghost" }, body: { projectId: "p-1" } },
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
		const guarded = await register(setup({ guardProjectId: null }));
		await expect(
			guarded.routes.get("POST /tasks/:id/report")(
				{ params: { id: "t-1" }, body: {}, query: { projectId: "p-1" } },
				reply(),
			),
		).resolves.toBeUndefined();
	});
});
