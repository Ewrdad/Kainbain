/***
 * MARK: collectResumeEvidence
 * @description Gathers the auto-resume evidence bundle for a task: which
 *   generic rehydration markers were present, the relevant SHAs, and the
 *   resume verdict. Deploy-specific evidence (attempt ids, last-result age)
 *   is continuity-owned and recorded by the implementation plugin, not here.
 *   Total: every read is guarded so evidence gathering never throws.
 * @param {Object} store
 * @param {Object} task
 * @param {string} [verdict] - Resume verdict reason (defaults to "auto-resumed").
 * @returns {{ markers: Array<string>, shas: Object, verdict: string }}
  * @example collectResumeEvidence(store, task) => { markers, shas, verdict: "auto-resumed" }
 ***/
export function collectResumeEvidence(store, task, verdict = "auto-resumed") {
	void store;
	const markers = [];
	const shas = {};
	try {
		if (typeof task?.preMergeMainSha === "string" && task.preMergeMainSha.trim()) {
			markers.push("preMergeMainSha");
			shas.preMergeMainSha = task.preMergeMainSha;
		}
		const baseline = task?.reviewBaseline;
		if (
			baseline &&
			typeof baseline === "object" &&
			!Array.isArray(baseline) &&
			typeof baseline.mergedAt === "string" &&
			baseline.mergedAt.trim()
		) {
			markers.push("reviewBaseline.mergedAt");
			if (typeof baseline.headSha === "string" && baseline.headSha.trim()) {
				shas.headSha = baseline.headSha;
			}
			if (typeof baseline.baseSha === "string" && baseline.baseSha.trim()) {
				shas.baseSha = baseline.baseSha;
			}
		}
		if (typeof task?.mergeAttemptId === "string" && task.mergeAttemptId.trim()) {
			markers.push("mergeAttemptId");
		}
	} catch {
		// Marker reads are best-effort.
	}
	return { markers, shas, verdict };
}
