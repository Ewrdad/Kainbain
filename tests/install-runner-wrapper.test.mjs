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
const childEnv = (home, extra = {}) => {
	// The installers honor KAINBAIN_RUNNER_INSTALL_ROOT as an operational
	// override of the $HOME-derived default, and the CI host itself runs
	// with that variable set (its own live install root). A child that
	// inherits it would report and write outside the fake $HOME: the
	// dry-run assertion would see the host path, real runs would lay the
	// versioned tree into the live host root, and the fake-home readlink
	// would fail with ENOENT. Strip it so every assertion observes the
	// $HOME-derived layout the test actually built.
	const env = { ...process.env, HOME: home, ...extra };
	delete env.KAINBAIN_RUNNER_INSTALL_ROOT;
	return env;
};
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
				env: childEnv(home),
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, new RegExp(`INSTALL_ROOT=${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.kainbain/runner-install`));
			assert.deepEqual(fs.readdirSync(home), [], "dry-run writes nothing under HOME");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("ignores a host KAINBAIN_RUNNER_INSTALL_ROOT so CI never installs outside the fake HOME", () => {
		// The CI host itself runs with KAINBAIN_RUNNER_INSTALL_ROOT set to
		// its own live install root; an inheriting child would report that
		// host path and lay the versioned tree into it instead of the fake
		// HOME (dry-run mismatch plus ENOENT on <fakehome>/current).
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-home-"));
		const decoy = fs.mkdtempSync(path.join(os.tmpdir(), "kb-install-decoy-"));
		try {
			const got = spawnSync("bash", [path.join(ROOT, "scripts", "install-local-runner.sh"), "--id", "local-x", "--manual", "--harness", "mock", "--dry-run"], {
				env: childEnv(home, { KAINBAIN_RUNNER_INSTALL_ROOT: path.join(decoy, "runner-install", "local-alpha") }),
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, new RegExp(`INSTALL_ROOT=${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.kainbain/runner-install`));
			assert.ok(!got.stdout.includes(decoy), "dry-run must not mention the host override");
			assert.deepEqual(fs.readdirSync(home), [], "dry-run writes nothing under HOME");
			assert.deepEqual(fs.readdirSync(decoy), [], "dry-run writes nothing under the host override");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(decoy, { recursive: true, force: true });
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
				{ env: childEnv(home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` }), encoding: "utf8" },
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
				{ env: childEnv(home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` }), encoding: "utf8" },
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
				env: childEnv(home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` }),
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
				env: childEnv(home, { PATH: `${bin}${path.delimiter}${process.env.PATH}` }),
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

	it("fails with the missing path named and swaps nothing when the copy lands incomplete (silent-old-boot guard)", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			const root = path.join(sandbox, "install");
			// A stub cp that "succeeds" but copies nothing simulates a partial
			// extract (e.g. missing --strip-components=1): the post-copy
			// asserts must catch it, name the missing entrypoint, and leave no
			// unpacked/, no current, and no staging leftovers behind.
			const stubBin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-stubcp-"));
			fs.writeFileSync(path.join(stubBin, "cp"), "#!/bin/bash\nexit 0\n");
			fs.chmodSync(path.join(stubBin, "cp"), 0o755);
			const got = spawnSync(
				"bash",
				["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)}`,],
				{ encoding: "utf8", env: { ...process.env, PATH: `${stubBin}${path.delimiter}${process.env.PATH}` } },
			);
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /lay-down incomplete, missing .*runner\/main\.js/, "the error names the missing entrypoint");
			assert.equal(fs.existsSync(path.join(root, "releases", "0.1.0", "unpacked")), false, "no partial tree is swapped in");
			assert.equal(fs.existsSync(path.join(root, "current")), false, "current never points at a partial tree");
			assert.deepEqual(fs.readdirSync(path.join(root, "releases", "0.1.0")), [], "the staging dir is cleaned up on failure");
			fs.rmSync(stubBin, { recursive: true, force: true });
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("fails cleanly when the staging dir cannot be created", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			const root = path.join(sandbox, "install");
			// A regular file where the staging parent must be a directory:
			// mkdir fails, so the lay-down aborts before any copy.
			const blocker = path.join(sandbox, "blocker");
			fs.writeFileSync(blocker, "not a dir");
			const got = spawnSync(
				"bash",
				["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)} ${JSON.stringify(path.join(blocker, "stage"))}`,],
				{ encoding: "utf8" },
			);
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /cannot create staging dir/, "the error names the staging failure");
			assert.equal(fs.existsSync(path.join(root, "current")), false);
			assert.equal(fs.existsSync(path.join(root, "releases")), false, "nothing is laid down");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("re-laying the same version replaces the tree wholesale — no stale files survive", () => {
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
			const unpacked = path.join(root, "releases", "0.1.0", "unpacked");
			// Simulate a file the new tree no longer ships (an old-boot
			// leftover): a re-lay must remove it, not merge around it.
			fs.writeFileSync(path.join(unpacked, "runner", "stale.js"), "old\n");
			const second = lay();
			assert.equal(second.status, 0, second.stderr);
			assert.equal(second.stdout, "0.1.0");
			assert.equal(fs.existsSync(path.join(unpacked, "runner", "stale.js")), false, "stale files never survive a re-lay");
			assert.ok(fs.existsSync(path.join(unpacked, "runner", "main.js")), "the new tree is in place");
			assert.equal(fs.readlinkSync(path.join(root, "current")), unpacked, "current still points at the release");
			assert.deepEqual(
				fs.readdirSync(path.join(root, "releases", "0.1.0")).filter((name) => name.includes("incoming") || name.includes(".old")),
				[],
				"no staging or backup dirs are left behind",
			);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("rejects an unsafe runnerVersion (path traversal) before writing anything", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			fs.writeFileSync(path.join(tree, "runner", "version.json"), JSON.stringify({ runnerVersion: "../../evil" }));
			const root = path.join(sandbox, "install");
			const got = spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)}`,], {
				encoding: "utf8",
			});
			assert.notEqual(got.status, 0);
			assert.match(got.stderr, /refusing unsafe runnerVersion/, "the bad version is named");
			assert.equal(fs.existsSync(root), false, "nothing is created under the install root");
			assert.equal(fs.existsSync(path.join(sandbox, "evil")), false, "no path traversal happened");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("fails with usage when called without arguments", () => {
		const got = spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root`], {
			encoding: "utf8",
		});
		assert.notEqual(got.status, 0);
		assert.match(got.stderr, /usage: lay_down_runner_install_root/);
	});

	it("warns (not fails) when the tree ships no pi discovery dependency", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			const root = path.join(sandbox, "install");
			const got = spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)}`,], {
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stderr, /no pi discovery dependency/, "the operator is told the pi leg will report LEG_MODULE_MISSING");
			assert.match(got.stderr, /scripts\/package-runner\.sh/, "the warning names the bundle remediation");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("stays quiet about the pi leg when the dependency ships in the tree", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-laydown-"));
		try {
			const tree = path.join(sandbox, "tree");
			fakeTree(tree);
			const piDep = path.join(tree, "api", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "utils", "child-process.js");
			fs.mkdirSync(path.dirname(piDep), { recursive: true });
			fs.writeFileSync(piDep, "stub\n");
			const root = path.join(sandbox, "install");
			const got = spawnSync("bash", ["-c", `. ${JSON.stringify(path.join(ROOT, "scripts", "lib", "runner-install-root.sh"))} && lay_down_runner_install_root ${JSON.stringify(tree)} ${JSON.stringify(root)}`,], {
				encoding: "utf8",
			});
			assert.equal(got.status, 0, got.stderr);
			assert.doesNotMatch(got.stderr, /no pi discovery dependency/);
			assert.ok(fs.existsSync(path.join(root, "releases", "0.1.0", "unpacked", "api", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "utils", "child-process.js")));
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});
});
