// Run in the lighter node environment: pure format function, no DOM needs.
// @vitest-environment node
import { expect, test, describe } from 'vitest';
import { formatMobileMonitorTitle } from './MobileMonitorView';

describe('formatMobileMonitorTitle', () => {
  test('prefers the task title when running', () => {
    expect(
      formatMobileMonitorTitle(
        { title: 'Build user auth' },
        { status: 'running', activeStageName: 'Code Generation' },
        true,
      ),
    ).toBe('Build user auth');
  });

  test('falls back to the goal first line with markdown heading stripped', () => {
    expect(
      formatMobileMonitorTitle(
        { goal: '# Ship the widget\nSecond line' },
        { status: 'running', activeStageName: 'Build' },
        true,
      ),
    ).toBe('Ship the widget');
  });

  test('running without a resolved task shows a no-task label, not the stage', () => {
    expect(
      formatMobileMonitorTitle(
        null,
        { status: 'running', activeStageName: 'Code Generation' },
        true,
      ),
    ).toBe('No active task');
  });

  test('idle with no task keeps the legacy stage/empty text', () => {
    expect(formatMobileMonitorTitle(null, {}, false)).toBe('No active stage');
    expect(formatMobileMonitorTitle(null, { activeStageName: 'Review' }, false)).toBe('Review');
  });

  test('handles null task and empty engineState without crashing', () => {
    expect(formatMobileMonitorTitle(null, {}, true)).toBe('No active task');
    expect(formatMobileMonitorTitle()).toBe('No active stage');
  });
});
