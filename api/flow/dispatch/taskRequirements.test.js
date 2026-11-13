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

	test("every command ci stage is Runner-runnable, including deploy/publish and legacy hostOnly stamps", () => {
		for (const command of ["./publish.sh --detect", "./redeploy.sh --frontend", "./deploy.sh --prod", "./deploy.sh --prod --fast", "npm test"]) {
			const out = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", command }] });
			expect(out).toMatchObject({ runnableType: true, hostCommand: false, kind: "ci" });
		}
		const stamped = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "ci", hostOnly: true }] });
		expect(stamped).toMatchObject({ runnableType: true, hostCommand: false });
	});

	test("merge stages are Runner-runnable as harness-less T0 integrate jobs", () => {
		const out = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "merge" }] });
		expect(out).toMatchObject({ runnableType: true, kind: "merge", harness: null, model: "", tier: "T0", alias: null });
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

	test("resolves the task's own workflow stages, never the active workflow's", () => {
		// The active pipeline ("default") and the task's pipeline ("audit")
		// use disjoint stage ids: requirements must come from the audit
		// stage the task actually sits at.
		const project = {
			harness: "pi",
			defaultModel: "m1",
			activeWorkflowId: "wf-default",
			stages: [{ id: "s1", type: "human" }],
			workflows: [
				{ id: "wf-default", stages: [{ id: "s1", type: "human" }] },
				{ id: "wf-audit", stages: [{ id: "audit-1", type: "agent", harness: "codex", model: "m2" }] },
			],
		};
		expect(
			taskRequirements(project, { workflowId: "wf-audit", currentStageId: "audit-1" }),
		).toMatchObject({ harness: "codex", model: "m2", tier: "T1", runnableType: true, stageId: "audit-1" });
	});

	test("tasks without a workflowId keep resolving the project's stages", () => {
		// Legacy tasks predate workflow stamping: the project stages (the
		// active workflow's mirror) stay their source of truth.
		expect(
			taskRequirements(
				{ harness: "pi", defaultModel: "m1", stages: [{ id: "s1", type: "agent" }] },
				{ currentStageId: "s1" },
			),
		).toMatchObject({ harness: "pi", model: "m1", runnableType: true, stageId: "s1" });
	});

	test("an explicitly passed stage list wins over project and task stages", () => {
		const out = taskRequirements(
			{ harness: "pi", stages: [{ id: "s1", type: "human" }] },
			{ workflowId: "wf-audit", currentStageId: "audit-1" },
			[{ id: "audit-1", type: "agent", harness: "codex", model: "m2" }],
		);
		expect(out).toMatchObject({ harness: "codex", model: "m2", runnableType: true, stageId: "audit-1" });
	});

	test("a task pointing at a deleted stage parks instead of guessing stages[0]", () => {
		// Strict like the queue display: an unresolvable stage is unknown
		// (`stageId: null`, not runnable), never the first stage's job.
		const out = taskRequirements(
			{ harness: "pi", defaultModel: "m1" },
			{ currentStageId: "gone", stages: [{ id: "s1", type: "agent" }] },
		);
		expect(out).toMatchObject({ runnableType: false, stageId: null });
	});

	test("carries the stage's normalized runnerPolicy, present only when restricted", () => {
		const restricted = taskRequirements(
			{},
			{
				currentStageId: "s1",
				stages: [{ id: "s1", type: "ci", runnerPolicy: { mode: " Allow ", runners: ["  r1 ", "r1"] } }],
			},
		);
		expect(restricted.runnerPolicy).toEqual({ mode: "allow", runners: ["r1"] });
		// Unrestricted stages keep their exact legacy shape (no key at all).
		const legacy = taskRequirements({}, { currentStageId: "s1", stages: [{ id: "s1", type: "agent" }] });
		expect("runnerPolicy" in legacy).toBe(false);
		const empty = taskRequirements(
			{},
			{ currentStageId: "s1", stages: [{ id: "s1", type: "agent", runnerPolicy: { mode: "allow", runners: [] } }] },
		);
		expect("runnerPolicy" in empty).toBe(false);
	});
});
