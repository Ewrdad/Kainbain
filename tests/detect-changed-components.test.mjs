import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { detectFromFiles, parseOverride } = await import(
	"../scripts/detect-changed-components.mjs"
);

describe("detectFromFiles", () => {
	it("maps the WP-A3 fixture paths to exactly the named components", () => {
		assert.deepEqual(detectFromFiles(["frontend/src/app.css"]).components, ["frontend"]);
		assert.deepEqual(detectFromFiles(["runner/daemon.js"]).components, ["runner"]);
		assert.deepEqual(detectFromFiles(["api/agent/harnesses/pi/index.js"]).components, ["backend", "runner"]);
		assert.deepEqual(detectFromFiles(["shared/modelAliases.js"]).components, ["backend", "frontend", "runner"]);
		assert.deepEqual(detectFromFiles(["docs/guide.md"]).components, []);
		assert.deepEqual(detectFromFiles(["some/new/tool.xyz"]).components, ["backend", "frontend", "runner"]);
	});

	it("records reasons per component", () => {
		const r = detectFromFiles(["api/routes/status.js"]);
		assert.deepEqual(r.reasons.backend, ["api/routes/status.js"]);
		assert.deepEqual(r.components, ["backend"]);
	});

	it("release machinery flags all three; version files flag their owner", () => {
		assert.deepEqual(detectFromFiles(["publish.sh"]).components, ["backend", "frontend", "runner"]);
		assert.deepEqual(detectFromFiles(["api/version.json"]).components, ["backend"]);
		assert.deepEqual(detectFromFiles(["frontend/version.json"]).components, ["frontend"]);
		assert.deepEqual(detectFromFiles(["runner/version.json"]).components, ["runner"]);
	});
});

describe("override", () => {
	it("parses all/none/csv", () => {
		assert.deepEqual(parseOverride("all"), ["backend", "frontend", "runner"]);
		assert.deepEqual(parseOverride("none"), []);
		assert.deepEqual(parseOverride("backend,runner"), ["backend", "runner"]);
		assert.equal(parseOverride(""), null);
	});

	it("env override wins over --files in the CLI", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-"));
		const list = path.join(dir, "files.txt");
		fs.writeFileSync(list, "frontend/src/app.css\n");
		const r = spawnSync("node", ["scripts/detect-changed-components.mjs", "--files", list, "--json"], {
			cwd: ROOT,
			encoding: "utf8",
			env: { ...process.env, KAINBAIN_PUBLISH_COMPONENTS: "backend,runner" },
		});
		assert.equal(r.status, 0);
		assert.match(r.stderr, /override:/);
		assert.deepEqual(JSON.parse(r.stdout).components, ["backend", "runner"]);
	});
});
