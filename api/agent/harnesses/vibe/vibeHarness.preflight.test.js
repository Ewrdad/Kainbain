import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createVibeHarness,
	clearVibeCapabilityCache,
	VIBE_REQUIRED_CLI_FLAGS,
} from "./vibeHarness.js";

/***
 * MARK: vibe preflight capability tests
 * @description Proves the harness detects a flag-incompatible Vibe CLI at
 *   health/discovery time instead of per-run. Historically (Vibe 2.26)
 *   two CLIs shipped behind one launcher: the classic Python CLI accepts
 *   the harness-owned `--output-dir`/`--time-limit`/`--prompt-file`,
 *   the Rust TUI rejects them (`clap` exit 2). On Vibe 3.0 the unified
 *   Rust TUI accepts them; the incompatible case survives only as a
 *   legacy regression fixture. The `--help` preflight must:
 *   - report `VIBE_CLI_INCOMPATIBLE` when the effective CLI lacks them;
 *   - run under the SAME `VIBE_CLI` pin the harness spawns with;
 *   - stay inconclusive (never a false failure) when `--help` is unavailable;
 *   - keep `VIBE_BIN_MISSING` for a missing binary.
 *
 *   Hermetic + no inference: fixture shell scripts and the deterministic
 *   fixtures/mock-vibe.mjs; the captured ground-truth help lives in
 *   fixtures/help.python.txt and fixtures/help.rust.txt.
 */

const VIBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_VIBE = path.join(VIBE_DIR, "fixtures", "mock-vibe.mjs");
const HELP_PYTHON = path.join(VIBE_DIR, "fixtures", "help.python.txt");
const HELP_RUST = path.join(VIBE_DIR, "fixtures", "help.rust.txt");
const HELP_RUST_LEGACY = path.join(VIBE_DIR, "fixtures", "help.rust-pre3.txt");

const tmpRoots = [];
afterEach(() => {
	vi.unstubAllEnvs();
	delete process.env.VIBE_MOCK_CLI;
	delete process.env.VIBE_CLI;
	clearVibeCapabilityCache();
	while (tmpRoots.length > 0) {
		fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-preflight-"));
	tmpRoots.push(root);
	return root;
}

/** A fixture CLI that answers `--version` and cats a captured `--help`,
 *  appending one line per `--help` invocation to an optional spawn log so a
 *  test can prove the capability probe is cached. */
function makeHelpFixture(helpFile, spawnLog = null) {
	const script = path.join(makeRoot(), "vibe-fixture");
	const logLine = spawnLog
		? `echo help >> ${JSON.stringify(spawnLog)}\n`
		: "";
	fs.writeFileSync(
		script,
		"#!/bin/sh\n" +
			'if [ "$1" = "--version" ]; then echo "vibe 3.0.2 (fixture)"; exit 0; fi\n' +
			`if [ "$1" = "--help" ]; then ${logLine}cat ${JSON.stringify(helpFile)}; exit 0; fi\n` +
			"exit 1\n",
	);
	fs.chmodSync(script, 0o755);
	return script;
}

describe("vibe CLI capability preflight", () => {
	it("reports VIBE_CLI_INCOMPATIBLE for a CLI that rejects the harness-owned flags (legacy 2.x Rust TUI)", async () => {
		const harness = createVibeHarness({
			vibeBin: makeHelpFixture(HELP_RUST_LEGACY),
			cli: "auto",
		});
		const status = await harness.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("VIBE_CLI_INCOMPATIBLE");
		for (const flag of VIBE_REQUIRED_CLI_FLAGS) {
			expect(status.error.message).toContain(flag);
		}
		expect(status.error.hint).toContain("KAINBAIN_VIBE_CLI=python");
	});

	it("reports ok for a CLI that advertises the harness-owned flags", async () => {
		const harness = createVibeHarness({
			vibeBin: makeHelpFixture(HELP_PYTHON),
			cli: "python",
		});
		expect(await harness.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("reports ok for the 3.0 Rust TUI that advertises the harness-owned flags", async () => {
		const harness = createVibeHarness({
			vibeBin: makeHelpFixture(HELP_RUST),
			cli: "auto",
		});
		expect(await harness.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("reports the 3.0 Rust TUI as compatible under the auto and python pins (3.0 unified CLI)", async () => {
		vi.stubEnv("VIBE_MOCK_CLI", "rust");
		const unpinned = createVibeHarness({ vibeBin: MOCK_VIBE, cli: "auto" });
		expect(await unpinned.getModelDiscoveryStatus()).toEqual({ ok: true });

		const pinned = createVibeHarness({ vibeBin: MOCK_VIBE, cli: "python" });
		expect(await pinned.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("caches a conclusive probe (second call does not re-spawn)", async () => {
		const spawnLog = path.join(makeRoot(), "help-spawns.log");
		const harness = createVibeHarness({
			vibeBin: makeHelpFixture(HELP_RUST_LEGACY, spawnLog),
			cli: "auto",
		});
		const first = await harness.getModelDiscoveryStatus();
		expect(first.ok).toBe(false);
		const second = await harness.getModelDiscoveryStatus();
		expect(second.error.code).toBe("VIBE_CLI_INCOMPATIBLE");
		// Exactly one `--help` spawn across both calls: the conclusive result
		// was cached, never re-probed on the discovery hot path.
		const spawns = fs.readFileSync(spawnLog, "utf8").trim().split("\n");
		expect(spawns).toHaveLength(1);
	});

	it("stays inconclusive (ok) when --help produces nothing usable", async () => {
		const script = path.join(makeRoot(), "vibe-no-help");
		fs.writeFileSync(
			script,
			'#!/bin/sh\nif [ "$1" = "--version" ]; then echo "vibe 3.0.2"; exit 0; fi\nexit 0\n',
		);
		fs.chmodSync(script, 0o755);
		const harness = createVibeHarness({ vibeBin: script, cli: "python" });
		expect(await harness.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("keeps VIBE_BIN_MISSING unchanged", async () => {
		const harness = createVibeHarness({
			vibeBin: "/definitely/not/a/real/vibe-binary",
		});
		const status = await harness.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("VIBE_BIN_MISSING");
	});

	it("reports the incompatibility through probeHealth too", async () => {
		const harness = createVibeHarness({
			vibeBin: makeHelpFixture(HELP_RUST_LEGACY),
			cli: "auto",
		});
		const health = await harness.probeHealth();
		expect(health.status).toBe("error");
		expect(health.code).toBe("VIBE_CLI_INCOMPATIBLE");
		expect(health.message).toContain("--output-dir");
	});
});
