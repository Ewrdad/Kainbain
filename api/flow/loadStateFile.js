import fs from "node:fs";

/***
 * MARK: loadStateFile
 * @description Reads + normalizes one durable state file (fail-open).
 * @example loadStateFile('/tmp/s.json', (raw) => raw ?? {}) => {}
 * @param {string} file - Resolved path.
 * @param {Function} normalize - `(raw) => state` (never throws out).
 * @param {Function} [onError] - Called with the read/parse error.
 * @returns {*} Normalized state (fresh when the file is missing/rotted).
 ***/
export function loadStateFile(file, normalize, onError) {
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the operator-configured state file, not user-supplied */
		if (fs.existsSync(file)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the operator-configured state file, not user-supplied */
			const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
			return normalize(parsed);
		}
	} catch (err) {
		try {
			onError?.(err);
		} catch {
			// Reporting must never break the load.
		}
	}
	return normalize(null);
}

