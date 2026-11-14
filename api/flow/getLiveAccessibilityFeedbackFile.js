import os from "node:os";
import path from "node:path";

/***
 * MARK: getLiveAccessibilityFeedbackFile
 * @description The one canonical live accessibility-feedback inbox path
 *   (`~/.kainbain/accessibility-feedback.jsonl`). Single definition so the
 *   predicate, the guard, and the route resolver (`resolveFeedbackFile`,
 *   which calls this instead of rebuilding the path) can never drift
 *   apart. `path.resolve` on the already-absolute join is the identity,
 *   so this string is byte-identical to the historic fallback.
 * @example getLiveAccessibilityFeedbackFile() => os.homedir() + '/.kainbain/accessibility-feedback.jsonl'
 * @returns {string} Absolute live inbox path.
 ***/
export function getLiveAccessibilityFeedbackFile() {
	return path.resolve(
		path.join(os.homedir(), ".kainbain", "accessibility-feedback.jsonl"),
	);
}
