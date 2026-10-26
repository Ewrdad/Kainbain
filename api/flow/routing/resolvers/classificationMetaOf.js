import { classifyStageError } from "../../../work/index.js";

/***
 * MARK: classificationMetaOf
 * @description Classifies one failure and returns the stored/audited shape:
 *   `{ kind, signal, retryable }`. Every failure handler (stage failback,
 *   transient retry) shapes the meta through this single helper so the
 *   timeline entry, lastError, and event payloads can never disagree on
 *   what the classification was. classifyStageError never throws, so this
 *   never throws either.
 * @example classificationMetaOf("fetch failed") => { kind: "transient", … }
 * @param {string|Error|Object} error - The failure to classify.
 * @returns {{ classification: Object, classificationMeta: { kind: string, signal: string, retryable: boolean } }}
 ***/
export function classificationMetaOf(error) {
	const classification = classifyStageError(error);
	return {
		classification,
		classificationMeta: {
			kind: classification.kind,
			signal: classification.signal,
			retryable: classification.retryable,
		},
	};
}
