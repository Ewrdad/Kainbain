import semver from "semver";
import { loadBackendRunnerRange } from "./loadBackendRunnerRange.js";

const BACKEND_RUNNER_RANGE = loadBackendRunnerRange();

/***
 * MARK: runnerApiCompatible
 * @description Whether a Runner-advertised API version (`versions.api`) is
 *   inside the backend's accepted range. Absent version (old Runner) or an
 *   unloadable range is accepted, as before WP-A4.
 * @example runnerApiCompatible('1.0.0') => { ok: true }
 * @example runnerApiCompatible('9.0.0') => { ok: false, range: '>=1.0.0 <2.0.0' }
 * @param {unknown} apiVersion - Runner `facts.versions.api` value.
 * @returns {Object} `{ ok, range }`.
 ***/
export function runnerApiCompatible(apiVersion) {
	if (typeof apiVersion !== "string" || !apiVersion.trim()) return { ok: true, range: BACKEND_RUNNER_RANGE };
	if (!BACKEND_RUNNER_RANGE) return { ok: true, range: null };
	if (!semver.valid(apiVersion.trim())) return { ok: false, range: BACKEND_RUNNER_RANGE };
	return { ok: semver.satisfies(apiVersion.trim(), BACKEND_RUNNER_RANGE), range: BACKEND_RUNNER_RANGE };
}
