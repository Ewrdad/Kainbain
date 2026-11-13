import { describe, it, expect, afterEach } from "vitest";
import { executeStage } from "./executeStage.js";
import { config } from "../../config.js";

/***
 * MARK: executeStage runner dispatch (hard defer, no embedded fallback)
 * @description Verifies the runner-only gate is a HARD defer: when
 *   `KAINBAIN_RUNNER_EXECUTION_ONLY` is not false, a dispatch-servable stage
 *   returns `deferred: "runner-dispatch"` unconditionally — no matter what the
 *   runner fleet looks like right now (no registry, empty registry, capability
 *   miss, stale heartbeats, or a capable runner) and no matter how long the
 *   task has already waited. The backend container has no provider credentials
 *   and no harness CLIs, so it must never spawn an in-process run for servable
 *   work; the old wall-clock (`KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS`) and
 *   no-capable-runner fallbacks are removed. These tests assert nothing is
 *   enqueued and no engine state is touched on the defer path.
 ***/
describe("executeStage runner dispatch (hard defer, no embedded fallback)", () => {
	const previous = config.runnerExecutionOnly;
	afterEach(() => {
		config.runnerExecutionOnly = previous;
	});

	const agentStages = [{ id: "s1", name: "Work", type: "agent" }];
	const project = {
		id: "p1",
		name: "P",
		harness: "pi",
		stages: agentStages,
		hasUpstreamRepo: true,
	};

	const fakeStore = (task, projectEntity = project) => {
		const calls = { enqueued: 0, engineSets: 0, systemLogs: [] };
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
			eventBridge: {
				emitSystemLog: (_projectId, message) => {
					calls.systemLogs.push(String(message));
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

	const fakeRunnerRecord = (over = {}) => ({
		runnerId: "r1",
		status: "active",
		paused: false,
		lastSeenAt: new Date().toISOString(),
		capabilities: {
			runnable: true,
			harnesses: [{ id: "pi" }],
			tiers: ["T1"],
			versions: { protocol: "v1", api: "1.0.0" },
		},
		facts: { versions: { protocol: "v1", api: "1.0.0" } },
		operatorConfig: {
			availableTools: null,
			availableModels: null,
			jobTypes: { runsCi: true, runsMerges: true },
			projectScope: null,
		},
		...over,
	});

	const expectHardDefer = async (store, stages = agentStages) => {
		const result = await executeStage(store, "p1", "t1", { stages });
		expect(result).toMatchObject({
			status: "deferred",
			deferred: "runner-dispatch",
		});
		// Nothing may be enqueued for embedded execution and no engine state
		// may be claimed on the defer path.
		expect(store.calls.enqueued).toBe(0);
		expect(store.calls.engineSets).toBe(0);
		// No in-process run is announced either.
		expect(store.calls.systemLogs.join("\n")).not.toMatch(/fallback|in-process/i);
		return result;
	};

	it("defers when no runner registry is attached at all", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		// store.runnerRegistry intentionally undefined
		await expectHardDefer(store);
	});

	it("defers with an empty runner registry", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		store.runnerRegistry = { records: () => [] };
		await expectHardDefer(store);
	});

	it("defers even when no runner can claim the task (capability miss)", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		// A muse-only runner cannot serve a pi-harness task — the old
		// no-capable-runner fallback ran this embedded; it must now defer.
		store.runnerRegistry = {
			records: () => [
				fakeRunnerRecord({
					runnerId: "muse-only",
					capabilities: {
						runnable: true,
						harnesses: [{ id: "muse" }],
						tiers: ["T1"],
						versions: { protocol: "v1", api: "1.0.0" },
					},
				}),
			],
		};
		await expectHardDefer(store);
	});

	it("defers even with a stale runner fleet (all heartbeats expired)", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		store.runnerRegistry = {
			records: () => [
				fakeRunnerRecord({
					lastSeenAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
				}),
			],
		};
		await expectHardDefer(store);
	});

	it("defers after the former wall-clock ceiling has long elapsed", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(
			agentTask({
				enteredStageAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
			}),
		);
		store.runnerRegistry = { records: () => [fakeRunnerRecord()] };
		// No runnerDispatchFallbackMs exists in config any more; a task that
		// entered its stage 2 minutes ago must still defer, never run embedded.
		expect(config).not.toHaveProperty("runnerDispatchFallbackMs");
		await expectHardDefer(store);
	});

	it("defers when a capable runner exists (primary path unchanged)", async () => {
		config.runnerExecutionOnly = true;
		const store = fakeStore(agentTask());
		store.runnerRegistry = { records: () => [fakeRunnerRecord()] };
		await expectHardDefer(store);
	});

	it("defers CI/command stages too — they only ever run on a runner", async () => {
		config.runnerExecutionOnly = true;
		// wf-default's Update stage shape: a ci stage whose command assumes
		// the runner host filesystem (/home/server/apps), not the container.
		const ciStages = [
			{ id: "s1", name: "Update", type: "ci", command: "cd /home/server/apps/kainbain && ./update.sh" },
		];
		const store = fakeStore(agentTask(), { ...project, stages: ciStages });
		store.runnerRegistry = { records: () => [fakeRunnerRecord()] };
		await expectHardDefer(store, ciStages);
	});
});
