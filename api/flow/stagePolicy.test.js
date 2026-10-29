// Domain: The Flow — Subject unit tests for stage policies, labels, and timeouts.
import { describe, it, expect } from 'vitest';
import {
	resolveStageTimeout,
	runnerStageTimeoutStatus,
	resolveEffectiveStageType,
	resolveStageLabel,
	resolveStage,
	stageElapsedSeconds,
	isAutomatedStage,
	clearResumedMarker,
	findStageByIdOrName,
	findStageIndexByIdOrName,
	isEngineOwnerOf,
	isTerminalTaskStatus,
} from './stagePolicy.js';

describe('The Flow: stage policy and resolution', () => {
	it('resolves stage labels with exact id, case-insensitive name, or fallback', () => {
		const stages = [
			{ id: 'dev-1', name: 'Development' },
			{ id: 'test-2', name: 'Testing' },
		];

		expect(resolveStageLabel('dev-1', stages)).toBe('Development');
		expect(resolveStageLabel('testing', stages)).toBe('Testing');
		expect(resolveStageLabel('TESTING', stages)).toBe('Testing');
		expect(resolveStageLabel('unknown-stage', stages)).toBe('unknown-stage');
		expect(resolveStageLabel('', stages)).toBe('unknown');
	});

	it('resolves timeouts per stage type and supports explicit overrides', () => {
		expect(resolveStageTimeout({ type: 'agent' }, 'agent')).toBe(1800000);
		expect(resolveStageTimeout({ type: 'ci' }, 'ci')).toBe(600000);
		// Legacy deploy reads as ci: same budget, no separate deploy timeout.
		expect(resolveStageTimeout({ type: 'deploy' }, 'deploy')).toBe(600000);
		expect(resolveStageTimeout({ type: 'merge' }, 'merge')).toBe(1800000);
		expect(resolveStageTimeout({ timeout: 45000 }, 'agent')).toBe(45000);
	});

	it('maps legacy and mixed-case stage types to their timeout buckets', () => {
		// Legacy review checkpoints share the agent timeout.
		expect(resolveStageTimeout({ type: 'review' }, 'review')).toBe(1800000);
		expect(resolveStageTimeout({ type: 'REVIEW' }, 'review')).toBe(1800000);
		// Legacy script stages share the CI timeout.
		expect(resolveStageTimeout({ type: 'script' }, 'script')).toBe(600000);
		expect(resolveStageTimeout({ type: 'Script' }, 'script')).toBe(600000);
		// Mixed-case modern types classify identically.
		expect(resolveStageTimeout({ type: 'AGENT' }, 'agent')).toBe(1800000);
		expect(resolveStageTimeout({ type: 'CI' }, 'ci')).toBe(600000);
		// Human and unknown types keep the safe 300000 ms fallback.
		expect(resolveStageTimeout({ type: 'human' }, 'human')).toBe(300000);
		expect(resolveStageTimeout({}, 'unknown_type')).toBe(300000);
	});

	it('derives the effective stage type from the command (deploy is a ci stage)', () => {
		expect(resolveEffectiveStageType({ type: 'ci', command: './deploy.sh --prod' })).toBe('ci');
		expect(resolveEffectiveStageType({ type: 'ci', script: './deploy.sh' })).toBe('ci');
		expect(resolveEffectiveStageType({ type: 'ci', command: 'npm test' })).toBe('ci');
		// A merge stage is git-only: merge wins over a stray deploy command.
		expect(resolveEffectiveStageType({ type: 'merge', command: './deploy.sh --prod' })).toBe('merge');
		// Legacy tolerance: a raw deploy-typed stage now resolves to ci.
		expect(resolveEffectiveStageType({ type: 'deploy' })).toBe('ci');
		expect(resolveEffectiveStageType({ type: 'agent' })).toBe('agent');
		expect(resolveEffectiveStageType(null)).toBe('agent');
	});

	it('applies the ci timeout to every ci stage, including deploy commands', () => {
		// Deploy commands are ordinary ci stages now.
		expect(resolveStageTimeout({ type: 'ci', command: './deploy.sh --prod' })).toBe(600000);
		expect(resolveStageTimeout({ type: 'ci', command: 'npm test' })).toBe(600000);
	});

	it('prefers a stage override over the project timeout over the global default', () => {
		const project = { agentTimeoutMs: 111111, ciTimeoutMs: 22222 };
		// Project layer wins over the global default per stage type.
		expect(resolveStageTimeout({ type: 'agent' }, 'agent', undefined, project)).toBe(111111);
		expect(resolveStageTimeout({ type: 'ci' }, 'ci', undefined, project)).toBe(22222);
		// Legacy types read the same project fields via their raw alias.
		expect(resolveStageTimeout({ type: 'review' }, 'review', undefined, project)).toBe(111111);
		expect(resolveStageTimeout({ type: 'script' }, 'script', undefined, project)).toBe(22222);
		// Stage override still wins over the project layer.
		expect(resolveStageTimeout({ type: 'agent', timeout: 45000 }, 'agent', undefined, project)).toBe(45000);
		// Unset project fields fall through to the global default (legacy
		// deploy reads the ci budget).
		expect(resolveStageTimeout({ type: 'deploy' }, 'deploy', undefined, project)).toBe(600000);
		expect(resolveStageTimeout({ type: 'merge' }, 'merge', undefined, {})).toBe(1800000);
		// Absent project behaves exactly as before.
		expect(resolveStageTimeout({ type: 'agent' }, 'agent', undefined, undefined)).toBe(1800000);
	});

	it('falls back to the schema CI default when the config has no CI budget', () => {
		// Fail-safe: a partial config must never shorten a CI stage to 60s.
		// Schema default for ciTimeoutMs is 600000 (10 min).
		expect(resolveStageTimeout({ type: 'ci' }, 'ci', {})).toBe(600000);
		expect(resolveStageTimeout({ type: 'ci', command: './deploy.sh --prod' }, 'ci', {})).toBe(600000);
		expect(resolveStageTimeout({ type: 'deploy' }, 'deploy', {})).toBe(600000);
		expect(resolveStageTimeout({ type: 'script' }, 'script', {})).toBe(600000);
	});

	it('ignores non-positive project timeouts and falls through to the default', () => {
		const project = { agentTimeoutMs: 0, ciTimeoutMs: -500 };
		expect(resolveStageTimeout({ type: 'agent' }, 'agent', undefined, project)).toBe(1800000);
		expect(resolveStageTimeout({ type: 'ci' }, 'ci', undefined, project)).toBe(600000);
		// Legacy deploy ignores the deprecated deployTimeoutMs and follows ci.
		expect(resolveStageTimeout({ type: 'deploy' }, 'deploy', undefined, project)).toBe(600000);
	});

	it('measures stage elapsed seconds, clamps clock skew, and ignores missing timestamps', () => {
		const entered = '2026-01-01T00:00:00.000Z';
		expect(stageElapsedSeconds({ enteredStageAt: entered }, Date.parse(entered) + 60000)).toBe(60);
		expect(stageElapsedSeconds({ enteredStageAt: entered }, Date.parse(entered) - 5000)).toBe(0);
		expect(stageElapsedSeconds({})).toBeUndefined();
		expect(stageElapsedSeconds({ enteredStageAt: '' })).toBeUndefined();
	});

	it('resolves stage object from project given stageId or defaults to first', () => {
		const project = {
			stages: [
				{ id: 'first', name: 'First Stage' },
				{ id: 'second', name: 'Second Stage' },
			],
		};

		expect(resolveStage(project, 'second').name).toBe('Second Stage');
		expect(resolveStage(project, 'non-existent').name).toBe('First Stage');
	});

	it('marks ci/deploy/merge (and legacy script) as automated, everything else as model-backed', () => {
		for (const type of ['ci', 'deploy', 'merge', 'script', 'CI', 'Script', 'DEPLOY', 'Merge', '  ci  ', ' script ']) {
			expect(isAutomatedStage(type)).toBe(true);
		}
		for (const type of ['agent', 'human', 'review', 'custom', 'unknown', '', '  ', null, undefined, 42]) {
			expect(isAutomatedStage(type)).toBe(false);
		}
	});

	it('clearResumedMarker clears the marker pair once and fails safe', () => {
		const marked = { resumedAfterInterruption: true, interruptedAt: '2026-10-08T10:00:00.000Z' };
		expect(clearResumedMarker(marked)).toBe(true);
		expect(marked.resumedAfterInterruption).toBe(false);
		expect(marked.interruptedAt).toBeNull();
		// Idempotent: a second clear reports nothing to clear.
		expect(clearResumedMarker(marked)).toBe(false);
		// Missing task or absent marker: safe no-ops.
		expect(clearResumedMarker(null)).toBe(false);
		expect(clearResumedMarker(undefined)).toBe(false);
		expect(clearResumedMarker({})).toBe(false);
	});

	it('clearResumedMarker also clears a stale interruptedAt without the flag', () => {
		// Defensive: a task carrying only the timestamp (e.g. a partial write)
		// must not keep leaking a phantom priority snapshot.
		const orphan = { interruptedAt: '2026-10-08T10:00:00.000Z' };
		expect(clearResumedMarker(orphan)).toBe(true);
		expect(orphan.interruptedAt).toBeNull();
	});
});

describe('The Flow: shared stage lookup and engine ownership', () => {
	const stages = [
		{ id: '1', name: 'Catchup', type: 'agent' },
		{ id: 'merge', name: 'Merge and deploy', type: 'merge' },
	];

	it('findStageByIdOrName matches by id or case-insensitive name, never a guess', () => {
		expect(findStageByIdOrName(stages, '1')).toEqual(stages[0]);
		expect(findStageByIdOrName(stages, 'catchup')).toEqual(stages[0]);
		expect(findStageByIdOrName(stages, 'CATCHUP')).toEqual(stages[0]);
		expect(findStageByIdOrName(stages, 'merge')).toEqual(stages[1]);
		expect(findStageByIdOrName(stages, 'ghost')).toBeNull();
		expect(findStageByIdOrName(stages, '')).toBeNull();
		expect(findStageByIdOrName(stages, null)).toBeNull();
		expect(findStageByIdOrName(stages, undefined)).toBeNull();
		expect(findStageByIdOrName(null, '1')).toBeNull();
		expect(findStageByIdOrName([], '1')).toBeNull();
	});

	it('findStageIndexByIdOrName mirrors the lookup as an index', () => {
		expect(findStageIndexByIdOrName(stages, '1')).toBe(0);
		expect(findStageIndexByIdOrName(stages, 'Merge and Deploy')).toBe(1);
		expect(findStageIndexByIdOrName(stages, 'ghost')).toBe(-1);
		expect(findStageIndexByIdOrName(stages, '')).toBe(-1);
		expect(findStageIndexByIdOrName(stages, null)).toBe(-1);
		expect(findStageIndexByIdOrName(null, '1')).toBe(-1);
	});

	it('isEngineOwnerOf tolerates string/number id drift and fails safe', () => {
		// Persisted snapshots and live records can drift between string and
		// number keys; the owner must still be recognised so operator moves
		// and aborts release the engine instead of stranding it.
		expect(isEngineOwnerOf({ activeTaskId: 't1' }, 't1')).toBe(true);
		expect(isEngineOwnerOf({ activeTaskId: 42 }, '42')).toBe(true);
		expect(isEngineOwnerOf({ activeTaskId: '42' }, 42)).toBe(true);
		expect(isEngineOwnerOf({ activeTaskId: 't1' }, 't2')).toBe(false);
		expect(isEngineOwnerOf({ activeTaskId: null }, 't1')).toBe(false);
		expect(isEngineOwnerOf({ activeTaskId: 't1' }, null)).toBe(false);
		expect(isEngineOwnerOf({ activeTaskId: 't1' }, undefined)).toBe(false);
		expect(isEngineOwnerOf(null, 't1')).toBe(false);
		expect(isEngineOwnerOf(undefined, 't1')).toBe(false);
	});

	it('runnerStageTimeoutStatus bounds a claim hold against the stage budget', () => {
		const startedAt = new Date('2026-10-29T19:00:00.000Z').toISOString();
		const at = (ms) => Date.parse('2026-10-29T19:00:00.000Z') + ms;
		expect(
			runnerStageTimeoutStatus({ startedAt, timeoutMs: 1800000, now: at(1000) }),
		).toMatchObject({ timedOut: false, timeoutMs: 1800000 });
		expect(
			runnerStageTimeoutStatus({ startedAt, timeoutMs: 1800000, now: at(1800001) }).timedOut,
		).toBe(true);
		// Unparseable anchors never time out (fail-open on bad data, not on budget).
		expect(
			runnerStageTimeoutStatus({ startedAt: 'not-a-date', timeoutMs: 1000, now: at(99999) }).timedOut,
		).toBe(false);
		expect(
			runnerStageTimeoutStatus({ startedAt: null, timeoutMs: 1000, now: at(99999) }).timedOut,
		).toBe(false);
	});

	it('isTerminalTaskStatus pins the never-resurrect contract', () => {
		for (const status of ['completed', 'done', 'failed', 'cancelled', 'FAILED']) {
			expect(isTerminalTaskStatus(status)).toBe(true);
		}
		for (const status of ['in_stage', 'paused', 'running_agent', 'waiting_human', null, undefined, '']) {
			expect(isTerminalTaskStatus(status)).toBe(false);
		}
	});
});
