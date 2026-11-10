import { test, expect } from "@playwright/test";
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
 * MARK: overlay verification (temporary manual-verification spec, task f56e9878)
 * @description Full user-visible pass for the desktop overlay change:
 *   toolbar width stability with the inspector open vs closed, inspector /
 *   board overlap geometry, splitter drag with per-frame width samples,
 *   double-click reset, Escape close, button close, and footer reservation.
 *   Screenshots land in /tmp/kb-overlay-verify (outside the repo).
 *   Temporary: the durable assertions live in TaskDetailOverlay.test.jsx,
 *   OrchestratorView.test.jsx, and the toolbar-stability test in
 *   task-inspector.spec.js — this file is deleted after the verification run.
 */

test.describe("Desktop inspector overlay verification", () => {
	test.use({ viewport: { width: 1920, height: 1080 } });

	test.beforeEach(async ({ page }) => {
		await waitForAppReadyOnProject(page);
		await resetProject(page.request, await activeProjectId(page.request));
		await page.reload();
		await waitForAppReadyOnProject(page);
	});

	test("toolbar keeps its size, inspector overlaps the board, all close paths work", async ({
		page,
		request,
	}) => {
		const projectId = await activeProjectId(request);
		const goal = `Overlay verify ${Date.now()}`;
		await createTaskViaApi(request, projectId, goal);
		await page.reload();
		await waitForAppReadyOnProject(page);
		await waitForTaskVisible(page, goal);

		const searchBox = () => page.getByPlaceholder(/Search tasks/i);
		const inspectorBy = () =>
			page.getByRole("complementary", { name: "Task Inspector" });

		// Baseline: toolbar search width with no inspector open.
		await expect(searchBox()).toBeVisible();
		const closedWidth = (await searchBox().boundingBox()).width;

		// Open the inspector via card click.
		const inspector = await openTaskInspector(page, goal);
		await page.screenshot({ path: "/tmp/kb-overlay-verify/01-open.png" });

		// 1. Toolbar stability: search keeps its full width underneath.
		const openWidth = (await searchBox().boundingBox()).width;
		expect(Math.abs(openWidth - closedWidth)).toBeLessThanOrEqual(1);

		// 2. Overlap geometry: right-anchored, covering the board's right edge.
		const panel = await inspector.boundingBox();
		const viewport = page.viewportSize();
		expect(Math.abs(panel.x + panel.width - viewport.width)).toBeLessThanOrEqual(2);
		const boardProbe = await page.evaluate(() => {
			const el = document.querySelector("[data-testid='board-scroll'], .overflow-x-auto");
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.x, width: r.width };
		});
		if (boardProbe) {
			const overlap = boardProbe.x + boardProbe.width - panel.x;
			expect(overlap).toBeGreaterThan(100);
		}

		// 3. Splitter drag with per-frame sampling (multi-frame responsiveness).
		const splitter = inspector.getByRole("separator", {
			name: "Resize Task Inspector",
		});
		const widthOf = () => inspector.evaluate((el) => el.getBoundingClientRect().width);
		const before = await widthOf();
		const box = await splitter.boundingBox();
		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		const frames = [];
		for (let i = 1; i <= 10; i += 1) {
			await page.mouse.move(startX - i * 12, startY, { steps: 2 });
			frames.push(await widthOf());
		}
		await page.mouse.up();
		const widened = await widthOf();
		expect(widened).toBeGreaterThan(before + 80);
		// Monotonic growth across frames: the panel tracks the pointer.
		for (let i = 1; i < frames.length; i += 1) {
			expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1] - 1);
		}
		await page.screenshot({ path: "/tmp/kb-overlay-verify/02-dragged.png" });

		// 4. Double-click reset.
		await splitter.dblclick();
		expect(Math.abs((await widthOf()) - 560)).toBeLessThanOrEqual(1);

		// 5. Escape closes.
		await page.keyboard.press("Escape");
		await expect(inspectorBy()).toHaveCount(0);

		// 6. Button close after reopen; toolbar width unchanged throughout.
		await openTaskInspector(page, goal);
		expect(Math.abs((await searchBox().boundingBox()).width - closedWidth)).toBeLessThanOrEqual(1);
		await closeTaskInspector(page);
		expect(Math.abs((await searchBox().boundingBox()).width - closedWidth)).toBeLessThanOrEqual(1);

		// 7. Footer reservation: inspector ends above the Now Playing footer.
		await openTaskInspector(page, goal);
		const footer = page.getByText("Active Task", { exact: true });
		await expect(footer).toBeVisible();
		const footerBox = await footer.boundingBox();
		const panelBox = await inspectorBy().boundingBox();
		expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(footerBox.y + 1);
		await page.screenshot({ path: "/tmp/kb-overlay-verify/03-footer.png" });
		await closeTaskInspector(page);
	});
});
