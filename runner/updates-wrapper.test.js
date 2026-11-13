import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WRAPPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bin", "kainbain-runner");

const haveBash = () => {
	try {
		const probed = spawnSync("bash", ["--version"], { stdio: "ignore" });
		return probed.status === 0;
	} catch {
		return false;
	}
};

// A fake install root: releases/<v>/unpacked/runner/main.js per version,
// plus the `current` symlink the wrapper resolves. The fake entrypoints
// are plain node scripts (the wrapper runs `node <tree>/runner/main.js`).
const fakeInstall = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wrapper-"));
	const treeFor = (version) => {
		const unpacked = path.join(root, "releases", version, "unpacked");
		fs.mkdirSync(path.join(unpacked, "runner"), { recursive: true });
		return unpacked;
	};
	const writeEntry = (version, body) => {
		fs.writeFileSync(path.join(treeFor(version), "runner", "main.js"), body);
	};
	const pointCurrentAt = (version) => {
		const link = path.join(root, "current");
		try { fs.rmSync(link, { force: true }); } catch { /* ignore */ }
		fs.symlinkSync(treeFor(version), link);
	};
	return { root, writeEntry, pointCurrentAt };
};

const runWrapper = (root) =>
	spawnSync("bash", [WRAPPER], {
		env: { ...process.env, KAINBAIN_RUNNER_INSTALL_ROOT: root },
		encoding: "utf8",
	});

describe("kainbain-runner wrapper restart gate", () => {
	it("stops after a normal completion instead of re-running finished work", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		const marker = path.join(root, "ran-v1");
		writeEntry("0.1.0", `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 0);
		assert.ok(fs.existsSync(marker), "the installed tree ran once");
		assert.ok(!String(got.stdout || "").includes("restarting into"), "no restart without a staged update");
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("restarts exactly once into a staged update, then stops", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		const markerV2 = path.join(root, "ran-v2");
		const v2Tree = path.join(root, "releases", "0.2.0", "unpacked");
		fs.mkdirSync(path.join(v2Tree, "runner"), { recursive: true });
		// v1 stages an update (flips `current`, like applyUpdate does) and
		// exits 0; v2 boots cleanly with nothing new staged.
		writeEntry(
			"0.1.0",
			`require("fs").symlinkSync(${JSON.stringify(v2Tree)}, ${JSON.stringify(path.join(root, "current.tmp"))});\n` +
				`require("fs").renameSync(${JSON.stringify(path.join(root, "current.tmp"))}, ${JSON.stringify(path.join(root, "current"))});\n`,
		);
		fs.writeFileSync(
			path.join(v2Tree, "runner", "main.js"),
			`require("fs").writeFileSync(${JSON.stringify(markerV2)}, "ran");\n`,
		);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 0);
		assert.ok(fs.existsSync(markerV2), "the wrapper rebooted into the staged version");
		assert.ok(String(got.stdout || "").includes("restarting into"), "the restart is announced");
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("propagates a daemon failure without restarting", () => {
		if (!haveBash()) return;
		const { root, writeEntry, pointCurrentAt } = fakeInstall();
		writeEntry("0.1.0", `process.exit(3);\n`);
		pointCurrentAt("0.1.0");
		const got = runWrapper(root);
		assert.equal(got.status, 3);
		assert.ok(!String(got.stdout || "").includes("restarting into"), "a crash never restarts");
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("kainbain-runner doctor", () => {
	// A fake $HOME: systemd unit + env file plus a versioned install root
	// the doctor inspects. The backend is a local HTTP stub serving the
	// open GET /runners fleet list with this runner's record.
	const fakeHome = ({ entrypoint = "wrapper", version = "0.2.0", backendPort = 1, extraUnits = [] } = {}) => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-doctor-home-"));
		const root = path.join(home, "install");
		const unpacked = path.join(root, "releases", version, "unpacked");
		fs.mkdirSync(path.join(unpacked, "runner"), { recursive: true });
		fs.writeFileSync(path.join(unpacked, "version.json"), JSON.stringify({ component: "runner", runnerVersion: version }));
		fs.symlinkSync(unpacked, path.join(root, "current"));
		fs.writeFileSync(path.join(root, "update-state.json"), JSON.stringify({ status: "success", version, bootAttempts: 0 }));
		const unitDir = path.join(home, ".config", "systemd", "user");
		const envDir = path.join(home, ".kainbain");
		fs.mkdirSync(unitDir, { recursive: true });
		fs.mkdirSync(envDir, { recursive: true });
		const writeUnit = (id, kind) => {
			const short = id.replace(/^local-/, "");
			const envFile = path.join(envDir, `runner-${short}.env`);
			fs.writeFileSync(
				envFile,
				[
					`KAINBAIN_RUNNER_ID=${id}`,
					`KAINBAIN_RUNNER_BACKEND=http://127.0.0.1:${backendPort}`,
					`KAINBAIN_RUNNER_INSTALL_ROOT=${root}`,
					`KAINBAIN_RUNNER_WORK_ROOT=${home}/work`,
					`KAINBAIN_RUNNER_CREDENTIAL=secret-should-never-print`,
					"",
				].join("\n"),
			);
			const exec = kind === "wrapper" ? `${root}/bin/kainbain-runner` : "/usr/bin/node main.js";
			const wd = kind === "wrapper" ? root : path.join(home, "apps", "tree", "runner");
			if (kind === "direct") {
				fs.mkdirSync(wd, { recursive: true });
				fs.writeFileSync(path.join(wd, "version.json"), JSON.stringify({ component: "runner", runnerVersion: version }));
			}
			fs.writeFileSync(
				path.join(unitDir, `kainbain-runner-${short}.service`),
				["[Service]", `WorkingDirectory=${wd}`, `EnvironmentFile=${envFile}`, `ExecStart=${exec}`, "Restart=always", ""].join("\n"),
			);
		};
		writeUnit("local-alpha", entrypoint);
		for (const extra of extraUnits) writeUnit(extra.id, extra.entrypoint);
		return { home, root };
	};

	const runDoctor = (home, root, args = []) =>
		spawnSync("bash", [WRAPPER, "doctor", ...args], {
			env: { ...process.env, HOME: home, KAINBAIN_RUNNER_INSTALL_ROOT: root },
			encoding: "utf8",
		});

	// The stub backend runs in a CHILD process: runDoctor blocks this
	// process in spawnSync, so an in-process server could never answer.
	const serveRunners = (records) =>
		new Promise((resolve, reject) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-doctor-be-"));
			const script = path.join(dir, "server.mjs");
			fs.writeFileSync(
				script,
				`import http from "node:http";\nconst records = ${JSON.stringify(JSON.stringify(records))};\n` +
					`http.createServer((req, res) => {\nif (req.url === "/runners") { res.statusCode = 200; res.end(records); return; }\n` +
					`res.statusCode = 404; res.end("nope");\n}).listen(0, "127.0.0.1", function () { console.log(this.address().port); });\n`,
			);
			const proc = spawn("node", [script], { stdio: ["ignore", "pipe", "ignore"] });
			let out = "";
			const timer = setTimeout(() => {
				proc.kill();
				reject(new Error("stub backend did not report its port"));
			}, 10000);
			proc.stdout.on("data", (chunk) => {
				out += String(chunk);
				const port = Number.parseInt(out.trim(), 10);
				if (Number.isFinite(port) && port > 0) {
					clearTimeout(timer);
					resolve({
						port,
						close: () => {
							proc.kill();
							fs.rmSync(dir, { recursive: true, force: true });
						},
					});
				}
			});
			proc.on("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
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

	it("reports a healthy wrapper install as ok with the backend record", async () => {
		if (!haveBash()) return;
		const server = await serveRunners([
			{ runnerId: "local-alpha", runnerVersion: "0.2.0", recommendedVersion: "0.2.0", minimumVersion: "0.1.0", updateAvailable: false, belowMinimum: false, updateStatus: null },
		]);
		try {
			const { home, root } = fakeHome({ backendPort: server.port });
			try {
				const got = runDoctor(home, root);
				const out = String(got.stdout || "");
				assert.equal(got.status, 0, out + got.stderr);
				assert.match(out, /install_root: /);
				assert.match(out, /installed_version: 0\.2\.0/);
				assert.match(out, /entrypoint: wrapper/);
				assert.match(out, /backend: reachable/);
				assert.match(out, /desired=0\.2\.0 minimum=0\.1\.0/);
				assert.match(out, /status: ok/);
				assert.ok(!out.includes("secret-should-never-print"), "credentials are never printed");
			} finally {
				fs.rmSync(home, { recursive: true, force: true });
			}
		} finally {
			server.close();
		}
	});

	it("flags a direct node main.js entrypoint with exit 1", () => {
		if (!haveBash()) return;
		const { home, root } = fakeHome({ entrypoint: "direct" });
		try {
			const got = runDoctor(home, root);
			const out = String(got.stdout || "");
			assert.equal(got.status, 1, out);
			assert.match(out, /entrypoint: direct/);
			assert.match(out, /attention: .*directly/);
			assert.match(out, /status: attention/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("flags a missing current symlink with exit 1", () => {
		if (!haveBash()) return;
		const { home, root } = fakeHome();
		try {
			fs.rmSync(path.join(root, "current"), { force: true });
			const got = runDoctor(home, root);
			const out = String(got.stdout || "");
			assert.equal(got.status, 1, out);
			assert.match(out, /current: \(missing\)/);
			assert.match(out, /installed_version: \(unknown\)/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("reports an unreachable backend but keeps exit 0 (network state, not install damage)", () => {
		if (!haveBash()) return;
		const { home, root } = fakeHome({ backendPort: 1 });
		try {
			const got = runDoctor(home, root);
			const out = String(got.stdout || "");
			assert.equal(got.status, 0, out);
			assert.match(out, /backend: unreachable/);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("writes nothing: the tree is byte-identical before and after", () => {
		if (!haveBash()) return;
		const { home, root } = fakeHome();
		try {
			const before = snapshotTree(home);
			runDoctor(home, root);
			assert.deepEqual(snapshotTree(home), before);
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("supports --verify-install and --unit filtering", () => {
		if (!haveBash()) return;
		const { home, root } = fakeHome({ extraUnits: [{ id: "local-bravo", entrypoint: "direct" }] });
		try {
			const alias = spawnSync("bash", [WRAPPER, "--verify-install"], {
				env: { ...process.env, HOME: home, KAINBAIN_RUNNER_INSTALL_ROOT: root },
				encoding: "utf8",
			});
			assert.equal(alias.status, 1, "bravo's direct entrypoint trips attention through the alias");
			const filtered = runDoctor(home, root, ["--unit", "kainbain-runner-alpha"]);
			const out = String(filtered.stdout || "");
			assert.equal(filtered.status, 0, out);
			assert.ok(out.includes("unit: kainbain-runner-alpha.service"), "the selected unit is reported");
			assert.ok(!out.includes("local-bravo"), "other units are skipped");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
		}
	});
});
