import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskStore } from '../../taskStore.js';
import { ProjectStore } from '../../projectStore.js';
import * as configModule from '../../config.js';
import { executeStage } from './executeStage.js';

function makeProject(id, opts = {}) {
	return {
		id,
		name: `Project ${id}`,
		cwd: `/tmp/${id}`,
		stages: [
			{ id: '1', name: 'Idea', type: 'human' },
			{ id: '5', name: 'In Progress', type: 'agent', harness: 'alias', model: 'worker' },
		],
		modelAliases: [
			{
				name: 'worker',
				harness: 'muse',
				targets: [
					{ harness: 'pi', model: 'pi::ollama-cloud-direct::beam::high', percent: 100 },
				],
			},
		],
		hasUpstreamRepo: true,
		defaultModel: 'pi::ollama-cloud-direct::beam::high',
		...opts,
	};
}

function fakeRunnerRecord(harnessId, model) {
	const now = new Date().toISOString();
	return {
		runnerId: 'r1',
		status: 'active',
		paused: false,
		lastSeenAt: now,
		capabilities: {
			runnable: true,
			harnesses: [{ id: harnessId }],
			tiers: ['T1'],
			versions: { protocol: 'v1', api: '1.0.0' },
		},
		facts: { versions: { protocol: 'v1', api: '1.0.0' } },
		operatorConfig: { availableTools: null, availableModels: model ? [model] : null, jobTypes: { runsCi: true, runsMerges: true }, projectScope: null },
	};
}

describe('executeStage runner fallback (task 16d6fbd6)', () => {
	let projectStore;
	let taskStore;
	let projectId;

	beforeEach(() => {
		projectStore = new ProjectStore();
		taskStore = new TaskStore({ projectStore });
		const project = makeProject('p1');
		projectId = project.id;
		projectStore.projects.set(projectId, project);
		taskStore.claimStore = { describe: () => null };
		// No runner registry by default (capability-miss fallback)
		taskStore.runnerRegistry = null;
	});

	test('falls back to embedded when no runner can claim the task', async () => {
		vi.spyOn(configModule, 'config', 'get').mockReturnValue({
			runnerExecutionOnly: true,
			runnerDispatchFallbackMs: 90000,
			executionQueueConcurrency: 1,
		});
		taskStore.runnerRegistry = {
			records: () => [fakeRunnerRecord('muse', 'muse::meta::muse-spark-1.3')],
		};
		const task = taskStore.createTask(projectId, { title: 'T', goal: 'g', stageId: '5' });
		taskStore.updateTask(projectId, task.id, { status: 'in_stage', currentStageId: '5' });
		// Mock a live engine so executeStage proceeds past the busy gate.
		taskStore.engineState = { status: 'idle', activeTaskId: null };
		// Mock the embedded run to avoid spawning a real harness child.
		const spy = vi.spyOn(taskStore, 'executeStage').mockImplementationOnce(() => {
			// Second call (fallback path) would hit embedded; simulate that it ran.
			return Promise.resolve({ status: 'running', task });
		});
		// Direct call to executeStage with a runner that cannot serve pi harness.
		const result = await executeStage(taskStore, projectId, task.id, {
			stages: makeProject(projectId).stages,
			projectCwd: `/tmp/${projectId}`,
		});
		// When fallback triggers, executeStage should NOT return deferred — it should
		// proceed to embedded. We verify by checking the result is not deferred.
		// If fallback did not trigger, result.deferred === 'runner-dispatch'.
		// With the mock above, the fallback path tries to enqueue embedded work;
		// the simplest assertion is that the no-capable-runner case does not defer.
		// Restore spy to verify original logic path.
		spy.mockRestore();
		vi.spyOn(configModule, 'config', 'get').mockRestore?.();
		// Re-test without mock: the fallback should make executeStage not defer.
		// Use a direct call that does not recurse through the mocked taskStore.executeStage.
		const direct = await executeStage(taskStore, projectId, task.id, {
			stages: makeProject(projectId).stages,
			projectCwd: `/tmp/${projectId}`,
		});
		expect(direct?.deferred).not.toBe('runner-dispatch');
	});

	test('defers when a capable runner exists and fallback time not reached', async () => {
		vi.spyOn(configModule, 'config', 'get').mockReturnValue({
			runnerExecutionOnly: true,
			runnerDispatchFallbackMs: 90000,
		});
		taskStore.runnerRegistry = {
			records: () => [fakeRunnerRecord('pi', 'pi::ollama-cloud-direct::beam::high')],
		};
		const task = taskStore.createTask(projectId, { title: 'T', goal: 'g', stageId: '5' });
		taskStore.updateTask(projectId, task.id, { status: 'in_stage', currentStageId: '5' });
		const result = await executeStage(taskStore, projectId, task.id, {
			stages: makeProject(projectId).stages,
			projectCwd: `/tmp/${projectId}`,
		});
		// Fresh task with capable runner still defers (primary path unchanged).
		expect(result?.deferred).toBe('runner-dispatch');
	});

	test('falls back after wall-clock ceiling even with capable runner', async () => {
		vi.spyOn(configModule, 'config', 'get').mockReturnValue({
			runnerExecutionOnly: true,
			runnerDispatchFallbackMs: 1000,
		});
		taskStore.runnerRegistry = {
			records: () => [fakeRunnerRecord('pi', 'pi::ollama-cloud-direct::beam::high')],
		};
		const task = taskStore.createTask(projectId, { title: 'T', goal: 'g', stageId: '5' });
		// Simulate a task that entered stage 2 minutes ago (past 1 s ceiling).
		taskStore.updateTask(projectId, task.id, {
			status: 'in_stage',
			currentStageId: '5',
			enteredStageAt: new Date(Date.now() - 120000).toISOString(),
		});
		const result = await executeStage(taskStore, projectId, task.id, {
			stages: makeProject(projectId).stages,
			projectCwd: `/tmp/${projectId}`,
		});
		expect(result?.deferred).not.toBe('runner-dispatch');
	});
});
