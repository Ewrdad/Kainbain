import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";

/***
 * MARK: harnessDiscovery
 * @description Cross-platform harness/binary discovery: the ONE place that
 *   knows where agent-CLI binaries live. Resolves bare CLI names (`agy`,
 *   `muse`, `opencode`) through `KAINBAIN_*_BIN` env overrides, `PATH`, and
 *   standard install dirs (`~/.local/bin`, `~/bin` on POSIX;
 *   `%LOCALAPPDATA%`, `%USERPROFILE%\\bin` on Windows; `~/.opencode/bin` for
 *   opencode), and reports per-harness availability without spawning slow
 *   CLIs on the request path (local `fs` existence checks only, cached).
 *
 *   This module is the ONLY non-test source with `process.platform`
 *   branching — the branching stays inside it, and callers inject
 *   `{ env, platform }` for hermetic tests instead of touching the real
 *   environment.
 *
 *   Two doors lead in:
 *     - `resolveBinary(name, opts)` — where is this binary? (`{ found, path,
 *       source }` for badges, hints, and spawn planning).
 *     - `discoverHarnesses(opts)` — cached per-harness availability
 *       (`[{ id, available, detectionSource, binPath?, hint?, authConfigured }]`)
 *       consumed by `GET /harnesses` via `harnessAvailability()`.
 * @example resolveBinary("agy") => { found: true, path: "/home/u/.local/bin/agy", source: "local-bin" }
 * @example discoverHarnesses() => [{ id: "pi", available: true, detectionSource: "pi-snapshot", … }]
 ***/

/***
 * MARK: DISCOVERY_ENV_VARS
 * @description Env override per CLI harness id. Read from the injected `env`
 *   (default `process.env`) so tests never touch the real environment.
 * @example DISCOVERY_ENV_VARS.antigravity // => "KAINBAIN_AGY_BIN"
 ***/
export const DISCOVERY_ENV_VARS = Object.freeze({
	antigravity: "KAINBAIN_AGY_BIN",
	codex: "KAINBAIN_CODEX_BIN",
	muse: "KAINBAIN_MUSE_BIN",
	opencode: "KAINBAIN_OPENCODE_BIN",
	vibe: "KAINBAIN_VIBE_BIN",
});

/***
 * MARK: DISCOVERY_BINARIES
 * @description Bare binary name per CLI harness id.
 * @example DISCOVERY_BINARIES.antigravity // => "agy"
 ***/
export const DISCOVERY_BINARIES = Object.freeze({
	antigravity: "agy",
	codex: "codex",
	muse: "muse",
	opencode: "opencode",
	vibe: "vibe",
});

/** Default Windows executable extensions when PATHEXT is unset. */
const DEFAULT_WINDOWS_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/***
 * MARK: resolveHomeDir
 * @description Resolves the user's home directory from the injected env
 *   (`HOME`, else `USERPROFILE` on Windows), falling back to `os.homedir()`
 *   only when neither is set. Never throws: "" when unresolvable.
 * @example resolveHomeDir({ HOME: "/tmp/fake" }, "linux") => "/tmp/fake"
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The home directory, or "" when unresolvable.
 ***/
export function resolveHomeDir(env = process.env, platform = process.platform) {
	const home = env?.HOME;
	if (typeof home === "string" && home) return home;
	if (platform === "win32") {
		const profile = env?.USERPROFILE;
		if (typeof profile === "string" && profile) return profile;
	}
	try {
		return os.homedir() || "";
	} catch {
		return "";
	}
}

/***
 * MARK: isExecutableFile
 * @description Whether `file` is an executable regular file. POSIX requires
 *   the execute bit (`X_OK`); Windows only requires existence (extensions
 *   are handled by PATHEXT probing in `resolveBinary`). Never throws.
 * @example isExecutableFile("/usr/bin/agy", "linux") => true
 * @param {string} file - Candidate absolute path.
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {boolean}
 ***/
export function isExecutableFile(file, platform = process.platform) {
	if (typeof file !== "string" || !file) return false;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename -- candidate paths are constructed by the resolver from env/PATH entries, mirroring Security_scans.sh find_bin */
		const stat = fs.statSync(file);
		if (!stat.isFile()) return false;
		if (platform === "win32") return true;
		fs.accessSync(file, fs.constants.X_OK);
		/* eslint-enable security/detect-non-literal-fs-filename */
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: candidateExecutables
 * @description Candidate file paths for `name` inside `dir`: the bare name
 *   on POSIX, plus every PATHEXT-suffixed variant on Windows.
 * @example candidateExecutables("/bin", "agy", "linux") => ["/bin/agy"]
 * @param {string} dir - Directory to probe.
 * @param {string} name - Bare binary name.
 * @param {Object} [opts]
 * @param {string} [opts.platform] - Platform override.
 * @param {string} [opts.pathExt] - Raw PATHEXT value (Windows only).
 * @returns {Array<string>} Candidate paths in probe order.
 ***/
export function candidateExecutables(
	dir,
	name,
	{ platform = process.platform, pathExt } = {},
) {
	if (platform !== "win32") return [path.join(dir, name)];
	const raw = pathExt || DEFAULT_WINDOWS_PATHEXT;
	const exts = raw
		.split(";")
		.map((ext) => ext.trim())
		.filter(Boolean);
	const candidates = [path.join(dir, name)];
	for (const ext of exts) {
		const dotted = ext.startsWith(".") ? ext : `.${ext}`;
		candidates.push(path.join(dir, `${name}${dotted}`));
	}
	return candidates;
}

/***
 * MARK: standardSearchDirs
 * @description Ordered standard install dirs (AFTER PATH — a standard dir
 *   never shadows a PATH binary) with their detection sources. POSIX:
 *   `~/.local/bin`, `~/bin`. Windows: `%LOCALAPPDATA%`,
 *   `%USERPROFILE%\\bin`. Harness extras (e.g. `~/.opencode/bin`) append
 *   after the platform standards via `extraDirs`.
 * @example standardSearchDirs({ HOME: "/tmp/fake" }, "linux") => [{ dir: "/tmp/fake/.local/bin", source: "local-bin" }, …]
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @param {Array<Object>} [extraDirs] - Extra `{ dir, source }` entries appended last.
 * @returns {Array<{dir: string, source: string}>}
 ***/
export function standardSearchDirs(
	env = process.env,
	platform = process.platform,
	extraDirs = [],
) {
	const home = resolveHomeDir(env, platform);
	const dirs = [];
	if (platform === "win32") {
		const localAppData = env?.LOCALAPPDATA;
		if (typeof localAppData === "string" && localAppData) {
			dirs.push({ dir: localAppData, source: "localappdata" });
		}
		if (home) {
			dirs.push({ dir: path.join(home, "bin"), source: "userprofile-bin" });
		}
	} else {
		if (home) {
			dirs.push({ dir: path.join(home, ".local", "bin"), source: "local-bin" });
			dirs.push({ dir: path.join(home, "bin"), source: "home-bin" });
		}
	}
	for (const extra of extraDirs || []) {
		if (extra && typeof extra.dir === "string" && extra.dir) {
			dirs.push({ dir: extra.dir, source: extra.source || "extra-bin" });
		}
	}
	return dirs;
}

/***
 * MARK: resolveBinary
 * @description Resolves a bare CLI name to an executable path: explicit
 *   `envOverride` first (absolute/relative-with-separator used verbatim when
 *   executable; a bare override name is searched like `name`), then `PATH`
 *   left-to-right, then the standard install dirs (see
 *   `standardSearchDirs`). Local `fs` checks only — never spawns.
 * @example resolveBinary("agy") => { found: true, path: "/home/u/.local/bin/agy", source: "local-bin" }
 * @example resolveBinary("nope") => { found: false, path: "nope", source: "not-found" }
 * @param {string} name - Bare binary name (e.g. "agy").
 * @param {Object} [opts]
 * @param {string} [opts.envOverride] - Explicit override path/name (e.g. KAINBAIN_AGY_BIN).
 * @param {Array<Object>} [opts.extraDirs] - Extra `{ dir, source }` search dirs (appended last).
 * @param {Object} [opts.env] - Environment mapping (defaults to process.env).
 * @param {string} [opts.platform] - Platform override (defaults to process.platform).
 * @returns {{found: boolean, path: string, source: string}} `path` is the usable absolute path when found, else the input for downstream ENOENT handling.
 ***/
export function resolveBinary(name, opts = {}) {
	const {
		envOverride,
		extraDirs = [],
		env = process.env,
		platform = process.platform,
	} = opts;
	const isWindows = platform === "win32";
	const delimiter = isWindows ? ";" : ":";

	const search = (bareName) => {
		const rawPath = env?.PATH || "";
		const pathDirs = rawPath
			.split(delimiter)
			.map((dir) => dir.trim())
			.filter(Boolean);
		const pathExt = isWindows ? env?.PATHEXT : undefined;
		for (const dir of pathDirs) {
			for (const candidate of candidateExecutables(dir, bareName, {
				platform,
				pathExt,
			})) {
				if (isExecutableFile(candidate, platform)) {
					return { found: true, path: candidate, source: "path" };
				}
			}
		}
		for (const { dir, source } of standardSearchDirs(env, platform, extraDirs)) {
			for (const candidate of candidateExecutables(dir, bareName, {
				platform,
				pathExt,
			})) {
				if (isExecutableFile(candidate, platform)) {
					return { found: true, path: candidate, source };
				}
			}
		}
		return { found: false, path: bareName, source: "not-found" };
	};

	const override =
		typeof envOverride === "string" && envOverride.trim()
			? envOverride.trim()
			: "";
	if (override) {
		// An override with a separator (or an absolute path) names the file
		// directly — never searched, used verbatim when executable.
		if (
			override.includes("/") ||
			override.includes(path.sep) ||
			(isWindows && /^[a-zA-Z]:[\\/]/.test(override)) ||
			path.isAbsolute(override)
		) {
			if (isExecutableFile(override, platform)) {
				return { found: true, path: override, source: "env" };
			}
			return { found: false, path: override, source: "not-found" };
		}
		const hit = search(override);
		if (hit.found) return { ...hit, source: "env" };
		return { found: false, path: override, source: "not-found" };
	}
	return search(name);
}

/***
 * MARK: resolveSpawnBinary
 * @description Spawn-planning wrapper over `resolveBinary` with strict
 *   pass-through guarantees: absolute/relative-with-separator inputs return
 *   VERBATIM (explicit paths are never rewritten); bare names found via PATH
 *   return VERBATIM (spawned through PATH exactly as today — byte-identical
 *   argv and logs); only a bare name that MISSES on PATH but HITS a standard
 *   dir resolves to the absolute path (previously ENOENT, now runnable); a
 *   name found nowhere returns verbatim so downstream ENOENT classification
 *   (e.g. `AGY_BIN_MISSING`) fires exactly as before.
 * @example resolveSpawnBinary("/opt/agy", {}) => "/opt/agy"
 * @example resolveSpawnBinary("agy", { extraDirs: [] }) => "agy" | "/home/u/.local/bin/agy"
 * @param {string} configured - The configured binary (deps override || config || bare default).
 * @param {Object} [opts] - Passed through to `resolveBinary` (extraDirs, env, platform).
 * @returns {string} The spawn path.
 ***/
export function resolveSpawnBinary(configured, opts = {}) {
	if (typeof configured !== "string" || !configured) return configured;
	const platform = opts.platform || process.platform;
	if (
		configured.includes("/") ||
		configured.includes(path.sep) ||
		(platform === "win32" && /^[a-zA-Z]:[\\/]/.test(configured)) ||
		path.isAbsolute(configured)
	) {
		return configured;
	}
	const hit = resolveBinary(configured, opts);
	if (hit.found && hit.source !== "path") return hit.path;
	return configured;
}

/***
 * MARK: binaryAvailable
 * @description Whether a configured-or-resolved binary value names something
 *   runnable right now: absolute/relative-with-separator values are checked
 *   directly, bare names are resolved (PATH + standard dirs). Powers
 *   `getModelDiscoveryStatus()` on the CLI harnesses without spawning.
 * @example binaryAvailable("/home/u/.local/bin/agy") => true
 * @param {string} value - Configured binary value or resolved path.
 * @param {Object} [opts] - Passed through to `resolveBinary` (extraDirs, env, platform).
 * @returns {boolean}
 ***/
export function binaryAvailable(value, opts = {}) {
	if (typeof value !== "string" || !value) return false;
	const platform = opts.platform || process.platform;
	if (
		value.includes("/") ||
		value.includes(path.sep) ||
		(platform === "win32" && /^[a-zA-Z]:[\\/]/.test(value)) ||
		path.isAbsolute(value)
	) {
		return isExecutableFile(value, platform);
	}
	return resolveBinary(value, opts).found;
}

/***
 * MARK: piSnapshotPath
 * @description The pi model-snapshot path discovery probes:
 *   `$PI_AGENT_DIR/models.json`, defaulting to `~/.pi/agent/models.json`.
 * @example piSnapshotPath({ HOME: "/tmp/fake" }, "linux") => "/tmp/fake/.pi/agent/models.json"
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The snapshot path ("" when the home dir is unresolvable and PI_AGENT_DIR is unset).
 ***/
export function piSnapshotPath(env = process.env, platform = process.platform) {
	const agentDir = env?.PI_AGENT_DIR;
	if (typeof agentDir === "string" && agentDir) {
		return path.join(agentDir, "models.json");
	}
	const home = resolveHomeDir(env, platform);
	if (!home) return "";
	return path.join(home, ".pi", "agent", "models.json");
}

/***
 * MARK: fileExists
 * @description Whether `file` names a readable regular file. Never throws.
 * @param {string} file - Candidate path.
 * @returns {boolean}
 ***/
function fileExists(file) {
	if (typeof file !== "string" || !file) return false;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename -- discovery probes well-known credential/snapshot paths derived from env + home, never user input */
		return fs.statSync(file).isFile();
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return false;
	}
}

/***
 * MARK: museAuthPath
 * @description The Muse CLI credential path discovery probes for EXISTENCE
 *   only (never read): `$MUSE_CONFIG_DIR/auth.json`, defaulting to
 *   `~/.config/muse/auth.json`.
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The auth path ("" when unresolvable).
 ***/
export function museAuthPath(env = process.env, platform = process.platform) {
	const configDir = env?.MUSE_CONFIG_DIR;
	if (typeof configDir === "string" && configDir) {
		return path.join(configDir, "auth.json");
	}
	const home = resolveHomeDir(env, platform);
	if (!home) return "";
	return path.join(home, ".config", "muse", "auth.json");
}

/***
 * MARK: vibeAuthPath
 * @description The Vibe CLI login-cache path discovery probes for EXISTENCE
 *   only (never read): `$VIBE_HOME/whoami_cache.json`, defaulting to
 *   `~/.vibe/whoami_cache.json` (provisioned by the interactive browser
 *   sign-in; headless `--prompt` runs authenticate from this cache).
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The cache path ("" when unresolvable).
 ***/
export function vibeAuthPath(env = process.env, platform = process.platform) {
	const vibeHome = env?.VIBE_HOME;
	if (typeof vibeHome === "string" && vibeHome) {
		return path.join(vibeHome, "whoami_cache.json");
	}
	const home = resolveHomeDir(env, platform);
	if (!home) return "";
	return path.join(home, ".vibe", "whoami_cache.json");
}

/***
 * MARK: agyAuthPath
 * @description The agy CLI credential path discovery probes for EXISTENCE
 *   only (never read): `~/.gemini/antigravity-cli/antigravity-oauth-token`
 *   (observed on the author's box; `agy auth login` provisions it).
 *   Advisory only — `agy models` output classification
 *   (`AGY_MODELS_AUTH`) stays the source of truth for auth state.
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The token path ("" when unresolvable).
 ***/
export function agyAuthPath(env = process.env, platform = process.platform) {
	const home = resolveHomeDir(env, platform);
	if (!home) return "";
	return path.join(
		home,
		".gemini",
		"antigravity-cli",
		"antigravity-oauth-token",
	);
}

/***
 * MARK: codexAuthPath
 * @description The Codex CLI credential path discovery probes for EXISTENCE
 *   only (never read): `$CODEX_HOME/auth.json`, defaulting to
 *   `~/.codex/auth.json` (Codex-native login; OPENAI_API_KEY is checked
 *   separately by the harness and is never injected by KainBain).
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @param {string} [platform] - Platform override (defaults to process.platform).
 * @returns {string} The auth path ("" when unresolvable).
 ***/
export function codexAuthPath(env = process.env, platform = process.platform) {
	const codexHome = env?.CODEX_HOME;
	if (typeof codexHome === "string" && codexHome) {
		return path.join(codexHome, "auth.json");
	}
	const home = resolveHomeDir(env, platform);
	if (!home) return "";
	return path.join(home, ".codex", "auth.json");
}

/** Cached discovery payload (process-lifetime, TTL'd, refresh-bypassable). */
let discoveryCache = null;
let discoveryCacheAt = 0;

/***
 * MARK: clearDiscoveryCache
 * @description Evicts the cached discovery payload so the next
 *   `discoverHarnesses()` re-probes. Tests call this between fake-env cases.
 * @example clearDiscoveryCache()
 ***/
export function clearDiscoveryCache() {
	discoveryCache = null;
	discoveryCacheAt = 0;
}

/***
 * MARK: HARNESS_IDS
 * @description Stable discovery order: CLI harnesses first (the ones with
 *   binaries to find), then the always-available built-ins.
 ***/
export const HARNESS_IDS = Object.freeze([
	"pi",
	"antigravity",
	"codex",
	"muse",
	"opencode",
	"vibe",
	"custom",
	"mock",
]);

/***
 * MARK: discoverHarnesses
 * @description Reports per-harness availability from cheap local probes only
 *   (`fs` existence checks — never spawns, never network): pi via its model
 *   snapshot, CLI harnesses via binary resolution, opencode additionally via
 *   `OPENCODE_URL` (connect mode needs no binary), `custom`/`mock` always
 *   available by definition. Results are TTL-cached process-wide
 *   (`KAINBAIN_MODEL_CACHE_TTL_MS`, bypassed by `{ refresh: true }`).
 *
 *   Each entry: `{ id, available, detectionSource, binPath?, hint?,
 *   authConfigured }` — `available` null means unknown (not probed or
 *   unprovable locally), `hint` names the fix in the
 *   `getModelDiscoveryStatus()` `{ code, message, hint }` vocabulary's words,
 *   `authConfigured` is true/false only when a credential store is honestly
 *   probed (else null).
 * @example discoverHarnesses() => [{ id: "pi", available: true, detectionSource: "pi-snapshot", authConfigured: null }, …]
 * @param {Object} [opts]
 * @param {boolean} [opts.refresh=false] - Bypass the cache and re-probe.
 * @param {Object} [opts.env] - Environment mapping (defaults to process.env).
 * @param {string} [opts.platform] - Platform override (defaults to process.platform).
 * @param {number} [opts.ttlMs] - Cache TTL override (defaults to config.modelCacheTtlMs).
 * @returns {Array<Object>} Per-harness availability entries in HARNESS_IDS order.
 ***/
export function discoverHarnesses(opts = {}) {
	const {
		refresh = false,
		env = process.env,
		platform = process.platform,
		ttlMs = config.modelCacheTtlMs,
	} = opts;
	const now = Date.now();
	if (!refresh && discoveryCache && now - discoveryCacheAt < ttlMs) {
		return discoveryCache;
	}

	const home = resolveHomeDir(env, platform);
	const entries = [];

	// pi: the npm-SDK harness — no CLI to resolve. The model snapshot's
	// presence proves a configured pi stack; its absence reads as UNKNOWN
	// (the SDK registry + env keys may still serve), never as missing.
	const snapshot = piSnapshotPath(env, platform);
	if (snapshot && fileExists(snapshot)) {
		entries.push({
			id: "pi",
			available: true,
			detectionSource: "pi-snapshot",
			authConfigured: null,
		});
	} else {
		entries.push({
			id: "pi",
			available: null,
			detectionSource: "unknown",
			hint: snapshot
				? `No pi model snapshot found at ${snapshot} — configure pi models or set PI_AGENT_DIR.`
				: "No pi model snapshot found — configure pi models or set PI_AGENT_DIR.",
			authConfigured: null,
		});
	}

	// antigravity: the `agy` CLI (env override, PATH, standard dirs).
	const agyResolved = resolveBinary(DISCOVERY_BINARIES.antigravity, {
		envOverride: env?.[DISCOVERY_ENV_VARS.antigravity],
		env,
		platform,
	});
	if (agyResolved.found) {
		entries.push({
			id: "antigravity",
			available: true,
			detectionSource: agyResolved.source,
			binPath: agyResolved.path,
			authConfigured: agyAuthPath(env, platform)
				? fileExists(agyAuthPath(env, platform))
				: null,
		});
	} else {
		entries.push({
			id: "antigravity",
			available: false,
			detectionSource: "not-found",
			hint: "Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.",
			authConfigured: false,
		});
	}

	// codex: the `codex` CLI (env override, PATH, standard dirs). Binary
	// presence IS the signal — no model discovery is performed without a
	// real binary. Auth probes the Codex-native store (~/.codex/auth.json)
	// or OPENAI_API_KEY presence for EXISTENCE only (no credential storage).
	const codexResolved = resolveBinary(DISCOVERY_BINARIES.codex, {
		envOverride: env?.[DISCOVERY_ENV_VARS.codex],
		env,
		platform,
	});
	if (codexResolved.found) {
		const authPath = codexAuthPath(env, platform);
		const authConfigured =
			typeof env?.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim()
				? true
				: (authPath ? fileExists(authPath) : null);
		entries.push({
			id: "codex",
			available: true,
			detectionSource: codexResolved.source,
			binPath: codexResolved.path,
			authConfigured,
		});
	} else {
		entries.push({
			id: "codex",
			available: false,
			detectionSource: "not-found",
			hint: "Install the Codex CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_CODEX_BIN to its absolute path.",
			authConfigured: false,
		});
	}

	// muse: the `muse` CLI (env override, PATH, standard dirs). Binary
	// presence IS the signal — no `muse models` subcommand exists to probe.
	const museResolved = resolveBinary(DISCOVERY_BINARIES.muse, {
		envOverride: env?.[DISCOVERY_ENV_VARS.muse],
		env,
		platform,
	});
	if (museResolved.found) {
		const authPath = museAuthPath(env, platform);
		entries.push({
			id: "muse",
			available: true,
			detectionSource: museResolved.source,
			binPath: museResolved.path,
			authConfigured: authPath ? fileExists(authPath) : null,
		});
	} else {
		entries.push({
			id: "muse",
			available: false,
			detectionSource: "not-found",
			hint: "Install the Muse CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_MUSE_BIN to its absolute path.",
			authConfigured: false,
		});
	}

	// opencode: connect mode (OPENCODE_URL) needs no binary; spawn mode
	// resolves the binary (env override, PATH, standard dirs, PLUS the
	// install script's ~/.opencode/bin which is never on PATH).
	const openCodeUrl =
		typeof env?.OPENCODE_URL === "string" && env.OPENCODE_URL.trim()
			? env.OPENCODE_URL.trim()
			: "";
	if (openCodeUrl) {
		entries.push({
			id: "opencode",
			available: true,
			detectionSource: "env",
			hint: undefined,
			authConfigured: null,
		});
	} else {
		const extraDirs = home
			? [{ dir: path.join(home, ".opencode", "bin"), source: "opencode-bin" }]
			: [];
		const opencodeResolved = resolveBinary(DISCOVERY_BINARIES.opencode, {
			envOverride: env?.[DISCOVERY_ENV_VARS.opencode],
			extraDirs,
			env,
			platform,
		});
		if (opencodeResolved.found) {
			entries.push({
				id: "opencode",
				available: true,
				detectionSource: opencodeResolved.source,
				binPath: opencodeResolved.path,
				authConfigured: null,
			});
		} else {
			entries.push({
				id: "opencode",
				available: false,
				detectionSource: "not-found",
				hint: "Install opencode (https://opencode.ai) or set OPENCODE_URL to a running server (KAINBAIN_OPENCODE_BIN pins the binary).",
				authConfigured: null,
			});
		}
	}

	// vibe: the `vibe` CLI (env override, PATH, standard dirs — the
	// ~/.local/bin install path is covered). Binary presence IS the
	// signal — no `vibe models` subcommand exists to probe. Auth probes
	// the ~/.vibe/ login cache for EXISTENCE only (never read): the
	// headless probe authenticates from that cache with no env key set.
	const vibeResolved = resolveBinary(DISCOVERY_BINARIES.vibe, {
		envOverride: env?.[DISCOVERY_ENV_VARS.vibe],
		env,
		platform,
	});
	if (vibeResolved.found) {
		const authPath = vibeAuthPath(env, platform);
		entries.push({
			id: "vibe",
			available: true,
			detectionSource: vibeResolved.source,
			binPath: vibeResolved.path,
			authConfigured: authPath ? fileExists(authPath) : null,
		});
	} else {
		entries.push({
			id: "vibe",
			available: false,
			detectionSource: "not-found",
			hint: "Install Mistral Vibe and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_VIBE_BIN to its absolute path.",
			authConfigured: false,
		});
	}

	// custom + mock: available by definition (user-owned command / built-in).
	entries.push({
		id: "custom",
		available: true,
		detectionSource: "builtin",
		authConfigured: null,
	});
	entries.push({
		id: "mock",
		available: true,
		detectionSource: "builtin",
		authConfigured: null,
	});

	// Drop undefined hints so entries serialize cleanly.
	for (const entry of entries) {
		if (entry.hint === undefined) delete entry.hint;
		if (entry.binPath === undefined) delete entry.binPath;
	}

	discoveryCache = entries;
	discoveryCacheAt = now;
	return entries;
}
