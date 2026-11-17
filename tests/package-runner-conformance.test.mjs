import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageRunner, parsePackagerArgs, resolveBuildStamp, validatePackageSourceTree } from "../scripts/package-runner.mjs";
import { execFileSync, spawnSync } from "node:child_process";
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
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, installLegDeps: false });
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
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, build: STAMP, installLegDeps: false });
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
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, build: STAMP, installLegDeps: false });
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

describe("package-runner leg closure (N3 regression gate)", () => {
	it("every bare leg specifier is a bundled dep (table and packager cannot drift)", async () => {
		const { LEG_MODULE_SPECIFIERS } = await import("../runner/harnessModelDiscovery.js");
		const { RUNNER_LEG_BUNDLED_DEPS } = await import("../scripts/package-runner.mjs");
		const bare = [
			...new Set(
				Object.values(LEG_MODULE_SPECIFIERS)
					.flat()
					.filter((spec) => !spec.startsWith(".")),
			),
		].sort();
		assert.deepEqual(
			bare,
			[...RUNNER_LEG_BUNDLED_DEPS].sort(),
			"a discovery leg loads an npm package the bundle does not ship (N3)",
		);
	});

	it(
		"every leg specifier imports from the staged bundle tree",
		{ timeout: 600000 },
		async () => {
			const { LEG_MODULE_SPECIFIERS } = await import("../runner/harnessModelDiscovery.js");
			const specs = [...new Set(Object.values(LEG_MODULE_SPECIFIERS).flat())];
			// Relative harness modules resolve from runner/ (same spot the
			// legs import them from); bare npm deps resolve from api/ (same
			// spot the harness modules import them from). One probe per
			// base, so every specifier is imported exactly as the bundle
			// resolves it — a missing dep fails here, not on a host.
			const relativeSpecs = specs.filter((spec) => spec.startsWith("."));
			const bareSpecs = specs.filter((spec) => !spec.startsWith("."));
			const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-legclosure-out-"));
			try {
				const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root: ROOT });
				const stage = path.join(outDir, got.name);
				const runnerProbe = path.join(stage, "runner", "leg-closure-probe.mjs");
				fs.writeFileSync(
					runnerProbe,
					`const specs = ${JSON.stringify(relativeSpecs)};\nfor (const spec of specs) { await import(spec); }\nconsole.log("relative leg closure ok");\n`,
				);
				const runnerOut = execFileSync(process.execPath, [runnerProbe], { encoding: "utf8", timeout: 300000 });
				assert.match(runnerOut, /relative leg closure ok/);
				if (bareSpecs.length > 0) {
					const apiProbe = path.join(stage, "api", "leg-closure-probe.mjs");
					fs.writeFileSync(
						apiProbe,
						`const specs = ${JSON.stringify(bareSpecs)};\nfor (const spec of specs) { await import(spec); }\nconsole.log("bare leg closure ok");\n`,
					);
					const apiOut = execFileSync(process.execPath, [apiProbe], { encoding: "utf8", timeout: 300000 });
					assert.match(apiOut, /bare leg closure ok/);
				}
				assert.ok(bareSpecs.length > 0, "the table must name at least one npm dep to guard");
			} finally {
				fs.rmSync(outDir, { recursive: true, force: true });
			}
		},
	);
});

describe("package-runner arg parsing", () => {
	it("parses --key value and --key=value without mutating the input", () => {
		const input = ["--platform", "linux", "--arch=x64", "--version", "1.2.3-rc.1"];
		const snapshot = [...input];
		assert.deepEqual(parsePackagerArgs({ args: input }), { platform: "linux", arch: "x64", version: "1.2.3-rc.1" });
		assert.deepEqual(input, snapshot, "the caller's argv slice is never mutated");
	});

	it("treats a bare flag as \"true\" and skips positionals, a bare --, and non-strings", () => {
		assert.deepEqual(parsePackagerArgs({ args: ["--out"] }), { out: "true" });
		assert.deepEqual(parsePackagerArgs({ args: ["pos", "--", "--platform", "linux", 42, null] }), { platform: "linux" });
		assert.deepEqual(parsePackagerArgs({ args: ["--empty=", "--", "--x", "--y", "v"] }), { empty: "", x: "true", y: "v" });
		assert.deepEqual(parsePackagerArgs({}), {});
		assert.deepEqual(parsePackagerArgs(), {});
	});

	it("lets the last duplicate win and keeps unknown keys for the caller to warn on", () => {
		assert.deepEqual(parsePackagerArgs({ args: ["--arch", "x64", "--arch", "arm64"] }), { arch: "arm64" });
		assert.deepEqual(parsePackagerArgs({ args: ["--platfrom", "linux"] }), { platfrom: "linux" });
	});

	it("the CLI names the missing required arg (never a mystery 'undefined')", () => {
		const got = spawnSync(process.execPath, [path.join(ROOT, "scripts", "package-runner.mjs"), "--platform", "linux"], { encoding: "utf8", timeout: 30000 });
		assert.equal(got.status, 1);
		assert.match(got.stderr, /missing --arch/, "the error names the missing key");
		assert.match(got.stderr, /Usage:/, "the error shows usage");
		const bareOut = spawnSync(process.execPath, [path.join(ROOT, "scripts", "package-runner.mjs"), "--out"], { encoding: "utf8", timeout: 30000 });
		assert.equal(bareOut.status, 1);
		assert.match(bareOut.stderr, /--out needs a directory/, "a bare --out flag fails instead of writing to ./true");
	});
});

describe("package-runner source validation", () => {
	it("accepts a releasable tree and names every missing path otherwise", () => {
		const root = fakeRoot();
		try {
			assert.doesNotThrow(() => validatePackageSourceTree({ root }));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
		const empty = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pack-validate-"));
		try {
			assert.throws(() => validatePackageSourceTree({ root: empty }), /not a releasable runner tree.*missing: .*runner\/.*shared\/.*api\//s);
		} finally {
			fs.rmSync(empty, { recursive: true, force: true });
		}
	});

	it("fails fast with the fix attached when pointed at runner/ itself", () => {
		const root = fakeRoot();
		try {
			assert.throws(() => validatePackageSourceTree({ root: path.join(root, "runner") }), /not at runner\/ itself/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects an unreadable runner/version.json instead of failing mid-copy", () => {
		const root = fakeRoot();
		try {
			fs.writeFileSync(path.join(root, "runner", "version.json"), "{not json");
			assert.throws(() => validatePackageSourceTree({ root }), /unreadable runner\/version\.json/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("packageRunner fails before staging (no partial tarball, no ENOENT)", () => {
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pack-failfast-"));
		try {
			assert.throws(
				() => packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root: path.join(outDir, "no-such-root"), installLegDeps: false }),
				/not a releasable runner tree/,
			);
			assert.deepEqual(fs.readdirSync(outDir), [], "nothing staged on a validation failure");
		} finally {
			fs.rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("packageRunner rejects a file as --out with a clear error", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pack-out-"));
		try {
			const fileAsOut = path.join(outDir, "file");
			fs.writeFileSync(fileAsOut, "x");
			assert.throws(
				() => packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir: fileAsOut, root, installLegDeps: false }),
				/exists and is not a directory/,
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
		}
	});
});

describe("package-runner symlink safety", () => {
	it("a symlink cycle in the source tree cannot hang or crash the packager", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pack-link-"));
		try {
			fs.symlinkSync(root, path.join(root, "runner", "cycle-to-root"));
			fs.symlinkSync(path.join(root, "runner"), path.join(root, "shared", "cycle-to-runner"));
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, installLegDeps: false });
			assert.ok(fs.existsSync(got.tarball), "the bundle still builds");
			assert.equal(fs.existsSync(path.join(outDir, got.name, "runner", "cycle-to-root")), false, "dir links are never descended");
			assert.equal(fs.existsSync(path.join(outDir, got.name, "shared", "cycle-to-runner")), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("a file symlink ships its target bytes once, a dangling link ships nothing", () => {
		const root = fakeRoot();
		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pack-filelink-"));
		try {
			fs.writeFileSync(path.join(root, "shared", "real.js"), "export const real = 1;\n");
			fs.symlinkSync(path.join(root, "shared", "real.js"), path.join(root, "shared", "alias.js"));
			fs.symlinkSync(path.join(root, "shared", "gone.js"), path.join(root, "shared", "dangling.js"));
			const got = packageRunner({ platform: "linux", arch: "x64", version: "0.9.0", outDir, root, installLegDeps: false });
			assert.equal(fs.readFileSync(path.join(outDir, got.name, "shared", "alias.js"), "utf8"), "export const real = 1;\n");
			assert.equal(fs.existsSync(path.join(outDir, got.name, "shared", "dangling.js")), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outDir, { recursive: true, force: true });
		}
	});
});

describe("package-runner.sh REF guard (WP-F filename-vs-stamp trap)", () => {
	it("documents the stamp rule, the override flag, and the transfer receipt", () => {
		const wrapper = fs.readFileSync(path.join(ROOT, "scripts", "package-runner.sh"), "utf8");
		assert.match(wrapper, /--allow-ref-mismatch/, "the override flag exists");
		assert.match(wrapper, /never from the filename/i, "the stamp rule is stated");
		assert.match(wrapper, /sha256/, "the transfer receipt prints a re-hashable sha256");
		assert.match(wrapper, /stamped build\.sha/, "the receipt names the stamped identity");
	});

	it("refuses a sha-looking REF that matches neither HEAD nor its short form", { skip: !repoIsGitCheckout }, () => {
		const headShort = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
		const lastChar = headShort[headShort.length - 1];
		const flipped = lastChar === "0" ? "1" : "0";
		const mismatchRef = `${headShort.slice(0, -1)}${flipped}`;
		assert.match(mismatchRef, /^[0-9a-f]{7,40}$/, "the test REF must look like a sha to trip the guard");
		const got = spawnSync("bash", [path.join(ROOT, "scripts", "package-runner.sh"), mismatchRef], { encoding: "utf8", timeout: 30000 });
		assert.notEqual(got.status, 0, "a mismatched REF fails before any packaging");
		assert.match(got.stderr, /matches neither HEAD/, "the error names the mismatch");
		assert.match(got.stderr, /--allow-ref-mismatch/, "the error shows the override");
		assert.equal(fs.existsSync(path.join(ROOT, "dist", `kainbain-runner-${mismatchRef}.tar.gz`)), false, "no tarball is written on a guard failure");
	});
});
