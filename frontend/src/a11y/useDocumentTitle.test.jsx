import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { titleForView, useDocumentTitle } from './useDocumentTitle';

function Titled({ title }) {
  useDocumentTitle(title);
  return null;
}

// Centralized expected-format construction: the only place in this file that
// spells out the full title format, so a format change edits expectations
// here instead of a dozen string literals.
function expectedTitle({ project, page }) {
  const segments = ['Kainbain'];
  if (project) segments.push(project);
  if (page) segments.push(page);
  return segments.join(' - ');
}

describe('titleForView (WCAG 2.4.2)', () => {
  it('titles every in-scope view distinctly', () => {
    const titles = new Set(
      ['orchestrator', 'explorer', 'settings', 'observability', 'docs', 'retrospective', 'accessibility'].map(
        (v) => titleForView(v, { projectName: 'MyProject' }),
      ),
    );
    expect(titles.size).toBe(7);
    for (const t of titles) {
      expect(t).toMatch(/Kainbain/);
    }
  });

  it('follows the Kainbain - Project - page format', () => {
    expect(
      titleForView('orchestrator', { computeRunning: true, projectName: 'MyProject' }),
    ).toBe(expectedTitle({ project: 'MyProject', page: 'Orchestrator' }));
    expect(titleForView('explorer', { computeRunning: false, projectName: 'MyProject' })).toBe(
      expectedTitle({ project: 'MyProject', page: 'Files & Repo' }),
    );
  });

  it('titles the accessibility statement distinctly', () => {
    expect(titleForView('accessibility', { projectName: 'MyProject' })).toBe(
      expectedTitle({ project: 'MyProject', page: 'Accessibility' }),
    );
  });

  it('carries no status prefix regardless of computeRunning', () => {
    const expected = expectedTitle({ project: 'P', page: 'Settings' });
    for (const computeRunning of [true, false, undefined]) {
      const title = titleForView('settings', { computeRunning, projectName: 'P' });
      expect(title).toBe(expected);
      expect(title).not.toMatch(/^\[(Running|Paused)\]/);
    }
    // Omitting the flag entirely yields the identical title.
    expect(titleForView('settings', { projectName: 'P' })).toBe(expected);
  });

  it('omits the project segment when no project name is known', () => {
    expect(titleForView('orchestrator', { computeRunning: false })).toBe(
      expectedTitle({ page: 'Orchestrator' }),
    );
    expect(titleForView('orchestrator', { computeRunning: true, projectName: '  ' })).toBe(
      expectedTitle({ page: 'Orchestrator' }),
    );
  });

  it('includes the task key on task-scoped views', () => {
    expect(
      titleForView('task-detail', { taskKey: 'task-1', projectName: 'MyProject' }),
    ).toBe(expectedTitle({ project: 'MyProject', page: 'Task task-1' }));
    expect(
      titleForView('task-review', { taskKey: 'task-1', projectName: 'MyProject' }),
    ).toBe(expectedTitle({ project: 'MyProject', page: 'Review task-1' }));
  });

  it('falls back gracefully for unknown views', () => {
    expect(titleForView('nope', { projectName: 'MyProject' })).toBe(
      expectedTitle({ project: 'MyProject' }),
    );
    expect(titleForView(undefined, { projectName: 'MyProject' })).toBe(
      expectedTitle({ project: 'MyProject' }),
    );
    expect(titleForView('nope')).toBe(expectedTitle({}));
  });

  it('stays backward compatible with the legacy positional task key', () => {
    expect(titleForView('task-detail', 'task-1')).toBe(
      expectedTitle({ page: 'Task task-1' }),
    );
    expect(titleForView('task-review', 'task-1')).toBe(
      expectedTitle({ page: 'Review task-1' }),
    );
    expect(titleForView('explorer')).toBe(expectedTitle({ page: 'Files & Repo' }));
  });

  it('accepts legacy positional task key plus trailing options', () => {
    expect(
      titleForView('orchestrator', 'task-1', { computeRunning: true, projectName: 'P' }),
    ).toBe(expectedTitle({ project: 'P', page: 'Orchestrator' }));
  });
});

describe('useDocumentTitle', () => {
  it('sets and restores document.title', () => {
    const previous = document.title;
    const { unmount } = render(
      <Titled title={expectedTitle({ page: 'Explorer' })} />,
    );
    expect(document.title).toBe(expectedTitle({ page: 'Explorer' }));
    unmount();
    expect(document.title).toBe(previous);
  });

  it('updates when the view changes', () => {
    const { rerender } = render(
      <Titled title={expectedTitle({ project: 'MyProject', page: 'Orchestrator' })} />,
    );
    expect(document.title).toBe(expectedTitle({ project: 'MyProject', page: 'Orchestrator' }));
    rerender(
      <Titled title={expectedTitle({ project: 'MyProject', page: 'Settings' })} />,
    );
    expect(document.title).toBe(expectedTitle({ project: 'MyProject', page: 'Settings' }));
    expect(screen.queryByTestId('a11y-announcer')).not.toBeInTheDocument();
  });
});
