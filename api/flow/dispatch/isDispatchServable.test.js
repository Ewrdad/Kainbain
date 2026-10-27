import { expect, test, describe } from "vitest";
import { isDispatchServable } from "./isDispatchServable.js";

/***
 * MARK: isDispatchServable Tests
 * @description Verifies the runner-execution cutover predicate: only
 *   normalized-agent stages that resolve to a concrete harness or a
 *   resolvable alias qualify; everything else stays embedded.
 ***/
describe("isDispatchServable", () => {
	const agentTask = (over = {}) => ({
		currentStageId: "s1",
		stages: [{ id: "s1", type: "agent" }],
		...over,
	});

	test("agent stages with a concrete harness are servable", () => {
		expect(isDispatchServable({ project: { harness: "pi" }, task: agentTask() })).toBe(true);
	});

	test("human stages are never servable; ci/command are servable in task-branch mode", () => {
		for (const type of ["ci", "script"]) {
			expect(isDispatchServable({ project: { harness: "pi" }, task: agentTask({ stages: [{ id: "s1", type }] }) })).toBe(true);
			expect(isDispatchServable({ project: { harness: "pi" }, task: agentTask({ stages: [{ id: "s1", type, runOnBranch: "primary" }] }) })).toBe(false);
		}
		for (const type of ["human"]) {
			expect(
				isDispatchServable({
					project: { harness: "pi" },
					task: agentTask({ stages: [{ id: "s1", type }] }),
				}),
			).toBe(false);
		}
	});

	test("review stages park at the checkpoint and stay embedded", () => {
		// normalizeStageType('review') === 'human': the embedded engine parks
		// instead of spawning, so there is no model child to move.
		expect(
			isDispatchServable({
				project: { harness: "pi" },
				task: agentTask({ stages: [{ id: "s1", type: "review" }] }),
			}),
		).toBe(false);
	});

	test("unknown stage types stay embedded (conservative)", () => {
		expect(
			isDispatchServable({
				project: { harness: "pi" },
				task: agentTask({ stages: [{ id: "s1", type: "frobnicate" }] }),
			}),
		).toBe(false);
	});

	test("explicit stages/stage overrides win over task stages", () => {
		const task = agentTask({ stages: [{ id: "s1", type: "human" }] });
		expect(
			isDispatchServable({
				project: { harness: "pi" },
				task,
				stages: [{ id: "s1", type: "agent" }],
			}),
		).toBe(true);
		expect(
			isDispatchServable({
				project: { harness: "pi" },
				task: agentTask(),
				stage: { id: "s1", type: "human" },
			}),
		).toBe(false);
	});

	test("resolvable aliases are servable without advancing counters", () => {
		const project = {
			id: "p1",
			harness: "pi",
			modelAliases: [
				{
					name: "fast",
					targets: [
						{ harness: "mock", model: "m1", percent: 90 },
						{ harness: "other", model: "m2", percent: 10 },
					],
				},
			],
		};
		const task = agentTask({ stages: [{ id: "s1", type: "agent", harness: "alias", model: "fast" }] });
		expect(isDispatchServable({ project, task })).toBe(true);
		// Peek must not advance the shared smooth-WRR counters: repeated
		// predicate checks leave rotation order to the real dispatch.
		expect(isDispatchServable({ project, task })).toBe(true);
	});

	test("unresolvable aliases are not servable", () => {
		const project = { id: "p1", harness: "pi", modelAliases: [] };
		expect(
			isDispatchServable({
				project,
				task: agentTask({ stages: [{ id: "s1", type: "agent", harness: "alias", model: "nope" }] }),
			}),
		).toBe(false);
	});
});
