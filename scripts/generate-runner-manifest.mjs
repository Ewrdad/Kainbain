#!/usr/bin/env node
/***
 * MARK: generate-runner-manifest
 * @description Builds + signs the release manifest for the GitHub Releases
 *   update channel (Option A, ADR 0012). Reads the per-platform tarballs in
 *   a dist dir, emits manifest.json (schema 1: component/version/assets
 *   with sha256+size, assetBase, releasedAt), and writes
 *   manifest.json.minisig in minisign format using the release SECRET key
 *   from the RUNNER_RELEASE_SIGNING_KEY env var (base64 of the raw 32-byte
 *   Ed25519 seed — CI injects it from GitHub Secrets; the public half is
 *   pinned in runner/updates/verify.js and scripts/runner-pinned-key/).
 * @example RUNNER_RELEASE_SIGNING_KEY=$(...) node scripts/generate-runner-manifest.mjs --dir dist/ --version 1.2.3
 ***/
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

export const SUPPORTED_TARGETS = [
	["linux", "x64"],
	["linux", "arm64"],
	["darwin", "x64"],
	["darwin", "arm64"],
];

const parseArgs = (argv) => {
	const out = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv.splice(i + 1, 1)[0] : "true";
		}
	}
	return out;
};

export const sha256FileHex = (filePath) => {
	const hash = crypto.createHash("sha256");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("hex");
};

const pkcs8DerFor = (privRaw) =>
	Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(privRaw)]);

export const minisignSign = ({ messageBytes, secretSeedHex, keynumHex }) => {
	const priv = crypto.createPrivateKey({
		key: pkcs8DerFor(Buffer.from(secretSeedHex, "hex")),
		format: "der",
		type: "pkcs8",
	});
	const sig = crypto.sign(null, Buffer.from(messageBytes), priv);
	const envelope = Buffer.concat([
		Buffer.from([0x45, 0x64]),
		Buffer.from(keynumHex, "hex"),
		sig,
	]).toString("base64");
	return `untrusted comment: kainbain runner release signature\n${envelope}\n`;
};

export const readReleaseRequires = (root = REPO_ROOT) => {
	try {
		const versionJson = JSON.parse(fs.readFileSync(path.join(root, "runner", "version.json"), "utf8"));
		const range = versionJson?.requires?.backendApi;
		return typeof range === "string" && range.trim() ? range.trim() : null;
	} catch {
		return null;
	}
};

export const buildManifest = ({ version, dir, tag, root = REPO_ROOT }) => {
	const clean = String(version || "").trim().replace(/^v/, "");
	// Full semver incl. canary pre-releases (`1.2.3-rc.1`): the manifest
	// version always matches the release tag. Runners skip pre-release
	// manifests after verifying them, so canaries stay test-only.
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(clean)) {
		throw new Error(`generate-runner-manifest: version must be semver (got '${version}').`);
	}
	const assets = [];
	for (const [platform, arch] of SUPPORTED_TARGETS) {
		const filename = `kainbain-runner-${clean}-${platform}-${arch}.tar.gz`;
		const filePath = path.join(dir, filename);
		if (!fs.existsSync(filePath)) {
			throw new Error(`generate-runner-manifest: missing asset ${filename} in ${dir}.`);
		}
		const stat = fs.statSync(filePath);
		assets.push({
			platform,
			arch,
			filename,
			sha256: sha256FileHex(filePath),
			size: stat.size,
		});
	}
	const manifest = {
		schema: 1,
		component: "runner",
		version: clean,
		releasedAt: new Date().toISOString(),
		assetBase: `https://github.com/Ewrdad/Kainbain/releases/download/runner-v${clean}/`,
		assets,
		tag: tag || `runner-v${clean}`,
	};
	// Compat claim (task 82e49a05): stamp which backend API range this
	// release works with, from the release source tree's own
	// runner/version.json. Absent (legacy-shaped manifest) when the source
	// tree carries no range — old and new runners both accept that.
	const requires = readReleaseRequires(root);
	if (requires) manifest.requires = { backendApi: requires };
	return manifest;
};

const main = () => {
	const args = parseArgs(process.argv.slice(2));
	const dir = path.resolve(args.dir || path.join(REPO_ROOT, "dist"));
	const manifest = buildManifest({ version: args.version, dir, tag: args.tag });
	const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
	fs.writeFileSync(path.join(dir, "manifest.json"), manifestText);
	const secret = String(process.env.RUNNER_RELEASE_SIGNING_KEY || "").trim();
	const keynum = String(process.env.RUNNER_RELEASE_SIGNING_KEYNUM || "").trim();
	if (!secret || !keynum) {
		throw new Error(
			"generate-runner-manifest: set RUNNER_RELEASE_SIGNING_KEY (base64/hex 32-byte seed) and RUNNER_RELEASE_SIGNING_KEYNUM (hex 8-byte id) from GitHub Secrets.",
		);
	}
	const seedHex = /^[0-9a-fA-F]{64}$/.test(secret) ? secret.toLowerCase() : Buffer.from(secret, "base64").toString("hex");
	fs.writeFileSync(
		path.join(dir, "manifest.json.minisig"),
		minisignSign({ messageBytes: Buffer.from(manifestText, "utf8"), secretSeedHex: seedHex, keynumHex: keynum }),
	);
	console.log(`manifest for ${manifest.version} signed (${manifest.assets.length} assets)`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
