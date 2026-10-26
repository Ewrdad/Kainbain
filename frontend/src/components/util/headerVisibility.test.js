// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { expect, test } from 'vitest';
import { shouldShowGlobalHeader } from './headerVisibility';

/***
 * MARK: headerVisibility tests
 * @description Black-box tests for the global header visibility rule: hidden
 * only on the views that render their own full-bleed chrome (observability
 * monitor, system-settings screen), shown everywhere else.
 ***/

test('hides the global header on the observability monitor view', () => {
  expect(shouldShowGlobalHeader('observability')).toBe(false);
});

test('hides the global header on the System Settings screen (owns its own h1 chrome)', () => {
  expect(shouldShowGlobalHeader('system-settings')).toBe(false);
});

test('shows the global header on every other known view', () => {
  for (const view of [
    'orchestrator',
    'explorer',
    'settings',
    'docs',
    'task-detail',
    'task',
    'task-review',
  ]) {
    expect(shouldShowGlobalHeader(view)).toBe(true);
  }
});

test('shows the global header for unknown or missing views', () => {
  expect(shouldShowGlobalHeader('')).toBe(true);
  expect(shouldShowGlobalHeader(undefined)).toBe(true);
  expect(shouldShowGlobalHeader(null)).toBe(true);
});
