import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";
import { collectPageErrors } from "./helpers";

/***
 * MARK: Runtime Error Canary
 * @description Guards against whole-UI runtime crashes (e.g. "React is not
 *   defined" from a missing React import in a JSX component). Loads the app
 *   and asserts the page renders AND that no uncaught page errors or console
 *   errors are emitted. This is the safety net that catches a broken bundle
 *   that unit tests (which use the automatic JSX runtime) would miss.
 ***/
test("app renders without uncaught page errors", async ({ page }) => {
	const pageErrors = collectPageErrors(page);

	await page.goto(APP_URL);
	// The orchestrator header brand must render — if the UI crashed, this fails.
	await expect(page.locator("h1")).toContainText("KAINBAIN", { timeout: 15000 });

	expect(pageErrors).toEqual([]);
});

test("app renders without console errors", async ({ page }) => {
	const consoleErrors = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});

	await page.goto(APP_URL);
	await expect(page.locator("h1")).toContainText("KAINBAIN", { timeout: 15000 });

	// Ignore benign network/404 noise; fail on real runtime errors.
	const realErrors = consoleErrors.filter(
		(t) => !/Failed to load resource|404|net::ERR/.test(t),
	);
	expect(realErrors).toEqual([]);
});
