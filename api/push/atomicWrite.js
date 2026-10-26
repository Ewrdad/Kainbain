// Domain: Web Push — crash-safe JSON persistence primitive.
/***
 * MARK: atomic push-state writes
 * @description Single home for the tmp-write + rename + 0600 pattern every
 *   push state file needs (VAPID keys, subscriptions, settings). Push
 *   endpoints, auth keys, and VAPID private keys are bearer-capable secrets,
 *   hence mode 0600; the rename makes the publish atomic so a crash or a
 *   concurrent reader never sees a half-written file. Kept push-local (rather
 *   than reusing the house `_atomicWriteFileSync`) because that helper has no
 *   file-mode support and lives in another domain.
 * @example writePushJsonFile(dir, "push-settings.json", { enabled: true })
 ***/
import fs from "node:fs";
import path from "node:path";

/***
 * MARK: writePushJsonFile
 * @description Persists `value` as pretty-printed JSON at `<dir>/<fileName>`.
 * @param {string} dir - Server-owned push state dir (created when missing).
 * @param {string} fileName - Bare file name (no directories).
 * @param {*} value - JSON-serializable value.
 * @returns {string} The absolute target path written.
 ***/
export function writePushJsonFile(dir, fileName, value) {
	if (!dir || typeof dir !== "string") {
		throw new Error("writePushJsonFile requires a dir");
	}
	if (!fileName || typeof fileName !== "string") {
		throw new Error("writePushJsonFile requires a fileName");
	}
	// Resolved comparison (not a slash scan): also rejects ".", "..",
	// nested paths, and trailing-slash evasions.
	const resolvedDir = path.resolve(dir);
	const target = path.resolve(resolvedDir, fileName);
	if (path.dirname(target) !== resolvedDir) {
		throw new Error("writePushJsonFile requires a bare fileName");
	}
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir/fileName are server-owned push state names, not request input */
	fs.mkdirSync(resolvedDir, { recursive: true });
	const tmp = path.join(resolvedDir, `.${path.basename(target)}.tmp-${process.pid}`);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir/fileName are server-owned push state names, not request input */
	fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir/fileName are server-owned push state names, not request input */
		fs.chmodSync(tmp, 0o600);
	} catch {
		// Best-effort: the write mode already requested 0600.
	}
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir/fileName are server-owned push state names, not request input */
	fs.renameSync(tmp, target);
	return target;
}
