#!/usr/bin/env node
/***
 * MARK: capture-kb-selectors.mjs
 * @description One-off visual capture (plan Step 10) for task
 *   20d61742-612e-4c5e-b0a6-2ae7e3af913f: attaches creating-new-tickets to a
 *   stage on an ALREADY-RUNNING isolated scratch stack (API :3399 + vite :5299,
 *   scratch PROJECTS_ROOT, scheduler disabled) and screenshots the cascading
 *   KB reference selectors with the workflow dropdown open. Owns nothing it
 *   did not start; never touches the live :3100 deployment.
 ***/

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAPTURE_BASE_URL || "http://localhost:5299";
const OUT =
	process.argv[2] ||
	"docs/tasks/20d61742-612e-4c5e-b0a6-2ae7e3af913f/after-kb-selectors.png";

async function main() {
	const pw = await import("@playwright/test");
	const chromium = pw.chromium;
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 720 },
		});
		await page.goto(BASE, { waitUntil: "networkidle" });
		await page.getByRole("button", { name: "Configure stage Idea" }).click();
		await page.getByLabel(/Add skills to Idea/i).click();
		await page
			.getByRole("button", { name: "Attach skill creating-new-tickets" })
			.click();
		await page
			.getByRole("button", {
				name: /Toggle config editor for creating-new-tickets/i,
			})
			.click();
		const workflowCombo = page.getByRole("combobox", {
			name: "Keyword targetWorkflow for creating-new-tickets",
		});
		await workflowCombo.waitFor({ state: "visible", timeout: 15000 });
		// Wait for the lazy workflows fetch to land so options are populated.
		await page.waitForTimeout(800);
		await workflowCombo.click();
		await page
			.getByRole("option", { name: /Feature Pipeline \(wf-/ })
			.first()
			.waitFor({ state: "visible", timeout: 10000 });
		const resolved = path.resolve(OUT);
		fs.mkdirSync(path.dirname(resolved), { recursive: true });
		await page.screenshot({ path: resolved, fullPage: false });
		console.log(`captured -> ${resolved}`);
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
