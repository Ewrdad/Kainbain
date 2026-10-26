import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { titleForView, useDocumentTitle } from './useDocumentTitle';

function Titled({ title }) {
  useDocumentTitle(title);
  return null;
}

describe('titleForView (WCAG 2.4.2)', () => {
  it('titles every in-scope view distinctly', () => {
    const titles = new Set(
      ['orchestrator', 'explorer', 'settings', 'observability', 'docs', 'retrospective'].map(
        (v) => titleForView(v, { projectName: 'MyProject' }),
      ),
    );
    expect(titles.size).toBe(6);
    for (const t of titles) {
      expect(t).toMatch(/Kainbain/);
    }
  });

  it('follows the [Running/Paused] Kainbain - Project - page format', () => {
    expect(
      titleForView('orchestrator', { computeRunning: true, projectName: 'MyProject' }),
    ).toBe('[Running] Kainbain - MyProject - Orchestrator');
    expect(titleForView('explorer', { computeRunning: false, projectName: 'MyProject' })).toBe(
      '[Paused] Kainbain - MyProject - Files & Repo',
    );
  });

  it('marks a running engine as Running and anything else as Paused', () => {
    expect(titleForView('settings', { computeRunning: true, projectName: 'P' })).toMatch(
      /^\[Running\]/,
    );
    expect(titleForView('settings', { computeRunning: false, projectName: 'P' })).toMatch(
      /^\[Paused\]/,
    );
    expect(titleForView('settings', { projectName: 'P' })).toMatch(/^\[Paused\]/);
    expect(titleForView('settings', { computeRunning: undefined, projectName: 'P' })).toMatch(
      /^\[Paused\]/,
    );
  });

  it('omits the project segment when no project name is known', () => {
    expect(titleForView('orchestrator', { computeRunning: false })).toBe(
      '[Paused] Kainbain - Orchestrator',
    );
    expect(titleForView('orchestrator', { computeRunning: true, projectName: '  ' })).toBe(
      '[Running] Kainbain - Orchestrator',
    );
  });

  it('includes the task key on task-scoped views', () => {
    expect(
      titleForView('task-detail', { taskKey: 'task-1', projectName: 'MyProject' }),
    ).toBe('[Paused] Kainbain - MyProject - Task task-1');
    expect(
      titleForView('task-review', { taskKey: 'task-1', projectName: 'MyProject' }),
    ).toBe('[Paused] Kainbain - MyProject - Review task-1');
  });

  it('falls back gracefully for unknown views', () => {
    expect(titleForView('nope', { projectName: 'MyProject' })).toBe(
      '[Paused] Kainbain - MyProject',
    );
    expect(titleForView(undefined, { projectName: 'MyProject' })).toBe(
      '[Paused] Kainbain - MyProject',
    );
    expect(titleForView('nope')).toBe('[Paused] Kainbain');
  });

  it('stays backward compatible with the legacy positional task key', () => {
    expect(titleForView('task-detail', 'task-1')).toBe('[Paused] Kainbain - Task task-1');
    expect(titleForView('task-review', 'task-1')).toBe('[Paused] Kainbain - Review task-1');
    expect(titleForView('explorer')).toBe('[Paused] Kainbain - Files & Repo');
  });

  it('accepts legacy positional task key plus trailing options', () => {
    expect(
      titleForView('orchestrator', 'task-1', { computeRunning: true, projectName: 'P' }),
    ).toBe('[Running] Kainbain - P - Orchestrator');
  });
});

describe('useDocumentTitle', () => {
  it('sets and restores document.title', () => {
    const previous = document.title;
    const { unmount } = render(<Titled title="[Paused] Kainbain - Explorer" />);
    expect(document.title).toBe('[Paused] Kainbain - Explorer');
    unmount();
    expect(document.title).toBe(previous);
  });

  it('updates when the view changes', () => {
    const { rerender } = render(
      <Titled title="[Paused] Kainbain - MyProject - Orchestrator" />,
    );
    expect(document.title).toBe('[Paused] Kainbain - MyProject - Orchestrator');
    rerender(<Titled title="[Paused] Kainbain - MyProject - Settings" />);
    expect(document.title).toBe('[Paused] Kainbain - MyProject - Settings');
    expect(screen.queryByTestId('a11y-announcer')).not.toBeInTheDocument();
  });
});
