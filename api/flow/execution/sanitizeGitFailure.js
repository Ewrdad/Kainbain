import { buildGitFailureDetails } from "../../../shared/gitFailure.js";
import { redactSecretsText } from "../../../shared/redactSecrets.js";

/***
 * MARK: sanitizeGitFailure
 * @description Boundary sanitizer for the runner-reported structured
 *   commit/hook failure (`gitFailure` on `complete-execution`): loosely
 *   validates the wire shape (unknown fields tolerated), redacts every
 *   string field, and rebuilds the envelope through the shared
 *   `buildGitFailureDetails` so transport caps apply identically at every
 *   layer. Returns null for absent or malformed payloads (non-objects, or
 *   objects without a `kind`) so the caller drops them with a warning and
 *   the stage failure they describe still records — a reporting failure
 *   must never mask the failure it describes, and never 400s. Idempotent:
 *   re-sanitizing an already-clean envelope returns an equal envelope.
 * @example sanitizeGitFailure({ kind: 'hook-rejected', hookName: 'pre-commit', hookOutput: 'binary-guard check FAILED', files: ['a.png'] }).kind => 'hook-rejected'
 * @example sanitizeGitFailure('garbage') => null
 * @param {*} raw - Wire value of `gitFailure` (any JSON value).
 * @returns {Object|null} Redacted, capped `GitFailureDetails`, or null when absent/malformed.
 ***/
export function sanitizeGitFailure(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const kind = typeof raw.kind === "string" ? raw.kind.trim() : "";
	if (!kind) return null;
	const text = (value) => (typeof value === "string" ? redactSecretsText(value) : "");
	const files = Array.isArray(raw.files)
		? raw.files.filter((file) => typeof file === "string").map((file) => redactSecretsText(file))
		: [];
	const summary = typeof raw.summary === "string" && raw.summary.trim() ? redactSecretsText(raw.summary) : null;
	return buildGitFailureDetails({
		kind,
		phase: typeof raw.phase === "string" ? raw.phase : null,
		command: text(raw.command),
		exitCode: Number.isInteger(raw.exitCode) ? raw.exitCode : null,
		hookName: text(raw.hookName),
		files,
		hookOutput: text(raw.hookOutput),
		remedy: text(raw.remedy),
		summary,
	});
}
