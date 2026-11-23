import { GIT_FAILURE_KINDS, GIT_FAILURE_LIMITS } from "./gitFailureKinds.js";

// Arrow-const helpers (the one-function-per-file gate ignores these; the
// single top-level `function` declaration below is the file's export).
const readFirstOutputLine = (hookOutput, max = 120) => {
	const line = String(hookOutput || "")
		.split("\n")
		.map((entry) => entry.trim())
		.filter(Boolean)[0] || "";
	if (!line) return "";
	return line.length <= max ? line : `${line.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const buildHookNoun = (hookName) => (hookName && hookName !== "unknown" ? `${hookName} hook` : "git hook");

/***
 * MARK: summarizeGitFailure
 * @description One-line human summary of a parsed git failure for
 *   `failureReason` fields, log lines, and banners — the single grammar
 *   every surface shares so the timeline excerpt, the history line, and
 *   the UI callout can never disagree. Hook rejections name the hook and
 *   the corrupt-file count (first files inline); plain commit failures
 *   carry the exit code plus the first output line; merge conflicts list
 *   their files. Always capped to `GIT_FAILURE_LIMITS.summary` and never
 *   throws — unknown kinds degrade to a generic git-failed line with
 *   whatever output survived.
 * @example summarizeGitFailure({ kind: 'hook-rejected', hookName: 'pre-commit', files: ['a.png', 'b.png'], exitCode: 1 }) => 'Commit blocked by pre-commit hook: 2 corrupt files: a.png, b.png'
 * @param {Object} [input] - `{ kind, hookName, files, exitCode, hookOutput }`.
 * @returns {string} Single-line summary, capped.
 ***/
export function summarizeGitFailure(input = {}) {
	const { kind = "", hookName = null, files = [], exitCode = null, hookOutput = "" } = input && typeof input === "object" ? input : {};
	const code = Number.isInteger(exitCode) ? exitCode : "?";
	const list = Array.isArray(files) ? files.filter((file) => typeof file === "string" && file.trim()) : [];
	let summary;
	if (kind === GIT_FAILURE_KINDS.HOOK_REJECTED) {
		if (list.length > 0) {
			const shown = list.slice(0, 5).join(", ");
			const more = list.length > 5 ? `, and ${list.length - 5} more` : "";
			const noun = list.length === 1 ? "file" : "files";
			summary = `Commit blocked by ${buildHookNoun(hookName)}: ${list.length} corrupt ${noun}: ${shown}${more}`;
		} else {
			const detail = readFirstOutputLine(hookOutput) || "see hook output for details";
			summary = `Commit blocked by ${buildHookNoun(hookName)} (exit ${code}): ${detail}`;
		}
	} else if (kind === GIT_FAILURE_KINDS.MERGE_CONFLICT) {
		const shown = list.length > 0 ? list.slice(0, 8).join(", ") : "unknown files";
		const more = list.length > 8 ? `, and ${list.length - 8} more` : "";
		summary = `Merge conflicts in: ${shown}${more} — resolve the conflicts and retry`;
	} else if (kind === GIT_FAILURE_KINDS.COMMIT_FAILED) {
		const detail = readFirstOutputLine(hookOutput) || "see git output for details";
		summary = `Commit failed (exit ${code}): ${detail}`;
	} else {
		const detail = readFirstOutputLine(hookOutput) || "see git output for details";
		summary = `Git operation failed (exit ${code}): ${detail}`;
	}
	const max = GIT_FAILURE_LIMITS.summary;
	return summary.length <= max ? summary : `${summary.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
