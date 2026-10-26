/**
 * @fileoverview Hermetic tests for Codex binary discovery.
 *   Every case injects a fake `{ env, platform }` plus temp-dir fixtures —
 *   the real HOME/PATH is never touched, so the suite proves the
 *   unavailable-until-detected badge (survey q10) on any box.
 */

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DISCOVERY_BINARIES,
	DISCOVERY_ENV_VARS,
	clearDiscoveryCache,
	codexAuthPath,
	discoverHarnesses,
	resolveBinary,
} from "../../harnessDiscovery.js";

const tmpRoots = [];
afterEach(() => {
	clearDiscoveryCache();
	while (tmpRoots.length > 0) {
		const root = tmpRoots.pop();
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-discovery-"));
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

/** A fake env whose PATH/HOME point only at temp dirs (never the real box). */
function fakeEnv(root, { pathDir = null, extra = {} } = {}) {
	return {
		HOME: path.join(root, "home"),
		PATH: pathDir || path.join(root, "bin"),
		...extra,
	};
}

describe("codexDiscovery", () => {
	it("registers the codex binary name and env override", () => {
		expect(DISCOVERY_BINARIES.codex).toBe("codex");
		expect(DISCOVERY_ENV_VARS.codex).toBe("KAINBAIN_CODEX_BIN");
	});

	it("finds codex on PATH via a fixture executable", () => {
		const root = makeRoot();
		const binDir = path.join(root, "bin");
		const bin = makeExecutable(binDir, "codex");
		const env = fakeEnv(root, { pathDir: binDir });

		expect(resolveBinary("codex", { env, platform: "linux" })).toEqual({
			found: true,
			path: bin,
			source: "path",
		});
	});

	it("reports not-found (never throws) when codex is absent", () => {
		const root = makeRoot();
		const env = fakeEnv(root);

		expect(resolveBinary("codex", { env, platform: "linux" })).toEqual({
			found: false,
			path: "codex",
			source: "not-found",
		});
	});

	it("honours an absolute KAINBAIN_CODEX_BIN override that exists", () => {
		const root = makeRoot();
		const bin = makeExecutable(path.join(root, "custom"), "codex");
		const env = fakeEnv(root, { extra: { KAINBAIN_CODEX_BIN: bin } });

		expect(
			resolveBinary("codex", {
				envOverride: env.KAINBAIN_CODEX_BIN,
				env,
				platform: "linux",
			}),
		).toEqual({ found: true, path: bin, source: "env" });
	});

	it("reports not-found for an override pointing at nothing (fail-safe)", () => {
		const root = makeRoot();
		const missing = path.join(root, "nope", "codex");
		const env = fakeEnv(root, { extra: { KAINBAIN_CODEX_BIN: missing } });

		expect(
			resolveBinary("codex", {
				envOverride: env.KAINBAIN_CODEX_BIN,
				env,
				platform: "linux",
			}),
		).toEqual({ found: false, path: missing, source: "not-found" });
	});

	it("resolves Windows PATHEXT matches via injected platform", () => {
		const root = makeRoot();
		const binDir = path.join(root, "bin");
		fs.mkdirSync(binDir, { recursive: true });
		const winBin = path.join(binDir, "codex.EXE");
		fs.writeFileSync(winBin, "fixture");
		const env = {
			...fakeEnv(root, { pathDir: binDir }),
			PATHEXT: ".COM;.EXE;.BAT;.CMD",
		};

		const hit = resolveBinary("codex", { env, platform: "win32" });
		expect(hit.found).toBe(true);
		expect(hit.path).toBe(winBin);
	});

	it("discovers codex as unavailable with a setup hint when absent", () => {
		const root = makeRoot();
		const entries = discoverHarnesses({
			refresh: true,
			env: fakeEnv(root),
			platform: "linux",
		});
		const codex = entries.find((entry) => entry.id === "codex");
		expect(codex).toBeDefined();
		expect(codex.available).toBe(false);
		expect(codex.detectionSource).toBe("not-found");
		expect(codex.hint).toContain("KAINBAIN_CODEX_BIN");
		expect(codex.authConfigured).toBe(false);
	});

	it("discovers codex as available when the binary exists", () => {
		const root = makeRoot();
		const binDir = path.join(root, "bin");
		makeExecutable(binDir, "codex");
		const entries = discoverHarnesses({
			refresh: true,
			env: fakeEnv(root, { pathDir: binDir }),
			platform: "linux",
		});
		const codex = entries.find((entry) => entry.id === "codex");
		expect(codex.available).toBe(true);
		expect(codex.binPath).toContain("codex");
	});

	it("reads Codex-native auth from OPENAI_API_KEY presence only (never stored)", () => {
		const root = makeRoot();
		const binDir = path.join(root, "bin");
		makeExecutable(binDir, "codex");
		const withKey = discoverHarnesses({
			refresh: true,
			env: fakeEnv(root, { pathDir: binDir, extra: { OPENAI_API_KEY: "k" } }),
			platform: "linux",
		}).find((entry) => entry.id === "codex");
		expect(withKey.authConfigured).toBe(true);
	});

	it("probes the Codex login cache path without reading it", () => {
		expect(codexAuthPath({ HOME: "/tmp/fake" }, "linux")).toBe(
			path.join("/tmp/fake", ".codex", "auth.json"),
		);
		expect(codexAuthPath({ CODEX_HOME: "/tmp/cx" }, "linux")).toBe(
			path.join("/tmp/cx", "auth.json"),
		);
	});
});
