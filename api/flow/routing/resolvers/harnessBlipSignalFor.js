import { harnessRetryableBlips } from "../tables/harnessRetryableBlips.js";

/***
 * MARK: harnessBlipSignalFor
 * @description Returns the harness-blip signal for an error string, or null
 *   when the text is not on the WP3 retryable-blip allowlist.
 * @example harnessBlipSignalFor("harness output was malformed JSON") => "harness-json-blip"
 * @param {string} str - Combined error text.
 * @returns {string|null}
 ***/
export function harnessBlipSignalFor(str) {
	if (!str || typeof str !== "string") return null;
	for (const { re, signal } of harnessRetryableBlips) {
		try {
			if (re.test(str)) return signal;
		} catch {
			// A poisoned pattern must never break routing.
		}
	}
	return null;
}
