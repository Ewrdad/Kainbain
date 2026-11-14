import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageRunner } from "../scripts/package-runner.mjs";
import { execFileSync } from "node:child_process";
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
