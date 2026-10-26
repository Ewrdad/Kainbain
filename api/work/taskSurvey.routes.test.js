/***
 * MARK: taskSurvey.routes.test
 * @description Route tests for `GET/POST /tasks/:id/survey` (survey page
 *   read, answer merge, skip rules, and advance-on-completion).
 ***/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { registerTaskWorkRoutes, surveyOutputFileForRequest } from "./taskWorkRoutes.js";
import { appendSurveyRound } from "./taskSurvey.js";

const STAGES = [
	{ id: "s-1", name: "Ask", type: "agent", skills: [{ name: "question-me" }] },
	{ id: "s-2", name: "Plan", type: "agent" },
];

let tmp;
const stored = () => ({
	id: "t-1",
	projectId: "p-1",
	title: "Task one",
	goal: "Do thing",
	status: "waiting_human",
	currentStageId: "s-1",
	history: [],
	timeline: [],
});

function replyCapture() {
	const res = { statusCode: 200, body: undefined };
	return {
		reply: {
			status(code) {
				res.statusCode = code;
				return { send(body) { res.body = body; return body; } };
			},
		},
		res,
	};
}

async function setup(customStages) {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "survey-routes-"));
	const routes = new Map();
	const fakeApp = {
		get: (routePath, a, b) => routes.set(`GET ${routePath}`, b || a),
		post: (routePath, a, b) => routes.set(`POST ${routePath}`, b || a),
		patch: (routePath, handler) => routes.set(`PATCH ${routePath}`, handler),
		delete: (routePath, handler) => routes.set(`DELETE ${routePath}`, handler),
		log: { error: vi.fn() },
	};
	const task = stored();
	const taskStore = {
		getTask: vi.fn((pid, tid) => (tid === "ghost" ? undefined : { ...task })),
		updateTask: vi.fn(),
		_recordHistory: vi.fn((t, action) => t.history.push({ action })),
		advanceStage: vi.fn(() => ({ ...task, currentStageId: "s-2", status: "in_stage" })),
		moveToStage: vi.fn(),
	};
	const project = { id: "p-1", name: "P", cwd: tmp, stages: customStages || STAGES };
	const projectStore = { getProject: vi.fn(() => project) };
	await registerTaskWorkRoutes(fakeApp, {
		resolveAndGuardProject: () => "p-1",
		getOrCreateSession: vi.fn(),
		projectStore,
		taskStore,
		promptEngine: {},
		isAgentRunning: vi.fn(() => false),
		agentRunner: {},
	});
	const call = async (method, routePath, { params = {}, query = {}, body = {} } = {}) => {
		const handler = routes.get(`${method} ${routePath}`);
		if (!handler) throw new Error(`route missing: ${method} ${routePath}`);
		const { reply, res } = replyCapture();
		const out = await handler({ params, query, body }, reply);
		return { out: out === undefined ? res.body : out, res };
	};
	return { call, taskStore };
}

const q = (overrides = {}) => ({
	id: "q1",
	type: "single",
	text: "Pick one",
	options: ["a", "b"],
	required: true,
	showIf: null,
	...overrides,
});

describe("GET /tasks/:id/survey", () => {
	it("404s on unknown tasks and reports none when no file exists", async () => {
		const { call } = await setup();
		const ghost = await call("GET", "/tasks/:id/survey", { params: { id: "ghost" } });
		expect(ghost.res.statusCode).toBe(404);
		const { out } = await call("GET", "/tasks/:id/survey", { params: { id: "t-1" }, query: { projectId: "p-1" } });
		expect(out).toMatchObject({ taskId: "t-1", exists: false, status: "none" });
		expect(out.missing).toEqual([]);
	});

	it("returns rounds with missing required questions", async () => {
		const { call } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q()] });
		const { out } = await call("GET", "/tasks/:id/survey", { params: { id: "t-1" } });
		expect(out).toMatchObject({ exists: true, status: "pending" });
		expect(out.missing).toEqual([{ round: 1, id: "q1" }]);
		expect(out.rounds).toHaveLength(1);
	});
});

describe("POST /tasks/:id/survey", () => {
	it("rejects bad actions and non-object answers", async () => {
		const { call } = await setup();
		const badAction = await call("POST", "/tasks/:id/survey", { params: { id: "t-1" }, body: { projectId: "p-1", action: "nope" } });
		expect(badAction.res.statusCode).toBe(400);
		const badBody = await call("POST", "/tasks/:id/survey", { params: { id: "t-1" }, body: { projectId: "p-1", answers: ["q1"] } });
		expect(badBody.res.statusCode).toBe(400);
	});

	it("partial saves stay parked and complete saves advance", async () => {
		const { call, taskStore } = await setup();
		appendSurveyRound({
			cwd: tmp,
			project: null,
			taskId: "t-1",
			questions: [q({ id: "q1", required: false }), q({ id: "q2", showIf: { questionId: "q1", value: "a" } })],
		});
		const partial = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q1: { selected: ["a"] } } },
		});
		expect(partial.out).toMatchObject({ status: "pending", advanced: false });
		expect(partial.out.missing).toEqual([{ round: 1, id: "q2" }]);
		// The page re-renders from the save response: rounds must ride along.
		expect(partial.out.rounds).toHaveLength(1);
		expect(partial.out.rounds[0].answers.q1).toEqual({ selected: ["a"], notes: "" });
		expect(taskStore.advanceStage).not.toHaveBeenCalled();

		const done = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q2: { selected: ["b"], notes: "ok" } } },
		});
		expect(done.out).toMatchObject({ status: "answered", advanced: true, currentStageId: "s-2" });
		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("skip advances a missing survey file (nothing was ever asked)", async () => {
		const { call, taskStore } = await setup();
		const skipped = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", action: "skip" },
		});
		expect(skipped.out).toMatchObject({ status: "none", advanced: true });
		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("skip advances an empty survey but refuses pending questions", async () => {
		const { call, taskStore } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [] });
		const skipped = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", action: "skip" },
		});
		expect(skipped.out).toMatchObject({ status: "empty", advanced: true });
		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("never advances twice: a re-submit after the task moved on stays put", async () => {
		const { call, taskStore } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q()] });
		taskStore.getTask.mockImplementation(() => ({ ...stored(), status: "in_stage", currentStageId: "s-2" }));
		const again = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q1: { selected: ["a"] } } },
		});
		expect(again.out).toMatchObject({ status: "answered", advanced: false });
		expect(taskStore.advanceStage).not.toHaveBeenCalled();
	});

	it("skip on pending questions 400s with the missing list", async () => {
		const { call } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q()] });
		const { res } = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", action: "skip" },
		});
		expect(res.statusCode).toBe(400);
		expect(res.body.missing).toEqual([{ round: 1, id: "q1" }]);
	});

	it("refuses to advance a non-survey wait even when answers are complete", async () => {
		const { call, taskStore } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q({ required: false })] });
		// Parked at s-2 (no question-me skill, no park flag): a human
		// checkpoint opened at the survey URL by hand must never skip
		// approval through this route.
		taskStore.getTask.mockImplementation(() => ({ ...stored(), currentStageId: "s-2", surveyPending: false }));
		const done = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q1: { selected: ["a"] } } },
		});
		expect(done.out).toMatchObject({ status: "answered", advanced: false });
		expect(done.out.note).toMatch(/not parked at a survey stage/);
		expect(taskStore.advanceStage).not.toHaveBeenCalled();
	});

	it("advances on the persisted park flag alone when the stage skill is gone", async () => {
		const { call, taskStore } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [] });
		// Restart/pipeline-edit path: the flag survived in task.md while the
		// stage no longer carries the skill. Still a genuine handoff.
		taskStore.getTask.mockImplementation(() => ({ ...stored(), currentStageId: "s-2", surveyPending: true }));
		const skipped = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", action: "skip" },
		});
		expect(skipped.out).toMatchObject({ status: "empty", advanced: true });
		expect(taskStore.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("invalid answers 400 without touching the file", async () => {
		const { call } = await setup();
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q()] });
		const filePath = path.join(tmp, "docs", "tasks", "t-1", "SURVEY.md");
		const before = fs.readFileSync(filePath, "utf8");
		const { res } = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q1: { selected: ["zzz"] } } },
		});
		expect(res.statusCode).toBe(400);
		expect(fs.readFileSync(filePath, "utf8")).toBe(before);
	});
});

describe("taskWorkRoutes survey wiring", () => {
	it("registers both survey routes", async () => {
		const { call } = await setup();
		await expect(call("GET", "/tasks/:id/survey", { params: { id: "t-1" } })).resolves.toBeDefined();
	});
});

describe("configurable survey file routes", () => {
	const FEEDBACK_STAGES = [
		{ id: "s-1", name: "Ask", type: "agent", skills: [{ name: "question-me", config: { outputFile: "FEEDBACK.md" } }] },
		{ id: "s-2", name: "Plan", type: "agent" },
	];

	it("reads and saves the stage-configured file, leaving SURVEY.md alone", async () => {
		const { call } = await setup(FEEDBACK_STAGES);
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", outputFile: "FEEDBACK.md", questions: [q()] });
		const { out } = await call("GET", "/tasks/:id/survey", { params: { id: "t-1" } });
		expect(out).toMatchObject({ outputFile: "FEEDBACK.md", surveyFile: "FEEDBACK.md", exists: true, status: "pending" });
		expect(fs.existsSync(path.join(tmp, "docs", "tasks", "t-1", "SURVEY.md"))).toBe(false);

		const saved = await call("POST", "/tasks/:id/survey", {
			params: { id: "t-1" },
			body: { projectId: "p-1", answers: { q1: { selected: ["a"] } } },
		});
		expect(saved.out).toMatchObject({ outputFile: "FEEDBACK.md", status: "answered", advanced: true });
	});

	it("fails safe to the default file on traversal query values", async () => {
		const { call } = await setup(FEEDBACK_STAGES);
		appendSurveyRound({ cwd: tmp, project: null, taskId: "t-1", questions: [q()] });
		const { out } = await call("GET", "/tasks/:id/survey", {
			params: { id: "t-1" },
			query: { file: "../evil.md" },
		});
		expect(out.outputFile).toBe("SURVEY.md");
		expect(out.exists).toBe(true);
	});
});

describe("surveyOutputFileForRequest", () => {
	const task = { id: "t-1", currentStageId: "s-1" };
	const project = { stages: [{ id: "s-1", skills: [{ name: "question-me", config: { outputFile: "FEEDBACK.md" } }] }] };

	it("prefers an explicit request file, then the stage config, then the default", () => {
		expect(surveyOutputFileForRequest(task, project, { query: { file: "INTENT_SURVEY.md" } })).toBe("INTENT_SURVEY.md");
		expect(surveyOutputFileForRequest(task, project, {})).toBe("FEEDBACK.md");
		expect(surveyOutputFileForRequest(task, { stages: [] }, {})).toBe("SURVEY.md");
	});

	it("prefers the persisted file only when no later question-me stage exists", () => {
		const persisted = { id: "t-1", currentStageId: "s-2", surveyFile: "OLD.md" };
		const later = { stages: [
			{ id: "s-1", skills: [{ name: "question-me", config: { outputFile: "OLD.md" } }] },
			{ id: "s-2", skills: [{ name: "question-me", config: { outputFile: "NEW.md" } }] },
		] };
		expect(surveyOutputFileForRequest(persisted, later, {})).toBe("NEW.md");
		expect(surveyOutputFileForRequest(persisted, { stages: [{ id: "s-2" }] }, {})).toBe("OLD.md");
	});
});
