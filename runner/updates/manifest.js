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

const RANGE_CLAUSE_RE = /^(>=|<=|>|<|=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

/***
 * MARK: satisfiesRange
 * @description Minimal semver-range check for the `requires.backendApi`
 *   manifest field: a whitespace-separated list of clauses (`>=1.0.0`,
 *   `<2.0.0`, `=1.2.3`, or a bare version = exact), all of which must hold.
 *   The vocabulary matches `api/version.json` `accepts` / `runner/version.json`
 *   `requires` (e.g. `>=1.0.0 <2.0.0`). Unknown clause shapes fail closed
 *   (false) so a malformed range never lets an incompatible release through.
 * @example satisfiesRange('1.2.0', '>=1.0.0 <2.0.0') => true
 * @example satisfiesRange('2.0.0', '>=1.0.0 <2.0.0') => false
 ***/
export const satisfiesRange = (version, range) => {
	if (!isValidVersion(version) || typeof range !== "string" || !range.trim()) {
		return false;
	}
	for (const clause of range.trim().split(/\s+/)) {
		const match = RANGE_CLAUSE_RE.exec(clause);
		if (!match) return false;
		const op = match[1] || "=";
		const cmp = compareVersions(version, match[2]);
		if (cmp === null) return false;
		const ok =
			op === ">=" ? cmp >= 0
			: op === "<=" ? cmp <= 0
			: op === ">" ? cmp > 0
			: op === "<" ? cmp < 0
			: cmp === 0;
		if (!ok) return false;
	}
	return true;
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
	// Additive v1 extension: `requires.backendApi` (semver range) lets the
	// backend gate which runner releases its apiVersion supports. Absent on
	// old manifests — accepted unchanged.
	if (manifest.requires !== undefined) {
		if (!manifest.requires || typeof manifest.requires !== "object" || Array.isArray(manifest.requires)) {
			return { ok: false, reason: "Manifest 'requires' must be an object when present." };
		}
		if (
			manifest.requires.backendApi !== undefined &&
			(typeof manifest.requires.backendApi !== "string" || !manifest.requires.backendApi.trim())
		) {
			return { ok: false, reason: "Manifest requires.backendApi must be a non-empty semver range string." };
		}
	}
	return { ok: true };
};

export const assetForPlatform = (manifest, { platform, arch }) => {
	const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
	return assets.find((a) => a?.platform === platform && a?.arch === arch) || null;
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
