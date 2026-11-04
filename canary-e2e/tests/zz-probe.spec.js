import { test, expect } from "@playwright/test";
import {
	activeProjectId,
	createTaskViaApi,
	resetProject,
	waitForAppReadyOnProject,
} from "./helpers";

// TEMPORARY diagnostic spec (deleted after use): replicates task-inspector
// test 3 with console/network instrumentation to catch the white-stall.
test("zz probe instrumented reload", async ({ page, request, context }) => {
	const logs = [];
	page.on("console", (m) => logs.push(`[console:${m.type()}] ${m.text().slice(0, 200)}`));
	page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
	page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
	page.on("crash", () => logs.push("[PAGE CRASHED]"));

	await waitForAppReadyOnProject(page);
	await resetProject(page.request, await activeProjectId(page.request));
	await page.reload();
	await waitForAppReadyOnProject(page);
	logs.push("beforeEach-equivalent done");

	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	const projectId = await activeProjectId(request);
	const goal = `ZZ probe ${Date.now()}`;
	await createTaskViaApi(request, projectId, goal);
	logs.push("task created");
	await page.reload();
	logs.push("reload issued");
	await page.goto("http://localhost:5299", { waitUntil: "domcontentloaded" });
	logs.push("goto done");
	await expect(page).toHaveTitle(/Kainbain/);
	logs.push("title ok");
	try {
		await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({ timeout: 15000 });
		logs.push("PROJECT BUTTON VISIBLE");
	} catch (e) {
		logs.push(`BUTTON WAIT FAILED: ${String(e.message).split("\n")[0]}`);
		const state = await page.evaluate(() => ({
			rootChildren: document.querySelector("#root")?.childElementCount ?? -1,
			htmlLen: document.documentElement.outerHTML.length,
			scripts: [...document.scripts].map((s) => s.src || s.type).slice(0, 10),
			pending: performance.getEntriesByType("resource").filter((r) => r.responseEnd === 0).map((r) => r.name.slice(0, 140)),
			resources: performance.getEntriesByType("resource").length,
		})).catch((err) => ({ evalErr: String(err).slice(0, 200) }));
		logs.push(`STATE: ${JSON.stringify(state).slice(0, 2000)}`);
	}
	console.log(logs.join("\n"));
});
