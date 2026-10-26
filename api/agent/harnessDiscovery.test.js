import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	resolveBinary,
	resolveSpawnBinary,
	binaryAvailable,
	discoverHarnesses,
	clearDiscoveryCache,
	resolveHomeDir,
	standardSearchDirs,
	candidateExecutables,
	piSnapshotPath,
	museAuthPath,
	agyAuthPath,
	vibeAuthPath,
	HARNESS_IDS,
} from "./harnessDiscovery.js";

/***
 * MARK: harnessDiscovery sibling tests
 * @description Covers cross-platform binary resolution (env override, PATH,
 *   standard dirs, Windows PATHEXT via injected platform), spawn-planning
 *   pass-through, and cached per-harness discovery. Every case injects a fake
 *   `{ env, platform }` plus temp-dir fixtures — the real HOME/PATH is never
 *   touched, so the suite is hermetic on any box.
 ***/

const tmpRoots = [];
afterEach(() => {
	clearDiscoveryCache();
	while (tmpRoots.length > 0) {
		const root = tmpRoots.pop();
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-discovery-"));
	tmpRoots.push(root);
	return root;
}

function makeExecutable(dir, name) {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, name);
	fs.writeFileSync(file, "#!/bin/sh\nexit 0\n");
	fs.chmodSync(file, 0o755);
	return file;
}

function makeFile(file) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, "fixture");
	return file;
}

describe("resolveHomeDir", () => {
	it("prefers HOME, then USERPROFILE on Windows, then os.homedir()", () => {
		expect(resolveHomeDir({ HOME: "/tmp/fake" }, "linux")).toBe("/tmp/fake");
		expect(
			resolveHomeDir({ USERPROFILE: "C:\\Users\\u" }, "win32"),
		).toBe("C:\\Users\\u");
		expect(resolveHomeDir({}, "linux")).toBe(os.homedir());
	});
});

describe("candidateExecutables", () => {
	it("probes the bare name on POSIX", () => {
		expect(candidateExecutables("/bin", "agy", { platform: "linux" })).toEqual([
			"/bin/agy",
		]);
	});

	it("probes PATHEXT variants on Windows", () => {
		expect(
			candidateExecutables("C:\\bin", "agy", {
				platform: "win32",
				pathExt: ".EXE;.BAT",
			}),
		).toEqual([
			path.join("C:\\bin", "agy"),
			path.join("C:\\bin", "agy.EXE"),
			path.join("C:\\bin", "agy.BAT"),
		]);
	});
});

describe("standardSearchDirs", () => {
	it("lists ~/.local/bin then ~/bin on POSIX", () => {
		expect(
			standardSearchDirs({ HOME: "/tmp/fake" }, "linux"),
		).toEqual([
			{ dir: "/tmp/fake/.local/bin", source: "local-bin" },
			{ dir: "/tmp/fake/bin", source: "home-bin" },
		]);
	});

	it("lists LOCALAPPDATA then %USERPROFILE%\\bin on Windows", () => {
		const dirs = standardSearchDirs(
			{ USERPROFILE: "C:\\Users\\u", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
			"win32",
		);
		expect(dirs[0]).toEqual({
			dir: "C:\\Users\\u\\AppData\\Local",
			source: "localappdata",
		});
		expect(dirs[1]).toEqual({
			dir: path.join("C:\\Users\\u", "bin"),
			source: "userprofile-bin",
		});
	});

	it("appends harness extras last", () => {
		const dirs = standardSearchDirs({ HOME: "/tmp/fake" }, "linux", [
			{ dir: "/tmp/fake/.opencode/bin", source: "opencode-bin" },
		]);
		expect(dirs.at(-1)).toEqual({
			dir: "/tmp/fake/.opencode/bin",
			source: "opencode-bin",
		});
	});
});

describe("resolveBinary", () => {
	it("honors an absolute env override verbatim when executable", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, "opt"), "agy");
		const env = { PATH: "", HOME: root };
		expect(
			resolveBinary("agy", { envOverride: bin, env, platform: "linux" }),
		).toEqual({ found: true, path: bin, source: "env" });
	});

	it("reports not-found (keeping the override path) when the override is missing", () => {
		const root = makeRoot();
		const missing = path.join(root, "opt", "agy");
		const env = { PATH: "", HOME: root };
		expect(
			resolveBinary("agy", { envOverride: missing, env, platform: "linux" }),
		).toEqual({ found: false, path: missing, source: "not-found" });
	});

	it("searches a bare override name and reports source env", () => {
		const root = makeRoot();
		const pathDir = path.join(root, "pathdir");
		const bin = makeExecutable(pathDir, "agy-custom");
		const env = { PATH: pathDir, HOME: root };
		expect(
			resolveBinary("agy", {
				envOverride: "agy-custom",
				env,
				platform: "linux",
			}),
		).toEqual({ found: true, path: bin, source: "env" });
	});

	it("finds PATH binaries (PATH wins over standard dirs)", () => {
		const root = makeRoot();
		const pathDir = path.join(root, "pathdir");
		const pathBin = makeExecutable(pathDir, "agy");
		makeExecutable(path.join(root, ".local", "bin"), "agy");
		const env = { PATH: pathDir, HOME: root };
		expect(resolveBinary("agy", { env, platform: "linux" })).toEqual({
			found: true,
			path: pathBin,
			source: "path",
		});
	});

	it("finds ~/.local/bin binaries missing from PATH (the author's case)", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".local", "bin"), "muse");
		const env = { PATH: "/usr/bin:/bin", HOME: root };
		expect(resolveBinary("muse", { env, platform: "linux" })).toEqual({
			found: true,
			path: bin,
			source: "local-bin",
		});
	});

	it("finds ~/bin binaries", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, "bin"), "opencode");
		const env = { PATH: "", HOME: root };
		expect(resolveBinary("opencode", { env, platform: "linux" })).toEqual({
			found: true,
			path: bin,
			source: "home-bin",
		});
	});

	it("finds harness extra dirs (opencode's ~/.opencode/bin)", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".opencode", "bin"), "opencode");
		const env = { PATH: "", HOME: root };
		expect(
			resolveBinary("opencode", {
				extraDirs: [
					{ dir: path.join(root, ".opencode", "bin"), source: "opencode-bin" },
				],
				env,
				platform: "linux",
			}),
		).toEqual({ found: true, path: bin, source: "opencode-bin" });
	});

	it("ignores non-executable files on POSIX", () => {
		const root = makeRoot();
		const dir = path.join(root, ".local", "bin");
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "agy");
		fs.writeFileSync(file, "not executable");
		fs.chmodSync(file, 0o644);
		const env = { PATH: "", HOME: root };
		expect(resolveBinary("agy", { env, platform: "linux" })).toEqual({
			found: false,
			path: "agy",
			source: "not-found",
		});
	});

	it("resolves Windows PATHEXT matches via injected platform", () => {
		const root = makeRoot();
		const dir = path.join(root, "AppData", "Local");
		const bin = makeFile(path.join(dir, "agy.EXE"));
		const env = {
			PATH: "",
			LOCALAPPDATA: dir,
			USERPROFILE: root,
			PATHEXT: ".COM;.EXE;.BAT;.CMD",
		};
		expect(resolveBinary("agy", { env, platform: "win32" })).toEqual({
			found: true,
			path: bin,
			source: "localappdata",
		});
	});

	it("reports not-found with the input name when nothing matches", () => {
		const root = makeRoot();
		const env = { PATH: "", HOME: root };
		expect(resolveBinary("definitely-absent", { env, platform: "linux" })).toEqual(
			{ found: false, path: "definitely-absent", source: "not-found" },
		);
	});
});

describe("resolveSpawnBinary", () => {
	it("returns absolute paths verbatim (never rewritten)", () => {
		expect(resolveSpawnBinary("/opt/agy")).toBe("/opt/agy");
		expect(
			resolveSpawnBinary("/definitely/not/a/real/agy-binary"),
		).toBe("/definitely/not/a/real/agy-binary");
	});

	it("returns PATH hits verbatim (spawned through PATH exactly as today)", () => {
		const root = makeRoot();
		const pathDir = path.join(root, "pathdir");
		makeExecutable(pathDir, "agy");
		const env = { PATH: pathDir, HOME: root };
		expect(resolveSpawnBinary("agy", { env, platform: "linux" })).toBe("agy");
	});

	it("resolves off-PATH standard-dir hits to absolute paths (previously ENOENT)", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".local", "bin"), "muse");
		const env = { PATH: "", HOME: root };
		expect(resolveSpawnBinary("muse", { env, platform: "linux" })).toBe(bin);
	});

	it("returns missing names verbatim (downstream ENOENT classification unchanged)", () => {
		const root = makeRoot();
		const env = { PATH: "", HOME: root };
		expect(resolveSpawnBinary("nope", { env, platform: "linux" })).toBe("nope");
	});
});

describe("binaryAvailable", () => {
	it("checks absolute paths directly and bare names via resolution", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".local", "bin"), "agy");
		const env = { PATH: "", HOME: root };
		expect(binaryAvailable(bin, { env, platform: "linux" })).toBe(true);
		expect(
			binaryAvailable(path.join(root, ".local", "bin", "missing"), {
				env,
				platform: "linux",
			}),
		).toBe(false);
		expect(binaryAvailable("agy", { env, platform: "linux" })).toBe(true);
		expect(binaryAvailable("nope", { env, platform: "linux" })).toBe(false);
		expect(binaryAvailable("", { env, platform: "linux" })).toBe(false);
	});
});

describe("credential/snapshot path helpers", () => {
	it("derives the pi snapshot path from PI_AGENT_DIR or ~/.pi/agent", () => {
		expect(piSnapshotPath({ PI_AGENT_DIR: "/tmp/pi" }, "linux")).toBe(
			path.join("/tmp/pi", "models.json"),
		);
		expect(piSnapshotPath({ HOME: "/tmp/fake" }, "linux")).toBe(
			path.join("/tmp/fake", ".pi", "agent", "models.json"),
		);
	});

	it("derives the muse auth path from MUSE_CONFIG_DIR or ~/.config/muse", () => {
		expect(museAuthPath({ MUSE_CONFIG_DIR: "/tmp/mc" }, "linux")).toBe(
			path.join("/tmp/mc", "auth.json"),
		);
		expect(museAuthPath({ HOME: "/tmp/fake" }, "linux")).toBe(
			path.join("/tmp/fake", ".config", "muse", "auth.json"),
		);
	});

	it("derives the vibe login-cache path from VIBE_HOME or ~/.vibe", () => {
		expect(vibeAuthPath({ VIBE_HOME: "/tmp/vh" }, "linux")).toBe(
			path.join("/tmp/vh", "whoami_cache.json"),
		);
		expect(vibeAuthPath({ HOME: "/tmp/fake" }, "linux")).toBe(
			path.join("/tmp/fake", ".vibe", "whoami_cache.json"),
		);
	});

	it("derives the agy oauth-token path under ~/.gemini", () => {
		expect(agyAuthPath({ HOME: "/tmp/fake" }, "linux")).toBe(
			path.join(
				"/tmp/fake",
				".gemini",
				"antigravity-cli",
				"antigravity-oauth-token",
			),
		);
	});
});

describe("discoverHarnesses", () => {
	function fakeEnv(root, overrides = {}) {
		return { PATH: "", HOME: root, ...overrides };
	}

	function byId(entries) {
		return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
	}

	it("covers every harness id in stable order", () => {
		const root = makeRoot();
		const entries = discoverHarnesses({
			env: fakeEnv(root),
			platform: "linux",
			ttlMs: 60000,
		});
		expect(entries.map((entry) => entry.id)).toEqual([...HARNESS_IDS]);
	});

	it("reports pi available when the snapshot exists, unknown when missing", () => {
		const root = makeRoot();
		const snapshot = path.join(root, ".pi", "agent", "models.json");
		makeFile(snapshot);
		let entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.pi.available).toBe(true);
		expect(entries.pi.detectionSource).toBe("pi-snapshot");
		expect(entries.pi.hint).toBeUndefined();

		clearDiscoveryCache();
		fs.rmSync(snapshot);
		entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.pi.available).toBeNull();
		expect(entries.pi.detectionSource).toBe("unknown");
		expect(entries.pi.hint).toMatch(/PI_AGENT_DIR/);
	});

	it("detects CLI harnesses in ~/.local/bin with binPath + auth state", () => {
		const root = makeRoot();
		const agyBin = makeExecutable(path.join(root, ".local", "bin"), "agy");
		makeExecutable(path.join(root, ".local", "bin"), "muse");
		makeFile(
			path.join(
				root,
				".gemini",
				"antigravity-cli",
				"antigravity-oauth-token",
			),
		);
		// No muse auth.json in this fake HOME.
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.antigravity).toMatchObject({
			available: true,
			detectionSource: "local-bin",
			binPath: agyBin,
			authConfigured: true,
		});
		expect(entries.muse).toMatchObject({
			available: true,
			detectionSource: "local-bin",
			authConfigured: false,
		});
		expect(entries.antigravity.hint).toBeUndefined();
	});

	it("reports CLI harnesses missing with install hints when nothing resolves", () => {
		const root = makeRoot();
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.antigravity.available).toBe(false);
		expect(entries.antigravity.detectionSource).toBe("not-found");
		expect(entries.antigravity.hint).toMatch(/KAINBAIN_AGY_BIN/);
		expect(entries.antigravity.binPath).toBeUndefined();
		expect(entries.muse.available).toBe(false);
		expect(entries.muse.hint).toMatch(/KAINBAIN_MUSE_BIN/);
		expect(entries.opencode.available).toBe(false);
		expect(entries.opencode.hint).toMatch(/OPENCODE_URL/);
		expect(entries.vibe.available).toBe(false);
		expect(entries.vibe.detectionSource).toBe("not-found");
		expect(entries.vibe.hint).toMatch(/KAINBAIN_VIBE_BIN/);
		expect(entries.vibe.binPath).toBeUndefined();
	});

	it("detects the vibe CLI in ~/.local/bin with login-cache auth state", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".local", "bin"), "vibe");
		makeFile(path.join(root, ".vibe", "whoami_cache.json"));
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.vibe).toMatchObject({
			available: true,
			detectionSource: "local-bin",
			binPath: bin,
			authConfigured: true,
		});
		expect(entries.vibe.hint).toBeUndefined();
	});

	it("reports vibe present but logged out when the login cache is absent", () => {
		const root = makeRoot();
		makeExecutable(path.join(root, ".local", "bin"), "vibe");
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.vibe.available).toBe(true);
		expect(entries.vibe.authConfigured).toBe(false);
	});

	it("honors KAINBAIN_*_BIN overrides in discovery", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, "opt"), "agy");
		const entries = byId(
			discoverHarnesses({
				env: fakeEnv(root, { KAINBAIN_AGY_BIN: bin }),
				platform: "linux",
				ttlMs: 60000,
			}),
		);
		expect(entries.antigravity).toMatchObject({
			available: true,
			detectionSource: "env",
			binPath: bin,
		});
	});

	it("treats OPENCODE_URL as available-without-binary (connect mode)", () => {
		const root = makeRoot();
		const entries = byId(
			discoverHarnesses({
				env: fakeEnv(root, { OPENCODE_URL: "http://127.0.0.1:4096" }),
				platform: "linux",
				ttlMs: 60000,
			}),
		);
		expect(entries.opencode.available).toBe(true);
		expect(entries.opencode.detectionSource).toBe("env");
		expect(entries.opencode.binPath).toBeUndefined();
	});

	it("finds the opencode binary in ~/.opencode/bin", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, ".opencode", "bin"), "opencode");
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.opencode).toMatchObject({
			available: true,
			detectionSource: "opencode-bin",
			binPath: bin,
		});
	});

	it("reports custom + mock always available (by definition)", () => {
		const root = makeRoot();
		const entries = byId(
			discoverHarnesses({ env: fakeEnv(root), platform: "linux", ttlMs: 60000 }),
		);
		expect(entries.custom).toMatchObject({
			available: true,
			detectionSource: "builtin",
		});
		expect(entries.mock).toMatchObject({
			available: true,
			detectionSource: "builtin",
		});
	});

	it("caches within the TTL, re-probes on refresh, and clears on demand", () => {
		const root = makeRoot();
		const opts = { env: fakeEnv(root), platform: "linux", ttlMs: 60000 };
		const first = discoverHarnesses(opts);
		expect(discoverHarnesses(opts)).toBe(first); // cached identity

		// A binary appears after the first probe: cached payload is stale.
		makeExecutable(path.join(root, ".local", "bin"), "agy");
		expect(byId(discoverHarnesses(opts)).antigravity.available).toBe(false);

		// Refresh bypasses the cache and repopulates it.
		const refreshed = discoverHarnesses({ ...opts, refresh: true });
		expect(byId(refreshed).antigravity.available).toBe(true);
		expect(discoverHarnesses(opts)).toBe(refreshed);

		clearDiscoveryCache();
		expect(discoverHarnesses(opts)).not.toBe(refreshed);
	});
});
