import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	assetForPlatform,
	checkBackendCompat,
	compareVersions,
	filterReleaseCandidate,
	githubReleasesListUrl,
	isNewerVersion,
	isPrereleaseVersion,
	isValidVersion,
	resolveUpdateUrls,
	tagVersionFor,
	validateManifest,
	validateReleasesIndex,
	versionSatisfiesRange,
} from "./updates/manifest.js";
import { fixtureManifest } from "./updates/testkey.js";

describe("compareVersions", () => {
	it("orders releases numerically, not lexically", () => {
		assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
		assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
		assert.equal(compareVersions("1.2.4", "1.2.3"), 1);
		assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
	});

	it("ranks a release above its own prerelease", () => {
		assert.equal(compareVersions("1.2.3", "1.2.3-rc.1"), 1);
		assert.equal(compareVersions("1.2.3-rc.1", "1.2.3"), -1);
	});

	it("returns null for non-semver input", () => {
		assert.equal(compareVersions("nope", "1.0.0"), null);
		assert.equal(isValidVersion("1.0"), false);
		assert.equal(isValidVersion("v1.2.3"), true);
	});
});

describe("isNewerVersion / isPrereleaseVersion", () => {
	it("detects newer versions only", () => {
		assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
		assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
		assert.equal(isNewerVersion("0.0.9", "0.1.0"), false);
	});

	it("flags prereleases", () => {
		assert.equal(isPrereleaseVersion("1.0.0-rc.1"), true);
		assert.equal(isPrereleaseVersion("1.0.0"), false);
	});
});

describe("validateManifest", () => {
	it("accepts a well-formed manifest", () => {
		assert.deepEqual(validateManifest(fixtureManifest()).ok, true);
	});

	it("rejects wrong schema, component, version, and assets", () => {
		assert.equal(validateManifest({ ...fixtureManifest(), schema: 2 }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), component: "backend" }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), version: "soon" }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), assets: [] }).ok, false);
		assert.equal(validateManifest(null).ok, false);
	});

	it("rejects assets with malformed sha256 or size", () => {
		const bad = fixtureManifest();
		bad.assets = [{ ...bad.assets[0], sha256: "zzzz" }];
		assert.equal(validateManifest(bad).ok, false);
		const badSize = fixtureManifest();
		badSize.assets = [{ ...badSize.assets[0], size: -1 }];
		assert.equal(validateManifest(badSize).ok, false);
	});
});

describe("assetForPlatform / resolveUpdateUrls", () => {
	it("picks the matching asset", () => {
		const asset = assetForPlatform(fixtureManifest(), { platform: "darwin", arch: "arm64" });
		assert.equal(asset?.filename, "kainbain-runner-0.2.0-darwin-arm64.tar.gz");
		assert.equal(assetForPlatform(fixtureManifest(), { platform: "win32", arch: "x64" }), null);
	});

	it("treats a manifest.json URL as the direct pointer", () => {
		const urls = resolveUpdateUrls({ updateUrl: "https://mirror.local/r/manifest.json", assetFilename: "a.tar.gz" });
		assert.equal(urls.manifestUrl, "https://mirror.local/r/manifest.json");
		assert.equal(urls.signatureUrl, "https://mirror.local/r/manifest.json.minisig");
		assert.equal(urls.assetUrl, "https://mirror.local/r/a.tar.gz");
	});

	it("treats other URLs as a mirror base", () => {
		const urls = resolveUpdateUrls({ updateUrl: "https://mirror.local/r/", assetFilename: "a.tar.gz" });
		assert.equal(urls.manifestUrl, "https://mirror.local/r/manifest.json");
		assert.equal(urls.assetUrl, "https://mirror.local/r/a.tar.gz");
	});
});

describe("validateManifest requires", () => {
	it("accepts legacy manifests without requires", () => {
		const legacy = fixtureManifest();
		delete legacy.requires;
		assert.equal(validateManifest(legacy).ok, true);
	});

	it("accepts a well-formed requires.backendApi range", () => {
		const manifest = fixtureManifest({ requires: { backendApi: ">=1.0.0 <2.0.0" } });
		assert.equal(validateManifest(manifest).ok, true);
	});

	it("rejects a malformed requires shape", () => {
		assert.equal(validateManifest({ ...fixtureManifest(), requires: ">=1.0.0" }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), requires: {} }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), requires: { backendApi: "" } }).ok, false);
		assert.equal(validateManifest({ ...fixtureManifest(), requires: { backendApi: 42 } }).ok, false);
	});
});

describe("versionSatisfiesRange", () => {
	it("evaluates the repo's own range vocabulary", () => {
		assert.equal(versionSatisfiesRange("1.0.0", ">=1.0.0 <2.0.0"), true);
		assert.equal(versionSatisfiesRange("1.9.9", ">=1.0.0 <2.0.0"), true);
		assert.equal(versionSatisfiesRange("2.0.0", ">=1.0.0 <2.0.0"), false);
		assert.equal(versionSatisfiesRange("0.9.9", ">=1.0.0 <2.0.0"), false);
		assert.equal(versionSatisfiesRange("1.2.3", "1.2.3"), true);
		assert.equal(versionSatisfiesRange("1.2.4", "1.2.3"), false);
		assert.equal(versionSatisfiesRange("1.5.0", ">1.0.0 <=2.0.0"), true);
		assert.equal(versionSatisfiesRange("1.0.0", ">1.0.0 <=2.0.0"), false);
	});

	it("supports || alternation", () => {
		assert.equal(versionSatisfiesRange("1.0.0", ">=2.0.0 <3.0.0 || >=1.0.0 <2.0.0"), true);
		assert.equal(versionSatisfiesRange("3.0.0", ">=2.0.0 <3.0.0 || >=1.0.0 <2.0.0"), false);
	});

	it("reads unsupported or malformed ranges as unsatisfied (fail closed)", () => {
		assert.equal(versionSatisfiesRange("1.5.0", "^1.0.0"), false);
		assert.equal(versionSatisfiesRange("1.5.0", "~1.0.0"), false);
		assert.equal(versionSatisfiesRange("1.5.0", "1.0.0 - 2.0.0"), false);
		assert.equal(versionSatisfiesRange("1.5.0", ">=1.0"), false);
		assert.equal(versionSatisfiesRange("1.5.0", ""), false);
		assert.equal(versionSatisfiesRange("nope", ">=1.0.0 <2.0.0"), false);
	});
});

describe("checkBackendCompat", () => {
	it("treats legacy manifests and unknown backends as compatible", () => {
		assert.deepEqual(checkBackendCompat({ backendApiVersion: "1.0.0", requires: undefined }), { compatible: true, reason: null });
		assert.deepEqual(checkBackendCompat({ backendApiVersion: null, requires: { backendApi: ">=2.0.0 <3.0.0" } }), { compatible: true, reason: null });
		assert.deepEqual(checkBackendCompat({ backendApiVersion: "", requires: { backendApi: ">=2.0.0 <3.0.0" } }), { compatible: true, reason: null });
	});

	it("gates on the range when both sides are known", () => {
		assert.equal(checkBackendCompat({ backendApiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }).compatible, true);
		const blocked = checkBackendCompat({ backendApiVersion: "1.0.0", requires: { backendApi: ">=2.0.0 <3.0.0" } });
		assert.equal(blocked.compatible, false);
		assert.match(blocked.reason, /requires backendApi/);
		assert.match(blocked.reason, /1\.0\.0/);
	});

	it("fails closed on unparseable ranges and versions", () => {
		assert.equal(checkBackendCompat({ backendApiVersion: "1.0.0", requires: { backendApi: "^1.0.0" } }).compatible, false);
		assert.equal(checkBackendCompat({ backendApiVersion: "eventually", requires: { backendApi: ">=1.0.0 <2.0.0" } }).compatible, false);
	});
});

describe("filterReleaseCandidate", () => {
	const candidate = (overrides = {}) =>
		filterReleaseCandidate({
			manifest: fixtureManifest({ version: "0.2.0", ...overrides.manifest }),
			currentVersion: "0.1.0",
			backendApiVersion: "1.0.0",
			platform: "linux",
			arch: "x64",
			...overrides.filter,
		});

	it("selects a newer compatible release with a platform asset", () => {
		const got = candidate({ manifest: { requires: { backendApi: ">=1.0.0 <2.0.0" } } });
		assert.equal(got.code, "OK");
		assert.equal(got.asset?.filename, "kainbain-runner-0.2.0-linux-x64.tar.gz");
	});

	it("never downgrades and skips pre-releases", () => {
		assert.equal(candidate({ manifest: { version: "0.1.0" } }).code, "NOT_NEWER");
		assert.equal(candidate({ manifest: { version: "0.0.9" } }).code, "NOT_NEWER");
		assert.equal(candidate({ manifest: { version: "0.3.0-rc.1" } }).code, "PRERELEASE");
	});

	it("skips incompatible releases and missing assets", () => {
		assert.equal(candidate({ manifest: { requires: { backendApi: ">=2.0.0 <3.0.0" } } }).code, "INCOMPATIBLE");
		assert.equal(candidate({ filter: { platform: "win32", arch: "x64" } }).code, "NO_ASSET");
	});
});

describe("githubReleasesListUrl / tagVersionFor", () => {
	it("derives the bounded list URL from the default pointer", () => {
		assert.equal(
			githubReleasesListUrl({ pointerUrl: "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest" }),
			"https://api.github.com/repos/Ewrdad/Kainbain/releases?per_page=10&page=1",
		);
		assert.equal(githubReleasesListUrl({ pointerUrl: "http://mirror.local/r" }), null);
		assert.equal(githubReleasesListUrl({ pointerUrl: "https://api.github.com/repos/o/r/releases/latest/" }), "https://api.github.com/repos/o/r/releases?per_page=10&page=1");
	});

	it("reads versions off runner tags, null when unreadable", () => {
		assert.equal(tagVersionFor("runner-v1.2.3"), "1.2.3");
		assert.equal(tagVersionFor("runner-v1.2.3-rc.1"), "1.2.3-rc.1");
		assert.equal(tagVersionFor("backend-v1.2.3"), "1.2.3");
		assert.equal(tagVersionFor("nightly"), null);
		assert.equal(tagVersionFor(null), null);
	});
});

describe("validateReleasesIndex", () => {
	const entry = (overrides = {}) => ({
		version: "0.2.0",
		manifestUrl: "https://mirror.local/r/0.2.0/manifest.json",
		signatureUrl: "https://mirror.local/r/0.2.0/manifest.json.minisig",
		...overrides,
	});

	it("accepts a well-formed index and an empty one", () => {
		assert.equal(validateReleasesIndex({ schema: 1, component: "runner", releases: [entry()] }).ok, true);
		assert.equal(validateReleasesIndex({ schema: 1, component: "runner", releases: [] }).ok, true);
	});

	it("rejects malformed indexes and entries", () => {
		assert.equal(validateReleasesIndex(null).ok, false);
		assert.equal(validateReleasesIndex({ schema: 2, component: "runner", releases: [] }).ok, false);
		assert.equal(validateReleasesIndex({ schema: 1, component: "backend", releases: [] }).ok, false);
		assert.equal(validateReleasesIndex({ schema: 1, component: "runner" }).ok, false);
		assert.equal(validateReleasesIndex({ schema: 1, component: "runner", releases: [entry({ version: "soon" })] }).ok, false);
		assert.equal(validateReleasesIndex({ schema: 1, component: "runner", releases: [entry({ manifestUrl: "" })] }).ok, false);
	});
});
