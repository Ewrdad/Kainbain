import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
	activeProjectId,
	boxesOverlap,
	waitForAppReadyOnProject,
} from "./helpers";

/**
 * MARK: footer-overlay.spec
 * @description Regression tests for the footer-overlap fix: the fixed
 *   Now Playing footer (72px) and the Live Agent Activity Console must never
 *   cover interactive controls. Covers the two reported symptoms:
 *   1. The collapsed activity console covering the Configure drawer's
 *      Delete/Done buttons on a stage view.
 *   2. The footer / task inspector painting over each other inconsistently.
 *   Consistency contract: every overlay panel ends above the bars, and the
 *   bars never overlap panel content.
 *
 *   Isolation: the tests run against a dedicated throwaway workflow
 *   ("Footer Overlap E2E") that is switched active in beforeAll and removed
 *   again in afterAll — the project's default pipeline is never mutated.
 */

const API_BASE = API_URL;

/** Workflow swapped in for these tests: one fast deterministic CI stage. */
const E2E_WORKFLOW_NAME = "Footer Overlap E2E";
const E2E_STAGES = [
	{
		id: "1",
		name: "Idea",
		type: "ci",
		prompt: "echo footer-e2e-log-line && echo done",
		paused: false,
		failback: "start",
	},
];

test.describe("Footer overlap consistency", () => {
	let e2eWorkflowId = null;

	test.beforeAll(async ({ request }) => {
		const projectId = await activeProjectId(request);
		// Idempotent (re)creation of the throwaway workflow.
		const listRes = await request.get(`${API_BASE}/projects/${projectId}/workflows`);
		const workflows = ((await listRes.json())?.workflows || []);
		const existing = workflows.find((w) => w.name === E2E_WORKFLOW_NAME);
		if (existing) {
			e2eWorkflowId = existing.id;
		} else {
			const createRes = await request.post(`${API_BASE}/projects/${projectId}/workflows`, {
				data: { name: E2E_WORKFLOW_NAME, stages: E2E_STAGES },
			});
			const created = await createRes.json();
			e2eWorkflowId = created?.id;
		}
		expect(e2eWorkflowId).toBeTruthy();
		await request.post(`${API_BASE}/projects/${projectId}/workflows/${e2eWorkflowId}/switch`);
	});

	test.afterAll(async ({ request }) => {
		// Restore the default workflow as active, then drop the throwaway one —
		// later specs must always see the untouched default pipeline.
		const projectId = await activeProjectId(request);
		if (e2eWorkflowId) {
			await request.post(`${API_BASE}/projects/${projectId}/workflows/wf-default/switch`);
			await request.delete(`${API_BASE}/projects/${projectId}/workflows/${e2eWorkflowId}`);
		}
	});

	test.beforeEach(async ({ page, request }) => {
		await waitForAppReadyOnProject(page);
		const projectId = await activeProjectId(request);
		await page.request.post(`${API_BASE}/test/reset`, { data: { projectId } });
		// Keep the autonomous dispatcher off: tests drive stages explicitly and
		// no test may silently trigger a real agent run.
		await request.post(`${API_BASE}/compute/stop`, { data: { projectId } });
		// Re-assert the active workflow on EVERY test: on a long-lived shared
		// backend, state mutated between the beforeAll switch and a given test
		// (task executions set the engine's snapshot, other suites, restarts)
		// can leave the project back on its default pipeline. The switch is
		// idempotent and must succeed for the task-card assertions to mean
		// anything.
		const switchRes = await request.post(
			`${API_BASE}/projects/${projectId}/workflows/${e2eWorkflowId}/switch`,
		);
		expect(switchRes.ok()).toBeTruthy();
		await page.reload();
		await waitForAppReadyOnProject(page);
		// The board must actually DISPLAY the throwaway workflow's pipeline —
		// fail fast here (with a clear message) instead of timing out later on
		// a task card that lives in a workflow the board is not showing.
		await expect(
			page.getByRole("button", { name: "Select pipeline workflow" }),
		).toContainText(E2E_WORKFLOW_NAME, { timeout: 15000 });
	});

	test("Configure drawer buttons stay clickable above the collapsed activity console", async ({
		page,
	}) => {
		const projectId = await activeProjectId(page.request);

		// The app is already mounted and its WebSocket connected: executing the
		// CI task now streams [CI/CMD] logs live into the console (no reload —
		// processLogs are not replayed from disk after a refresh).
		await page.request.post(`${API_BASE}/tasks`, {
			data: {
				projectId,
				title: "Footer overlap e2e",
				goal: "Footer overlap e2e",
				stageId: "1",
				workflowId: e2eWorkflowId,
				execute: true,
			},
		});

		// The console appears (activity exists) collapsed at 36px — the exact
		// scenario from the bug report.
		const consoleHeader = page.getByText("Live Agent Activity Console");
		await expect(consoleHeader).toBeVisible({ timeout: 15000 });
		const consoleBar = page.getByTestId("activity-console-bar");
		const consoleBox = await consoleBar.boundingBox();
		expect(consoleBox).not.toBeNull();
		expect(consoleBox.height).toBeLessThanOrEqual(40); // collapsed strip

		// Open the Configure drawer for the CI stage.
		await page.getByRole("button", { name: "Configure stage Idea" }).click();
		const deleteBtn = page.getByRole("button", { name: /Delete stage Idea/i });
		const doneBtn = page.getByRole("button", { name: /Save and close settings for Idea/i });
		await expect(deleteBtn).toBeVisible();
		await expect(doneBtn).toBeVisible();

		// Geometry: the drawer's buttons must sit fully above the console bar.
		const deleteBox = await deleteBtn.boundingBox();
		const doneBox = await doneBtn.boundingBox();
		expect(deleteBox.y + deleteBox.height).toBeLessThanOrEqual(consoleBox.y + 1);
		expect(doneBox.y + doneBox.height).toBeLessThanOrEqual(consoleBox.y + 1);
		expect(boxesOverlap(deleteBox, consoleBox)).toBe(false);

		// Hit-target proof: a trial click performs Playwright's full
		// actionability check (including "element receives pointer events")
		// without firing — impossible while the console overlays the button.
		await deleteBtn.click({ trial: true });
		await doneBtn.click({ trial: true });

		// The drawer must also end above the fixed Now Playing footer.
		const footer = page.locator("footer.fixed");
		await expect(footer).toBeVisible();
		const footerBox = await footer.boundingBox();
		const drawerBox = await page
			.locator('section[data-stage-id] div.absolute.inset-0')
			.first()
			.boundingBox();
		expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(footerBox.y + 1);
	});

	test("Configure drawer stays clear of an expanded activity console", async ({ page }) => {
		const projectId = await activeProjectId(page.request);

		await page.request.post(`${API_BASE}/tasks`, {
			data: {
				projectId,
				title: "Footer overlap e2e expanded",
				goal: "Footer overlap e2e expanded",
				stageId: "1",
				workflowId: e2eWorkflowId,
				execute: true,
			},
		});

		// Expand the console (256px default) once it appears with live logs.
		const consoleHeader = page.getByText("Live Agent Activity Console");
		await expect(consoleHeader).toBeVisible({ timeout: 15000 });
		await page.getByRole("button", { name: /Expand activity stream/i }).click();

		await page.getByRole("button", { name: "Configure stage Idea" }).click();
		const deleteBtn = page.getByRole("button", { name: /Delete stage Idea/i });
		await expect(deleteBtn).toBeVisible();

		const consoleBar = page.getByTestId("activity-console-bar");
		const consoleBox = await consoleBar.boundingBox();
		const deleteBox = await deleteBtn.boundingBox();
		expect(deleteBox.y + deleteBox.height).toBeLessThanOrEqual(consoleBox.y + 1);
		await deleteBtn.click({ trial: true });
	});

	test("Task inspector ends above the Now Playing footer and keeps its controls clickable", async ({
		page,
	}) => {
		const projectId = await activeProjectId(page.request);

		// A plain task pinned to the CI stage is enough for the inspector; the
		// dispatcher is stopped, so nothing auto-executes it.
		await page.request.post(`${API_BASE}/tasks`, {
			data: {
				projectId,
				title: "Inspector overlap e2e",
				goal: "Inspector overlap e2e",
				stageId: "1",
				workflowId: e2eWorkflowId,
			},
		});
		await page.reload();
		await waitForAppReadyOnProject(page);

		// Open the inspector by clicking the task card's goal text — the card's
		// action row stops click propagation, so a click there would not open it.
		// Scoped to the created card (not .first()): the board accumulates
		// cards from earlier specs in a full run, so positional lookup is
		// order-dependent and flakes.
		const taskCard = page.locator('[aria-label^="Task #KB-"]', {
			hasText: "Inspector overlap e2e",
		});
		await expect(taskCard).toBeVisible({ timeout: 15000 });
		await taskCard.getByText("Inspector overlap e2e").click();

		const inspector = page.getByRole("complementary", { name: "Task Inspector" });
		await expect(inspector).toBeVisible();

		const footer = page.locator("footer.fixed");
		await expect(footer).toBeVisible();

		const inspectorBox = await inspector.boundingBox();
		const footerBox = await footer.boundingBox();

		// Consistency contract: panel and footer are disjoint — the footer never
		// covers the inspector and the inspector never paints over the footer.
		expect(boxesOverlap(inspectorBox, footerBox)).toBe(false);
		expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(footerBox.y + 1);

		// The inspector's own bottom controls stay clickable.
		const closeBtn = inspector.getByRole("button", { name: "Close Inspector" });
		await expect(closeBtn).toBeVisible();
		await closeBtn.click({ trial: true });
		const deleteTaskBtn = inspector.getByRole("button", { name: /Delete Task/i });
		await expect(deleteTaskBtn).toBeVisible();
		await deleteTaskBtn.click({ trial: true });
	});
});