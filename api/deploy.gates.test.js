import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * MARK: Deploy gate behaviour tests
 * @description Exercises the real `run_gate` / `write_lock_busy` function
 *   bodies from `deploy.sh` (extracted verbatim, never re-typed) in a
 *   throwaway DEPLOY_DIR: a lock-busy waiter must leave last-result.json and
 *   state.json byte-identical while recording the sidecar + history, and a
 *   failing gate must name itself with an output tail in `details`. Also pins
 *   the structural contracts: no conflict markers, `bash -n` clean, the
 *   narrowed lock (flock after the gates), waiter exit 75, and the TOCTOU
 *   re-verification of HEAD.
 * @example run `npm run test --prefix api -- deploy.gates`
 */
const repoRoot = path.resolve(import.meta.dirname, "..");
const deployScript = fs.readFileSync(path.join(repoRoot, "deploy.sh"), "utf8");

function hasBash() {
	try {
		const probe = spawnSync("bash", ["--version"], { stdio: "ignore" });
		return !probe.error;
	} catch {
		return false;
	}
}

function hasJq() {
	try {
		const probe = spawnSync("jq", ["--version"], { stdio: "ignore" });
		return !probe.error;
	} catch {
		return false;
	}
}

/**
 * Extracts top-level `name() { ... }` function bodies verbatim from the real
 * deploy.sh so the behavioural tests execute production code, not a copy.
 * Throws when a function cannot be found (drift fails loudly, not silently).
 */
function extractFunctions(names) {
	const lines = deployScript.split("\n");
	const bodies = [];
	for (const name of names) {
		const start = lines.findIndex((line) => line === `${name}() {`);
		if (start === -1) throw new Error(`deploy.sh function not found: ${name}()`);
		let end = -1;
		for (let i = start + 1; i < lines.length; i++) {
			if (lines[i] === "}") {
				end = i;
				break;
			}
		}
		if (end === -1) throw new Error(`deploy.sh function unterminated: ${name}()`);
		bodies.push(lines.slice(start, end + 1).join("\n"));
	}
	return bodies.join("\n\n");
}

const HELPERS = [
	"log",
	"current_build",
	"write_result",
	"write_lock_busy",
	"gate_tail",
	"run_gate",
];

function bashPrelude(deployDir) {
	return [
		`export DEPLOY_DIR=${JSON.stringify(deployDir)}`,
		`export LOCK_FILE=${JSON.stringify(path.join(deployDir, "deploy.lock"))}`,
		`export LOG_FILE=${JSON.stringify(path.join(deployDir, "deploy.log"))}`,
		`export STATE_FILE=${JSON.stringify(path.join(deployDir, "state.json"))}`,
		`export RESULT_FILE=${JSON.stringify(path.join(deployDir, "last-result.json"))}`,
		`export HISTORY_FILE=${JSON.stringify(path.join(deployDir, "history.jsonl"))}`,
		`export LOCK_BUSY_FILE=${JSON.stringify(path.join(deployDir, "lock-busy.json"))}`,
		`export BUILD_COUNTER=${JSON.stringify(path.join(deployDir, "build.txt"))}`,
		`export MODE="prod" GATE_TAIL_LINES="40"`,
		extractFunctions(HELPERS),
	].join("\n");
}

function runHelperScript(deployDir, body) {
	return spawnSync("bash", ["-c", `${bashPrelude(deployDir)}\n${body}`], {
		encoding: "utf8",
		timeout: 30000,
	});
}

const describeIfBashJq = hasBash() && hasJq() ? describe : describe.skip;

describe("deploy.sh structural contracts", () => {
	it("contains no merge-conflict markers", () => {
		expect(deployScript).not.toMatch(/^<<<<<<< /m);
		expect(deployScript).not.toMatch(/^>>>>>>> /m);
		expect(deployScript).not.toMatch(/^=======$/m);
	});

	it("passes bash -n", () => {
		if (!hasBash()) return;
		const probe = spawnSync("bash", ["-n", path.join(repoRoot, "deploy.sh")], {
			encoding: "utf8",
		});
		expect(probe.status).toBe(0);
	});

	it("records lock contention WITHOUT clobbering last-result.json", () => {
		expect(deployScript).toContain("write_lock_busy");
		expect(deployScript).toContain("exit 75");
		expect(deployScript).not.toContain(
			'write_result "failed" "Another deployment is already in progress"',
		);
		expect(deployScript).toContain("$_holder_started");
		expect(deployScript).not.toMatch(/\$holder_started\b/);
	});

	it("holds the lock only for the swap, with a TOCTOU re-check", () => {
		// Scope to the prod section: rollback mode keeps its own (already
		// narrow) lock above, which must not satisfy this assertion.
		const prodSection = deployScript.slice(
			deployScript.indexOf("# --- Production deploy"),
		);
		const stagedGate = prodSection.indexOf('run_gate "staged-install"');
		const lockAcquire = prodSection.indexOf('flock -w "$LOCK_TIMEOUT" 9');
		expect(stagedGate).toBeGreaterThan(-1);
		expect(lockAcquire).toBeGreaterThan(stagedGate);
		expect(deployScript).toContain("PRE_GATE_HEAD");
		expect(deployScript).toContain("POST_LOCK_HEAD");
	});

	it("runs every blocking gate through run_gate", () => {
		for (const gate of [
			'run_gate "final-test-suite"',
			'run_gate "canary-e2e"',
			'run_gate "frontend-build"',
			'run_gate "api-install"',
			'run_gate "staged-install"',
		]) {
			expect(deployScript).toContain(gate);
		}
	});

	it("drains the canary scratch ports before the canary-e2e gate", () => {
		const drainCall = deployScript.indexOf("drain-ports.sh 3399 5299");
		const canaryGate = deployScript.indexOf('run_gate "canary-e2e"');
		expect(drainCall).toBeGreaterThan(-1);
		expect(canaryGate).toBeGreaterThan(-1);
		expect(drainCall).toBeLessThan(canaryGate);
	});

	it("keeps test parity with npm test without running canary twice", () => {
		// `npm test` runs the ten fast branches plus the canary suite in one
		// gate. Deploy keeps the identical coverage, split across its two
		// named gates: final-test-suite must pass --no-canary so the canary
		// suite runs exactly once, in the blocking canary-e2e gate below it
		// (the #KB-0417 parity fix).
		expect(deployScript).toContain('run_gate "final-test-suite" "./run-tests.sh --no-canary" ./run-tests.sh --no-canary');
		expect(deployScript).toContain('run_gate "canary-e2e" "npm run test:canary" npm run test:canary');
		expect(
			deployScript.indexOf('run_gate "final-test-suite"'),
		).toBeLessThan(deployScript.indexOf('run_gate "canary-e2e"'));
	});
});

/**
 * MARK: drain-ports behaviour
 * @description Proves `scripts/drain-ports.sh` actually frees an occupied
 *   scratch port, is a no-op on a free port, skips invalid input, and prefers
 *   the verified `canary-preflight.mjs` when the repository ships it. The
 *   occupant is a CHILD node process (never the test worker) so a real
 *   SIGTERM is observable without the suite killing itself.
 */
describeIfBashJq("drain-ports.sh behaviour", () => {
	const repoDrainScript = path.join(repoRoot, "scripts", "drain-ports.sh");
	const repoFreePort = path.join(repoRoot, "scripts", "free-port.mjs");
	const tempDirs = [];

	afterAll(() => {
		for (const dir of tempDirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// best effort
			}
		}
	});

	// The fallback tests run an ISOLATED copy of the script with NO
	// `canary-preflight.mjs` sibling, so they always exercise the per-port
	// `free-port.mjs` path regardless of whether the repo ships the verified
	// preflight (it does after the reliability branches merge). This keeps the
	// test meaningful on any branch and on any host.
	function isolatedDrainDir() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-drain-"));
		tempDirs.push(dir);
		fs.copyFileSync(repoDrainScript, path.join(dir, "drain-ports.sh"));
		fs.copyFileSync(repoFreePort, path.join(dir, "free-port.mjs"));
		return path.join(dir, "drain-ports.sh");
	}

	function spawnOccupant(port) {
		const child = spawn(
			process.execPath,
			[
				"-e",
				`require("node:net").createServer().listen(${port}, "0.0.0.0", () => console.log("LISTENING"));`,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("occupant did not start listening")),
				10000,
			);
			child.stdout.on("data", (chunk) => {
				if (String(chunk).includes("LISTENING")) {
					clearTimeout(timer);
					resolve(child);
				}
			});
			child.on("error", reject);
		});
	}

	function isPortFree(port) {
		return new Promise((resolve) => {
			const probe = net.createServer();
			probe.once("error", (err) => {
				probe.close();
				resolve(err.code !== "EADDRINUSE");
			});
			probe.listen(port, "0.0.0.0", () => probe.close(() => resolve(true)));
		});
	}

	async function waitForPortFree(port, timeoutMs = 5000) {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			if (await isPortFree(port)) return true;
			if (Date.now() >= deadline) return false;
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	async function ephemeralPort() {
		return new Promise((resolve) => {
			const server = net.createServer();
			server.listen(0, "0.0.0.0", () => {
				const { port } = server.address();
				server.close(() => resolve(port));
			});
		});
	}

	it("frees an occupied port (free-port fallback) within a few seconds", async () => {
		const port = await ephemeralPort();
		const occupant = await spawnOccupant(port);
		try {
			expect(await isPortFree(port)).toBe(false);
			const result = spawnSync("bash", [isolatedDrainDir(), String(port)], {
				encoding: "utf8",
				timeout: 20000,
			});
			expect(result.status).toBe(0);
			expect(await waitForPortFree(port)).toBe(true);
		} finally {
			try {
				occupant.kill("SIGKILL");
			} catch {
				// already gone
			}
		}
	});

	it("is a no-op on an already-free port and still exits 0", async () => {
		const port = await ephemeralPort();
		const result = spawnSync("bash", [isolatedDrainDir(), String(port)], {
			encoding: "utf8",
			timeout: 20000,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/already free/i);
	});

	it("skips invalid port arguments and exits 0", () => {
		const result = spawnSync("bash", [isolatedDrainDir(), "not-a-port"], {
			encoding: "utf8",
			timeout: 20000,
		});
		expect(result.status).toBe(0);
		expect(result.stderr).toMatch(/skipping invalid port/i);
	});

	it("prefers the verified canary-preflight.mjs when present", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-drain-pref-"));
		tempDirs.push(dir);
		const marker = path.join(dir, "preflight-ran.txt");
		fs.copyFileSync(repoDrainScript, path.join(dir, "drain-ports.sh"));
		fs.writeFileSync(
			path.join(dir, "canary-preflight.mjs"),
			`import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
		);
		const result = spawnSync(
			"bash",
			[path.join(dir, "drain-ports.sh"), "3399"],
			{ encoding: "utf8", timeout: 20000 },
		);
		expect(result.status).toBe(0);
		expect(fs.existsSync(marker)).toBe(true);
	});
});

describeIfBashJq("write_lock_busy behaviour (real function bodies)", () => {
	let deployDir;
	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-gates-"));
		fs.writeFileSync(
			path.join(deployDir, "last-result.json"),
			'{"status":"success","buildNumber":292}\n',
		);
		fs.writeFileSync(path.join(deployDir, "state.json"), '{"status":"success"}\n');
	});

	it("leaves last-result.json and state.json byte-identical", () => {
		const before = [
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
			fs.readFileSync(path.join(deployDir, "state.json"), "utf8"),
		];
		const probe = runHelperScript(deployDir, `write_lock_busy "test holder"`);
		expect(probe.status).toBe(0);
		expect(fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8")).toBe(
			before[0],
		);
		expect(fs.readFileSync(path.join(deployDir, "state.json"), "utf8")).toBe(
			before[1],
		);
	});

	it("writes the lock-busy sidecar and appends history", () => {
		const probe = runHelperScript(deployDir, `write_lock_busy "test holder"`);
		expect(probe.status).toBe(0);
		const sidecar = JSON.parse(
			fs.readFileSync(path.join(deployDir, "lock-busy.json"), "utf8"),
		);
		expect(sidecar.status).toBe("lock-busy");
		expect(sidecar.message).toMatch(/already in progress/i);
		expect(sidecar.message).toMatch(/retry/i);
		const history = fs
			.readFileSync(path.join(deployDir, "history.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(history).toHaveLength(1);
		expect(history[0].status).toBe("lock-busy");
	});
});

describeIfBashJq("run_gate behaviour (real function bodies)", () => {
	let deployDir;
	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-gates-"));
	});

	it("passes a healthy gate with start/finish lines", () => {
		const probe = runHelperScript(
			deployDir,
			`run_gate "probe-ok" "true-cmd" true`,
		);
		expect(probe.status).toBe(0);
		const gateLogs = fs
			.readdirSync(deployDir)
			.filter((name) => name.startsWith("gate-probe-ok-"));
		expect(gateLogs).toHaveLength(1);
		const deployLog = fs.readFileSync(path.join(deployDir, "deploy.log"), "utf8");
		expect(deployLog).toMatch(/Gate 'probe-ok' starting/);
		expect(deployLog).toMatch(/Gate 'probe-ok' passed/);
	});

	it("names the failing gate with its output tail in details", () => {
		const probe = runHelperScript(
			deployDir,
			`run_gate "probe-fail" "false-cmd" bash -c 'echo PROBEFAILTAIL; exit 3'`,
		);
		expect(probe.status).toBe(3);
		expect(probe.stdout).toMatch(/PROBEFAILTAIL/);
		const result = JSON.parse(
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
		);
		expect(result.status).toBe("failed");
		expect(result.message).toMatch(/probe-fail/);
		expect(result.failedCommand).toBe("false-cmd");
		expect(result.exitCode).toBe(3);
		expect(result.details).toMatch(/PROBEFAILTAIL/);
	});
});
