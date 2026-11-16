#!/usr/bin/env node
/***
 * MARK: capture-screenshot.mjs
 * @description Standalone headless Playwright utility for capturing deterministic
 * screenshots during PR review or verification stages without running ad-hoc background servers.
 *
 * Usage:
 *   node scripts/capture-screenshot.mjs --path "#/tasks/<task-id>"
 *   node scripts/capture-screenshot.mjs --url "http://localhost:3100/#/orchestrator" --out "./docs/tasks/task-1/screenshot.png"
 *   node scripts/capture-screenshot.mjs --path "#/tasks/9940bbbc" --out "./docs/tasks/9940bbbc/stage-review.png"
 *
 * Output default (no --out): resolves the current task id — $TASK_ID, else
 *   $KAINBAIN_TASK_ID, else the kb/<task-id> branch name — and writes to
 *   docs/tasks/<task-id>/screenshot-<YYYYMMDD-HHMMSS>.png (directory created).
 *   An explicit --out always wins. With no discoverable id the script exits
 *   non-zero naming the expected --out form instead of writing to repo root.
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
import { execFileSync } from "node:child_process";
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

/***
 * MARK: sanitizeTaskId
 * @description Validates one raw task-id candidate for safe use as a path
 *   segment under docs/tasks/. Returns the trimmed id, or null when it is
 *   empty or could escape the task folder (separators, traversal, whitespace)
 *   — callers treat null as "no id" and fail fast naming --out.
 * @example sanitizeTaskId("  9940bbbc  ") => "9940bbbc"
 * @param {*} raw - One raw candidate (env value or branch segment).
 * @returns {string|null} The safe id, or null when unusable.
 ***/
export function sanitizeTaskId(raw) {
	if (raw === null || raw === undefined) return null;
	const id = String(raw).trim();
	if (id === "") return null;
	if (id.includes("/") || id.includes("\\") || id.includes("..") || /\s/.test(id)) return null;
	return id;
}

/***
 * MARK: resolveTaskId
 * @description Resolves the current task id for the no-flag default output:
 *   $TASK_ID first, else $KAINBAIN_TASK_ID, else the kb/<task-id> branch
 *   name. Empty values count as unset and fall through; a non-empty but
 *   unsafe value resolves to null (fail fast) rather than falling through
 *   to a different source or building a traversal path. Pure: env and branch
 *   are injected so tests never touch process.env or git.
 * @example resolveTaskId({ env: {}, branch: "kb/9940bbbc" }) => "9940bbbc"
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Environment mapping to read the id from.
 * @param {string|null} [opts.branch] - Current git branch name, if known.
 * @returns {string|null} The task id, or null when none is discoverable.
 ***/
export function resolveTaskId({ env = {}, branch = null } = {}) {
	const scope = env || {};
	for (const raw of [scope.TASK_ID, scope.KAINBAIN_TASK_ID]) {
		if (raw === null || raw === undefined) continue;
		if (String(raw).trim() === "") continue;
		return sanitizeTaskId(raw);
	}
	if (typeof branch === "string") {
		const name = branch.trim();
		if (name.startsWith("kb/")) {
			const raw = name.slice("kb/".length);
			if (raw.trim() === "") return null;
			return sanitizeTaskId(raw);
		}
	}
	return null;
}

/***
 * MARK: defaultTaskScreenshotPath
 * @description Builds the no-flag default output path for a task:
 *   docs/tasks/<task-id>/screenshot-<YYYYMMDD-HHMMSS>.png (local time, so
 *   each capture lands in a fresh file instead of overwriting). Throws on
 *   an unsafe id rather than building a traversal path.
 * @example defaultTaskScreenshotPath("9940bbbc", new Date(2026, 10, 16, 18, 30, 5)) => "docs/tasks/9940bbbc/screenshot-20261116-183005.png"
 * @param {string} taskId - Resolved task id (a docs/tasks/ segment).
 * @param {Date} [now] - Clock for the timestamp, defaults to now.
 * @returns {string} Repo-relative default output path.
 ***/
export function defaultTaskScreenshotPath(taskId, now = new Date()) {
	const id = sanitizeTaskId(taskId);
	if (!id) {
		throw new Error(
			`Refusing to build a default screenshot path for unsafe task id ${JSON.stringify(taskId)}. `
			+ "Pass --out explicitly, e.g. --out docs/tasks/<task-id>/<name>-proof.png",
		);
	}
	const pad = (value) => String(value).padStart(2, "0");
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
		+ `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `docs/tasks/${id}/screenshot-${stamp}.png`;
}

/***
 * MARK: resolveOutputPath
 * @description Resolves the capture output path: an explicit --out always
 *   wins byte-for-byte; otherwise the task-folder default for the resolved
 *   task id. Throws naming the expected --out form when no id is
 *   discoverable — never a repo-root fallback. Pure: env, branch, and clock
 *   are injected so tests never launch git or Playwright.
 * @example resolveOutputPath({ env: {}, branch: "kb/9940bbbc" }) => "docs/tasks/9940bbbc/screenshot-<timestamp>.png"
 * @param {Object} [opts]
 * @param {string|null} [opts.outArg] - The explicit --out value, if given.
 * @param {Object} [opts.env] - Environment mapping for task-id resolution.
 * @param {string|null} [opts.branch] - Current git branch name, if known.
 * @param {Date} [opts.now] - Clock for the default timestamp.
 * @returns {string} The output path to write.
 ***/
export function resolveOutputPath({ outArg = null, env = {}, branch = null, now = new Date() } = {}) {
	if (typeof outArg === "string" && outArg.length > 0) return outArg;
	const taskId = resolveTaskId({ env, branch });
	if (!taskId) {
		throw new Error(
			"Cannot determine task id (checked $TASK_ID/$KAINBAIN_TASK_ID and the kb/<task-id> branch). "
			+ "Pass --out explicitly, e.g. --out docs/tasks/<task-id>/<name>-proof.png",
		);
	}
	return defaultTaskScreenshotPath(taskId, now);
}

/***
 * MARK: getCurrentBranch
 * @description Reads the current git branch name for task-id resolution.
 *   Any failure (not a repo, git missing, detached HEAD with no name)
 *   returns null — "no id", never a crash with a raw stack.
 * @example getCurrentBranch() => "kb/9940bbbc" or null
 * @returns {string|null} The branch name, or null when git cannot answer.
 ***/
function getCurrentBranch() {
	try {
		const out = execFileSync("git", ["branch", "--show-current"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const branch = String(out).trim();
		return branch === "" ? null : branch;
	} catch {
		return null;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const getArg = (name) => {
		const idx = args.indexOf(name);
		return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
	};

	let targetUrl = getArg("--url");
	const relPath = getArg("--path");
	const outArg = getArg("--out");
	let outputPath = outArg;
	if (!outputPath) {
		try {
			outputPath = resolveOutputPath({ env: process.env, branch: getCurrentBranch() });
		} catch (err) {
			console.error(err.message);
			process.exit(1);
		}
	}
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
