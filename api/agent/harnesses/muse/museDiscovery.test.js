import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMuseHarness } from "./museHarness.js";

/***
 * MARK: museDiscovery sibling tests
 * @description Covers the muse harness's discovery surface: `settings.bin`
 *   spawn resolution (explicit paths verbatim, bare names via PATH +
 *   standard dirs) and `getModelDiscoveryStatus()` ({ ok: true } when the
 *   binary resolves, MUSE_BIN_MISSING otherwise). Hermetic: fake HOME/PATH
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
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "muse-discovery-"));
	tmpRoots.push(root);
	return root;
}

function makeScript(file) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, "#!/bin/sh\nexit 0\n");
	fs.chmodSync(file, 0o755);
	return file;
}

describe("muse spawn binary resolution", () => {
	it("passes explicit absolute paths through verbatim", () => {
		const harness = createMuseHarness({
			museBin: "/definitely/not/a/real/muse-binary",
		});
		expect(harness.settings.bin).toBe("/definitely/not/a/real/muse-binary");
	});

	it("resolves bare names from ~/.local/bin missing from PATH", () => {
		const root = makeRoot();
		const bin = makeScript(path.join(root, ".local", "bin", "muse-custom"));
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createMuseHarness({ museBin: "muse-custom" });
		expect(harness.settings.bin).toBe(bin);
	});

	it("keeps missing bare names verbatim", () => {
		const root = makeRoot();
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createMuseHarness({ museBin: "muse-absent" });
		expect(harness.settings.bin).toBe("muse-absent");
	});
});

describe("muse getModelDiscoveryStatus", () => {
	it("reports ok when the binary resolves", () => {
		const root = makeRoot();
		const bin = makeScript(path.join(root, "opt", "muse"));
		const harness = createMuseHarness({ museBin: bin });
		expect(harness.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("reports MUSE_BIN_MISSING with a fix hint when the binary is absent", () => {
		const root = makeRoot();
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createMuseHarness({ museBin: "muse-absent" });
		expect(harness.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: {
				code: "MUSE_BIN_MISSING",
				message: expect.stringContaining("muse-absent"),
				hint: expect.stringContaining("KAINBAIN_MUSE_BIN"),
			},
		});
	});
});
