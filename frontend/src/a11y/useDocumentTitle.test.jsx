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
      [
        'orchestrator',
        'explorer',
        'settings',
        'system-settings',
        'observability',
        'docs',
        'retrospective',
        'accessibility',
      ].map((v) => titleForView(v, { projectName: 'MyProject' })),
    );
    expect(titles.size).toBe(8);
    for (const t of titles) {
      expect(t).toMatch(/Kainbain/);
    }
  });

  it('keeps the tasks view titled like its orchestrator alias', () => {
    expect(titleForView('tasks', { projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Orchestrator',
    );
  });

  it('follows the Kainbain - Project - page format', () => {
    expect(
      titleForView('orchestrator', { computeRunning: true, projectName: 'MyProject' }),
    ).toBe('Kainbain - MyProject - Orchestrator');
    expect(titleForView('explorer', { computeRunning: false, projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Files & Repo',
    );
  });

  it('titles the accessibility statement distinctly', () => {
    expect(titleForView('accessibility', { projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Accessibility',
    );
  });

  it('carries no status prefix regardless of computeRunning', () => {
    const expected = 'Kainbain - P - Settings';
    for (const computeRunning of [true, false, undefined, null, 0, '', {}, []]) {
      const title = titleForView('settings', { computeRunning, projectName: 'P' });
      expect(title).toBe(expected);
      expect(title).not.toMatch(/^\[(Running|Paused)\]/);
    }
    // Omitting the flag entirely yields the identical title.
    expect(titleForView('settings', { projectName: 'P' })).toBe(expected);
  });

  it('omits the project segment when no project name is known', () => {
    expect(titleForView('orchestrator', { computeRunning: false })).toBe(
      'Kainbain - Orchestrator',
    );
    expect(titleForView('orchestrator', { computeRunning: true, projectName: '  ' })).toBe(
      'Kainbain - Orchestrator',
    );
  });

  it('ignores non-string project names instead of leaking them', () => {
    for (const projectName of [null, undefined, 42, {}, ['P']]) {
      expect(titleForView('orchestrator', { projectName })).toBe('Kainbain - Orchestrator');
    }
  });

  it('trims a padded project name', () => {
    expect(titleForView('orchestrator', { projectName: '  MyProject  ' })).toBe(
      'Kainbain - MyProject - Orchestrator',
    );
  });

  it('includes the task key on task-scoped views', () => {
    expect(titleForView('task-detail', { taskKey: 'task-1', projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Task task-1',
    );
    expect(titleForView('task-review', { taskKey: 'task-1', projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Review task-1',
    );
    expect(titleForView('task-survey', { taskKey: 'task-1', projectName: 'MyProject' })).toBe(
      'Kainbain - MyProject - Survey task-1',
    );
    expect(titleForView('task', { taskKey: 'task-1' })).toBe('Kainbain - Task task-1');
  });

  it('falls back to generic task labels when the task key is missing or blank', () => {
    expect(titleForView('task-detail', { projectName: 'P' })).toBe('Kainbain - P - Task detail');
    expect(titleForView('task-review', { taskKey: '  ' })).toBe('Kainbain - Task review');
    expect(titleForView('task-survey', { taskKey: '' })).toBe('Kainbain - Task survey');
  });

  it('shows numeric task keys but never leaks objects into the tab', () => {
    expect(titleForView('task-detail', { taskKey: 123 })).toBe('Kainbain - Task 123');
    for (const taskKey of [{}, [], true, NaN, Infinity]) {
      expect(titleForView('task-detail', { taskKey })).toBe('Kainbain - Task detail');
    }
  });

  it('falls back gracefully for unknown views', () => {
    expect(titleForView('nope', { projectName: 'MyProject' })).toBe('Kainbain - MyProject');
    expect(titleForView(undefined, { projectName: 'MyProject' })).toBe('Kainbain - MyProject');
    expect(titleForView('nope')).toBe('Kainbain');
  });

  it('treats non-string views as unknown instead of throwing', () => {
    for (const view of [null, undefined, 42, {}, []]) {
      expect(titleForView(view, { projectName: 'P' })).toBe('Kainbain - P');
      expect(titleForView(view)).toBe('Kainbain');
    }
  });

  it('trims a padded view key', () => {
    expect(titleForView('  settings  ', { projectName: 'P' })).toBe('Kainbain - P - Settings');
  });

  it('ignores a missing or malformed options argument', () => {
    expect(titleForView('explorer', null)).toBe('Kainbain - Files & Repo');
    expect(titleForView('explorer', undefined)).toBe('Kainbain - Files & Repo');
    expect(titleForView('explorer', 42)).toBe('Kainbain - Files & Repo');
    expect(titleForView('explorer', true)).toBe('Kainbain - Files & Repo');
  });

  it('stays backward compatible with the legacy positional task key', () => {
    expect(titleForView('task-detail', 'task-1')).toBe('Kainbain - Task task-1');
    expect(titleForView('task-review', 'task-1')).toBe('Kainbain - Review task-1');
    expect(titleForView('explorer')).toBe('Kainbain - Files & Repo');
  });

  it('accepts legacy positional task key plus trailing options', () => {
    expect(
      titleForView('orchestrator', 'task-1', { computeRunning: true, projectName: 'P' }),
    ).toBe('Kainbain - P - Orchestrator');
    expect(titleForView('orchestrator', 'task-1', null)).toBe('Kainbain - Orchestrator');
  });
});

describe('useDocumentTitle', () => {
  it('sets and restores document.title', () => {
    const previous = document.title;
    const { unmount } = render(<Titled title="Kainbain - Explorer" />);
    expect(document.title).toBe('Kainbain - Explorer');
    unmount();
    expect(document.title).toBe(previous);
  });

  it('updates when the view changes', () => {
    const { rerender } = render(<Titled title="Kainbain - MyProject - Orchestrator" />);
    expect(document.title).toBe('Kainbain - MyProject - Orchestrator');
    rerender(<Titled title="Kainbain - MyProject - Settings" />);
    expect(document.title).toBe('Kainbain - MyProject - Settings');
    expect(screen.queryByTestId('a11y-announcer')).not.toBeInTheDocument();
  });

  it('falls back to the brand title for missing, blank, or non-string titles', () => {
    const previous = document.title;
    const { unmount, rerender } = render(<Titled title={undefined} />);
    expect(document.title).toBe('Kainbain');
    rerender(<Titled title="   " />);
    expect(document.title).toBe('Kainbain');
    rerender(<Titled title={42} />);
    expect(document.title).toBe('Kainbain');
    unmount();
    expect(document.title).toBe(previous);
  });
});
