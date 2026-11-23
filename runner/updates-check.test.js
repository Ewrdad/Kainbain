import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { applyUpdate, checkForUpdate } from "./updates/index.js";
import { fetchText } from "./updates/download.js";
import { sha256HexOf, verifyManifestSignature } from "./updates/verify.js";
import { fixtureManifest, signTestManifest, TEST_PUBLIC_KEY } from "./updates/testkey.js";

const verifyWithTestKey = ({ manifestBytes, signatureText }) =>
	verifyManifestSignature({ manifestBytes, signatureText, publicKey: TEST_PUBLIC_KEY });

// The orchestrator pins the RELEASE key; these tests swap the pinned key
// for the test key by monkey-patching the verify module's export through
// the manifest/signature path: sign with the test key and pass the test
// public key via fetch of a mirror base is not enough — instead we build
// the mirror responses and pre-seed `process` indirection is avoided by
// testing checkForUpdate's failure modes (tamper) against the real pinned
// key, and testing the success path via applyUpdate with a hand-built
// update object.
describe("checkForUpdate (mirror base)", () => {
	const manifest = fixtureManifest({ version: "0.2.0" });
	const manifestText = JSON.stringify(manifest);

	const mirrorFetch = async (url) => {
		if (String(url).endsWith("manifest.json")) {
			return { ok: true, status: 200, text: async () => manifestText };
		}
		if (String(url).endsWith("manifest.json.minisig")) {
			return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(manifestText, "utf8")) };
		}
		return { ok: false, status: 404 };
	};

	it("rejects the test-signed manifest against the pinned release key (R05)", async () => {
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: mirrorFetch,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, false);
		assert.match(got.reason, /key id|FAILED/i);
	});

	it("finds a newer version and picks the platform asset", async () => {
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: mirrorFetch,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
		assert.equal(got.update?.asset?.filename, "kainbain-runner-0.2.0-linux-x64.tar.gz");
	});

	it("reports up-to-date when versions match", async () => {
		const got = await checkForUpdate({
			currentVersion: "0.2.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: mirrorFetch,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /latest/i);
	});

	it("reports no-op when no asset matches the platform", async () => {
		const limited = fixtureManifest({ version: "0.2.0", assets: [] });
		// Empty assets fail schema; use a manifest with only darwin assets.
		const darwinOnly = fixtureManifest({
			version: "0.2.0",
			assets: [fixtureManifest().assets[3]],
		});
		const darwinText = JSON.stringify(darwinOnly);
		const fetchDarwin = async (url) => {
			if (String(url).endsWith("manifest.json")) return { ok: true, status: 200, text: async () => darwinText };
			if (String(url).endsWith("manifest.json.minisig")) {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(darwinText, "utf8")) };
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: fetchDarwin,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /No asset/i);
		assert.ok(limited);
	});

	it("skips pre-release manifests after verifying them", async () => {
		const pre = fixtureManifest({ version: "0.3.0-rc.1" });
		const preText = JSON.stringify(pre);
		const fetchPre = async (url) => {
			if (String(url).endsWith("manifest.json")) return { ok: true, status: 200, text: async () => preText };
			if (String(url).endsWith("manifest.json.minisig")) {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(preText, "utf8")) };
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: fetchPre,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /pre-release/i);
	});
});

describe("checkForUpdate (GitHub pointer)", () => {
	it("skips when the latest release is a pre-release", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.github.com")) {
				return {
					ok: true,
					status: 200,
					text: async () => JSON.stringify({ tag_name: "runner-v0.3.0-rc.1", prerelease: true, assets: [] }),
				};
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest",
			fetchImpl,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /pre-release/i);
	});

	it("fails closed on an empty update URL instead of throwing a TypeError", async () => {
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "   ",
			fetchImpl: async () => { throw new Error("must not fetch"); },
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, false);
		assert.match(got.reason, /empty/i);
	});

	it("times out a hung mirror instead of wedging the idle loop", async () => {
		const hangingFetch = () => new Promise(() => {});
		await assert.rejects(
			() => fetchText({ url: "http://mirror.local/r/manifest.json", fetchImpl: hangingFetch, timeoutMs: 50 }),
			(err) => err?.code === "FETCH_FAILED" && /timed out/i.test(err?.message || ""),
		);
	});

	it("fails closed (no throw) when the mirror is unreachable", async () => {
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "FETCH_FAILED" }); },
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, false);
		assert.match(got.reason, /failed/i);
	});

	it("fails closed when the release has no manifest assets", async () => {
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ tag_name: "runner-v0.2.0", prerelease: false, assets: [] }),
		});
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			updateUrl: "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest",
			fetchImpl,
			platform: "linux",
			arch: "x64",
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, false);
		assert.match(got.reason, /manifest/i);
	});
});

describe("applyUpdate", () => {
	it("aborts on sha mismatch and leaves the install untouched", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apply-"));
		const current = path.join(root, "releases", "0.1.0", "unpacked");
		fs.mkdirSync(current, { recursive: true });
		fs.symlinkSync(current, path.join(root, "current"));
		const update = {
			version: "0.2.0",
			manifest: fixtureManifest({ version: "0.2.0" }),
			asset: { filename: "kainbain-runner-0.2.0-linux-x64.tar.gz", sha256: "f".repeat(64) },
		};
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			arrayBuffer: async () => Buffer.from("tampered-bytes"),
		});
		await assert.rejects(
			() => applyUpdate({
				update,
				installRoot: root,
				updateUrl: "http://mirror.local/r",
				fetchImpl,
				logger: { warn: () => {}, log: () => {} },
			}),
			(err) => err?.code === "ASSET_SHA_MISMATCH",
		);
		assert.equal(fs.readlinkSync(path.join(root, "current")), current);
		assert.equal(fs.existsSync(path.join(root, "releases", "0.2.0", "kainbain-runner-0.2.0-linux-x64.tar.gz")), false);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("cleans the .part file when the streamed asset fails sha (no leftovers)", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apply-"));
		const current = path.join(root, "releases", "0.1.0", "unpacked");
		fs.mkdirSync(current, { recursive: true });
		fs.symlinkSync(current, path.join(root, "current"));
		const update = {
			version: "0.2.0",
			manifest: fixtureManifest({ version: "0.2.0" }),
			asset: { filename: "kainbain-runner-0.2.0-linux-x64.tar.gz", sha256: "f".repeat(64) },
		};
		const streamedFetch = async () => ({
			ok: true,
			status: 200,
			body: Readable.from([Buffer.from("tampered-stream-bytes")]),
		});
		await assert.rejects(
			() => applyUpdate({
				update,
				installRoot: root,
				updateUrl: "http://mirror.local/r",
				fetchImpl: streamedFetch,
				logger: { warn: () => {}, log: () => {} },
			}),
			(err) => err?.code === "ASSET_SHA_MISMATCH",
		);
		assert.equal(fs.readlinkSync(path.join(root, "current")), current);
		assert.equal(
			fs.readdirSync(path.join(root, "releases", "0.2.0")).filter((f) => f.endsWith(".part")).length,
			0,
			"no .part file survives a sha mismatch",
		);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("carries host-installed api/node_modules over to the new tree", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apply-"));
		const current = path.join(root, "releases", "0.1.0", "unpacked");
		fs.mkdirSync(path.join(current, "api", "node_modules", "pi-sdk"), { recursive: true });
		fs.writeFileSync(path.join(current, "api", "node_modules", "pi-sdk", "index.js"), "// host-installed\n");
		fs.symlinkSync(current, path.join(root, "current"));
		const assetBytes = Buffer.from("fake-tarball-bytes");
		const update = {
			version: "0.2.0",
			manifest: fixtureManifest({ version: "0.2.0" }),
			asset: { filename: "kainbain-runner-0.2.0-linux-x64.tar.gz", sha256: sha256HexOf(assetBytes) },
		};
		const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => assetBytes });
		const extractImpl = async ({ destDir }) => {
			fs.mkdirSync(destDir, { recursive: true });
			fs.writeFileSync(path.join(destDir, "version.json"), JSON.stringify({ runnerVersion: "0.2.0" }));
		};
		const got = await applyUpdate({
			update,
			installRoot: root,
			updateUrl: "http://mirror.local/r",
			fetchImpl,
			extractImpl,
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(
			fs.readFileSync(path.join(root, "releases", "0.2.0", "unpacked", "api", "node_modules", "pi-sdk", "index.js"), "utf8"),
			"// host-installed\n",
		);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("stages a verified update and flips current/previous", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apply-"));
		const current = path.join(root, "releases", "0.1.0", "unpacked");
		fs.mkdirSync(current, { recursive: true });
		fs.symlinkSync(current, path.join(root, "current"));
		const assetBytes = Buffer.from("fake-tarball-bytes");
		const update = {
			version: "0.2.0",
			manifest: fixtureManifest({ version: "0.2.0" }),
			asset: {
				filename: "kainbain-runner-0.2.0-linux-x64.tar.gz",
				sha256: sha256HexOf(assetBytes),
			},
		};
		const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => assetBytes });
		const unpacked = path.join(root, "releases", "0.2.0", "unpacked");
		const extractImpl = async ({ destDir }) => {
			fs.mkdirSync(destDir, { recursive: true });
			fs.writeFileSync(path.join(destDir, "version.json"), JSON.stringify({ runnerVersion: "0.2.0" }));
		};
		const got = await applyUpdate({
			update,
			installRoot: root,
			updateUrl: "http://mirror.local/r",
			fetchImpl,
			extractImpl,
			logger: { warn: () => {}, log: () => {} },
		});
		assert.equal(got.ok, true);
		assert.equal(got.restartRequired, true);
		assert.equal(fs.readlinkSync(path.join(root, "current")), unpacked);
		assert.equal(fs.readlinkSync(path.join(root, "previous")), current);
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("checkForUpdate with a pinned targetVersion (mirror index)", () => {
	const byVersion = {
		"0.2.0": fixtureManifest({ version: "0.2.0" }),
		"0.3.0": fixtureManifest({ version: "0.3.0" }),
	};
	const textFor = (version) => JSON.stringify(byVersion[version]);
	const indexFetch = async (url) => {
		const href = String(url);
		if (href.endsWith("releases.json")) {
			return {
				ok: true,
				status: 200,
				text: async () =>
					JSON.stringify({
						schema: 1,
						component: "runner",
						releases: ["0.3.0", "0.2.0"].map((version) => ({
							version,
							manifestUrl: `http://mirror.local/r/${version}/manifest.json`,
							signatureUrl: `http://mirror.local/r/${version}/manifest.json.minisig`,
						})),
					}),
			};
		}
		for (const version of Object.keys(byVersion)) {
			if (href === `http://mirror.local/r/${version}/manifest.json`) {
				return { ok: true, status: 200, text: async () => textFor(version) };
			}
			if (href === `http://mirror.local/r/${version}/manifest.json.minisig`) {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(textFor(version), "utf8")) };
			}
		}
		return { ok: false, status: 404 };
	};
	const quiet = { warn: () => {}, log: () => {} };
	const check = (currentVersion, targetVersion) =>
		checkForUpdate({
			currentVersion,
			targetVersion,
			updateUrl: "http://mirror.local/r",
			fetchImpl: indexFetch,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: quiet,
		});

	it("installs exactly the pin, never a newer substitute", async () => {
		const got = await check("0.1.0", "0.2.0");
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
	});

	it("is a no-op when the pin equals the running version", async () => {
		const got = await check("0.2.0", "0.2.0");
		assert.equal(got.ok, true);
		assert.equal(got.update, null);
		assert.match(got.reason, /already on pinned/i);
	});

	it("refuses a pin older than running (never downgrades)", async () => {
		const got = await check("0.3.0", "0.2.0");
		assert.equal(got.ok, false);
		assert.match(got.reason, /never downgrades/i);
	});

	it("fails loud when the pin is not listed", async () => {
		const got = await check("0.1.0", "0.9.9");
		assert.equal(got.ok, false);
		assert.match(got.reason, /not found/i);
	});

	it("rejects a pin that is not a version", async () => {
		const got = await check("0.1.0", "banana");
		assert.equal(got.ok, false);
		assert.match(got.reason, /not a valid/i);
	});

	it("fails loud when the pinned release cannot run here", async () => {
		const darwinOnly = fixtureManifest({
			version: "0.2.0",
			assets: [fixtureManifest().assets[2]],
		});
		const darwinText = JSON.stringify(darwinOnly);
		const fetchDarwin = async (url) => {
			const href = String(url);
			if (href.endsWith("releases.json")) {
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify({
							schema: 1,
							component: "runner",
							releases: [
								{
									version: "0.2.0",
									manifestUrl: "http://mirror.local/r/0.2.0/manifest.json",
									signatureUrl: "http://mirror.local/r/0.2.0/manifest.json.minisig",
								},
							],
						}),
				};
			}
			if (href.endsWith("manifest.json")) return { ok: true, status: 200, text: async () => darwinText };
			if (href.endsWith("manifest.json.minisig")) {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(darwinText, "utf8")) };
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			targetVersion: "0.2.0",
			updateUrl: "http://mirror.local/r",
			fetchImpl: fetchDarwin,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: quiet,
		});
		assert.equal(got.ok, false);
		assert.match(got.reason, /cannot run here/i);
	});
});

describe("checkForUpdate with a pinned targetVersion (GitHub pointer)", () => {
	const quiet = { warn: () => {}, log: () => {} };
	const manifest302 = fixtureManifest({ version: "0.3.0" });
	const manifest302Text = JSON.stringify(manifest302);
	const manifest200 = fixtureManifest({ version: "0.2.0" });
	const manifest200Text = JSON.stringify(manifest200);
	const manifest400 = fixtureManifest({ version: "0.4.0" });
	const manifest400Text = JSON.stringify(manifest400);

	it("installs the pin straight off the latest pointer when it matches", async () => {
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.endsWith("/releases/latest")) {
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify({
							tag_name: "runner-v0.3.0",
							prerelease: false,
							assets: [
								{ name: "manifest.json", browser_download_url: "https://cdn.local/0.3.0/manifest.json" },
								{ name: "manifest.json.minisig", browser_download_url: "https://cdn.local/0.3.0/manifest.json.minisig" },
							],
						}),
				};
			}
			if (href === "https://cdn.local/0.3.0/manifest.json") {
				return { ok: true, status: 200, text: async () => manifest302Text };
			}
			if (href === "https://cdn.local/0.3.0/manifest.json.minisig") {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(manifest302Text, "utf8")) };
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			targetVersion: "0.3.0",
			updateUrl: "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest",
			fetchImpl,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: quiet,
		});
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.3.0");
	});

	it("walks the releases list for a pin older than latest", async () => {
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.endsWith("/releases/latest")) {
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify({
							tag_name: "runner-v0.4.0",
							prerelease: false,
							assets: [
								{ name: "manifest.json", browser_download_url: "https://cdn.local/0.4.0/manifest.json" },
								{ name: "manifest.json.minisig", browser_download_url: "https://cdn.local/0.4.0/manifest.json.minisig" },
							],
						}),
				};
			}
			if (href === "https://api.github.com/repos/Ewrdad/Kainbain/releases?per_page=30&page=1") {
				return {
					ok: true,
					status: 200,
					text: async () =>
						JSON.stringify([
							{
								tag_name: "runner-v0.4.0",
								prerelease: false,
								assets: [
									{ name: "manifest.json", browser_download_url: "https://cdn.local/0.4.0/manifest.json" },
									{ name: "manifest.json.minisig", browser_download_url: "https://cdn.local/0.4.0/manifest.json.minisig" },
								],
							},
							{
								tag_name: "runner-v0.2.0",
								prerelease: false,
								assets: [
									{ name: "manifest.json", browser_download_url: "https://cdn.local/0.2.0/manifest.json" },
									{ name: "manifest.json.minisig", browser_download_url: "https://cdn.local/0.2.0/manifest.json.minisig" },
								],
							},
						]),
				};
			}
			// Latest still verifies first (to learn its version); the pin
			// exact-match is then fetched from the list walk.
			if (href === "https://cdn.local/0.4.0/manifest.json") {
				return { ok: true, status: 200, text: async () => manifest400Text };
			}
			if (href === "https://cdn.local/0.4.0/manifest.json.minisig") {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(manifest400Text, "utf8")) };
			}
			if (href === "https://cdn.local/0.2.0/manifest.json") {
				return { ok: true, status: 200, text: async () => manifest200Text };
			}
			if (href === "https://cdn.local/0.2.0/manifest.json.minisig") {
				return { ok: true, status: 200, text: async () => signTestManifest(Buffer.from(manifest200Text, "utf8")) };
			}
			return { ok: false, status: 404 };
		};
		const got = await checkForUpdate({
			currentVersion: "0.1.0",
			targetVersion: "0.2.0",
			updateUrl: "https://api.github.com/repos/Ewrdad/Kainbain/releases/latest",
			fetchImpl,
			verifyImpl: verifyWithTestKey,
			platform: "linux",
			arch: "x64",
			logger: quiet,
		});
		assert.equal(got.ok, true);
		assert.equal(got.update?.version, "0.2.0");
	});
});
