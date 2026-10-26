// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { getTaskBranchName, buildCheckoutCommand } from './taskBranch';

/***
 * MARK: taskBranch tests
 * @description Verifies the client-side branch/command derivation that powers
 *   the Copy Checkout buttons: persisted branch wins, otherwise the name is
 *   derived as kb/<taskId> (mirroring api/work/taskBranches.js), and the
 *   checkout command is an exact fetch + checkout string.
 ***/
describe('getTaskBranchName', () => {
  test('returns the persisted branch when present', () => {
    expect(getTaskBranchName({ id: 'task-1', branch: 'kb/custom-name' })).toBe('kb/custom-name');
  });

  test('derives kb/<taskId> when no branch is persisted', () => {
    expect(getTaskBranchName({ id: 'task-101' })).toBe('kb/task-101');
  });

  test('returns null when the task has no id', () => {
    expect(getTaskBranchName({})).toBeNull();
    expect(getTaskBranchName(null)).toBeNull();
    expect(getTaskBranchName(undefined)).toBeNull();
  });
});

describe('buildCheckoutCommand', () => {
  test('builds the exact fetch + checkout command', () => {
    expect(buildCheckoutCommand('kb/task-101')).toBe(
      'git fetch origin && git checkout kb/task-101',
    );
  });

  test('returns null for a missing branch', () => {
    expect(buildCheckoutCommand(null)).toBeNull();
    expect(buildCheckoutCommand(undefined)).toBeNull();
    expect(buildCheckoutCommand('')).toBeNull();
  });
});
