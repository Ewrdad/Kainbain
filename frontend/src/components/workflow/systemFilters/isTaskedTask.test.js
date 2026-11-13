// Run in the lighter node environment: pure predicate logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { isTaskedTask } from './isTaskedTask';

/***
 * MARK: isTaskedTask tests
 * @description Unit tests for the `!tasked` predicate: every task present in
 *   the board set counts (column visibility is decided by counting tasks per
 *   column, so the predicate itself just proves the task exists).
 ***/

describe('isTaskedTask', () => {
  test('any task object counts, whatever its status', () => {
    expect(isTaskedTask({ id: 't1', status: 'active' })).toBe(true);
    expect(isTaskedTask({ id: 't2', status: 'completed' })).toBe(true);
    expect(isTaskedTask({ id: 't3', status: 'failed' })).toBe(true);
    expect(isTaskedTask({})).toBe(true);
  });

  test('nullish input never counts', () => {
    expect(isTaskedTask(null)).toBe(false);
    expect(isTaskedTask(undefined)).toBe(false);
  });
});
