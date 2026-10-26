import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
	activeProjectId,
	closeTaskInspector,
	createTaskViaApi,
	openTaskInspector,
	resetProject,
	waitForAppReadyOnProject,
	waitForTaskVisible,
} from "./helpers";

/**
 * MARK: Task inspector core behaviors (task bf5695e4)
 * @description Guards the slide-over inspector regressions:
 *   - just-created tasks open the goal in edit mode, older tasks in
 *     preview (task 6df5eecd; the old-task default is unit-pinned in
 *     TaskGoalSection.test.jsx — the API cannot backdate createdAt, so
 *     E2E pins the just-created half plus the toggle round-trip);
 *   - the Dynamic Context Tokens block shows in edit, hides in preview
 *     (task 20670b9c);
 *   - click-to-copy on the task key copies the full task id without
 *     breaking neighbouring click targets (task fa5f7234).
 * The error-length cap + Show more guard lives in task-errors.spec.js
 * (it needs its own failing-CI fixture project).
 */

const API_BASE = API_URL;

test.describe("Task inspector core behaviors", () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReadyOnProject(page);
		await resetProject(page.request, await activeProjectId(page.request));
		await page.reload();
		await waitForAppReadyOnProject(page);
	});

	test("just-created task opens the goal in edit mode with context tokens", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const goal = `Inspector edit default ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const inspector = await openTaskInspector(page, goal);
		// Edit mode: the goal textarea is visible (labelled "Task Title").
		await expect(inspector.getByLabel("Task Title")).toBeVisible();
		await expect(inspector.getByLabel("Task Title")).toHaveValue(new RegExp(goal));
		// The Dynamic Context Tokens block renders in edit mode.
		await expect(inspector.getByText("Dynamic Context Tokens")).toBeVisible();
	});

	test("preview toggle hides the editor and the context tokens, edit restores them", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const goal = `Inspector toggle ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const inspector = await openTaskInspector(page, goal);
		const editor = inspector.getByLabel("Task Title");
		await expect(editor).toBeVisible();

		await inspector.getByRole("button", { name: "Preview", exact: true }).click();
		await expect(editor).toHaveCount(0);
		await expect(inspector.getByText("Dynamic Context Tokens")).toHaveCount(0);
		// The rendered goal is still readable in preview (scoped: the
		// inspector heading shows the same text).
		await expect(inspector.getByTestId("markdown-viewer").getByText(goal)).toBeVisible();

		await inspector.getByRole("button", { name: "Edit", exact: true }).click();
		await expect(editor).toBeVisible();
		await expect(editor).toHaveValue(new RegExp(goal));
		await expect(inspector.getByText("Dynamic Context Tokens")).toBeVisible();
	});

	test("clicking the task key copies the full task id and keeps the inspector open", async ({
		page,
		request,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const projectId = await activeProjectId(request);
		const goal = `Inspector copy id ${Date.now()}`;
		const created = await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const inspector = await openTaskInspector(page, goal);
		const copyButton = inspector.getByRole("button", {
			name: `Copy task ID ${created.id}`,
		});
		await expect(copyButton).toBeVisible();
		await copyButton.click();

		// Transient confirmation, then the clipboard holds the full id.
		await expect(inspector.getByText("Copied ✓")).toBeVisible();
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(created.id);
		// The click copied only: the inspector stays open on the same task.
		await expect(inspector.getByText(goal).first()).toBeVisible();
		await expect(
			page.getByRole("complementary", { name: "Task Inspector" }),
		).toBeVisible();
		await closeTaskInspector(page);
	});
});
