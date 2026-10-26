import { test, expect } from "@playwright/test";
import { waitForAppReadyOnProject, waitForFontsSettled } from "../helpers";

/***
 * MARK: Header Visual Regression Tests (task 66ad153f)
 * @description Screenshots the global header band at Mobile (375, the overlap
 *   band), Tablet (1024, the historically-broken 640-1060 sm-step band), and
 *   Desktop (1280, must stay visually unchanged). Regenerate with:
 *     npx playwright test canary-e2e/tests/visual/header.spec.js --update-snapshots
 *   then review the regenerated PNGs by eye.
 ***/

const VIEWPORTS = [
	{ name: "Mobile", width: 375, height: 667 },
	{ name: "Tablet", width: 1024, height: 768 },
	{ name: "Desktop", width: 1280, height: 720 },
];

const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.05, timeout: 30000 };

test.describe("Header Visuals (task 66ad153f)", () => {
	for (const viewport of VIEWPORTS) {
		test(`header band at ${viewport.name} ${viewport.width}px`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await waitForAppReadyOnProject(page);
			await waitForFontsSettled(page);
			const header = page.locator("header").first();
			await expect(header).toBeVisible();
			await expect(header).toHaveScreenshot(
				`header-${viewport.name.toLowerCase()}-${viewport.width}.png`,
				SCREENSHOT_OPTS,
			);
		});
	}
});
