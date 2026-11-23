/***
 * MARK: versionInfo
 * @description Single source of truth for the Settings About page backend
 *   half: installed backend + API-contract versions, latest-known release
 *   comparison, UI↔backend API compatibility, and the latest security
 *   report for this build. An unadvertised latest (no `KAINBAIN_LATEST_*`
 *   knob) means no newer release is known, so the installed release
 *   reports `up-to-date`; only a malformed knob or a missing installed
 *   version yields `unknown`. Every helper is pure (inputs in, no
 *   process.env reads) so the route layer stays a thin pass-through and
 *   the tests can pin each failure mode without touching the filesystem.
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
 * @description Whether an explicitly advertised `latest` is newer than
 *   `installed`: only true when both sides parse and latest is strictly
 *   greater. Unparseable or missing input answers `unknown` so the page
 *   shows an honest unknown state instead of a fake "up to date".
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

/***
 * MARK: resolveLatestRelease
 * @description Resolves one row's `{ latest, status }` from the installed
 *   release and the operator's advertised-latest knob. An unset knob
 *   (missing, empty, or blank — the default install) means no newer
 *   release is known, so the installed release is the newest known and
 *   the row reports `up-to-date`. A knob that is set but does not parse
 *   (an operator typo, or a non-string value smuggled through the test
 *   seam) is misconfiguration and answers `unknown` rather than hiding
 *   behind a fake up-to-date.
 * @example resolveLatestRelease('1.0.0', '') => { latest: '1.0.0', status: 'up-to-date' }
 * @example resolveLatestRelease('1.0.0', 42) => { latest: null, status: 'unknown' }
 ***/
export const resolveLatestRelease = (installed, latestKnob) => {
	const have = normalizeRelease(installed);
	if (latestKnob === null || latestKnob === undefined) {
		return have
			? { latest: have, status: "up-to-date" }
			: { latest: null, status: "unknown" };
	}
	if (typeof latestKnob !== "string") {
		return { latest: null, status: "unknown" };
	}
	if (!latestKnob.trim()) {
		return have
			? { latest: have, status: "up-to-date" }
			: { latest: null, status: "unknown" };
	}
	const want = normalizeRelease(latestKnob);
	if (!want) return { latest: null, status: "unknown" };
	return { latest: want, status: compareRelease(installed, latestKnob) };
};

/***
 * MARK: normalizeFrontendContract
 * @description Normalizes the API contract the running UI reports about
 *   itself (its `apiVersion` plus its `requires.backendApi` range, baked
 *   from `frontend/version.json`): trims the range, coerces the version,
 *   and collapses anything missing or malformed to nulls so the
 *   compatibility check degrades to unknown instead of crashing.
 * @example normalizeFrontendContract({ apiVersion: 'v1.0.0', requiresBackendApi: '>=1.0.0 <2.0.0' }) => { apiVersion: '1.0.0', requiresBackendApi: '>=1.0.0 <2.0.0' }
 ***/
export const normalizeFrontendContract = (contract) => {
	if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
		return { apiVersion: null, requiresBackendApi: null };
	}
	const requires = contract.requiresBackendApi;
	return {
		apiVersion: normalizeRelease(contract.apiVersion),
		requiresBackendApi:
			typeof requires === "string" && requires.trim() ? requires.trim() : null,
	};
};

/***
 * MARK: checkApiCompatibility
 * @description Whether the running UI and backend can talk: the same
 *   verdict `scripts/check-component-compat.mjs` gives at publish time,
 *   but for the live pair. Each declared range direction is checked with
 *   semver (frontend `requires.backendApi` must contain the backend API,
 *   backend `accepts.frontend` must contain the frontend API); any
 *   checkable direction that fails makes the pair incompatible. A corrupt
 *   range cannot condemn the pair — that direction is skipped. With no
 *   verifiable range at all, the asymmetric-update rule decides: the same
 *   API major on both sides is compatible, a split major is not. Missing
 *   API versions answer `unknown`, never a guess.
 * @example checkApiCompatibility({ frontendApiVersion: '1.0.0', requiresBackendApi: '>=1.0.0 <2.0.0', backendApiVersion: '1.2.0', acceptsFrontend: '>=1.0.0 <2.0.0' }) => { status: 'compatible', detail: '...' }
 ***/
export const checkApiCompatibility = ({
	frontendApiVersion = null,
	requiresBackendApi = null,
	backendApiVersion = null,
	acceptsFrontend = null,
} = {}) => {
	const frontend = normalizeRelease(frontendApiVersion);
	const backend = normalizeRelease(backendApiVersion);
	if (!frontend) {
		return { status: "unknown", detail: "Frontend API version was not reported" };
	}
	if (!backend) {
		return { status: "unknown", detail: "Backend API version is not available" };
	}
	const requires =
		typeof requiresBackendApi === "string" && requiresBackendApi.trim()
			? requiresBackendApi.trim()
			: null;
	const accepts =
		typeof acceptsFrontend === "string" && acceptsFrontend.trim()
			? acceptsFrontend.trim()
			: null;
	// A range that does not parse is uncheckable (null), not a failure: a
	// corrupt range file must not condemn a pair the other evidence clears.
	// (`satisfies` answers false for garbage instead of throwing, so the
	// range is pre-validated; blank ranges never reach this helper.)
	const directionSatisfies = (version, range) => {
		try {
			if (!semver.validRange(range)) return null;
			return semver.satisfies(version, range);
		} catch {
			return null;
		}
	};
	const frontendToBackend = requires ? directionSatisfies(backend, requires) : null;
	const backendAccepts = accepts ? directionSatisfies(frontend, accepts) : null;
	if (frontendToBackend === false) {
		return {
			status: "incompatible",
			detail: `backend API ${backend} does not satisfy frontend requirement ${requires}`,
		};
	}
	if (backendAccepts === false) {
		return {
			status: "incompatible",
			detail: `frontend API ${frontend} is outside backend accepted range ${accepts}`,
		};
	}
	if (frontendToBackend === true && backendAccepts === true) {
		return {
			status: "compatible",
			detail:
				`frontend API ${frontend} and backend API ${backend} satisfy each ` +
				`other's ranges (API major ${semver.major(frontend)})`,
		};
	}
	if (frontendToBackend === true) {
		return {
			status: "compatible",
			detail: `backend API ${backend} satisfies frontend requirement ${requires}`,
		};
	}
	if (backendAccepts === true) {
		return {
			status: "compatible",
			detail: `frontend API ${frontend} satisfies backend accepted range ${accepts}`,
		};
	}
	if (semver.major(frontend) === semver.major(backend)) {
		return {
			status: "compatible",
			detail: `both sides speak API major ${semver.major(frontend)}`,
		};
	}
	return {
		status: "incompatible",
		detail:
			`API major differs (frontend ${frontend} vs backend ${backend}) — ` +
			`update one side to match`,
	};
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
 * MARK: normalizeSecuritySummary
 * @description Reduces any security-report input to the endpoint's
 *   `{ status, checkedAt, summary, reportUrl }` shape. Only the file
 *   contract's verdicts (`pass`, `fail`, `warn`, plus the honest
 *   `unknown`) survive; any other status, a non-object input, or
 *   mistyped fields collapse to the honest unknown state with safe
 *   field types — so a corrupt injected report can never fail the
 *   endpoint's response validation with a 500 or show a bogus verdict.
 * @example normalizeSecuritySummary({ status: 'pass', summary: 'ok' }) => { status: 'pass', checkedAt: null, summary: 'ok', reportUrl: null }
 * @example normalizeSecuritySummary({ status: 'scanned' }) => { status: 'unknown', checkedAt: null, summary: '', reportUrl: null }
 ***/
export const normalizeSecuritySummary = (security) => {
	const unknown = { status: "unknown", checkedAt: null, summary: "", reportUrl: null };
	if (!security || typeof security !== "object" || Array.isArray(security)) return unknown;
	if (!["pass", "fail", "warn", "unknown"].includes(security.status)) return unknown;
	return {
		status: security.status,
		checkedAt:
			typeof security.checkedAt === "string" && security.checkedAt
				? security.checkedAt
				: null,
		summary: typeof security.summary === "string" ? security.summary : "",
		reportUrl:
			typeof security.reportUrl === "string" && security.reportUrl.trim()
				? security.reportUrl.trim()
				: null,
	};
};

/***
 * MARK: buildVersionInfo
 * @description Aggregates the full `/status/versions` payload from its
 *   sources: installed versions (UI from the caller query, backend + API
 *   contract from disk), the UI-reported frontend API contract (from the
 *   caller query), latest-known releases (operator env knobs, defaulting
 *   to the installed release when unadvertised), and the security report
 *   file. `warnings` names each component with an update available; the
 *   API row ties both sides' contract versions together with a
 *   compatibility verdict.
 * @example buildVersionInfo({ uiVersion: '1.0.0' }).backend => { installed, latest, status, updateUrl }
 ***/
export const buildVersionInfo = ({
	uiVersion = null,
	backendVersion = null,
	apiContract = null,
	frontendApi = null,
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
	const frontend = normalizeFrontendContract(frontendApi);
	const latestVersions =
		latest && typeof latest === "object" ? latest : {};

	const uiLatest = resolveLatestRelease(uiVersion, latestVersions.ui);
	const ui = {
		installed: installedUi,
		latest: uiLatest.latest,
		status: uiLatest.status,
		updateUrl: VERSION_UPDATE_GUIDES.ui,
	};
	const backendLatest = resolveLatestRelease(backendVersion, latestVersions.backend);
	const backend = {
		installed: installedBackend,
		latest: backendLatest.latest,
		status: backendLatest.status,
		updateUrl: VERSION_UPDATE_GUIDES.backend,
	};
	const acceptsMap = readAcceptsMap(contract.accepts);
	const apiLatest = resolveLatestRelease(contract.apiVersion, latestVersions.api);
	const api = {
		name: "screen-to-server",
		installed: installedApi,
		latest: apiLatest.latest,
		status: apiLatest.status,
		frontendApiVersion: frontend.apiVersion,
		requiresBackendApi: frontend.requiresBackendApi,
		compatibility: checkApiCompatibility({
			frontendApiVersion: frontend.apiVersion,
			requiresBackendApi: frontend.requiresBackendApi,
			backendApiVersion: installedApi,
			acceptsFrontend: acceptsMap.frontend ?? null,
		}),
		accepts: acceptsMap,
		updateUrl: VERSION_UPDATE_GUIDES.api,
	};
	const securityInfo = normalizeSecuritySummary(security);

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
		checkedAt:
			typeof checkedAt === "string" && checkedAt
				? checkedAt
				: new Date().toISOString(),
		warnings,
	};
};
