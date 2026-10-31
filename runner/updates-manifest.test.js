import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	assetForPlatform,
	compareVersions,
	isNewerVersion,
	isPrereleaseVersion,
	isValidVersion,
	resolveUpdateUrls,
	validateManifest,
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
