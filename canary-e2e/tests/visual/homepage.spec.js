import { test, expect } from "@playwright/test";
import { activeProjectId, resetProject, waitForAppReadyOnProject } from "../helpers";

/**
 * MARK: Visual Regression Tests
 * @description Verifies visual consistency across different screen ratios and devices.
 * @example run `npm run test:visual`
 *
 * NOTE: The app has persistent state (disk-backed sessions, tasks) and a live
 * agent, so each test resets the active project's state first to capture a
 * deterministic screenshot.
 */

const VIEWPORTS = [
	{ name: "Desktop", width: 1280, height: 720 },
	{ name: "Tablet", width: 1024, height: 768 },
	{ name: "Mobile", width: 375, height: 667 },
];

// The live agent and always-on engine introduce small state noise; absorb it
// while still catching real regressions.
const SCREENSHOT_OPTS = { fullPage: true, maxDiffPixelRatio: 0.1, timeout: 30000 };

async function waitForHomepageReady(page) {
	await waitForAppReadyOnProject(page);
	await expect(page.getByText("Idea", { exact: true }).first()).toBeVisible({
		timeout: 15000,
	});
	// Gate on the loaded column, not skeleton placeholders: the add-task
	// control only renders once the column's tasks have loaded. Without this
	// a cold server screenshots skeletons while a warm one screenshots loaded
	// content, flipping the pixel diff over the threshold between runs.
	await expect(
		page.getByRole("button", { name: /Add task to Idea/i }).first(),
	).toBeVisible({ timeout: 15000 });
}

async function resetState(page) {
	await resetProject(page.request, await activeProjectId(page.request));
}

test.describe("Homepage Visuals", () => {
	for (const viewport of VIEWPORTS) {
		test(`visual regression - ${viewport.name}`, async ({ page }) => {
			await page.setViewportSize({
				width: viewport.width,
				height: viewport.height,
			});
			await resetState(page);
			await waitForHomepageReady(page);

			// Ensure content is loaded. The KAINBAIN wordmark renders as
			// `hidden xl:inline` (see frontend/src/components/layout/Header.jsx),
			// so it is only visible at `xl` widths and up — only gate on it
				// where the header actually renders it.
			if (viewport.width >= 1280) {
				await expect(page.locator("h1")).toBeVisible();
			}
			await page.evaluate(() => document.fonts.ready).catch(() => {});

			await expect(page).toHaveScreenshot(`homepage-${viewport.name}.png`, {
				...SCREENSHOT_OPTS,
			});
		});
	}
});
