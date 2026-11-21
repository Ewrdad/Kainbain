import { GIT_FAILURE_KINDS, GIT_FAILURE_LIMITS, GIT_FAILURE_PHASES } from "./gitFailureKinds.js";
import { summarizeGitFailure } from "./summarizeGitFailure.js";

// Arrow-const helper (the one-function-per-file gate ignores these; the
// single top-level `function` declaration below is the file's export).
const capText = (value, max) => {
	const text = typeof value === "string" ? value : String(value ?? "");
	if (text.length <= max) return { text, cut: 0 };
	return { text: `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`, cut: text.length - max + 1 };
};

/***
 * MARK: buildGitFailureDetails
 * @description Builds the transport-safe `GitFailureDetails` envelope every
 *   layer shares: `{ kind, phase, command, exitCode, hookName, files,
 *   hookOutput, remedy, summary, truncatedFiles, truncatedOutput }`.
 *   Applies `GIT_FAILURE_LIMITS` (hook output ≤ 8k chars, files ≤ 50, and
 *   the smaller command/remedy/summary caps) with explicit truncation
 *   markers so a capped payload never reads as complete, and derives the
 *   one-line `summary` via `summarizeGitFailure` unless the caller passes
 *   one (the merge path passes its own branch-worded detail). Unknown
 *   phases degrade to null (rendered as absent, never guessed); unknown
 *   kinds are kept verbatim for forward compatibility
 *   (`isDeterministicGitFailure` treats them as non-deterministic). The
 *   file list is de-duplicated (first occurrence wins) so a noisy wire
 *   payload can neither inflate the count nor duplicate UI list keys.
 *   Never throws — malformed inputs degrade to a `commit-failed` envelope
 *   with whatever survived.
 * @example buildGitFailureDetails({ phase: 'stage-commit', command: 'git commit -m x', exitCode: 1, kind: 'hook-rejected', hookName: 'pre-commit', files: ['a.png'], hookOutput: 'binary-guard check FAILED', remedy: 're-capture a.png' }).summary => 'Commit blocked by pre-commit hook: 1 corrupt file: a.png'
 * @param {Object} [input] - Parsed failure plus `phase`, `command`, `exitCode`, optional `summary` override.
 * @returns {Object} Capped `GitFailureDetails` envelope.
 ***/
export function buildGitFailureDetails(input = {}) {
	const {
		phase = null,
		command = "",
		exitCode = null,
		kind = GIT_FAILURE_KINDS.COMMIT_FAILED,
		hookName = null,
		files = [],
		hookOutput = "",
		remedy = "",
		summary = null,
	} = input && typeof input === "object" ? input : {};
	const knownPhases = Object.values(GIT_FAILURE_PHASES);
	const cleanFiles = [
		...new Set(
			(Array.isArray(files) ? files : [])
				.filter((file) => typeof file === "string" && file.trim())
				.map((file) => file.trim()),
		),
	];
	const truncatedFiles = cleanFiles.length > GIT_FAILURE_LIMITS.files;
	const rawOutput = typeof hookOutput === "string" ? hookOutput : String(hookOutput ?? "");
	let cappedOutput = rawOutput;
	let truncatedOutput = false;
	if (rawOutput.length > GIT_FAILURE_LIMITS.hookOutput) {
		const kept = rawOutput.slice(0, GIT_FAILURE_LIMITS.hookOutput).trimEnd();
		cappedOutput = `${kept}\n…[truncated ${rawOutput.length - GIT_FAILURE_LIMITS.hookOutput} of ${rawOutput.length} chars]`;
		truncatedOutput = true;
	}
	const details = {
		kind: typeof kind === "string" && kind.trim() ? kind.trim() : GIT_FAILURE_KINDS.COMMIT_FAILED,
		phase: typeof phase === "string" && knownPhases.includes(phase) ? phase : null,
		command: capText(typeof command === "string" ? command.trim() : "", GIT_FAILURE_LIMITS.command).text,
		exitCode: Number.isInteger(exitCode) ? exitCode : null,
		hookName: typeof hookName === "string" && hookName.trim() ? hookName.trim() : null,
		files: cleanFiles.slice(0, GIT_FAILURE_LIMITS.files),
		hookOutput: cappedOutput,
		remedy: capText(typeof remedy === "string" ? remedy.trim() : "", GIT_FAILURE_LIMITS.remedy).text,
		summary: "",
		truncatedFiles,
		truncatedOutput,
	};
	const override = typeof summary === "string" ? summary.trim() : "";
	details.summary = capText(
		override || summarizeGitFailure({ kind: details.kind, hookName: details.hookName, files: details.files, exitCode: details.exitCode, hookOutput: details.hookOutput }),
		GIT_FAILURE_LIMITS.summary,
	).text;
	return details;
}
