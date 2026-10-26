import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/***
 * MARK: deploy re-exec contract tests
 * @description Regression gate for the deploy.sh cgroup re-exec contract
 *   (deep-review-20261007-235152): without `--wait`, `systemd-run` exits 0
 *   the moment the transient unit *starts*, so the "Merge and deploy" stage
 *   PASSED before any test/build/deploy ran while the real deploy failed
 *   invisibly in the journal; and without a node-aware PATH the detached
 *   unit dies at step 1 (`node: not found` — the systemd user manager PATH
 *   has no nvm bin). The engine trusts only the process exit code, so both
 *   halves of the contract are load-bearing. The static test pins the flags
 *   in the re-exec line; the live test drives the real script against a
 *   PATH-shimmed fake `systemd-run` and proves the unit's exit code reaches
 *   the caller.
 * @example run `node --test tests/deploy-reexec.test.mjs`
 ***/

function readDeploySh() {
	/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
	return fs.readFileSync(path.join(REPO_ROOT, "deploy.sh"), "utf8");
	/* eslint-enable security/detect-non-literal-fs-filename */
}

function reexecBlock() {
	const body = readDeploySh();
	const start = body.indexOf("KAINBAIN_OUTSIDE_CGROUP");
	assert.ok(start !== -1, "deploy.sh must keep the cgroup re-exec guard");
	// The re-exec block ends at the closing `fi` shortly after the guard.
	const end = body.indexOf("\nfi", start);
	return body.slice(start, end);
}

describe("deploy.sh re-exec line (static contract)", () => {
	it("waits for the transient unit so its exit code propagates (--wait)", () => {
		assert.match(reexecBlock(), /--wait/, "re-exec must pass --wait: without it systemd-run exits 0 on unit start");
	});

	it("injects a node-aware PATH into the transient unit (--setenv)", () => {
		const block = reexecBlock();
		assert.match(block, /--setenv=.PATH=/, "re-exec must pass --setenv=PATH= so the unit finds node");
		assert.match(block, /NODE_BINDIR|command -v node/, "re-exec must resolve node's bin dir before re-exec");
	});
});

describe("deploy.sh re-exec behaviour (fake systemd-run)", () => {
	function runWithFakeSystemdRun({ fakeExitCode, attemptId, extraEnv }) {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-reexec-"));
		try {
			// Fake cgroup file claiming membership in kainbain.service, so the
			// real script takes the re-exec branch on any host.
			const cgroupFile = path.join(tmp, "cgroup");
			fs.writeFileSync(cgroupFile, "0::/user.slice/user-1000.slice/user@1000.service/app.slice/kainbain.service\n");
			// Fake systemd-run: records its argv, then exits with the code the
			// "unit" would report (real `systemd-run --wait` propagates it).
			const argvLog = path.join(tmp, "argv.log");
			const fakeBin = path.join(tmp, "bin");
			fs.mkdirSync(fakeBin);
			fs.writeFileSync(
				path.join(fakeBin, "systemd-run"),
				`#!/bin/sh\nprintf '%s\\n' "$@" > "${argvLog}"\nexit ${fakeExitCode}\n`,
				{ mode: 0o755 },
			);
			const child = spawnSync("bash", ["deploy.sh", "--prod", "--fast"], {
				cwd: REPO_ROOT,
				env: {
					...process.env,
					// Hermetic re-exec trigger (regression 2026-10-12: the prod
					// `final-test-suite` gate runs INSIDE a real deploy, whose
					// transient unit exports KAINBAIN_OUTSIDE_CGROUP=1 and
					// KAINBAIN_DEPLOY_ATTEMPT_ID into every gate child. Without
					// scrubbing, the script skips the re-exec branch and runs a
					// REAL nested deploy instead of the fake: argv.log is never
					// written (ENOENT below) and the live deploy dir gains a
					// phantom attempt checkpoint. HOME is scoped too so a missed
					// branch can never touch live deploy/prod dirs.
					KAINBAIN_CGROUP_FILE: cgroupFile,
					KAINBAIN_OUTSIDE_CGROUP: "",
					KAINBAIN_DEPLOY_ATTEMPT_ID: attemptId || "",
					KAINBAIN_ATTEMPT_WAIT_SECONDS: "",
					HOME: tmp,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					...(extraEnv || {}),
				},
				encoding: "utf8",
			});
			const argv = fs.readFileSync(argvLog, "utf8").split("\n").filter(Boolean);
			return { status: child.status, argv };
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	}

	it("passes --wait and a node-aware PATH to systemd-run", () => {
		const { argv } = runWithFakeSystemdRun({ fakeExitCode: 0 });
		assert.ok(argv.includes("--wait"), `systemd-run argv missing --wait: ${JSON.stringify(argv)}`);
		const setenv = argv.find((arg) => arg.startsWith("--setenv=PATH="));
		assert.ok(setenv, `systemd-run argv missing PATH setenv: ${JSON.stringify(argv)}`);
		const nodeBinDir = path.dirname(process.execPath);
		assert.ok(
			setenv.slice("--setenv=PATH=".length).split(path.delimiter).includes(nodeBinDir),
			`unit PATH ${JSON.stringify(setenv)} must contain the node bin dir ${nodeBinDir}`,
		);
	});

	it("propagates a failing unit's exit code to the caller (no vacuous PASS)", () => {
		const { status, argv } = runWithFakeSystemdRun({ fakeExitCode: 3 });
		assert.ok(argv.includes("--wait"), `systemd-run argv missing --wait: ${JSON.stringify(argv)}`);
		assert.equal(status, 3, "deploy.sh must exit with the unit's code (the shell waits and propagates it)");
	});

	it("pins KAINBAIN_OUTSIDE_CGROUP=1 in the unit env (no re-exec loop)", () => {
		const { argv } = runWithFakeSystemdRun({ fakeExitCode: 0 });
		assert.ok(
			argv.includes("--setenv=KAINBAIN_OUTSIDE_CGROUP=1"),
			`systemd-run argv must pin the re-exec guard explicitly (env inheritance is an assumption): ${JSON.stringify(argv)}`,
		);
	});

	it("re-pins KAINBAIN_DEPLOY_ATTEMPT_ID for the transient unit (per-attempt attribution)", () => {
		// systemd-run does NOT inherit the caller's environment, so without
		// this explicit --setenv the durable deploy result loses its attempt id
		// and post-restart reconciliation can no longer attribute the deploy to
		// its stage attempt (the merge/deploy resume loop).
		const attemptId = "deploy-deadbeef-1791776765049";
		const { argv } = runWithFakeSystemdRun({ fakeExitCode: 0, attemptId });
		assert.ok(
			argv.includes(`--setenv=KAINBAIN_DEPLOY_ATTEMPT_ID=${attemptId}`),
			`systemd-run argv must re-pin the attempt id: ${JSON.stringify(argv)}`,
		);
	});

	it("omits the attempt-id setenv on manual runs without an attempt id", () => {
		const { argv } = runWithFakeSystemdRun({ fakeExitCode: 0 });
		assert.ok(
			!argv.some((arg) => arg.startsWith("--setenv=KAINBAIN_DEPLOY_ATTEMPT_ID=")),
			`manual runs must not inject a phantom attempt id: ${JSON.stringify(argv)}`,
		);
	});
});

describe("deploy.sh fail-safe contracts (static)", () => {
	function sectionBetween(body, startMarker, endMarker) {
		const start = body.indexOf(startMarker);
		assert.ok(start !== -1, `deploy.sh must contain ${JSON.stringify(startMarker)}`);
		const end = body.indexOf(endMarker, start);
		assert.ok(end !== -1, `deploy.sh must contain ${JSON.stringify(endMarker)} after the start marker`);
		return body.slice(start, end);
	}

	it("skips the canary E2E gate on exactly KAINBAIN_SKIP_CANARY=1 (parity with npm test)", () => {
		// Parity contract with resolveCanary() in scripts/run-tests.mjs:
		// `npm test` and `deploy.sh --prod` must skip canary on the identical
		// condition. An any-non-empty check here would let a stray value
		// silently disable the deploy gate while `npm test` still runs it
		// (or vice versa), re-opening the #KB-0417 blind spot.
		const body = readDeploySh();
		assert.match(
			body,
			/if \[ "\$\{KAINBAIN_SKIP_CANARY:-\}" = "1" \]; then/,
			"canary gate must skip on exactly KAINBAIN_SKIP_CANARY=1, matching resolveCanary()",
		);
		assert.match(
			body,
			/not exactly '1'.*running the canary E2E gate/s,
			"a stray KAINBAIN_SKIP_CANARY value must warn and run the gate (fail-safe), never skip silently",
		);
	});

	it("labels the release snapshot with the pre-increment build (no mislabel)", () => {
		const body = readDeploySh();
		const prevCapture = body.indexOf('PREV_BUILD="$(current_build)"');
		const nextConsume = body.indexOf('BUILD_NUMBER="$(next_build)"');
		assert.ok(prevCapture !== -1, "deploy.sh must capture PREV_BUILD from the counter");
		assert.ok(nextConsume !== -1, "deploy.sh must consume BUILD_NUMBER via next_build");
		assert.ok(
			prevCapture < nextConsume,
			"PREV_BUILD must be read BEFORE the counter increments, or releases/build-N holds the wrong build",
		);
	});

	it("guards the STAGE EXIT trap when the stage dir was never created", () => {
		const body = readDeploySh();
		assert.match(
			body,
			/trap 'stop_deploy_heartbeat[^']*if \[ -n "\$\{STAGE:-\}" \]; then rm -rf "\$STAGE"; fi' EXIT/,
			"EXIT trap must reap the heartbeat ticker (no orphaned freshness) AND no-op when STAGE is unset (early exits), or `rm -rf \"\"` masks the real exit code",
		);
	});

	it("fails fast on missing jq/curl before consuming a build number", () => {
		// Window runs through the post-lock counter consumption (5b): since
		// 2026-10-08 the build number is consumed AFTER lock acquisition (not
		// pre-gates) so waiter/gate aborts never burn a number, but the tool
		// gate must still precede the consumption.
		const prodBlock = sectionBetween(readDeploySh(), "# --- Production deploy", "# Back up the current deployment");
		assert.match(prodBlock, /command -v "\$_deploy_tool"|command -v jq/, "prod block must gate on load-bearing tools");
		assert.match(prodBlock, /curl/, "prod block must gate on curl (health gate)");
		const gateAt = prodBlock.search(/Required tool/);
		const consumeAt = prodBlock.indexOf('BUILD_NUMBER="$(next_build)"');
		assert.ok(gateAt !== -1 && gateAt < consumeAt, "tool gate must run before the build counter is consumed");
	});

	it("creates the deploy dir before taking the rollback lock", () => {
		const rollbackBlock = sectionBetween(
			readDeploySh(),
			"# --- Rollback mode",
			"# --- Production deploy",
		);
		const mkdirAt = rollbackBlock.indexOf('mkdir -p "$DEPLOY_DIR"');
		const lockAt = rollbackBlock.indexOf('exec 9>"$LOCK_FILE"');
		assert.ok(mkdirAt !== -1, "rollback mode must create $DEPLOY_DIR");
		assert.ok(lockAt !== -1, "rollback mode must take the deploy lock");
		assert.ok(mkdirAt < lockAt, "rollback mkdir must precede the lock open (first-ever run has no dir)");
	});

	it("never re-enters auto-rollback through the ERR trap", () => {
		const body = readDeploySh();
		assert.match(
			body,
			/do_rollback "health check failed after deploy"[^;]*\|\| true/,
			"health-failure auto-rollback must be || true-guarded: a failing rollback plus ERR trap means a double rollback",
		);
	});

	it("never rolls back a healthy deploy over an nginx reload failure", () => {
		const body = readDeploySh();
		assert.match(
			body,
			/if ! reload_nginx; then/,
			"reload_nginx must be failure-guarded: the new instance is already healthy, reload is warn-only",
		);
	});

	it("always leaves a durable result from rollback-mode failures", () => {
		const rollbackFn = sectionBetween(readDeploySh(), "do_rollback() {", "# --- Dev mode");
		assert.match(rollbackFn, /if ! .*cp -r/, "rollback swap copy must be guarded with a failed write_result");
		assert.match(rollbackFn, /if ! restart_service/, "rollback restart must be guarded with a failed write_result");
	});

	it("never passes --pipe to systemd-run (dead-reader regression, 2026-10-12)", () => {
		// --pipe hands the engine's pipe descriptors to the transient unit
		// as-is; restart_service kills the API together with the --wait
		// watcher, so the reader vanishes and the unit's next stdout write
		// hits EPIPE/SIGPIPE and dies BEFORE write_result "success" and
		// BEFORE the health gate / auto-rollback (Deployment UI stuck at
		// "deploying", broken build left live). Unit stdio belongs in the
		// journal, which never has a dead reader.
		const block = reexecBlock();
		assert.ok(
			!/(^|\s)--pipe(\s|$)/m.test(block),
			"re-exec must not pass --pipe: a dead reader aborts the deploy before its terminal result",
		);
	});

	it("needs no stdio detach before restart_service (no pipe, no EPIPE)", () => {
		// With no --pipe there is no engine pipe to detach from: the unit's
		// stdio is the journal. An `exec >>$LOG_FILE` here would only
		// duplicate log lines (log() already writes both) and drop the
		// journal copy.
		const body = readDeploySh();
		const restartCall = body.indexOf("\trestart_service\n");
		assert.ok(restartCall !== -1, "deploy.sh must call restart_service in prod block");
		const window = body.slice(Math.max(0, restartCall - 700), restartCall);
		assert.ok(
			!/exec\s*>>/.test(window),
			"no stdio re-exec may precede restart_service: unit stdio is the journal by design",
		);
	});
});

describe("deploy.sh re-exec argv (fake systemd-run, no --pipe)", () => {
	it("omits --pipe from the real re-exec argv while keeping --wait", () => {
		// Dynamic proof of the static contract above: drive the real
		// script's re-exec branch against a fake systemd-run and inspect
		// the argv the unit would actually start with. Without --pipe the
		// unit's stdio is the journal, so no dead reader can EPIPE the
		// deploy after restart_service kills the watcher.
		function runReexecCapture() {
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-nopipe-"));
			try {
				const cgroupFile = path.join(tmp, "cgroup");
				fs.writeFileSync(cgroupFile, "0::/user.slice/user-1000.slice/user@1000.service/app.slice/kainbain.service\n");
				const argvLog = path.join(tmp, "argv.log");
				const fakeBin = path.join(tmp, "bin");
				fs.mkdirSync(fakeBin);
				fs.writeFileSync(
					path.join(fakeBin, "systemd-run"),
					`#!/bin/sh\nprintf '%s\\n' "$@" > "${argvLog}"\nexit 0\n`,
					{ mode: 0o755 },
				);
				spawnSync("bash", ["deploy.sh", "--prod", "--fast"], {
					cwd: REPO_ROOT,
					env: {
						...process.env,
						KAINBAIN_CGROUP_FILE: cgroupFile,
						KAINBAIN_OUTSIDE_CGROUP: "",
						KAINBAIN_DEPLOY_ATTEMPT_ID: "",
						KAINBAIN_ATTEMPT_WAIT_SECONDS: "",
						HOME: tmp,
						PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
					},
					encoding: "utf8",
				});
				return fs.readFileSync(argvLog, "utf8").split("\n").filter(Boolean);
			} finally {
				fs.rmSync(tmp, { recursive: true, force: true });
			}
		}
		const argv = runReexecCapture();
		assert.ok(argv.includes("--wait"), `systemd-run argv must keep --wait: ${JSON.stringify(argv)}`);
		assert.ok(!argv.includes("--pipe"), `systemd-run argv must not contain --pipe: ${JSON.stringify(argv)}`);
	});
});

describe("deploy.sh engine heartbeat pump (foreground liveness)", () => {
	it("emits engine-visible heartbeats while the detached unit runs", () => {
		// The transient unit's stdio is the journal, so the engine (which
		// watches THIS shell's stdout) would see total silence for a whole
		// gate run and declare the merge/deploy stage stalled. The
		// foreground pump must print a heartbeat line on the engine's pipe
		// while the unit runs, then propagate the unit's exit code.
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-deploy-pump-"));
		try {
			const cgroupFile = path.join(tmp, "cgroup");
			fs.writeFileSync(
				cgroupFile,
				"0::/user.slice/user-1000.slice/user@1000.service/app.slice/kainbain.service\n",
			);
			const fakeBin = path.join(tmp, "bin");
			fs.mkdirSync(fakeBin);
			fs.writeFileSync(
				path.join(fakeBin, "systemd-run"),
				"#!/bin/sh\nsleep 3\nexit 0\n",
				{ mode: 0o755 },
			);
			const child = spawnSync("bash", ["deploy.sh", "--prod", "--fast"], {
				cwd: REPO_ROOT,
				env: {
					...process.env,
					KAINBAIN_CGROUP_FILE: cgroupFile,
					KAINBAIN_OUTSIDE_CGROUP: "",
					KAINBAIN_DEPLOY_ATTEMPT_ID: "",
					KAINBAIN_ATTEMPT_WAIT_SECONDS: "",
					// 1s cadence keeps the test fast; the clamp floor is 1.
					KAINBAIN_ENGINE_HEARTBEAT_SECONDS: "1",
					HOME: tmp,
					PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
				},
				encoding: "utf8",
				// Generous deadline: this self-test runs in the same overlap window
				// as the unit/lint/build/canary branches, and a 20s budget starved
				// the bash+node child on a loaded host (the #KB-0417 flake). The
				// assertions below still fail a genuine hang, just less promptly.
				timeout: 60000,
			});
			assert.equal(child.status, 0, child.stderr);
			assert.match(
				child.stdout,
				/Deploy running in detached unit \d+/,
				`the foreground pump must print engine-visible heartbeats (stdout: ${JSON.stringify(child.stdout)})`,
			);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
