import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("deploy/redeploy.sh (shim-driven)", () => {
	it("passes the fake docker/curl shim suite", () => {
		const r = spawnSync("bash", ["deploy/redeploy.test.sh"], { cwd: ROOT, encoding: "utf8" });
		assert.equal(r.status, 0, r.stdout + r.stderr);
		assert.match(r.stdout, /redeploy\.test\.sh: ALL PASS/);
	});
});
