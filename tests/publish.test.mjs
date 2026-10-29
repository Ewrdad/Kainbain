import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (args, env = {}) =>
	spawnSync("./publish.sh", args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

describe("publish.sh", () => {
	it("dry-run --all prints the full command plan and exits 0", () => {
		const r = run(["--dry-run", "--all"], { KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe" });
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /would run: docker build -f Dockerfile/);
		assert.match(r.stdout, /would run: docker push docker\.io\/dryrun-probe\/kainbain-backend:/);
		assert.match(r.stdout, /would run: docker push docker\.io\/dryrun-probe\/kainbain-frontend:/);
		assert.match(r.stdout, /would run: bash scripts\/package-runner\.sh/);
		assert.match(r.stdout, /dry-run: nothing built, pushed, or written/);
	});

	it("fails closed with exit 2 naming the namespace variable when unset", () => {
		const env = { ...process.env };
		delete env.KAINBAIN_DOCKERHUB_NAMESPACE;
		const r = spawnSync("./publish.sh", ["--dry-run", "--frontend"], { cwd: ROOT, encoding: "utf8", env });
		assert.equal(r.status, 2);
		assert.match(r.stderr, /KAINBAIN_DOCKERHUB_NAMESPACE/);
	});

	it("rejects unknown arguments with exit 2", () => {
		assert.equal(run(["--bogus"], { KAINBAIN_DOCKERHUB_NAMESPACE: "x" }).status, 2);
	});
});
