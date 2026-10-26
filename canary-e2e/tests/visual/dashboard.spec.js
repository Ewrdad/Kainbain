import { test, expect } from "@playwright/test";
import {
	activeProjectId,
	createTaskViaApi,
	resetProject,
	waitForAppReadyOnProject,
} from "../helpers";

/**
 * MARK: Dashboard Visual Regression Tests
 * @description Verifies the dashboard's visual states across various viewports.
 * States covered: Empty state, Active execution, and Populated history.
 *
 * NOTE: These selectors target the current orchestrator UI (Review Prompt modal,
 * workflow canvas stage columns). If the UI is refactored,
 * update the selectors here and regenerate snapshots with:
 *   npx playwright test canary-e2e/tests/visual --update-snapshots
 */

const VIEWPORTS = [
	{ name: "Desktop", width: 1280, height: 720 },
	{ name: "Tablet", width: 1024, height: 768 },
	{ name: "Mobile", width: 375, height: 667 },
];

// The live agent and the always-on engine introduce small state noise (e.g. a
// green "running" indicator, session-tree entry count, streaming tokens). Absorb that
// noise while still catching real regressions (which produce much larger diffs).
const SCREENSHOT_OPTS = { fullPage: true, maxDiffPixelRatio: 0.1, timeout: 30000 };

// Reset the active project's session + tasks so each test starts from a
// deterministic state (the live agent otherwise keeps mutating the canvas).
async function resetState(page) {
	await resetProject(page.request, await activeProjectId(page.request));
}

async function submitTask(page, goal) {
	const projectId = await activeProjectId(page.request);
	await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
	await page.reload();
	await waitForAppReadyOnProject(page);
}

test.describe("Dashboard Visuals", () => {
	for (const viewport of VIEWPORTS) {
		test.describe(`${viewport.name}`, () => {
			test.beforeEach(async ({ page }) => {
				await page.setViewportSize({
					width: viewport.width,
					height: viewport.height,
				});
				await resetState(page);
				await waitForAppReadyOnProject(page);
				// Gate on the loaded column, not skeleton placeholders: the
				// add-task control only renders once the column's tasks have
				// loaded. Without this a cold server screenshots skeletons
				// while a warm one screenshots loaded content, flipping the
				// pixel diff over the threshold between runs.
				await expect(
					page.getByRole("button", { name: /Add task to Idea/i }).first(),
				).toBeVisible({ timeout: 15000 });
				await page.evaluate(() => document.fonts.ready).catch(() => {});
			});

			test("Empty state", async ({ page }) => {
				// The KAINBAIN wordmark renders as `hidden xl:inline` (see
				// frontend/src/components/layout/Header.jsx), so only gate on it
				// where the header actually renders it (`xl` widths and up).
				if (viewport.width >= 1280) {
					await expect(page.locator("h1")).toBeVisible();
				}
				// Workflow canvas stage columns are rendered
				await expect(
					page.getByText("Idea", { exact: true }).first(),
				).toBeVisible({ timeout: 15000 });
				await expect(page).toHaveScreenshot(
					`dashboard-empty-${viewport.name}.png`,
					SCREENSHOT_OPTS,
				);
			});

			test("Active execution (task card in canvas)", async ({ page }) => {
				test.setTimeout(90000);
				const goal = "Visual active task";
				await submitTask(page, goal);
				// The task card appears in the workflow canvas
				await expect(
					page.getByText(goal, { exact: true }).first(),
				).toBeVisible({ timeout: 15000 });
				await expect(page).toHaveScreenshot(
					`dashboard-active-${viewport.name}.png`,
					SCREENSHOT_OPTS,
				);
			});

			test("Populated history (tasks + session tree)", async ({ page }) => {
				test.setTimeout(90000);
				const projectId = await activeProjectId(page.request);
				for (const goal of ["Visual history task 1", "Visual history task 2"]) {
					await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
				}
				await page.reload();
				await waitForAppReadyOnProject(page);
				// Wordmark gate: only asserted at `xl` up (`hidden xl:inline` in
				// frontend/src/components/layout/Header.jsx).
				if (viewport.width >= 1280) {
					await expect(page.locator("h1")).toBeVisible();
				}
				// The seeded task cards appear in the canvas (deterministic).
				await expect(
					page.getByText("Visual history task 1", { exact: true }).first(),
				).toBeVisible({ timeout: 15000 });
				// The live agent keeps growing the session tree, so allow a small
				// pixel tolerance for this dynamic state.
				await expect(page).toHaveScreenshot(
					`dashboard-history-${viewport.name}.png`,
					SCREENSHOT_OPTS,
				);
			});
		});
	}
});
