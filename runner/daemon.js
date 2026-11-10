import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { listOrphanWorkdirs, prepareIntegrationWorkdir, prepareWorkdir, reapTaskWorkdirIfTerminal, reapTerminalOrphanWorkdirs, removeIntegrationWorkdir, runGit, slugForRepo, syncTaskDocs, resolveRunnerDocsDirName, touchWorkdir } from "./project.js";
import { RunnerGitError } from "./project.js";
import { runHarnessStage } from "./harness.js";
import { runImpromptuJob } from "./impromptu.js";
import { createStructuredEventSender } from "./logEvents.js";
import { applyUpdate as defaultApplyUpdate, checkForUpdate as defaultCheckForUpdate } from "./updates/index.js";
import { defaultInstallRoot, markUpdateSuccess, readUpdateState } from "./updates/state.js";
// The Runner bundle ships shared/ next to this folder (runner/{runner,api,shared}
// in prod and in the distributable tarball), so ../shared resolves both in the
// repo and in every deployed layout — the same copy the backend executes.
import { resolveAdvertisedModels } from "./modelDiscovery.js";
import { clearDiscoveryCache, getDiscoveryStatus, runDiscoveryRound, summarizeDiscoverySlices, DISCOVER_LEG_TIMEOUT_DEFAULT_MS } from "./harnessModelDiscovery.js";
import { servingModelFor } from "../shared/servingModelFor.js";
import { formatPosture } from "../shared/formatPosture.js";
import { decideAgentStageVerdict } from "../shared/stageVerdict.js";
// The Runner bundle ships api/ next to runner/, so the backend's own
// discovery helpers (standard install dirs, the pi snapshot path, the
// KAINBAIN_*_BIN overrides) are the single source of truth for where harness
// binaries live — the Runner must auto-detect exactly what the backend
// detects on the same host (SDK-style pi installs under ~/.pi/agent are
// frequently NOT on PATH, which is why PATH-only probing missed them).
import { DISCOVERY_ENV_VARS, standardSearchDirs, piSnapshotPath } from "../api/agent/harnessDiscovery.js";
import { commitAndPush } from "./gitOps.js";
import { saveRunnerCredential } from "./credentialFile.js";

/***
 * MARK: RUNNER_VERSION
 * @description Runner product version (the update channel + fleet matrix
 *   compare this, not the API version). Loaded from runner/version.json
 *   `runnerVersion` beside daemon.js; falls back to the pinned fallback
 *   when the file is unreadable. The release packager stamps version.json
 *   per release, so a self-updated Runner re-registers as the new version.
 * @example RUNNER_VERSION => '0.1.0'
 ***/
export const RUNNER_VERSION = (() => {
	try {
		const file = new URL("./version.json", import.meta.url);
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return typeof parsed?.runnerVersion === "string" && parsed.runnerVersion ? parsed.runnerVersion : "0.1.0";
	} catch {
		return "0.1.0";
	}
})();

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
	const ctx = harnessProbeContext({});
	const dirs = harnessProbeDirsFor(harnessId, ctx);
	for (const bin of HARNESS_VERSION_BINS[harnessId] ?? []) {
		try {
			// Resolve through PATH + standard dirs + the harness's own install
			// dir, so a binary that lives only off PATH (e.g. ~/.local/bin/pi)
			// still reports its real version; fall back to the bare name.
			let binPath = bin;
			for (const dir of dirs) {
				try {
					if (ctx.checkExec(bin, dir)) {
						binPath = path.join(dir, bin);
						break;
					}
				} catch {
					// Keep scanning.
				}
			}
			const res = await execFileAsync(binPath, ["--version"], { timeout: timeoutMs });
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
 * MARK: AUTO_DETECTABLE_HARNESSES
 * @description Harness ids auto-detect considers, in stable advertise
 *   order. Only ids defaultLoadHarness can actually run; `mock` has no
 *   CLI so it never auto-detects (pass it manually with --manual).
 * @example AUTO_DETECTABLE_HARNESSES => ['pi', 'muse', 'antigravity', 'vibe']
 ***/
export const AUTO_DETECTABLE_HARNESSES = ["pi", "muse", "antigravity", "vibe"];

/***
 * MARK: harnessProbeContext
 * @description Normalizes the inputs for harness auto-detect: the env
 *   mapping (tests inject a fake one), the platform, and the two fs seams.
 *   When a caller injects `isExecutable` the call is synthetic: every binary
 *   check (PATH, standard dirs, pi agent bin, env overrides) runs through
 *   it, and the pi snapshot probe defaults to "absent" unless `fileExists`
 *   is injected too — hermetic tests must never observe the real host's
 *   `~/.pi`.
 * @example harnessProbeContext({ pathValue: '/x', isExecutable: () => true })
 * @param {Object} [opts] - Probe options (see detectAvailableHarnesses).
 * @returns {Object} `{ env, platform, home, pathDirs, checkExec, checkFile }`.
 ***/
function harnessProbeContext({ pathValue, pathDelimiter, isExecutable, fileExists, env, homeDir, platform } = {}) {
	const envMap = env ?? (homeDir ? { ...process.env, HOME: homeDir } : process.env);
	const platformValue = platform ?? process.platform;
	const synthetic = typeof isExecutable === "function";
	const checkExec =
		typeof isExecutable === "function"
			? isExecutable
			: (bin, dir) => {
					try {
						fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
						return true;
					} catch {
						return false;
					}
				};
	const checkFile =
		typeof fileExists === "function"
			? fileExists
			: synthetic
				? () => false
				: (file) => {
						try {
							return fs.statSync(file).isFile();
						} catch {
							return false;
						}
					};
	const home =
		typeof homeDir === "string" && homeDir
			? homeDir
			: String(envMap.HOME ?? (platformValue === "win32" ? envMap.USERPROFILE : "") ?? "");
	const delimiter = typeof pathDelimiter === "string" ? pathDelimiter : path.delimiter;
	const pathStr = typeof pathValue === "string" ? pathValue : (envMap.PATH ?? "");
	const pathDirs = String(pathStr)
		.split(delimiter)
		.map((d) => d.trim())
		.filter(Boolean);
	return { env: envMap, platform: platformValue, home, pathDirs, checkExec, checkFile };
}

/***
 * MARK: harnessProbeDirsFor
 * @description Ordered binary-search dirs for one harness: PATH first, then
 *   the standard install dirs (`~/.local/bin`, `~/bin` on POSIX — the same
 *   list the backend's `standardSearchDirs` returns, so a Runner detects
 *   exactly what the backend detects on the same host), then the harness's
 *   own install dir (pi: `~/.pi/agent/bin` and `$PI_AGENT_DIR/bin` —
 *   SDK-style pi installs are frequently not on the service PATH, which is
 *   why PATH-only probing missed pi on hosts like server2).
 * @example harnessProbeDirsFor('pi', harnessProbeContext({})) // includes ~/.pi/agent/bin
 * @param {string} harnessId - Harness id.
 * @param {Object} ctx - From harnessProbeContext.
 * @returns {string[]} Dirs in probe order (PATH entries first).
 ***/
function harnessProbeDirsFor(harnessId, ctx) {
	const dirs = [...ctx.pathDirs];
	if (ctx.home) {
		for (const { dir } of standardSearchDirs({ ...ctx.env, HOME: ctx.home }, ctx.platform)) {
			if (!dirs.includes(dir)) dirs.push(dir);
		}
	}
	if (harnessId === "pi") {
		if (ctx.home) dirs.push(path.join(ctx.home, ".pi", "agent", "bin"));
		const agentDir = ctx.env.PI_AGENT_DIR;
		if (typeof agentDir === "string" && agentDir.trim()) dirs.push(path.join(agentDir.trim(), "bin"));
	}
	return dirs;
}

/***
 * MARK: detectAvailableHarnesses
 * @description Detects the harnesses installed on this host (default
 *   behaviour; --manual opts out). A harness counts as installed when any
 *   of its binaries resolves to an executable file in PATH, in the standard
 *   install dirs, in its own install dir (pi), or via its `KAINBAIN_*_BIN`
 *   override — or, for pi only, when its agent dir holds a `models.json`
 *   snapshot (the same "pi-snapshot" signal the backend's discoverHarnesses
 *   reports, covering SDK-only installs with no CLI on PATH). One entry per
 *   detected harness, in AUTO_DETECTABLE_HARNESSES order. Pure sync scan so
 *   boot can fail fast before join.
 * @example detectAvailableHarnesses({ pathValue: '/usr/bin:/bin' }) => ['pi']
 * @param {Object} [opts] - Options.
 * @param {string} [opts.pathValue] - PATH to scan (defaults to env.PATH).
 * @param {string} [opts.pathDelimiter] - PATH separator (defaults to path.delimiter).
 * @param {Function} [opts.isExecutable] - (bin, dir) => boolean override (tests; synthetic mode).
 * @param {Function} [opts.fileExists] - (file) => boolean override for the pi snapshot probe.
 * @param {Object} [opts.env] - Environment mapping (defaults to process.env).
 * @param {string} [opts.homeDir] - Home override (defaults to env.HOME).
 * @param {string} [opts.platform] - Platform override (defaults to process.platform).
 * @returns {string[]} Detected harness ids in AUTO_DETECTABLE_HARNESSES order.
 ***/
export function detectAvailableHarnesses({ pathValue, pathDelimiter, isExecutable, fileExists, env, homeDir, platform } = {}) {
	const ctx = harnessProbeContext({ pathValue, pathDelimiter, isExecutable, fileExists, env, homeDir, platform });
	const found = [];
	for (const id of AUTO_DETECTABLE_HARNESSES) {
		let ok = false;
		// Env override (KAINBAIN_MUSE_BIN etc.): a value with a path separator
		// names the file directly; a bare name is searched like a PATH binary.
		const override = typeof ctx.env[DISCOVERY_ENV_VARS[id]] === "string" ? ctx.env[DISCOVERY_ENV_VARS[id]].trim() : "";
		const candidates = [];
		if (override) {
			if (override.includes("/") || override.includes(path.sep) || path.isAbsolute(override)) {
				candidates.push({ bin: path.basename(override), dirs: [path.dirname(override)] });
			} else {
				candidates.push({ bin: override, dirs: harnessProbeDirsFor(id, ctx) });
			}
		}
		for (const bin of HARNESS_VERSION_BINS[id] ?? []) {
			candidates.push({ bin, dirs: harnessProbeDirsFor(id, ctx) });
		}
		for (const { bin, dirs } of candidates) {
			for (const dir of dirs) {
				try {
					if (ctx.checkExec(bin, dir)) {
						ok = true;
						break;
					}
				} catch {
					// Keep scanning; one bad dir never fails detection.
				}
			}
			if (ok) break;
		}
		// pi needs no CLI to be real: a configured agent dir (models.json
		// snapshot) proves an installed pi stack.
		if (!ok && id === "pi") {
			const snapshot = piSnapshotPath(ctx.env, ctx.platform);
			if (snapshot && ctx.checkFile(snapshot)) ok = true;
		}
		if (ok) found.push(id);
	}
	return found;
}

/***
 * MARK: resolveHarnessConfig
 * @description Applies the auto-detect default to a loaded runner config.
 *   Manual configs (explicit harness ids, harnessAuto falsy) pass through
 *   untouched. Auto configs probe PATH, union any explicit non-auto pins,
 *   and mutate the config in place (harnessIds/harnessId). Empty detection
 *   throws fail-fast — the runner must never register a useless empty
 *   capability set.
 * @example resolveHarnessConfig({ harnessIds: [], harnessAuto: true }, { detected: ['pi'] }).harnessId => 'pi'
 * @param {Object} config - Normalized runner config (mutated).
 * @param {Object} [opts] - Options.
 * @param {string[]} [opts.detected] - Detected ids override (tests/installers).
 * @param {Object} [opts.detectOpts] - Forwarded to detectAvailableHarnesses.
 * @returns {Object} The same config object, resolved.
 ***/
export function resolveHarnessConfig(config = {}, { detected, detectOpts } = {}) {
	if (!config || !config.harnessAuto) return config;
	const seen = new Set();
	const out = [];
	const push = (id) => {
		const clean = String(id ?? "").trim();
		if (!clean || seen.has(clean)) return;
		seen.add(clean);
		out.push(clean);
	};
	const autoList = Array.isArray(detected) ? detected : detectAvailableHarnesses(detectOpts);
	for (const id of autoList) push(id);
	for (const id of runnerHarnessIds(config)) push(id);
	if (out.length === 0) {
		throw new Error(
			"Runner auto-detect found no harnesses (probed pi, muse, agy/antigravity, vibe on PATH, in ~/.local/bin and ~/bin, and pi via ~/.pi/agent); install one or re-run with --manual --harness NAME.",
		);
	}
	config.harnessIds = out;
	config.harnessId = out[0];
	config.harnessAuto = false;
	// Drop the stale missing-harness error so the boot check below passes.
	if (Array.isArray(config.errors)) {
		config.errors = config.errors.filter((e) => !/KAINBAIN_RUNNER_HARNESS/.test(String(e)));
	}
	return config;
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

/***
 * MARK: discoveredModelsCache
 * @description Last model auto-discovery result, shared by every factsFor
 *   call until the next refresh. Seeded at boot, refreshed on the
 *   modelDiscoveryIntervalMs cadence (default 12h). The operator's explicit
 *   MODELS/MODEL list wins by default (see resolveAdvertisedModels), so this
 *   cache only matters when nothing is pinned — unless
 *   `modelDiscoveryWins` opts in to discovery-wins (survey q4).
 ***/
let discoveredModelsCache = [];

/***
 * MARK: clearDiscoveredModelsCache
 * @description Test seam: resets the discovery cache between cases.
 ***/
export function clearDiscoveredModelsCache() {
	discoveredModelsCache = [];
	clearDiscoveryCache();
}

/***
 * MARK: isModelsPinned
 * @description Whether the operator pinned an explicit model list
 *   (`config.models` non-empty or `config.model` set). Pinned installs
 *   skip discovery scans and advertise the pin (unless
 *   `modelDiscoveryWins` opts in to discovery-wins).
 * @example isModelsPinned({ models: ['a'] }) => true
 * @param {Object} [config] - Normalized runner config.
 * @returns {boolean} True when a pin is set.
 ***/
export function isModelsPinned(config = {}) {
	return (
		(Array.isArray(config?.models) && config.models.length > 0) ||
		(typeof config?.model === "string" && config.model.trim() !== "")
	);
}

/***
 * MARK: refreshDiscoveredModels
 * @description One discovery round across every configured harness with a
 *   discovery leg (pi, muse, antigravity, vibe, opencode, codex): each leg
 *   reuses its backend harness's own `listModels()` (box-local login, no
 *   keys leave the host) and caches the ids per harness. Skipped entirely
 *   when the operator pinned MODELS/MODEL — pins win by default (see
 *   resolveAdvertisedModels), so scanning would only waste CLI spawns;
 *   set `modelDiscoveryWins` (env `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`,
 *   survey q4) to scan anyway and let a non-empty result replace the pin.
 *   Best-effort — failures keep the previous cache (per-harness slice)
 *   and warn, never throw, so discovery can never break heartbeats.
 *   `modelDiscoveryIntervalMs: 0` disables all scanning (boot seed and
 *   re-detect alike).
 * @example await refreshDiscoveredModels({ config }) => ['muse::meta::muse-spark-1.3']
 * @param {Object} [opts]
 * @param {Object} [opts.config] - Normalized runner config.
 * @param {Object} [opts.logger] - Logger.
 * @param {Function} [opts.discoverFn] - Test seam overriding the muse probe
 *   (called with the leg ctx; overridden ids still pass grammar validation).
 * @param {Object} [opts.discoveryCtx] - Test seams forwarded to every leg.
 * @returns {Promise<string[]>} Current cache copy.
 ***/
export async function refreshDiscoveredModels({ config, logger, discoverFn, discoveryCtx } = {}) {
	try {
		if (config?.modelDiscoveryIntervalMs === 0) {
			logger?.log?.("Model discovery disabled (interval 0); advertising the pinned list.");
			return [...discoveredModelsCache];
		}
		if (isModelsPinned(config) && !config?.modelDiscoveryWins) return [...discoveredModelsCache];
		const idsConfigured = runnerHarnessIds(config);
		// The muse probe override rides the leg seam, so even overridden
		// ids pass grammar validation before advertisement.
		const legOptions = { ...(discoveryCtx || {}) };
		if (typeof discoverFn === "function") legOptions.discoverFn = discoverFn;
		const { combinedIds } = await runDiscoveryRound({
			harnessIds: idsConfigured,
			timeoutMs: DISCOVER_LEG_TIMEOUT_DEFAULT_MS,
			legOptions,
		});
		// Keep-old global: an empty round retains the previous cache.
		if (combinedIds.length > 0) {
			discoveredModelsCache = combinedIds;
		}
		const { countsText, firstError } = summarizeDiscoverySlices(idsConfigured);
		const scope = countsText ? ` (${countsText})` : " (no discovery legs configured)";
		logger?.log?.(`Model discovery: ${discoveredModelsCache.length} model(s)${scope}; next refresh per modelDiscoveryIntervalMs.`);
		if (firstError?.code) {
			logger?.warn?.(`Model discovery warning (${firstError.code}): ${firstError.message || "a harness scan failed"}; keeping the previous list for that harness.`);
		}
	} catch (err) {
		logger?.warn?.(`Model discovery failed, keeping previous list: ${err?.message || err}`);
	}
	return [...discoveredModelsCache];
}

/***
 * MARK: SUPPORTED_RUNNER_COMMANDS
 * @description Backend-to-Runner command ids this daemon consumes from the
 *   heartbeat pull channel (ADR 0013), advertised to the backend through
 *   `facts.commands` so Settings can tell "too old" from "failed" (R1).
 * @example SUPPORTED_RUNNER_COMMANDS.includes('requestUpdate') => true
 ***/
export const SUPPORTED_RUNNER_COMMANDS = ["requestModelRediscovery", "requestUpdate"];

/***
 * MARK: effectiveDirectoriesFor
 * @description Effective directory defaults for one Runner config: the
 *   absolute work root (parent of per-task `kb-*` worktrees) and its
 *   `mirrors` child (master repo copies in clone mode). Reported in
 *   heartbeat facts so Settings shows real defaults instead of blanks.
 * @example effectiveDirectoriesFor({ workRoot: '/srv/w' }) => { masterDir: '/srv/w/mirrors', worktreeDir: '/srv/w' }
 * @param {Object} [config={}] - Normalized runner config.
 * @returns {{masterDir: string, worktreeDir: string}} Effective folders ('' when unknown).
 ***/
export function effectiveDirectoriesFor(config = {}) {
	const workRoot = typeof config.workRoot === "string" && config.workRoot ? path.resolve(config.workRoot) : null;
	return {
		masterDir: workRoot ? path.join(workRoot, "mirrors") : "",
		worktreeDir: workRoot || "",
	};
}

function factsFor({ config, harnessVersions, updateStatus = null, commandAck = null } = {}) {
	const versionFor = (id) =>
		harnessVersions?.[id] ?? harnessVersionCache.get(id)?.[id] ?? "unknown";
	return {
		harnesses: runnerHarnessIds(config).map((id) => ({ id, version: versionFor(id) })),
		models: resolveAdvertisedModels(config, discoveredModelsCache),
		tiers: config.tiers,
		diskHeadroomMb: diskHeadroomMbFor(config.workRoot),
		versions: { protocol: "v1", runner: RUNNER_VERSION, api: RUNNER_API_VERSION },
		directories: effectiveDirectoriesFor(config),
		commands: SUPPORTED_RUNNER_COMMANDS,
		workRoot: typeof config.workRoot === "string" ? config.workRoot : null,
		discoveryStatus: getDiscoveryStatus(runnerHarnessIds(config)),
		...(updateStatus ? { updateStatus } : {}),
		...(commandAck ? { commandAck } : {}),
	};
}

/***
 * MARK: joinAndHeartbeat
 * @description Shared join prologue: poll a pending join until the human
 *   approves (collecting the handed-over credential with this boot's
 *   join nonce and storing it, so no paste or restart is needed — the
 *   paste instruction is now only the fallback when the handover cannot
 *   complete), load the harness, heartbeat once, and start the
 *   background heartbeat timer.
 * @example const { harness, stop } = await joinAndHeartbeat({ config, client, loadHarness, logger, state })
 * @param {Object} opts - Options.
 * @param {Object} opts.config - Normalized runner config.
 * @param {Object} opts.client - Runner backend client.
 * @param {Function} opts.loadHarness - Harness loader.
 * @param {Object} opts.logger - Logger.
 * @param {Object} opts.state - Live-execution ref (`{ session, executionId, epoch }`), read by the steer pull cycle.
 * @returns {Promise<Object>} Primary `harness`, full `harnesses` map, plus `stop()` for the timer.
 ***/
export async function joinAndHeartbeat({ config, client, loadHarness, logger, state }) {
	if (!config.credential) {
		if (!config.joinToken) {
			throw new Error("No credential and no KAINBAIN_RUNNER_JOIN_TOKEN: cannot join.");
		}
		const deadline = Date.now() + config.approvalTimeoutMs;
		// Per-boot join secret (one-click approval, D2): repeated on every
		// join poll so the backend hands this boot — and only this boot —
		// the credential after approval. Never logged.
		const joinNonce = randomUUID();
		// Probe before the first register so even a pending join advertises
		// the real harness CLI versions (G5).
		const joinVersions = {};
		for (const id of runnerHarnessIds(config)) {
			Object.assign(joinVersions, await probeHarnessVersions(id));
		}
		let collectedCredential = "";
		for (;;) {
			const reg = await client.register({
				runnerId: config.runnerId,
				joinToken: config.joinToken,
				facts: factsFor({ config, harnessVersions: joinVersions, commandAck: stagedCommandAck(state) }),
				joinNonce,
			});
			if (reg.status === "active") {
				if (typeof reg?.credential === "string" && reg.credential.trim()) {
					collectedCredential = reg.credential.trim();
				}
				break;
			}
			if (Date.now() > deadline) {
				throw new Error(`Join for ${config.runnerId} still ${reg.status} after timeout.`);
			}
			logger.log(`Join ${reg.status}; waiting for human approval in Settings › Harness › Runners…`);
			await new Promise((r) => setTimeout(r, config.approvalPollMs));
		}
		if (!collectedCredential) {
			throw new Error(
				`Join for ${config.runnerId} approved, but this boot cannot collect its credential by itself (the join session was lost across a restart, or the backend predates one-click approval). Paste the one-time credential shown in Settings › Harness › Runners into KAINBAIN_RUNNER_CREDENTIAL and restart.`,
			);
		}
		try {
			saveRunnerCredential(config.runnerId, collectedCredential, config.home || undefined);
			logger.log(`Join approved; credential stored for ${config.runnerId} — no paste needed.`);
		} catch (err) {
			// Degraded but functional: this boot runs on the in-memory
			// credential; the operator pastes before the next restart.
			logger.warn?.(
				`Join approved but the credential could not be stored (${err?.message || err}); continuing with it in memory — set KAINBAIN_RUNNER_CREDENTIAL before the next restart.`,
			);
		}
		config.credential = collectedCredential;
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
	const facts = factsFor({ config, harnessVersions, updateStatus: state?.updateStatus ?? null, commandAck: stagedCommandAck(state) });
	const beat = await client.heartbeat({ runnerId: config.runnerId, facts });
	if (beat.status !== "active") {
		throw new Error(`Runner ${config.runnerId} is ${beat.status}; need an active registration.`);
	}
	// Boot-time commands: anything queued while the Runner was down is
	// delivered on this first heartbeat (peek-until-ack) — act on it now
	// instead of dropping it. The Runner is idle here (no execution yet),
	// so an update applies immediately.
	if (Array.isArray(beat.pendingCommands) && beat.pendingCommands.length) {
		await handlePendingCommands({ config, client, logger, state, pendingCommands: beat.pendingCommands });
	}
	// Self-update close-out (Option A, ADR 0012): a fresh boot that staged
	// an update left state pending-boot; the first successful heartbeat on
	// the NEW version proves the release boots, so mark success (this also
	// re-registers the new RUNNER_VERSION in the backend fleet matrix).
	// Never blocks boot: a missing/corrupt state file just skips.
	try {
		const installRoot = installRootFor(config);
		if (readUpdateState(installRoot).status === "pending-boot") {
			markUpdateSuccess({ installRoot, version: RUNNER_VERSION });
			logger.log?.(`Runner update to ${RUNNER_VERSION} booted and heartbeated (marked success).`);
		}
	} catch {
		// Best effort only.
	}
	// Model auto-discovery seed: one round at boot (after the version
	// probes, before the first heartbeat) so early facts already carry
	// discovered ids. Best-effort inside and bounded by the discovery
	// timeout; failures keep the cache empty, never fail boot.
	await refreshDiscoveredModels({ config, logger });
	const heartbeatTimer = setInterval(() => {
		deliverSteers({ config, client, logger, facts: factsFor({ config, updateStatus: state?.updateStatus ?? null, commandAck: stagedCommandAck(state) }), state }).catch((err) => {
			logger.warn(`Heartbeat failed: ${err?.message || err}`);
		});
	}, config.heartbeatMs);
	if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
	// Periodic discovery refresh (default 12h, 0 disables): model menus
	// change slowly, so heartbeats reuse the cache between rounds.
	const discoveryIntervalMs = config.modelDiscoveryIntervalMs ?? 43200000;
	let discoveryTimer = null;
	if (discoveryIntervalMs > 0) {
		discoveryTimer = setInterval(() => {
			refreshDiscoveredModels({ config, logger }).catch((err) => {
				logger.warn(`Model discovery refresh failed: ${err?.message || err}`);
			});
		}, discoveryIntervalMs);
		if (typeof discoveryTimer.unref === "function") discoveryTimer.unref();
	}
	return {
		harness,
		harnesses,
		facts,
		stop: () => {
			clearInterval(heartbeatTimer);
			if (discoveryTimer) clearInterval(discoveryTimer);
		},
	};
}

/***
 * MARK: stagedCommandAck
 * @description Oldest unconfirmed command ack staged on the loop state
 *   (FIFO over `state.commandAcks`), or undefined when none is staged.
 *   Single source of truth for every heartbeat facts builder.
 * @example stagedCommandAck({ commandAcks: [{ command: 'requestUpdate', ok: true, detail: '' }] }) => { command: 'requestUpdate', ok: true, detail: '' }
 * @param {Object} [state] - Live-execution ref.
 * @returns {Object|undefined} The oldest staged ack.
 ***/
function stagedCommandAck(state) {
	return Array.isArray(state?.commandAcks) ? state.commandAcks[0] : undefined;
}

/***
 * MARK: stageCommandAck
 * @description Stages one command ack for delivery on the next heartbeat
 *   facts (FIFO; consumed by `deliverSteers` after the round-trip).
 * @example stageCommandAck({}, { command: 'requestUpdate', ok: true, detail: '' })
 * @param {Object} state - Live-execution ref.
 * @param {Object} ack - `{ command, ok, detail }`.
 ***/
function stageCommandAck(state, ack) {
	if (!Array.isArray(state.commandAcks)) state.commandAcks = [];
	state.commandAcks.push(ack);
}

/***
 * MARK: handlePendingCommands
 * @description Acts on backend-to-Runner commands delivered through the
 *   heartbeat pull channel (ADR 0013): `requestModelRediscovery` re-runs
 *   model discovery promptly (fresh probe, not the 12h cache cadence;
 *   skipped with a success ack when the operator pinned models, since
 *   pins win by default — `modelDiscoveryWins` opts in to scanning
 *   anyway); `requestUpdate` runs the existing idle-only
 *   self-update at once when idle, or parks `state.pendingUpdate` for
 *   the next idle point when an execution is live (never interrupts
 *   work, D5). Every handled command stages exactly one ack on
 *   `state.commandAcks` for the next heartbeat facts; unknown commands
 *   are ignored (the backend never sends them — enqueue is fail-closed).
 *   Commands already staged or in flight are skipped, so the backend's
 *   at-least-once redelivery never double-applies.
 * @example await handlePendingCommands({ config, client, logger, state, pendingCommands: ['requestModelRediscovery'] })
 * @param {Object} opts - Options (config, client, logger, state, pendingCommands, updateDeps?, discoverFn?, discoveryCtx?).
 * @returns {Promise<void>} Resolves once every command acted (or the process exits 0 into a staged update).
 ***/
export async function handlePendingCommands({ config, client, logger, state, pendingCommands = [], updateDeps, discoverFn, discoveryCtx } = {}) {
	if (!state) state = {};
	if (!Array.isArray(state.commandAcks)) state.commandAcks = [];
	if (!(state.commandFlight instanceof Set)) state.commandFlight = new Set();
	const alreadyStaged = (cmd) => state.commandAcks.some((a) => a && a.command === cmd);
	for (const cmd of pendingCommands) {
		if (cmd !== "requestModelRediscovery" && cmd !== "requestUpdate") continue;
		if (alreadyStaged(cmd) || state.commandFlight.has(cmd)) continue;
		state.commandFlight.add(cmd);
		try {
			if (cmd === "requestModelRediscovery") {
				logger.log?.("Runner command: re-detecting models");
				if (config?.modelDiscoveryIntervalMs === 0) {
					stageCommandAck(state, { command: cmd, ok: true, detail: "discovery disabled (interval 0); advertising pinned list" });
					continue;
				}
				if (isModelsPinned(config) && !config?.modelDiscoveryWins) {
					stageCommandAck(state, { command: cmd, ok: true, detail: "models pinned; discovery skipped" });
					continue;
				}
				const ids = await refreshDiscoveredModels({ config, logger, discoverFn, discoveryCtx });
				const count = Array.isArray(ids) ? ids.length : 0;
				const { countsText, firstError } = summarizeDiscoverySlices(runnerHarnessIds(config));
				const scope = countsText ? ` (${countsText})` : " (no discovery legs configured)";
				let detail = `discovered ${count} model(s)${scope}`;
				if (firstError?.code) detail += ` (${firstError.code})`;
				stageCommandAck(state, { command: cmd, ok: true, detail });
			}
			if (cmd === "requestUpdate") {
				// Idle-only: do not interrupt active work (D5)
				if (state?.executionId) {
					logger.log?.("Runner update queued — will apply when idle");
					state.pendingUpdate = true;
					stageCommandAck(state, { command: cmd, ok: true, detail: "queued: update at next idle" });
				} else {
					let upd = null;
					let updateError = null;
					try {
						upd = await maybeSelfUpdate({ config, client, logger, installRoot: installRootFor(config), updateState: state, updateDeps, force: true });
					} catch (err) {
						updateError = err;
					}
					if (updateError) {
						logger.warn?.(`Runner update failed: ${updateError?.message || updateError}`);
						stageCommandAck(state, { command: cmd, ok: false, detail: String(updateError?.message || updateError).slice(0, 500) });
					} else if (upd && upd.ok === false) {
						// maybeSelfUpdate contains check/apply failures as
						// ok:false (never throws): surface them as a failed
						// ack so the operator sees the reason in Settings.
						stageCommandAck(state, { command: cmd, ok: false, detail: String(upd.reason || "update check failed").slice(0, 500) });
					} else if (upd?.applied) {
						const ack = { command: cmd, ok: true, detail: `updated to ${upd.update?.version}` };
						stageCommandAck(state, ack);
						// The process exits into the staged update below:
						// confirm the ack with a final heartbeat first, or
						// the backend would redeliver the command to the
						// rebooted Runner (peek-until-ack) and record a
						// misleading "no update available" result for work
						// already done.
						try {
							if (typeof client?.heartbeat === "function") {
								await client.heartbeat({ runnerId: config.runnerId, facts: factsFor({ config, commandAck: ack }) });
							}
						} catch (err) {
							logger.warn?.(`Update ack heartbeat failed (update still staged): ${err?.message || err}`);
						}
						logger.log?.(`Runner updated to ${upd.update?.version}, restarting`);
						process.exit(0);
					} else {
						stageCommandAck(state, { command: cmd, ok: true, detail: upd?.reason || "no update available" });
					}
				}
			}
		} finally {
			state.commandFlight.delete(cmd);
		}
	}
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
 * @param {Object} opts - Options (config, client, logger, facts, state, updateDeps?, discoverFn?, discoveryCtx?).
 * @returns {Promise<number>} Steers delivered (acked) this cycle.
 ***/
export async function deliverSteers({ config, client, logger, facts, state, updateDeps, discoverFn, discoveryCtx }) {
	const pendingAck = stagedCommandAck(state);
	const factsWithAck = pendingAck ? { ...facts, commandAck: pendingAck } : facts;
	const beat = await client.heartbeat({ runnerId: config.runnerId, facts: factsWithAck });
	if (pendingAck && Array.isArray(state?.commandAcks)) {
		state.commandAcks.shift();
	}
	if (Array.isArray(beat.pendingCommands) && beat.pendingCommands.length) {
		await handlePendingCommands({ config, client, logger, state, pendingCommands: beat.pendingCommands, updateDeps, discoverFn, discoveryCtx });
	}
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
export function collectTaskFiles({ workdir, taskId, docsDirName = null, project = null } = {}) {
	const resolved = resolveRunnerDocsDirName(
		docsDirName ?? (typeof project === "object" && project !== null ? project : null),
	);
	const dir = path.join(workdir, resolved, "tasks", taskId);
	const files = [];
	let total = 0;
	try {
		for (const name of fs.readdirSync(dir)) {
			if (name === "task.md") continue;
			try {
				const content = fs.readFileSync(path.join(dir, name), "utf8");
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
		// The ONE served-model answer for every observable this execution
		// writes (prompted progress, completion posture, completion model
		// field): the dispatched requirement wins, else the Runner's pinned
		// default, else null — non-LLM kinds and the "default" sentinel
		// always report null. Computed once so the wire can never disagree
		// with the posture string.
		const servedModel = servingModelFor({ kind, model, fallbackModel: config.model });
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
		// Hoisted so the failure path below can flush the trailing
		// structured batch before reporting the stage as failed.
		let structuredSender = null;
		// Latched by the verdict watcher in the runHarnessStage onEvent
		// callback below when the agent calls the fail_stage tool (mirrors
		// the embedded path's stageFailureRequested in api/agentRunner.js).
		let failStageRequest = null;
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
				const synced = await syncTaskDocs({ primaryCwd: project.cwd || null, workdir, taskId, docsDirName: project?.docsDirName });
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
					model: servedModel,
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
						taskFiles: collectTaskFiles({ workdir, taskId, docsDirName: project?.docsDirName }), output: "",
						posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }),
						model: servedModel,
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
						return await client.complete({ taskId, projectId, executionId, epoch, sha, branch, outcome: "failed", failureReason, taskFiles: collectTaskFiles({ workdir, taskId, docsDirName: project?.docsDirName }), output: ci.output.slice(0, 20000), posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }), model: servedModel, durationMs: Date.now() - runStartedAt });
					}
					return await client.complete({ taskId, projectId, executionId, epoch, sha, branch, outcome: "passed", taskFiles: collectTaskFiles({ workdir, taskId, docsDirName: project?.docsDirName }), output: ci.output.slice(0, 20000), posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }), model: servedModel, durationMs: Date.now() - runStartedAt });
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
			// Structured log transport: every normalized session event ships
			// to POST /tasks/:id/log-events (batched, secret-redacted at the
			// source). While the structured path is healthy the legacy text
			// tap stays silent so the backend stores one copy; once it fails
			// the sender flips and the text tap carries the coarse view again.
			structuredSender = createStructuredEventSender({
				client,
				taskId: taskId,
				projectId: projectId,
				executionId,
				epoch,
				logger,
				onTextFallback: (text) => {
					sendLogs(text).catch(() => {});
				},
			});
			const { output } = await runHarnessStage({
				harness,
				project: { ...project, cwd: workdir },
				workdir,
				taskId: taskId,
				stageId,
				// Run on the SAME served model every observable reports
				// (servedModel): the raw dispatch value can be the
				// "default" sentinel or whitespace, which the harness
				// would otherwise receive literally while the UI
				// reports the fallback (or nothing) — a run/report
				// divergence. Null means no pin: the harness default.
				model: servedModel,
				prompt,
				onLog: (text) => {
					if (structuredSender.isStructured()) return;
					sendLogs(text).catch((err) => {
						logger.warn(`Log ingest failed: ${err?.message || err}`);
					});
				},
				onEvent: (event) => {
					// Verdict watcher, FIRST: an explicit fail_stage call fails
					// the stage even when the final text says PASS, exactly as
					// the embedded path latches stageFailureRequested. This
					// runs before the log transport below on purpose — the
					// latch is the safety-critical side (a missed latch
					// wrongly passes the stage), while a dropped log event
					// only degrades the transcript (the text tap still
					// carries the coarse view). runHarnessStage already
					// guards this callback, so neither half can break the run.
					if (event?.type === "tool_started") {
						const toolName = event.toolName || event.name || "tool";
						if (toolName === "fail_stage" || toolName === "Fail_stage_skill") {
							const args = event.args || event.arguments || {};
							failStageRequest = {
								reason: args.reason || args.message || "Stage failure reported by agent review",
							};
						}
					}
					structuredSender.queueEvent(event);
				},
				onSession: (session) => {
					state.session = session;
				},
			});
			state.session = null;
			stopRenewal();
			// Ship the trailing structured batch BEFORE the finished marker
			// and the completion report, so the backend stores the tail
			// before any reader can observe the stage as done.
			await structuredSender.close().catch((err) => {
				logger.warn(`Structured log flush failed: ${err?.message || err}`);
			});
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
			// Agent-failure detection (shared verdict contract — the same
			// decision the embedded path makes): a latched fail_stage tool
			// call, or a well-formed FAIL block with reason AND fix guidance,
			// reports failed/rejected so the backend routes through
			// routeStageError (failback per stage config) instead of
			// advancing. A reasonless FAIL still passes open with a warning.
			// Position is the primary agent-only guard: `integrate` returns
			// early above and `ci` takes the CI branch, so only agent work
			// reaches this check. The synthesized stage is belt-and-braces —
			// TRAP: normalizeStageType("integrate") falls through to
			// "agent", so the guard would misfire if `integrate` ever
			// reached here; it cannot due to that early return.
			const verdictDecision = decideAgentStageVerdict({
				stage: { type: kind || "agent" },
				output: String(output || ""),
				failStageRequest,
			});
			if (verdictDecision.failed) {
				return await client.complete({
					taskId: taskId,
					projectId: projectId,
					executionId,
					epoch,
					sha,
					branch,
					posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }),
					model: servedModel,
					outcome: "failed",
					failureKind: "rejected",
					failureReason: verdictDecision.failureReason,
					taskFiles: collectTaskFiles({ workdir, taskId }),
					output: String(output || "").slice(0, 20000),
					durationMs: Date.now() - runStartedAt,
				});
			}
			if (verdictDecision.failOpenWarning) {
				logger.warn(verdictDecision.failOpenWarning);
			}
			return await client.complete({
				taskId: taskId,
				projectId: projectId,
				executionId,
				epoch,
				sha,
				branch,
				posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }),
				model: servedModel,
				outcome: "passed",
				taskFiles: collectTaskFiles({ workdir, taskId, docsDirName: project?.docsDirName }),
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
				// Flush first so the error's tool trail is stored before
				// the failure report renders it.
				try {
					await structuredSender?.close();
				} catch {
					// Flushing is best-effort: the failure report matters more.
				}
				// A latched fail_stage decision wins over the harness exception,
				// exactly as the embedded path prefers stageFailureRequested
				// over promptException (api/agentRunner.js): the agent actively
				// decided the stage should fail, so this is review feedback
				// ("rejected", failback routing), not an infrastructure blip.
				if (failStageRequest) {
					const latchedDecision = decideAgentStageVerdict({
						stage: { type: kind || "agent" },
						output: "",
						failStageRequest,
					});
					if (latchedDecision.failed) {
						return await client.complete({
							taskId: taskId,
							projectId: projectId,
							executionId,
							epoch,
							outcome: "failed",
							failureKind: "rejected",
							failureReason: latchedDecision.failureReason,
							posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }),
							model: servedModel,
							durationMs: Date.now() - runStartedAt,
						});
					}
				}
				return await client.complete({
					taskId: taskId,
					projectId: projectId,
					executionId,
					epoch,
					outcome: "failed",
					failureReason: err.failedOutcome,
					posture: formatPosture({ tiers: config.tiers, harness: servingHarnessId, model: servedModel }),
					model: servedModel,
					durationMs: Date.now() - runStartedAt,
				});
			}
			// Flush the trailing structured batch before interrupting: the
			// tool/error trail up to the failure point must be stored, not
			// only whatever the text tap carried.
			try {
				await structuredSender?.close();
			} catch {
				// Flushing is best-effort: the interrupt matters more.
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
/***
 * MARK: integrationMergeSubject
 * @description Subject for the integration merge commit. Integration always
 *   creates a real merge commit (--no-ff), even when the task branch could
 *   fast-forward: task work otherwise lands on the target as a chain of
 *   `kb/<id> … Runner stage output` commits, which the changelog filter
 *   (shared/changelogHistory/isAdminCommitSubject.js) hides as automation
 *   noise — so a merged, deployed feature never appeared in the in-app
 *   changelog (task a654a254, 2026-11-02). This subject matches none of the
 *   admin patterns, so the changelog shows one entry per merged task,
 *   carrying the task's own title.
 * @example integrationMergeSubject({ taskBranch: 'kb/abc', targetBranch: 'main', task: { title: 'Fix scroll' } }) => 'Merge kb/abc into main: Fix scroll'
 * @param {Object} opts - `{ taskBranch, targetBranch, task }`.
 * @returns {string} Single-line merge commit subject.
 ***/
export function integrationMergeSubject({ taskBranch, targetBranch, task } = {}) {
	const title = String(task?.title || task?.goal || "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 120);
	const base = `Merge ${taskBranch} into ${targetBranch}`;
	return title ? `${base}: ${title}` : base;
}

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
					"merge", "--no-ff", "-m", integrationMergeSubject({ taskBranch, targetBranch, task }),
					`origin/${taskBranch}`,
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
				return await failTask(detail, { taskFiles: collectTaskFiles({ workdir, taskId, docsDirName: project?.docsDirName }) });
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
	resolveHarnessConfig(config);
	if (config.errors?.length) {
		throw new Error(`Invalid Runner config: ${config.errors.join(" ")}`);
	}
	const orphans = listOrphanWorkdirs(config.workRoot, config.taskId);
	if (orphans.length) {
		logger.warn(`Orphaned workdirs (left alone, may hold unpushed work): ${orphans.join(", ")}`);
		// Also surface this warning to the UI via the logs endpoint.
		try {
			await client.logs({
				taskId: config.taskId,
				projectId: config.projectId,
				executionId: "",
				epoch: 0,
				seq: 0,
				bytes: `WARN Orphaned workdirs: ${orphans.join(", ")}`.slice(0,4000),
			});
		} catch (e) {
			logger.warn(`Failed to send orphan warning to UI logs: ${e?.message || e}`);
		}
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
		// Idle-only update close-out: a requestUpdate that arrived
		// mid-assignment parked state.pendingUpdate — this is the
		// single-assignment idle point, so honor it exactly like the
		// dispatch loop does (an applied update returns updated:true and
		// the process exits 0 into the new version via main()).
		if (state.pendingUpdate) {
			try {
				const upd = await maybeSelfUpdate({ config, client, logger, installRoot: installRootFor(config), updateState: state, force: true });
				if (upd?.applied) return { ...result, updated: true, version: upd.update?.version };
				state.pendingUpdate = false;
			} catch (err) {
				logger.warn?.(`Runner self-update failed (keeping current version): ${err?.message || err}`);
			}
		}
		return result;
	} finally {
		stop();
	}
}

/***
 * MARK: installRootFor
 * @description Resolves the self-update install root (Option A, ADR 0012):
 *   explicit KAINBAIN_RUNNER_INSTALL_ROOT wins, else a `runner-install`
 *   sibling of the work root (state lives with the installation, not with
 *   task worktrees).
 * @example installRootFor({ installRoot: '/opt/r' }) => '/opt/r'
 * @example installRootFor({ workRoot: 'runner-work' }) => '<abs>/runner-install'
 * @param {Object} [config] - Normalized runner config.
 * @returns {string} Install root path.
 ***/
export function installRootFor(config = {}) {
	const explicit = String(config.installRoot || "").trim();
	if (explicit) return explicit;
	return defaultInstallRoot({ workRoot: config.workRoot });
}

/***
 * MARK: maybeSelfUpdate
 * @description Idle-time self-update check (Option A, ADR 0012). No-ops
 *   unless auto-update is on AND the check interval has elapsed (jittered
 *   ±20% so a fleet does not thunder the release pointer). On a newer
 *   verified release, downloads, verifies, atomically stages it, and
 *   returns `applied` — the caller then exits 0 so the wrapper restarts
 *   into the new version. Any verification failure returns ok:false and
 *   keeps the current installation untouched.
 * @example await maybeSelfUpdate({ config, client }) => { checked: false, ... }
 * @param {Object} opts - Options (config, client?, logger?, installRoot?, now?, updateState?, updateDeps?, force?).
 *   `force` bypasses the interval gate for the 409 path, where the backend
 *   explicitly ordered an update — the Runner checks immediately instead of
 *   waiting out the jittered hour.
 * @returns {Promise<Object>} `{ checked, ok, update?, applied?, reason? }`. Apply
 *   failures are contained here (ok:false, failed status noted) and never throw.
 ***/
export async function maybeSelfUpdate({
	config,
	client = null,
	logger = console,
	installRoot = installRootFor(config),
	now = Date.now(),
	updateState = null,
	updateDeps = {},
	force = false,
} = {}) {
	if (!config?.autoUpdate) return { checked: false, reason: "auto-update disabled" };
	const interval = Number(config.updateCheckIntervalMs) || 3600000;
	const state = updateState || {};
	const last = Number(state.lastUpdateCheckAt) || 0;
	const jittered = interval * (0.8 + Math.random() * 0.4);
	if (!force && now - last < jittered) return { checked: false, reason: "interval" };
	state.lastUpdateCheckAt = now;
	const check = updateDeps.checkForUpdate || defaultCheckForUpdate;
	const apply = updateDeps.applyUpdate || defaultApplyUpdate;
	// Facts-only alert path (plan §4.5): the next heartbeat carries
	// updateStatus, which the backend stores on the runner record for the
	// fleet UI. No dedicated endpoint in v1.
	const note = (status) => {
		if (updateState && typeof updateState === "object") updateState.updateStatus = status;
	};
	const fail = (reason) => {
		logger.warn?.(`Runner update check failed: ${reason}`);
		note({ state: "failed", reason: String(reason || "unknown").slice(0, 500), at: new Date(now).toISOString() });
		return { checked: true, ok: false, reason: String(reason || "check failed") };
	};
	let result;
	try {
		result = await check({
			currentVersion: RUNNER_VERSION,
			updateUrl: config.updateUrl,
			logger,
		});
	} catch (err) {
		return fail(err?.message || err);
	}
	if (!result?.ok) return fail(result?.reason || "check failed");
	if (!result.update) return { checked: true, ok: true, update: null, reason: result.reason || "up to date" };
	logger.log?.(`Runner update available: ${result.update.version} (verified signature); staging install.`);
	// The install must stay untouched on ANY apply failure (network cut
	// mid-download, lock held, tar missing): contain it here so neither
	// the idle branch nor the 409 branch can crash the loop.
	let applied;
	try {
		applied = await apply({
			update: result.update,
			installRoot,
			updateUrl: config.updateUrl,
			logger,
		});
	} catch (err) {
		return fail(err?.message || err);
	}
	note({ state: "staged", version: result.update.version, at: new Date(now).toISOString() });
	return { checked: true, ok: true, update: result.update, applied };
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
	resolveHarnessConfig(config);
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
	// Terminal-task workdir sweep: the per-assignment reap only covers the
	// task this Runner just ran, so workdirs of tasks finished by another
	// Runner (or across a restart) lingered until the 30-min staleness
	// window and refilled WORKTREE_CAP — wedging every new claim into a
	// WORKTREE_CAP_REACHED interrupt loop. Sweep at startup and then about
	// once a minute (12 polls at the default 5s). Best-effort: never throws,
	// and a backend outage reaps nothing.
	const sweepEveryPolls = 12;
	const sweepTerminalWorkdirs = async (why) => {
		try {
			const reaped = await reapTerminalOrphanWorkdirs({ client, workRoot: config.workRoot });
			if (reaped.length) {
				logger.log(
					`Workdir sweep (${why}): reaped ${reaped.length} terminal workdir(s): ${reaped.map((d) => path.basename(d)).join(", ")}`,
				);
			}
		} catch (err) {
			logger.warn?.(`Workdir sweep (${why}) failed: ${err?.message || err}`);
		}
	};
	await sweepTerminalWorkdirs("startup");
	try {
		for (let idle = 0; ;) {
			let answer;
			try {
				answer = await client.dispatchClaim({ projectIds: config.projectIds ?? null });
			} catch (err) {
				if (err?.code === "STALE_RUNNER") {
					await client.heartbeat({ runnerId: config.runnerId, facts: factsFor({ config, updateStatus: state?.updateStatus ?? null, commandAck: stagedCommandAck(state) }) });
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
				} else if (err?.code === "RUNNER_VERSION_BELOW_MINIMUM") {
					// Backend refuses dispatch below the minimum compatible
					// version (Option A, ADR 0012): self-update now (idle —
					// no active task), then exit 0 so the wrapper restarts
					// into the new version and re-registers. Forced: the
					// backend explicitly ordered the update, so the
					// interval gate is bypassed. No update available (or
					// a failed stage) means back off and poll again — the
					// loop never crashes on an update failure.
					polls += 1;
					logger.log(`Dispatch: below minimum version (${err?.message || "update required"}); updating.`);
					try {
						const upd = await maybeSelfUpdate({ config, client, logger, installRoot: installRootFor(config), updateState: state, force: true });
						if (upd?.applied) return { assignments, polls, updated: true, version: upd.update?.version };
					} catch (updateErr) {
						logger.warn?.(`Runner self-update failed (keeping current version): ${updateErr?.message || updateErr}`);
					}
					await new Promise((r) => setTimeout(r, pollMs));
					continue;
				} else {
					throw err;
				}
			}
			polls += 1;
			if (polls % sweepEveryPolls === 0) await sweepTerminalWorkdirs("periodic");
			if (!answer.assigned) {
				// A busy integration slot is work waiting, not idleness:
				// back off WITHOUT consuming idle budget, like fleet
				// backpressure (D8) and operator pause.
				if (answer.code === "INTEGRATION_BUSY") {
					logger.log(`Dispatch: integration slot busy; backing off.`);
					await new Promise((r) => setTimeout(r, pollMs));
					continue;
				}
				// Impromptu T0 jobs (ADR 0014): idle iterations also poll for read-only chat turns when enabled. Task dispatch keeps priority — this only runs when dispatch had no work.
				if (config.impromptu !== false) {
					let imp = null;
					try {
						imp = await client.impromptuPoll();
					} catch (err) {
						if (err?.statusCode !== 409) logger.warn(`Impromptu poll failed: ${err?.message || err}`);
					}
					if (imp?.assigned && imp.job) {
						let result = null;
						try {
							result = await runImpromptuJob({ config, client, logger, harnesses, job: imp.job });
						} catch (err) {
							// Transport failure mid-job (a job's own model/session
							// failures are already reported as failed completions
							// and return an outcome, never throw).
							logger.warn(`Impromptu job ${imp.job?.jobId} transport failed: ${err?.message || err}`);
						}
						if (result?.outcome === "failed") {
							logger.warn(`Impromptu job ${imp.job?.jobId} failed; continuing with dispatch.`);
						}
						idle = 0;
						continue;
					}
				}
				idle += 1;
				// idleLimit 0 means a persistent service loop: never idle out.
				if (idleLimit > 0 && idle >= idleLimit) return { assignments, polls, idle: true };
				logger.log(
					`Dispatch: no work (${answer.code ?? "empty"}); idle ${idle}${idleLimit > 0 ? `/${idleLimit}` : "/∞ (persistent)"}.`,
				);
				// Self-update-on-idle (Option A, ADR 0012): the loop holds
				// no task here, so a staged update cannot strand work. A
				// staged update returns updated:true — the process exits 0
				// and the wrapper restarts into the new version.
				try {
					const upd = await maybeSelfUpdate({ config, client, logger, installRoot: installRootFor(config), updateState: state });
					if (upd?.applied) return { assignments, polls, idle, updated: true, version: upd.update?.version };
				} catch (err) {
					logger.warn?.(`Runner self-update failed (keeping current version): ${err?.message || err}`);
				}
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
			if (state.pendingUpdate) {
				try {
					const upd = await maybeSelfUpdate({ config, client, logger, installRoot: installRootFor(config), updateState: state, force: true });
					if (upd?.applied) return { assignments, polls, updated: true, version: upd.update?.version };
					state.pendingUpdate = false;
				} catch {}
			}
		}
	} finally {
		stop();
	}
}
