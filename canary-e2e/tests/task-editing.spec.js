import { test, expect } from "@playwright/test";
import {
	activeProjectId,
	createTaskViaApi,
	openTaskInspector,
	resetProject,
	waitForAppReadyOnProject,
	waitForTaskVisible,
} from "./helpers";

/**
 * MARK: Task-view editing behaviors (task bf5695e4)
 * @description Guards the goal-editor regressions:
 *   - an attached image's markdown is appended at the END of the goal on
 *     its own new line, never spliced into the title/first line
 *     (task 37ecfdac);
 *   - a preview/edit toggle round-trip preserves the edited content.
 */

// 1x1 transparent PNG (68 bytes) — a valid upload payload.
const PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

test.describe("Task-view editing behaviors", () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReadyOnProject(page);
		await resetProject(page.request, await activeProjectId(page.request));
		await page.reload();
		await waitForAppReadyOnProject(page);
	});

	test("attached image markdown is appended at the end, title line intact", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const titleLine = `Image title ${Date.now()}`;
		const goal = `${titleLine}\nBody line stays above the attachment.`;
		await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, titleLine);

		const inspector = await openTaskInspector(page, titleLine);
		const editor = inspector.getByLabel("Task Title");
		await expect(editor).toBeVisible();

		await inspector.getByTestId("task-image-input").setInputFiles({
			name: "shot.png",
			mimeType: "image/png",
			buffer: PIXEL_PNG,
		});

		// The reference lands at the end on its own line…
		await expect(editor).toHaveValue(/!\[shot\.png\]\(assets\/shot\.png\)\n?$/);
		// …and the title/first line is byte-identical.
		const value = await editor.inputValue();
		expect(value.split("\n")[0]).toBe(titleLine);
		expect(value).toContain("Body line stays above the attachment.");

		// Preview resolves the attachment to the task-image endpoint.
		await inspector.getByRole("button", { name: "Preview", exact: true }).click();
		const previewImage = inspector
			.getByTestId("markdown-viewer")
			.locator('img[src*="/images/shot.png"]');
		await expect(previewImage).toBeVisible();
	});

	test("preview/edit round-trip preserves edited content", async ({ page, request }) => {
		const projectId = await activeProjectId(request);
		const goal = `Round trip ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const inspector = await openTaskInspector(page, goal);
		const editor = inspector.getByLabel("Task Title");
		await expect(editor).toBeVisible();

		const added = "An added **markdown** line.";
		await editor.fill(`${goal}\n${added}`);

		await inspector.getByRole("button", { name: "Preview", exact: true }).click();
		await expect(inspector.getByTestId("markdown-viewer").getByText(goal)).toBeVisible();
		await expect(
			inspector.getByTestId("markdown-viewer").getByText("An added markdown line."),
		).toBeVisible();

		await inspector.getByRole("button", { name: "Edit", exact: true }).click();
		await expect(editor).toHaveValue(`${goal}\n${added}`);
	});
});
