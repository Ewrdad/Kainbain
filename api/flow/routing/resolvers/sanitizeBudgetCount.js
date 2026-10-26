/***
 * MARK: sanitizeBudgetCount
 * @description Sanitizes a budget count: ensures non-negative integer or undefined.
 * @example sanitizeBudgetCount(3.5) => 3
 * @example sanitizeBudgetCount(-1) => 0
 * @example sanitizeBudgetCount("invalid") => undefined
 * @param {*} value
 * @returns {number|undefined}
 ***/
export function sanitizeBudgetCount(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.max(0, Math.floor(value));
}
