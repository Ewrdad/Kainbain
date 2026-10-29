import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

/***
 * MARK: loadBackendRunnerRange
 * @description Loads the backend's accepted Runner API range from
 *   api/version.json (`accepts.runner`, DA1). Missing/invalid yields null.
 * @example loadBackendRunnerRange() => '>=1.0.0 <2.0.0'
 * @returns {string|null}
 ***/
export function loadBackendRunnerRange() {
	try {
		const file = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
			"..",
			"version.json",
		);
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		const range = parsed?.accepts?.runner;
		return typeof range === "string" && range.trim() ? range.trim() : null;
	} catch {
		return null;
	}
}

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
