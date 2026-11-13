import { describe, expect, test } from 'vitest';
import { isRunnerDispatchFallbackDue } from './isRunnerDispatchFallbackDue.js';

describe('isRunnerDispatchFallbackDue', () => {
	test('returns false when disabled (0 or negative)', () => {
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, 0, Date.now())).toBe(false);
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, -1, Date.now())).toBe(false);
	});

	test('returns false for fresh task within ceiling', () => {
		const now = new Date('2026-11-11T10:00:30Z').getTime();
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, 90000, now)).toBe(false);
	});

	test('returns true when wall-clock exceeds ceiling', () => {
		const now = new Date('2026-11-11T10:02:00Z').getTime();
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, 60000, now)).toBe(true);
	});

	test('returns true exactly at ceiling', () => {
		const entered = new Date('2026-11-11T10:00:00Z').getTime();
		const now = entered + 90000;
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, 90000, now)).toBe(true);
	});

	test('falls back to updatedAt when enteredStageAt missing', () => {
		const now = new Date('2026-11-11T10:02:00Z').getTime();
		expect(isRunnerDispatchFallbackDue({ updatedAt: '2026-11-11T10:00:00Z' }, 60000, now)).toBe(true);
		expect(isRunnerDispatchFallbackDue({ updatedAt: '2026-11-11T10:01:45Z' }, 60000, now)).toBe(false);
	});

	test('returns false when no timestamp', () => {
		expect(isRunnerDispatchFallbackDue({}, 90000, Date.now())).toBe(false);
		expect(isRunnerDispatchFallbackDue(null, 90000, Date.now())).toBe(false);
	});

	test('handles invalid timestamp as no-fallback', () => {
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: 'not-a-date' }, 90000, Date.now())).toBe(false);
	});

	test('returns false for NaN or non-number configuredMs', () => {
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, NaN, Date.now())).toBe(false);
		expect(isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-11T10:00:00Z' }, null, Date.now())).toBe(false);
	});
});
