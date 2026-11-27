/***
 * MARK: formatSessionErrorReason
 * @description Renders a latched harness `run_error` as the failure reason
 *   the shared verdict reports: `[Harness Run Error] <message> [<code>]
 *   <hint>`, with the stable harness code and the fix hint appended when
 *   the latch carries them — so a log line alone names the cause plus the
 *   fix. Accepts the `{ error, code, hint }` latch shape (as delivered on
 *   the `run_error` event) or a bare error string; anything else falls
 *   back to a generic run-failure reason rather than printing blank.
 * @example formatSessionErrorReason({ error: "agy run timed out", code: "AGY_RUN_TIMEOUT", hint: "Raise it." }) => "[Harness Run Error] agy run timed out [AGY_RUN_TIMEOUT] Raise it."
 * @example formatSessionErrorReason("boom") => "[Harness Run Error] boom"
 * @param {Object|string} sessionError - The latched session error.
 * @returns {string} The `[Harness Run Error] …` reason.
 ***/
export function formatSessionErrorReason(sessionError) {
	if (typeof sessionError === "string") {
		const text = sessionError.trim();
		return text ? `[Harness Run Error] ${text}` : "[Harness Run Error] harness run failed";
	}
	const message =
		typeof sessionError?.error === "string" && sessionError.error.trim()
			? sessionError.error.trim()
			: typeof sessionError?.message === "string" && sessionError.message.trim()
				? sessionError.message.trim()
				: "harness run failed";
	const codeText =
		typeof sessionError?.code === "string" ? sessionError.code.trim() : "";
	// Harness error strings already carry their stable code and fix hint
	// (`formatAgyRunError` renders `… [AGY_*] <hint>`): never print either twice.
	const code = codeText && !message.includes(`[${codeText}]`) ? ` [${codeText}]` : "";
	const hintText =
		typeof sessionError?.hint === "string" ? sessionError.hint.trim() : "";
	const hint = hintText && !message.includes(hintText) ? ` ${hintText}` : "";
	return `[Harness Run Error] ${message}${code}${hint}`;
}
