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
