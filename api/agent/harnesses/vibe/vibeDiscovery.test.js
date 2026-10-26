import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVibeHarness } from "./vibeHarness.js";
import { getHarnessDiscoveryStatus } from "../../../models.js";

/***
 * MARK: vibeDiscovery sibling tests
 * @description Covers the vibe harness's discovery surface: `settings.bin`
 *   spawn resolution (explicit paths verbatim, bare names via PATH +
 *   standard dirs) and `getModelDiscoveryStatus()` ({ ok: true } when the
 *   binary resolves, VIBE_BIN_MISSING otherwise). Hermetic: fake HOME/PATH
 *   via vi.stubEnv, fixture binaries under temp dirs.
 ***/

const tmpRoots = [];
afterEach(() => {
	vi.unstubAllEnvs();
	while (tmpRoots.length > 0) {
		fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-discovery-"));
	tmpRoots.push(root);
	return root;
}

function makeScript(file) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, "#!/bin/sh\nexit 0\n");
	fs.chmodSync(file, 0o755);
	return file;
}

describe("vibe spawn binary resolution", () => {
	it("passes explicit absolute paths through verbatim", () => {
		const harness = createVibeHarness({
			vibeBin: "/definitely/not/a/real/vibe-binary",
		});
		expect(harness.settings.bin).toBe("/definitely/not/a/real/vibe-binary");
	});

	it("resolves bare names from ~/.local/bin missing from PATH", () => {
		const root = makeRoot();
		const bin = makeScript(path.join(root, ".local", "bin", "vibe-custom"));
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createVibeHarness({ vibeBin: "vibe-custom" });
		expect(harness.settings.bin).toBe(bin);
	});

	it("normalizes settings through the single resolution source (CSV strings become arrays)", () => {
		const harness = createVibeHarness({
			vibeBin: "/definitely/not/a/real/vibe-binary",
			enabledTools: "file_system.*, bash*",
			disabledTools: ["ask_user_question"],
		});
		expect(harness.settings.enabledTools).toEqual(["file_system.*", "bash*"]);
		expect(harness.settings.disabledTools).toEqual(["ask_user_question"]);
		expect(harness.settings.autoApprove).toBe(true);
	});

	it("reports discovery status from binary resolution", async () => {
		const root = makeRoot();
		const bin = makeScript(path.join(root, ".local", "bin", "vibe-custom"));
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const present = createVibeHarness({ vibeBin: "vibe-custom" });
		// The shell stub emits no `--help` text: the capability probe is
		// inconclusive (never reported as incompatible), so binary presence
		// still reads healthy.
		expect(await present.getModelDiscoveryStatus()).toEqual({ ok: true });
		const missing = createVibeHarness({
			vibeBin: "/definitely/not/a/real/vibe-binary",
		});
		const status = await missing.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("VIBE_BIN_MISSING");
	});

	it("projects a capability failure through getHarnessDiscoveryStatus (routes consult this)", async () => {
		const root = makeRoot();
		const script = path.join(root, "vibe-rust");
		fs.writeFileSync(
			script,
			"#!/bin/sh\n[ \"$1\" = \"--version\" ] && echo 'vibe 3.0.2 (fixture)' && exit 0\n" +
				"[ \"$1\" = \"--help\" ] && echo '--prompt --output --workdir --agent' && exit 0\n" +
				"exit 1\n",
		);
		fs.chmodSync(script, 0o755);
		const harness = createVibeHarness({ vibeBin: script, cli: "auto" });
		const reported = await getHarnessDiscoveryStatus(harness);
		expect(reported).toMatchObject({ code: "VIBE_CLI_INCOMPATIBLE" });
		expect(reported.hint).toContain("KAINBAIN_VIBE_CLI=python");
	});
});
