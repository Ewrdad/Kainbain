import os from "node:os";
import path from "node:path";
import { throwIfLiveEnginePathUnderTest } from "./throwIfLiveEnginePathUnderTest.js";

// Re-exports: each guard lives in its own file so the one-function check passes; callers keep importing from here.
export { isLiveEnginePath } from "./isLiveEnginePath.js";
export { throwIfLiveEnginePathUnderTest } from "./throwIfLiveEnginePathUnderTest.js";
export { getLiveAccessibilityFeedbackFile } from "./getLiveAccessibilityFeedbackFile.js";
export { isLiveAccessibilityFeedbackPath } from "./isLiveAccessibilityFeedbackPath.js";
export { throwIfLiveAccessibilityFeedbackPathUnderTest } from "./throwIfLiveAccessibilityFeedbackPathUnderTest.js";

/***
 * MARK: resolveStatePath
 * @description Resolves one durable state file path: an explicit string
 *   wins, then the schema-configured path (env), then the conventional
 *   `~/.kainbain/engine/<fallbackName>`.
 *
 *   Structural guard for the 2026-11 test-pollution incident (task
 *   b3401f19, cause N5): while `VITEST` is set, resolving a path at or
 *   under the LIVE `~/.kainbain/engine/` dir THROWS (via
 *   `throwIfLiveEnginePathUnderTest`), so a future store that forgets
 *   its `KAINBAIN_*` temp override fails loudly in CI instead of
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
	throwIfLiveEnginePathUnderTest({
		candidatePath: resolved,
		callerName: "resolveStatePath",
	});
	return resolved;
}
