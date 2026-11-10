import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
	activeProjectId,
	closeTaskInspector,
	createTaskViaApi,
	openTaskInspector,
	reloadApp,
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
 *     breaking neighbouring click targets (task fa5f7234);
 *   - the inspector width is user-adjustable via the left-edge splitter,
 *     keyboard nudging, and double-click reset, and persists to the
 *     `taskInspectorWidth` UI preference;
 *   - on desktop the open inspector is a right-anchored overlay covering
 *     the board's right edge, so the toolbar (search, sort,
 *     show-completed) keeps its full size instead of squishing
 *     (task f56e9878).
 * The error-length cap + Show more guard lives in task-errors.spec.js
 * (it needs its own failing-CI fixture project).
 */

const API_BASE = API_URL;

test.describe("Task inspector core behaviors", () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReadyOnProject(page);
		await resetProject(page.request, await activeProjectId(page.request));
		await reloadApp(page);
		await waitForAppReadyOnProject(page);
	});

	test("just-created task opens the goal in edit mode with context tokens", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const goal = `Inspector edit default ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await reloadApp(page);
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
		await reloadApp(page);
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
		await reloadApp(page);
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

	test("inspector width adjusts via the splitter, keyboard, and persists", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const goal = `Inspector resize ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await reloadApp(page);
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const inspector = await openTaskInspector(page, goal);
		const splitter = inspector.getByRole("separator", {
			name: "Resize Task Inspector",
		});
		await expect(splitter).toBeVisible();

		// Accessibility contract: vertical separator with live min/max/value.
		await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
		await expect(splitter).toHaveAttribute("aria-valuemin", "320");
		await expect(splitter).toHaveAttribute("aria-valuemax", "2000");

		const widthOf = () =>
			inspector.evaluate((el) => el.getBoundingClientRect().width);
		const before = await widthOf();
		expect(before).toBeGreaterThan(300);

		// Drag the left-edge handle leftwards to widen the panel. Width
		// tracks the drag synchronously: the panel carries no
		// duration-*/transition-* classes (transition-property defaults to
		// `all`, so any duration would lag the panel behind the pointer).
		const box = await splitter.boundingBox();
		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX - 120, startY, { steps: 10 });
		await page.mouse.up();

		const widened = await widthOf();
		expect(widened).toBeGreaterThan(before + 80);
		// The inline style is the direct contract: layout follows it with no
		// transition in between.
		expect(await inspector.evaluate((el) => el.style.width)).toBe(
			`${Math.round(widened)}px`,
		);

		// The new width persists to the UI preferences in localStorage.
		const stored = await page.evaluate(() => {
			try {
				return JSON.parse(
					window.localStorage.getItem("kainbain_ui_preferences") || "{}",
				).taskInspectorWidth;
			} catch {
				return null;
			}
		});
		expect(stored).toBeGreaterThan(before);
		await expect(splitter).toHaveAttribute("aria-valuenow", String(stored));

		// Keyboard nudging grows the panel; double-click resets to default.
		await splitter.focus();
		await page.keyboard.press("ArrowLeft");
		expect(await widthOf()).toBeGreaterThan(widened);
		await splitter.dblclick();
		const reset = await widthOf();
		expect(Math.abs(reset - 560)).toBeLessThanOrEqual(1);

		await closeTaskInspector(page);
	});

	test.describe("desktop overlay geometry (task f56e9878)", () => {
		// Desktop viewport with the Now Playing footer on: the inspector is
		// a right-anchored overlay, never an in-flow flex sibling.
		test.use({ viewport: { width: 1280, height: 800 } });

		test("open inspector overlaps the board without squishing the toolbar", async ({
			page,
			request,
		}) => {
			const projectId = await activeProjectId(request);
			const goal = `Inspector overlay ${Date.now()}`;
			await createTaskViaApi(request, projectId, goal);
			await reloadApp(page);
			await waitForAppReadyOnProject(page);
			await waitForTaskVisible(page, goal);

			const canvas = page.getByTestId("orchestrator-canvas-column");
			await expect(canvas).toBeVisible();
			const closedWidth = (await canvas.boundingBox()).width;

			const inspector = await openTaskInspector(page, goal);

			// The canvas column keeps its full width underneath the panel:
			// an in-flow panel would steal ~560px of flex space and fail
			// this (the reported squish); the overlay covers instead.
			const openWidth = (await canvas.boundingBox()).width;
			expect(Math.abs(openWidth - closedWidth)).toBeLessThanOrEqual(1);

			// The panel is an out-of-flow overlay: computed `absolute`
			// (in-flow `relative` fails this), right-anchored over the
			// board's right edge.
			expect(await inspector.evaluate((el) => getComputedStyle(el).position)).toBe(
				"absolute",
			);
			const panel = await inspector.boundingBox();
			const viewport = page.viewportSize();
			expect(
				Math.abs(panel.x + panel.width - viewport.width),
			).toBeLessThanOrEqual(2);

			await closeTaskInspector(page);
			expect(
				Math.abs((await canvas.boundingBox()).width - closedWidth),
			).toBeLessThanOrEqual(1);
		});
	});
});
