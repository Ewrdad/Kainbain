import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/***
 * MARK: deploy heartbeat ticker tests
 * @description Regression gate for the merge/deploy resume loop's stall
 *   half (2026-10-12): long quiet gates (final-test-suite, canary-e2e, npm
 *   installs) went output-silent past the 900s merge stall threshold, so the
 *   engine watchdog killed a HEALTHY deploy mid-gates and the transient retry
 *   started a second full deploy + service restart. `deploy.sh` now runs a
 *   heartbeat ticker from the first gate to the terminal result that keeps
 *   all three liveness channels moving: the attempt checkpoint's owning pid
 *   (in-flight probe), deploy.log mtime (watchdog proxy), and the attempt
 *   checkpoint's updatedAt (freshness probe). The transient unit's stdio
 *   goes to the journal by design (no --pipe — a pipe's reader dies with
 *   the API at restart and EPIPEs the deploy), so the engine never sees
 *   gate stdout; these three channels are the liveness signal instead.
 *   Every behavioural test below
 *   executes the REAL function bodies extracted verbatim from deploy.sh —
 *   never a re-typed copy — so drift fails loudly.
 * @example run `node --test tests/deploy-heartbeat.test.mjs`
 ***/

function readDeploySh() {
	/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
	return fs.readFileSync(path.join(REPO_ROOT, "deploy.sh"), "utf8");
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/** Extracts top-level `name() { ... }` bodies verbatim; throws on drift. */
function extractFunctions(body, names) {
	const lines = body.split("\n");
	const bodies = [];
	for (const name of names) {
		const start = lines.findIndex((line) => line === `${name}() {`);
		assert.ok(start !== -1, `deploy.sh function not found: ${name}()`);
		let end = -1;
		for (let i = start + 1; i < lines.length; i++) {
			if (lines[i] === "}") {
				end = i;
				break;
			}
		}
		assert.ok(end !== -1, `deploy.sh function unterminated: ${name}()`);
		bodies.push(lines.slice(start, end + 1).join("\n"));
	}
	return bodies.join("\n\n");
}

/** Slices write_result verbatim (it embeds multi-line jq programs). */
function extractWriteResult(body) {
	const startMarker = "write_result() {";
	const endMarker = "# --- Deploy attempt checkpoint";
	const start = body.indexOf(startMarker);
	assert.ok(start !== -1, "deploy.sh must contain write_result()");
	const end = body.indexOf(endMarker, start);
	assert.ok(end !== -1, "checkpoint section must follow write_result()");
	return body.slice(start, end).replace(/\n+$/, "");
}

const TICKER_HELPERS = [
	"log",
	"current_build",
	"attempt_checkpoint_status",
	"attempt_checkpoint_field",
	"attempt_pid_alive",
	"write_attempt_checkpoint",
	"start_deploy_heartbeat",
	"stop_deploy_heartbeat",
];

function hasBash() {
	try {
		return !spawnSync("bash", ["--version"], { stdio: "ignore" }).error;
	} catch {
		return false;
	}
}

function hasJq() {
	try {
		return !spawnSync("jq", ["--version"], { stdio: "ignore" }).error;
	} catch {
		return false;
	}
}

const shellAvailable = hasBash() && hasJq();

function helperPrelude(deployDir, { attemptId = "deploy-hb-1", heartbeatInterval = "1" } = {}) {
	const body = readDeploySh();
	return [
		`export DEPLOY_DIR=${JSON.stringify(deployDir)}`,
		`export LOG_FILE=${JSON.stringify(path.join(deployDir, "deploy.log"))}`,
		`export RESULT_FILE=${JSON.stringify(path.join(deployDir, "last-result.json"))}`,
		`export STATE_FILE=${JSON.stringify(path.join(deployDir, "state.json"))}`,
		`export HISTORY_FILE=${JSON.stringify(path.join(deployDir, "history.jsonl"))}`,
		`export BUILD_COUNTER=${JSON.stringify(path.join(deployDir, "build.txt"))}`,
		`export ATTEMPT_ID=${JSON.stringify(attemptId)}`,
		`export ATTEMPT_CHECKPOINT=${JSON.stringify(attemptId ? path.join(deployDir, `attempt-${attemptId}.json`) : "")}`,
		`export KAINBAIN_DEPLOY_ATTEMPT_ID=${JSON.stringify(attemptId)}`,
		`export MODE="prod" GATE_TAIL_LINES="40" FAST="false"`,
		// Fast ticks for tests: the function honours the variable directly;
		// the 15s floor (startup clamp) is pinned structurally below.
		`export HEARTBEAT_INTERVAL=${JSON.stringify(heartbeatInterval)} HEARTBEAT_PID=""`,
		extractFunctions(body, TICKER_HELPERS),
		extractWriteResult(body),
	].join("\n");
}

function runHelper(deployDir, script, opts) {
	return spawnSync("bash", ["-c", `${helperPrelude(deployDir, opts)}\n${script}`], {
		encoding: "utf8",
		timeout: 60000,
	});
}

describe("deploy.sh heartbeat ticker (static contracts)", () => {
	it("starts the ticker after the running checkpoint and before the first gate", () => {
		const body = readDeploySh();
		const prodAt = body.indexOf("# --- Production deploy");
		assert.ok(prodAt !== -1);
		const prod = body.slice(prodAt);
		const recordAt = prod.indexOf('write_attempt_checkpoint "running"');
		const tickerAt = prod.indexOf("start_deploy_heartbeat");
		const firstGateAt = prod.indexOf('run_gate "final-test-suite"');
		assert.ok(recordAt !== -1, "prod block must record the running checkpoint");
		assert.ok(tickerAt !== -1, "prod block must start the heartbeat ticker");
		assert.ok(firstGateAt !== -1);
		assert.ok(recordAt < tickerAt, "ticker must start only after the running checkpoint exists");
		assert.ok(tickerAt < firstGateAt, "ticker must start before the first gate runs");
	});

	it("stops the ticker first inside write_result on every outcome", () => {
		const writeResult = extractWriteResult(readDeploySh());
		const stopAt = writeResult.indexOf("stop_deploy_heartbeat");
		assert.ok(stopAt !== -1, "write_result must stop the heartbeat ticker");
		// Before any file is written: a tick racing a terminal write must
		// never flip the checkpoint back to "running".
		const firstWriteAt = writeResult.search(/>\s*"\$RESULT_FILE"|mktemp/);
		assert.ok(firstWriteAt !== -1);
		assert.ok(stopAt < firstWriteAt, "ticker stop must precede any result write");
	});

	it("reaps the ticker on any exit via the STAGE EXIT trap", () => {
		assert.match(
			readDeploySh(),
			/trap 'stop_deploy_heartbeat[^']*if \[ -n "\$\{STAGE:-\}" \]; then rm -rf "\$STAGE"; fi' EXIT/,
			"EXIT trap must reap the ticker AND guard the unset-STAGE rm -rf",
		);
	});

	it("sanitizes and clamps the heartbeat interval (fail-safe, no log spam)", () => {
		const body = readDeploySh();
		assert.match(body, /HEARTBEAT_INTERVAL="\$\{KAINBAIN_HEARTBEAT_SECONDS:-60\}"/);
		assert.match(body, /Ignoring non-numeric KAINBAIN_HEARTBEAT_SECONDS/);
		assert.match(body, /\[\s+"\$HEARTBEAT_INTERVAL"\s+-lt\s+15\s+\]/, "interval floor keeps engine heartbeat well under stall thresholds without spamming");
		assert.match(body, /\[\s+"\$HEARTBEAT_INTERVAL"\s+-gt\s+120\s+\]/, "interval ceiling keeps two missed beats far from the 600s deploy threshold");
	});

	it("re-pins the heartbeat interval through the systemd-run re-exec", () => {
		const body = readDeploySh();
		const guardAt = body.indexOf('if [ -z "$KAINBAIN_OUTSIDE_CGROUP" ]');
		assert.ok(guardAt !== -1);
		const block = body.slice(guardAt, body.indexOf("\nfi", guardAt));
		assert.match(block, /--setenv=KAINBAIN_HEARTBEAT_SECONDS=/);
	});

	it("detaches the ticker from traps and set -e (ticker failure is silence, never an abort)", () => {
		const body = readDeploySh();
		const fn = extractFunctions(body, ["start_deploy_heartbeat"]);
		assert.match(fn, /trap - ERR EXIT/, "ticker subshell must not inherit the ERR trap");
		assert.match(fn, /set \+e/, "ticker subshell must not inherit set -e");
		assert.match(fn, /kill -0 "\$_parent"/, "ticker must exit when the deploy process is gone (no orphaned freshness)");
	});
});

describe("deploy.sh heartbeat ticker behaviour (real function bodies)", { skip: !shellAvailable }, () => {
	it("emits log lines and refreshes the checkpoint while running, then goes silent after stop", async () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-hb-"));
		try {
			const child = spawnSync(
				"bash",
				[
					"-c",
					`${helperPrelude(deployDir)}\n` +
						`write_attempt_checkpoint "running" "probe start" ""\n` +
						`start_deploy_heartbeat\n` +
						`echo "TICKER_PID=$HEARTBEAT_PID"\n` +
						`sleep 2.5\n` +
						`stop_deploy_heartbeat\n` +
						`echo "STOPPED pid=[$HEARTBEAT_PID]"\n` +
						`BEFORE=$(grep -c "Deploy still running" "$LOG_FILE")\n` +
						`sleep 2.5\n` +
						`AFTER=$(grep -c "Deploy still running" "$LOG_FILE")\n` +
						`echo "BEATS_BEFORE=$BEFORE BEATS_AFTER=$AFTER"`,
				],
				{ encoding: "utf8", timeout: 60000 },
			);
			assert.equal(child.status, 0, `helper script failed: ${child.stderr}`);
			const beats = /BEATS_BEFORE=(\d+) BEATS_AFTER=(\d+)/.exec(child.stdout);
			assert.ok(beats, `beat counts missing in: ${child.stdout}`);
			assert.ok(Number(beats[1]) >= 2, `expected >=2 beats in 2.5s at 1s cadence, got ${beats[1]}: ${child.stdout}`);
			assert.equal(beats[2], beats[1], "no beats may fire after stop_deploy_heartbeat");
			assert.match(child.stdout, /STOPPED pid=\[\]/, "stop must clear HEARTBEAT_PID (idempotent re-stop)");
			const checkpoint = JSON.parse(
				fs.readFileSync(path.join(deployDir, "attempt-deploy-hb-1.json"), "utf8"),
			);
			assert.equal(checkpoint.status, "running");
			assert.ok(checkpoint.updatedAt, "ticker must refresh checkpoint updatedAt");
		} finally {
			fs.rmSync(deployDir, { recursive: true, force: true });
		}
	});

	it("stop is a no-op when the ticker never started (total, never fails)", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-hb-"));
		try {
			const child = runHelper(deployDir, `stop_deploy_heartbeat; echo STOP_OK`);
			assert.equal(child.status, 0, `stop without start must exit 0: ${child.stderr}`);
			assert.match(child.stdout, /STOP_OK/);
		} finally {
			fs.rmSync(deployDir, { recursive: true, force: true });
		}
	});

	it("a terminal write_result is never overwritten by a late tick", async () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-hb-"));
		try {
			const child = spawnSync(
				"bash",
				[
					"-c",
					`${helperPrelude(deployDir)}\n` +
						`STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"\n` +
						`write_attempt_checkpoint "running" "probe start" ""\n` +
						`start_deploy_heartbeat\n` +
						`sleep 1.5\n` +
						`write_result "success" "Deployment complete and healthy" "false"\n` +
						`sleep 2.5\n` +
						`echo DONE`,
				],
				{ encoding: "utf8", timeout: 60000 },
			);
			assert.equal(child.status, 0, `helper script failed: ${child.stderr}`);
			const checkpoint = JSON.parse(
				fs.readFileSync(path.join(deployDir, "attempt-deploy-hb-1.json"), "utf8"),
			);
			assert.equal(checkpoint.status, "success", "checkpoint must stay terminal after the ticker had time to fire again");
			const result = JSON.parse(fs.readFileSync(path.join(deployDir, "last-result.json"), "utf8"));
			assert.equal(result.status, "success");
		} finally {
			fs.rmSync(deployDir, { recursive: true, force: true });
		}
	});
});
