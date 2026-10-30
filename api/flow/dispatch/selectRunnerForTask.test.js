import { expect, test, describe } from "vitest";
import { selectRunnerForTask } from "./selectRunnerForTask.js";

/***
 * MARK: selectRunnerForTask Tests
 * @description Verifies deterministic lowest-id pick and the loud miss map.
 ***/
describe("selectRunnerForTask", () => {
	const rec = (id, over = {}) => ({
		runnerId: id,
		status: "active",
		lastSeenAt: new Date(1_000_000).toISOString(),
		facts: { versions: { protocol: "v1" } },
		capabilities: {
			harnesses: [{ id: "pi", version: "1.0" }],
			models: [],
			tiers: ["T1"],
			runnable: true,
			versions: { protocol: "v1" },
			...over.capabilities,
		},
		...over,
	});

	test("picks the lowest capable runnerId deterministically", () => {
		const out = selectRunnerForTask(
			[rec("r2"), rec("r1"), rec("r0", { status: "revoked" })],
			{ harness: "pi", tier: "T1" },
			{ now: 1_000_000 },
		);
		expect(out.record.runnerId).toBe("r1");
		expect(out.reason).toBe("MATCH");
	});

	test("reports misses when nobody can take the job", () => {
		const out = selectRunnerForTask([rec("r1")], { harness: "codex" }, { now: 1_000_000 });
		expect(out.record).toBeNull();
		expect(out.misses).toEqual({ r1: "NO_HARNESS" });
	});

	test("skips a runner that did not advertise the required model and picks the capable one", () => {
		const capsFor = (models) => ({
			harnesses: [{ id: "pi", version: "1.0" }],
			models,
			tiers: ["T1"],
			runnable: true,
			versions: { protocol: "v1" },
		});
		const kimiOnly = rec("r1", { capabilities: capsFor(["kimi-k3:cloud"]) });
		const gptOnly = rec("r2", { capabilities: capsFor(["gpt-oss:120b-cloud"]) });
		const out = selectRunnerForTask(
			[kimiOnly, gptOnly],
			{ harness: "pi", model: "gpt-oss:120b-cloud", tier: "T1" },
			{ now: 1_000_000 },
		);
		expect(out.record.runnerId).toBe("r2");
		expect(out.reason).toBe("MATCH");
	});
});
