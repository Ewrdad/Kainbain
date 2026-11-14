import { isLiveEnginePath } from "./isLiveEnginePath.js";

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
