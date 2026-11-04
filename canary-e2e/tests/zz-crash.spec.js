import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";

// TEMPORARY diagnostic (deleted after use): can a crashed page navigate again?
test("zz crash recovery probe", async ({ page, context }) => {
	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
	await expect(page).toHaveTitle(/Kainbain/);
	console.log("loaded ok, crashing the page deliberately...");
	await page.goto("chrome://crash").catch((e) => console.log("crash-goto threw:", e.message.slice(0, 120)));
	await page.waitForTimeout(1500);
	const crashed = page.isClosed() ? "closed" : "open";
	console.log("page isClosed:", crashed);
	try {
		await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
		console.log("RE-GOTO AFTER CRASH: success");
		await expect(page).toHaveTitle(/Kainbain/, { timeout: 10000 });
		console.log("TITLE AFTER CRASH: ok");
	} catch (e) {
		console.log("RE-GOTO AFTER CRASH FAILED:", e.message.slice(0, 300));
	}
	try {
		const p2 = await context.newPage();
		await p2.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
		console.log("FRESH PAGE IN SAME CONTEXT: success");
		await p2.close();
	} catch (e) {
		console.log("FRESH PAGE FAILED:", e.message.slice(0, 200));
	}
});
