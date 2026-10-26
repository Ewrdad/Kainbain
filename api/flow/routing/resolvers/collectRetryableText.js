/***
 * MARK: collectRetryableText
 * @description Extracts and concatenates text fields from an error object for regex matching.
 * @example collectRetryableText(new Error("msg")) => "msg"
 * @param {*} error
 * @returns {string}
 ***/
export function collectRetryableText(error) {
	try {
		if (typeof error === "string") return error;
		if (error && typeof error === "object") {
			const parts = [];
			for (const key of ["message", "stderr", "stdout", "failureReason", "reason", "output"]) {
				/* eslint-disable-next-line security/detect-object-injection -- key comes from a fixed literal list above, never from input */
				const value = error[key];
				if (typeof value === "string" && value) parts.push(value);
			}
			return parts.join("\n");
		}
		if (error !== undefined && error !== null) return String(error);
	} catch {
		// Fail safe below.
	}
	return "";
}
