import { describe, expect, test } from 'vitest';
import {
  NEW_TASK_EDIT_WINDOW_MS,
  isNewlyCreatedTask,
  resolveDefaultGoalMode,
} from './goalDefaultMode';

/***
 * MARK: goalDefaultMode tests
 * @description Verifies the goal section's default-mode helpers: the
 * newly-created window (boundary convention, invalid dates failing closed
 * to preview) and the mode truth table shared by both task detail
 * surfaces.
 ***/

// Pinned "now" keeps the boundary tests deterministic regardless of when
// the suite runs.
const NOW_MS = Date.parse('2026-10-04T18:00:00.000Z');
const isoAt = (ms) => new Date(ms).toISOString();

describe('NEW_TASK_EDIT_WINDOW_MS', () => {
  test('is a five-minute window', () => {
    expect(NEW_TASK_EDIT_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe('isNewlyCreatedTask', () => {
  test('accepts a task object with a fresh createdAt', () => {
    expect(isNewlyCreatedTask({ createdAt: isoAt(NOW_MS) }, NOW_MS)).toBe(true);
  });

  test('accepts a bare ISO timestamp', () => {
    expect(isNewlyCreatedTask(isoAt(NOW_MS - 60 * 1000), NOW_MS)).toBe(true);
  });

  test('just inside the window counts as newly created', () => {
    expect(isNewlyCreatedTask(isoAt(NOW_MS - NEW_TASK_EDIT_WINDOW_MS + 1), NOW_MS)).toBe(true);
  });

  test('exactly on the boundary counts as newly created (inclusive)', () => {
    expect(isNewlyCreatedTask(isoAt(NOW_MS - NEW_TASK_EDIT_WINDOW_MS), NOW_MS)).toBe(true);
  });

  test('just outside the window counts as old', () => {
    expect(isNewlyCreatedTask(isoAt(NOW_MS - NEW_TASK_EDIT_WINDOW_MS - 1), NOW_MS)).toBe(false);
  });

  test('an old task is not newly created', () => {
    expect(isNewlyCreatedTask({ createdAt: '2026-01-01T00:00:00Z' }, NOW_MS)).toBe(false);
  });

  test('missing createdAt fails closed to false (preview default)', () => {
    expect(isNewlyCreatedTask({}, NOW_MS)).toBe(false);
    expect(isNewlyCreatedTask({ createdAt: null }, NOW_MS)).toBe(false);
    expect(isNewlyCreatedTask({ createdAt: undefined }, NOW_MS)).toBe(false);
  });

  test('null task fails closed to false', () => {
    expect(isNewlyCreatedTask(null, NOW_MS)).toBe(false);
    expect(isNewlyCreatedTask(undefined, NOW_MS)).toBe(false);
  });

  test('garbage timestamps fail closed to false', () => {
    expect(isNewlyCreatedTask({ createdAt: 'not-a-date' }, NOW_MS)).toBe(false);
    expect(isNewlyCreatedTask('', NOW_MS)).toBe(false);
    expect(isNewlyCreatedTask({ createdAt: 12345 }, NOW_MS)).toBe(false);
  });

  test('defaults nowMs to Date.now so live callers pass nothing', () => {
    expect(isNewlyCreatedTask({ createdAt: new Date().toISOString() })).toBe(true);
    expect(isNewlyCreatedTask({ createdAt: '2020-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('resolveDefaultGoalMode', () => {
  test.each([
    // Preview-except-new: newly-created wins over executing, everything
    // else opens in preview.
    [{ isExecuting: false, isNewlyCreated: false }, 'preview'],
    [{ isExecuting: true, isNewlyCreated: false }, 'preview'],
    [{ isExecuting: false, isNewlyCreated: true }, 'edit'],
    [{ isExecuting: true, isNewlyCreated: true }, 'edit'],
  ])('resolveDefaultGoalMode(%j) => %s', (input, expected) => {
    expect(resolveDefaultGoalMode(input)).toBe(expected);
  });

  test('defaults to preview when called with no args', () => {
    expect(resolveDefaultGoalMode()).toBe('preview');
  });
});
