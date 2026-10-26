#!/usr/bin/env node
/***
 * MARK: capture-screenshot.mjs
 * @description Standalone headless Playwright utility for capturing deterministic
 * screenshots during PR review or verification stages without running ad-hoc background servers.
 *
 * Usage:
 *   node scripts/capture-screenshot.mjs --url "http://localhost:3100/#/orchestrator" --out "./docs/tasks/task-1/screenshot.png"
 *   node scripts/capture-screenshot.mjs --path "#/tasks/9940bbbc" --out "./docs/tasks/9940bbbc/stage-review.png"
 ***/

import path from "node:path";
import fs from "node:fs";

async function main() {
	const args = process.argv.slice(2);
	const getArg = (name) => {
		const idx = args.indexOf(name);
		return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
	};

	let targetUrl = getArg("--url");
	const relPath = getArg("--path");
	const outputPath = getArg("--out") || "screenshot.png";
	const width = Number(getArg("--width")) || 1440;
	const height = Number(getArg("--height")) || 900;
	const waitMs = Number(getArg("--wait")) || 1500;
	const baseUrl = process.env.KAINBAIN_URL || "http://localhost:3100";

	if (!targetUrl) {
		if (relPath) {
			const cleanRel = relPath.startsWith("/") ? relPath : `/${relPath}`;
			targetUrl = `${baseUrl.replace(/\/+$/, "")}${cleanRel}`;
		} else {
			targetUrl = baseUrl;
		}
	}

	const targetProject = getArg("--project");
	const clickSelectors = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--click" && args[i + 1]) {
			clickSelectors.push(args[i + 1]);
		}
	}

	const resolvedOut = path.resolve(process.cwd(), outputPath);
	fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });

	let chromium;
	try {
		const pw = await import("@playwright/test");
		chromium = pw.chromium;
	} catch {
		try {
			const pw = await import("playwright");
			chromium = pw.chromium;
		} catch (err) {
			console.error("Playwright is not available:", err.message);
			process.exit(1);
		}
	}

	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			viewport: { width, height },
			ignoreHTTPSErrors: true,
		});
		if (targetProject) {
			await context.addInitScript((pid) => {
				localStorage.setItem("kainbain:activeProjectId", pid);
			}, targetProject);
		}
		const page = await context.newPage();
		console.log(`Navigating to ${targetUrl}...`);
		await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
		if (waitMs > 0) {
			await page.waitForTimeout(waitMs);
		}
		for (const sel of clickSelectors) {
			console.log(`Clicking ${sel}...`);
			const locator = page.locator(sel);
			await locator.first().waitFor({ timeout: 10000 });
			await locator.first().click();
			await page.waitForTimeout(waitMs > 0 ? waitMs : 500);
		}
		await page.screenshot({ path: resolvedOut, fullPage: true });
		console.log(`✓ Screenshot captured to: ${resolvedOut}`);
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error("Screenshot capture failed:", err);
	process.exit(1);
});
