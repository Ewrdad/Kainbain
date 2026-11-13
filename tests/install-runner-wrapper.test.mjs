import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// New installs boot through the self-update wrapper (task 82e49a05 K4):
// both installers lay a versioned install root down from their source
// tree and write wrapper-based units. Everything runs under a fake $HOME
// with a stubbed systemctl, so no real unit is ever touched.
const fakeTree = (treeRoot) => {
	fs.mkdirSync(path.join(treeRoot, "runner", "bin"), { recursive: true });
	fs.mkdirSync(path.join(treeRoot, "api"), { recursive: true });
	fs.mkdirSync(path.join(treeRoot, "shared"), { recursive: true });
	fs.writeFileSync(path.join(treeRoot, "runner", "main.js"), "export const main = () => 0;\n");
	fs.writeFileSync(path.join(treeRoot, "runner", "version.json"), JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.1.0" }));
	fs.writeFileSync(path.join(treeRoot, "runner", "bin", "kainbain-runner"), "#!/bin/bash\necho wrapper\n");
	fs.writeFileSync(path.join(treeRoot, "api", "probe.js"), "export const probe = 1;\n");
};

const stubSystemctl = () => {
	const bin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-bin-"));
	const log = path.join(bin, "calls.log");
	fs.writeFileSync(bin + "/systemctl", `#!/bin/bash\necho "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
	fs.chmodSync(bin + "/systemctl", 0o755);
	return { bin, log };
};

describe("install-local-runner.sh wrapper installs", () => {
	it("--dry-run reports the wrapper paths and writes nothing", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		try {
			const got = spawnSync("bash", [path.join(ROOT, "scripts", "install-local-runner.sh"), "--id", "local-x", "--manual", "--harness", "mock", "--dry-run"], {
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, new RegExp(`INSTALL_ROOT=${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.kainbain/runner-install`));
			assert.deepEqual(fs.readdirSync(home), [], "dry-run writes nothing under HOME");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("writes a wrapper unit + env and lays the versioned tree down", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		const { bin } = stubSystemctl();
		try {
			fakeTree(path.join(home, "apps", "kainbain", "runner"));
			const got = spawnSync(
				"bash",
				[path.join(ROOT, "scripts", "install-local-runner.sh"), "--id", "local-x", "--manual", "--harness", "mock", "--backend", "http://127.0.0.1:1"],
				{ env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, encoding: "utf8" },
			);
			assert.equal(got.status, 0, got.stdout + got.stderr);
			const root = path.join(home, ".kainbain", "runner-install");
			const unpacked = path.join(root, "releases", "0.1.0", "unpacked");
			assert.equal(fs.readlinkSync(path.join(root, "current")), unpacked);
			assert.ok(fs.existsSync(path.join(unpacked, "runner", "main.js")));
			assert.ok(fs.existsSync(path.join(unpacked, "api", "probe.js")));
			assert.ok(fs.existsSync(path.join(root, "bin", "kainbain-runner")));
			const unit = fs.readFileSync(path.join(home, ".config", "systemd", "user", "kainbain-runner-local-x.service"), "utf8");
			assert.match(unit, new RegExp(`^ExecStart=${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/bin/kainbain-runner$`, "m"));
			assert.match(unit, new RegExp(`^WorkingDirectory=${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
			assert.match(fs.readFileSync(path.join(home, ".kainbain", "runner-local-x.env"), "utf8"), /^KAINBAIN_RUNNER_INSTALL_ROOT=/m);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(bin, { recursive: true, force: true });
		}
	});

	it("leaves an existing unit alone in ensure mode", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		const { bin } = stubSystemctl();
		try {
			fakeTree(path.join(home, "apps", "kainbain", "runner"));
			const unitDir = path.join(home, ".config", "systemd", "user");
			fs.mkdirSync(unitDir, { recursive: true });
			const unitFile = path.join(unitDir, "kainbain-runner-local-x.service");
			fs.writeFileSync(unitFile, "[Service]\nExecStart=/usr/bin/node main.js\n");
			const got = spawnSync(
				"bash",
				[path.join(ROOT, "scripts", "install-local-runner.sh"), "--id", "local-x", "--manual", "--harness", "mock", "--ensure"],
				{ env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, encoding: "utf8" },
			);
			assert.equal(got.status, 0, got.stdout + got.stderr);
			assert.equal(fs.readFileSync(unitFile, "utf8"), "[Service]\nExecStart=/usr/bin/node main.js\n");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(bin, { recursive: true, force: true });
		}
	});
});

describe("startRunner.sh wrapper installs", () => {
	// A fake prod checkout: runner/ tree + the lib helper (copied from
	// the repo, like deploy.sh stages) + the script under test.
	const fakeProd = () => {
		const prod = fs.mkdtempSync(path.join(os.tmpdir(), "kb-startrunner-"));
		fakeTree(path.join(prod, "runner"));
		fs.mkdirSync(path.join(prod, "runner", "api", "node_modules"), { recursive: true });
		fs.mkdirSync(path.join(prod, "scripts", "lib"), { recursive: true });
		fs.copyFileSync(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"), path.join(prod, "scripts", "lib", "runner-install-root.sh"));
		fs.copyFileSync(path.join(ROOT, "startRunner.sh"), path.join(prod, "startRunner.sh"));
		return prod;
	};

	it("creates a wrapper unit and lays the versioned tree down", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		const prod = fakeProd();
		const { bin } = stubSystemctl();
		try {
			const got = spawnSync("bash", ["./startRunner.sh", "--id", "remote-x", "--manual", "--harness", "mock", "--backend", "http://127.0.0.1:1"], {
				cwd: prod,
				env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stdout + got.stderr);
			const root = path.join(home, ".kainbain", "runner-install");
			assert.equal(fs.readlinkSync(path.join(root, "current")), path.join(root, "releases", "0.1.0", "unpacked"));
			const unit = fs.readFileSync(path.join(home, ".config", "systemd", "user", "kainbain-runner-remote-x.service"), "utf8");
			assert.match(unit, /\/bin\/kainbain-runner$/m);
			assert.ok(!unit.includes("main.js"), "no direct node main.js entrypoint");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(prod, { recursive: true, force: true });
			fs.rmSync(bin, { recursive: true, force: true });
		}
	});

	it("--ensure rewrites direct units but leaves wrapper units alone", () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		const prod = fakeProd();
		const { bin, log } = stubSystemctl();
		try {
			const unitDir = path.join(home, ".config", "systemd", "user");
			fs.mkdirSync(unitDir, { recursive: true });
			const root = path.join(home, ".kainbain", "runner-install");
			fs.writeFileSync(
				path.join(unitDir, "kainbain-runner-wrapped.service"),
				`[Service]\nWorkingDirectory=${root}\nExecStart=${root}/bin/kainbain-runner\n`,
			);
			fs.writeFileSync(
				path.join(unitDir, "kainbain-runner-direct.service"),
				"[Service]\nWorkingDirectory=/old/tree\nExecStart=/usr/bin/node main.js\n",
			);
			const got = spawnSync("bash", ["./startRunner.sh", "--ensure"], {
				cwd: prod,
				env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stdout + got.stderr);
			const wrapped = fs.readFileSync(path.join(unitDir, "kainbain-runner-wrapped.service"), "utf8");
			assert.match(wrapped, new RegExp(`^WorkingDirectory=${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), "wrapper WorkingDirectory untouched");
			const direct = fs.readFileSync(path.join(unitDir, "kainbain-runner-direct.service"), "utf8");
			assert.match(direct, new RegExp(`^WorkingDirectory=${prod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/runner/runner$`, "m"), "direct unit repointed");
			const calls = fs.readFileSync(log, "utf8");
			assert.match(calls, /restart kainbain-runner-wrapped\.service/);
			assert.match(calls, /restart kainbain-runner-direct\.service/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(prod, { recursive: true, force: true });
			fs.rmSync(bin, { recursive: true, force: true });
		}
	});
});

describe("runner-install-root.sh helper", () => {
	it("lays down once and keeps an existing current (shared host root)", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			const root = path.join(sandbox, "install");
			const lay = () =>
				spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)}`,], {
					encoding: "utf8",
				});
			const first = lay();
			assert.equal(first.status, 0, first.stderr);
			assert.equal(first.stdout, "0.1.0");
			// A second tree version lays its own dir down but keeps the
			// first runner's current (self-update advances it on idle).
			fs.writeFileSync(path.join(tree, "runner", "version.json"), JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.2.0" }));
			const second = lay();
			assert.equal(second.status, 0, second.stderr);
			assert.equal(fs.readlinkSync(path.join(root, "current")), path.join(root, "releases", "0.1.0", "unpacked"));
			assert.ok(fs.existsSync(path.join(root, "releases", "0.2.0", "unpacked", "runner", "main.js")));
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("fails without touching the root when the tree is bad", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const root = path.join(sandbox, "install");
			const got = spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(path.join(sandbox, "empty"))} ${JSON.stringify(root)}`,], {
				encoding: "utf8",
			});
			assert.notEqual(got.status, 0);
			assert.equal(fs.existsSync(path.join(root, "current")), false);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});
});
