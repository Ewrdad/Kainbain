import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { taskStore } from "../taskStore.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — the config loader snapshots process.env at first
// evaluation, so no fixture in this file can ever touch the live projects
// root or the live SilverBullet notes space.

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: seedTestProject
 * @description Registers a dedicated fixture project under the throwaway
 * roots so task writes stay inside the temp notes space.
 * @example seedTestProject("Task API Test Project") => { id, ... }
 */
async function seedTestProject(name) {
	const res = await app.inject({
		method: "POST",
		url: "/projects",
		payload: { name },
	});
	expect(res.statusCode).toBe(201);
	return JSON.parse(res.payload);
}

// The follow-up, resume and retry tests drive stage execution through the
// HTTP routes (no injectable agent runner), so a bare run (no NODE_ENV=test)
// would spin up real pi sessions and invoke the live model runtime — see the
// TEST ENV CONTRACT in api/sessionStore.js. They are gated to the mock seam;
// bare runs skip them (describe.skipIf precedent in agent/git.integration.test.js).
const isTestEnv = process.env.NODE_ENV === "test";

/**
 * MARK: Task API Integration
 * @description Verifies discrete task lifecycle: creation, stage placement,
 * listing, single-task retrieval, patching, human review rejection, markdown
 * report generation, advance/failback/jump transitions, and deletion.
 */
describe("Task API Integration", () => {
	let testProject;

	beforeAll(async () => {
		await app.ready();
		testProject = await seedTestProject("Task API Test Project");
	});

	async function activeProject() {
		return testProject;
	}

	it("should create a discrete task and place it in the first stage", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Phase 2 Core",
				goal: "Implement Phase 2",
			},
		});
		expect(createRes.statusCode).toBe(200);
		const task = JSON.parse(createRes.payload);
		expect(task.title).toBe("Phase 2 Core");
		expect(task.goal).toBe("Implement Phase 2");
		expect(task.id).toBeTruthy();
		expect(task.currentStageId).toBe(project.stages[0].id);
		expect(task.status).toBe("in_stage");

		// List returns the created task
		const listRes = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}`,
		});
		expect(listRes.statusCode).toBe(200);
		const tasks = JSON.parse(listRes.payload);
		expect(tasks.some((t) => t.id === task.id)).toBe(true);
	});

	it("should retrieve a single task via GET /tasks/:id", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Single task query" },
		});
		const created = JSON.parse(createRes.payload);

		const getRes = await app.inject({
			method: "GET",
			url: `/tasks/${created.id}?projectId=${project.id}`,
		});
		expect(getRes.statusCode).toBe(200);
		const fetched = JSON.parse(getRes.payload);
		expect(fetched.id).toBe(created.id);
		expect(fetched.goal).toBe("Single task query");
	});

	it("serves board-list summaries without detail weight, keeping single-task full", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Heavy summary probe" },
		});
		const created = JSON.parse(createRes.payload);
		const stored = taskStore.getTask(project.id, created.id);
		stored.logEntries = [{ tag: "[AGENT]", text: "x".repeat(1000) }];
		stored.processLogs = "y".repeat(1000);
		stored.prompt = "z".repeat(1000);
		stored.history = [{ action: "created" }];
		stored.reports = [{ path: "r.md", filename: "r.md", content: "c".repeat(1000) }];

		const listRes = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}`,
		});
		expect(listRes.statusCode).toBe(200);
		const listed = JSON.parse(listRes.payload).find((t) => t.id === created.id);
		expect(listed.title).toBeTruthy();
		expect(listed.status).toBe("in_stage");
		expect(listed.currentStageId).toBeTruthy();
		expect(listed.logEntries).toBeUndefined();
		expect(listed.processLogs).toBeUndefined();
		expect(listed.prompt).toBeUndefined();
		expect(listed.history).toBeUndefined();
		expect(listed.reports).toEqual([{ path: "r.md", filename: "r.md" }]);
		// Summaries never mutate the stored record.
		expect(stored.logEntries).toHaveLength(1);

		const getRes = await app.inject({
			method: "GET",
			url: `/tasks/${created.id}?projectId=${project.id}`,
		});
		const fetched = JSON.parse(getRes.payload);
		expect(fetched.logEntries).toHaveLength(1);
		expect(fetched.reports[0].content).toBe("c".repeat(1000));
	});

	it("should update a task's title and goal via PATCH", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Old title",
				goal: "Original goal",
			},
		});
		const task = JSON.parse(createRes.payload);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/tasks/${task.id}`,
			payload: {
				projectId: project.id,
				title: "New title",
				goal: "Edited goal",
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const updated = JSON.parse(patchRes.payload);
		expect(updated.title).toBe("New title");
		expect(updated.goal).toBe("Edited goal");
		expect(updated.history.some((h) => h.action.includes("edited"))).toBe(true);
	});

	it("should ignore a client-supplied prompt and always store the curated prompt", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Override task",
				goal: "Override goal",
				// Stale-client payload: the per-task prompt override feature has
				// been removed, so this field must be ignored by the server.
				prompt: "User-authored override",
			},
		});
		const task = JSON.parse(createRes.payload);
		// The stored prompt is the engine-curated stage prompt, never the
		// client-supplied text.
		expect(task.prompt).not.toBe("User-authored override");
		expect(task.prompt.length).toBeGreaterThan(0);
		expect(task.prompt).toContain("# Stage");

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/tasks/${task.id}`,
			payload: {
				projectId: project.id,
				title: "Rename while prompting",
				prompt: "Patch-authored override",
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const updated = JSON.parse(patchRes.payload);
		// PATCH must not change the display-only curated prompt either.
		expect(updated.prompt).toBe(task.prompt);
		expect(updated.title).toBe("Rename while prompting");
	});

	it("should store a backend-curated prompt as a display record on creation", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Curated task",
				goal: "Curated goal",
			},
		});
		const task = JSON.parse(createRes.payload);
		// The engine-curated prompt is stored on the task purely as a display
		// record of what the task executes (observability).
		expect(typeof task.prompt).toBe("string");
		expect(task.prompt.length).toBeGreaterThan(0);
		expect(task.prompt).toContain("# Stage");
	});

	it("should advance a task to the next stage", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Advance me" },
		});
		const task = JSON.parse(createRes.payload);

		const advanceRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/advance`,
			payload: { projectId: project.id },
		});
		expect(advanceRes.statusCode).toBe(200);
		const advanced = JSON.parse(advanceRes.payload);
		expect(advanced.currentStageId).toBe(project.stages[1].id);
		expect(advanced.history.some((h) => h.action.includes("Advanced"))).toBe(
			true,
		);
	});

	it("should fail a task back via its stage's failback policy", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Fail me back" },
		});
		const task = JSON.parse(createRes.payload);

		const failRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/failback`,
			payload: { projectId: project.id },
		});
		expect(failRes.statusCode).toBe(200);
		const failed = JSON.parse(failRes.payload);
		expect(failed.status).toBe("in_stage");
		expect(failed.currentStageId).toBe(project.stages[0].id);
	});

	it("should reject a task with human feedback via POST /tasks/:id/reject", async () => {
		const project = await activeProject();
		// Create task and advance to stage 2
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Human check" },
		});
		const task = JSON.parse(createRes.payload);
		await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/advance`,
			payload: { projectId: project.id },
		});

		const rejectRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/reject`,
			payload: {
				projectId: project.id,
				feedback: "Please add validation on empty inputs",
			},
		});
		expect(rejectRes.statusCode).toBe(200);
		const rejected = JSON.parse(rejectRes.payload);
		expect(rejected.feedback).toBe("Please add validation on empty inputs");
		expect(rejected.goal).toContain("Human Correction / Feedback");
		expect(rejected.curatedPrompt).toContain(
			"Please add validation on empty inputs",
		);
	});

	it("should save and retrieve markdown stage reports", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Reported task" },
		});
		const task = JSON.parse(createRes.payload);

		const reportRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/report`,
			payload: {
				projectId: project.id,
				stageName: "Idea",
				content: "# Summary\nAll requirements gathered.",
			},
		});
		expect(reportRes.statusCode).toBe(200);
		const { report } = JSON.parse(reportRes.payload);
		expect(report.stageSlug).toBe("idea");
		expect(report.path).toContain(`./docs/tasks/${task.id}/idea-`);

		const getReportsRes = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/reports?projectId=${project.id}`,
		});
		expect(getReportsRes.statusCode).toBe(200);
		const reports = JSON.parse(getReportsRes.payload);
		expect(reports.length).toBeGreaterThanOrEqual(1);
	});

	it("should jump a task to any stage (non-linear)", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Jump me" },
		});
		const task = JSON.parse(createRes.payload);
		const lastStage = project.stages[project.stages.length - 1];

		const jumpRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/jump`,
			payload: { projectId: project.id, stageId: lastStage.id },
		});
		expect(jumpRes.statusCode).toBe(200);
		expect(JSON.parse(jumpRes.payload).currentStageId).toBe(lastStage.id);
	});

	it("should complete a task", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Finish me" },
		});
		const task = JSON.parse(createRes.payload);

		const completeRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/complete`,
			payload: { projectId: project.id },
		});
		expect(completeRes.statusCode).toBe(200);
		expect(JSON.parse(completeRes.payload).status).toBe("completed");
	});

	it("should move a task via drag-and-drop endpoint", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Drag me" },
		});
		const task = JSON.parse(createRes.payload);
		const lastStage = project.stages[project.stages.length - 1];

		const moveRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/move`,
			payload: { projectId: project.id, stageId: lastStage.id },
		});
		expect(moveRes.statusCode).toBe(200);
		const moved = JSON.parse(moveRes.payload);
		expect(moved.currentStageId).toBe(lastStage.id);
		expect(moved.history.some((h) => h.action.includes("Moved"))).toBe(true);
	});

	it("should delete a task via DELETE /tasks/:id", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "To delete" },
		});
		const task = JSON.parse(createRes.payload);

		const deleteRes = await app.inject({
			method: "DELETE",
			url: `/tasks/${task.id}`,
			payload: { projectId: project.id },
		});
		expect(deleteRes.statusCode).toBe(200);
		expect(JSON.parse(deleteRes.payload).status).toBe("deleted");

		const getRes = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}?projectId=${project.id}`,
		});
		expect(getRes.statusCode).toBe(404);
	});

	it("should return the same task when created with identical idempotencyKey or rapid duplicate payload", async () => {
		const project = await activeProject();
		const res1 = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Idempotent Task",
				goal: "Verify single creation",
				idempotencyKey: "test-idem-key-1",
			},
		});
		expect(res1.statusCode).toBe(200);
		const task1 = JSON.parse(res1.payload);

		const res2 = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Idempotent Task",
				goal: "Verify single creation",
				idempotencyKey: "test-idem-key-1",
			},
		});
		expect(res2.statusCode).toBe(200);
		const task2 = JSON.parse(res2.payload);

		expect(task1.id).toBe(task2.id);
	});

	it("should execute task stage via POST /tasks/:id/execute", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Task to execute" },
		});
		const task = JSON.parse(createRes.payload);

		const execRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/execute`,
			payload: { projectId: project.id },
		});
		expect(execRes.statusCode).toBe(200);
		const result = JSON.parse(execRes.payload);
		expect(result).toHaveProperty("stageType");
		expect(result).toHaveProperty("status");
	});

	it("should return 409 when executing while the engine runs another task", async () => {
		const project = await activeProject();
		const firstRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Engine owner task" },
		});
		const owner = JSON.parse(firstRes.payload);
		const secondRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Second task while busy" },
		});
		const other = JSON.parse(secondRes.payload);

		taskStore.setEngineState({
			status: "running",
			activeTaskId: owner.id,
			activeProjectId: project.id,
		});
		try {
			const execRes = await app.inject({
				method: "POST",
				url: `/tasks/${other.id}/execute`,
				payload: { projectId: project.id },
			});
			expect(execRes.statusCode).toBe(409);
			expect(JSON.parse(execRes.payload).error).toContain("already running");
		} finally {
			taskStore.setEngineState({
				status: "idle",
				activeTaskId: null,
				activeProjectId: null,
				activeProjectName: null,
				activeStageId: null,
				activeStageName: null,
				activeStageType: null,
			});
		}
	});

	it("should reject invalid task transitions with 404", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/tasks/does-not-exist/advance",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(404);
	});

	it("should return 409 Conflict when advancing a task that is completed or running", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Task to conflict test" },
		});
		const task = JSON.parse(createRes.payload);

		// Complete the task
		await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/complete`,
			payload: { projectId: project.id },
		});

		// Attempt to advance completed task
		const advRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/advance`,
			payload: { projectId: project.id },
		});
		expect(advRes.statusCode).toBe(409);
		const err = JSON.parse(advRes.payload);
		expect(err.error).toContain("completed");
	});

	it("should return 409 Conflict when rejecting a task that is completed or running", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Task to reject conflict" },
		});
		const task = JSON.parse(createRes.payload);

		// Complete the task
		await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/complete`,
			payload: { projectId: project.id },
		});

		// Attempt to reject completed task
		const rejectRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/reject`,
			payload: { projectId: project.id, feedback: "Cannot reject completed" },
		});
		expect(rejectRes.statusCode).toBe(409);
		const err = JSON.parse(rejectRes.payload);
		expect(err.error).toContain("completed");
	});

	it("should filter tasks strictly by workflowId via GET /tasks?projectId=...&workflowId=...", async () => {
		const project = await activeProject();
		const res1 = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Wf Alpha Task",
				goal: "Workflow Alpha Task",
				workflowId: "wf-alpha-123",
			},
		});
		const task1 = JSON.parse(res1.payload);

		const res2 = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				title: "Wf Beta Task",
				goal: "Workflow Beta Task",
				workflowId: "wf-beta-456",
			},
		});
		const task2 = JSON.parse(res2.payload);

		const filterAlphaRes = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}&workflowId=wf-alpha-123`,
		});
		expect(filterAlphaRes.statusCode).toBe(200);
		const alphaTasks = JSON.parse(filterAlphaRes.payload);
		expect(alphaTasks.some((t) => t.id === task1.id)).toBe(true);
		expect(alphaTasks.some((t) => t.id === task2.id)).toBe(false);

		const filterBetaRes = await app.inject({
			method: "GET",
			url: `/tasks?projectId=${project.id}&workflowId=wf-beta-456`,
		});
		expect(filterBetaRes.statusCode).toBe(200);
		const betaTasks = JSON.parse(filterBetaRes.payload);
		expect(betaTasks.some((t) => t.id === task2.id)).toBe(true);
		expect(betaTasks.some((t) => t.id === task1.id)).toBe(false);
	});

	it("should advance a task with human guidance", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Guidance test" },
		});
		const task = JSON.parse(createRes.payload);

		const advRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/advance`,
			payload: {
				projectId: project.id,
				guidance: "Please add comprehensive error logging.",
			},
		});
		expect(advRes.statusCode).toBe(200);
		const advanced = JSON.parse(advRes.payload);
		expect(advanced.goal).toContain("Please add comprehensive error logging.");
		expect(advanced.history.some((h) => h.action.includes("guidance"))).toBe(true);
	});

	it.skipIf(!isTestEnv)(
		"should support manual follow-up prompts via POST /tasks/:id/follow-up",
		async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Follow-up test" },
		});
		const task = JSON.parse(createRes.payload);

		const followUpRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/follow-up`,
			payload: {
				projectId: project.id,
				prompt: "Also verify input validation.",
			},
		});
		expect(followUpRes.statusCode).toBe(200);
		const updated = JSON.parse(followUpRes.payload);
		expect(updated.goal).toContain("Also verify input validation.");
		expect(updated.history.some((h) => h.action.includes("follow-up"))).toBe(true);
		},
	);

	it("should support steering guidance via POST /tasks/:id/steer", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Steer test" },
		});
		const task = JSON.parse(createRes.payload);

		const steerRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/steer`,
			payload: {
				projectId: project.id,
				guidance: "Prioritize memory efficiency.",
			},
		});
		expect(steerRes.statusCode).toBe(200);
		const updated = JSON.parse(steerRes.payload);
		expect(updated.goal).toContain("Prioritize memory efficiency.");
		expect(updated.history.some((h) => h.action.includes("Steering"))).toBe(true);
	});

	it.skipIf(!isTestEnv)(
		"should support pause and resume via POST /tasks/:id/pause and /tasks/:id/resume",
		async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Pause/resume test" },
		});
		const task = JSON.parse(createRes.payload);

		const pauseRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/pause`,
			payload: { projectId: project.id },
		});
		expect(pauseRes.statusCode).toBe(200);
		const paused = JSON.parse(pauseRes.payload);
		expect(paused.status).toBe("paused");
		expect(paused.history.some((h) => h.action.includes("paused"))).toBe(true);

		const resumeRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/resume`,
			payload: { projectId: project.id },
		});
		expect(resumeRes.statusCode).toBe(200);
		const resumed = JSON.parse(resumeRes.payload);
		expect(resumed.task?.status || resumed.status).not.toBe("paused");
		},
	);

	it.skipIf(!isTestEnv)(
		"should support stage retry via POST /tasks/:id/retry",
		async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Retry test" },
		});
		const task = JSON.parse(createRes.payload);

		const retryRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/retry`,
			payload: {
				projectId: project.id,
			},
		});
		expect(retryRes.statusCode).toBe(200);
		},
	);

	it.skipIf(!isTestEnv)(
		"should restart exhausted attempt budgets via POST /tasks/:id/retry",
		async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Retry resets budgets" },
		});
		const task = JSON.parse(createRes.payload);

		// Park the task as budget-exhausted with a stale stage clock, the
		// way a task looks after its failback/transient loops run out.
		const staleClock = "2026-01-01T00:00:00.000Z";
		const stored = taskStore.getTask(project.id, task.id);
		stored.status = "failed";
		stored.autoIterationCount = 8;
		stored.autoRetrying = true;
		stored.infraRetryCount = 5;
		stored.enteredStageAt = staleClock;
		stored.timeInStage = 4567;
		stored.failureReason = "Persistent failure";

		const retryRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/retry`,
			payload: {
				projectId: project.id,
			},
		});
		expect(retryRes.statusCode).toBe(200);

		// The retry endpoint (not plain execute) restarts every loop
		// counter and re-enters the stage clock, so the mock run starts
		// a genuinely fresh attempt instead of parking immediately.
		//
		// NOTE: the fresh attempt runs to completion through the mock
		// session before the response returns, and the mock session echoes
		// the full prompt — which contains a fully-formed KAINBAIN_VERDICT
		// FAIL example. The fail-open text-verdict fallback
		// (api/agentRunner.js) reads that echo as a genuine rejection, so
		// the fresh attempt fails once and its failback consumes exactly
		// one iteration (0 -> 1, autoRetrying true). That consumption
		// belongs to the NEW attempt, not the parked one: without the
		// reset the count would be 9 (8 + 1), or the task would park
		// immediately on its exhausted budget. Assert the fresh-loop
		// bounds, not a pristine zero.
		const retried = JSON.parse(retryRes.payload);
		expect(retried.autoIterationCount).toBeLessThanOrEqual(1);
		expect(retried.infraRetryCount).toBe(0);
		expect(Date.parse(retried.enteredStageAt)).toBeGreaterThan(
			Date.parse(staleClock),
		);
		expect(retried.status).not.toBe("failed");
		expect(
			retried.history.some((h) => h.action.includes("retried")),
		).toBe(true);
		},
	);

	it("should support stage abort via POST /tasks/:id/abort", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Abort test" },
		});
		const task = JSON.parse(createRes.payload);

		const abortRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/abort`,
			payload: { projectId: project.id },
		});
		expect(abortRes.statusCode).toBe(200);
		const aborted = JSON.parse(abortRes.payload);
		expect(aborted.history.some((h) => h.action.includes("aborted"))).toBe(true);
	});

	it("should return 404 when querying /tasks with an invalid or non-existent projectId", async () => {
		// Stage index passed as projectId
		const res1 = await app.inject({
			method: "GET",
			url: "/tasks?projectId=1",
		});
		expect(res1.statusCode).toBe(404);
		expect(JSON.parse(res1.payload)).toEqual({ error: "Project not found" });

		// Stage ID prefix passed as projectId
		const res2 = await app.inject({
			method: "GET",
			url: "/tasks?projectId=stage-idea",
		});
		expect(res2.statusCode).toBe(404);
		expect(JSON.parse(res2.payload)).toEqual({ error: "Project not found" });

		// Workflow ID passed as projectId
		const res3 = await app.inject({
			method: "GET",
			url: "/tasks?projectId=wf-default",
		});
		expect(res3.statusCode).toBe(404);
		expect(JSON.parse(res3.payload)).toEqual({ error: "Project not found" });

		// Non-existent UUID
		const res4 = await app.inject({
			method: "GET",
			url: "/tasks?projectId=00000000-0000-0000-0000-000000000000",
		});
		expect(res4.statusCode).toBe(404);
		expect(JSON.parse(res4.payload)).toEqual({ error: "Project not found" });
	});

	it("should return 404 when querying /tasks/queue with an invalid projectId", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/tasks/queue?projectId=wf-default",
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload)).toEqual({ error: "Project not found" });
	});

	it("should return 400 when creating a task without goal or title", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload)).toEqual({ error: "Goal or title is required" });
	});

	it("should return 404 when creating or operating on tasks with an invalid projectId", async () => {
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: "wf-default",
				goal: "Invalid project task",
			},
		});
		expect(createRes.statusCode).toBe(404);
		expect(JSON.parse(createRes.payload)).toEqual({ error: "Project not found" });

		const getRes = await app.inject({
			method: "GET",
			url: "/tasks/any-task-id?projectId=stage-1",
		});
		expect(getRes.statusCode).toBe(404);
		expect(JSON.parse(getRes.payload)).toEqual({ error: "Project not found" });
	});
});

describe("Task Log Feed API", () => {
	let testProjectId;

	beforeAll(async () => {
		await app.ready();
		testProjectId = (await seedTestProject("Task Log Feed Test Project")).id;
	});

	async function activeProjectId() {
		return testProjectId;
	}

	async function createTaskWithLogEntries(projectId) {
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, goal: "Log feed test" },
		});
		const task = JSON.parse(createRes.payload);
		// Mutate the in-memory task (the HTTP payload is a detached copy).
		taskStore.getTask(projectId, task.id).logEntries = [
			{
				id: 1,
				ts: "t",
				feed: "main",
				feeds: ["main"],
				kind: "system",
				turn: 1,
				text: "[AGENT] Agent reasoning with model default...",
				meta: {},
			},
			{
				id: 2,
				ts: "t",
				feed: "thinking",
				feeds: ["thinking"],
				kind: "thinking",
				turn: 1,
				text: "hidden model reasoning",
				meta: { charCount: 22 },
			},
			{
				id: 3,
				ts: "t",
				feed: "main",
				feeds: ["main"],
				kind: "thinking",
				turn: 1,
				text: "[THINKING] (22 chars)",
				meta: { charCount: 22, collapsed: true, fullTextId: 2 },
			},
			{
				id: 4,
				ts: "t",
				feed: "tools",
				feeds: ["main", "tools"],
				kind: "tool",
				turn: 1,
				text: '[TOOL] edit({"path":"src/a.js"})',
				meta: { toolName: "edit", toolCallId: "tc-1" },
			},
			{
				id: 5,
				ts: "t",
				feed: "tools",
				feeds: ["tools"],
				kind: "tool",
				turn: 1,
				text: "[RESULT] patched",
				meta: { toolName: "edit", toolCallId: "tc-1" },
			},
		];
		return task;
	}

	it("returns one feed's entries without shipping the whole task", async () => {
		const projectId = await activeProjectId();
		const task = await createTaskWithLogEntries(projectId);

		const thinking = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&feed=thinking`,
		});
		expect(thinking.statusCode).toBe(200);
		const thinkingPayload = JSON.parse(thinking.payload);
		expect(thinkingPayload.feed).toBe("thinking");
		expect(thinkingPayload.format).toBe("entries");
		expect(thinkingPayload.entries).toHaveLength(1);
		expect(thinkingPayload.entries[0].text).toBe("hidden model reasoning");

		const tools = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&feed=tools`,
		});
		const toolsPayload = JSON.parse(tools.payload);
		expect(toolsPayload.entries).toHaveLength(2);
		expect(toolsPayload.entries.map((e) => e.kind)).toEqual(["tool", "tool"]);
	});

	it("renders a feed as text on demand", async () => {
		const projectId = await activeProjectId();
		const task = await createTaskWithLogEntries(projectId);

		const res = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&feed=tools&format=text`,
		});
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.format).toBe("text");
		expect(payload.text.split("\n")).toEqual([
			'[TOOL] edit({"path":"src/a.js"})',
			"[RESULT] patched",
		]);
	});

	it("rejects unknown feeds and formats with 400", async () => {
		const projectId = await activeProjectId();
		const task = await createTaskWithLogEntries(projectId);

		const badFeed = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&feed=nope`,
		});
		expect(badFeed.statusCode).toBe(400);
		expect(JSON.parse(badFeed.payload).error).toContain("Unknown log feed");

		const badFormat = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&format=yaml`,
		});
		expect(badFormat.statusCode).toBe(400);
	});

	it("returns 404 for an unknown task", async () => {
		const projectId = await activeProjectId();
		const res = await app.inject({
			method: "GET",
			url: `/tasks/does-not-exist/logs?projectId=${projectId}`,
		});
		expect(res.statusCode).toBe(404);
	});

	it("parses legacy tasks without structured entries from processLogs", async () => {
		const projectId = await activeProjectId();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, goal: "Legacy feed test" },
		});
		const task = JSON.parse(createRes.payload);
		taskStore.getTask(projectId, task.id).processLogs =
			"[INFO] boot\n[TOOL] bash(\"ls\")\n[TOOL] bash(\"ls\")\n[RESULT] ok";

		const res = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}/logs?projectId=${projectId}&feed=tools`,
		});
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		// Consecutive duplicates de-duped, tag grammar applied.
		expect(payload.entries.map((e) => e.text)).toEqual([
			'[TOOL] bash("ls")',
			"[RESULT] ok",
		]);
		expect(payload.entries[0].kind).toBe("tool");
	});
});
