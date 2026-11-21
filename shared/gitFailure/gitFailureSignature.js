/***
 * MARK: gitFailureSignature
 * @description Stable comparison key for one git failure: kind, hook name,
 *   phase, and the leading file list, capped so over-long paths cannot
 *   bloat the stored streak. The backend compares consecutive failures by
 *   this signature — the same signature on the same task+stage counts
 *   toward parking, a changed signature restarts the streak.
 * @example gitFailureSignature({ kind: 'hook-rejected', hookName: 'pre-commit', phase: 'recovery', files: ['a.png'] }) => 'hook-rejected|pre-commit|recovery|a.png'
 * @param {Object} [details] - `GitFailureDetails` (or any object with the same fields).
 * @returns {string} Signature string ("" when nothing usable was given).
 ***/
export function gitFailureSignature(details = {}) {
	if (!details || typeof details !== "object") return "";
	const kind = typeof details.kind === "string" ? details.kind.trim() : "";
	const hookName = typeof details.hookName === "string" ? details.hookName.trim() : "";
	const phase = typeof details.phase === "string" ? details.phase.trim() : "";
	const files = Array.isArray(details.files)
		? details.files.filter((file) => typeof file === "string" && file.trim()).slice(0, 25).join(",")
		: "";
	return `${kind}|${hookName}|${phase}|${files}`.slice(0, 500);
}
