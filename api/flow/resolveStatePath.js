import os from "node:os";
import path from "node:path";

/***
 * MARK: isLiveEnginePath
 * @description Whether a path points inside the LIVE engine state dir
 *   (`~/.kainbain/engine/`). The one shared definition every test guard
 *   uses, so the boundary can never drift between stores.
 *
 *   The comparison normalizes with `path.resolve` and requires a trailing
 *   separator, so a similarly-prefixed dir (e.g. `engine2/`) never
 *   false-positives. It deliberately does NOT resolve symlinks
 *   (no `realpath`): temp dirs on some platforms are symlinks, and every
 *   caller here passes already-absolute literal-built paths, so a text
 *   comparison on the normalized path is exact. A symlink pointing INTO
 *   the live dir would need write access to `~/.kainbain` first, at which
 *   point the attacker already owns the state files directly.
 * @example isLiveEnginePath('/home/u/.kainbain/engine/r.json') => true
 * @example isLiveEnginePath('/tmp/kainbain-test-state-x/r.json') => false
 * @param {string} candidatePath - Path to test.
 * @returns {boolean} True when the path sits under the live engine dir.
 ***/
export function isLiveEnginePath(candidatePath) {
	if (typeof candidatePath !== "string" || !candidatePath.trim()) return false;
	const enginePrefix =
		path.resolve(os.homedir(), ".kainbain", "engine") + path.sep;
	return path.resolve(candidatePath).startsWith(enginePrefix);
}

/***
 * MARK: resolveStatePath
 * @description Resolves one durable state file path: an explicit string
 *   wins, then the schema-configured path (env), then the conventional
 *   `~/.kainbain/engine/<fallbackName>`.
 *
 *   Structural guard for the 2026-11 test-pollution incident (task
 *   b3401f19, cause N5): while `VITEST` is set, resolving a path under
 *   the LIVE `~/.kainbain/engine/` dir THROWS, so a future store that
 *   forgets its `KAINBAIN_*` temp override fails loudly in CI instead of
 *   silently polluting production (survey q14: dummy/test models must
 *   never appear in production). Production (`VITEST` unset) resolves
 *   byte-identically to before.
 *
 *   The fallback name must be a bare file name: a separator or `..`
 *   would escape the engine dir, so it throws in every environment
 *   (all callers pass literals — this only ever fires on a bug).
 * @example resolveStatePath('/x.json', null, 's.json') => '/x.json'
 * @param {string} [explicit] - Explicit path (tests win).
 * @param {string} [configured] - Schema-configured path (env).
 * @param {string} fallbackName - Bare file name under `~/.kainbain/engine/`.
 * @returns {string} Resolved path.
 ***/
export function resolveStatePath(explicit, configured, fallbackName) {
	let resolved;
	if (typeof explicit === "string" && explicit.trim()) resolved = explicit;
	else if (typeof configured === "string" && configured.trim())
		resolved = configured;
	else {
		const trimmedName =
			typeof fallbackName === "string" ? fallbackName.trim() : "";
		if (
			!trimmedName ||
			trimmedName === "." ||
			trimmedName === ".." ||
			path.basename(trimmedName) !== trimmedName
		) {
			throw new Error(
				`resolveStatePath needs a bare fallback file name, got ${JSON.stringify(fallbackName)}. ` +
					`A separator or ".." would escape ~/.kainbain/engine/.`,
			);
		}
		resolved = path.join(os.homedir(), ".kainbain", "engine", trimmedName);
	}
	if (process.env.VITEST && isLiveEnginePath(resolved)) {
		throw new Error(
			`resolveStatePath refused live engine path under test: ${resolved} ` +
				`(VITEST is set). Pin the store at a temp file via its KAINBAIN_* ` +
				`env var (see api/testSetup.isolation.js) instead of reading or ` +
				`writing ~/.kainbain/engine/ from tests.`,
		);
	}
	return resolved;
}
