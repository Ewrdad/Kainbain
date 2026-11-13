import os from "node:os";
import path from "node:path";

/***
 * MARK: resolveStatePath
 * @description Resolves one durable state file path.
 *
 *   Structural guard for the 2026-11 test-pollution incident (task
 *   b3401f19, cause N5): while `VITEST` is set, resolving a path under
 *   the LIVE `~/.kainbain/engine/` dir THROWS, so a future store that
 *   forgets its `KAINBAIN_*` temp override fails loudly in CI instead of
 *   silently polluting production (survey q14: dummy/test models must
 *   never appear in production). The comparison uses the normalized dir
 *   plus a trailing separator, so a similarly-prefixed dir
 *   (e.g. `engine2/`) never false-positives. Production (`VITEST` unset)
 *   resolves byte-identically to before.
 * @example resolveStatePath('/x.json', null, 's.json') => '/x.json'
 * @param {string} [explicit] - Explicit path (tests win).
 * @param {string} [configured] - Schema-configured path (env).
 * @param {string} fallbackName - File name under `~/.kainbain/engine/`.
 * @returns {string} Resolved path.
 ***/
export function resolveStatePath(explicit, configured, fallbackName) {
	let resolved;
	if (typeof explicit === "string" && explicit.trim()) resolved = explicit;
	else if (typeof configured === "string" && configured.trim())
		resolved = configured;
	else resolved = path.join(os.homedir(), ".kainbain", "engine", fallbackName);
	if (process.env.VITEST) {
		const enginePrefix =
			path.resolve(os.homedir(), ".kainbain", "engine") + path.sep;
		if (path.resolve(resolved).startsWith(enginePrefix)) {
			throw new Error(
				`resolveStatePath refused live engine path under test: ${resolved} ` +
					`(VITEST is set). Pin the store at a temp file via its KAINBAIN_* ` +
					`env var (see api/testSetup.isolation.js) instead of reading or ` +
					`writing ~/.kainbain/engine/ from tests.`,
			);
		}
	}
	return resolved;
}
