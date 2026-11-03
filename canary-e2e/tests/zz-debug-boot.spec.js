import { test, expect } from "@playwright/test";
import { APP_URL, API_URL } from "./urls";
import { waitForAppReadyOnProject, activeProjectId, resetProject } from "./helpers";

test("debug reset reload via page.request", async ({ page }) => {
	const errors = [];
	page.on("pageerror", (e) => errors.push(`PAGEERROR: ${String(e && e.message).slice(0, 500)}`));
	page.on("console", (m) => {
		if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 300)}`);
	});
	page.on("requestfailed", (r) => errors.push(`REQFAIL: ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
	const t0 = Date.now();
	await waitForAppReadyOnProject(page);
	console.log(`STEP1-READY at ${Date.now() - t0}ms`);
	await resetProject(page.request, await activeProjectId(page.request));
	console.log(`STEP2-RESET-DONE at ${Date.now() - t0}ms`);
	await page.reload();
	console.log(`STEP3-RELOADED at ${Date.now() - t0}ms`);
	try {
		await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({ timeout: 20000 });
		console.log(`STEP4-READY-AFTER-RESET at ${Date.now() - t0}ms`);
	} catch {
		console.log(`STEP4-NOT-READY-AFTER-RESET at ${Date.now() - t0}ms`);
	}
	console.log(`ERRORS(${errors.length}):`);
	for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
	const bodyLen = await page.evaluate(() => document.body.innerText.length);
	console.log(`BODYLEN: ${bodyLen}`);
});
