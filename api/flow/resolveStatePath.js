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
 * MARK: getLiveAccessibilityFeedbackFile
 * @description The one canonical live accessibility-feedback inbox path
 *   (`~/.kainbain/accessibility-feedback.jsonl`). Single definition so the
 *   predicate, the guard, and the route resolver (`resolveFeedbackFile`,
 *   which calls this instead of rebuilding the path) can never drift
 *   apart. `path.resolve` on the already-absolute join is the identity,
 *   so this string is byte-identical to the historic fallback.
 * @example getLiveAccessibilityFeedbackFile() => os.homedir() + '/.kainbain/accessibility-feedback.jsonl'
 * @returns {string} Absolute live inbox path.
 ***/
export function getLiveAccessibilityFeedbackFile() {
	return path.resolve(
		path.join(os.homedir(), ".kainbain", "accessibility-feedback.jsonl"),
	);
}

/***
 * MARK: isLiveAccessibilityFeedbackPath
 * @description Whether a path IS the live accessibility-feedback inbox
 *   (`~/.kainbain/accessibility-feedback.jsonl`). Exact-file comparison
 *   (not a dir-prefix like `isLiveEnginePath`): the inbox lives directly
 *   under `~/.kainbain/`, outside `~/.kainbain/engine/`, so the engine
 *   guard is a no-op for it (residual D9 of 99ccc12f, task b3dec9b0).
 *
 *   The comparison normalizes with `path.resolve` and trims surrounding
 *   whitespace, so a padded path cannot slip past the guard (a trailing
 *   slash also still matches — `path.resolve` strips it — so that
 *   spelling fails closed toward throwing). On Windows the comparison
 *   is case-insensitive (the filesystem is). It deliberately does NOT
 *   resolve symlinks (no `realpath`), mirroring the `isLiveEnginePath`
 *   contract: callers pass already-absolute literal-built paths, so a
 *   text comparison on the normalized path is exact. Non-string and
 *   blank inputs return false (they carry no path to guard).
 * @example isLiveAccessibilityFeedbackPath('/home/u/.kainbain/accessibility-feedback.jsonl') => true
 * @example isLiveAccessibilityFeedbackPath('/tmp/kainbain-test-a11y-XXXX/accessibility-feedback.jsonl') => false
 * @param {string} candidatePath - Path to test.
 * @returns {boolean} True when the path is the live inbox file.
 ***/
export function isLiveAccessibilityFeedbackPath(candidatePath) {
	if (typeof candidatePath !== "string" || !candidatePath.trim()) return false;
	const live = getLiveAccessibilityFeedbackFile();
	let resolved = path.resolve(candidatePath.trim());
	let wanted = live;
	if (process.platform === "win32") {
		resolved = resolved.toLowerCase();
		wanted = live.toLowerCase();
	}
	return resolved === wanted;
}

/***
 * MARK: throwIfLiveAccessibilityFeedbackPathUnderTest
 * @description Test-pollution guard for the accessibility-feedback inbox
 *   (residual D9 of 99ccc12f, task b3dec9b0): while `VITEST` is set,
 *   resolving the LIVE `~/.kainbain/accessibility-feedback.jsonl` inbox
 *   THROWS, so a suite that forgets its `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE`
 *   temp override fails loudly in CI instead of silently appending test
 *   reports to the real user inbox (survey q1: throw, not silent redirect).
 *   A no-op when `VITEST` is unset (production resolves byte-identically)
 *   or when the path is a temp/explicit inbox — including non-string
 *   values, which carry no path to guard. Gate matches the engine guard
 *   (`VITEST` only) so both guards sleep and fire together.
 * @example throwIfLiveAccessibilityFeedbackPathUnderTest({ candidatePath: '/tmp/x.json', callerName: 'resolveFeedbackFile' }) => undefined
 * @param {Object} args - Labelled inputs.
 * @param {*} args.candidatePath - Resolved path to guard (anything; only the live inbox string throws).
 * @param {string} [args.callerName] - Resolver name stamped into the error so the fix location is obvious.
 * @returns {void}
 ***/
export function throwIfLiveAccessibilityFeedbackPathUnderTest({
	candidatePath,
	callerName,
} = {}) {
	if (!process.env.VITEST) return;
	if (!isLiveAccessibilityFeedbackPath(candidatePath)) return;
	const caller =
		typeof callerName === "string" && callerName.trim()
			? callerName.trim()
			: "accessibility-feedback guard";
	throw new Error(
		`${caller} refused live accessibility-feedback path under test: ${candidatePath} ` +
			`(VITEST is set). Pin the inbox at a temp path via its ` +
			`KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE env var (see api/testSetup.isolation.js) ` +
			`instead of reading or writing ~/.kainbain/accessibility-feedback.jsonl from tests.`,
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
