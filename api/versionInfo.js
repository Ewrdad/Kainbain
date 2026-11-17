/***
 * MARK: versionInfo
 * @description Single source of truth for the Settings About page backend
 *   half: installed backend + API-contract versions, latest-known release
 *   comparison, and the latest security report for this build. Every
 *   "latest" lookup failure yields an explicit `unknown` state, never a
 *   silent "up to date"; every helper is pure (inputs in, no process.env
 *   reads) so the route layer stays a thin pass-through and the tests can
 *   pin each failure mode without touching the filesystem.
 * @example buildVersionInfo({ uiVersion: '1.0.0' }) => { ui, backend, apis, security, ... }
 ***/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { coerceRunnerVersion } from "./flow/runnerVersionCompat.js";

/***
 * MARK: VERSION_UPDATE_GUIDES
 * @description Site-docs slugs behind each version row's "How to update"
 *   link, as `#/docs/<slug>` hash paths. One source so the endpoint and
 *   the page can never point at different guides.
 * @example VERSION_UPDATE_GUIDES => { ui: '#/docs/update-ui', backend: '#/docs/update-backend', api: '#/docs/update-api' }
 ***/
export const VERSION_UPDATE_GUIDES = Object.freeze({
	ui: "#/docs/update-ui",
	backend: "#/docs/update-backend",
	api: "#/docs/update-api",
});

/***
 * MARK: normalizeRelease
 * @description Reduces a raw version input to `major.minor.patch` (tolerates
 *   a `v` prefix and partial input via semver coercion). Null when absent
 *   or unparseable — callers treat that as unknown, never as up to date.
 *   This is the runner channel's coerce helper under a page-local name, so
 *   the two release comparisons can never drift apart; only the name is new.
 * @example normalizeRelease('v1.2.3') => '1.2.3'
 ***/
export const normalizeRelease = coerceRunnerVersion;

/***
 * MARK: compareRelease
 * @description Whether `latest` is newer than `installed`: only true when
 *   both sides parse and latest is strictly greater. Unparseable or missing
 *   input answers `unknown` so the page shows an honest unknown state
 *   instead of a fake "up to date".
 * @example compareRelease('1.0.0', '1.1.0') => 'update-available'
 ***/
export const compareRelease = (installed, latest) => {
	const have = normalizeRelease(installed);
	const want = normalizeRelease(latest);
	if (!have || !want) return "unknown";
	try {
		return semver.gt(want, have) ? "update-available" : "up-to-date";
	} catch {
		return "unknown";
	}
};

const readJson = (readFile, filePath) => {
	const raw = readFile(filePath, "utf8");
	return JSON.parse(raw);
};

/***
 * MARK: readBackendVersion
 * @description Reads the installed backend version from `api/package.json`
 *   (the one backend-version source). Null when the file is missing or the
 *   version does not parse, never a crash.
 * @example readBackendVersion() => '1.0.0'
 ***/
export const readBackendVersion = ({
	readFile = fs.readFileSync,
	apiDir = path.join(path.dirname(fileURLToPath(import.meta.url))),
} = {}) => {
	try {
		const parsed = readJson(readFile, path.join(apiDir, "package.json"));
		return normalizeRelease(parsed?.version);
	} catch {
		return null;
	}
};

/***
 * MARK: readApiContract
 * @description Reads the screen-to-server API contract from
 *   `api/version.json`: the contract version plus the accepts-map used for
 *   compatibility detection. Missing/invalid files yield nulls, never a crash.
 * @example readApiContract() => { apiVersion: '1.0.0', accepts: { frontend: '>=1.0.0 <2.0.0' } }
 ***/
export const readApiContract = ({
	readFile = fs.readFileSync,
	apiDir = path.join(path.dirname(fileURLToPath(import.meta.url))),
} = {}) => {
	try {
		const parsed = readJson(readFile, path.join(apiDir, "version.json"));
		return {
			apiVersion: normalizeRelease(parsed?.apiVersion),
			accepts: readAcceptsMap(parsed?.accepts),
		};
	} catch {
		return { apiVersion: null, accepts: {} };
	}
};

/***
 * MARK: readAcceptsMap
 * @description Reduces a raw `accepts` value to a plain who-must-satisfy
 *   map of range strings. Anything off-contract (missing, a string, an
 *   array, a number) becomes an empty map — the page then hides the line
 *   instead of rendering garbage like a spread array's numeric keys.
 * @example readAcceptsMap({ frontend: '>=1.0.0 <2.0.0' }) => { frontend: '>=1.0.0 <2.0.0' }
 * @example readAcceptsMap(['frontend']) => {}
 ***/
export const readAcceptsMap = (accepts) => {
	if (!accepts || typeof accepts !== "object" || Array.isArray(accepts)) return {};
	const cleaned = {};
	for (const [who, range] of Object.entries(accepts)) {
		// A hostile version.json must not smuggle prototype keys through.
		if (who === "__proto__" || who === "constructor" || who === "prototype") continue;
		if (typeof range !== "string" || !range.trim()) continue;
		/* eslint-disable-next-line security/detect-object-injection -- who is a version.json map key already screened for prototype names above */
		cleaned[who] = range.trim();
	}
	return cleaned;
};

/***
 * MARK: readSecurityReport
 * @description Loads the latest security report for this build from the
 *   operator-configured JSON file (`KAINBAIN_SECURITY_REPORT_PATH`). The
 *   file contract is `{ status: 'pass' | 'fail' | 'warn', checkedAt,
 *   summary, reportUrl? }`. Anything else — no path configured, missing
 *   file, unparseable JSON, unknown status — yields
 *   `{ status: 'unknown' }` so the page shows an honest empty state and
 *   never implies a scan passed when none is recorded.
 * @example readSecurityReport({ reportPath: '' }) => { status: 'unknown', checkedAt: null, summary: '', reportUrl: null }
 ***/
export const readSecurityReport = ({
	readFile = fs.readFileSync,
	reportPath = "",
	reportUrl = "",
} = {}) => {
	const fallbackUrl = typeof reportUrl === "string" && reportUrl.trim() ? reportUrl.trim() : null;
	const unknown = { status: "unknown", checkedAt: null, summary: "", reportUrl: fallbackUrl };
	if (typeof reportPath !== "string" || !reportPath.trim()) return unknown;
	let parsed;
	try {
		parsed = readJson(readFile, reportPath.trim());
	} catch {
		return unknown;
	}
	if (!parsed || typeof parsed !== "object") return unknown;
	if (!["pass", "fail", "warn"].includes(parsed.status)) return unknown;
	return {
		status: parsed.status,
		checkedAt: typeof parsed.checkedAt === "string" && parsed.checkedAt ? parsed.checkedAt : null,
		summary: typeof parsed.summary === "string" ? parsed.summary : "",
		reportUrl:
			typeof parsed.reportUrl === "string" && parsed.reportUrl.trim()
				? parsed.reportUrl.trim()
				: fallbackUrl,
	};
};

/***
 * MARK: buildVersionInfo
 * @description Aggregates the full `/status/versions` payload from its
 *   three sources: installed versions (UI from the caller query, backend +
 *   API contract from disk), latest-known releases (operator env knobs),
 *   and the security report file. Every "latest" miss is `unknown`, and
 *   `warnings` names each component with an update available.
 * @example buildVersionInfo({ uiVersion: '1.0.0' }).backend => { installed, latest, status, updateUrl }
 ***/
export const buildVersionInfo = ({
	uiVersion = null,
	backendVersion = null,
	apiContract = null,
	latest = {},
	security = null,
	checkedAt = null,
} = {}) => {
	const installedUi = normalizeRelease(uiVersion);
	const installedBackend = normalizeRelease(backendVersion);
	const contract =
		apiContract && typeof apiContract === "object"
			? apiContract
			: { apiVersion: null, accepts: {} };
	const installedApi = normalizeRelease(contract.apiVersion);
	const latestVersions =
		latest && typeof latest === "object" ? latest : {};

	const ui = {
		installed: installedUi,
		latest: normalizeRelease(latestVersions.ui),
		status: compareRelease(installedUi, latestVersions.ui),
		updateUrl: VERSION_UPDATE_GUIDES.ui,
	};
	const backend = {
		installed: installedBackend,
		latest: normalizeRelease(latestVersions.backend),
		status: compareRelease(installedBackend, latestVersions.backend),
		updateUrl: VERSION_UPDATE_GUIDES.backend,
	};
	const api = {
		name: "screen-to-server",
		installed: installedApi,
		latest: normalizeRelease(latestVersions.api),
		status: compareRelease(installedApi, latestVersions.api),
		accepts: readAcceptsMap(contract.accepts),
		updateUrl: VERSION_UPDATE_GUIDES.api,
	};
	const securityInfo =
		security && typeof security === "object" && typeof security.status === "string"
			? security
			: { status: "unknown", checkedAt: null, summary: "", reportUrl: null };

	const warnings = [];
	for (const [label, entry] of [
		["UI", ui],
		["Backend", backend],
		["API", api],
	]) {
		if (entry.status === "update-available") {
			warnings.push(
				`${label} update available: ${entry.installed ?? "unknown"} → ${entry.latest}`,
			);
		}
	}

	return {
		ui,
		backend,
		apis: [api],
		security: securityInfo,
		checkedAt: checkedAt ?? new Date().toISOString(),
		warnings,
	};
};
