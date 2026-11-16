#!/usr/bin/env node
/***
 * MARK: capture-screenshot.mjs
 * @description Standalone headless Playwright utility for capturing deterministic
 * screenshots during PR review or verification stages without running ad-hoc background servers.
 *
 * Usage:
 *   node scripts/capture-screenshot.mjs --url "http://localhost:3100/#/orchestrator" --out "./docs/tasks/task-1/screenshot.png"
 *   node scripts/capture-screenshot.mjs --path "#/tasks/9940bbbc" --out "./docs/tasks/9940bbbc/stage-review.png"
 *
 * Proof checklist (canonical rules: docs/agent-docs/GitGuidance.md):
 *   1. This script writes bytes directly — never open the PNG in an editor
 *      or rewrite it with a text-oriented tool (UTF-8 round-trips corrupt
 *      it: magic `ef bf bd` instead of `89 50 4e 47`).
 *   2. Before claiming validity: `xxd -l 8 <out>` (expect `8950 4e47…`)
 *      and `file <out>` (expect `PNG image data`, not `data`).
 *   3. This script self-verifies PNG magic right after writing and fails
 *      fast when the write was interrupted — quote its `PNG magic
 *      verified` line as the validity evidence, then run the pre-handoff
 *      gate `npm run check:binaries` (CI re-verifies every proof image
 *      via `npm run check:proof-hygiene`).
 ***/

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/***
 * MARK: verifyPngMagic
 * @description Verifies a capture wrote intact PNG bytes by comparing the
 *   file's leading head against the PNG magic `89504e47`. Non-PNG outputs
 *   are skipped, never failed; a missing or empty capture FAILS, so a
 *   screenshot that never landed can never be claimed valid.
 * @example verifyPngMagic("/repo/docs/tasks/x/shot-proof.png") => { ok: true, ... }
 * @param {string} absPath - Absolute path of the capture output.
 * @returns {{ ok: boolean, expected: string|null, actual: string|null, skipped?: string, error?: string }}
 ***/
export function verifyPngMagic(absPath) {
	const ext = path.extname(absPath).toLowerCase();
	if (ext !== ".png") {
		return { ok: true, expected: null, actual: null, skipped: `not a PNG output (${ext || "(none)"})` };
	}
	const expected = "89504e47";
	let head;
	try {
		const fd = fs.openSync(absPath, "r");
		try {
			const buf = Buffer.alloc(8);
			const read = fs.readSync(fd, buf, 0, 8, 0);
			head = buf.subarray(0, read);
		} finally {
			fs.closeSync(fd);
		}
	} catch (err) {
		const reason = err && err.code ? `${err.code}: ${absPath}` : `read failed: ${absPath}`;
		return { ok: false, expected, actual: null, error: reason };
	}
	const actual = head.toString("hex").toLowerCase();
	const ok = actual.startsWith(expected);
	return ok
		? { ok, expected, actual }
		: { ok, expected, actual, error: `capture bytes do not start with PNG magic ${expected}` };
}

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
		const verification = verifyPngMagic(resolvedOut);
		if (!verification.ok) {
			throw new Error(
				`Capture at ${resolvedOut} failed PNG verification `
				+ `(expected magic ${verification.expected}, found ${verification.actual ?? verification.error}); `
				+ "the file was written by the capture script itself, so this means the write was "
				+ "interrupted — re-run the capture, never hand-edit the PNG.",
			);
		}
		if (!verification.skipped) {
			console.log(`✓ PNG magic verified (${verification.actual.slice(0, 8)}…): bytes written directly, no text-tool step.`);
		}
	} finally {
		await browser.close();
	}
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main().catch((err) => {
		console.error("Screenshot capture failed:", err);
		process.exit(1);
	});
}
