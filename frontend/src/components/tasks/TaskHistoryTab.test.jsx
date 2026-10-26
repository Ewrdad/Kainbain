import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskHistoryTab } from './TaskHistoryTab';
import '@testing-library/jest-dom';

const props = {
  auditEvents: [],
  timelineDotClass: () => 'bg-primary',
  timelineTextClass: () => 'text-primary',
  onOpenReport: undefined,
};

describe('TaskHistoryTab diff badge', () => {
  test('shows a +N -M badge beside duration for entries with diff data', () => {
    render(
      <TaskHistoryTab
        {...props}
        timelineData={[
          {
            stage: 'Implementation',
            status: 'Advanced',
            timestamp: '2026-09-23T10:00:00.000Z',
            duration: '12s',
            additions: 12,
            deletions: 3,
          },
        ]}
      />,
    );
    expect(screen.getByText('+12')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText(/12s/)).toBeInTheDocument();
  });

  test('renders legacy entries without diff data exactly as before', () => {
    const { container } = render(
      <TaskHistoryTab
        {...props}
        timelineData={[
          {
            stage: 'Idea',
            status: 'Moved',
            timestamp: '2026-09-20T10:00:00.000Z',
            duration: '5s',
          },
        ]}
      />,
    );
    expect(screen.getByText(/5s/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\+\d/);
  });
});

describe('TaskHistoryTab run attribution badge', () => {
  test('shows the harness · model footnote on the meta line for attributed rows', () => {
    render(
      <TaskHistoryTab
        {...props}
        timelineData={[
          {
            stage: 'Implementation',
            status: 'Advanced',
            timestamp: '2026-10-15T10:00:00.000Z',
            duration: '12s',
            harnessId: 'pi',
            modelRef: 'mistral::large',
            aliasName: 'worker',
          },
        ]}
      />,
    );
    expect(screen.getByText('pi · mistral::large · alias worker')).toBeInTheDocument();
    // The badge rides the existing meta line, off to the side.
    expect(screen.getByText(/12s/)).toBeInTheDocument();
  });

  test('renders no attribution badge node for unattributed rows (ci/human)', () => {
    const { container } = render(
      <TaskHistoryTab
        {...props}
        timelineData={[
          {
            stage: 'CI',
            status: 'Advanced',
            timestamp: '2026-10-15T11:00:00.000Z',
            duration: '4s',
          },
        ]}
      />,
    );
    expect(container.textContent).not.toContain('no model');
    expect(container.textContent).not.toContain('automated');
    expect(container.textContent).not.toContain('· alias');
  });
});
