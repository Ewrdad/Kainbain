// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  filterBlockedByCandidates,
  matchesBlockedByQuery,
  normalizeKbQuery,
} from './blockedByCandidates';

/***
 * MARK: blockedByCandidates tests
 * @description Covers the Blocked-by candidate rule (every task except self
 *   and completed/`done` tasks) and title / kb-number query matching.
 ***/

describe('normalizeKbQuery', () => {
  test('strips prefix, hash, dash, and case', () => {
    expect(normalizeKbQuery('#KB-73c4')).toBe('73C4');
    expect(normalizeKbQuery('kb73c4')).toBe('73C4');
    expect(normalizeKbQuery('73c4')).toBe('73C4');
    expect(normalizeKbQuery('#kb 73c4')).toBe('73C4');
  });

  test('returns empty string for blank or prefix-only queries', () => {
    expect(normalizeKbQuery('')).toBe('');
    expect(normalizeKbQuery('  ')).toBe('');
  });
});

describe('filterBlockedByCandidates', () => {
  const self = { id: 'self-1', title: 'Self', status: 'in_stage' };
  const active = { id: 'task-a', title: 'Build API', status: 'in_stage' };
  const completed = { id: 'task-b', title: 'Old work', status: 'completed' };
  const legacyDone = { id: 'task-c', title: 'Legacy work', status: 'done' };

  test('excludes the edited task itself', () => {
    const result = filterBlockedByCandidates([self, active], 'self-1');
    expect(result.map((t) => t.id)).toEqual(['task-a']);
  });

  test('excludes completed and legacy done tasks', () => {
    const result = filterBlockedByCandidates(
      [self, active, completed, legacyDone],
      'self-1',
    );
    expect(result.map((t) => t.id)).toEqual(['task-a']);
  });

  test('keeps active tasks of any non-terminal status', () => {
    const queued = { id: 'task-d', title: 'Queued', status: 'queued' };
    const result = filterBlockedByCandidates([self, active, queued], 'self-1');
    expect(result.map((t) => t.id)).toEqual(['task-a', 'task-d']);
  });

  test('tolerates missing input', () => {
    expect(filterBlockedByCandidates(undefined, 'self-1')).toEqual([]);
    expect(filterBlockedByCandidates(null, 'self-1')).toEqual([]);
  });
});

describe('matchesBlockedByQuery', () => {
  const task = { id: '73c4560d-1417-4fe1', title: 'Build API', status: 'in_stage' };

  test('blank query matches everything', () => {
    expect(matchesBlockedByQuery(task, '')).toBe(true);
    expect(matchesBlockedByQuery(task, '   ')).toBe(true);
    expect(matchesBlockedByQuery(task, undefined)).toBe(true);
  });

  test('matches title case-insensitively', () => {
    expect(matchesBlockedByQuery(task, 'build')).toBe(true);
    expect(matchesBlockedByQuery(task, 'BUILD api')).toBe(true);
    expect(matchesBlockedByQuery(task, 'deploy')).toBe(false);
  });

  test('matches kb-number with, without, or with partial prefix', () => {
    expect(matchesBlockedByQuery(task, '#KB-73C4')).toBe(true);
    expect(matchesBlockedByQuery(task, '73c4')).toBe(true);
    expect(matchesBlockedByQuery(task, 'kb73c4')).toBe(true);
    expect(matchesBlockedByQuery(task, 'KB-73C4')).toBe(true);
    expect(matchesBlockedByQuery(task, '#KB-9999')).toBe(false);
  });

  test('falls back to goal then id when title is missing', () => {
    expect(
      matchesBlockedByQuery({ id: 'task-g', goal: 'Migrate database' }, 'migrate'),
    ).toBe(true);
    expect(matchesBlockedByQuery({ id: 'unique-id-9' }, 'unique-id')).toBe(true);
    expect(matchesBlockedByQuery({ id: 'unique-id-9' }, 'nope')).toBe(false);
  });

  test('matches raw id substrings', () => {
    expect(matchesBlockedByQuery(task, 'c4560d')).toBe(true);
  });

  test('rejects null tasks', () => {
    expect(matchesBlockedByQuery(null, 'build')).toBe(false);
  });
});
