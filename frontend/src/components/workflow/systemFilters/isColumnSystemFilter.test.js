// Run in the lighter node environment: pure registry logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { isColumnSystemFilter } from './isColumnSystemFilter';
import { registerSystemFilter } from './registerSystemFilter';

/***
 * MARK: isColumnSystemFilter tests
 * @description Unit tests for the column-scoping lookup: only registry entries
 *   carrying `hidesColumns: true` hide board columns. Task-level filters
 *   (`failed`, `human`) and unknown ids never do.
 ***/

describe('isColumnSystemFilter', () => {
  test('task-level filters never hide columns', () => {
    expect(isColumnSystemFilter('failed')).toBe(false);
    expect(isColumnSystemFilter('human')).toBe(false);
  });

  test('native running + tasked hide columns', () => {
    expect(isColumnSystemFilter('running')).toBe(true);
    expect(isColumnSystemFilter('tasked')).toBe(true);
    expect(isColumnSystemFilter('Running')).toBe(true);
  });

  test('registered entries with hidesColumns hide columns', () => {
    registerSystemFilter({
      id: 'test-only-column-filter',
      label: 'Column',
      description: 'Test-only column filter.',
      match: () => true,
      hidesColumns: true,
    });
    expect(isColumnSystemFilter('test-only-column-filter')).toBe(true);
    expect(isColumnSystemFilter('TEST-ONLY-COLUMN-FILTER')).toBe(true);
  });

  test('registered entries without hidesColumns do not hide columns', () => {
    registerSystemFilter({
      id: 'test-only-task-filter',
      match: () => true,
    });
    expect(isColumnSystemFilter('test-only-task-filter')).toBe(false);
  });

  test('unknown and malformed ids never hide columns', () => {
    expect(isColumnSystemFilter('bogus')).toBe(false);
    expect(isColumnSystemFilter('')).toBe(false);
    expect(isColumnSystemFilter(null)).toBe(false);
    expect(isColumnSystemFilter(undefined)).toBe(false);
  });
});
