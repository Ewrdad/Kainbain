import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";

const { resolveDevPlan } = await import("../scripts/dev.mjs");

/***
 * MARK: dev tests
 * @description Hermetic tests for the dev entry point (scripts/dev.mjs):
 *   port resolution from the environment and the side-effect-free
 *   `--dry-run` plan. The supervised children are never spawned here (the
 *   real API's scheduler/reconcile would disturb the live app); child
 *   supervision itself is covered by tests/run-supervised.test.mjs.
 * @example run `node --test tests/dev.test.mjs`
 ***/

function dryRun(env = {}) {
	const script = path.resolve(import.meta.dirname, "..", "scripts", "dev.mjs");
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[script, "--dry-run"],
			{ env: { ...process.env, ...env }, windowsHide: true },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(`dry run failed: ${stderr || error.message}`));
				} else {
					resolve(stdout);
				}
			},
		);
	});
}

describe("resolveDevPlan", () => {
	it("defaults to API :3100 and frontend :5173", () => {
		const plan = resolveDevPlan({});
		assert.equal(plan.apiPort, 3100);
		assert.equal(plan.frontendPort, 5173);
	});

	it("honors PORT and VITE_PORT", () => {
		const plan = resolveDevPlan({ PORT: "3210", VITE_PORT: "5222" });
		assert.equal(plan.apiPort, 3210);
		assert.equal(plan.frontendPort, 5222);
		assert.deepEqual(plan.children[0].env, { PORT: "3210" });
		assert.deepEqual(plan.children[1].env, { PORT: "5222" });
		// Vite ignores the PORT env var — the custom port must reach it as --port.
		assert.deepEqual(plan.children[1].args, ["run", "dev", "--", "--port", "5222", "--strictPort"]);
	});

	it("supervises the API node process and the Vite npm script", () => {
		const plan = resolveDevPlan({});
		assert.equal(plan.children.length, 2);
		assert.equal(plan.children[0].name, "api");
		assert.deepEqual(plan.children[0].args, ["index.js"]);
		assert.ok(plan.children[0].cwd.endsWith(`${path.sep}api`));
		assert.equal(plan.children[1].name, "web");
		assert.deepEqual(plan.children[1].args, ["run", "dev", "--", "--port", "5173", "--strictPort"]);
		assert.ok(plan.children[1].cwd.endsWith(`${path.sep}frontend`));
	});

	it("rejects a garbage port naming the variable", () => {
		assert.throws(() => resolveDevPlan({ PORT: "nine" }), /PORT/);
		assert.throws(() => resolveDevPlan({ VITE_PORT: "99999" }), /VITE_PORT/);
	});
});

describe("dev --dry-run", () => {
	it("prints the plan and exits without touching ports", async () => {
		const stdout = await dryRun({ PORT: "3210", VITE_PORT: "5222" });
		assert.match(stdout, /dry run/i);
		assert.match(stdout, /3210/);
		assert.match(stdout, /5222/);
		assert.match(stdout, /index\.js/);
		assert.match(stdout, /npm.*run.*dev|run.*dev/);
	});
});
