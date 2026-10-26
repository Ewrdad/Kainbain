import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
	activeProjectId,
	createTaskViaApi,
	listTasks,
	projectStages,
	resetProject,
	stopEngine,
	waitForAppReadyOnProject,
} from "./helpers";

/**
 * MARK: canary now-playing-cross-project.spec
 * @description E2E pin for the single-pipeline contract: the Now Playing bar
 *   is ONE bar for ALL projects — switching the selected project must never
 *   change its named task, status badge, elapsed timer, or queue depth, and
 *   Skip must advance the engine owner even when another project is selected.
 *   This is the exact user report ("switching project changes the now playing
 *   bar"): before the fix the bar resolved from the ACTIVE-project task list,
 *   so the engine owner vanished from the bar the moment Project B's list
 *   replaced Project A's (the bar fell back to B's newest task and the queue
 *   depth dropped to B's count). The backend now carries a
 *   project-independent owner source on every engine state
 *   (TaskStore.getEngineState: activeTask snapshot + openQueueDepth), and
 *   this spec proves it across a REAL dispatcher run on the scratch stack:
 *   Project A holds an engine-owned task, Project B holds newer open tasks,
 *   and the bar must keep naming A's owner — in both the RUNNING and the
 *   parked CHECKPOINT state — from B, and back again.
 *
 *   Isolation (footer-overlay pattern): a throwaway two-stage workflow in
 *   Project A ("Slow Build" ci stage + "Human Gate" checkpoint) is switched
 *   active in beforeAll and removed again in afterAll; the slow ci keeps the
 *   engine RUNNING long enough to complete the project switch and
 *   re-read the bar, and the human checkpoint parks the engine-owned task
 *   indefinitely for a deterministic assertion window. The autonomous
 *   scheduler is never started (scratch stacks boot with
 *   KAINBAIN_DISABLE_SCHEDULER and /compute/stop halts it operator-wide):
 *   every dispatch here is an explicit /execute, so Project B's passive
 *   tasks can never silently execute and steal the bar mid-test.
 */

const API_BASE = API_URL;

/** Workflow swapped in for these tests: slow CI stage then a human gate. */
const E2E_WORKFLOW_NAME = "Now Playing Cross-Project E2E";
const E2E_STAGES = [
	{
		id: "1",
		name: "Slow Build",
		type: "ci",
		// runCommandStage executes stage.command (stage.prompt is agent-stage
		// wording and would fall through to the instant default echo) — the
		// long sleep keeps the engine in the RUNNING state for the whole
		// switch-and-assert window.
		command: "sleep 12 && echo cross-project-now-playing-window && echo done",
		paused: false,
		failback: "start",
	},
	{
		id: "2",
		name: "Human Gate",
		type: "human",
		paused: false,
	},
];

/** Stable selectors into the Now Playing bar (universal footer contract). */
const ownerName = (page) => page.getByTestId("now-playing-task-name");
const statusBadge = (page) =>
	page.locator('span[aria-label^="Engine status is "]');
const queueChip = (page) => page.locator('div[aria-label^="Execution queue:"]');
const elapsedTimer = (page) =>
	page.getByLabel("Elapsed time in current stage");

/***
 * MARK: getEngineState
 * @description Reads the global engine state from the API (GET /status →
 *   engine). Used to synchronize the test with real dispatcher transitions
 *   instead of sleeping.
 * @example (await getEngineState(request)).status => "running"
 * @param {import("@playwright/test").APIRequestContext} request
 * @returns {Promise<Object>} The engine state payload (activeTaskId, status).
 ***/
async function getEngineState(request) {
	const res = await request.get(`${API_BASE}/status`);
	return (await res.json())?.engine || {};
}

/***
 * MARK: findTask
 * @description Finds one task by id in the API's task list for a project.
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 * @param {string} taskId
 * @returns {Promise<Object|undefined>} The task, if present.
 ***/
async function findTask(request, projectId, taskId) {
	const tasks = await listTasks(request, projectId);
	return tasks.find((t) => String(t.id) === String(taskId));
}

test.describe("Now Playing bar is one pipeline for all projects", () => {
	/** Project A = engine owner's project, Project B = selected-by-UI project. */
	let projectIdA = null;
	let projectIdB = null;
	let e2eWorkflowId = null;

	test.beforeAll(async ({ request }) => {
		projectIdA = await activeProjectId(request, "Project A");
		projectIdB = await activeProjectId(request, "Project B");

		// Quiesce the engine BEFORE seeding: this spec's tests own real
		// engine-owning runs, so leftover state must be parked first.
		await stopEngine(request, projectIdA);
		await stopEngine(request, projectIdB);

		// Idempotent (re)creation of the throwaway workflow, then make it the
		// active pipeline of Project A (the owner's project). Project A's
		// default pipeline is never mutated.
		const listRes = await request.get(
			`${API_BASE}/projects/${projectIdA}/workflows`,
		);
		const workflows = (await listRes.json())?.workflows || [];
		const existing = workflows.find((w) => w.name === E2E_WORKFLOW_NAME);
		if (existing) {
			e2eWorkflowId = existing.id;
		} else {
			const createRes = await request.post(
				`${API_BASE}/projects/${projectIdA}/workflows`,
				{ data: { name: E2E_WORKFLOW_NAME, stages: E2E_STAGES } },
			);
			const created = await createRes.json();
			e2eWorkflowId = created?.id;
		}
		expect(e2eWorkflowId).toBeTruthy();
		await request.post(
			`${API_BASE}/projects/${projectIdA}/workflows/${e2eWorkflowId}/switch`,
		);
	});

	test.afterAll(async ({ request }) => {
		// Quiesce the engine and restore Project A's default pipeline, then
		// drop the throwaway workflow — later specs must always see the
		// untouched default pipeline and an idle engine.
		if (projectIdA) await stopEngine(request, projectIdA);
		if (projectIdB) await stopEngine(request, projectIdB);
		if (e2eWorkflowId && projectIdA) {
			await request.post(
				`${API_BASE}/projects/${projectIdA}/workflows/wf-default/switch`,
			);
			await request.delete(
				`${API_BASE}/projects/${projectIdA}/workflows/${e2eWorkflowId}`,
			);
		}
	});

	test.beforeEach(async ({ page, request }) => {
		await waitForAppReadyOnProject(page, "Project A");
		await stopEngine(request, projectIdA);
		await stopEngine(request, projectIdB);
		// Reset both projects so both task lists start empty and no stale
		// owner from a previous test can linger in the bar.
		await resetProject(request, projectIdA);
		await resetProject(request, projectIdB);
		// Re-assert the active workflow on EVERY test: engine executions and
		// other suites can leave the project back on its default pipeline
		// between tests (see footer-overlay.spec.js for the same guard).
		const switchRes = await request.post(
			`${API_BASE}/projects/${projectIdA}/workflows/${e2eWorkflowId}/switch`,
		);
		expect(switchRes.ok()).toBeTruthy();
		await page.reload();
		await waitForAppReadyOnProject(page, "Project A");
		await expect(
			page.getByRole("button", { name: "Select pipeline workflow" }),
		).toContainText(E2E_WORKFLOW_NAME, { timeout: 15000 });

		// Two passive open tasks in Project B, stamped fresh so any pre-fix
		// bar (resolving from the ACTIVE project's list) would name the newest
		// one after the switch instead of the owner. They never execute: the
		// scheduler stays off and no request sets execute.
		projectIdB = await activeProjectId(request, "Project B");
		const bStages = await projectStages(request, projectIdB);
		for (const goal of [
			`B queue filler one ${Date.now()}`,
			`B queue filler two ${Date.now()}`,
		]) {
			await createTaskViaApi(request, projectIdB, goal, {
				stageId: bStages[0]?.id,
			});
		}
	});

	test.afterEach(async ({ request }) => {
		// Park whatever the test left behind and return the GLOBAL engine to
		// idle so later specs' fixtures are never dispatch-blocked (the
		// engine runs one task at a time and /execute 409s while busy),
		// then clear both projects' throwaway fixtures.
		await stopEngine(request, projectIdA);
		await stopEngine(request, projectIdB);
		await resetProject(request, projectIdA);
		await resetProject(request, projectIdB);
	});

	test("bar keeps naming the running owner when switching from Project A to Project B", async ({
		page,
		request,
	}) => {
		// Dispatch a REAL engine run in Project A: the slow ci stage keeps the
		// engine RUNNING for the whole switch-and-assert window.
		const goal = `Now Playing owner run ${Date.now()}`;
		const task = await createTaskViaApi(request, projectIdA, goal, {
			stageId: "1",
			workflowId: e2eWorkflowId,
			execute: true,
		});
		expect(task).toBeTruthy();

		// On Project A the bar names the running owner and shows RUNNING.
		await expect(ownerName(page)).toContainText(goal, { timeout: 20000 });
		await expect(statusBadge(page)).toHaveAttribute(
			"aria-label",
			"Engine status is RUNNING",
		);
		await expect(elapsedTimer(page)).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
		// Queue depth is GLOBAL (engine-carried, all projects): the owner plus
		// the two seeded B tasks. Captured once; the project switch must not
		// move it.
		const depthLabelOnA = await queueChip(page).getAttribute("aria-label");
		expect(depthLabelOnA).toMatch(
			/^Execution queue: \d+ open tasks? across all pipelines$/,
		);

		// THE REPORTED BUG: switch the UI to Project B while A's task owns the
		// engine.
		await waitForAppReadyOnProject(page, "Project B");

		// The bar still names Project A's running owner — name, badge, timer
		// and queue depth all unchanged. Pre-fix it fell back to B's newest
		// task (B's list replaced A's) and the depth dropped to B's count.
		await expect(ownerName(page)).toContainText(goal, { timeout: 10000 });
		await expect(
			statusBadge(page),
			"the status badge must not change when switching projects",
		).toHaveAttribute("aria-label", "Engine status is RUNNING");
		await expect(elapsedTimer(page)).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
		await expect(
			queueChip(page),
			"the global queue depth must not change when switching projects",
		).toHaveAttribute("aria-label", depthLabelOnA);
		// The engine-owner chip names the OWNING project, not the selected one.
		await expect(page.getByText("[Project A]", { exact: true })).toBeVisible();

		// Park the same run at the human checkpoint: a stable engine-owned
		// state (waiting_human) for the last assertions.
		await expect
			.poll(async () => (await getEngineState(request)).status, {
				timeout: 30000,
				message: "engine should return to idle after the ci stage passes",
			})
			.toBe("idle");
		const checkpointExec = await request.post(
			`${API_BASE}/tasks/${task.id}/execute`,
			{ data: { projectId: projectIdA } },
		);
		expect(checkpointExec.ok()).toBeTruthy();
		await expect
			.poll(async () => (await getEngineState(request)).status, {
				timeout: 20000,
				message: "engine should park at the human checkpoint",
			})
			.toBe("checkpoint");
		await expect
			.poll(async () => (await getEngineState(request)).activeTaskId, {
				timeout: 10000,
				message: "the checkpoint must be owned by the same task",
			})
			.toBe(String(task.id));

		// Still selected on Project B: the bar keeps naming A's checkpointed
		// owner. Pre-fix, with the engine no longer "running", the fallback
		// would name Project B's newest open task here too.
		await expect(ownerName(page)).toContainText(goal);
		await expect(
			statusBadge(page),
			"the checkpoint badge must name the parked human gate",
		).toHaveAttribute("aria-label", "Engine status is CHECKPOINT");
		await expect(queueChip(page)).toHaveAttribute("aria-label", depthLabelOnA);

		// And the same invariants hold switching BACK to Project A.
		await waitForAppReadyOnProject(page, "Project A");
		await expect(ownerName(page)).toContainText(goal);
		await expect(statusBadge(page)).toHaveAttribute(
			"aria-label",
			"Engine status is CHECKPOINT",
		);
		await expect(page.getByText("[Project A]", { exact: true })).toBeVisible();
		await expect(queueChip(page)).toHaveAttribute("aria-label", depthLabelOnA);
	});

	test("Skip Current advances the engine owner even when another project is selected", async ({
		page,
		request,
	}) => {
		// Same owner setup, but jump straight to the human gate: the engine
		// parks at checkpoint (waiting_human) — a stable owned state to Skip.
		const goal = `Now Playing owner skip ${Date.now()}`;
		const task = await createTaskViaApi(request, projectIdA, goal, {
			stageId: "1",
			workflowId: e2eWorkflowId,
		});
		const jumpRes = await request.post(`${API_BASE}/tasks/${task.id}/jump`, {
			data: { projectId: projectIdA, stageId: "2" },
		});
		expect(jumpRes.ok()).toBeTruthy();
		await stopEngine(request, projectIdA);
		const checkpointExec = await request.post(
			`${API_BASE}/tasks/${task.id}/execute`,
			{ data: { projectId: projectIdA } },
		);
		expect(checkpointExec.ok()).toBeTruthy();
		await expect
			.poll(async () => (await getEngineState(request)).status, {
				timeout: 20000,
				message: "engine should park at the human checkpoint",
			})
			.toBe("checkpoint");

		// Select Project B — the owner lives in Project A and is absent from
		// B's loaded task list.
		await waitForAppReadyOnProject(page, "Project B");
		await expect(ownerName(page)).toContainText(goal, { timeout: 10000 });

		// Skip Current must advance the OWNER's task (in Project A), not the
		// viewed pipeline's pointer. The transport asks for confirmation.
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Skip Current" }).click();

		// The skipped human gate is the workflow's LAST stage, so the owner
		// completes — assert server-side truth in Project A while the UI sits
		// on Project B.
		await expect
			.poll(
				async () => (await findTask(request, projectIdA, task.id))?.status,
				{
					timeout: 20000,
					message: "owner task should complete after skipping its final stage",
				},
			)
			.toBe("completed");
	});
});