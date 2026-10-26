import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccentTheme } from './useAccentTheme';

/***
 * MARK: useAccentTheme tests
 * @description Pins per-project accent tinting: the active project's color
 * lands on :root as CSS variables, and project switch re-tints.
 ***/
describe('useAccentTheme', () => {
  it('writes accent variables for the active project', () => {
    const root = document.documentElement;
    root.style.removeProperty('--accent-hex');
    renderHook(() =>
      useAccentTheme({
        projects: {
          activeProjectId: 'p1',
          projects: [{ id: 'p1', accentColor: '#38bdf8' }],
        },
      }),
    );
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#38bdf8');
  });

  it('re-tints when the active project changes', () => {
    const root = document.documentElement;
    const { rerender } = renderHook(
      ({ activeProjectId }) =>
        useAccentTheme({
          projects: {
            activeProjectId,
            projects: [
              { id: 'p1', accentColor: '#38bdf8' },
              { id: 'p2', accentColor: '#fbbf24' },
            ],
          },
        }),
      { initialProps: { activeProjectId: 'p1' } },
    );
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#38bdf8');
    rerender({ activeProjectId: 'p2' });
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#fbbf24');
  });
});
