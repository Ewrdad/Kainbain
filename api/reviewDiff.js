/**
 * Git diff primitives for PR review.
 * These functions wrap `git diff` and `git log` to provide the data
 * needed for a traditional MR/PR view.
 */

import { git, GitError } from "./git.js";

/**
 * Gets a list of changed files between base and head with addition/deletion counts.
 * Uses `git diff --numstat --find-renames base...head`.
 *
 * @param {string} cwd - Project working directory.
 * @param {string} base - Base ref (e.g. 'main').
 * @param {string} head - Head ref (e.g. 'kb/task-1').
 * @returns {Promise<Array<{path: string, oldPath: string|null, status: string, additions: number, deletions: number, binary: boolean}>>}
 */
export async function diffFiles(cwd, base, head) {
	// Three-dot syntax: diff from the common ancestor of base and head.
	// First, get the status for every changed file to avoid approximation.
	const { stdout: statusStdout } = await git(cwd, [
		"diff",
		"--name-status",
		"--find-renames",
		"--no-color",
		`${base}...${head}`,
	]);

	const statusMap = new Map();
	for (const line of statusStdout.split("\n")) {
		if (!line.trim()) continue;
		// Format: <status> <path> OR <status> <oldPath> <newPath>
		const parts = line.split(/\s+/);
		const statusCode = parts[0];
		// For renames (R), the new path is the last part
		const path = parts.length > 2 ? parts[parts.length - 1] : parts[1];
		const oldPath = parts.length > 2 ? parts[1] : null;

		statusMap.set(path, { statusCode, oldPath });
	}

	// Then get numstat for addition/deletion counts.
	const { stdout: numstatStdout } = await git(cwd, [
		"diff",
		"--numstat",
		"--find-renames",
		"--no-color",
		`${base}...${head}`,
	]);

	const files = [];
	for (const line of numstatStdout.split("\n")) {
		if (!line.trim()) continue;

		const parts = line.split("\t");
		if (parts.length < 3) continue;

		const additions = parseInt(parts[0], 10);
		const deletions = parseInt(parts[1], 10);
		const pathRaw = parts[2];

		let path = pathRaw;
		let oldPath = null;

		if (pathRaw.includes(" => ")) {
			const [oldP, newP] = pathRaw.split(" => ");
			oldPath = oldP;
			path = newP;
		} else if (pathRaw.includes(" -> ")) {
			const [oldP, newP] = pathRaw.split(" -> ");
			oldPath = oldP;
			path = newP;
		} else if (pathRaw.startsWith("{") && pathRaw.includes(" => ")) {
			// Handle brace-partial renames e.g. {old => new}
			const match = pathRaw.match(/\{(.*)\s+=>\s+(.*)\}/);
			if (match) {
				oldPath = match[1];
				path = match[2];
			}
		}

		const isBinary = parts[0] === "-" || parts[1] === "-";

		// Map git status codes to our internal status strings
		const statusData = statusMap.get(path);
		const gitStatus = statusData?.statusCode;
		let status = "modified";
		if (gitStatus && /^[ARDMC]/.test(gitStatus)) {
			if (gitStatus.startsWith("A")) status = "added";
			else if (gitStatus.startsWith("D")) status = "deleted";
			else if (gitStatus.startsWith("R")) status = "renamed";
			else if (gitStatus.startsWith("M")) status = "modified";
		} else if (!gitStatus) {
			if (deletions === 0 && additions > 0) status = "added";
			else if (additions === 0 && deletions > 0) status = "deleted";
		}

		files.push({
			path,
			oldPath: statusData?.oldPath || oldPath,
			status,
			additions: isNaN(additions) ? 0 : additions,
			deletions: isNaN(deletions) ? 0 : deletions,
			binary: isBinary,
		});
	}

	return files;
}

/**
 * Gets the unified diff patch for a specific file.
 *
 * @param {string} cwd - Project working directory.
 * @param {string} base - Base ref.
 * @param {string} head - Head ref.
 * @param {string} path - Path to the file.
 * @returns {Promise<string>} Unified diff text.
 */
export async function diffFilePatch(cwd, base, head, path) {
	// Use --unified=3 for standard context.
	// The -- separator ensures path is treated as a path, not a ref.
	const { stdout } = await git(cwd, [
		"diff",
		"--unified=3",
		"--no-color",
		`${base}...${head}`,
		"--",
		path,
	]);
	return stdout;
}

/**
 * Gets the list of commits between base and head.
 *
 * @param {string} cwd - Project working directory.
 * @param {string} base - Base ref.
 * @param {string} head - Head ref.
 * @returns {Promise<Array<{sha: string, message: string, author: string, date: string}>>}
 */
export async function diffCommitList(cwd, base, head) {
	// Format: sha|author|date|message
	const format = "%H|%an|%ad|%s";
	const { stdout } = await git(cwd, [
		"log",
		"--no-color",
		`--format=${format}`,
		`${base}..${head}`,
	]);

	return stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha, author, date, ...messageParts] = line.split("|");
			return {
				sha,
				author,
				date,
				message: messageParts.join("|"),
			};
		});
}

/**
 * Gets the ahead/behind counts between base and head.
 *
 * @param {string} cwd - Project working directory.
 * @param {string} base - Base ref.
 * @param {string} head - Head ref.
 * @returns {Promise<{behind: number, ahead: number}>}
 */
export async function revCount(cwd, base, head) {
	const { stdout } = await git(cwd, [
		"rev-list",
		"--left-right",
		"--count",
		`${base}...${head}`,
	]);
	const [behind, ahead] = stdout.split("\t").map((n) => parseInt(n, 10));
	return { behind, ahead };
}

/**
 * Resolves a ref to a full SHA.
 *
 * Defined here (rather than re-exported from `./git.js`) so the unit
 * suite can mock the `git` runner in this module: stage attribution
 * reads SHAs through this entry point in merge/review flows.
 *
 * @param {string} cwd - Project working directory.
 * @param {string} ref - The ref to resolve (e.g. 'main').
 * @returns {Promise<string>} Full SHA.
 */
export async function resolveSha(cwd, ref) {
	const { stdout } = await git(cwd, ["rev-parse", ref]);
	return stdout.trim();
}
