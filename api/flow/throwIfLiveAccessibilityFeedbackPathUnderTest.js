import { isLiveAccessibilityFeedbackPath } from "./isLiveAccessibilityFeedbackPath.js";

/***
 * MARK: throwIfLiveAccessibilityFeedbackPathUnderTest
 * @description Test-pollution guard for the accessibility-feedback inbox
 *   (residual D9 of 99ccc12f, task b3dec9b0): while `VITEST` is set,
 *   resolving the LIVE `~/.kainbain/accessibility-feedback.jsonl` inbox
 *   THROWS, so a suite that forgets its `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE`
 *   temp override fails loudly in CI instead of silently appending test
 *   reports to the real user inbox (survey q1: throw, not silent redirect).
 *   A no-op when `VITEST` is unset (production resolves byte-identically)
 *   or when the path is a temp/explicit inbox — including non-string
 *   values, which carry no path to guard. Gate matches the engine guard
 *   (`VITEST` only) so both guards sleep and fire together.
 * @example throwIfLiveAccessibilityFeedbackPathUnderTest({ candidatePath: '/tmp/x.json', callerName: 'resolveFeedbackFile' }) => undefined
 * @param {Object} args - Labelled inputs.
 * @param {*} args.candidatePath - Resolved path to guard (anything; only the live inbox string throws).
 * @param {string} [args.callerName] - Resolver name stamped into the error so the fix location is obvious.
 * @returns {void}
 ***/
export function throwIfLiveAccessibilityFeedbackPathUnderTest({
	candidatePath,
	callerName,
} = {}) {
	if (!process.env.VITEST) return;
	if (!isLiveAccessibilityFeedbackPath(candidatePath)) return;
	const caller =
		typeof callerName === "string" && callerName.trim()
			? callerName.trim()
			: "accessibility-feedback guard";
	throw new Error(
		`${caller} refused live accessibility-feedback path under test: ${candidatePath} ` +
			`(VITEST is set). Pin the inbox at a temp path via its ` +
			`KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE env var (see api/testSetup.isolation.js) ` +
			`instead of reading or writing ~/.kainbain/accessibility-feedback.jsonl from tests.`,
	);
}
