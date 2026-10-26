/***
 * MARK: gitDiagnosticsOf
 * @description Extracts the structured git diagnostic payload (merge-conflict
 *   SHAs + file list, ghost-task analysis) from a stage error when present.
 *   Stored on `task.lastError.gitDiagnostics` by handleStageFailure so the
 *   Tier 3 failback prompt (which renders failureReason + lastError) can
 *   act on it autonomously. Returns undefined when the error carries none.
 * @example gitDiagnosticsOf(conflictError) => { kind: 'merge-conflict', … }
 * @param {*} error - Stage failure value.
 * @returns {Object|undefined} Structured git diagnostics or undefined.
 ***/
export function gitDiagnosticsOf(error) {
	const diagnostics =
		error && typeof error === "object" ? error.gitDiagnostics : null;
	if (diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)) {
		return diagnostics;
	}
	return undefined;
}
