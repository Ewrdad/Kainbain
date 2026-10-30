import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { listOrphanWorkdirs, prepareIntegrationWorkdir, prepareWorkdir, reapTaskWorkdirIfTerminal, removeIntegrationWorkdir, runGit, slugForRepo, syncTaskDocs, touchWorkdir } from "./project.js";
import { RunnerGitError } from "./project.js";
import { runHarnessStage } from "./harness.js";
// The Runner bundle ships shared/ next to this folder (runner/{runner,api,shared}
// in prod and in the distributable tarball), so ../shared resolves both in the
// repo and in every deployed layout — the same copy the backend executes.
import { servingModelFor } from "../shared/servingModelFor.js";
import { formatPosture } from "../shared/formatPosture.js";
import { commitAndPush } from "./gitOps.js";

export const RUNNER_VERSION = "0.1.0";

/***
 * MARK: RUNNER_API_VERSION
 * @description Backend API version this Runner speaks, loaded from
 *   runner/version.json at startup (kept beside daemon.js in the bundle).
 *   Falls back to the pinned fallback when the file is unreadable; the test
 *   suite pins the fallback to runner/version.json.
 * @example RUNNER_API_VERSION => '1.0.0'
 ***/
export const RUNNER_API_VERSION = (() => {
	try {
		const file = new URL("./version.json", import.meta.url);
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return typeof parsed?.apiVersion === "string" && parsed.apiVersion ? parsed.apiVersion : "1.0.0";
	} catch {
		return "1.0.0";
	}
})();

// Claim renewal cadence: comfortably inside the 5-minute production lease
// TTL (KAINBAIN_CLAIM_TTL_MS) so long harness runs keep their fence. A
// shorter operator TTL still heals via lazy expiry + STALE_EPOCH fencing.
export const CLAIM_HEARTBEAT_MS = 60_000;

const execFileAsync = promisify(execFile);

/***
 * MARK: HARNESS_VERSION_BINS
 * @description CLI binaries probed for `--version` per harness id (G5:
 *   R07/R11 version drift). First binary that answers wins; `mock` has no
 *   CLI and reports a fixed marker. Probing is best-effort with a short
 *   timeout — a missing CLI resolves to "unknown", never a boot failure.
 * @example HARNESS_VERSION_BINS.vibe => ['vibe']
 ***/
export const HARNESS_VERSION_BINS = {
	mock: [],
	pi: ["pi"],
	muse: ["muse"],
	antigravity: ["agy", "antigravity"],
	vibe: ["vibe"],
};

const harnessVersionCache = new Map();

/***
 * MARK: probeHarnessVersions
 * @description Probes the harness CLI's `--version` once per process and
 *   caches it (G5). Returns `{ [harnessId]: version }` for `factsFor`, so
 *   the backend capability record names the real CLI drift instead of
 *   "unknown". Unknown ids and missing/slow CLIs resolve to "unknown".
 * @example await probeHarnessVersions('mock') => { mock: 'mock' }
 * @param {string} harnessId - Harness id (mock, pi, muse, antigravity, vibe).
 * @param {Object} [opts] - Options.
 * @param {number} [opts.timeoutMs=4000] - Per-binary probe timeout.
 * @returns {Promise<Object>} Version map for `factsFor`.
 ***/
export async function probeHarnessVersions(harnessId, { timeoutMs = 4000 } = {}) {
	if (harnessVersionCache.has(harnessId)) return harnessVersionCache.get(harnessId);
	let version = harnessId === "mock" ? "mock" : "unknown";
	for (const bin of HARNESS_VERSION_BINS[harnessId] ?? []) {
		try {
			const res = await execFileAsync(bin, ["--version"], { timeout: timeoutMs });
			const text = typeof res === "string" ? res : (res?.stdout ?? "");
			const first = String(text).split("\n")[0].trim();
			if (first) {
				version = first.slice(0, 120);
				break;
			}
		} catch {
			// Try the next binary; a missing CLI is "unknown", not fatal.
		}
	}
	const versions = { [harnessId]: version };
	harnessVersionCache.set(harnessId, versions);
	return versions;
}

/***
 * MARK: clearHarnessVersionCache
 * @description Test hook: drops the cached `--version` probes so each test
 *   observes a fresh probe.
 * @example clearHarnessVersionCache()
 ***/
export function clearHarnessVersionCache() {
	harnessVersionCache.clear();
}

/***
 * MARK: runnerHarnessIds
 * @description Normalized harness list for one Runner: the csv
 *   `harnessIds` when configured, else the singular primary `harnessId`.
 *   Tolerates hand-built configs (tests) that only set `harnessId`.
 * @example runnerHarnessIds({ harnessId: 'pi' }) => ['pi']
 * @param {Object} [config] - Normalized runner config.
 * @returns {string[]} Harness ids, primary first.
 ***/
export function runnerHarnessIds(config = {}) {
	const ids = Array.isArray(config.harnessIds)
		? config.harnessIds.map((h) => String(h ?? "").trim()).filter(Boolean)
		: [];
	if (ids.length > 0) return ids;
	const primary = String(config.harnessId ?? "").trim();
	return primary ? [primary] : [];
}

/***
 * MARK: applyBackendPrompt
 * @description Retargets a backend-curated prompt to the prepared worktree:
 *   the backend curates with its own project cwd (it owns task/stage truth),
 *   so every occurrence of that cwd prefix is rewritten to the worktree the
 *   harness will actually run in. Empty prompt (old backend) stays empty so
 *   the caller falls back to its minimal prompt.
 * @example applyBackendPrompt({ prompt: 'see /repo/docs', backendCwd: '/repo', workdir: '/w' }) => 'see /w/docs'
 * @param {Object} opts - `{ prompt, backendCwd, workdir }`.
 * @returns {string} The retargeted prompt.
 ***/
export function applyBackendPrompt({ prompt, backendCwd, workdir } = {}) {
	const text = typeof prompt === "string" ? prompt : "";
	if (!text || !backendCwd || !workdir || backendCwd === workdir) return text;
	return text.split(backendCwd).join(workdir);
}

/***
 * MARK: startClaimRenewal
 * @description Renews the task claim on a cadence while a harness runs
 *   (D1): agent stages routinely outlive the claim TTL, and without
 *   renewal the hold lapses mid-stage — the task re-queues, the UI
 *   assignment vanishes, and the finisher reports STALE_EPOCH. Renewal
 *   is best-effort (a failure warns, the final complete surfaces
 *   staleness) and the timer is unref'd so it dies with the daemon —
 *   a dead Runner's hold still lapses.
 * @example const stop = startClaimRenewal({ client, logger, taskId: 't1', ... }); stop();
 * @param {Object} opts - Options (client, logger, taskId, projectId, executionId, epoch, intervalMs?).
 * @returns {Function} Call to stop the renewal timer.
 ***/
export function startClaimRenewal({
	client,
	logger,
	taskId,
	projectId,
	executionId,
	epoch,
	intervalMs = CLAIM_HEARTBEAT_MS,
	onTick = null,
}) {
	const fireTick = () => {
		try {
			if (typeof onTick === "function") onTick();
		} catch {
			// Liveness marking must never break lease renewal.
		}
	};
	const timer = setInterval(() => {
		client
			.claimHeartbeat({ taskId, projectId, executionId, epoch })
			.then(
				() => fireTick(),
				(err) => {
				logger.warn(`Claim renewal failed: ${err?.message || err}`);
				// The backend timed the stage out and released the hold:
				// stop propping it up. The harness run itself continues to
				// its natural finish, whose complete is then stale-rejected
				// by the lease fence — never reported as fresh work.
				if (err?.code === "STAGE_TIMEOUT") clearInterval(timer);
			});
	}, intervalMs);
	if (typeof timer.unref === "function") timer.unref();
	return () => clearInterval(timer);
}

/***
 * MARK: diskHeadroomMbFor
 * @description Measures free space on the filesystem holding the Runner
 *   work root (G4: R10 dispatch cut-off). Synchronous — one statfs call
 *   per heartbeat. Returns null when unmeasurable so the backend
 *   `DISK_LOW` check stays skipped rather than firing on bad data.
 * @example diskHeadroomMbFor('/tmp') => 12345
 * @param {string} workRoot - Runner work root (or any path on that fs).
 * @returns {number|null} Free megabytes, or null when unmeasurable.
 ***/
export function diskHeadroomMbFor(workRoot) {
	for (const candidate of [workRoot, process.cwd()]) {
		try {
			if (!candidate) continue;
			const st = fs.statfsSync(candidate);
			if (st && Number.isFinite(st.bavail) && Number.isFinite(st.bsize)) {
				return Math.floor((st.bavail * st.bsize) / (1024 * 1024));
			}
		} catch {
			// Try the next candidate; unmeasurable stays null.
		}
	}
	return null;
}

/***
 * MARK: defaultLoadHarness
 * @description Resolves a harness implementation by id for loopback runs.
 *   Anything HarnessSession-conforming works; only the ids below are
 *   wired (anything else fails fast naming what is supported).
 * @example const h = await defaultLoadHarness('mock')
 * @param {string} harnessId - Harness id (mock, pi, muse, antigravity, vibe).
 * @returns {Promise<Object>} Harness with `createSession`.
 ***/
export async function defaultLoadHarness(harnessId) {
	if (harnessId === "mock") {
		const { createMockHarness } = await import(
			"../api/agent/harnesses/mock/mockHarness.js"
		);
		return createMockHarness({ models: [] });
	}
	if (harnessId === "pi") {
		const { createPiHarness } = await import("../api/agent/harnesses/pi/piHarness.js");
		return createPiHarness({});
	}
	if (harnessId === "muse") {
		const { createMuseHarness } = await import(
			"../api/agent/harnesses/muse/museHarness.js"
		);
		return createMuseHarness({});
	}
	if (harnessId === "antigravity") {
		const { createAntigravityHarness } = await import(
			"../api/agent/harnesses/antigravity/agyHarness.js"
		);
		return createAntigravityHarness({});
	}
	if (harnessId === "vibe") {
		const { createVibeHarness } = await import(
			"../api/agent/harnesses/vibe/vibeHarness.js"
		);
		return createVibeHarness({});
	}
	throw new Error(`Unknown harness ${harnessId} (supported: mock, pi, muse, antigravity, vibe).`);
}

function factsFor({ config, harnessVersions }) {
	const versionFor = (id) =>
		harnessVersions?.[id] ?? harnessVersionCache.get(id)?.[id] ?? "unknown";
	return {
		harnesses: runnerHarnessIds(config).map((id) => ({ id, version: versionFor(id) })),
		models:
			Array.isArray(config.models) && config.models.length > 0
				? [...config.models]
				: config.model
					? [config.model]
					: [],
		tiers: config.tiers,
		diskHeadroomMb: diskHeadroomMbFor(config.workRoot),
		versions: { protocol: "v1", runner: RUNNER_VERSION, api: RUNNER_API_VERSION },
	};
}

/***
 * MARK: joinAndHeartbeat
 * @description Shared join prologue: poll a pending join until the human
 *   approves (then exit asking for the pasted credential), load the
 *   harness, heartbeat once, and start the background heartbeat timer.
 * @example const { harness, stop } = await joinAndHeartbeat({ config, client, loadHarness, logger, state })
 * @param {Object} opts - Options.
 * @param {Object} opts.config - Normalized runner config.
 * @param {Object} opts.client - Runner backend client.
 * @param {Function} opts.loadHarness - Harness loader.
 * @param {Object} opts.logger - Logger.
 * @param {Object} opts.state - Live-execution ref (`{ session, executionId, epoch }`), read by the steer pull cycle.
 * @returns {Promise<Object>} Primary `harness`, full `harnesses` map, plus `stop()` for the timer.
 ***/
async function joinAndHeartbeat({ config, client, loadHarness, logger, state }) {
	if (!config.credential) {
		if (!config.joinToken) {
			throw new Error("No credential and no KAINBAIN_RUNNER_JOIN_TOKEN: cannot join.");
		}
		const deadline = Date.now() + config.approvalTimeoutMs;
		// Probe before the first register so even a pending join advertises
		// the real harness CLI versions (G5).
		const joinVersions = {};
		for (const id of runnerHarnessIds(config)) {
			Object.assign(joinVersions, await probeHarnessVersions(id));
		}
		for (;;) {
			const reg = await client.register({
				runnerId: config.runnerId,
				joinToken: config.joinToken,
				facts: factsFor({ config, harnessVersions: joinVersions }),
			});
			if (reg.status === "active") break;
			if (Date.now() > deadline) {
				throw new Error(`Join for ${config.runnerId} still ${reg.status} after timeout.`);
			}
			logger.log(`Join ${reg.status}; waiting for human approval in Settings › Harness › Runners…`);
			await new Promise((r) => setTimeout(r, config.approvalPollMs));
		}
		throw new Error(
			`Join for ${config.runnerId} approved. Paste the one-time credential shown in Settings › Harness › Runners into KAINBAIN_RUNNER_CREDENTIAL and restart.`,
		);
	}
	client.setCredential(config.credential);

	// Multi-harness service: load every advertised harness once; each
	// dispatch answer then serves with its required one.
	const harnesses = {};
	for (const id of runnerHarnessIds(config)) {
		harnesses[id] = await loadHarness(id);
	}
	const harness = harnesses[config.harnessId] ?? Object.values(harnesses)[0];
	if (!harness) {
		throw new Error("Runner has no harness configured (KAINBAIN_RUNNER_HARNESS or KAINBAIN_RUNNER_HARNESSES).");
	}
	// G5: probe each harness CLI version once at load; every later factsFor
	// call (register, heartbeats, steer pulls) reuses the cached probes, so
	// the backend sees real CLI drift instead of "unknown".
	const harnessVersions = {};
	for (const id of runnerHarnessIds(config)) {
		Object.assign(harnessVersions, await probeHarnessVersions(id));
	}
	const facts = factsFor({ config, harnessVersions });
	const beat = await client.heartbeat({ runnerId: config.runnerId, facts });
	if (beat.status !== "active") {
		throw new Error(`Runner ${config.runnerId} is ${beat.status}; need an active registration.`);
	}
	const heartbeatTimer = setInterval(() => {
		// Fresh facts every beat: disk headroom is re-measured (G4) while
		// the harness CLI version resolves from the load-time probe cache.
		deliverSteers({ config, client, logger, facts: factsFor({ config }), state }).catch((err) => {
			logger.warn(`Heartbeat failed: ${err?.message || err}`);
		});
	}, config.heartbeatMs);
	if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
	return { harness, harnesses, facts, stop: () => clearInterval(heartbeatTimer) };
}

/***
 * MARK: deliverSteers
 * @description One D5 pull cycle (ADR 0011): heartbeat, deliver each
 *   pending steer for the CURRENT execution to the live session
 *   (`steer`, falling back to `followUp`), and ack exactly once. Steers
 *   for any other execution are ignored (stale lease, never ours).
 *   A session without either method NACKs UNSUPPORTED_HARNESS — loud,
 *   never silently dropped.
 * @example await deliverSteers({ config, client, logger, facts, state })
 * @param {Object} opts - Options (config, client, logger, facts, state).
 * @returns {Promise<number>} Steers delivered (acked) this cycle.
 ***/
export async function deliverSteers({ config, client, logger, facts, state }) {
	const beat = await client.heartbeat({ runnerId: config.runnerId, facts });
	const due = (beat.pendingSteers || []).filter((s) => s && s.executionId === state?.executionId);
	let delivered = 0;
	for (const steer of due) {
		const session = state.session;
		let ok = true;
		let detail = "delivered";
		try {
			if (session && typeof session.steer === "function") {
				await session.steer(steer.text);
			} else if (session && typeof session.followUp === "function") {
				await session.followUp(steer.text);
			} else {
				ok = false;
				detail = "UNSUPPORTED_HARNESS";
			}
		} catch (err) {
			ok = false;
			detail = String(err?.message || err).slice(0, 500);
		}
		try {
			await client.steerAck({
				taskId: steer.taskId,
				projectId: steer.projectId,
				executionId: steer.executionId,
				epoch: steer.epoch,
				steerId: steer.steerId,
				ok,
				detail,
			});
			delivered += 1;
		} catch (err) {
			logger.warn(`Steer ack failed: ${err?.message || err}`);
		}
	}
	return delivered;
}

/**
 * MARK: CI_TIMEOUT_EXIT_CODE
 * @description Exit code reported when the CI budget fires (mirrors GNU
 *   timeout's 124), so a timeout is distinguishable from a failing suite.
 * @example CI_TIMEOUT_EXIT_CODE => 124
 **/
export const CI_TIMEOUT_EXIT_CODE = 124;

/***
 * MARK: ciWorkdirFor
 * @description Working directory for a dispatched CI stage: the task
 *   worktree by default, or the primary checkout (project.cwd on this host)
 *   when the stage declares runOnBranch 'primary' — the same contract the
 *   backend's embedded path honours. Post-merge stages (e.g. publish) need
 *   the primary tree, not the task branch.
 * @example ciWorkdirFor({ runOnBranch: 'primary', workdir: '/w/kb-t', projectCwd: '/repo' }) => '/repo'
 * @example ciWorkdirFor({ runOnBranch: 'task', workdir: '/w/kb-t', projectCwd: '/repo' }) => '/w/kb-t'
 * @param {Object} opts - `{ runOnBranch, workdir, projectCwd }`.
 * @returns {string} Directory the CI command runs in.
 ***/
export function ciWorkdirFor({ runOnBranch, workdir, projectCwd } = {}) {
	if (
		typeof runOnBranch === "string" &&
		runOnBranch.trim().toLowerCase() === "primary" &&
		typeof projectCwd === "string" &&
		projectCwd
	) {
		return projectCwd;
	}
	return workdir;
}

/***
 * MARK: resolveCiWorkdir
 * @description Resolves the working directory for a dispatched CI stage,
 *   honouring the stage's runOnBranch mode end to end (the UI toggle must
 *   never be silently dropped): 'task' (default) runs in the task worktree;
 *   'primary' runs in the primary checkout (project.cwd on this host), where
 *   host/publish commands such as deploy.sh expect to run; 'custom' runs in
 *   a fresh ephemeral detached worktree at the named branch — never in the
 *   shared primary checkout (nothing engine-owned can dirty it) and never in
 *   the task worktree (a custom branch is not kb/*). The returned `cleanup`
 *   removes the ephemeral worktree again (custom mode only; null otherwise).
 * @example await resolveCiWorkdir({ runOnBranch: 'custom', customBranch: 'release/next', workdir: '/w/kb-t', projectCwd: '/repo', repoUrl: null, workRoot: '/w', taskId: 't' }) => { workdir: '/w/kb-ci-t', cleanup: [Function] }
 * @param {Object} opts - `{ runOnBranch, customBranch, workdir, projectCwd, repoUrl, workRoot, taskId }`.
 * @returns {Promise<{workdir: string, cleanup: (Function|null)}>}
 * @throws {Error} Custom mode with a blank branch name, or a branch that does
 *   not exist in the source repo (fails loud, mirroring the backend's
 *   resolveCiBranchPlan — never silently fall back to the task worktree).
 ***/
export async function resolveCiWorkdir({ runOnBranch, customBranch, workdir, projectCwd, repoUrl = null, workRoot, taskId } = {}) {
	const mode = typeof runOnBranch === "string" ? runOnBranch.trim().toLowerCase() : "task";
	if (mode !== "custom") {
		return { workdir: ciWorkdirFor({ runOnBranch, workdir, projectCwd }), cleanup: null };
	}
	const branch = typeof customBranch === "string" ? customBranch.trim() : "";
	if (!branch) {
		throw new Error("CI stage runOnBranch 'custom' needs a customBranch name (set it in the stage's Run-on branch settings)");
	}
	// Source repo: the refreshed mirror for remote projects, else the adopted
	// local checkout (same repoDir prepareWorkdir used for the task worktree).
	const repoDir = repoUrl
		? path.join(workRoot, "mirrors", slugForRepo(repoUrl))
		: projectCwd || workdir;
	// Branch must exist locally (backend validates the same contract).
	await runGit(repoDir, ["rev-parse", "--verify", `refs/heads/${branch}`]);
	const dir = path.join(workRoot, `kb-ci-${taskId}`);
	fs.rmSync(dir, { recursive: true, force: true });
	// Detached at the branch tip: no branch lock, so a sibling checkout of the
	// same branch elsewhere is never disturbed.
	await runGit(repoDir, ["worktree", "add", "--detach", dir, branch]);
	const cleanup = async () => {
		try { await runGit(repoDir, ["worktree", "remove", "--force", dir]); } catch { /* already gone */ }
		try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
	};
	return { workdir: dir, cleanup };
}

/***
 * MARK: runCiCommand
 * @description Runs one backend-dispatched CI/command stage in the worktree:
 *   shell command (already keyword-expanded by the backend, backend cwd
 *   retargeted to the worktree), output streamed to onLog and collected
 *   (tail-capped). Resolves { exitCode, timedOut, timeoutMs, output } —
 *   non-zero is a result, not a throw; spawn failure resolves exitCode 1
 *   with the error as output. The shell leads its own process group so the
 *   timeout kills the whole tree: killing only the shell orphaned the gate
 *   (it ran to green while close() reported signal-death as exit 1, task
 *   b5716327).
 * @example await runCiCommand({ command: 'true', workdir: '/w', onLog: () => {} }) => { exitCode: 0 }
 * @param {Object} opts - `{ command, workdir, timeoutMs?, onLog?, env? }`.
 * @returns {Promise<Object>} `{ exitCode, timedOut, timeoutMs, output }`.
 ***/
export function runCiCommand({ command, workdir, timeoutMs = 600000, onLog = () => {}, env = {} } = {}) {
	return new Promise((resolve) => {
		const shell = process.platform === "win32" ? "cmd" : "/bin/bash";
		const args = process.platform === "win32" ? ["/c", command] : ["-c", command];
		const effectiveTimeoutMs = timeoutMs > 0 ? timeoutMs : 600000;
		let child;
		try {
			child = spawn(shell, args, {
				cwd: workdir,
				env: { ...process.env, ...env },
				detached: process.platform !== "win32",
			});
		}
		catch (err) { resolve({ exitCode: 1, timedOut: false, timeoutMs: effectiveTimeoutMs, output: String(err?.message || err) }); return; }
		let output = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				if (child.pid !== undefined && process.platform !== "win32") {
					try { process.kill(-child.pid, "SIGKILL"); } catch {}
				}
				try { child.kill("SIGKILL"); } catch {}
			} catch {}
			output = `${output}\nCI command timed out after ${effectiveTimeoutMs}ms\n`;
		}, effectiveTimeoutMs);
		const onData = (buf) => { const text = buf.toString(); output = (output + text).slice(-20000); try { onLog(text); } catch {} };
		child.stdout?.on("data", onData); child.stderr?.on("data", onData);
		child.on("error", (err) => { clearTimeout(timer); resolve({ exitCode: 1, timedOut: false, timeoutMs: effectiveTimeoutMs, output: output + String(err?.message || err) }); });
		child.on("close", (code) => { clearTimeout(timer); resolve({ exitCode: timedOut ? CI_TIMEOUT_EXIT_CODE : (typeof code === "number" ? code : 1), timedOut, timeoutMs: effectiveTimeoutMs, output }); });
	});
}

/***
 * MARK: executeAssignment
 * @description Shared execution body: claim (or consume the dispatch
 *   answer's lease — the route already claim-fenced it), load, run,
 *   commit/push, and complete one assignment (used by both
 *   single-assignment and loop).
 * @example await executeAssignment({ config, client, logger, harness, state, projectId, taskId })
 * @param {Object} opts - Options (config, client, logger, harness, state, projectId, taskId, lease?, model?, harnessId?).
 * @param {string} [opts.model] - Required model from the dispatch answer
 *   (`requirements.model`); the runner serves exactly that, never a
 *   substitution. Falls back to the pinned `config.model` (single-assignment
 *   mode or a model-less task), else the harness default.
 * @param {string} [opts.harnessId] - Serving harness id for the posture
 *   line; defaults to the primary `config.harnessId`.
 * @param {Object} [opts.ciEnv] - Backend-curated extra environment for a
 *   dispatched CI command (opaque string bag, e.g. continuity markers the
 *   command needs to recognise a re-dispatch). Sanitized and merged under
 *   the daemon-owned identity keys, which always win.
 * @returns {Promise<Object>} Execution summary.
 ***/

/***
 * MARK: sanitizeCiEnv
 * @description Bounds an assignment-provided env bag to a flat map of
 *   non-empty string keys to non-empty string values (at most 100 entries,
 *   mirroring the backend lifecycle seam): the dispatch payload is
 *   backend-curated, but the child environment must stay a string map.
 *   Non-objects read as empty so a missing/foreign `env` degrades to
 *   today's behaviour. Total on untrusted input.
 * @example sanitizeCiEnv({ A: '1', B: 2 }) => { A: '1' }
 * @param {unknown} value - Candidate env bag from the dispatch answer/claim.
 * @returns {Object} Sanitized string map (possibly empty).
 ***/
export function sanitizeCiEnv(value) {
	try {
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		const out = {};
		let count = 0;
		for (const [key, val] of Object.entries(value)) {
			if (count >= 100) break;
			if (typeof key !== "string" || !key) continue;
			if (typeof val !== "string" || !val) continue;
			out[key] = val;
			count += 1;
		}
		return out;
	} catch {
		return {};
	}
}
export function collectTaskFiles({ workdir, taskId } = {}) {
	const dir = `${workdir}/docs/tasks/${taskId}`;
	const files = [];
	let total = 0;
	try {
		for (const name of fs.readdirSync(dir)) {
			if (name === "task.md") continue;
			try {
				const content = fs.readFileSync(`${dir}/${name}`, "utf8");
				const bytes = Buffer.byteLength(content, "utf8");
				if (bytes > 256 * 1024 || total + bytes > 1024 * 1024) continue;
				files.push({ name, content });
				total += bytes;
			} catch { /* unreadable/binary: skip */ }
		}
	} catch { /* no task docs: nothing to ship */ }
	return files;
}

async function executeAssignment({
	config,
	client,
	logger,
	harness,
	state,
	projectId,
	taskId,
	lease,
	backendPrompt = "",
	kind = "",
	ciCommand = "",
	ciTimeoutMs = 0,
	ciEnv = null,
	model = null,
	harnessId = null,
	runOnBranch = "",
	customBranch = "",
	integration = null,
}) {
	const servingHarnessId = harnessId || config.harnessId || "unknown";
		const project = await client.getProject(projectId);
		const task = await client.getTask(projectId, taskId);
		const stageId = String(task.currentStageId ?? task.stages?.[0]?.id ?? "stage");

		const runStartedAt = Date.now();
		// Dispatch already holds the lease (scan → match → claim-fence);
		// re-claiming it would 409 against ourselves. Single-assignment
		// has no lease yet, so it claims here.
		const claim = lease ?? (await client.claim({ taskId, projectId }));
		const { executionId, epoch } = claim;
		if (!backendPrompt && typeof claim.prompt === "string") backendPrompt = claim.prompt;
		if (!kind && typeof claim.kind === "string") kind = claim.kind;
		if (!ciCommand && typeof claim.command === "string") ciCommand = claim.command;
		if (!ciTimeoutMs && Number(claim.timeoutMs)) ciTimeoutMs = Number(claim.timeoutMs);
		if (!runOnBranch && typeof claim.runOnBranch === "string") runOnBranch = claim.runOnBranch;
		if (!customBranch && typeof claim.customBranch === "string") customBranch = claim.customBranch;
		if (ciEnv === null || ciEnv === undefined) ciEnv = claim.env;
		if (integration === null || integration === undefined) integration = claim.integration ?? null;
		// Leased integrations run their own procedure (Step 4): ephemeral
		// worktree, merge, CAS-push, verify — no harness, no task worktree.
		if (kind === "integrate") {
			return executeIntegrationAssignment({
				config, client, logger, state, projectId, taskId, claim, integration: integration || {},
			});
		}
		// Publish the live execution for the steer pull cycle (D5); the
		// heartbeat loop only ever delivers steers for THIS execution.
		state.executionId = executionId;
		state.epoch = epoch;
		state.session = null;
		// Lease renewal (D1): agent stages routinely outlive the claim
		// TTL, so extend the hold while the harness runs (see
		// startClaimRenewal).
		const stopRenewal = startClaimRenewal({
			client,
			logger,
			taskId,
			projectId,
			executionId,
			epoch,
			// Keep this workdir fresh for LRU eviction: a live run must never
			// look stale to a sibling Runner's cap relief.
			onTick: () => {
				if (state.workdir) touchWorkdir(state.workdir);
			},
		});
		try {
			await client.progress({
				taskId: taskId,
				projectId: projectId,
				executionId,
				epoch,
				stageId,
				event: "started",
			});
			const { workdir, branch, mode, reused, recoveredTo, baseSha, evicted } = await prepareWorkdir({
				repoUrl: project.gitUrl || project.repoUrl || null,
				localPath: project.cwd || null,
				workRoot: config.workRoot,
				taskId: taskId,
			});
			state.workdir = workdir;
			logger.log(`Workdir ${workdir} (${mode}${reused ? ", reused" : ""}${baseSha ? `, base ${baseSha.slice(0, 7)}` : ""}${recoveredTo ? `, residue parked on ${recoveredTo}` : ""}${evicted ? `, evicted stale ${evicted.evicted}${evicted.parkedTo ? ` (residue parked on ${evicted.parkedTo})` : ""}` : ""}).`);
			// Task prompt inputs (idea files, reference images) land in the
			// live task folder outside the task branch — mirror them into
			// the worktree so the harness actually sees them.
			try {
				const synced = await syncTaskDocs({ primaryCwd: project.cwd || null, workdir, taskId });
				if (synced > 0) logger.log(`Synced ${synced} task-doc file(s) into worktree.`);
			} catch (err) {
				logger.log(`Task-doc sync skipped: ${err?.message || err}`);
			}

			let seq = 0;
			const sendLogs = async (bytes) => {
				for (const chunk of String(bytes).split("\n")) {
					if (!chunk) continue;
					await client.logs({
						taskId: taskId,
						projectId: projectId,
						executionId,
						epoch,
						seq: seq++,
						bytes: chunk.slice(0, 4000),
					});
				}
			};

			// Backend-curated stage prompt (backend owns curation; the
			// Runner only retargets the backend cwd prefix to the worktree).
			// Absent prompt (old backend) falls back to the minimal prompt.
			let prompt = applyBackendPrompt({ prompt: backendPrompt, backendCwd: project.cwd, workdir });
			if (!prompt) {
				prompt = [`Task goal: ${task.goal || task.title || taskId}`, `Stage: ${stageId}`].join("\n");
			}
			prompt = [
				prompt,
				`Working directory: ${workdir}`,
				`Branch: ${branch}`,
				"Implement the stage goal in the working directory. Keep changes scoped to the task.",
			].join("\n");

			// Report the exact stage prompt plus the serving harness/model
			// for the monitor's with-prompt cards. Best-effort and
			// observability-only: a failed report must never fail the
			// stage itself.
			try {
				await client.progress({
					taskId: taskId,
					projectId: projectId,
					executionId,
					epoch,
					stageId,
					event: "prompted",
					prompt,
					harness: servingHarnessId,
					model: servingModelFor({ kind, model, fallbackModel: config.model }),
				});
			} catch (err) {
				logger.warn(`Prompt report failed: ${err?.message || err}`);
			}

			if (kind === "ci") {
				// Honour the stage's runOnBranch mode: 'task' runs in the task
				// worktree, 'primary' in the primary checkout, 'custom' in an
				// ephemeral worktree at the named branch. A misconfigured mode
				// fails the stage loudly instead of silently running in the
				// task worktree (which is how publish stages used to break:
				// deploy.sh refuses to run from a kb/* worktree).
				// CI stages run no LLM, so the completion posture carries no
				// model segment (formatPosture omits it for model: null) —
				// never the Runner default.
				let ciWorkdir;
				let ciCleanup = null;
				try {
					({ workdir: ciWorkdir, cleanup: ciCleanup } = await resolveCiWorkdir({
						runOnBranch, customBranch, workdir,
						projectCwd: project.cwd || null,
						repoUrl: project.gitUrl || project.repoUrl || null,
						workRoot: config.workRoot,
						taskId,
					}));
				} catch (err) {
					state.session = null; stopRenewal();
					await client.progress({ taskId, projectId, executionId, epoch, stageId, event: "finished" }).catch(() => {});
					return await client.complete({
						taskId, projectId, executionId, epoch, sha: null, branch,
						outcome: "failed",
						failureReason: `CI stage branch setup failed: ${err?.message || err}`,
						taskFiles: collectTaskFiles({ workdir, taskId }), output: "",
						posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: null }),
						durationMs: Date.now() - runStartedAt,
					});
				}
				try {
					const command = applyBackendPrompt({ prompt: ciCommand, backendCwd: project.cwd, workdir: ciWorkdir });
					logger.log(`CI stage command: ${command} (cwd ${ciWorkdir})`);
					// Backend-curated assignment env (continuity markers et al.)
					// flows to the child under the daemon-owned identity keys,
					// which always win so an assignment can never spoof them.
					const ci = await runCiCommand({
						command, workdir: ciWorkdir,
						timeoutMs: ciTimeoutMs || 600000,
						env: { ...sanitizeCiEnv(ciEnv), KAINBAIN_TASK_ID: taskId, KAINBAIN_TASK_DOCS: `${workdir}/docs/tasks/${taskId}` },
						onLog: (text) => { sendLogs(text).catch(() => {}); },
					});
					state.session = null; stopRenewal();
					await client.progress({ taskId, projectId, executionId, epoch, stageId, event: "finished" });
					const sha = (await runGit(ciWorkdir, ["rev-parse", "HEAD"])).stdout.trim();
					if (ci.exitCode !== 0) {
						const failureReason = ci.timedOut
							? `CI command timed out after ${ci.timeoutMs}ms`
							: `CI command failed with exit code ${ci.exitCode}`;
						return await client.complete({ taskId, projectId, executionId, epoch, sha, branch, outcome: "failed", failureReason, taskFiles: collectTaskFiles({ workdir, taskId }), output: ci.output.slice(0, 20000), posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: null }), durationMs: Date.now() - runStartedAt });
					}
					return await client.complete({ taskId, projectId, executionId, epoch, sha, branch, outcome: "passed", taskFiles: collectTaskFiles({ workdir, taskId }), output: ci.output.slice(0, 20000), posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: null }), durationMs: Date.now() - runStartedAt });
				} finally {
					if (ciCleanup) await ciCleanup();
				}
			}

			// The backend project record's cwd points at the backend's own
			// checkout — on the Runner host the task's working copy is the
			// prepared worktree. Run the session THERE, or the agent's file
			// writes land in the wrong repo and the commit/push ships
			// nothing (wire-proof 2026-10-27: hello-wire.txt landed in the
			// backend project dir instead of the worktree).
			const { output } = await runHarnessStage({
				harness,
				project: { ...project, cwd: workdir },
				workdir,
				taskId: taskId,
				stageId,
				model: model || config.model,
				prompt,
				onLog: (text) => {
					sendLogs(text).catch((err) => {
						logger.warn(`Log ingest failed: ${err?.message || err}`);
					});
				},
				onSession: (session) => {
					state.session = session;
				},
			});
			state.session = null;
			stopRenewal();
			await client.progress({
				taskId: taskId,
				projectId: projectId,
				executionId,
				epoch,
				stageId,
				event: "finished",
			});

			const { sha, pushed, pushSkipped, beforeSha, pushState } = await commitAndPush({
				workdir,
				branch,
				taskDocsPath: `docs/tasks/${taskId}`,
				message: `kb/${taskId} ${stageId}: Runner ${config.runnerId} stage output`,
				author: `kainbain-runner/${config.runnerId}`,
			});
			logger.log(`Committed ${sha} (pushed: ${pushed}${pushSkipped ? `, ${pushSkipped}` : ""}${pushState && pushState !== "pushed" ? `, ${pushState}` : ""}${beforeSha && beforeSha !== sha ? `, base was ${beforeSha.slice(0, 7)}` : ""}).`);
			if (output) {
				await sendLogs(`stage output: ${String(output).slice(0, 4000)}`);
			}
			return await client.complete({
				taskId: taskId,
				projectId: projectId,
				executionId,
				epoch,
				sha,
				branch,
				posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servingModelFor({ kind, model, fallbackModel: config.model }) }),
				outcome: "passed",
				taskFiles: collectTaskFiles({ workdir, taskId }),
				output: String(output || "").slice(0, 20000),
				durationMs: Date.now() - runStartedAt,
			});
		} catch (err) {
			stopRenewal();
			if (err?.code === "STALE_EPOCH") throw err;
			if (err?.code === "WORKTREE_CAP_REACHED") {
				// Infra exhaustion, not task fault: re-queue via interrupt
				// and keep polling. Throwing here killed the Runner process,
				// and systemd restart storms turned one refusal into a task
				// death loop (e79b1d25). The reason travels on the interrupt
				// so the task history names the cause instead of a bare
				// "lease dropped".
				const reason = `Runner workdir unavailable: ${err.message}`;
				if (typeof logger.error === "function") logger.error(reason);
				else logger.log(reason);
				try {
					await client.interrupt({ taskId, projectId, executionId, reason });
				} catch {
					// Interrupting is best-effort: the lease TTL still bounds the damage.
				}
				return { interrupted: true, executionId, epoch, reason };
			}
			if (err?.failedOutcome) {
				// The harness ran and failed: report through the engine's
				// failure routing (verdict/failback) instead of parking.
				return await client.complete({
					taskId: taskId,
					projectId: projectId,
					executionId,
					epoch,
					outcome: "failed",
					failureReason: err.failedOutcome,
					posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servingModelFor({ kind, model, fallbackModel: config.model }) }),
					durationMs: Date.now() - runStartedAt,
				});
			}
			try {
				await client.interrupt({
					taskId: taskId,
					projectId: projectId,
					executionId,
				});
			} catch {
				// Interrupting is best-effort: the lease TTL still bounds the damage.
			}
			throw err;
		}
}

/***
 * MARK: executeIntegrationAssignment
 * @description Runs one leased `integrate` job (Step 4): merges
 *   `origin/<taskBranch>` into the target in an ephemeral detached worktree,
 *   CAS-pushes the target against the expected SHA, re-verifies, and reports.
 *   The task claim fences progress/logs/completion exactly like any stage;
 *   the integration lease serializes target writes. Outcomes:
 *   `landed` (merge pushed + verified → task completes passed with the
 *   integration payload the backend finalize needs), `conflict` (structured
 *   file list — never resolved here — task fails back visibly), or
 *   `stale-head` (a ref moved mid-lease → task fails with a retryable
 *   reason; the retry re-bases with fresh SHAs). The ephemeral worktree is
 *   removed in all outcomes.
 * @example await executeIntegrationAssignment({ config, client, logger, state, projectId: 'p', taskId: 't', claim, integration }) => { ... }
 ***/
async function executeIntegrationAssignment({
	config,
	client,
	logger,
	state,
	projectId,
	taskId,
	claim,
	integration,
}) {
	const { taskBranch, expectedTaskSha, targetBranch, expectedTargetSha, mergeAttemptId } = integration;
	const integrationExecutionId = integration.integrationExecutionId;
	const integrationEpoch = integration.integrationEpoch;
	const runStartedAt = Date.now();
	const project = await client.getProject(projectId);
	const task = await client.getTask(projectId, taskId);
	const stageId = String(task.currentStageId ?? task.stages?.[0]?.id ?? "stage");
	const { executionId, epoch } = claim;
	state.executionId = executionId;
	state.epoch = epoch;
	state.session = null;
	const posture = formatPosture({ tiers: config.tiers, harness: "integration", model: null });
	const stopRenewal = startClaimRenewal({ client, logger, taskId, projectId, executionId, epoch });
	const integrationTimer = setInterval(() => {
		client
			.integrationHeartbeat({ projectId, targetBranch, executionId: integrationExecutionId, epoch: integrationEpoch })
			.catch((err) => {
				logger.warn(`Integration renewal failed: ${err?.message || err}`);
				if (err?.code === "STALE_EPOCH") clearInterval(integrationTimer);
			});
	}, CLAIM_HEARTBEAT_MS);
	if (typeof integrationTimer.unref === "function") integrationTimer.unref();

	let seq = 0;
	const sendLogs = async (bytes) => {
		for (const chunk of String(bytes).split("\n")) {
			if (!chunk) continue;
			await client.logs({ taskId, projectId, executionId, epoch, seq: seq++, bytes: chunk.slice(0, 4000) });
		}
	};
	const finishProgress = () =>
		client.progress({ taskId, projectId, executionId, epoch, stageId, event: "finished" }).catch(() => {});
	const failTask = (failureReason, extra = {}) =>
		client.complete({
			taskId, projectId, executionId, epoch,
			branch: taskBranch, outcome: "failed", failureReason,
			posture, durationMs: Date.now() - runStartedAt, ...extra,
		});

	try {
		await client.progress({ taskId, projectId, executionId, epoch, stageId, event: "started" });
		const { workdir, mirrorDir } = await prepareIntegrationWorkdir({
			repoUrl: project.gitUrl || project.repoUrl || null,
			workRoot: config.workRoot,
			taskBranch,
			expectedTaskSha,
			targetBranch,
			expectedTargetSha,
		});
		logger.log(`Integration workdir ${workdir} (ephemeral, detached at ${String(expectedTargetSha).slice(0, 7)}).`);
		try {
			try {
				await sendLogs(`[integrate] merging origin/${taskBranch} into ${targetBranch}`);
				await runGit(workdir, [
					"-c", "user.name=KainBain Integration",
					"-c", "user.email=kainbain-runner@local",
					"merge", "--no-edit", `origin/${taskBranch}`,
				]);
			} catch (mergeErr) {
				let conflicted = [];
				try {
					const { stdout } = await runGit(workdir, ["diff", "--name-only", "--diff-filter=U"]);
					conflicted = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
				} catch {
					// Best effort: the file list below degrades to unknown.
				}
				try {
					await runGit(workdir, ["merge", "--abort"]);
				} catch {
					// Best effort: the tree may already be clean.
				}
				const looksLikeConflict =
					conflicted.length > 0 ||
					/CONFLICT|Automatic merge failed|unmerged/i.test(`${mergeErr?.message || ""}\n${mergeErr?.stderr || ""}`);
				if (!looksLikeConflict) throw mergeErr;
				const detail = `Merge conflicts in: ${conflicted.join(", ") || "unknown files"} — resolve on '${taskBranch}' and retry the merge stage`;
				await sendLogs(`[integrate] conflict: ${detail}`);
				await client.integrationReport({
					projectId, targetBranch, executionId: integrationExecutionId, epoch: integrationEpoch,
					outcome: "conflict", detail,
				}).catch(() => {});
				state.session = null; stopRenewal(); clearInterval(integrationTimer);
				await finishProgress();
				return await failTask(detail, { taskFiles: collectTaskFiles({ workdir, taskId }) });
			}
			const mergeSha = (await runGit(workdir, ["rev-parse", "HEAD"])).stdout.trim();
			try {
				await runGit(workdir, [
					"push", `--force-with-lease=${targetBranch}:${expectedTargetSha}`,
					"origin", `${mergeSha}:${targetBranch}`,
				]);
			} catch {
				const detail = `Target '${targetBranch}' moved during integration (CAS push pinned at ${String(expectedTargetSha).slice(0, 7)} rejected) — retry re-bases with fresh SHAs`;
				await sendLogs(`[integrate] stale-head: ${detail}`);
				await client.integrationReport({
					projectId, targetBranch, executionId: integrationExecutionId, epoch: integrationEpoch,
					outcome: "stale-head", detail,
				}).catch(() => {});
				state.session = null; stopRenewal(); clearInterval(integrationTimer);
				await finishProgress();
				return await failTask(detail);
			}
			await runGit(mirrorDir, ["fetch", "origin"]);
			const tip = (await runGit(mirrorDir, ["rev-parse", "--verify", `origin/${targetBranch}`])).stdout.trim();
			let ancestry = false;
			try {
				await runGit(mirrorDir, ["merge-base", "--is-ancestor", mergeSha, tip]);
				ancestry = true;
			} catch {
				ancestry = false;
			}
			await client.integrationReport({
				projectId, targetBranch, executionId: integrationExecutionId, epoch: integrationEpoch,
				outcome: "landed", mergeSha, detail: `merged '${taskBranch}' into '${targetBranch}'`,
			});
			state.session = null; stopRenewal(); clearInterval(integrationTimer);
			await finishProgress();
			if (ancestry) {
				await client.verifySha({ taskId, projectId, executionId, epoch, sha: mergeSha, present: true }).catch(() => {});
			}
			return await client.complete({
				taskId, projectId, executionId, epoch,
				sha: mergeSha, branch: taskBranch, outcome: "passed",
				posture, durationMs: Date.now() - runStartedAt,
				output: `[integrate] merged '${taskBranch}' into '${targetBranch}' (${mergeSha.slice(0, 7)})`,
				integration: {
					outcome: "landed", mergeSha, taskBranch, expectedTaskSha,
					targetBranch, expectedTargetSha, mergeAttemptId,
				},
			});
		} finally {
			await removeIntegrationWorkdir(mirrorDir, workdir);
		}
	} catch (err) {
		stopRenewal();
		clearInterval(integrationTimer);
		if (err?.code === "STALE_EPOCH") throw err;
		if (err instanceof RunnerGitError && err.code === "stale-head") {
			await client.integrationReport({
				projectId, targetBranch, executionId: integrationExecutionId, epoch: integrationEpoch,
				outcome: "stale-head", detail: err.message,
			}).catch(() => {});
			await finishProgress();
			return await failTask(`stale-head: ${err.message}`);
		}
		try {
			await client.interrupt({ taskId, projectId, executionId });
		} catch {
			// Interrupting is best-effort: the lease TTL still bounds the damage.
		}
		throw err;
	}
}

/***
 * MARK: runSingleAssignment
 * @description One explicit task assignment over the wire (ADR 0009 steps
 *   1–6, loopback): register (or poll a pending join until the human
 *   approves, then exit asking for the pasted credential), heartbeat,
 *   claim, load (clone/pull or adopt + per-task worktree), run the stage
 *   through the harness, stream sequenced logs, commit/push (push skipped
 *   `no-remote`), and complete with the SHA. Any failure after the claim
 *   interrupts the task so it re-queues as interrupted, never
 *   failed/complete. Orphaned workdirs are surfaced at boot (never deleted
 *   there); past the worktree cap the least-recently-used stale workdir is
 *   evicted on demand, and terminal tasks have their workdir reaped after
 *   the execution reports. Unpushed residue is always parked on
 *   kb-recovery/* first, never deleted.
 * @example await runSingleAssignment({ config, client, loadHarness }) => { executionId, epoch, sha }
 * @param {Object} opts - Options.
 * @param {Object} opts.config - Normalized runner config.
 * @param {Object} opts.client - Runner backend client.
 * @param {Function} [opts.loadHarness] - Harness loader (tests inject fakes).
 * @param {Object} [opts.logger] - Logger (defaults to console).
 * @returns {Promise<Object>} Execution summary.
 ***/
export async function runSingleAssignment({
	config,
	client,
	loadHarness = defaultLoadHarness,
	logger = console,
}) {
	if (config.errors?.length) {
		throw new Error(`Invalid Runner config: ${config.errors.join(" ")}`);
	}
	const orphans = listOrphanWorkdirs(config.workRoot, config.taskId);
	if (orphans.length) {
		logger.warn(`Orphaned workdirs (left alone, may hold unpushed work): ${orphans.join(", ")}`);
	}

	const state = { session: null, executionId: null, epoch: null };
	const { harness, stop } = await joinAndHeartbeat({ config, client, loadHarness, logger, state });
	try {
		const result = await executeAssignment({
			config,
			client,
			logger,
			harness,
			harnessId: config.harnessId,
			state,
			projectId: config.projectId,
			taskId: config.taskId,
		});
		// Terminal tasks never run again: reclaim their workdir slot now
		// instead of growing into the cap (best-effort, never throws).
		await reapTaskWorkdirIfTerminal({
			client,
			projectId: config.projectId,
			taskId: config.taskId,
			workRoot: config.workRoot,
		});
		return result;
	} finally {
		stop();
	}
}

/***
 * MARK: runDispatchLoop
 * @description Capability-aware dispatch loop (WP-3.1): joins and heartbeats
 *   exactly like a single assignment, then polls `POST /runners/dispatch`
 *   for backend-routed work until `dispatchIdleLimit` consecutive polls come
 *   back empty (`dispatchIdleLimit: 0` never idles out — the persistent
 *   service mode). Every poll is server-side scan → match → claim-fence, so
 *   concurrent loops never double-dispatch: a lost race surfaces as
 *   `CLAIM_CONFLICT` inside the fence and the loop simply polls again. A
 *   `STALE_RUNNER` answer triggers one fresh heartbeat and a single retry;
 *   `RUNNER_PAUSED` (operator-parked) backs off and re-polls until resumed;
 *   anything else throws loud.
 * @example await runDispatchLoop({ config, client }) => { assignments: 2, polls: 5 }
 * @param {Object} opts - Options.
 * @param {Object} opts.config - Normalized runner config (dispatch mode).
 * @param {Object} opts.client - Runner backend client.
 * @param {Function} [opts.loadHarness] - Harness loader (tests inject fakes).
 * @param {Object} [opts.logger] - Logger (defaults to console).
 * @returns {Promise<Object>} Loop summary (`assignments`, `polls`).
 ***/
export async function runDispatchLoop({
	config,
	client,
	loadHarness = defaultLoadHarness,
	logger = console,
}) {
	if (config.errors?.length) {
		throw new Error(`Invalid Runner config: ${config.errors.join(" ")}`);
	}
	const orphans = listOrphanWorkdirs(config.workRoot, null);
	if (orphans.length) {
		logger.warn(`Orphaned workdirs (left alone, may hold unpushed work): ${orphans.join(", ")}`);
	}

	const state = { session: null, executionId: null, epoch: null };
	const { harness, harnesses, stop } = await joinAndHeartbeat({ config, client, loadHarness, logger, state });
	const idleLimit = config.dispatchIdleLimit ?? 3;
	const pollMs = config.dispatchPollMs ?? 5000;
	let assignments = 0;
	let polls = 0;
	try {
		for (let idle = 0; ;) {
			let answer;
			try {
				answer = await client.dispatchClaim({ projectIds: config.projectIds ?? null });
			} catch (err) {
				if (err?.code === "STALE_RUNNER") {
					await client.heartbeat({ runnerId: config.runnerId, facts: factsFor({ config }) });
					answer = await client.dispatchClaim({ projectIds: config.projectIds ?? null });
				} else if (err?.statusCode === 429) {
					// D8 backpressure (ADR 0010): the fleet is at its
					// concurrency cap. Back off and re-poll WITHOUT
					// consuming idle budget — work exists, we just
					// may not take it yet.
					polls += 1;
					logger.log(`Dispatch: fleet busy (${err?.code ?? "capped"}); backing off.`);
					await new Promise((r) => setTimeout(r, pollMs));
					continue;
				} else if (err?.code === "RUNNER_PAUSED") {
					// Operator-parked: this Runner takes no new tasks until
					// resumed. Back off and re-poll WITHOUT consuming idle
					// budget — resuming picks the loop straight back up
					// with no restart.
					polls += 1;
					logger.log(`Dispatch: Runner paused by operator; backing off.`);
					await new Promise((r) => setTimeout(r, pollMs));
					continue;
				} else {
					throw err;
				}
			}
			polls += 1;
			if (!answer.assigned) {
				// A busy integration slot is work waiting, not idleness:
				// back off WITHOUT consuming idle budget, like fleet
				// backpressure (D8) and operator pause.
				if (answer.code === "INTEGRATION_BUSY") {
					logger.log(`Dispatch: integration slot busy; backing off.`);
					await new Promise((r) => setTimeout(r, pollMs));
					continue;
				}
				idle += 1;
				// idleLimit 0 means a persistent service loop: never idle out.
				if (idleLimit > 0 && idle >= idleLimit) return { assignments, polls, idle: true };
				logger.log(
					`Dispatch: no work (${answer.code ?? "empty"}); idle ${idle}${idleLimit > 0 ? `/${idleLimit}` : "/∞ (persistent)"}.`,
				);
				await new Promise((r) => setTimeout(r, pollMs));
				continue;
			}
			idle = 0;
			assignments += 1;
			// Multi-harness service: the dispatch answer names the
			// required harness (alias-resolved server-side) — serve with
			// that one, not the primary. An unloaded name falls back to
			// the primary with a warning: the lease is already fenced to
			// us, so stranding it would wedge the task, and the posture
			// line records what actually served.
			const wanted = answer.requirements?.harness || null;
			const servingId =
				wanted && harnesses[wanted] ? wanted : config.harnessId;
			if (wanted && !harnesses[wanted]) {
				logger.warn(
					`Requirements want harness '${wanted}' (not loaded); serving with primary '${servingId}'.`,
				);
			}
			await executeAssignment({
				config,
				client,
				logger,
				harness: harnesses[servingId] ?? harness,
				harnessId: servingId,
				state,
				projectId: answer.projectId,
				taskId: answer.taskId,
				lease: { executionId: answer.executionId, epoch: answer.epoch },
				backendPrompt: answer.prompt || "",
				kind: answer.kind || "",
				ciCommand: answer.command || "",
				runOnBranch: answer.runOnBranch || "",
				customBranch: answer.customBranch || "",
				ciTimeoutMs: Number(answer.timeoutMs) || 0,
				ciEnv: answer.env,
				// The backend already matched this task against our
				// advertised models: serve exactly its required model.
				model: answer.requirements?.model || null,
				// Leased integrations carry their target/task SHAs here;
				// executeAssignment routes `integrate` to the merge
				// procedure instead of a harness.
				integration: answer.integration ?? null,
			});
			// Terminal tasks never run again: reclaim their workdir slot
			// now instead of growing into the cap (best-effort, never
			// throws).
			await reapTaskWorkdirIfTerminal({
				client,
				projectId: answer.projectId,
				taskId: answer.taskId,
				workRoot: config.workRoot,
			});
		}
	} finally {
		stop();
	}
}
