import semver from "semver";

/***
 * MARK: runnerVersionCompat
 * @description Pure version-compat helpers for the runner self-update
 *   channel (Option A, ADR 0012): the backend never ships runner code, it
 *   only compares the product version Runners report in
 *   `facts.versions.runner` against the operator knobs
 *   KAINBAIN_RUNNER_MIN_VERSION (dispatch floor) and
 *   KAINBAIN_RUNNER_RECOMMENDED_VERSION (fleet-matrix badge). A Runner
 *   that reports no version is permissive on both (never blocked, badge
 *   shows unknown) so introducing the knobs cannot lock the fleet out.
 * @example runnerVersionAtLeast('0.2.0', '0.1.0') => true
 ***/
/***
 * MARK: coerceRunnerVersion
 * @description Normalizes a reported product version to `major.minor.patch`
 *   (tolerates a `v` prefix, coerces partial input). Null when absent or
 *   unparseable — callers treat that as permissive, never a block.
 * @example coerceRunnerVersion('v1.2.3') => '1.2.3'
 ***/
export const coerceRunnerVersion = (version) => {
	if (typeof version !== "string") return null;
	const cleaned = version.trim().replace(/^v/, "");
	if (!cleaned) return null;
	try {
		const coerced = semver.coerce(cleaned);
		return coerced ? coerced.version : null;
	} catch {
		return null;
	}
};

/***
 * MARK: runnerVersionAtLeast
 * @description Whether a reported Runner product version meets a floor.
 *   Permissive (true) when either side is missing or malformed, so
 *   introducing a floor can never lock the fleet out.
 * @example runnerVersionAtLeast('0.2.0', '0.1.0') => true
 ***/
export const runnerVersionAtLeast = (runnerVersion, minVersion) => {
	const have = coerceRunnerVersion(runnerVersion);
	const floor = coerceRunnerVersion(minVersion);
	if (!have) return true;
	if (!floor) return true;
	try {
		return semver.gte(have, floor);
	} catch {
		return true;
	}
};

/***
 * MARK: belowMinimumRunnerVersion
 * @description Whether a KNOWN Runner version sits below the dispatch
 *   floor (the 409 condition). Unknown versions answer false — permissive.
 * @example belowMinimumRunnerVersion('0.0.9', '0.1.0') => true
 ***/
export const belowMinimumRunnerVersion = (runnerVersion, minVersion) => {
	if (coerceRunnerVersion(runnerVersion) === null) return false;
	return !runnerVersionAtLeast(runnerVersion, minVersion);
};

/***
 * MARK: buildBelowMinimumRefusal
 * @description Builds the 409 refusal body for a Runner below the dispatch
 *   floor, or null when it may take work (at/above the floor, or reporting
 *   no version — unknown versions stay permissive so the first floor
 *   rollout never locks the fleet out). Both refusal points (direct claim
 *   and dispatch) share this so the code, message, and payload cannot drift.
 * @example buildBelowMinimumRefusal({ runner: { runnerId: 'r1', facts: { versions: { runner: '0.0.1' } } }, minVersion: '0.1.0' }) => { error, code: 'RUNNER_VERSION_BELOW_MINIMUM', ... }
 ***/
export const buildBelowMinimumRefusal = ({ runner, minVersion } = {}) => {
	const runnerVersion = runner?.facts?.versions?.runner ?? null;
	if (!belowMinimumRunnerVersion(runnerVersion, minVersion)) return null;
	return {
		error: `Runner ${runner?.runnerId} version ${runnerVersion} is below the minimum ${minVersion} — update, then ask again`,
		code: "RUNNER_VERSION_BELOW_MINIMUM",
		minimumVersion: minVersion,
		runnerVersion,
	};
};

/***
 * MARK: updateAvailableForRunner
 * @description Badge condition for the fleet matrix: true only when both
 *   sides parse and the Runner trails the recommended version.
 * @example updateAvailableForRunner('0.1.0', '0.2.0') => true
 ***/
export const updateAvailableForRunner = (runnerVersion, recommendedVersion) => {
	const have = coerceRunnerVersion(runnerVersion);
	const target = coerceRunnerVersion(recommendedVersion);
	if (!have || !target) return false;
	try {
		return semver.lt(have, target);
	} catch {
		return false;
	}
};

/***
 * MARK: updateInfoForRunner
 * @description Derives the fleet-matrix version fields from heartbeat
 *   facts plus the operator knobs (registry `_public` consumes this).
 * @example updateInfoForRunner({ versions: { runner: '0.1.0' } }, { minVersion: '0.1.0', recommendedVersion: '0.2.0' }) => { runnerVersion: '0.1.0', updateAvailable: true, ... }
 ***/
export const updateInfoForRunner = (facts, { minVersion, recommendedVersion } = {}) => {
	const runnerVersion = facts?.versions?.runner ?? null;
	const updateStatus = facts?.updateStatus ?? null;
	return {
		runnerVersion,
		updateAvailable: updateAvailableForRunner(runnerVersion, recommendedVersion),
		belowMinimum: belowMinimumRunnerVersion(runnerVersion, minVersion),
		minimumVersion: typeof minVersion === "string" && minVersion ? minVersion : null,
		recommendedVersion: typeof recommendedVersion === "string" && recommendedVersion ? recommendedVersion : null,
		updateStatus,
	};
};
