/***
 * MARK: withCompactionHint
 * @description Attaches the prompt/history compaction guidance to a
 *   context-overflow failure so the failed-back attempt's prompt tells the
 *   next run to compact instead of retrying the identical overflowing
 *   context. String errors become Errors; Error carriers keep their
 *   stdout/stderr/code properties.
 * @example withCompactionHint(new Error("context overflow")) => Error with "[Compaction Hint]"
 * @param {Error|string|Object} error
 * @returns {Error} Error carrying the compaction hint in its message.
 ***/
export function withCompactionHint(error) {
	const hint =
		"[Compaction Hint] The model context window was exceeded. The next attempt must compact the prompt/history (summarize reports, trim history, shorten context) instead of retrying the identical overflowing context.";
	const carryFields = (source, target) => {
		for (const key of [
			"stderr",
			"stdout",
			"code",
			"name",
			"failureKind",
			"failureReason",
		]) {
			try {
				/* eslint-disable-next-line security/detect-object-injection -- key comes from the fixed carrier list above */
				if (source?.[key] !== undefined) target[key] = source[key];
			} catch {
				// An unreadable carrier field is dropped, never fatal.
			}
		}
		return target;
	};
	if (typeof error === "string") {
		return new Error(error ? `${error}\n\n${hint}` : hint);
	}
	if (error instanceof Error) {
		const hinted = new Error(
			error.message ? `${error.message}\n\n${hint}` : hint,
		);
		return carryFields(error, hinted);
	}
	if (error && typeof error === "object") {
		const text =
			error.failureReason || error.message || "Stage failed";
		return carryFields(error, new Error(`${text}\n\n${hint}`));
	}
	const fallback = error || "Stage failed";
	return new Error(
		typeof fallback === "string" && fallback
			? `${fallback}\n\n${hint}`
			: `${String(fallback)}\n\n${hint}`,
	);
}
