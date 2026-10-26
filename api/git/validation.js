import { GitError } from "./errors.js";

/***
 * MARK: isValidBranchName
 * @description Validates a git branch name with a conservative allow-list:
 *   letters, digits, `_`, `-`, `.`, `/`. Rejects names that start with `-`,
 *   `/`, or `.` (git flag injection / hidden refs), contain `..`, `//`, `@{`,
 *   whitespace, a `~`, `^`, `:`, `?`, `*`, `[` or `\`, or end with `.`, `.lock`
 *   or `/`. This is defense-in-depth: even though every argument is passed via
 *   an argv array, a branch named e.g. `--force` would still be consumed as a
 *   git flag.
 * @example isValidBranchName('kb/123e4567-e89b-12d3') => true
 * @example isValidBranchName('--force') => false
 * @param {string} branch
 * @returns {boolean}
 ***/
export function isValidBranchName(branch) {
	if (typeof branch !== "string") return false;
	if (branch.length === 0 || branch.length > 255) return false;
	if (!/^[A-Za-z0-9_\-./]+$/.test(branch)) return false;
	if (
		branch.startsWith("-") ||
		branch.startsWith("/") ||
		branch.startsWith(".")
	) {
		return false;
	}
	if (branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
		return false;
	}
	if (branch.includes("..") || branch.includes("//") || branch.includes("@{")) {
		return false;
	}
	return true;
}


/***
 * MARK: _assertValidBranchName
 * @description Throws a GitError when a branch name fails validation.
 * @private
 * @param {string} branch
 * @param {string} caller
 * @returns {void}
 ***/
export function _assertValidBranchName(branch, caller) {
	if (!isValidBranchName(branch)) {
		throw new GitError(
			`git ${caller}: invalid branch name ${String(branch)} (allowed: letters, digits, '_', '-', '.', '/'; must not start with '-', '/', '.')`,
		);
	}
}


/***
 * MARK: redactCredentials
 * @description Strips embedded credentials (`userinfo@`) from a git remote URL
 *   so tokens never leak into API responses, project.json, prompts, or logs
 *   (audit K-1). Only `scheme://` URLs are rewritten; scp-style remotes
 *   (`git@host:path`, no scheme) and non-URLs pass through unchanged. Git
 *   operations themselves keep reading the live remote from `.git/config`.
 * @example redactCredentials('https://abc123@git.example.com/u/r.git') => 'https://git.example.com/u/r.git'
 * @example redactCredentials('https://git.example.com/u/r.git') => 'https://git.example.com/u/r.git'
 * @param {string} url - Remote URL (or any value, passed through when not a string).
 * @returns {string} The URL without a userinfo section.
 ***/
export function redactCredentials(url) {
	if (typeof url !== "string" || !url) return url;
	const match = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/]*)([\s\S]*)$/);
	if (!match) return url;
	const [, scheme, authority, rest] = match;
	const at = authority.lastIndexOf("@");
	if (at === -1) return url;
	return `${scheme}${authority.slice(at + 1)}${rest}`;
}


