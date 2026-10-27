import { describe, it, expect, afterEach } from "vitest";
import { executeStage } from "./executeStage.js";
import { config } from "../../config.js";

/***
 * MARK: executeStage Runner-Cutover Gate Tests
 * @description Verifies the `KAINBAIN_RUNNER_EXECUTION_ONLY` gate: wire-servable
 *   model stages defer to dispatch without touching budgets or state, while
 *   everything else flows through to the embedded queue unchanged.
 ***/
describe("executeStage runner-execution cutover gate", () => {
	const previous = config.runnerExecutionOnly;
	afterEach(() => {
		config.runnerExecutionOnly = previous;
	});

	const agentStages = [{ id: "s1", name: "Work", type: "agent" }];
	const project = { id: "p1", name: "P", harness: "pi", stages: agentStages };

	const fakeStore = (task, projectEntity = project) => {
		const calls = { enqueued: 0, engineSets: 0 };
		return {
			calls,
			getTask: () => task,
			projectStore: { getProject: () => projectEntity },
			isTaskBlocked: () => ({ blocked: false, blockers: [] }),
			setEngineState: () => {
				calls.engineSets += 1;
			},
			executionQueue: {
				enqueue: async () => {
					calls.enqueued += 1;
					return { status: "queued-for-test" };
				},
			},
		};
	};

	const agentTask = (over = {}) => ({
		id: "t1",
		status: "in_stage",
		currentStageId: "s1",
		...over,
	});

	it("defers wire-servable agent stages with budgets and state untouched", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		const result = await executeStage(store, "p1", "t1", { stages: agentStages });
		expect(result).toMatchObject({
			status: "deferred",
			deferred: "runner-dispatch",
		});
		expect(store.calls.enqueued).toBe(0);
		expect(store.calls.engineSets).toBe(0);
	});

	it("lets human stages through to the embedded queue", async () => {
		config.runnerExecutionOnly = true;
		const humanStages = [{ id: "s1", name: "Check", type: "human" }];
		const store = fakeStore(agentTask(), { ...project, stages: humanStages });
		const result = await executeStage(store, "p1", "t1", { stages: humanStages });
		expect(result.deferred).not.toBe("runner-dispatch");
		expect(store.calls.enqueued).toBe(1);
	});

	it("lets unresolvable-alias agent stages through (loud miss stays at dispatch)", async () => {
		config.runnerExecutionOnly = true;
		const aliasStages = [{ id: "s1", name: "Work", type: "agent", harness: "alias", model: "nope" }];
		const store = fakeStore(agentTask(), { ...project, stages: aliasStages, modelAliases: [] });
		const result = await executeStage(store, "p1", "t1", { stages: aliasStages });
		expect(result.deferred).not.toBe("runner-dispatch");
		expect(store.calls.enqueued).toBe(1);
	});

	it("is inert when the flag is off (embedded path unchanged)", async () => {
		config.runnerExecutionOnly = false;
		const store = fakeStore(agentTask());
		const result = await executeStage(store, "p1", "t1", { stages: agentStages });
		expect(result.deferred).not.toBe("runner-dispatch");
		expect(store.calls.enqueued).toBe(1);
	});
});
