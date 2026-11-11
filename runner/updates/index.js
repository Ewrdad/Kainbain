import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assetForPlatform, compareVersions, DEFAULT_RELEASES_LATEST_URL, isNewerVersion, isPrereleaseVersion, resolveUpdateUrls, satisfiesRange, validateManifest } from "./manifest.js";
import { detectUpdatePlatform } from "./platform.js";
import { verifyManifestSignature } from "./verify.js";
import { downloadVerifiedAsset, fetchText } from "./download.js";
import { acquireUpdateLock, markUpdatePendingBoot, readUpdateState } from "./state.js";

const execFileAsync = promisify(execFile);

/***
 * MARK: updateCheck
 * @description Idle-time update orchestrator for the runner self-update
 *   channel (Option A, ADR 0012). checkForUpdate pulls the release pointer
 *   (GitHub releases/latest or an air-gapped mirror base), verifies the
 *   manifest signature against the PINNED key, and returns the matching
 *   platform asset — never touching the install when nothing is newer or
 *   anything fails. Version selection is compatibility-gated: when the
 *   backend advertises `backendApiVersion` (register/heartbeat), a release
 *   whose manifest `requires.backendApi` range the backend does not satisfy
 *   is skipped, and when the backend advertises `desiredRunnerVersion`, no
 *   release above it is selected — so updates are manageable by the backend
 *   without it ever shipping runner bytes. applyUpdate downloads,
 *   re-verifies sha256, extracts to a versioned dir, and atomically flips
 *   current/previous symlinks.
 *   The caller (daemon idle branch) guarantees no active task; a lock
 *   guards overlapping invocations.
 * @example await checkForUpdate({ currentVersion: '0.1.0', config }) => { version: '0.2.0', ... } | null
 ***/
export const isGithubReleasesPointer = (updateUrl) =>
	/api\.github\.com\/repos\//.test(String(updateUrl || ""));

export const checkForUpdate = async ({
	currentVersion,
	updateUrl = DEFAULT_RELEASES_LATEST_URL,
	fetchImpl = fetch,
	// Test seam only: production always uses verifyManifestSignature with
	// the pinned key. Tests inject a verifier bound to the TEST key.
	verifyImpl = verifyManifestSignature,
	platform,
	arch,
	// Backend advertisement (from register/heartbeat); null = not managed,
	// in which case selection stays permissive latest-compatible.
	backendApiVersion = null,
	desiredRunnerVersion = null,
	logger = console,
} = {}) => {
	const detected = detectUpdatePlatform({ platform, arch });
	if (!detected.ok) {
		logger.warn?.(`Runner update: ${detected.reason} (${platform}/${arch}); skipping check.`);
		return { ok: false, reason: detected.reason };
	}
	if (!String(updateUrl || "").trim()) {
		return { ok: false, reason: "Update URL is empty; set KAINBAIN_RUNNER_UPDATE_URL or restore the default release pointer." };
	}
	let manifestText;
	let signatureText;
	let releaseMeta = null;
	// Any fetch failure (backend down, mirror unreachable, hung socket
	// past the timeout) is a failed check, never a throw: the caller keeps
	// running the old version and retries on the next idle interval.
	try {
		if (isGithubReleasesPointer(updateUrl)) {
			const pointerText = await fetchText({ url: updateUrl, fetchImpl, accept: "application/vnd.github+json" });
			try {
				releaseMeta = JSON.parse(pointerText);
			} catch {
				return { ok: false, reason: "Release pointer is not valid JSON." };
			}
			if (releaseMeta?.prerelease === true || isPrereleaseVersion(releaseMeta?.tag_name)) {
				return { ok: true, update: null, reason: "Latest release is a pre-release; v1 runners skip it." };
			}
			const assets = Array.isArray(releaseMeta?.assets) ? releaseMeta.assets : [];
			const manifestAsset = assets.find((a) => a?.name === "manifest.json");
			const sigAsset = assets.find((a) => a?.name === "manifest.json.minisig");
			if (!manifestAsset?.browser_download_url || !sigAsset?.browser_download_url) {
				return { ok: false, reason: "Latest release has no manifest.json / manifest.json.minisig assets." };
			}
			[manifestText, signatureText] = await Promise.all([
				fetchText({ url: manifestAsset.browser_download_url, fetchImpl, accept: "application/json" }),
				fetchText({ url: sigAsset.browser_download_url, fetchImpl, accept: "text/plain" }),
			]);
		} else {
			const urls = resolveUpdateUrls({ updateUrl });
			if (!urls) return { ok: false, reason: "Update URL is empty; set KAINBAIN_RUNNER_UPDATE_URL or restore the default release pointer." };
			[manifestText, signatureText] = await Promise.all([
				fetchText({ url: urls.manifestUrl, fetchImpl, accept: "application/json" }),
				fetchText({ url: urls.signatureUrl, fetchImpl, accept: "text/plain" }),
			]);
		}
	} catch (err) {
		return { ok: false, reason: `Update check failed: ${err?.message || err}` };
	}
	const manifestBytes = Buffer.from(manifestText, "utf8");
	const verified = verifyImpl({ manifestBytes, signatureText });
	if (!verified.ok) return { ok: false, reason: verified.reason };
	let manifest;
	try {
		manifest = JSON.parse(manifestText);
	} catch {
		return { ok: false, reason: "Manifest is not valid JSON." };
	}
	const schema = validateManifest(manifest);
	if (!schema.ok) return { ok: false, reason: schema.reason };
	if (isPrereleaseVersion(manifest.version)) {
		return { ok: true, update: null, manifest, reason: "Manifest version is a pre-release; v1 runners skip it." };
	}
	// Backend compatibility gate: a release whose `requires.backendApi` range
	// this backend's apiVersion does not satisfy is never selected. When the
	// backend does not advertise its apiVersion (old backend), the gate is
	// permissive — the old latest-only behavior.
	const requiresBackendApi = manifest?.requires?.backendApi;
	if (
		typeof requiresBackendApi === "string" &&
		requiresBackendApi.trim() &&
		typeof backendApiVersion === "string" &&
		backendApiVersion.trim() &&
		!satisfiesRange(backendApiVersion, requiresBackendApi)
	) {
		return {
			ok: true,
			update: null,
			manifest,
			reason: `Release ${manifest.version} requires backendApi '${requiresBackendApi}' but this backend is ${backendApiVersion} — staying on the current version.`,
		};
	}
	// Backend-managed desired-version cap: never update past the version the
	// backend manages as desired (the fleet converges to it, no further).
	if (
		typeof desiredRunnerVersion === "string" &&
		desiredRunnerVersion.trim() &&
		compareVersions(manifest.version, desiredRunnerVersion) === 1
	) {
		return {
			ok: true,
			update: null,
			manifest,
			reason: `Backend desired runner version is ${desiredRunnerVersion}; release ${manifest.version} is above it — skipped.`,
		};
	}
	if (!isNewerVersion(manifest.version, currentVersion)) {
		return { ok: true, update: null, manifest, reason: "Already on the latest version." };
	}
	const asset = assetForPlatform(manifest, { platform: detected.platform, arch: detected.arch });
	if (!asset) {
		return { ok: true, update: null, manifest, reason: `No asset for ${detected.platform}/${detected.arch} in manifest ${manifest.version}.` };
	}
	return { ok: true, update: { version: manifest.version, manifest, asset, releaseMeta }, manifest };
};

const extractTarball = async ({ archivePath, destDir }) => {
	fs.mkdirSync(destDir, { recursive: true });
	await execFileAsync("tar", ["-xzf", archivePath, "-C", destDir]);
};

export const applyUpdate = async ({
	update,
	installRoot,
	updateUrl = DEFAULT_RELEASES_LATEST_URL,
	fetchImpl = fetch,
	extractImpl = extractTarball,
	logger = console,
} = {}) => {
	if (!update?.asset || !update?.manifest) {
		throw Object.assign(new Error("applyUpdate needs a checked update (manifest + asset)."), { code: "INVALID_ARGS" });
	}
	const release = acquireUpdateLock(installRoot);
	if (!release) {
		throw Object.assign(new Error("Another updater holds the update lock."), { code: "UPDATE_IN_PROGRESS" });
	}
	try {
		const versionDir = path.join(installRoot, "releases", update.version);
		let assetUrl;
		if (isGithubReleasesPointer(updateUrl)) {
			const assets = Array.isArray(update.releaseMeta?.assets) ? update.releaseMeta.assets : [];
			assetUrl = assets.find((a) => a?.name === update.asset.filename)?.browser_download_url || null;
		} else {
			assetUrl = resolveUpdateUrls({ updateUrl, assetFilename: update.asset.filename }).assetUrl;
		}
		if (!assetUrl) {
			throw Object.assign(new Error(`No download URL for ${update.asset.filename}.`), { code: "NO_ASSET_URL" });
		}
		const { path: archivePath } = await downloadVerifiedAsset({
			url: assetUrl,
			destDir: versionDir,
			filename: update.asset.filename,
			expectedSha256: update.asset.sha256,
			fetchImpl,
		});
		const unpackedDir = path.join(versionDir, "unpacked");
		fs.rmSync(unpackedDir, { recursive: true, force: true });
		await extractImpl({ archivePath, destDir: unpackedDir });
		// Normalize single-top-level-dir archives (tar convention) so the
		// active tree always has version.json at its root.
		if (!fs.existsSync(path.join(unpackedDir, "version.json"))) {
			const entries = fs.readdirSync(unpackedDir);
			if (entries.length === 1) {
				const inner = path.join(unpackedDir, entries[0]);
				if (fs.statSync(inner).isDirectory() && fs.existsSync(path.join(inner, "version.json"))) {
					const stage = path.join(versionDir, "unpacked.stage");
					fs.rmSync(stage, { recursive: true, force: true });
					fs.renameSync(inner, stage);
					fs.rmSync(unpackedDir, { recursive: true, force: true });
					fs.renameSync(stage, unpackedDir);
				}
			}
		}
		// Sanity: the extracted tree must self-identify as the version we
		// verified. A mismatch means the packager shipped the wrong tree.
		try {
			const extractedVersion = JSON.parse(fs.readFileSync(path.join(unpackedDir, "version.json"), "utf8"));
			const got = String(extractedVersion?.runnerVersion || "").trim().replace(/^v/, "");
			if (got && got !== String(update.version).replace(/^v/, "")) {
				throw new Error(`extracted version.json runnerVersion ${got} != manifest version ${update.version}`);
			}
		} catch (err) {
			if (err?.code === "VERSION_MISMATCH" || /runnerVersion/.test(err?.message || "")) throw err;
			// No version.json in the archive: warn, do not block (dev mirrors).
			logger.warn?.(`Runner update: no version.json in unpacked tree (${err?.message || err}).`);
		}
		fs.writeFileSync(path.join(versionDir, "manifest.json"), JSON.stringify(update.manifest));
		const previousTarget = (() => {
			try { return fs.readlinkSync(path.join(installRoot, "current")); } catch { return null; }
		})();
		markUpdatePendingBoot({ installRoot, from: previousTarget, to: update.version });
		const tmpLink = path.join(installRoot, "current.tmp");
		try { fs.rmSync(tmpLink, { force: true }); } catch { /* ignore */ }
		fs.symlinkSync(unpackedDir, tmpLink);
		fs.renameSync(tmpLink, path.join(installRoot, "current"));
		if (previousTarget && previousTarget !== unpackedDir) {
			const prevLink = path.join(installRoot, "previous.tmp");
			try { fs.rmSync(prevLink, { force: true }); } catch { /* ignore */ }
			fs.symlinkSync(previousTarget, prevLink);
			fs.renameSync(prevLink, path.join(installRoot, "previous"));
		}
		logger.log?.(`Runner update: ${update.version} staged; restart to boot it (rollback kept at previous).`);
		return { ok: true, version: update.version, installRoot, unpackedDir, restartRequired: true };
	} finally {
		release();
	}
};

export const currentUpdateStatus = ({ installRoot } = {}) => readUpdateState(installRoot);
