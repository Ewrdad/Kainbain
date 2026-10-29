import { expect, test, describe } from "vitest";
import { taskRequirements } from "./taskRequirements.js";

/***
 * MARK: taskRequirements Tests
 * @description Verifies stage-over-project-over-default requirement
 *   derivation, tier defaults, alias marking, and runnable types.
 ***/
describe("taskRequirements", () => {
	test("derives harness/model/tier with T1 default for agent stages", () => {
		expect(
			taskRequirements(
				{ harness: "pi", defaultModel: "m1" },
				{ currentStageId: "s1", stages: [{ id: "s1", type: "agent" }] },
			),
		).toMatchObject({ harness: "pi", model: "m1", tier: "T1", alias: null, runnableType: true });
	});

	test("stage overrides win and explicit tiers are honored", () => {
		expect(
			taskRequirements(
				{ harness: "pi", defaultModel: "m1" },
				{
					currentStageId: "s1",
					stages: [{ id: "s1", type: "agent", harness: "codex", model: "m2", tier: "T2" }],
				},
			),
		).toMatchObject({ harness: "codex", model: "m2", tier: "T2" });
	});

	test("marks alias-harness stages for WP-3.2 instead of guessing", () => {
		expect(
			taskRequirements(
				{ harness: "pi", defaultModel: "base" },
				{ currentStageId: "s1", stages: [{ id: "s1", type: "agent", harness: "alias", model: "fast" }] },
			),
		).toMatchObject({ harness: null, alias: "fast" });
	});

	test("falls back through the embedded order to the built-in default", () => {
		// Nothing configured anywhere: stage → project → configured default
		// → built-in "pi", exactly what the engine would run.
		expect(
			taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "agent" }] }),
		).toMatchObject({ harness: "pi", model: "", tier: "T1" });
	});

	test("host-command ci stages are not Runner-runnable; ordinary ci stages still are", () => {
		const publish = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", command: "./publish.sh --detect" }] });
		expect(publish).toMatchObject({ runnableType: true, hostCommand: false, kind: "ci" });
		for (const command of ["./redeploy.sh --frontend", "./deploy.sh --prod"]) {
			const out = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", command }] });
			expect(out).toMatchObject({ runnableType: false, hostCommand: true, kind: "ci" });
		}
		const normal = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", command: "npm test" }] });
		expect(normal).toMatchObject({ runnableType: true, hostCommand: false });
		const stamped = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", hostOnly: true }] });
		expect(stamped).toMatchObject({ runnableType: false, hostCommand: true });
	});

	test("human stages are not Runner-runnable; ci stages are CI-runnable at T0", () => {
		const ci = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci" }] });
		expect(ci).toMatchObject({ runnableType: true, kind: "ci", harness: null, tier: "T0" });
		for (const type of ["human"]) {
			const out = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type }] });
			expect(out.runnableType).toBe(false);
			expect(out.tier).toBe("T0");
		}
	});
});
