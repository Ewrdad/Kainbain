import fs from "node:fs";
import { _atomicWriteFileSync } from "../house/index.js";

/***
 * MARK: saveStateFile
 * @description Persists one durable state object atomically (best-effort).
 * @example saveStateFile('/tmp/s.json', { v: 1 }) => true
 * @param {string} file - Resolved path.
 * @param {*} data - JSON-serializable state.
 * @param {Function} [onError] - Called with the write error.
 * @returns {boolean} Whether the write landed.
 ***/
export function saveStateFile(file, data, onError) {
	try {
		_atomicWriteFileSync(file, JSON.stringify(data, null, 2));
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the operator-configured state file, not user-supplied */
			fs.chmodSync(file, 0o600);
		} catch {
			// Best-effort hardening: the data already landed.
		}
		return true;
	} catch (err) {
		try {
			onError?.(err);
		} catch {
			// Reporting must never break the save.
		}
		return false;
	}
}
