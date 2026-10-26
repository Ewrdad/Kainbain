import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearDiscoveryCache } from "../../harnessDiscovery.js";
import { createOpencodeHarness } from "./OpencodeHarness.js";

/***
 * MARK: opencodeDiscoveryStatus sibling tests
 * @description Covers the opencode harness's `getModelDiscoveryStatus()`:
 *   connect mode (OPENCODE_URL or factory baseUrl) is healthy without a
 *   binary, a resolvable binary (PATH, ~/.opencode/bin, KAINBAIN_OPENCODE_BIN)
 *   is healthy, and neither yields OPENCODE_UNAVAILABLE with a fix hint.
 *   Hermetic: fake HOME/PATH via vi.stubEnv + temp dirs; the discovery cache
 *   is cleared around every case so stubbed env is always re-probed.
 ***/

const tmpRoots = [];
afterEach(() => {
	vi.unstubAllEnvs();
	clearDiscoveryCache();
	while (tmpRoots.length > 0) {
		fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-discovery-"));
	tmpRoots.push(root);
	return root;
}

function isolateEnv(root, overrides = {}) {
	clearDiscoveryCache();
	vi.stubEnv("HOME", root);
	vi.stubEnv("PATH", "");
	vi.stubEnv("OPENCODE_URL", "");
	vi.stubEnv("KAINBAIN_OPENCODE_BIN", "");
	for (const [key, value] of Object.entries(overrides)) {
		vi.stubEnv(key, value);
	}
}

function makeScript(file) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, "#!/bin/sh\nexit 0\n");
	fs.chmodSync(file, 0o755);
	return file;
}

describe("opencode getModelDiscoveryStatus", () => {
	it("reports ok in connect mode (OPENCODE_URL set, no binary needed)", () => {
		const root = makeRoot();
		isolateEnv(root, { OPENCODE_URL: "http://127.0.0.1:4096" });
		expect(createOpencodeHarness().getModelDiscoveryStatus()).toEqual({
			ok: true,
		});
	});

	it("reports ok for an explicit factory baseUrl (connect mode)", () => {
		const root = makeRoot();
		isolateEnv(root);
		expect(
			createOpencodeHarness({
				baseUrl: "http://127.0.0.1:4096",
			}).getModelDiscoveryStatus(),
		).toEqual({ ok: true });
	});

	it("reports ok when the binary resolves from ~/.opencode/bin", () => {
		const root = makeRoot();
		makeScript(path.join(root, ".opencode", "bin", "opencode"));
		isolateEnv(root);
		expect(createOpencodeHarness().getModelDiscoveryStatus()).toEqual({
			ok: true,
		});
	});

	it("reports ok for a KAINBAIN_OPENCODE_BIN override", () => {
		const root = makeRoot();
		const bin = makeScript(path.join(root, "opt", "opencode"));
		isolateEnv(root, { KAINBAIN_OPENCODE_BIN: bin });
		expect(createOpencodeHarness().getModelDiscoveryStatus()).toEqual({
			ok: true,
		});
	});

	it("reports OPENCODE_UNAVAILABLE with a fix hint when neither exists", () => {
		const root = makeRoot();
		isolateEnv(root);
		expect(createOpencodeHarness().getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: {
				code: "OPENCODE_UNAVAILABLE",
				message: expect.stringContaining("No OpenCode server"),
				hint: expect.stringContaining("OPENCODE_URL"),
			},
		});
	});
});
