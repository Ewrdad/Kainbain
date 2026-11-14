import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { packageRunner, resolveBuildStamp } from "../scripts/package-runner.mjs";
import { applyUpdate } from "../runner/updates/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const repoIsGitCheckout = (() => {
	try {
		execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
		return true;
	} catch {
		return false;
	}
})();

// Layout-against-consumer conformance (D4): the canonical packager's
// output must satisfy the real applyUpdate staging path — version.json at
// the unpacked root with the manifest's version, the runner/main.js
// entrypoint bootable under it, the wrapper entrypoint shipped, and no
// tests or secrets inside. A fake repo root keeps this fast; the
// extraction + normalize + version-check + symlink-flip below is the
// production applyUpdate, not a re-implementation, so packager/consumer
// drift fails the build here instead of bricking a remote update.
const fakeRoot = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-conform-root-"));
	fs.mkdirSync(path.join(root, "runner", "bin"), { recursive: true });
	fs.mkdirSync(path.join(root, "shared"), { recursive: true });
	fs.mkdirSync(path.join(root, "api"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "runner", "version.json"),
		JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
	);
	fs.writeFileSync(path.join(root, "runner", "main.js"), "export const main = () => 0;\n");
	fs.writeFileSync(path.join(root, "runner", "bin", "kainbain-runner"), "#!/bin/bash\necho wrapper\n");
	fs.writeFileSync(path.join(root, "shared", "note.js"), "export const note = 1;\n");
	fs.writeFileSync(path.join(root, "api", "probe.js"), "export const probe = 1;\n");
	// Bait the forbidden-file gate: these must never reach the archive.
	fs.writeFileSync(path.join(root, "runner", "daemon.test.js"), "bait\n");
	fs.mkdirSync(path.join(root, "api", "node_modules"), { recursive: true });
	fs.writeFileSync(path.join(root, "api", "node_modules", "evil.js"), "bait\n");
	return root;
};

const walkFiles = (dir) => {
	const out = [];
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else out.push(path.relative(dir, full));
		}
	};
	walk(dir);
	return out;
};

describe("package-runner layout conformance", () => {
	it("the real repo ships the entrypoints the contract pins", () => {
		assert.ok(fs.existsSync(path.join(ROOT, "runner", "main.js")), "runner/main.js exists in the repo");
		assert.ok(fs.existsSync(path.join(ROOT, "runner", "bin", "kainbain-runner")), "runner/bin/kainbain-runner exists in the repo");
	});

	it("package-runner.sh delegates to the canonical builder (one packager)", () => {
		const wrapper = fs.readFileSync(path.join(ROOT, "scripts", "package-runner.sh"), "utf8");
		assert.match(wrapper, /scripts\/package-runner\.mjs/, "the .sh wrapper invokes package-runner.mjs");
		assert.doesNotMatch(wrapper, /STAGE\/runner\/runner/, "the legacy nested runner/{runner,api,shared} layout is gone");
	});

	it("a packaged bundle stages through the real applyUpdate", async () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-conform-out-"));
		const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-conform-install-"));
		try {
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root });
			const bytes = fs.readFileSync(got.tarball);
			const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
			const filename = path.basename(got.tarball);
			const update = {
				version: "0.9.0",
				manifest: { schema: 1, component: "runner", version: "0.9.0", assets: [{ platform: "linux", arch: "x64", filename, sha256, size: bytes.length }] },
				asset: { platform: "linux", arch: "x64", filename, sha256, size: bytes.length },
				releaseMeta: null,
			};
			const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes });
			const applied = await applyUpdate({
				update,
				installRoot,
				updateUrl: "http://mirror.local/r",
				fetchImpl,
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(applied.ok, true);
			const current = fs.readlinkSync(path.join(installRoot, "current"));
			const stagedVersion = JSON.parse(fs.readFileSync(path.join(current, "version.json"), "utf8"));
			assert.equal(stagedVersion.runnerVersion, "0.9.0", "staged tree self-identifies as the manifest version");
			assert.ok(fs.existsSync(path.join(current, "runner", "main.js")), "entrypoint boots under the staged root");
			assert.ok(fs.existsSync(path.join(current, "runner", "bin", "kainbain-runner")), "wrapper entrypoint ships in the bundle");
			const staged = walkFiles(current);
			assert.ok(!staged.some((f) => f.endsWith(".test.js")), "no test files staged");
			assert.ok(!staged.some((f) => f.includes("node_modules")), "no node_modules staged");
			assert.ok(!staged.some((f) => /(^|\/)\.env(\.|$)/.test(f)), "no env files staged");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
			fs.rmSync(installRoot, { recursive: true, force: true });
		}
	});
});

describe("package-runner build stamping", () => {
	const STAMP = { sha: "stamp-sha-123", builtAt: "2026-11-01T00:00:00.000Z", dirty: false };

	it("stamps the release version and build into both version.json copies", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stamp-out-"));
		try {
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, build: STAMP });
			assert.deepEqual(got.build, STAMP);
			for (const copy of ["version.json", path.join("runner", "version.json")]) {
				const staged = JSON.parse(fs.readFileSync(path.join(outDir, got.name, copy), "utf8"));
				assert.equal(staged.runnerVersion, "0.9.0", `${copy} carries the release version`);
				assert.deepEqual(staged.build, STAMP, `${copy} carries the build stamp`);
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("a staged bundle's daemon-readable copy self-identifies as the release", async () => {
		// The booted daemon reads runner/version.json beside itself, not the
		// archive-root copy — stamping only the root left updated Runners
		// reporting their old version (and no build) forever.
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stamp-out-"));
		const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-stamp-install-"));
		try {
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, build: STAMP });
			const bytes = fs.readFileSync(got.tarball);
			const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
			const filename = path.basename(got.tarball);
			const update = {
				version: "0.9.0",
				manifest: { schema: 1, component: "runner", version: "0.9.0", assets: [{ platform: "linux", arch: "x64", filename, sha256, size: bytes.length }] },
				asset: { platform: "linux", arch: "x64", filename, sha256, size: bytes.length },
				releaseMeta: null,
			};
			const applied = await applyUpdate({
				update,
				installRoot,
				updateUrl: "http://mirror.local/r",
				fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes }),
				logger: { warn: () => {}, log: () => {} },
			});
			assert.equal(applied.ok, true);
			const current = fs.readlinkSync(path.join(installRoot, "current"));
			const daemonCopy = JSON.parse(fs.readFileSync(path.join(current, "runner", "version.json"), "utf8"));
			assert.equal(daemonCopy.runnerVersion, "0.9.0", "the daemon-readable copy carries the release version");
			assert.deepEqual(daemonCopy.build, STAMP, "the daemon-readable copy carries the build stamp");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
			fs.rmSync(installRoot, { recursive: true, force: true });
		}
	});

	it("resolveBuildStamp reads HEAD plus packaged-tree dirtiness", () => {
		const seen = [];
		const stamp = resolveBuildStamp({
			root: "/fake/root",
			now: "2026-11-01T00:00:00.000Z",
			runGit: (args, cwd) => {
				seen.push([args, cwd]);
				if (args[0] === "rev-parse") return "abc123\n";
				return "";
			},
		});
		assert.deepEqual(stamp, { sha: "abc123", builtAt: "2026-11-01T00:00:00.000Z", dirty: false });
		assert.ok(seen.some(([args]) => args[0] === "rev-parse" && args[1] === "HEAD"));
		const statusCall = seen.find(([args]) => args[0] === "status");
		assert.ok(statusCall, "dirty is probed via git status");
		assert.ok(statusCall[0].includes("runner") && statusCall[0].includes("shared") && statusCall[0].includes("api"));
	});

	it("resolveBuildStamp marks dirty trees and degrades to nulls without git", () => {
		const dirty = resolveBuildStamp({
			root: "/fake/root",
			runGit: (args) => (args[0] === "rev-parse" ? "abc123" : " M runner/daemon.js\n"),
		});
		assert.equal(dirty.dirty, true);
		const missing = resolveBuildStamp({
			root: "/fake/root",
			runGit: () => { throw new Error("git not found"); },
		});
		assert.deepEqual(missing, { sha: null, builtAt: null, dirty: null });
	});

	it("resolveBuildStamp matches this checkout's HEAD", { skip: !repoIsGitCheckout }, () => {
		const head = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		const stamp = resolveBuildStamp({ root: ROOT });
		assert.equal(stamp.sha, head);
		assert.ok(stamp.builtAt && !Number.isNaN(Date.parse(stamp.builtAt)));
		assert.equal(typeof stamp.dirty, "boolean");
	});
});
