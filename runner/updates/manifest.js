/***
 * MARK: updateManifest
 * @description Release-manifest schema + semver helpers for the runner
 *   self-update channel (Option A, ADR 0012). The manifest is the only
 *   trusted version pointer: it is signature-verified BEFORE parsing for
 *   control flow (see verify.js), and every asset carries a sha256 the
 *   downloader re-checks after fetch. Pure helpers, no network here.
 * @example validateManifest({ schema: 1, component: 'runner', ... }) => { ok: true }
 ***/
export const MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_RELEASES_LATEST_URL =
	"https://api.github.com/repos/Ewrdad/Kainbain/releases/latest";

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const parseVersion = (version) => {
	const match = SEMVER_RE.exec(String(version || "").trim());
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] || null,
	};
};

export const isValidVersion = (version) => parseVersion(version) !== null;

// -1 when a<b, 0 when equal, 1 when a>b. A release beats its own
// prerelease (1.2.3 > 1.2.3-rc.1); prerelease-to-prerelease compares
// lexically on the prerelease tag (good enough for skip/newer gates).
export const compareVersions = (a, b) => {
	const pa = parseVersion(a);
	const pb = parseVersion(b);
	if (!pa || !pb) return null;
	for (const key of ["major", "minor", "patch"]) {
		if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
	}
	if (pa.prerelease === pb.prerelease) return 0;
	if (pa.prerelease === null) return 1;
	if (pb.prerelease === null) return -1;
	return pa.prerelease < pb.prerelease ? -1 : 1;
};

export const isNewerVersion = (candidate, current) => {
	const cmp = compareVersions(candidate, current);
	return cmp === 1;
};

// GitHub marks canary releases as pre-release; v1 runners never install
// them (survey q7: no pre-release opt-in). A manifest whose version is a
// prerelease, or a releases/latest pointer flagged prerelease, is skipped.
export const isPrereleaseVersion = (version) => {
	const parsed = parseVersion(version);
	if (!parsed) return false;
	return parsed.prerelease !== null;
};

const SHA256_RE = /^[0-9a-f]{64}$/i;

export const validateManifest = (manifest) => {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return { ok: false, reason: "Manifest must be a JSON object." };
	}
	if (manifest.schema !== MANIFEST_SCHEMA_VERSION) {
		return { ok: false, reason: `Unsupported manifest schema ${String(manifest.schema)} (want ${MANIFEST_SCHEMA_VERSION}).` };
	}
	if (manifest.component !== "runner") {
		return { ok: false, reason: `Manifest component must be 'runner', got ${String(manifest.component)}.` };
	}
	if (!isValidVersion(manifest.version)) {
		return { ok: false, reason: `Manifest version is not semver: ${String(manifest.version)}.` };
	}
	if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
		return { ok: false, reason: "Manifest must list at least one asset." };
	}
	for (const asset of manifest.assets) {
		if (!asset || typeof asset !== "object") return { ok: false, reason: "Manifest asset must be an object." };
		for (const field of ["platform", "arch", "filename", "sha256", "size"]) {
			if (asset[field] === undefined || asset[field] === null || asset[field] === "") {
				return { ok: false, reason: `Manifest asset is missing '${field}'.` };
			}
		}
		if (!SHA256_RE.test(String(asset.sha256))) {
			return { ok: false, reason: `Manifest asset '${asset.filename}' has a malformed sha256.` };
		}
		if (!Number.isInteger(asset.size) || asset.size <= 0) {
			return { ok: false, reason: `Manifest asset '${asset.filename}' has an invalid size.` };
		}
	}
	// Additive compat field (task 82e49a05): which backend API range this
	// runner release works with. Absent on legacy manifests (compatible by
	// default); when present only the SHAPE is validated here — whether
	// the range parses and matches the backend is decided per-candidate by
	// checkBackendCompat, so one bad range skips its release instead of
	// failing the whole check.
	if (manifest.requires !== undefined) {
		if (!manifest.requires || typeof manifest.requires !== "object" || Array.isArray(manifest.requires)) {
			return { ok: false, reason: "Manifest 'requires' must be an object." };
		}
		if (typeof manifest.requires.backendApi !== "string" || !manifest.requires.backendApi.trim()) {
			return { ok: false, reason: "Manifest 'requires.backendApi' must be a non-empty range string." };
		}
	}
	return { ok: true };
};

export const assetForPlatform = (manifest, { platform, arch }) => {
	const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
	return assets.find((a) => a?.platform === platform && a?.arch === arch) || null;
};

// Dependency-free range check for `requires.backendApi` (the runner bundle
// ships no node_modules, so the `semver` package the backend uses is not
// available here). Supported grammar: space-separated comparators with
// `>`, `>=`, `<`, `<=`, `=` (a bare version means `=`), ANDed together,
// with `||` alternation between groups — enough for every range the repo's
// own version.json files use (`>=1.0.0 <2.0.0`). Hyphen ranges, x-ranges,
// `^`/`~`, and `*` are NOT supported and read as unparseable (fail closed:
// never install a release whose compat claim cannot be read).
const COMPARATOR_RE = /^(>=|<=|>|<|=|v)?(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

const testComparator = (version, comparator) => {
	const match = COMPARATOR_RE.exec(String(comparator || "").trim());
	if (!match) return null;
	const cmp = compareVersions(version, match[2]);
	if (cmp === null) return null;
	const op = match[1] || "=";
	if (op === "=" || op === "v") return cmp === 0;
	if (op === ">") return cmp === 1;
	if (op === ">=") return cmp >= 0;
	if (op === "<") return cmp === -1;
	if (op === "<=") return cmp <= 0;
	return null;
};

export const versionSatisfiesRange = (version, range) => {
	if (!isValidVersion(version)) return false;
	const groups = String(range || "").split("||").map((g) => g.trim());
	if (groups.length === 0 || groups.some((g) => !g)) return false;
	for (const group of groups) {
		const comparators = group.split(/\s+/).filter(Boolean);
		if (comparators.length === 0) return false;
		let holds = true;
		for (const comparator of comparators) {
			const tested = testComparator(version, comparator);
			if (tested === null) return false;
			if (!tested) {
				holds = false;
				break;
			}
		}
		if (holds) return true;
	}
	return false;
};

/***
 * MARK: checkBackendCompat
 * @description Whether one candidate release may run against the backend
 *   the runner talks to. Legacy manifests without `requires` count as
 *   compatible, and an unknown backend version (no heartbeat yet, or the
 *   backend predates the advertisement) counts as compatible too — both
 *   keep today's behaviour. Anything else fails closed: an unparseable
 *   range or backend version is incompatible, never installed.
 * @example checkBackendCompat({ backendApiVersion: '1.0.0', requires: { backendApi: '>=1.0.0 <2.0.0' } }) => { compatible: true, reason: null }
 ***/
export const checkBackendCompat = ({ backendApiVersion, requires } = {}) => {
	const range = requires?.backendApi;
	if (range === undefined || range === null) return { compatible: true, reason: null };
	if (typeof range !== "string" || !range.trim()) return { compatible: true, reason: null };
	const backend = String(backendApiVersion || "").trim();
	if (!backend) return { compatible: true, reason: null };
	if (!isValidVersion(backend)) {
		return { compatible: false, reason: `backend API version '${backendApiVersion}' is not semver` };
	}
	if (!versionSatisfiesRange(backend, range)) {
		return { compatible: false, reason: `requires backendApi ${range.trim()} (backend is ${backend})` };
	}
	return { compatible: true, reason: null };
};

/***
 * MARK: filterReleaseCandidate
 * @description Pure selection filter for one verified release candidate:
 *   strictly newer than current (never downgrade), not a pre-release,
 *   backend-compatible, with an asset for this platform. Returns a coded
 *   verdict so the check flow can map it to legacy messages on the fast
 *   path and to walk summaries on the list path.
 * @example filterReleaseCandidate({ manifest: {...}, currentVersion: '0.1.0', backendApiVersion: '1.0.0', platform: 'linux', arch: 'x64' }) => { code: 'OK', asset, reason: null }
 ***/
export const filterReleaseCandidate = ({ manifest, currentVersion, backendApiVersion, platform, arch } = {}) => {
	if (isPrereleaseVersion(manifest?.version)) {
		return { code: "PRERELEASE", asset: null, reason: `version ${manifest.version} is a pre-release; v1 runners skip it` };
	}
	if (!isNewerVersion(manifest?.version, currentVersion)) {
		return { code: "NOT_NEWER", asset: null, reason: `version ${manifest?.version} is not newer than current ${currentVersion}` };
	}
	const compat = checkBackendCompat({ backendApiVersion, requires: manifest?.requires });
	if (!compat.compatible) {
		return { code: "INCOMPATIBLE", asset: null, reason: compat.reason };
	}
	const asset = assetForPlatform(manifest, { platform, arch });
	if (!asset) {
		return { code: "NO_ASSET", asset: null, reason: `no asset for ${platform}/${arch} in manifest ${manifest?.version}` };
	}
	return { code: "OK", asset, reason: null };
};

// Derives the bounded releases-list URL from a GitHub releases/latest
// pointer (`.../releases/latest` → `.../releases?per_page=N&page=P`).
// Null when the pointer is not that shape, so callers fall back to the
// latest-only behaviour instead of fetching a guessed URL.
export const githubReleasesListUrl = ({ pointerUrl, page = 1, perPage = 10 } = {}) => {
	const match = /^(https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+)\/releases\/latest\/?$/.exec(String(pointerUrl || "").trim());
	if (!match) return null;
	const safePage = Number.isInteger(page) && page > 0 ? page : 1;
	const safePerPage = Number.isInteger(perPage) && perPage > 0 && perPage <= 30 ? perPage : 10;
	return `${match[1]}/releases?per_page=${safePerPage}&page=${safePage}`;
};

// Reads the candidate version off a release tag (`runner-v1.2.3` → `1.2.3`,
// `1.2.3-rc.1` stays whole). Null when the tag carries no trailing semver —
// list entries without a readable version are skipped, never fetched blind.
export const tagVersionFor = (tag) => {
	const match = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\s*$/.exec(String(tag || "").trim());
	if (!match) return null;
	return isValidVersion(match[1]) ? match[1] : null;
};

/***
 * MARK: validateReleasesIndex
 * @description Validates a mirror `releases.json` index (newest-first list
 *   of per-release manifest pointers for air-gapped fleets). Empty lists
 *   are valid (no releases published yet); entries need a semver version
 *   plus manifest/signature URLs.
 * @example validateReleasesIndex({ schema: 1, component: 'runner', releases: [] }) => { ok: true }
 ***/
export const validateReleasesIndex = (index) => {
	if (!index || typeof index !== "object" || Array.isArray(index)) {
		return { ok: false, reason: "Releases index must be a JSON object." };
	}
	if (index.schema !== MANIFEST_SCHEMA_VERSION) {
		return { ok: false, reason: `Unsupported releases index schema ${String(index.schema)} (want ${MANIFEST_SCHEMA_VERSION}).` };
	}
	if (index.component !== "runner") {
		return { ok: false, reason: `Releases index component must be 'runner', got ${String(index.component)}.` };
	}
	if (!Array.isArray(index.releases)) {
		return { ok: false, reason: "Releases index must list 'releases'." };
	}
	for (const entry of index.releases) {
		if (!entry || typeof entry !== "object") return { ok: false, reason: "Releases index entry must be an object." };
		if (!isValidVersion(entry.version)) {
			return { ok: false, reason: `Releases index entry version is not semver: ${String(entry?.version)}.` };
		}
		for (const field of ["manifestUrl", "signatureUrl"]) {
			if (typeof entry[field] !== "string" || !entry[field].trim()) {
				return { ok: false, reason: `Releases index entry for ${entry.version} is missing '${field}'.` };
			}
		}
	}
	return { ok: true };
};

// Resolves where to fetch manifest.json / .minisig / asset bytes from.
// A full override URL ending in manifest.json (or /manifest.json) is used
// as-is (air-gapped mirror); otherwise the override is a base and the
// filenames are appended. The default GitHub API pointer is handled by
// the check flow (release assets), not here.
export const resolveUpdateUrls = ({ updateUrl, assetFilename }) => {
	const base = String(updateUrl || "").trim().replace(/\/+$/, "");
	if (!base) return null;
	if (base.endsWith("manifest.json")) {
		const prefix = base.slice(0, -"manifest.json".length);
		return {
			manifestUrl: base,
			signatureUrl: `${prefix}manifest.json.minisig`,
			assetUrl: assetFilename ? `${prefix}${assetFilename}` : null,
		};
	}
	return {
		manifestUrl: `${base}/manifest.json`,
		signatureUrl: `${base}/manifest.json.minisig`,
		assetUrl: assetFilename ? `${base}/${assetFilename}` : null,
	};
};
