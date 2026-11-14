import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, readReleaseRequires, sha256FileHex } from "../scripts/generate-runner-manifest.mjs";
import { hasLegDepSource, packageRunner, stageLegNpmDeps } from "../scripts/package-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The release pipeline (Option A, ADR 0012) must keep the tag's full
// version — a canary `runner-v1.2.3-rc.1` ships manifest version
// `1.2.3-rc.1`, never the stripped `1.2.3` it previews. Runners skip
// pre-release manifests after verifying them, so the suffix is what keeps
// canaries test-only.
const fakeDistWith = (version) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-manifest-"));
	for (const [platform, arch] of [["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"]]) {
		fs.writeFileSync(path.join(dir, `kainbain-runner-${version}-${platform}-${arch}.tar.gz`), `fake-${platform}-${arch}`);
	}
	return dir;
};

describe("buildManifest", () => {
	it("keeps the full canary version and points assetBase at the canary tag", () => {
		const dir = fakeDistWith("1.2.3-rc.1");
		const manifest = buildManifest({ version: "1.2.3-rc.1", dir, tag: "runner-v1.2.3-rc.1" });
		assert.equal(manifest.version, "1.2.3-rc.1");
		assert.equal(manifest.assets.length, 4);
		assert.ok(manifest.assets.every((a) => a.filename.includes("1.2.3-rc.1")));
		assert.equal(manifest.assetBase, "https://github.com/Ewrdad/Kainbain/releases/download/runner-v1.2.3-rc.1/");
		for (const asset of manifest.assets) {
			assert.match(asset.sha256, /^[0-9a-f]{64}$/);
			assert.ok(asset.size > 0);
		}
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("still builds plain final versions", () => {
		const dir = fakeDistWith("1.2.3");
		const manifest = buildManifest({ version: "1.2.3", dir });
		assert.equal(manifest.version, "1.2.3");
		assert.equal(manifest.tag, "runner-v1.2.3");
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("rejects non-semver versions instead of publishing a bad pointer", () => {
		const dir = fakeDistWith("1.2.3");
		assert.throws(() => buildManifest({ version: "not-a-version", dir }), /semver/);
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("stamps requires.backendApi from the release source tree", () => {
		const dir = fakeDistWith("1.2.3");
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-reqroot-"));
		fs.mkdirSync(path.join(root, "runner"), { recursive: true });
		fs.writeFileSync(
			path.join(root, "runner", "version.json"),
			JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "1.2.3", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
		);
		const manifest = buildManifest({ version: "1.2.3", dir, root });
		assert.deepEqual(manifest.requires, { backendApi: ">=1.0.0 <2.0.0" });
		assert.equal(readReleaseRequires(root), ">=1.0.0 <2.0.0");
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("omits requires when the source tree carries no range (legacy shape)", () => {
		const dir = fakeDistWith("1.2.3");
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-reqroot-"));
		fs.mkdirSync(path.join(root, "runner"), { recursive: true });
		fs.writeFileSync(
			path.join(root, "runner", "version.json"),
			JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "1.2.3" }),
		);
		const manifest = buildManifest({ version: "1.2.3", dir, root });
		assert.equal(manifest.requires, undefined);
		assert.equal(readReleaseRequires(root), null);
		assert.equal(readReleaseRequires(path.join(root, "missing")), null);
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("sha256FileHex matches the manifest's hashing", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-sha-"));
		const file = path.join(dir, "a.bin");
		fs.writeFileSync(file, "bytes");
		assert.equal(sha256FileHex(file), crypto.createHash("sha256").update("bytes").digest("hex"));
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("packageRunner", () => {
	// A hermetic fake repo root: the packager only needs version.json plus
	// the runner/shared/api trees, so the test never tars the real repo.
	const fakeRoot = () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgroot-"));
		fs.mkdirSync(path.join(root, "runner"), { recursive: true });
		fs.mkdirSync(path.join(root, "shared"), { recursive: true });
		fs.mkdirSync(path.join(root, "api"), { recursive: true });
		fs.writeFileSync(
			path.join(root, "runner", "version.json"),
			JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.0.0" }),
		);
		fs.writeFileSync(path.join(root, "runner", "main.js"), "export const main = () => 0;\n");
		return root;
	};

	it("packages a canary version under its full name and stamps version.json", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		const got = packageRunner({ platform: "linux", arch: "x64", version: "1.2.3-rc.1", outDir, root, installLegDeps: false });
		assert.equal(got.version, "1.2.3-rc.1");
		assert.match(got.tarball, /kainbain-runner-1\.2\.3-rc\.1-linux-x64\.tar\.gz$/);
		assert.ok(fs.existsSync(got.tarball));
		const stamped = JSON.parse(fs.readFileSync(path.join(outDir, got.name, "version.json"), "utf8"));
		assert.equal(stamped.runnerVersion, "1.2.3-rc.1");
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	it("rejects non-semver versions instead of tarring them", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		assert.throws(
			() => packageRunner({ platform: "linux", arch: "x64", version: "tomorrow", outDir, root }),
			/semver/,
		);
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	it("fails closed on unsupported platforms (v1: linux/darwin only)", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		assert.throws(
			() => packageRunner({ platform: "win32", arch: "x64", version: "1.2.3", outDir, root }),
			/unsupported platform/,
		);
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	it("leaves the default leg-closure install on for fake roots without crashing (auto-skip)", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		assert.equal(hasLegDepSource({ root }), false);
		const got = packageRunner({ platform: "linux", arch: "x64", version: "2.0.1", outDir, root });
		assert.ok(fs.existsSync(got.tarball));
		assert.ok(!fs.existsSync(path.join(outDir, got.name, "api", "node_modules")), "no leg closure staged from a root with nothing to pin from");
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	it("stageLegNpmDeps fails closed with a named error when the root has no api/package.json", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		assert.throws(() => stageLegNpmDeps({ stage: outDir, root }), /no api\/package\.json/);
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});

	it("agrees with buildManifest on the asset filename grammar", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pkgout-"));
		const packaged = [];
		for (const [platform, arch] of [["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"]]) {
			packaged.push(packageRunner({ platform, arch, version: "2.0.0", outDir, root, installLegDeps: false }));
		}
		const manifest = buildManifest({ version: "2.0.0", dir: outDir });
		const names = manifest.assets.map((a) => a.filename);
		for (const got of packaged) {
			assert.ok(names.includes(path.basename(got.tarball)), `manifest names ${names} include ${path.basename(got.tarball)}`);
		}
		assert.ok(ROOT.length > 0);
		fs.rmSync(root, { recursive: true, force: true });
		fs.rmSync(outDir, { recursive: true, force: true });
	});
});
