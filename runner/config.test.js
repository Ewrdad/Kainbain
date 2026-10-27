import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadRunnerConfig } from "./config.js";

describe("loadRunnerConfig", () => {
	it("fills defaults and reports no errors when complete", () => {
		const config = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: " r1 ",
			KAINBAIN_RUNNER_HARNESS: "mock",
			KAINBAIN_RUNNER_PROJECT_ID: "p1",
			KAINBAIN_RUNNER_TASK_ID: "t1",
		});
		assert.equal(config.errors.length, 0);
		assert.equal(config.runnerId, "r1");
		assert.equal(config.backendUrl, "http://localhost:3100");
		assert.deepEqual(config.tiers, ["T0", "T1"]);
		assert.equal(config.heartbeatMs, 15000);
	});

	it("lists every missing required key", () => {
		const config = loadRunnerConfig({});
		assert.equal(config.errors.length, 4);
		assert.match(config.errors.join(" "), /KAINBAIN_RUNNER_ID/);
		assert.match(config.errors.join(" "), /KAINBAIN_RUNNER_HARNESS/);
	});

	it("drops the explicit-assignment requirement in dispatch mode", () => {
		const config = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "mock",
			KAINBAIN_RUNNER_DISPATCH: "1",
			KAINBAIN_RUNNER_PROJECTS: " p1 , p2 ",
			KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT: "nope",
		});
		assert.equal(config.errors.length, 0);
		assert.equal(config.dispatch, true);
		assert.deepEqual(config.projectIds, ["p1", "p2"]);
		assert.equal(config.dispatchPollMs, 5000);
		assert.equal(config.dispatchIdleLimit, 3);
	});

	it("keeps dispatchIdleLimit 0 as persistent service mode", () => {
		const config = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "mock",
			KAINBAIN_RUNNER_DISPATCH: "1",
			KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT: "0",
		});
		assert.equal(config.errors.length, 0);
		assert.equal(config.dispatchIdleLimit, 0);
	});

	it("advertises a csv MODELS list, singular MODEL seeds it, empty stays unpinned", () => {
		const csv = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "pi",
			KAINBAIN_RUNNER_DISPATCH: "1",
			KAINBAIN_RUNNER_MODEL: "ignored-when-csv",
			KAINBAIN_RUNNER_MODELS: " a ,b,, c ",
		});
		assert.deepEqual(csv.models, ["a", "b", "c"]);
		assert.equal(csv.model, "ignored-when-csv");

		const single = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "pi",
			KAINBAIN_RUNNER_DISPATCH: "1",
			KAINBAIN_RUNNER_MODEL: "m1",
		});
		assert.deepEqual(single.models, ["m1"]);

		const bare = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "pi",
			KAINBAIN_RUNNER_DISPATCH: "1",
		});
		assert.deepEqual(bare.models, []);
		assert.equal(bare.model, "");
	});

	it("reads a csv HARNESSES list, singular HARNESS seeds it", () => {
		const multi = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESSES: " pi ,muse,, vibe ",
			KAINBAIN_RUNNER_DISPATCH: "1",
		});
		assert.equal(multi.errors.length, 0);
		assert.deepEqual(multi.harnessIds, ["pi", "muse", "vibe"]);
		assert.equal(multi.harnessId, "pi");

		const single = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "mock",
			KAINBAIN_RUNNER_PROJECT_ID: "p1",
			KAINBAIN_RUNNER_TASK_ID: "t1",
		});
		assert.equal(single.errors.length, 0);
		assert.deepEqual(single.harnessIds, ["mock"]);
		assert.equal(single.harnessId, "mock");
	});

	it("falls back on invalid numbers and customizes tiers", () => {
		const config = loadRunnerConfig({
			KAINBAIN_RUNNER_ID: "r1",
			KAINBAIN_RUNNER_HARNESS: "mock",
			KAINBAIN_RUNNER_PROJECT_ID: "p1",
			KAINBAIN_RUNNER_TASK_ID: "t1",
			KAINBAIN_RUNNER_HEARTBEAT_MS: "nan",
			KAINBAIN_RUNNER_TIERS: "T0",
		});
		assert.equal(config.heartbeatMs, 15000);
		assert.deepEqual(config.tiers, ["T0"]);
	});
});
