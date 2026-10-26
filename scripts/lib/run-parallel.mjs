/***
 * MARK: run-parallel.mjs
 * @description The overlap helper behind the cross-platform test gate: runs
 *   independent check commands together in one window and condenses output.
 *   Every branch always runs to completion (no early kill hides a failure);
 *   each result is reported on its own `Running <name>... PASS/FAIL (<s>s)`
 *   line in argument order with the failure output shown in full; the run
 *   fails when any branch fails. Ported from run_parallel() in run-tests.sh
 *   with identical line format and exit semantics, minus bash/nice/eval.
 *   While branches run the gate is not silent: each branch announces
 *   `▸ started <name>` and an outstanding-branches tick (`⏳ still running:
 *   …`) emits every `progressIntervalMs` — so a minutes-long branch (canary,
 *   containers) never produces a multi-minute output blackout for the
 *   operator, the logs tab, or the engine's stdout-driven heartbeat.
 * @example const { ok } = await runParallel([{ name: "Lint", file: "npm", args: ["run", "lint"] }])
 ***/

import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const RED = "\u001b[0;31m";
const GREEN = "\u001b[0;32m";
const NC = "\u001b[0m";

/***
 * MARK: DEFAULT_PROGRESS_INTERVAL_MS
 * @description Default cadence of the `⏳ still running` progress tick
 *   (30s), overridable via `KAINBAIN_GATE_PROGRESS_INTERVAL_MS` or the
 *   `progressIntervalMs` runParallel option; 0 disables the tick.
 * @example DEFAULT_PROGRESS_INTERVAL_MS => 30000
 ***/
export const DEFAULT_PROGRESS_INTERVAL_MS = 30000;

/***
 * MARK: resolveProgressIntervalMs
 * @description Resolves the progress-tick cadence: the `runParallel`
 *   option wins, otherwise the `KAINBAIN_GATE_PROGRESS_INTERVAL_MS` env
 *   override, otherwise the 30s default. Anything missing or negative
 *   disables the tick (0).
 * @example resolveProgressIntervalMs({ env: { KAINBAIN_GATE_PROGRESS_INTERVAL_MS: "5000" } }) => 5000
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs] - Explicit option (takes precedence).
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @returns {number} Interval in ms (0 = tick disabled).
 ***/
export function resolveProgressIntervalMs({
	intervalMs,
	env = process.env,
} = {}) {
	const option = Number(intervalMs);
	if (Number.isFinite(option)) return option > 0 ? option : 0;
	const raw = Number(env.KAINBAIN_GATE_PROGRESS_INTERVAL_MS);
	if (Number.isFinite(raw)) return raw > 0 ? raw : 0;
	return DEFAULT_PROGRESS_INTERVAL_MS;
}

/***
 * MARK: formatElapsedSeconds
 * @description Renders seconds as a compact human duration for the progress
 *   tick: `<n>s` under a minute, `<n>m<ss>s` above (e.g. 62 => "1m02s").
 * @example formatElapsedSeconds(62) => "1m02s"
 * @example formatElapsedSeconds(59) => "59s"
 * @param {number} totalSeconds
 * @returns {string}
 ***/
export function formatElapsedSeconds(totalSeconds) {
	const seconds = Math.max(0, Math.round(totalSeconds));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	return `${minutes}m${String(rest).padStart(2, "0")}s`;
}

/***
 * MARK: npmExecutable
 * @description The npm binary name for direct spawn: `npm.cmd` on Windows
 *   (where `npm` alone is not executable without a shell), `npm` elsewhere.
 * @example npmExecutable("win32") => "npm.cmd"
 * @param {string} [targetPlatform] - defaults to process.platform.
 * @returns {string}
 ***/
export function npmExecutable(targetPlatform = process.platform) {
	return targetPlatform === "win32" ? "npm.cmd" : "npm";
}

/***
 * MARK: KILL_SETTLE_GRACE_MS
 * @description How long `runOneBranch` waits for a timed-out branch's stdio
 *   pipes to close after the kill before reporting the branch anyway (ms).
 *   A branch is a process TREE (`npm` → `sh` → `vite`/`playwright`), and every
 *   descendant inherits the pipes; if any of them outlives the direct child,
 *   Node's `close` event never fires and a gate that only listened for `close`
 *   would hang forever instead of failing the branch.
 * @example KILL_SETTLE_GRACE_MS => 2000
 ***/
const KILL_SETTLE_GRACE_MS = 2000;

/***
 * MARK: TERM_GRACE_MS
 * @description Grace between SIGTERM and SIGKILL when reaping a timed-out
 *   branch's process group (ms). SIGTERM first gives tools with their own
 *   cleanup (Playwright closing its scratch web servers, vitest releasing
 *   ports) a chance to exit cleanly; the SIGKILL is the unconditional backstop.
 * @example TERM_GRACE_MS => 5000
 ***/
const TERM_GRACE_MS = 5000;

/***
 * MARK: killProcessTree
 * @description Kills a spawned branch and every process it created. Branches
 *   are spawned `detached` on POSIX, which makes the direct child a process
 *   group leader, so `process.kill(-pid, signal)` reaches `npm` → `sh` →
 *   `vite`/`playwright` rather than only `npm`. Windows has no process groups
 *   here, so it shells out to `taskkill /T /F`. Best-effort by construction:
 *   an already-dead tree must never throw into a branch's result path.
 * @example killProcessTree(child, "SIGKILL")
 * @param {Object} child - The spawned ChildProcess (or undefined).
 * @param {string} [signal] - POSIX signal name, default SIGKILL.
 * @param {Object} [opts] - Test seams: spawnSyncFn, platform.
 * @returns {boolean} True when a kill was attempted through a known channel.
 ***/
export function killProcessTree(child, signal = "SIGKILL", { spawnSyncFn = spawnSync, platform = process.platform } = {}) {
	if (!child || !child.pid) return false;
	if (platform === "win32") {
		try {
			spawnSyncFn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				windowsHide: true,
				stdio: "ignore",
			});
			return true;
		} catch {
			// taskkill missing or the tree is already gone — fall through.
		}
	}
	try {
		// Negative pid = the child's whole process group (it is the leader).
		process.kill(-child.pid, signal);
		return true;
	} catch {
		// Not a group leader (or the group is gone): target the direct child.
	}
	try {
		child.kill(signal);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: runOneBranch
 * @description Spawns one branch command (no shell), capturing its combined
 *   output, and resolves when it exits. A spawn failure (missing binary)
 *   resolves as a failed branch carrying the error text — never a throw.
 *   An optional `branch.timeoutMs` reaps a hung branch and resolves it as a
 *   failure (`timedOut: true`, exit code 124) so a wedged suite can never stall
 *   a caller such as `scripts/repeat-tests.mjs`. The reap is tree-wide
 *   (SIGTERM to the branch's process group, SIGKILL after a grace) and does not
 *   depend on the `close` event, because orphaned descendants holding the
 *   branch's stdio pipes can suppress `close` forever — a timed-out branch must
 *   fail the gate, not hang it.
 * @example await runOneBranch({ name: "T", file: "true" }, { cwd: "/repo" })
 * @param {Object} branch - { name, file, args?, env?, lowPriority?, timeoutMs? }.
 * @param {Object} opts - { cwd?, spawnFn?, onSpawn? }. `onSpawn(child)` is called
 *   once the branch is spawned, so a caller can track live branches.
 * @returns {Promise<Object>} { name, ok, exitCode, output, timedOut, finishedAt }.
 ***/
function runOneBranch(branch, { cwd, spawnFn = spawn, onSpawn, termGraceMs = TERM_GRACE_MS, settleGraceMs = KILL_SETTLE_GRACE_MS } = {}) {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		let child;
		try {
			child = spawnFn(branch.file, branch.args || [], {
				cwd,
				env: { ...process.env, ...(branch.env || {}) },
				windowsHide: true,
				// POSIX: own process group, so the hang guard can reap the whole
				// branch tree (npm → sh → playwright/vite), not just npm.
				detached: process.platform !== "win32",
			});
		} catch (error) {
			resolve({
				name: branch.name,
				ok: false,
				exitCode: 127,
				output: `Failed to start '${branch.file}': ${error.message}\n`,
				finishedAt: startedAt,
			});
			return;
		}
		if (typeof onSpawn === "function") onSpawn(child);

		let output = "";
		let timedOut = false;
		let settled = false;
		let killTimer = null;
		let settleTimer = null;

		const clearTimers = () => {
			if (killTimer) clearTimeout(killTimer);
			killTimer = null;
			if (settleTimer) clearTimeout(settleTimer);
			settleTimer = null;
			// The SIGKILL escalation timer deliberately survives `settle`: once a
			// branch has timed out it must reach every descendant the SIGTERM
			// missed — including descendants that closed their own stdio (so the
			// branch's pipes closed and `close` fired) but kept running. It is left
			// referenced so the process cannot exit before the escalation runs.
		};

		// Single settlement point: the first of `close`, `error`, or the
		// post-kill grace wins, and a late event can never double-resolve.
		const settle = (result) => {
			if (settled) return;
			settled = true;
			clearTimers();
			resolve({ name: branch.name, finishedAt: Date.now(), ...result });
		};

		// Opt-in hang guard (canary, repeat-tests). SIGTERM the tree first so
		// tools can run their own cleanup, then SIGKILL after the grace; report
		// the branch after a short settle window whether or not `close` arrives.
		if (branch.timeoutMs) {
			killTimer = setTimeout(() => {
				timedOut = true;
				killProcessTree(child, "SIGTERM");
				// The SIGKILL escalation timer is NOT unref'd: a timed-out branch's
				// escalation must finish before the process can exit, so a failed gate
				// never leaves the tree (and its scratch servers) running behind it.
				setTimeout(() => killProcessTree(child, "SIGKILL"), termGraceMs);
				settleTimer = setTimeout(() => {
					settle({
						ok: false,
						exitCode: 124,
						output: `${output}Timed out after ${branch.timeoutMs}ms (SIGTERM→SIGKILL; branch process tree reaped)\n`,
						timedOut: true,
					});
				}, termGraceMs + settleGraceMs);
				if (typeof settleTimer.unref === "function") settleTimer.unref();
			}, branch.timeoutMs);
			if (typeof killTimer.unref === "function") killTimer.unref();
		}

		// Best-effort lowered-priority equivalent for the low-priority branches
		// (lint, scans, depcheck): politeness only — a failure here must never
		// fail the branch. Note it covers just the direct child, where the old
		// shell gate's priority was inherited by grandchildren; no portable
		// equivalent exists.
		if (branch.lowPriority && child.pid) {
			try {
				os.setPriority(child.pid, 10);
			} catch {
				// Best-effort only (e.g. restricted environments).
			}
		}

		const append = (chunk) => {
			output += chunk.toString();
		};
		child.stdout?.on("data", append);
		child.stderr?.on("data", append);
		child.on("error", (error) => {
			settle({
				ok: false,
				exitCode: 127,
				output: output + `Failed to start '${branch.file}': ${error.message}\n`,
			});
		});
		child.on("close", (exitCode) => {
			settle({
				ok: !timedOut && exitCode === 0,
				exitCode: timedOut ? 124 : (exitCode ?? 1),
				output: timedOut
					? `${output}Timed out after ${branch.timeoutMs}ms (branch process tree reaped)\n`
					: output,
				timedOut,
			});
		});
	});
}

/***
 * MARK: runParallel
 * @description Runs every branch command together, reports one PASS/FAIL line
 *   per branch in argument order (elapsed seconds measured from the batch
 *   start, like run_parallel's cumulative wall), shows full output only for
 *   failures, and resolves ok:false when any branch failed. While branches
 *   are outstanding it emits a `⏳ still running: <name> (<elapsed>), …`
 *   progress line every `progressIntervalMs` (default 30s; 0 disables) so a
 *   slow branch never blanks the output for minutes; each branch also
 *   announces `▸ started <name>` at spawn. The `Running <name>... PASS/FAIL
 *   (<s>s)` completion lines are the unchanged contract. A branch that exceeds
 *   its `timeoutMs` is reaped tree-wide, so a timed-out branch can never wedge
 *   the gate; an interrupted gate reaps every live branch before exiting.
 * @example const { ok } = await runParallel([{ name: "A", file: "true" }])
 * @param {Array<Object>} branches - { name, file, args?, env?, lowPriority?, timeoutMs? } each.
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - working directory for every branch.
 * @param {Function} [opts.write] - line sink, defaults to stdout.
 * @param {Function} [opts.spawnFn] - spawn seam, for tests.
 * @param {number} [opts.progressIntervalMs] - progress-tick cadence (defaults to resolveProgressIntervalMs).
 * @param {number} [opts.termGraceMs] - SIGTERM→(SIGKILL, branch report) grace for a timed-out branch.
 * @param {number} [opts.settleGraceMs] - extra wait after that before reporting a branch whose stdio never closed.
 * @returns {Promise<Object>} { ok, results: [{ name, ok, exitCode, output, timedOut?, wallSecs }] }.
 ***/
export async function runParallel(
	branches,
	{
		cwd = process.cwd(),
		write = (text) => process.stdout.write(text),
		spawnFn = spawn,
		progressIntervalMs = resolveProgressIntervalMs(),
		termGraceMs = TERM_GRACE_MS,
		settleGraceMs = KILL_SETTLE_GRACE_MS,
	} = {},
) {
	const batchStart = Date.now();
	// Branches are spawned detached (own process group) so the hang guard can
	// reap a whole tree. That also means they no longer receive the operator's
	// terminal SIGINT, so an aborted gate must reap them explicitly — otherwise
	// a Ctrl-C'd `npm test` leaves a minutes-long Playwright suite and its
	// scratch servers running, poisoning the next run.
	const liveChildren = new Set();
	const reapLiveBranches = () => {
		for (const child of liveChildren) killProcessTree(child, "SIGKILL");
	};
	const onSignal = (signal) => {
		reapLiveBranches();
		process.exit(signal === "SIGINT" ? 130 : 143);
	};
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);
	// Start every branch before awaiting any: the overlap window. Each branch
	// announces itself at spawn so the operator sees the window open.
	const settled = new Array(branches.length).fill(false);
	const pending = branches.map((branch, index) =>
		runOneBranch(branch, {
			cwd,
			spawnFn,
			termGraceMs,
			settleGraceMs,
			onSpawn: (child) => {
				if (child) {
					liveChildren.add(child);
					child.once("close", () => liveChildren.delete(child));
				}
				write(`▸ started ${branch.name}\n`);
			},
		}).then((result) => {
			settled[index] = true;
			return result;
		}),
	);

	// Outstanding-branches tick: while anything is still running, a low-rate
	// progress line keeps the output (and every stdout-driven heartbeat) alive
	// and tells the operator which branches are the slow ones.
	let progressTimer = null;
	if (progressIntervalMs > 0) {
		progressTimer = setInterval(() => {
			const outstanding = branches.filter((_, index) => !settled[index]);
			if (outstanding.length === 0) return;
			const elapsed = formatElapsedSeconds((Date.now() - batchStart) / 1000);
			const names = outstanding
				.map((branch) => `${branch.name} (${elapsed})`)
				.join(", ");
			write(`⏳ still running: ${names}\n`);
		}, progressIntervalMs);
		if (typeof progressTimer.unref === "function") progressTimer.unref();
	}

	const results = [];
	let overallOk = true;
	let lastWallSecs = 0;
	try {
		for (const [index, next] of pending.entries()) {
			const finished = await next;
			// Cumulative wall like run_parallel: each line shows the batch age
			// when its branch result is reported, in argument order.
			const wallSecs = Math.max(Math.round((finished.finishedAt - batchStart) / 1000), lastWallSecs);
			lastWallSecs = wallSecs;
			const entry = { ...finished, wallSecs };
			delete entry.finishedAt;
			results[index] = entry;
			if (entry.ok) {
				write(`Running ${entry.name}... ${GREEN}PASS${NC} (${wallSecs}s)\n`);
			} else {
				overallOk = false;
				write(`Running ${entry.name}... ${RED}FAIL${NC} (${wallSecs}s)\n`);
				write("----------------------------------------------------------------------\n");
				write(`Details for ${entry.name}:\n`);
				write(entry.output.endsWith("\n") || entry.output === "" ? entry.output : `${entry.output}\n`);
				write("----------------------------------------------------------------------\n");
			}
		}
	} finally {
		// A short gate must not leak a timer (and a failing one must not hang
		// the process on the tick): always clear. The signal handlers are
		// removed too so a caller (the harness self-tests) is never left with a
		// live SIGINT handler that would reap another run's branches.
		process.off("SIGINT", onSignal);
		process.off("SIGTERM", onSignal);
		if (progressTimer) {
			clearInterval(progressTimer);
			progressTimer = null;
		}
	}
	return { ok: overallOk, results };
}
