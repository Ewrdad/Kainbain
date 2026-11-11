import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { detectFromFiles, parseOverride, detectAdsiteSync, adsiteForPath } = await import(
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

	it("ad-site-only paths flag no image components (the S3 sync ships them)", () => {
		for (const f of [
			"kainbain-addsite/Kainbain-adsite",
			"kainbain-addsite/Kainbain-adsite/src/App.tsx",
			"deploy/install.sh",
			"deploy/install-runner.sh",
			"deploy/update.sh",
			"deploy/redeploy.sh",
			"scripts/sync-adsite.sh",
		]) {
			assert.deepEqual(detectFromFiles([f]).components, [], f);
		}
		// ...while the surrounding contracts hold: unknown paths still fail
		// safe, true release machinery still flags all three.
		assert.deepEqual(detectFromFiles(["some/new/tool.xyz"]).components, ["backend", "frontend", "runner"]);
		assert.deepEqual(detectFromFiles(["deploy.sh"]).components, ["backend", "frontend", "runner"]);
		assert.deepEqual(detectFromFiles(["deploy/homelab-pull.sh"]).components, ["backend", "frontend", "runner"]);
	});
});

describe("detectAdsiteSync", () => {
	it("fires for ad-site paths and stays quiet otherwise", () => {
		assert.equal(adsiteForPath("kainbain-addsite/Kainbain-adsite"), true);
		assert.equal(adsiteForPath("deploy/install-runner.sh"), true);
		assert.equal(adsiteForPath("api/routes/status.js"), false);
		assert.deepEqual(detectAdsiteSync(["deploy/install-runner.sh", "api/routes/status.js"]).reasons, [
			"deploy/install-runner.sh",
		]);
		assert.equal(detectAdsiteSync(["api/routes/status.js"]).sync, false);
		assert.equal(detectAdsiteSync([]).sync, false);
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
