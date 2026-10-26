import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAntigravityHarness } from "./agyHarness.js";
import { createAgyModelCatalog } from "./agyModelCatalog.js";

/***
 * MARK: agySpawnResolution sibling tests
 * @description Proves bare `agy` names resolve through PATH + standard install
 *   dirs (`~/.local/bin`) for both stage spawns (settings.bin) and model
 *   discovery (the catalog actually executes the resolved off-PATH binary),
 *   while explicit paths pass through verbatim. Hermetic: fake HOME/PATH via
 *   vi.stubEnv, fixture binaries under temp dirs.
 ***/

const tmpRoots = [];
afterEach(() => {
	vi.unstubAllEnvs();
	while (tmpRoots.length > 0) {
		fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
	}
});

function makeRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-spawn-resolve-"));
	tmpRoots.push(root);
	return root;
}

function makeScript(file, body) {
	// eslint-disable-next-line security/detect-non-literal-fs-filename -- hermetic test fixture in mkdtemp
	fs.mkdirSync(path.dirname(file), { recursive: true });
	// eslint-disable-next-line security/detect-non-literal-fs-filename -- hermetic test fixture in mkdtemp
	fs.writeFileSync(file, body);
	// eslint-disable-next-line security/detect-non-literal-fs-filename -- hermetic test fixture in mkdtemp
	fs.chmodSync(file, 0o755);
	return file;
}

describe("agy spawn binary resolution", () => {
	it("passes explicit absolute paths through verbatim", () => {
		const harness = createAntigravityHarness({
			agyBin: "/definitely/not/a/real/agy-binary",
		});
		expect(harness.settings.bin).toBe("/definitely/not/a/real/agy-binary");
	});

	it("resolves bare names from ~/.local/bin missing from PATH", () => {
		const root = makeRoot();
		const bin = makeScript(
			path.join(root, ".local", "bin", "agy-custom"),
			"#!/bin/sh\nexit 0\n",
		);
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createAntigravityHarness({ agyBin: "agy-custom" });
		expect(harness.settings.bin).toBe(bin);
	});

	it("keeps missing bare names verbatim (ENOENT classification unchanged)", () => {
		const root = makeRoot();
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const harness = createAntigravityHarness({ agyBin: "agy-absent" });
		expect(harness.settings.bin).toBe("agy-absent");
	});

	it("executes the resolved off-PATH binary for model discovery", async () => {
		const root = makeRoot();
		makeScript(
			path.join(root, ".local", "bin", "agy-custom"),
			'#!/bin/sh\necho "gemini-9-test-model"\n',
		);
		vi.stubEnv("HOME", root);
		vi.stubEnv("PATH", "");
		const catalog = createAgyModelCatalog({ agyBin: "agy-custom" });
		const models = await catalog.listAgyModels();
		expect(models.map((m) => m.id)).toEqual(["gemini-9-test-model"]);
		expect(catalog.getModelDiscoveryStatus()).toEqual({ ok: true });
	}, 20000);
});
