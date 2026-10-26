/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { appendSurveyRound } from "../work/taskSurvey.js";

/***
 * MARK: question-me engine gate tests
 * @description Proves the stageExecution hook at the executeStage level: a
 *   finished agent stage carrying the `question-me` skill parks the task as
 *   `waiting_human` (no auto-advance) while unanswered questions exist, and
 *   advances normally when the agent explicitly asked nothing or the skill is
 *   absent. The mock agent writes SURVEY.md exactly like a real agent would
 *   through its file tools.
 ***/

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

const tempDirs = [];
afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function makeStore() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-survey-"));
	tempDirs.push(dir);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, "init", "-b", "master");
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
	const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, dir };
}

const STAGES = [
	{ id: "ask", name: "Ask", type: "agent", prompt: "Ask me things", skills: [{ name: "question-me" }] },
	{ id: "plan", name: "Plan", type: "agent", prompt: "Make a plan" },
];

function writerAgent(surveyQuestions) {
	return async (prompt, { cwd } = {}) => {
		expect(String(prompt)).toContain("Ask me things");
		if (surveyQuestions !== null) {
			const taskDirs = fs
				.readdirSync(path.join(cwd, "docs", "tasks"), { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
			// The task folder is the only one under docs/tasks in these tests.
			const taskId = taskDirs.find((name) => name.startsWith("t-") || name.length > 0);
			appendSurveyRound({ cwd, project: null, taskId, stage: "ask", questions: surveyQuestions });
		}
		return "survey written";
	};
}

describe("question-me engine gate", () => {
	it("parks for a human survey instead of auto-advancing when questions are unanswered", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", { goal: "survey park", stageId: "ask", projectCwd: dir });
		const result = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
			agentRunner: writerAgent([
				{ id: "q1", type: "single", text: "Pick one", options: ["a", "b"], required: true, showIf: null },
			]),
		});

		expect(result.status).toBe("waiting_human");
		expect(result.surveyStatus).toBe("pending");
		const parked = store.getTask("p1", task.id);
		expect(parked.status).toBe("waiting_human");
		expect(parked.currentStageId).toBe("ask");
		expect(parked.history.some((h) => String(h.action).includes("question-me"))).toBe(true);
		// The park flag must survive a restart: it is persisted to task.md so
		// the survey entry points keep working after reload.
		expect(parked.surveyPending).toBe(true);
		const taskMd = fs.readFileSync(path.join(dir, "docs", "tasks", task.id, "task.md"), "utf8");
		expect(taskMd).toContain("surveyPending: true");
	});

	it("parks when the agent wrote no SURVEY.md at all", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", { goal: "no survey file", stageId: "ask", projectCwd: dir });
		const result = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
			agentRunner: writerAgent(null),
		});
		expect(result.status).toBe("waiting_human");
		expect(result.surveyStatus).toBe("none");
		expect(store.getTask("p1", task.id).currentStageId).toBe("ask");
	});

	it("advances normally when the agent explicitly asked nothing (empty round)", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", { goal: "empty survey", stageId: "ask", projectCwd: dir });
		const result = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
			agentRunner: writerAgent([]),
		});
		expect(result.status).toBe("passed");
		expect(store.getTask("p1", task.id).currentStageId).toBe("plan");
	});

	it("parks on the stage-configured file and persists it for restarts", async () => {
		const { store, dir } = makeStore();
		const custom = [
			{ id: "ask", name: "Ask", type: "agent", prompt: "Ask me things", skills: [{ name: "question-me", config: { outputFile: "FEEDBACK.md" } }] },
			{ id: "plan", name: "Plan", type: "agent", prompt: "Make a plan" },
		];
		const task = store.createTask("p1", { goal: "custom survey file", stageId: "ask", projectCwd: dir });
		const writer = async (prompt, { cwd } = {}) => {
			const taskDirs = fs
				.readdirSync(path.join(cwd, "docs", "tasks"), { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
			const taskId = taskDirs.find((name) => name.length > 0);
			appendSurveyRound({ cwd, project: null, taskId, stage: "ask", outputFile: "FEEDBACK.md", questions: [
				{ id: "q1", type: "single", text: "Pick one", options: ["a", "b"], required: true, showIf: null },
			] });
			return "survey written";
		};
		const result = await store.executeStage("p1", task.id, {
			stages: custom,
			projectCwd: dir,
			agentRunner: writer,
		});

		expect(result.status).toBe("waiting_human");
		const parked = store.getTask("p1", task.id);
		expect(parked.surveyFile).toBe("FEEDBACK.md");
		const taskMd = fs.readFileSync(path.join(dir, "docs", "tasks", task.id, "task.md"), "utf8");
		expect(taskMd).toContain('surveyFile: "FEEDBACK.md"');
		expect(fs.existsSync(path.join(dir, "docs", "tasks", task.id, "SURVEY.md"))).toBe(false);
	});

	it("ignores the gate entirely without the skill", async () => {
		const { store, dir } = makeStore();
		const plain = [
			{ id: "ask", name: "Ask", type: "agent", prompt: "Ask me things" },
			{ id: "plan", name: "Plan", type: "agent", prompt: "Make a plan" },
		];
		const task = store.createTask("p1", { goal: "no skill", stageId: "ask", projectCwd: dir });
		const result = await store.executeStage("p1", task.id, {
			stages: plain,
			projectCwd: dir,
			agentRunner: async () => "done",
		});
		expect(result.status).toBe("passed");
		expect(store.getTask("p1", task.id).currentStageId).toBe("plan");
	});
});
