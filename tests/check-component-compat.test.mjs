import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { checkCompatibility, versionsFromManifest } = await import(
	"../scripts/check-component-compat.mjs"
);

const base = () => ({
	backend: { component: "backend", apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0", runner: ">=1.0.0 <2.0.0" } },
	frontend: { component: "frontend", apiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } },
	runner: { component: "runner", apiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } },
});

describe("checkCompatibility", () => {
	it("passes the shipped 1.0.0 files with four OK pairs", () => {
		const r = checkCompatibility(base());
		assert.equal(r.ok, true);
		assert.equal(r.lines.length, 4);
		assert.match(r.lines[0], /^OK frontend->backend: backend 1\.0\.0 satisfies /);
	});

	it("fails a 2.0.0 backend against <2.0.0 ranges with the exact message shape", () => {
		const v = base();
		v.backend.apiVersion = "2.0.0";
		const r = checkCompatibility(v);
		assert.equal(r.ok, false);
		assert.ok(r.failures.some((f) => f === "INCOMPATIBLE frontend->backend: backend 2.0.0 does not satisfy >=1.0.0 <2.0.0"));
		assert.ok(r.failures.some((f) => f.startsWith("INCOMPATIBLE runner->backend:")));
	});

	it("fails a non-semver apiVersion naming the component", () => {
		const v = base();
		v.runner.apiVersion = "v1";
		const r = checkCompatibility(v);
		assert.equal(r.ok, false);
		assert.ok(r.failures.some((f) => f.includes("runner") && f.includes('"v1"')));
	});

	it("checks a recorded manifest the same way", () => {
		const manifest = {
			components: {
				backend: { apiVersion: "1.0.0" },
				frontend: { apiVersion: "1.0.0", requiresBackendApi: ">=1.0.0 <2.0.0" },
				runner: { apiVersion: "1.0.0", requiresBackendApi: ">=1.0.0 <2.0.0" },
			},
		};
		assert.equal(checkCompatibility(versionsFromManifest(manifest), { manifestMode: true }).ok, true);
		manifest.components.backend.apiVersion = "2.0.0";
		const bad = checkCompatibility(versionsFromManifest(manifest), { manifestMode: true });
		assert.equal(bad.ok, false);
		assert.ok(bad.failures.some((f) => f.startsWith("INCOMPATIBLE frontend->backend: backend 2.0.0")));
	});
});

describe("check-component-compat CLI", () => {
	it("exits 0 on the shipped tree and 1 on a bumped backend", () => {
		const ok = spawnSync("node", ["scripts/check-component-compat.mjs"], { cwd: ROOT, encoding: "utf8" });
		assert.equal(ok.status, 0, ok.stderr);
		assert.match(ok.stdout, /OK frontend->backend/);

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compat-"));
		for (const c of ["api", "frontend", "runner"]) {
			fs.mkdirSync(path.join(dir, c), { recursive: true });
			fs.copyFileSync(path.join(ROOT, c, "version.json"), path.join(dir, c, "version.json"));
		}
		const bumped = JSON.parse(fs.readFileSync(path.join(dir, "api", "version.json"), "utf8"));
		bumped.apiVersion = "2.0.0";
		fs.writeFileSync(path.join(dir, "api", "version.json"), JSON.stringify(bumped));
		const bad = spawnSync("node", ["scripts/check-component-compat.mjs", "--versions-dir", dir], { cwd: ROOT, encoding: "utf8" });
		assert.equal(bad.status, 1);
		assert.match(bad.stderr + bad.stdout, /INCOMPATIBLE/);
	});
});
