import { describe, expect, test } from 'vitest';
import { isRunnerClaimable } from './isRunnerClaimable.js';

function fakeRegistry(records) {
	return { records: () => records };
}

function freshRunner(id, harness, model) {
	const now = new Date().toISOString();
	return {
		runnerId: id,
		status: 'active',
		paused: false,
		lastSeenAt: now,
		capabilities: {
			runnable: true,
			harnesses: [{ id: harness }],
			models: model ? [model] : [],
			tiers: ['T1'],
			versions: { protocol: 'v1', api: '1.0.0' },
		},
		facts: { versions: { protocol: 'v1', api: '1.0.0' } },
		operatorConfig: { availableTools: null, availableModels: null, jobTypes: { runsCi: true, runsMerges: true }, projectScope: null },
	};
}

describe('isRunnerClaimable', () => {
	test('returns false with no registry or empty fleet', () => {
		expect(isRunnerClaimable(null, { harness: 'pi' })).toBe(false);
		expect(isRunnerClaimable(fakeRegistry([]), { harness: 'pi' })).toBe(false);
	});

	test('returns true when a runner matches harness', () => {
		expect(isRunnerClaimable(fakeRegistry([freshRunner('r1', 'pi')]), { harness: 'pi', tier: 'T1' })).toBe(true);
	});

	test('returns false when no runner has the harness', () => {
		expect(isRunnerClaimable(fakeRegistry([freshRunner('r1', 'muse')]), { harness: 'pi' })).toBe(false);
	});

	test('checks model when required', () => {
		const runner = freshRunner('r1', 'pi', 'pi::ollama-cloud-direct::beam::high');
		expect(isRunnerClaimable(fakeRegistry([runner]), { harness: 'pi', model: 'pi::ollama-cloud-direct::beam::high' })).toBe(true);
		expect(isRunnerClaimable(fakeRegistry([runner]), { harness: 'pi', model: 'other-model' })).toBe(false);
	});

	test('second runner can rescue first miss', () => {
		expect(
			isRunnerClaimable(fakeRegistry([freshRunner('r1', 'muse'), freshRunner('r2', 'pi')]), { harness: 'pi', tier: 'T1' }),
		).toBe(true);
	});

	test('paused runners never count', () => {
		const paused = { ...freshRunner('r1', 'pi'), paused: true };
		expect(isRunnerClaimable(fakeRegistry([paused]), { harness: 'pi' })).toBe(false);
	});

	test('revoked runners never count', () => {
		const revoked = { ...freshRunner('r1', 'pi'), status: 'revoked' };
		expect(isRunnerClaimable(fakeRegistry([revoked]), { harness: 'pi' })).toBe(false);
	});
});
