import os from "node:os";
import path from "node:path";

/***
 * MARK: isLiveEnginePath
 * @description Whether a path points at the LIVE engine state dir itself
 *   (`~/.kainbain/engine/`) or inside it. The one shared definition every
 *   test guard uses, so the boundary can never drift between stores.
 *
 *   The comparison normalizes with `path.resolve` and requires either an
 *   exact match (the dir itself — a state dir pointed AT the engine dir
 *   would write live files directly) or a trailing separator, so a
 *   similarly-prefixed dir (e.g. `engine2/`) never false-positives.
 *   Surrounding whitespace is trimmed before comparing, so a padded path
 *   cannot slip past the guard. On Windows the comparison is
 *   case-insensitive (the filesystem is). It deliberately does NOT
 *   resolve symlinks (no `realpath`): temp dirs on some platforms are
 *   symlinks, and every caller here passes already-absolute literal-built
 *   paths, so a text comparison on the normalized path is exact. A
 *   symlink pointing INTO the live dir would need write access to
 *   `~/.kainbain` first, at which point the attacker already owns the
 *   state files directly.
 * @example isLiveEnginePath('/home/u/.kainbain/engine/r.json') => true
 * @example isLiveEnginePath('/tmp/kainbain-test-state-x/r.json') => false
 * @param {string} candidatePath - Path to test.
 * @returns {boolean} True when the path is the live engine dir or sits under it.
 ***/
export function isLiveEnginePath(candidatePath) {
	if (typeof candidatePath !== "string" || !candidatePath.trim()) return false;
	const engineDir = path.resolve(os.homedir(), ".kainbain", "engine");
	const enginePrefix = engineDir + path.sep;
	let resolved = path.resolve(candidatePath.trim());
	let wantedDir = engineDir;
	let wantedPrefix = enginePrefix;
	if (process.platform === "win32") {
		resolved = resolved.toLowerCase();
		wantedDir = engineDir.toLowerCase();
		wantedPrefix = enginePrefix.toLowerCase();
	}
	return resolved === wantedDir || resolved.startsWith(wantedPrefix);
}
