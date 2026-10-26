/***
 * MARK: parkedAlertStructuredFields
 * @description Builds the optional structured fields for a parked-failure
 *   alert from the failing error and task: the WP5 conflicted-file list
 *   (merge conflicts) and the WP5 review-baseline SHAs when known. Every
 *   field is omitted when absent, so the envelope stays sparse and valid.
 *   Never throws: a malformed carrier costs a field, never the alert.
 * @example parkedAlertStructuredFields(task, new GitMergeConflictError('x', { conflictedFiles: ['a'] })) => { conflictedFiles: ['a'] }
 * @param {Object} [task]
 * @param {*} [error]
 * @returns {{ conflictedFiles?: string[], shas?: Object }}
 ***/
export function parkedAlertStructuredFields(task, error) {
	const fields = {};
	try {
		const conflicts = error?.conflictedFiles;
		if (Array.isArray(conflicts)) {
			const clean = conflicts
				.filter((entry) => typeof entry === "string" && entry)
				.slice(0, 100);
			if (clean.length > 0) fields.conflictedFiles = clean;
		}
	} catch {
		// Unreadable error carrier: omit the field, never break the alert.
	}
	try {
		const baseline = task?.reviewBaseline;
		if (baseline && typeof baseline === "object") {
			const shas = {};
			if (typeof baseline.baseSha === "string" && baseline.baseSha) {
				shas.baseSha = baseline.baseSha;
			}
			if (typeof baseline.headSha === "string" && baseline.headSha) {
				shas.headSha = baseline.headSha;
			}
			if (typeof baseline.mainSha === "string" && baseline.mainSha) {
				shas.mainSha = baseline.mainSha;
			}
			if (Object.keys(shas).length > 0) fields.shas = shas;
		}
	} catch {
		// Same: a malformed baseline must not lose the alert.
	}
	return fields;
}
