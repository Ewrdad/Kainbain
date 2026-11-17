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
 *   A default name already taken by an earlier same-second capture gains a
 *   -01, -02, ... suffix instead of overwriting (explicit --out keeps
 *   today's exact overwrite behavior). A flag token right after --out
 *   counts as a missing value, never as a path.
 *
 * Fails fast (exit 1, before launching a browser) when no task id is
 *   discoverable, when the id is unsafe for a path, or when all 99
 *   same-second fallback names are taken — each message shows the --out
 *   form to pass instead.
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
	const fileExtension = path.extname(absPath).toLowerCase();
	if (fileExtension !== ".png") {
		return { ok: true, expected: null, actual: null, skipped: `not a PNG output (${fileExtension || "(none)"})` };
	}
	const expected = "89504e47";
	let pngHeadBytes;
	try {
		const fileDescriptor = fs.openSync(absPath, "r");
		try {
			const headBuffer = Buffer.alloc(8);
			const bytesRead = fs.readSync(fileDescriptor, headBuffer, 0, 8, 0);
			pngHeadBytes = headBuffer.subarray(0, bytesRead);
		} finally {
			fs.closeSync(fileDescriptor);
		}
	} catch (err) {
		const reason = err && err.code ? `${err.code}: ${absPath}` : `read failed: ${absPath}`;
		return { ok: false, expected, actual: null, error: reason };
	}
	const actual = pngHeadBytes.toString("hex").toLowerCase();
	const ok = actual.startsWith(expected);
	return ok
		? { ok, expected, actual }
		: { ok, expected, actual, error: `capture bytes do not start with PNG magic ${expected}` };
}

/***
 * MARK: sanitizeTaskId
 * @description Checks one raw task-id candidate is safe to use as a single
 *   folder name under docs/tasks/. Returns the trimmed id when it starts
 *   with a letter or digit and holds only letters, digits, dots, dashes,
 *   and underscores (covers UUIDs and short slugs like task-1); returns
 *   null for anything else — empty values, separators, traversal (. / ..
 *   / ../x), hidden names (.well-known), whitespace, or shell-hostile
 *   characters — so callers treat it as "no id" and fail fast naming
 *   --out instead of writing outside the task folder.
 * @example sanitizeTaskId("  9940bbbc  ") => "9940bbbc"
 * @example sanitizeTaskId("../x") => null
 * @param {*} rawTaskId - One raw candidate (env value or branch segment).
 * @returns {string|null} The safe id, or null when unusable.
 ***/
export function sanitizeTaskId(rawTaskId) {
	if (rawTaskId === null || rawTaskId === undefined) return null;
	const candidateTaskId = String(rawTaskId).trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidateTaskId)) return null;
	return candidateTaskId;
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
	for (const rawCandidate of [scope.TASK_ID, scope.KAINBAIN_TASK_ID]) {
		if (rawCandidate === null || rawCandidate === undefined) continue;
		if (String(rawCandidate).trim() === "") continue;
		return sanitizeTaskId(rawCandidate);
	}
	if (typeof branch === "string") {
		const branchName = branch.trim();
		if (branchName.startsWith("kb/")) {
			const branchTaskSegment = branchName.slice("kb/".length);
			if (branchTaskSegment.trim() === "") return null;
			return sanitizeTaskId(branchTaskSegment);
		}
	}
	return null;
}

/***
 * MARK: buildDefaultTaskScreenshotPath
 * @description Builds the no-flag default output path for a task:
 *   docs/tasks/<task-id>/screenshot-<YYYYMMDD-HHMMSS>.png (local time, so
 *   each capture lands in a fresh file instead of overwriting). Throws on
 *   an unsafe id rather than building a traversal path. Two captures
 *   inside the same second share a name — main() hands this to
 *   findUnusedFilePath so the second capture gains a -01 suffix instead
 *   of overwriting the first.
 * @example buildDefaultTaskScreenshotPath("9940bbbc", new Date(2026, 10, 16, 18, 30, 5)) => "docs/tasks/9940bbbc/screenshot-20261116-183005.png"
 * @param {string} taskId - Resolved task id (a docs/tasks/ segment).
 * @param {Date} [now] - Clock for the timestamp, defaults to now.
 * @returns {string} Repo-relative default output path.
 ***/
export function buildDefaultTaskScreenshotPath(taskId, now = new Date()) {
	const safeTaskId = sanitizeTaskId(taskId);
	if (!safeTaskId) {
		throw new Error(
			`Refusing to build a default screenshot path for unsafe task id ${JSON.stringify(taskId)}. `
			+ "Pass --out explicitly, e.g. --out docs/tasks/<task-id>/<name>-proof.png",
		);
	}
	const padToTwoDigits = (numberValue) => String(numberValue).padStart(2, "0");
	const stamp = `${now.getFullYear()}${padToTwoDigits(now.getMonth() + 1)}${padToTwoDigits(now.getDate())}`
		+ `-${padToTwoDigits(now.getHours())}${padToTwoDigits(now.getMinutes())}${padToTwoDigits(now.getSeconds())}`;
	return `docs/tasks/${safeTaskId}/screenshot-${stamp}.png`;
}

/***
 * MARK: findUnusedFilePath
 * @description Picks a free file name for a default capture: the starting
 *   path itself when nothing exists there, else the first free
 *   <base>-01.ext, <base>-02.ext, ... so a same-second second capture
 *   never silently overwrites the first (nothing is overwritten). Used
 *   for the default path only — an explicit --out keeps today's exact
 *   overwrite behavior. Pure: the existence check is injected so tests
 *   never touch the disk.
 * @example findUnusedFilePath({ startingPath: "a.png", fileExists: () => false }) => "a.png"
 * @example findUnusedFilePath({ startingPath: "a.png", fileExists: (p) => p === "a.png" }) => "a-01.png"
 * @param {Object} [opts]
 * @param {string} opts.startingPath - First-choice path.
 * @param {Function} opts.fileExists - Existence check ((path) => boolean).
 * @returns {string} The starting path or the first free suffixed variant.
 ***/
export function findUnusedFilePath({ startingPath, fileExists } = {}) {
	if (!fileExists(startingPath)) return startingPath;
	const fileExtension = path.extname(startingPath);
	const baseWithoutExtension = startingPath.slice(0, startingPath.length - fileExtension.length);
	for (let suffixNumber = 1; suffixNumber <= 99; suffixNumber += 1) {
		const candidatePath = `${baseWithoutExtension}-${String(suffixNumber).padStart(2, "0")}${fileExtension}`;
		if (!fileExists(candidatePath)) return candidatePath;
	}
	throw new Error(
		`All 99 fallback names for ${JSON.stringify(startingPath)} are taken. `
		+ "Pass --out explicitly, e.g. --out docs/tasks/<task-id>/<name>-proof.png",
	);
}

/***
 * MARK: resolveOutputPath
 * @description Resolves the capture output path: an explicit --out always
 *   wins byte-for-byte (an empty value counts as omitted); otherwise the
 *   task-folder default for the resolved task id. Throws naming the
 *   expected --out form when no id is discoverable — never a repo-root
 *   fallback. Pure: env, branch, and clock are injected so tests never
 *   launch git or Playwright.
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
	return buildDefaultTaskScreenshotPath(taskId, now);
}

/***
 * MARK: readFlagValue
 * @description Reads one `--flag value` pair from an argv-style list: the
 *   token after the flag's first occurrence, or null when the flag is
 *   absent, has no token after it, is followed by another --flag, or is
 *   followed by an empty value. The flag-follows-flag rule matters for
 *   --out: without it `--out --path ...` would capture a file literally
 *   named "--path" at the repo root — the stray-root write this script's
 *   default exists to eliminate. Pure: argv is injected, so tests pass
 *   arrays instead of spawning the script.
 * @example readFlagValue({ args: ["--out", "a.png"], flagName: "--out" }) => "a.png"
 * @example readFlagValue({ args: ["--out", "--path", "x"], flagName: "--out" }) => null
 * @param {Object} [opts]
 * @param {Array<string>} [opts.args] - Argument tokens (process.argv.slice(2) in main).
 * @param {string} opts.flagName - Flag to read, e.g. "--out".
 * @returns {string|null} The flag's value, or null when missing.
 ***/
export function readFlagValue({ args = [], flagName } = {}) {
	const tokens = Array.isArray(args) ? args : [];
	const flagIndex = tokens.indexOf(flagName);
	if (flagIndex === -1) return null;
	const flagValue = tokens[flagIndex + 1];
	if (typeof flagValue !== "string" || flagValue === "" || flagValue.startsWith("--")) return null;
	return flagValue;
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
		const branchOutput = execFileSync("git", ["branch", "--show-current"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const branchName = String(branchOutput).trim();
		return branchName === "" ? null : branchName;
	} catch {
		return null;
	}
}

/***
 * MARK: exitWithUsageError
 * @description Prints a usage error and exits non-zero before any browser
 *   launches. Callers return right after it so a stubbed process.exit in
 *   tests cannot fall through into the capture.
 * @example exitWithUsageError("Cannot determine task id ...") => exits 1
 ***/
function exitWithUsageError(message) {
	console.error(message);
	process.exit(1);
}

async function main() {
	const args = process.argv.slice(2);

	const outArg = readFlagValue({ args, flagName: "--out" });
	let outputPath = outArg;
	let usedDefaultPath = false;
	if (!outputPath) {
		try {
			outputPath = resolveOutputPath({ env: process.env, branch: getCurrentBranch() });
			usedDefaultPath = true;
		} catch (err) {
			exitWithUsageError(err.message);
			return;
		}
	}
	let targetUrl = readFlagValue({ args, flagName: "--url" });
	const relativePath = readFlagValue({ args, flagName: "--path" });
	const width = Number(readFlagValue({ args, flagName: "--width" })) || 1440;
	const height = Number(readFlagValue({ args, flagName: "--height" })) || 900;
	const waitMs = Number(readFlagValue({ args, flagName: "--wait" })) || 1500;
	const baseUrl = process.env.KAINBAIN_URL || "http://localhost:3100";

	if (!targetUrl) {
		if (relativePath) {
			const cleanRelativePath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
			targetUrl = `${baseUrl.replace(/\/+$/, "")}${cleanRelativePath}`;
		} else {
			targetUrl = baseUrl;
		}
	}

	const targetProject = readFlagValue({ args, flagName: "--project" });
	const clickSelectors = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--click" && args[i + 1]) {
			clickSelectors.push(args[i + 1]);
		}
	}

	let resolvedOut = path.resolve(process.cwd(), outputPath);
	if (usedDefaultPath) {
		try {
			resolvedOut = findUnusedFilePath({
				startingPath: resolvedOut,
				fileExists: (candidatePath) => fs.existsSync(candidatePath),
			});
		} catch (err) {
			exitWithUsageError(err.message);
			return;
		}
	}
	fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });

	let chromium;
	try {
		const playwrightTest = await import("@playwright/test");
		chromium = playwrightTest.chromium;
	} catch {
		try {
			const playwright = await import("playwright");
			chromium = playwright.chromium;
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
			await context.addInitScript((activeProjectId) => {
				localStorage.setItem("kainbain:activeProjectId", activeProjectId);
			}, targetProject);
		}
		const page = await context.newPage();
		console.log(`Navigating to ${targetUrl}...`);
		await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
		if (waitMs > 0) {
			await page.waitForTimeout(waitMs);
		}
		for (const clickSelector of clickSelectors) {
			console.log(`Clicking ${clickSelector}...`);
			const locator = page.locator(clickSelector);
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
