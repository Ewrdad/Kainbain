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

/***
 * MARK: throwIfLiveEnginePathUnderTest
 * @description The one shared test-pollution guard every engine-state
 *   resolver calls (structural fix for the 2026-11 incident, task
 *   b3401f19 cause N5): while `VITEST` is set, a path at or under the
 *   LIVE `~/.kainbain/engine/` dir THROWS, so a store that forgets its
 *   `KAINBAIN_*` temp override fails loudly in CI instead of silently
 *   polluting production (survey q14: dummy/test models must never
 *   appear in production). A no-op when `VITEST` is unset (production
 *   resolves byte-identically) or when the path is outside the live
 *   dir — including non-string values, which carry no path to guard.
 * @example throwIfLiveEnginePathUnderTest({ candidatePath: '/tmp/x.json', callerName: 'resolveStatePath' }) => undefined
 * @param {Object} args - Labelled inputs.
 * @param {*} args.candidatePath - Resolved path to guard (anything; only live-engine strings throw).
 * @param {string} [args.callerName] - Resolver name stamped into the error so the fix location is obvious.
 * @returns {void}
 ***/
export function throwIfLiveEnginePathUnderTest({ candidatePath, callerName } = {}) {
	if (!process.env.VITEST) return;
	if (!isLiveEnginePath(candidatePath)) return;
	const caller =
		typeof callerName === "string" && callerName.trim()
			? callerName.trim()
			: "engine-state guard";
	throw new Error(
		`${caller} refused live engine path under test: ${candidatePath} ` +
			`(VITEST is set). Pin the store at a temp path via its KAINBAIN_* ` +
			`env var (see api/testSetup.isolation.js) instead of reading or ` +
			`writing ~/.kainbain/engine/ from tests.`,
	);
}

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
