import path from "node:path";
import { getLiveAccessibilityFeedbackFile } from "./getLiveAccessibilityFeedbackFile.js";

/***
 * MARK: isLiveAccessibilityFeedbackPath
 * @description Whether a path IS the live accessibility-feedback inbox
 *   (`~/.kainbain/accessibility-feedback.jsonl`). Exact-file comparison
 *   (not a dir-prefix like `isLiveEnginePath`): the inbox lives directly
 *   under `~/.kainbain/`, outside `~/.kainbain/engine/`, so the engine
 *   guard is a no-op for it (residual D9 of 99ccc12f, task b3dec9b0).
 *
 *   The comparison normalizes with `path.resolve` and trims surrounding
 *   whitespace, so a padded path cannot slip past the guard (a trailing
 *   slash also still matches — `path.resolve` strips it — so that
 *   spelling fails closed toward throwing). On Windows the comparison
 *   is case-insensitive (the filesystem is). It deliberately does NOT
 *   resolve symlinks (no `realpath`), mirroring the `isLiveEnginePath`
 *   contract: callers pass already-absolute literal-built paths, so a
 *   text comparison on the normalized path is exact. Non-string and
 *   blank inputs return false (they carry no path to guard).
 * @example isLiveAccessibilityFeedbackPath('/home/u/.kainbain/accessibility-feedback.jsonl') => true
 * @example isLiveAccessibilityFeedbackPath('/tmp/kainbain-test-a11y-XXXX/accessibility-feedback.jsonl') => false
 * @param {string} candidatePath - Path to test.
 * @returns {boolean} True when the path is the live inbox file.
 ***/
export function isLiveAccessibilityFeedbackPath(candidatePath) {
	if (typeof candidatePath !== "string" || !candidatePath.trim()) return false;
	const live = getLiveAccessibilityFeedbackFile();
	let resolved = path.resolve(candidatePath.trim());
	let wanted = live;
	if (process.platform === "win32") {
		resolved = resolved.toLowerCase();
		wanted = live.toLowerCase();
	}
	return resolved === wanted;
}
