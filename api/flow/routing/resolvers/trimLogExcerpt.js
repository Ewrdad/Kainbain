import { failureLogExcerptLimit } from "../tables/failureLogExcerptLimit.js";

/***
 * MARK: trimLogExcerpt
 * @description Keeps the tail of a log so the most recent lines survive on
 * the failed timeline entry. Short logs pass through unchanged.
 * Deprecated: prefer `excerptLog`, which keeps the error head (stack-trace
 * root) as well as the diagnostic tail. This alias keeps its pure
 * tail-trimming behaviour so existing callers pass unchanged.
 * @example trimLogExcerpt("a\nb", 10) => "a\nb"
 * @param {string} [text] - Raw log output, may be empty.
 * @param {number} [max] - Maximum characters to keep from the end.
 * @returns {string} Trimmed log excerpt, or an empty string when blank.
 ***/
export function trimLogExcerpt(text, max = failureLogExcerptLimit) {
	if (typeof text !== "string") return "";
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	return trimmed.slice(-max);
}
