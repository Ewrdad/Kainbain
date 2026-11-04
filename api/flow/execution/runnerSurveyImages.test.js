/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRunnerReport } from "./applyRunnerReport.js";
import { appendSurveyRound } from "../../work/taskSurvey.js";
import { parseSurvey } from "../../../shared/survey.js";

/***
 * MARK: runner survey-images parity test
 * @description Proves the Runner-report finish path parks for a human survey
 *   AND kicks the same background image job as the embedded path (a remote
 *   run illustrates its survey identically).
 ***/

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

describe("applyRunnerReport survey images", () => {
	it("parks and illustrates image questions like the embedded path", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-survey-img-"));
		tempDirs.push(cwd);
		const taskId = "t-runner-img-1";
		const stages = [
			{ id: "ask", name: "Ask", type: "agent", skills: [{ name: "question-me", config: { imageGen: "mock" } }] },
			{ id: "plan", name: "Plan", type: "agent" },
		];
		const project = { id: "p1", name: "P1", cwd, stages };
		const task = {
			id: taskId,
			projectId: "p1",
			goal: "runner illustrated survey",
			status: "in_stage",
			currentStageId: "ask",
			history: [],
		};
		const store = {
			eventBridge: {},
			getTask: () => task,
			_saveTaskMarkdown: () => {},
		};
		const projectStore = { getProject: () => project };
		// The Runner wrote the survey through its file tools before reporting.
		appendSurveyRound({
			cwd,
			project: null,
			taskId,
			stage: "ask",
			questions: [
				{ id: "qi", type: "image", text: "Pick a design", options: ["dark dashboard", "light dashboard"], required: true, showIf: null },
			],
		});

		const result = await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId,
			outcome: { status: "passed", output: "survey written", runnerId: "r1", harnessId: "pi" },
		});
		expect(result.advanced).toBe(false);
		expect(result.status).toBe("waiting_human");
		expect(task.status).toBe("waiting_human");

		const surveyPath = path.join(cwd, "docs", "tasks", taskId, "SURVEY.md");
		let images = [];
		for (let attempt = 0; attempt < 100 && images.filter((e) => e?.status === "ready").length < 2; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 50));
			images = parseSurvey(fs.readFileSync(surveyPath, "utf8")).rounds[0]?.questions[0]?.images || [];
		}
		expect(images.map((e) => e.status)).toEqual(["ready", "ready"]);
		expect(fs.existsSync(path.join(cwd, "docs", "tasks", taskId, "assets", "survey-r1-qi-0.png"))).toBe(true);
	}, 30000);
});
