import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_RELEASES_LATEST_URL, filterReleaseCandidate, githubReleasesListUrl, isNewerVersion, isPrereleaseVersion, resolveUpdateUrls, tagVersionFor, validateManifest, validateReleasesIndex } from "./manifest.js";
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
 *   manifest signature against the PINNED key, and returns the newest
 *   release that is strictly newer, backend-compatible (manifest
 *   `requires.backendApi` admits the backend API version the daemon
 *   learned from heartbeats), and carries this platform's asset — never
 *   touching the install when nothing qualifies or anything fails. When
 *   latest verifies but is incompatible, the GitHub path walks the bounded
 *   releases list (newest-first) and mirror bases walk `releases.json` for
 *   the newest older release that qualifies. applyUpdate downloads,
 *   re-verifies sha256, extracts to a versioned dir, and atomically flips
 *   current/previous symlinks. The caller (daemon idle branch) guarantees
 *   no active task; a lock guards overlapping invocations.
 * @example await checkForUpdate({ currentVersion: '0.1.0', config }) => { version: '0.2.0', ... } | null
 ***/
export const isGithubReleasesPointer = (updateUrl) =>
	/api\.github\.com\/repos\//.test(String(updateUrl || ""));

// Fetches + verifies + parses one candidate manifest. Verification order
// is fixed (signature → schema) and a candidate's `requires` is trusted
// only after its signature verifies. Returns { ok, manifest } or
// { ok: false, reason } — fetch/verify/schema failures abort the check
// (fail closed, retry next interval), never skip to an older release.
const loadVerifiedManifest = async ({ manifestUrl, signatureUrl, fetchImpl, verifyImpl }) => {
	let manifestText;
	let signatureText;
	try {
		[manifestText, signatureText] = await Promise.all([
			fetchText({ url: manifestUrl, fetchImpl, accept: "application/json" }),
			fetchText({ url: signatureUrl, fetchImpl, accept: "text/plain" }),
		]);
	} catch (err) {
		return { ok: false, reason: `Update check failed: ${err?.message || err}` };
	}
	const verified = verifyImpl({ manifestBytes: Buffer.from(manifestText, "utf8"), signatureText });
	if (!verified.ok) return { ok: false, reason: verified.reason };
	let manifest;
	try {
		manifest = JSON.parse(manifestText);
	} catch {
		return { ok: false, reason: "Manifest is not valid JSON." };
	}
	const schema = validateManifest(manifest);
	if (!schema.ok) return { ok: false, reason: schema.reason };
	return { ok: true, manifest };
};

// Maps a filter verdict to the legacy fast-path messages (pinned by the
// check suites). INCOMPATIBLE has no legacy message: the GitHub path
// walks older releases for a compatible one, the mirror single-pin path
// reports it.
const legacyFilterReason = ({ code, reason, manifest, detected }) => {
	if (code === "PRERELEASE") return "Manifest version is a pre-release; v1 runners skip it.";
	if (code === "NOT_NEWER") return "Already on the latest version.";
	if (code === "NO_ASSET") return `No asset for ${detected.platform}/${detected.arch} in manifest ${manifest.version}.`;
	return `Release ${manifest.version} is not compatible with this backend: ${reason}.`;
};

const checkGithubForUpdate = async ({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion, logger }) => {
	let releaseMeta = null;
	// Any fetch failure (backend down, mirror unreachable, hung socket
	// past the timeout) is a failed check, never a throw: the caller keeps
	// running the old version and retries on the next idle interval.
	try {
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
		const loaded = await loadVerifiedManifest({
			manifestUrl: manifestAsset.browser_download_url,
			signatureUrl: sigAsset.browser_download_url,
			fetchImpl,
			verifyImpl,
		});
		if (!loaded.ok) return loaded;
		const manifest = loaded.manifest;
		const verdict = filterReleaseCandidate({
			manifest,
			currentVersion,
			backendApiVersion,
			platform: detected.platform,
			arch: detected.arch,
		});
		if (verdict.code === "OK") {
			return { ok: true, update: { version: manifest.version, manifest, asset: verdict.asset, releaseMeta, sourceUrl: null }, manifest };
		}
		if (verdict.code !== "INCOMPATIBLE") {
			return { ok: true, update: null, manifest, reason: legacyFilterReason({ code: verdict.code, reason: verdict.reason, manifest, detected }) };
		}
		// Fast path done: latest exists and verifies but cannot run against
		// this backend. Walk the bounded releases list (newest-first) for
		// the newest older release that can.
		const listUrl = githubReleasesListUrl({ pointerUrl: updateUrl });
		if (!listUrl) {
			return { ok: true, update: null, manifest, reason: `Latest release ${manifest.version} is incompatible (${verdict.reason}); cannot list older releases from this pointer.` };
		}
		let entries;
		try {
			entries = JSON.parse(await fetchText({ url: listUrl, fetchImpl, accept: "application/vnd.github+json" }));
		} catch (err) {
			return { ok: false, reason: `Update check failed: could not list releases to find a compatible version (${err?.message || err}).` };
		}
		if (!Array.isArray(entries)) {
			return { ok: false, reason: "Release list is not valid JSON." };
		}
		const seen = new Set([String(manifest.version)]);
		let examined = 0;
		for (const entry of entries) {
			if (!entry || typeof entry !== "object" || entry.draft === true) continue;
			if (entry.prerelease === true || isPrereleaseVersion(entry.tag_name)) continue;
			const tagVersion = tagVersionFor(entry.tag_name);
			// No readable version (backend/frontend releases in the same
			// repo, manual tags): skip without fetching anything blind.
			if (!tagVersion) continue;
			if (seen.has(tagVersion)) continue;
			seen.add(tagVersion);
			// Cheap pre-filters before any download: version ordering needs
			// no network, and the manifest re-checks after verify (a lying
			// tag cannot promote or hide a release).
			if (!isNewerVersion(tagVersion, currentVersion)) continue;
			const entryAssets = Array.isArray(entry.assets) ? entry.assets : [];
			const entryManifest = entryAssets.find((a) => a?.name === "manifest.json");
			const entrySig = entryAssets.find((a) => a?.name === "manifest.json.minisig");
			if (!entryManifest?.browser_download_url || !entrySig?.browser_download_url) continue;
			examined += 1;
			const candidate = await loadVerifiedManifest({
				manifestUrl: entryManifest.browser_download_url,
				signatureUrl: entrySig.browser_download_url,
				fetchImpl,
				verifyImpl,
			});
			if (!candidate.ok) return candidate;
			const candidateVerdict = filterReleaseCandidate({
				manifest: candidate.manifest,
				currentVersion,
				backendApiVersion,
				platform: detected.platform,
				arch: detected.arch,
			});
			if (candidateVerdict.code === "OK") {
				return {
					ok: true,
					update: { version: candidate.manifest.version, manifest: candidate.manifest, asset: candidateVerdict.asset, releaseMeta: entry, sourceUrl: null },
					manifest: candidate.manifest,
				};
			}
		}
		const backendLabel = String(backendApiVersion || "").trim() || "unknown";
		return {
			ok: true,
			update: null,
			manifest,
			reason: `No compatible release newer than ${currentVersion} (backend API ${backendLabel}): latest ${manifest.version} incompatible (${verdict.reason}); checked ${examined} older release(s).`,
		};
	} catch (err) {
		return { ok: false, reason: `Update check failed: ${err?.message || err}` };
	}
};

const checkSingleMirrorManifest = async ({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion }) => {
	const urls = resolveUpdateUrls({ updateUrl });
	if (!urls) return { ok: false, reason: "Update URL is empty; set KAINBAIN_RUNNER_UPDATE_URL or restore the default release pointer." };
	const loaded = await loadVerifiedManifest({
		manifestUrl: urls.manifestUrl,
		signatureUrl: urls.signatureUrl,
		fetchImpl,
		verifyImpl,
	});
	if (!loaded.ok) return loaded;
	const manifest = loaded.manifest;
	const verdict = filterReleaseCandidate({
		manifest,
		currentVersion,
		backendApiVersion,
		platform: detected.platform,
		arch: detected.arch,
	});
	if (verdict.code === "OK") {
		return { ok: true, update: { version: manifest.version, manifest, asset: verdict.asset, releaseMeta: null, sourceUrl: updateUrl }, manifest };
	}
	return { ok: true, update: null, manifest, reason: legacyFilterReason({ code: verdict.code, reason: verdict.reason, manifest, detected }) };
};

const checkMirrorForUpdate = async ({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion, logger }) => {
	// A full manifest.json URL is an explicit operator pin: one candidate,
	// still compat-filtered, never a list walk.
	if (String(updateUrl || "").trim().replace(/\/+$/, "").endsWith("manifest.json")) {
		try {
			return await checkSingleMirrorManifest({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion });
		} catch (err) {
			return { ok: false, reason: `Update check failed: ${err?.message || err}` };
		}
	}
	const base = String(updateUrl || "").trim().replace(/\/+$/, "");
	let indexText;
	try {
		indexText = await fetchText({ url: `${base}/releases.json`, fetchImpl, accept: "application/json" });
	} catch (err) {
		// No index on the mirror (404): a legacy single-manifest mirror,
		// behave exactly as before. Any other failure is loud.
		if (err?.statusCode === 404) {
			try {
				return await checkSingleMirrorManifest({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion });
			} catch (fallbackErr) {
				return { ok: false, reason: `Update check failed: ${fallbackErr?.message || fallbackErr}` };
			}
		}
		return { ok: false, reason: `Update check failed: ${err?.message || err}` };
	}
	let index;
	try {
		index = JSON.parse(indexText);
	} catch {
		return { ok: false, reason: "Releases index is not valid JSON." };
	}
	const valid = validateReleasesIndex(index);
	if (!valid.ok) return { ok: false, reason: valid.reason };
	if (index.releases.length === 0) {
		return { ok: true, update: null, reason: "Mirror lists no releases yet." };
	}
	let examined = 0;
	let lastSkip = "no listed release is newer than current";
	for (const entry of index.releases) {
		// Cheap pre-filters before any download; the manifest re-checks
		// after verify, so a lying index entry cannot hide a release.
		if (isPrereleaseVersion(entry.version)) {
			lastSkip = `listed ${entry.version} is a pre-release; v1 runners skip it`;
			continue;
		}
		if (!isNewerVersion(entry.version, currentVersion)) {
			lastSkip = `listed ${entry.version} is not newer than current ${currentVersion}`;
			continue;
		}
		examined += 1;
		const candidate = await loadVerifiedManifest({
			manifestUrl: entry.manifestUrl,
			signatureUrl: entry.signatureUrl,
			fetchImpl,
			verifyImpl,
		});
		if (!candidate.ok) return candidate;
		const verdict = filterReleaseCandidate({
			manifest: candidate.manifest,
			currentVersion,
			backendApiVersion,
			platform: detected.platform,
			arch: detected.arch,
		});
		if (verdict.code === "OK") {
			return {
				ok: true,
				update: { version: candidate.manifest.version, manifest: candidate.manifest, asset: verdict.asset, releaseMeta: null, sourceUrl: entry.manifestUrl },
				manifest: candidate.manifest,
			};
		}
		lastSkip = `listed ${candidate.manifest.version} skipped: ${verdict.reason}`;
	}
	const backendLabel = String(backendApiVersion || "").trim() || "unknown";
	return {
		ok: true,
		update: null,
		reason: `No compatible release newer than ${currentVersion} (backend API ${backendLabel}): checked ${examined} listed release(s); ${lastSkip}.`,
	};
};

export const checkForUpdate = async ({
	currentVersion,
	updateUrl = DEFAULT_RELEASES_LATEST_URL,
	fetchImpl = fetch,
	// Test seam only: production always uses verifyManifestSignature with
	// the pinned key. Tests inject a verifier bound to the TEST key.
	verifyImpl = verifyManifestSignature,
	platform,
	arch,
	logger = console,
	// Backend API version learned from heartbeat/register responses; null
	// when unknown (no heartbeat yet). Null keeps today's behaviour (no
	// compat gating); a known version gates selection to releases whose
	// manifest `requires.backendApi` admits it.
	backendApiVersion = null,
} = {}) => {
	const detected = detectUpdatePlatform({ platform, arch });
	if (!detected.ok) {
		logger.warn?.(`Runner update: ${detected.reason} (${platform}/${arch}); skipping check.`);
		return { ok: false, reason: detected.reason };
	}
	if (!String(updateUrl || "").trim()) {
		return { ok: false, reason: "Update URL is empty; set KAINBAIN_RUNNER_UPDATE_URL or restore the default release pointer." };
	}
	if (isGithubReleasesPointer(updateUrl)) {
		return checkGithubForUpdate({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion, logger });
	}
	return checkMirrorForUpdate({ currentVersion, updateUrl, fetchImpl, verifyImpl, detected, backendApiVersion, logger });
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
			// Index-selected candidates resolve assets beside their own
			// manifest URL (per-release mirror dirs); single-manifest
			// checks stash the same updateUrl, and hand-built updates
			// (tests) fall back to updateUrl when sourceUrl is absent.
			const base = typeof update.sourceUrl === "string" && update.sourceUrl.trim() ? update.sourceUrl : updateUrl;
			assetUrl = resolveUpdateUrls({ updateUrl: base, assetFilename: update.asset.filename }).assetUrl;
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
		// Host-installed runtime extras (the pi SDK under api/node_modules,
		// installed per INSTALL.txt) ship in no archive: carry them over
		// from the tree being replaced, or a self-update would silently
		// break pi-serving hosts on the new tree. Best-effort and never
		// fatal — a copy failure warns and the update proceeds.
		try {
			if (previousTarget) {
				const prevRoot = path.resolve(installRoot, previousTarget);
				const prevModules = path.join(prevRoot, "api", "node_modules");
				const nextModules = path.join(unpackedDir, "api", "node_modules");
				if (prevRoot !== path.resolve(unpackedDir) && fs.existsSync(prevModules) && !fs.existsSync(nextModules)) {
					fs.cpSync(prevModules, nextModules, { recursive: true });
					logger.log?.("Runner update: carried api/node_modules over from the previous tree.");
				}
			}
		} catch (err) {
			logger.warn?.(`Runner update: could not carry api/node_modules over (${err?.message || err}); continuing without it.`);
		}
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
