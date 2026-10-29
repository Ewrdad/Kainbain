/* eslint-disable security/detect-non-literal-fs-filename -- temp dirs and fixed repo-relative paths under test */
import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * MARK: Deploy attempt-checkpoint behaviour tests
 * @description Exercises the real per-attempt checkpoint helpers from
 *   `deploy.sh` (extracted verbatim, never re-typed) in a throwaway
 *   DEPLOY_DIR. The checkpoint is the durable fact behind "one deploy per
 *   engine stage attempt": a re-dispatched "Merge and deploy" stage adopts a
 *   terminal checkpoint's outcome (or waits for a still-running deploy)
 *   instead of starting a second full deploy + service restart — the resume
 *   loop this change closes. Also pins the structural contract that the prod
 *   block consults the checkpoint BEFORE any gate runs, and that the engine
 *   attempt id is re-pinned through the systemd-run re-exec (transient units
 *   do not inherit the caller's environment).
 * @example run `npm run test --prefix api -- deploy.attemptCheckpoint`
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
			const line = lines[i];
			if (line === "}") {
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
	"attempt_checkpoint_status",
	"attempt_checkpoint_field",
	"attempt_pid_alive",
	"write_attempt_checkpoint",
	"adopt_attempt_outcome",
	"newest_attempt_checkpoint_for_operation_key",
	"adopt_attempt_by_operation_key",
	"maybe_adopt_attempt_entry",
];

function bashPrelude(deployDir, attemptId = "deploy-t-1-12345", attemptWaitSeconds) {
	return [
		`export DEPLOY_DIR=${JSON.stringify(deployDir)}`,
		`export LOG_FILE=${JSON.stringify(path.join(deployDir, "deploy.log"))}`,
		`export RESULT_FILE=${JSON.stringify(path.join(deployDir, "last-result.json"))}`,
		`export ATTEMPT_ID=${JSON.stringify(attemptId)}`,
		`export ATTEMPT_CHECKPOINT=${JSON.stringify(
			attemptId ? path.join(deployDir, `attempt-${attemptId}.json`) : "",
		)}`,
		`export MODE="prod" GATE_TAIL_LINES="40"`,
		`export ATTEMPT_WAIT_SECONDS="${attemptWaitSeconds ?? 0}"`,
		extractFunctions(HELPERS),
	].join("\n");
}

function runHelperScript(deployDir, body, attemptId, attemptWaitSeconds) {
	return spawnSync(
		"bash",
		["-c", `${bashPrelude(deployDir, attemptId, attemptWaitSeconds)}\n${body}`],
		{
			encoding: "utf8",
			timeout: 30000,
		},
	);
}

function readCheckpoint(deployDir, attemptId = "deploy-t-1-12345") {
	return JSON.parse(
		fs.readFileSync(path.join(deployDir, `attempt-${attemptId}.json`), "utf8"),
	);
}

const describeIfBashJq = hasBash() && hasJq() ? describe : describe.skip;

describe("deploy.sh attempt-checkpoint structural contracts", () => {
	it("consults the checkpoint before any gate can run", () => {
		const prodSection = deployScript.slice(
			deployScript.indexOf("# --- Production deploy"),
		);
		const guardAt = prodSection.indexOf("maybe_adopt_attempt_entry");
		const firstGateAt = prodSection.indexOf('run_gate "final-test-suite"');
		const recordAt = prodSection.indexOf('write_attempt_checkpoint "running"');
		expect(guardAt).toBeGreaterThan(-1);
		expect(firstGateAt).toBeGreaterThan(guardAt);
		expect(recordAt).toBeGreaterThan(guardAt);
		expect(recordAt).toBeLessThan(firstGateAt);
	});

	it("mirrors every terminal result into the attempt checkpoint", () => {
		const writeResultFn = deployScript.slice(
			deployScript.indexOf("write_result() {"),
			deployScript.indexOf("# --- Deploy attempt checkpoint"),
		);
		expect(writeResultFn).toMatch(
			/write_attempt_checkpoint "\$status" "\$message" "\$exit_code"/,
		);
		expect(writeResultFn).toMatch(/deploying \| success \| failed \| rolled-back/);
	});

	it("re-pins the engine attempt id through the systemd-run re-exec", () => {
		const guardAt = deployScript.indexOf('if [ -z "$KAINBAIN_OUTSIDE_CGROUP" ]');
		expect(guardAt).toBeGreaterThan(-1);
		const block = deployScript.slice(guardAt, deployScript.indexOf("\nfi", guardAt));
		expect(block).toMatch(/--setenv=KAINBAIN_DEPLOY_ATTEMPT_ID=/);
		expect(block).toMatch(/KAINBAIN_DEPLOY_ATTEMPT_ID:-/);
	});
});

describeIfBashJq("write_attempt_checkpoint behaviour (real function bodies)", () => {
	let deployDir;
	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-attempt-"));
	});

	it("records attemptId, status, pid and timestamps", () => {
		const probe = runHelperScript(
			deployDir,
			`write_attempt_checkpoint "running" "Deploy attempt started" ""`,
		);
		expect(probe.status).toBe(0);
		const checkpoint = readCheckpoint(deployDir);
		expect(checkpoint.attemptId).toBe("deploy-t-1-12345");
		expect(checkpoint.status).toBe("running");
		expect(Number.isInteger(checkpoint.pid)).toBe(true);
		expect(checkpoint.startedAt).toMatch(/T/);
		expect(checkpoint.updatedAt).toMatch(/T/);
		expect(checkpoint.message).toBe("Deploy attempt started");
	});

	it("preserves startedAt across refreshes but moves updatedAt and status", () => {
		runHelperScript(deployDir, `write_attempt_checkpoint "running" "started" ""`);
		const first = readCheckpoint(deployDir);
		// Backdate startedAt so the refresh would be visibly different.
		const backdated = { ...first, startedAt: "2020-01-01T00:00:00Z" };
		fs.writeFileSync(
			path.join(deployDir, "attempt-deploy-t-1-12345.json"),
			JSON.stringify(backdated),
		);
		runHelperScript(
			deployDir,
			`write_attempt_checkpoint "failed" "Gate failed" "3"`,
		);
		const second = readCheckpoint(deployDir);
		expect(second.startedAt).toBe("2020-01-01T00:00:00Z");
		expect(second.status).toBe("failed");
		expect(second.exitCode).toBe(3);
		expect(second.message).toBe("Gate failed");
	});

	it("is a no-op without an attempt id (manual runs unchanged)", () => {
		const probe = runHelperScript(
			deployDir,
			`write_attempt_checkpoint "running" "manual" ""; attempt_checkpoint_status`,
			"",
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout.trim()).toBe("");
		expect(fs.readdirSync(deployDir)).toHaveLength(0);
	});

	it("reads back a missing checkpoint as empty status", () => {
		const probe = runHelperScript(deployDir, `attempt_checkpoint_status`);
		expect(probe.status).toBe(0);
		expect(probe.stdout.trim()).toBe("");
	});

	it("records buildNumber once allocated, omits it at entry time", () => {
		const entry = runHelperScript(
			deployDir,
			`write_attempt_checkpoint "running" "Deploy attempt started" ""`,
		);
		expect(entry.status).toBe(0);
		expect(readCheckpoint(deployDir).buildNumber).toBeUndefined();

		const terminal = runHelperScript(
			deployDir,
			`BUILD_NUMBER=7 write_attempt_checkpoint "success" "Deployment complete" "0"`,
		);
		expect(terminal.status).toBe(0);
		const checkpoint = readCheckpoint(deployDir);
		expect(checkpoint.buildNumber).toBe(7);
		expect(checkpoint.status).toBe("success");
	});

	it("omits a non-numeric BUILD_NUMBER instead of writing garbage", () => {
		const probe = runHelperScript(
			deployDir,
			`BUILD_NUMBER=not-a-number write_attempt_checkpoint "success" "done" "0"`,
		);
		expect(probe.status).toBe(0);
		expect(readCheckpoint(deployDir).buildNumber).toBeUndefined();
	});
});

describeIfBashJq("attempt_pid_alive behaviour (real function bodies)", () => {
	it("reports a live pid and a dead pid correctly", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-attempt-"));
		const probe = runHelperScript(
			deployDir,
			[
				`sleep 30 & _p=$!`,
				`if attempt_pid_alive "$_p"; then echo LIVE; fi`,
				`kill "$_p" 2>/dev/null || true`,
				`wait "$_p" 2>/dev/null || true`,
				`if attempt_pid_alive "$_p"; then echo STILL_LIVE; else echo DEAD; fi`,
				`if attempt_pid_alive ""; then echo EMPTY_LIVE; fi`,
				`if attempt_pid_alive "abc"; then echo BAD_LIVE; fi`,
			].join("\n"),
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("LIVE");
		expect(probe.stdout).toContain("DEAD");
		expect(probe.stdout).not.toContain("STILL_LIVE");
		expect(probe.stdout).not.toContain("EMPTY_LIVE");
		expect(probe.stdout).not.toContain("BAD_LIVE");
		fs.rmSync(deployDir, { recursive: true, force: true });
	});
});

describeIfBashJq("adopt_attempt_outcome behaviour (real function bodies)", () => {
	let deployDir;
	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-attempt-"));
	});

	it("exits 0 for success (no second deploy)", () => {
		const probe = runHelperScript(deployDir, `adopt_attempt_outcome "success"`);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("adopting recorded outcome");
	});

	it("never adopts a deploying checkpoint as success (in-flight, not terminal)", () => {
		// Regression: a `deploying` pre-restart marker adopted as success
		// turned a re-dispatch into an exit-0 no-op and left prod behind
		// main. The outcome function must NOT exit here — the caller keeps
		// waiting on a live pid or re-runs when the pid is gone.
		const probe = runHelperScript(
			deployDir,
			`adopt_attempt_outcome "deploying"; echo CONTINUED`,
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("CONTINUED");
		expect(probe.stdout).not.toContain("adopting recorded outcome");
	});

	it("exits with the recorded code for a failed attempt", () => {
		runHelperScript(deployDir, `write_attempt_checkpoint "failed" "Gate X failed" "3"`);
		const probe = runHelperScript(deployDir, `adopt_attempt_outcome "failed"`);
		expect(probe.status).toBe(3);
	});

	it("defaults to exit 1 when a failed checkpoint has no numeric code", () => {
		fs.writeFileSync(
			path.join(deployDir, "attempt-deploy-t-1-12345.json"),
			JSON.stringify({ attemptId: "deploy-t-1-12345", status: "failed" }),
		);
		const probe = runHelperScript(deployDir, `adopt_attempt_outcome "failed"`);
		expect(probe.status).toBe(1);
	});
});

describeIfBashJq("maybe_adopt_attempt_entry decision table (real function body)", () => {
	let deployDir;
	const ATTEMPT = "deploy-t-1-12345";
	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-attempt-"));
	});

	function writeCheckpoint(fields) {
		fs.writeFileSync(
			path.join(deployDir, `attempt-${ATTEMPT}.json`),
			JSON.stringify({ attemptId: ATTEMPT, ...fields }),
		);
	}

	it("adopts a terminal success checkpoint without deploying", () => {
		writeCheckpoint({ status: "success" });
		const probe = runHelperScript(deployDir, `maybe_adopt_attempt_entry; echo RAN`);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("adopting recorded outcome");
		// `exit` in adopt means the trailing echo never runs.
		expect(probe.stdout).not.toContain("RAN");
	});

	it("re-runs a deploying checkpoint whose pid is gone (never adopts in-flight state)", () => {
		// The a5228675 outage: a stale `deploying` marker was adopted as
		// success and the deploy never ran. A dead pid must fall through as
		// a genuine retry.
		writeCheckpoint({ status: "deploying", pid: 2147483647 });
		const probe = runHelperScript(deployDir, `maybe_adopt_attempt_entry; echo RAN`);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("RAN");
		expect(probe.stdout).not.toContain("adopting recorded outcome");
	});

	it("waits instead of duplicating when a deploying checkpoint's pid is alive", () => {
		writeCheckpoint({ status: "deploying", pid: process.pid });
		const probe = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
			ATTEMPT,
			0,
		);
		expect(probe.status).toBe(75);
		expect(probe.stdout).toContain("still in flight");
		expect(probe.stdout).not.toContain("RAN");
	});

	it("re-runs (does not adopt) a recorded failure so a retry can succeed", () => {
		writeCheckpoint({ status: "failed", exitCode: 3 });
		const probe = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("genuine retry");
		expect(probe.stdout).toContain("RAN");
		expect(probe.stdout).not.toContain("adopting recorded outcome");
	});

	it("re-runs a stale running checkpoint whose pid is gone", () => {
		writeCheckpoint({ status: "running", pid: 2147483647 });
		const probe = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("stale");
		expect(probe.stdout).toContain("RAN");
	});

	it("exits 75 instead of duplicating an in-flight deploy when the wait elapses", () => {
		writeCheckpoint({ status: "running", pid: process.pid });
		const probe = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
			ATTEMPT,
			0,
		);
		expect(probe.status).toBe(75);
		expect(probe.stdout).toContain("still in flight");
		expect(probe.stdout).not.toContain("RAN");
	});

	it("never aborts on a non-numeric wait budget (fail-safe exit 75)", () => {
		writeCheckpoint({ status: "running", pid: process.pid });
		const probe = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
			ATTEMPT,
			"not-a-number",
		);
		expect(probe.status).toBe(75);
		expect(probe.stdout).toContain("still in flight");
		expect(probe.stdout).not.toContain("RAN");
	});

	it("returns immediately with no checkpoint and with no attempt id", () => {
		const noCheckpoint = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
		);
		expect(noCheckpoint.status).toBe(0);
		expect(noCheckpoint.stdout).toContain("RAN");

		const noAttempt = runHelperScript(
			deployDir,
			`maybe_adopt_attempt_entry; echo RAN`,
			"",
		);
		expect(noAttempt.status).toBe(0);
		expect(noAttempt.stdout).toContain("RAN");
	});

	it("stamps the operation key into the checkpoint (C5)", () => {
		const OP = "merge-deploy:task-1:main:abc123:deadbeef";
		const probe = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(OP)}; write_attempt_checkpoint "running" "started" ""`,
		);
		expect(probe.status).toBe(0);
		expect(readCheckpoint(deployDir).operationKey).toBe(OP);
	});

	it("adopts a still-running deploy by operation key when the attempt id was lost (C5)", () => {
		const OP = "merge-deploy:task-1:main:abc123:deadbeef";
		const OLD = "deploy-t-1-11111";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({
				attemptId: OLD,
				status: "running",
				pid: process.pid,
				operationKey: OP,
				startedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
		);
		// Re-dispatch with a FRESH attempt id (no checkpoint file) but the
		// same operation key: must join the recorded attempt, never start a
		// second deploy.
		const FRESH = "deploy-t-1-99999";
		const probe = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(OP)}; maybe_adopt_attempt_entry; echo RAN`,
			FRESH,
			0,
		);
		expect(probe.status).toBe(75);
		expect(probe.stdout).toContain(`[DEPLOY] Adopted attempt ${OLD}`);
		expect(probe.stdout).toContain(OP);
		expect(probe.stdout).not.toContain("RAN");
		// No second checkpoint file: exactly one deploy exists.
		expect(fs.existsSync(path.join(deployDir, `attempt-${FRESH}.json`))).toBe(false);
	});

	it("waits on a deploying operation by key when the deploy lives (C5)", () => {
		const OP = "merge-deploy:task-1:main:abc123:deadbeef";
		const OLD = "deploy-t-1-11111";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({
				attemptId: OLD,
				status: "deploying",
				pid: process.pid,
				operationKey: OP,
				startedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
		);
		const FRESH = "deploy-t-1-99999";
		const probe = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(OP)}; maybe_adopt_attempt_entry; echo RAN`,
			FRESH,
			0,
		);
		expect(probe.status).toBe(75);
		expect(probe.stdout).toContain(`[DEPLOY] Adopted attempt ${OLD}`);
		expect(probe.stdout).toContain("still in flight");
		expect(probe.stdout).not.toContain("RAN");
		expect(fs.existsSync(path.join(deployDir, `attempt-${FRESH}.json`))).toBe(false);
	});

	it("re-runs a stale deploying operation by key instead of adopting it (C5)", () => {
		const OP = "merge-deploy:task-1:main:abc123:deadbeef";
		const OLD = "deploy-t-1-11111";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({
				attemptId: OLD,
				status: "deploying",
				pid: 2147483647,
				operationKey: OP,
				startedAt: "2026-09-24T09:00:00.000Z",
				updatedAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		const FRESH = "deploy-t-1-99999";
		const probe = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(OP)}; maybe_adopt_attempt_entry; echo RAN`,
			FRESH,
			0,
		);
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("RAN");
		expect(probe.stdout).not.toContain("adopting recorded outcome");
		// Re-runs under the recorded attempt id: no second checkpoint file.
		expect(fs.existsSync(path.join(deployDir, `attempt-${FRESH}.json`))).toBe(false);
	});

	it("adopts terminal success by operation key only for known-base keys (C5)", () => {
		const OLD = "deploy-t-1-11111";
		const KNOWN = "merge-deploy:task-1:main:abc123:deadbeef";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({ attemptId: OLD, status: "success", operationKey: KNOWN }),
		);
		const adopted = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(KNOWN)}; maybe_adopt_attempt_entry; echo RAN`,
			"deploy-t-1-99999",
			0,
		);
		expect(adopted.status).toBe(0);
		expect(adopted.stdout).toContain(`[DEPLOY] Adopted attempt ${OLD}`);
		expect(adopted.stdout).not.toContain("RAN");
	});

	it("re-runs (never adopts) unknown-base success and recorded failures by operation key (C5)", () => {
		const OLD = "deploy-t-1-11111";
		const UNKNOWN = "merge-deploy:task-1:main:unknown-base:deadbeef";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({ attemptId: OLD, status: "success", operationKey: UNKNOWN }),
		);
		const rerun = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(UNKNOWN)}; maybe_adopt_attempt_entry; echo RAN`,
			"deploy-t-1-99999",
			0,
		);
		expect(rerun.status).toBe(0);
		expect(rerun.stdout).toContain("no base SHA");
		expect(rerun.stdout).toContain("RAN");

		const KNOWN = "merge-deploy:task-1:main:abc123:deadbeef";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${OLD}.json`),
			JSON.stringify({ attemptId: OLD, status: "failed", exitCode: 1, operationKey: KNOWN }),
		);
		const retry = runHelperScript(
			deployDir,
			`export OPERATION_KEY=${JSON.stringify(KNOWN)}; maybe_adopt_attempt_entry; echo RAN`,
			"deploy-t-1-99999",
			0,
		);
		expect(retry.status).toBe(0);
		expect(retry.stdout).toContain("genuine retry");
		expect(retry.stdout).toContain("RAN");
	});
});

describeIfBashJq("write_result mirrors the outcome into the checkpoint (real function bodies)", () => {
	function runWriteResult(deployDir, { attemptId = "deploy-t-1-4242", headSha } = {}) {
		const helperNames = [
			"log",
			"current_build",
			"attempt_checkpoint_status",
			"attempt_checkpoint_field",
			"attempt_pid_alive",
			"write_attempt_checkpoint",
			"write_result",
		];
		const prelude = [
			`export DEPLOY_DIR=${JSON.stringify(deployDir)}`,
			`export LOG_FILE=${JSON.stringify(path.join(deployDir, "deploy.log"))}`,
			`export RESULT_FILE=${JSON.stringify(path.join(deployDir, "last-result.json"))}`,
			`export STATE_FILE=${JSON.stringify(path.join(deployDir, "state.json"))}`,
			`export HISTORY_FILE=${JSON.stringify(path.join(deployDir, "history.jsonl"))}`,
			`export BUILD_COUNTER=${JSON.stringify(path.join(deployDir, "build.txt"))}`,
			`export ATTEMPT_ID=${JSON.stringify(attemptId)}`,
			`export ATTEMPT_CHECKPOINT=${JSON.stringify(path.join(deployDir, `attempt-${attemptId}.json`))}`,
			`export KAINBAIN_DEPLOY_ATTEMPT_ID=${JSON.stringify(attemptId)}`,
			`export MODE="prod"`,
			...(headSha !== undefined
				? [`export DEPLOY_HEAD_SHA=${JSON.stringify(headSha)}`]
				: []),
			extractFunctions(helperNames),
		].join("\n");
		return spawnSync(
			"bash",
			[
				"-c",
				`${prelude}\nwrite_result "success" "Deployment complete and healthy" "false"`,
			],
			{ encoding: "utf8", timeout: 30000 },
		);
	}

	it("stamps deployAttemptId onto the result AND records the checkpoint", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-attempt-"));
		const attemptId = "deploy-t-1-4242";
		const probe = runWriteResult(deployDir, { attemptId });
		expect(probe.status).toBe(0);
		const result = JSON.parse(
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
		);
		expect(result.deployAttemptId).toBe(attemptId);
		const checkpoint = JSON.parse(
			fs.readFileSync(path.join(deployDir, `attempt-${attemptId}.json`), "utf8"),
		);
		expect(checkpoint.status).toBe("success");
		expect(checkpoint.attemptId).toBe(attemptId);
	});

	it("stamps the git HEAD onto result, state, and history (shared-gate evidence)", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-headsha-"));
		const headSha = "a".repeat(40);
		const probe = runWriteResult(deployDir, { headSha });
		expect(probe.status).toBe(0);
		const read = (name) =>
			JSON.parse(fs.readFileSync(path.join(deployDir, name), "utf8"));
		expect(read("last-result.json").headSha).toBe(headSha);
		expect(read("state.json").headSha).toBe(headSha);
		const [historyLine] = fs
			.readFileSync(path.join(deployDir, "history.jsonl"), "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(historyLine.headSha).toBe(headSha);
	});

	it("omits headSha outside a git repository instead of writing a bogus value", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-nosha-"));
		const probe = runWriteResult(deployDir, { headSha: "" });
		expect(probe.status).toBe(0);
		const result = JSON.parse(
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
		);
		expect(result).not.toHaveProperty("headSha");
	});
});

function hasGit() {
	try {
		const probe = spawnSync("git", ["--version"], { stdio: "ignore" });
		return !probe.error;
	} catch {
		return false;
	}
}

const describeIfBashJqGit = hasBash() && hasJq() && hasGit() ? describe : describe.skip;

/**
 * Builds a throwaway repo pair: a working checkout backed by a bare
 * `origin`, both on `main`, pushed and in sync. Returns `{ dir, remote }`.
 */
function initSyncedRepoPair() {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-tip-"));
	const remote = path.join(base, "origin.git");
	const dir = path.join(base, "work");
	const git = (...args) => {
		const probe = spawnSync("git", args, { encoding: "utf8" });
		if (probe.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${probe.stderr}`);
		}
		return probe.stdout.trim();
	};
	git("init", "--bare", remote);
	git("init", "-b", "main", dir);
	git("-C", dir, "config", "user.email", "tip-guard@test");
	git("-C", dir, "config", "user.name", "tip-guard");
	fs.writeFileSync(path.join(dir, "file.txt"), "one\n");
	git("-C", dir, "add", "file.txt");
	git("-C", dir, "-c", "user.email=tip-guard@test", "-c", "user.name=tip-guard", "commit", "-m", "one");
	git("-C", dir, "remote", "add", "origin", remote);
	git("-C", dir, "push", "-u", "origin", "main");
	return { base, dir, remote };
}

function gitIn(dir, ...args) {
	const probe = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
	if (probe.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${probe.stderr}`);
	}
	return probe.stdout.trim();
}

const TIP_GUARD_HELPERS = [
	"log",
	"current_build",
	"attempt_checkpoint_status",
	"attempt_checkpoint_field",
	"attempt_pid_alive",
	"write_attempt_checkpoint",
	"write_result",
	"operation_key_branch",
	"require_deploy_tip_current",
];

function runTipGuard({ repoDir, operationKey }) {
	// Extracted inside the test so a missing function fails this test with
	// "deploy.sh function not found" instead of breaking the whole file.
	const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-deploy-tipguard-"));
	const prelude = [
		`export DEPLOY_DIR=${JSON.stringify(deployDir)}`,
		`export LOG_FILE=${JSON.stringify(path.join(deployDir, "deploy.log"))}`,
		`export RESULT_FILE=${JSON.stringify(path.join(deployDir, "last-result.json"))}`,
		`export STATE_FILE=${JSON.stringify(path.join(deployDir, "state.json"))}`,
		`export HISTORY_FILE=${JSON.stringify(path.join(deployDir, "history.jsonl"))}`,
		`export BUILD_COUNTER=${JSON.stringify(path.join(deployDir, "build.txt"))}`,
		`export MODE="prod"`,
		`export STARTED_AT="2026-09-24T10:00:00.000Z"`,
		`export OPERATION_KEY=${JSON.stringify(operationKey)}`,
		extractFunctions(TIP_GUARD_HELPERS),
	].join("\n");
	const probe = spawnSync(
		"bash",
		["-c", `${prelude}\nrequire_deploy_tip_current`],
		{ encoding: "utf8", timeout: 60000, cwd: repoDir },
	);
	return { probe, deployDir };
}

describeIfBashJqGit("require_deploy_tip_current (real function bodies)", () => {
	const OP = "merge-deploy:task-1234:main:abc123:deadbeef";

	it("resolves the integration branch from the operation key", () => {
		const prelude = [
			`export OPERATION_KEY=${JSON.stringify(OP)}`,
			extractFunctions(["operation_key_branch"]),
		].join("\n");
		const probe = spawnSync("bash", ["-c", `${prelude}\noperation_key_branch`], {
			encoding: "utf8",
			timeout: 30000,
		});
		expect(probe.status).toBe(0);
		expect(probe.stdout.trim()).toBe("main");
	});

	it("passes when the checkout is exactly the integration tip", () => {
		const { dir } = initSyncedRepoPair();
		const { probe, deployDir } = runTipGuard({ repoDir: dir, operationKey: OP });
		expect(probe.status).toBe(0);
		expect(probe.stdout).toContain("integration tip");
		// No failure recorded: the deploy may proceed.
		expect(fs.existsSync(path.join(deployDir, "last-result.json"))).toBe(false);
	});

	it("fails loudly when the checkout is behind the integration tip", () => {
		const { dir } = initSyncedRepoPair();
		// Advance the remote tip, then leave the checkout behind it.
		fs.writeFileSync(path.join(dir, "file.txt"), "two\n");
		gitIn(dir, "add", "file.txt");
		gitIn(
			dir,
			"-c",
			"user.email=tip-guard@test",
			"-c",
			"user.name=tip-guard",
			"commit",
			"-m",
			"two",
		);
		gitIn(dir, "push", "origin", "main");
		gitIn(dir, "reset", "--hard", "HEAD~1");
		const { probe, deployDir } = runTipGuard({ repoDir: dir, operationKey: OP });
		expect(probe.status).toBe(1);
		const result = JSON.parse(
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
		);
		expect(result.status).toBe("failed");
		expect(String(result.message)).toContain("behind");
	});

	it("fails loudly on unpushed local commits that would ship unreviewed", () => {
		const { dir } = initSyncedRepoPair();
		fs.writeFileSync(path.join(dir, "local.txt"), "unpushed\n");
		gitIn(dir, "add", "local.txt");
		gitIn(
			dir,
			"-c",
			"user.email=tip-guard@test",
			"-c",
			"user.name=tip-guard",
			"commit",
			"-m",
			"unpushed",
		);
		const { probe, deployDir } = runTipGuard({ repoDir: dir, operationKey: OP });
		expect(probe.status).toBe(1);
		const result = JSON.parse(
			fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"),
		);
		expect(result.status).toBe("failed");
		expect(String(result.message)).toMatch(/ahead|diverged/);
	});

	it("skips manual runs without an operation key", () => {
		const { dir } = initSyncedRepoPair();
		const { probe, deployDir } = runTipGuard({ repoDir: dir, operationKey: "" });
		expect(probe.status).toBe(0);
		expect(fs.existsSync(path.join(deployDir, "last-result.json"))).toBe(false);
	});

	it("runs after the adopt table and before the first gate", () => {
		const prodSection = deployScript.slice(deployScript.indexOf("# --- Production deploy"));
		const guardAt = prodSection.indexOf("maybe_adopt_attempt_entry");
		const tipGuardAt = prodSection.indexOf("require_deploy_tip_current");
		const firstGateAt = prodSection.indexOf('run_gate "final-test-suite"');
		expect(guardAt).toBeGreaterThan(-1);
		expect(tipGuardAt).toBeGreaterThan(guardAt);
		expect(firstGateAt).toBeGreaterThan(tipGuardAt);
	});
});
