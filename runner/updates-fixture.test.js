import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { applyUpdate, checkForUpdate } from "./updates/index.js";
import { sha256HexOf, verifyManifestSignature } from "./updates/verify.js";
import { bootstrapUpdateState, markUpdateSuccess, readUpdateState } from "./updates/state.js";
import { fixtureManifest, signTestManifest, TEST_PUBLIC_KEY } from "./updates/testkey.js";

// End-to-end over a local HTTP mirror (no GitHub, no network): build a
// real tarball, sign a manifest with the TEST key, serve manifest + sig +
// asset from 127.0.0.1, then run the production check → download → verify
// → extract → symlink-flip path. Tampered variants must abort with the
// install untouched (acceptance A3).
describe("update channel fixture (local HTTP mirror)", () => {
	const buildRelease = (dir, { version, tamperAsset = false } = {}) => {
		const tree = path.join(dir, `tree-${version}`);
		fs.mkdirSync(tree, { recursive: true });
		fs.writeFileSync(
			path.join(tree, "version.json"),
			JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: version }),
		);
		fs.writeFileSync(path.join(tree, "main.js"), "// fixture runner\n");
		const assetName = `kainbain-runner-${version}-linux-x64.tar.gz`;
		const assetPath = path.join(dir, assetName);
		execFileSync("tar", ["-czf", assetPath, "-C", dir, `tree-${version}`]);
		let bytes = fs.readFileSync(assetPath);
		if (tamperAsset) {
			bytes = Buffer.concat([bytes, Buffer.from("evil-append")]);
			fs.writeFileSync(assetPath, bytes);
		}
		const manifest = fixtureManifest({
			version,
			assets: [
				{
					platform: "linux",
					arch: "x64",
					filename: assetName,
					sha256: tamperAsset ? "0".repeat(64) : sha256HexOf(bytes),
					size: bytes.length,
				},
			],
		});
		const manifestText = JSON.stringify(manifest);
		const sigText = signTestManifest(Buffer.from(manifestText, "utf8"));
		return { manifestText, sigText, assetName, bytes };
	};

	const serve = (files) =>
		new Promise((resolve) => {
			const server = http.createServer((req, res) => {
				const body = files[req.url];
				if (!body) {
					res.statusCode = 404;
					res.end("nope");
					return;
				}
				res.statusCode = 200;
				res.end(body);
			});
			server.listen(0, "127.0.0.1", () => resolve(server));
		});

	const verifyWithTestKey = ({ manifestBytes, signatureText }) =>
		verifyManifestSignature({ manifestBytes, signatureText, publicKey: TEST_PUBLIC_KEY });

	it("updates end-to-end: check, verify, stage, flip, boot, success", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-fixture-"));
		const { manifestText, sigText, assetName, bytes } = buildRelease(dir, { version: "0.2.0" });
		const server = await serve({
			"/manifest.json": manifestText,
			"/manifest.json.minisig": sigText,
			[`/${assetName}`]: bytes,
		});
		const base = `http://127.0.0.1:${server.address().port}`;
		try {
			const checked = await checkForUpdate({
				currentVersion: "0.1.0",
				updateUrl: base,
				verifyImpl: verifyWithTestKey,
				platform: "linux",
				arch: "x64",
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(checked.ok, true);
			assert.equal(checked.update?.version, "0.2.0");

			const root = path.join(dir, "install");
			const current = path.join(root, "releases", "0.1.0", "unpacked");
			fs.mkdirSync(current, { recursive: true });
			fs.writeFileSync(path.join(current, "version.json"), JSON.stringify({ runnerVersion: "0.1.0" }));
			fs.symlinkSync(current, path.join(root, "current"));

			const applied = await applyUpdate({
				update: checked.update,
				installRoot: root,
				updateUrl: base,
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(applied.ok, true);
			assert.equal(applied.restartRequired, true);
			const flipped = fs.readlinkSync(path.join(root, "current"));
			assert.equal(JSON.parse(fs.readFileSync(path.join(flipped, "version.json"), "utf8")).runnerVersion, "0.2.0");
			assert.equal(fs.readlinkSync(path.join(root, "previous")), current);
			assert.equal(readUpdateState(root).status, "pending-boot");

			// Simulated restart: bootstrap passes, first heartbeat marks success.
			const boot = bootstrapUpdateState({ installRoot: root });
			assert.equal(boot.action, "boot");
			markUpdateSuccess({ installRoot: root, version: "0.2.0" });
			assert.equal(readUpdateState(root).status, "success");
		} finally {
			server.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("tampered asset aborts with the install untouched (A3)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-fixture-"));
		// Manifest signature is valid but the sha does not match the bytes.
		const { manifestText, sigText, assetName, bytes } = buildRelease(dir, { version: "0.2.1", tamperAsset: true });
		const server = await serve({
			"/manifest.json": manifestText,
			"/manifest.json.minisig": sigText,
			[`/${assetName}`]: bytes,
		});
		const base = `http://127.0.0.1:${server.address().port}`;
		try {
			const checked = await checkForUpdate({
				currentVersion: "0.1.0",
				updateUrl: base,
				verifyImpl: verifyWithTestKey,
				platform: "linux",
				arch: "x64",
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(checked.ok, true, "manifest itself is validly signed");
			const root = path.join(dir, "install");
			const current = path.join(root, "releases", "0.1.0", "unpacked");
			fs.mkdirSync(current, { recursive: true });
			fs.symlinkSync(current, path.join(root, "current"));
			await assert.rejects(
				() => applyUpdate({ update: checked.update, installRoot: root, updateUrl: base, logger: { warn: () => {}, log: () => {} } }),
				(err) => err?.code === "ASSET_SHA_MISMATCH",
			);
			assert.equal(fs.readlinkSync(path.join(root, "current")), current);
		} finally {
			server.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("index mode end-to-end: newest compatible wins, asset resolves beside its manifest", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-fixture-"));
		// 0.2.0 is compatible and served with a real asset; 0.9.0 needs a
		// newer backend, so the check must pass it over without touching it.
		const tree = path.join(dir, "tree-0.2.0");
		fs.mkdirSync(tree, { recursive: true });
		fs.writeFileSync(path.join(tree, "version.json"), JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.2.0" }));
		fs.writeFileSync(path.join(tree, "main.js"), "// fixture runner\n");
		const assetName = "kainbain-runner-0.2.0-linux-x64.tar.gz";
		const assetPath = path.join(dir, assetName);
		execFileSync("tar", ["-czf", assetPath, "-C", dir, "tree-0.2.0"]);
		const bytes = fs.readFileSync(assetPath);
		const manifestFor = (version, requires) => {
			const manifest = fixtureManifest({
				version,
				...(requires ? { requires } : {}),
				assets: [
					{
						platform: "linux",
						arch: "x64",
						filename: assetName,
						sha256: sha256HexOf(bytes),
						size: bytes.length,
					},
				],
			});
			const text = JSON.stringify(manifest);
			return { text, sig: signTestManifest(Buffer.from(text, "utf8")) };
		};
		const newer = manifestFor("0.9.0", { backendApi: ">=2.0.0 <3.0.0" });
		const older = manifestFor("0.2.0", { backendApi: ">=1.0.0 <2.0.0" });
		// Mutable file map: the index needs the server's ephemeral port,
		// known only after listen, so it is filled in before any request.
		const files = {};
		const server = await serve(files);
		const base = `http://127.0.0.1:${server.address().port}`;
		Object.assign(files, {
			"/releases.json": JSON.stringify({
				schema: 1,
				component: "runner",
				releases: [
					{ version: "0.9.0", manifestUrl: `${base}/v/0.9.0/manifest.json`, signatureUrl: `${base}/v/0.9.0/manifest.json.minisig` },
					{ version: "0.2.0", manifestUrl: `${base}/v/0.2.0/manifest.json`, signatureUrl: `${base}/v/0.2.0/manifest.json.minisig` },
				],
			}),
			"/v/0.9.0/manifest.json": newer.text,
			"/v/0.9.0/manifest.json.minisig": newer.sig,
			"/v/0.2.0/manifest.json": older.text,
			"/v/0.2.0/manifest.json.minisig": older.sig,
			[`/v/0.2.0/${assetName}`]: bytes,
		});
		try {
			const checked = await checkForUpdate({
				currentVersion: "0.1.0",
				updateUrl: base,
				verifyImpl: verifyWithTestKey,
				backendApiVersion: "1.0.0",
				platform: "linux",
				arch: "x64",
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(checked.ok, true);
			assert.equal(checked.update?.version, "0.2.0");
			const root = path.join(dir, "install");
			const current = path.join(root, "releases", "0.1.0", "unpacked");
			fs.mkdirSync(current, { recursive: true });
			fs.symlinkSync(current, path.join(root, "current"));
			const applied = await applyUpdate({
				update: checked.update,
				installRoot: root,
				updateUrl: base,
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(applied.ok, true);
			const flipped = fs.readlinkSync(path.join(root, "current"));
			assert.equal(JSON.parse(fs.readFileSync(path.join(flipped, "version.json"), "utf8")).runnerVersion, "0.2.0");
		} finally {
			server.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("tampered manifest aborts before any download (A3)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-fixture-"));
		const { manifestText, assetName, bytes } = buildRelease(dir, { version: "0.2.0" });
		const tampered = manifestText.replace('"0.2.0"', '"9.9.9"');
		const server = await serve({
			"/manifest.json": tampered,
			// Signature is for the ORIGINAL bytes.
			"/manifest.json.minisig": signTestManifest(Buffer.from(manifestText, "utf8")),
			[`/${assetName}`]: bytes,
		});
		const base = `http://127.0.0.1:${server.address().port}`;
		try {
			const checked = await checkForUpdate({
				currentVersion: "0.1.0",
				updateUrl: base,
				verifyImpl: verifyWithTestKey,
				platform: "linux",
				arch: "x64",
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(checked.ok, false);
			assert.match(checked.reason, /FAILED/i);
		} finally {
			server.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
