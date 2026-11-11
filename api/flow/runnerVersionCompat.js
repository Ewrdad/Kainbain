import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
 * MARK: buildBackendUpdateAdvertisement
 * @description The version block the backend attaches to register/heartbeat
 *   responses so a Runner can pick the newest release COMPATIBLE with this
 *   backend and respect the operator-managed desired/minimum runner versions
 *   (backend-managed updates, ADR 0012 Option A: the backend directs the
 *   version, it never ships runner bytes). A null field means "not managed"
 *   and the Runner keeps its permissive latest-compatible behavior.
 * @example buildBackendUpdateAdvertisement({ apiVersion: '1.0.0', minVersion: '0.1.0', recommendedVersion: '0.2.0' }) => { backendApiVersion: '1.0.0', minimumRunnerVersion: '0.1.0', desiredRunnerVersion: '0.2.0' }
 ***/
export const buildBackendUpdateAdvertisement = ({
	apiVersion,
	minVersion,
	recommendedVersion,
} = {}) => ({
	backendApiVersion:
		typeof apiVersion === "string" && apiVersion.trim() ? apiVersion.trim() : null,
	minimumRunnerVersion:
		typeof minVersion === "string" && minVersion.trim() ? minVersion.trim() : null,
	desiredRunnerVersion:
		typeof recommendedVersion === "string" && recommendedVersion.trim()
			? recommendedVersion.trim()
			: null,
});

/***
 * MARK: updateInfoForRunner
 * @description Derives the fleet-matrix version fields from heartbeat
 *   facts plus the operator knobs (registry `_public` consumes this).
 * @example updateInfoForRunner({ versions: { runner: '0.1.0' } }, { minVersion: '0.1.0', recommendedVersion: '0.2.0' }) => { runnerVersion: '0.1.0', updateAvailable: true, ... }
 ***/
export const updateInfoForRunner = (facts, { minVersion, recommendedVersion, backendApiVersion } = {}) => {
	const runnerVersion = facts?.versions?.runner ?? null;
	const updateStatus = facts?.updateStatus ?? null;
	const recommended = typeof recommendedVersion === "string" && recommendedVersion ? recommendedVersion : null;
	return {
		runnerVersion,
		updateAvailable: updateAvailableForRunner(runnerVersion, recommendedVersion),
		belowMinimum: belowMinimumRunnerVersion(runnerVersion, minVersion),
		minimumVersion: typeof minVersion === "string" && minVersion ? minVersion : null,
		recommendedVersion: recommended,
		// Backend advertisement (task 82e49a05): the managed fleet target
		// plus this backend's own API version, so runners can select the
		// newest release compatible with the backend they talk to. The
		// desired version mirrors the recommended knob (the one managed
		// place); it nudges via badges/auto-command but never caps a
		// compatible runner (survey q1: asymmetric updates allowed).
		desiredRunnerVersion: recommended,
		backendApiVersion: typeof backendApiVersion === "string" && backendApiVersion ? backendApiVersion : null,
		updateStatus,
	};
};

/***
 * MARK: loadBackendApiVersion
 * @description Reads this backend's own API version from
 *   api/version.json (`apiVersion`, DA1). Missing/invalid yields null
 *   (the advertisement is then silent and runners behave as before).
 * @example loadBackendApiVersion() => '1.0.0'
 * @returns {string|null}
 ***/
export const loadBackendApiVersion = () => {
	try {
		const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "version.json");
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		const version = parsed?.apiVersion;
		return typeof version === "string" && version.trim() ? version.trim() : null;
	} catch {
		return null;
	}
};

/***
 * MARK: BACKEND_API_VERSION
 * @description This backend's own API version, read once at import from
 *   `api/version.json` (null when missing/invalid). Advertised to runners
 *   on register/heartbeat so they can select the newest release
 *   compatible with this backend.
 * @example BACKEND_API_VERSION => '1.0.0'
 ***/
export const BACKEND_API_VERSION = loadBackendApiVersion();

/***
 * MARK: RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS
 * @description Minimum gap between backend-initiated `requestUpdate`
 *   nudges for one runner (survey q2: the backend commands updates for
 *   out-of-date runners). The runner still applies only when idle and
 *   still honours its own `KAINBAIN_RUNNER_AUTO_UPDATE=0` opt-out, so a
 *   daily nudge can neither interrupt work nor override the host owner.
 * @example RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS => 86400000
 ***/
export const RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/***
 * MARK: shouldAutoRequestUpdate
 * @description Whether this heartbeat should queue a `requestUpdate`
 *   nudge for an out-of-date runner: active runners that advertise the
 *   command and trail the recommended version, with none already pending
 *   and no nudge result inside the cooldown. Pure (the registry passes
 *   the record slices) so the nudging policy is unit-testable.
 * @example shouldAutoRequestUpdate({ facts: { versions: { runner: '0.1.0' }, commands: ['requestUpdate'] }, pendingCommands: [], commandResults: {}, recommendedVersion: '0.2.0' }) => true
 ***/
export const shouldAutoRequestUpdate = ({ facts, pendingCommands = [], commandResults = {}, recommendedVersion, now = Date.now() } = {}) => {
	const runnerVersion = facts?.versions?.runner ?? null;
	if (!updateAvailableForRunner(runnerVersion, recommendedVersion)) return false;
	if (!Array.isArray(facts?.commands) || !facts.commands.includes("requestUpdate")) return false;
	if (Array.isArray(pendingCommands) && pendingCommands.some((entry) => entry?.command === "requestUpdate" || entry === "requestUpdate")) return false;
	const last = commandResults?.requestUpdate;
	if (last && typeof last === "object" && typeof last.at === "string" && last.at) {
		const at = Date.parse(last.at);
		if (Number.isFinite(at) && now - at < RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS) return false;
	}
	return true;
};
