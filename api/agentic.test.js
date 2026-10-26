import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so the fixture project can
// never touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projectStore.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("./index.js");
const { taskStore } = await import("./taskStore.js");
const { eventBridge } = await import("./eventBridge.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Agentic Behavior End-to-End Tests
 * @description Verifies that Pi agent sessions spin up from the project root,
 * execute tool calls (e.g., file writes, bash commands), stream real-time logs,
 * generate filesystem-backed markdown stage reports with modified files, and advance through pipeline stages.
 ***/
describe("Agentic End-to-End Pipeline & Tool Execution", () => {
	let testProject;
	let testCwd;

	beforeAll(async () => {
		await app.ready();
		testCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-agentic-test-"));
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Agentic Verification Project",
				cwd: testCwd,
				gitUrl: "https://git.example.com/team/fixture.git",
			},
		});
		testProject = JSON.parse(projRes.payload);
	});

	it("should execute an agent stage, execute tools, record modified files, advance — and write NO report by default", async () => {
		// 1. Create a task in Idea stage (agent)
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: testProject.id,
				title: "Implement Math Module",
				goal: "Create a math.js module with add and multiply functions and verify it.",
				stageId: "1",
			},
		});
		expect(createRes.statusCode).toBe(200);
		const createdTask = JSON.parse(createRes.payload);
		expect(createdTask.id).toBeTruthy();
		expect(createdTask.currentStageId).toBe("1");

		// 2. Track EventBridge events
		const emittedEvents = [];
		const origEmitProcessEvent = eventBridge.emitProcessEvent.bind(eventBridge);
		eventBridge.emitProcessEvent = async (sessionId, eventName, payload) => {
			emittedEvents.push({ sessionId, eventName, payload });
			return origEmitProcessEvent(sessionId, eventName, payload);
		};

		// 3. Define an agent runner that simulates realistic agent tool execution
		const mockAgentRunner = async (prompt, { onChunk }) => {
			onChunk?.("[AGENT] Analyzing prompt and repository structure...\n");

			// Simulate tool execution: write math.js
			const toolArgs = { path: "src/math.js", content: "export const add = (a, b) => a + b;\nexport const mul = (a, b) => a * b;" };
			onChunk?.(`[TOOL] write(${JSON.stringify(toolArgs)})\n`);

			// Actually perform the file write to verify real disk effect
			const targetDir = path.join(testCwd, "src");
			fs.mkdirSync(targetDir, { recursive: true });
			fs.writeFileSync(path.join(targetDir, "math.js"), toolArgs.content, "utf8");

			onChunk?.("[RESULT] File created at src/math.js (64 bytes)\n");
			onChunk?.("[AGENT] Math utility created successfully. All tests passing.\n");

			return {
				output: "Successfully created src/math.js with add and multiply functions.",
				summary: "Created src/math.js with basic arithmetic functions.",
				modifiedFiles: ["src/math.js"],
			};
		};

		// 4. Execute the stage
		const result = await taskStore.executeStage(testProject.id, createdTask.id, {
			stages: testProject.stages,
			projectCwd: testCwd,
			agentRunner: mockAgentRunner,
			priority: "high",
		});

		expect(result).toBeTruthy();
		expect(result.status).toBe("passed");
		expect(result.modifiedFiles).toContain("src/math.js");

		// 5. Verify the disk file was actually created by the tool execution
		const createdFilePath = path.join(testCwd, "src", "math.js");
		expect(fs.existsSync(createdFilePath)).toBe(true);
		expect(fs.readFileSync(createdFilePath, "utf8")).toContain("add = (a, b)");

		// 6. Verify task updated and advanced to Stage 2 (Technical Elab)
		const updatedTask = taskStore.getTask(testProject.id, createdTask.id);
		expect(updatedTask.currentStageId).toBe("2");
		const updatedLogText = (updatedTask.logEntries || [])
			.map((e) => e.text)
			.join("\n");
		expect(updatedLogText).toContain("[TOOL] write(");
		expect(updatedLogText).toContain("src/math.js");

		// 7. DEFAULT agent stages write NO report on success (auto-report
		//    is opt-in via `stage.report` or the `stage-report` skill).
		const reports = taskStore.getTaskReports(testProject.id, createdTask.id, testCwd);
		expect(reports.length).toBe(0);
		expect(updatedTask.outputReport || "").toBe("");

		// 8. Verify EventBridge broadcasted process stdout and stage transitions
		expect(emittedEvents.some((e) => e.eventName === "stage:enter")).toBe(true);
		expect(emittedEvents.some((e) => e.eventName === "process:stdout")).toBe(true);
		expect(emittedEvents.some((e) => e.eventName === "stage:complete")).toBe(true);

		// Restore EventBridge
		eventBridge.emitProcessEvent = origEmitProcessEvent;
	});

	it("should write exactly one success report when the stage opts in via `report: true`", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: testProject.id,
				title: "Reporting Opt-In",
				goal: "Verify an opt-in stage still gets its structured report.",
				stageId: "1",
			},
		});
		expect(createRes.statusCode).toBe(200);
		const createdTask = JSON.parse(createRes.payload);

		const optedInStages = testProject.stages.map((s) =>
			s.id === "1" ? { ...s, report: true } : s,
		);

		const result = await taskStore.executeStage(testProject.id, createdTask.id, {
			stages: optedInStages,
			projectCwd: testCwd,
			agentRunner: async () => ({
				output: "did the thing",
				summary: "did the thing successfully",
				modifiedFiles: [],
			}),
		});
		expect(result.status).toBe("passed");

		const reports = taskStore.getTaskReports(testProject.id, createdTask.id, testCwd);
		expect(reports.length).toBe(1);
		const latestReport = reports[0];
		expect(latestReport.content).toContain("# Stage Report");
		expect(latestReport.content.toUpperCase()).toContain("PASSED");
	});

	it("should handle stage failure and route back via failback policy", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: testProject.id,
				title: "Failing Operation",
				goal: "This operation will fail to test failback routing.",
				stageId: "2", // Technical Elab, failback is 'previous' -> Stage 1
			},
		});
		const task = JSON.parse(createRes.payload);

		const failingAgentRunner = async () => {
			throw new Error("Compilation error: undefined symbol in test runner");
		};

		const result = await taskStore.executeStage(testProject.id, task.id, {
			stages: testProject.stages,
			projectCwd: testCwd,
			agentRunner: failingAgentRunner,
		});

		expect(result.status).toBe("retrying");
		expect(result.error).toContain("Compilation error");

		// Verify task routed back to stage 1 per failback policy and left for
		// automatic re-execution (auto-iteration enabled by default).
		const failedTask = taskStore.getTask(testProject.id, task.id);
		expect(failedTask.currentStageId).toBe("1");
		expect(failedTask.status).toBe("in_stage");
		expect(failedTask.autoRetrying).toBe(true);
		expect((failedTask.logEntries || []).map((e) => e.text).join("\n")).toContain(
			"[ERROR]",
		);

		// Verify failure report was generated
		const reports = taskStore.getTaskReports(testProject.id, task.id, testCwd);
		expect(reports.some((r) => r.content.toUpperCase().includes("FAILED"))).toBe(true);
	});

	// Drives POST /tasks/:id/execute WITHOUT an injected agent runner, so in a
	// bare run (no NODE_ENV=test) it would spin up a real pi session and invoke
	// a live model runtime — see the TEST ENV CONTRACT in api/sessionStore.js.
	// It is gated to the mock seam; bare runs skip it (describe.skipIf precedent
	// in agent/git.integration.test.js). Tests 1–2 inject mock runners and stay
	// unskipped.
	it.skipIf(process.env.NODE_ENV !== "test")(
		"should trigger stage execution via POST /tasks/:id/execute and stream logs",
		async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: testProject.id,
				title: "API Execution Test",
				goal: "Verify HTTP execute endpoint.",
				stageId: "1",
			},
		});
		const task = JSON.parse(createRes.payload);

		const execRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/execute`,
			payload: {
				projectId: testProject.id,
			},
		});

		expect(execRes.statusCode).toBe(200);
		const execResult = JSON.parse(execRes.payload);
		expect(execResult.task).toBeTruthy();
		expect(execResult.task.id).toBe(task.id);
	});
});
