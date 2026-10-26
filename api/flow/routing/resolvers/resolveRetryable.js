import { classifyStageError } from "../../../work/index.js";
import { collectRetryableText } from "./collectRetryableText.js";
import { harnessBlipSignalFor } from "./harnessBlipSignalFor.js";

/***
 * MARK: resolveRetryable
 * @description WP3 retryable-class decision (Tier-2 entry gate). Deny-list
 *   first: operator aborts, auth failures, quota exhaustion, and
 *   context-overflow never retry (checked via the WP2 classification so a
 *   blip string containing e.g. "quota" can never slip through). Then the
 *   allow-list: WP2 `transient` infrastructure errors plus the narrow WP3
 *   harness-blip table (malformed harness JSON, ephemeral tool-execution
 *   errors, harness crashes). Everything else is non-retryable.
 * @example resolveRetryable(new Error("socket hang up")) => { retryable: true, … }
 * @example resolveRetryable(new Error("401 unauthorized")) => { retryable: false, … }
 * @param {string|Error|Object} error - The failure to judge.
 * @returns {{ retryable: boolean, kind: string, signal: string }}
 ***/
export function resolveRetryable(error) {
	let classification;
	try {
		classification = classifyStageError(error);
	} catch {
		return { retryable: false, kind: "logical", signal: "unknown" };
	}
	// Deny-list first: permanent halts and scheduled interventions never
	// consume Tier-2 budget, whatever the blip table says.
	if (classification.kind === "operator-abort") {
		return { retryable: false, kind: classification.kind, signal: classification.signal };
	}
	if (classification.kind === "unrecoverable") {
		return { retryable: false, kind: classification.kind, signal: classification.signal };
	}
	if (classification.kind === "transient") {
		return { retryable: true, kind: classification.kind, signal: classification.signal };
	}
	const blipSignal = harnessBlipSignalFor(collectRetryableText(error));
	if (blipSignal) {
		return { retryable: true, kind: "transient", signal: blipSignal };
	}
	return { retryable: false, kind: classification.kind, signal: classification.signal };
}
