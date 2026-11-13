import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./helpers";

test("homepage has correct title", async ({ page }) => {
	await waitForAppReady(page);
	await expect(page).toHaveTitle(/Kainbain/);
});

test("homepage displays the orchestrator cockpit", async ({ page }) => {
	await waitForAppReady(page);
	// The orchestrator header brand
	const brand = page.locator("h1");
	await expect(brand).toContainText("KAINBAIN");
	// Primary navigation tabs are present
	await expect(
		page.getByRole("button", { name: /Orchestrator/i }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: /Settings/i })).toBeVisible();
	// Project selector is wired to the backend (shows a real project)
	// Wait for the async project fetch to complete.
	await expect(page.getByRole("button", { name: /Project/i })).toBeVisible({
		timeout: 15000,
	});
});
