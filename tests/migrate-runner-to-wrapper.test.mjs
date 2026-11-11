import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "migrate-runner-to-wrapper.sh");

// A fake $HOME holding a direct-entrypoint install: source tree shaped
// like the deploy layout (tree/{runner,api,shared}), a systemd unit
// running `node main.js`, and an env file. The script only touches $HOME,
// so sandboxed runs can never reach the operator's real units.
const fakeHome = () => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-migrate-home-"));
	const tree = path.join(home, "apps", "kainbain", "runner");
	fs.mkdirSync(path.join(tree, "runner", "bin"), { recursive: true });
	fs.mkdirSync(path.join(tree, "api"), { recursive: true });
	fs.mkdirSync(path.join(tree, "shared"), { recursive: true });
	fs.writeFileSync(path.join(tree, "runner", "main.js"), "export const main = () => 0;\n");
	fs.writeFileSync(path.join(tree, "runner", "version.json"), JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.1.0" }));
	// The fake tree's wrapper answers `doctor` like the real one (the real
	// doctor is covered in runner/updates-wrapper.test.js); this pins that
	// the migration invokes it for verification.
	fs.writeFileSync(
		path.join(tree, "runner", "bin", "kainbain-runner"),
		'#!/bin/bash\nif [ "${1:-}" = "doctor" ]; then echo "status: ok"; exit 0; fi\necho shim-source\n',
	);
	fs.writeFileSync(path.join(tree, "api", "probe.js"), "export const probe = 1;\n");
	fs.writeFileSync(path.join(tree, "shared", "note.js"), "export const note = 1;\n");
	const unitDir = path.join(home, ".config", "systemd", "user");
	const envDir = path.join(home, ".kainbain");
	fs.mkdirSync(unitDir, { recursive: true });
	fs.mkdirSync(envDir, { recursive: true });
	const envFile = path.join(envDir, "runner-server2-alpha.env");
	fs.writeFileSync(envFile, "KAINBAIN_RUNNER_ID=server2-alpha\nKAINBAIN_RUNNER_WORK_ROOT=/nowhere\n");
	const unitFile = path.join(unitDir, "kainbain-runner-server2-alpha.service");
	fs.writeFileSync(
		unitFile,
		["[Unit]", "Description=test", "", "[Service]", `WorkingDirectory=${tree}/runner`, `EnvironmentFile=${envFile}`, "ExecStart=/usr/bin/node main.js", "Restart=always", ""].join("\n"),
	);
	return { home, tree, unitFile, envFile, root: path.join(home, ".kainbain", "runner-install") };
};

const runMigrate = (home, args, extraEnv = {}) =>
	spawnSync("bash", [SCRIPT, ...args], {
		env: { ...process.env, HOME: home, ...extraEnv },
		encoding: "utf8",
	});

const snapshotTree = (dir) => {
	const out = [];
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isSymbolicLink()) out.push(`${path.relative(dir, full)} -> ${fs.readlinkSync(full)}`);
			else out.push(`${path.relative(dir, full)} = ${fs.readFileSync(full, "utf8")}`);
		}
	};
	walk(dir);
	return out.sort();
};

describe("migrate-runner-to-wrapper.sh", () => {
	it("--dry-run prints the plan and changes nothing", () => {
		const { home } = fakeHome();
		try {
			const before = snapshotTree(home);
			const got = runMigrate(home, ["--id", "server2-alpha", "--dry-run"]);
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, /Source: .*runner \(version 0\.1\.0\)/);
			assert.match(got.stdout, /dry-run: nothing laid down/);
			assert.deepEqual(snapshotTree(home), before);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("lays down the versioned tree, shim, unit, and env (same version)", () => {
		const { home, tree, unitFile, envFile, root } = fakeHome();
		try {
			const got = runMigrate(home, ["--id", "server2-alpha", "--no-restart"]);
			assert.equal(got.status, 0, got.stdout + got.stderr);
			const unpacked = path.join(root, "releases", "0.1.0", "unpacked");
			assert.equal(fs.readlinkSync(path.join(root, "current")), unpacked);
			assert.equal(
				JSON.parse(fs.readFileSync(path.join(unpacked, "version.json"), "utf8")).runnerVersion,
				"0.1.0",
				"same version, new layout — no update is staged",
			);
			assert.ok(fs.existsSync(path.join(unpacked, "runner", "main.js")));
			assert.ok(fs.existsSync(path.join(unpacked, "api", "probe.js")));
			assert.ok(fs.existsSync(path.join(unpacked, "shared", "note.js")));
			const shim = path.join(root, "bin", "kainbain-runner");
			assert.ok(fs.existsSync(shim));
			assert.ok((fs.statSync(shim).mode & 0o111) !== 0, "shim is executable");
			const unit = fs.readFileSync(unitFile, "utf8");
			assert.match(unit, new RegExp(`^ExecStart=${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/bin/kainbain-runner$`, "m"));
			assert.match(unit, new RegExp(`^WorkingDirectory=${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
			assert.match(fs.readFileSync(envFile, "utf8"), /^KAINBAIN_RUNNER_INSTALL_ROOT=/m);
			assert.ok(fs.readdirSync(path.dirname(unitFile)).some((f) => f.startsWith("kainbain-runner-server2-alpha.service.bak-")), "unit snapshot kept");
			assert.ok(fs.readdirSync(path.dirname(envFile)).some((f) => f.startsWith("runner-server2-alpha.env.bak-")), "env snapshot kept");
			assert.ok(tree.length > 0);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("is idempotent: re-running a migrated unit exits 0 unchanged", () => {
		const { home } = fakeHome();
		try {
			assert.equal(runMigrate(home, ["--id", "server2-alpha", "--no-restart"]).status, 0);
			const before = snapshotTree(home);
			const got = runMigrate(home, ["--id", "server2-alpha", "--no-restart"]);
			assert.equal(got.status, 0, got.stderr);
			assert.match(got.stdout, /Already migrated/);
			assert.deepEqual(snapshotTree(home), before);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("refuses unknown units, missing trees, and existing current links", () => {
		const { home, tree } = fakeHome();
		try {
			assert.notEqual(runMigrate(home, ["--id", "nope", "--dry-run"]).status, 0);
			fs.rmSync(path.join(tree, "runner", "main.js"));
			const missing = runMigrate(home, ["--id", "server2-alpha", "--dry-run"]);
			assert.notEqual(missing.status, 0);
			assert.match(missing.stdout + missing.stderr, /no main\.js/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
		const { home: home2, root } = fakeHome();
		try {
			fs.mkdirSync(root, { recursive: true });
			fs.symlinkSync(path.join(root, "releases", "9.9.9", "unpacked"), path.join(root, "current"));
			const clash = runMigrate(home2, ["--id", "server2-alpha", "--no-restart"]);
			assert.notEqual(clash.status, 0);
			assert.match(clash.stdout + clash.stderr, /refusing to overwrite/);
		} finally {
			fs.rmSync(home2, { recursive: true, force: true });
		}
	});

	it("reloads, restarts, and verifies through the doctor (stubbed systemctl)", () => {
		const { home } = fakeHome();
		const bin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-migrate-bin-"));
		const callsLog = path.join(bin, "calls.log");
		try {
			fs.writeFileSync(
				path.join(bin, "systemctl"),
				`#!/bin/bash\necho "$*" >> ${JSON.stringify(callsLog)}\nif [ "$1 $2" = "--user is-active" ]; then echo active; fi\nexit 0\n`,
			);
			fs.chmodSync(path.join(bin, "systemctl"), 0o755);
			// Run once with --no-restart, then revert the unit to direct so
			// the restart path below has work to do.
			const first = runMigrate(home, ["--id", "server2-alpha", "--no-restart"]);
			assert.equal(first.status, 0, first.stdout + first.stderr);
			const unitFile = path.join(home, ".config", "systemd", "user", "kainbain-runner-server2-alpha.service");
			const snap = fs.readdirSync(path.dirname(unitFile)).find((f) => f.includes(".bak-"));
			fs.copyFileSync(path.join(path.dirname(unitFile), snap), unitFile);
			fs.rmSync(path.join(home, ".kainbain", "runner-install", "current"));
			const got = runMigrate(home, ["--id", "server2-alpha"], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
			assert.equal(got.status, 0, got.stdout + got.stderr);
			const calls = fs.readFileSync(callsLog, "utf8");
			assert.match(calls, /--user daemon-reload/);
			assert.match(calls, /--user restart kainbain-runner-server2-alpha\.service/);
			assert.match(got.stdout, /status: ok/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(bin, { recursive: true, force: true });
		}
	});
});
