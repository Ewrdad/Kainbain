import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { QuickActionsPanel } from './QuickActionsPanel';
import { RetrospectiveProvider, useRetrospective } from './useRetrospective';
import { retrospectiveTaskFixtures } from './__fixtures__/index.js';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { createTask: vi.fn() },
}));
import { api } from '../../services/api';

/***
 * MARK: QuickActionsPanel tests
 * @description Locks the panel wiring: disabled reasons with no selection,
 *   trends seeding, detail navigation, follow-up creation (announced), and
 *   run failures surfaced as errors.
 ***/
function SeedProbe() {
  const { chatSeed } = useRetrospective();
  return <span data-testid="seed-probe">{`${chatSeed.nonce}:${chatSeed.text.slice(0, 24)}`}</span>;
}

function renderPanel(selectedIds = [], tasks = retrospectiveTaskFixtures) {
  return renderWithKainBain(
    <RetrospectiveProvider initialSelectedIds={selectedIds}>
      <QuickActionsPanel tasks={tasks} />
      <SeedProbe />
    </RetrospectiveProvider>,
    { activeProjectId: 'proj-1' },
  );
}

describe('QuickActionsPanel', () => {
  it('disables every action with reasons when nothing is selected', () => {
    renderPanel([]);
    const trends = screen.getByTestId('retrospective-action-find-trends');
    expect(trends).toBeDisabled();
    expect(trends).toHaveAttribute('title', expect.stringContaining('at least one'));
    expect(screen.getByTestId('retrospective-action-open-task-detail')).toBeDisabled();
    expect(screen.getByTestId('retrospective-action-create-follow-up')).toBeDisabled();
    expect(screen.getByText('Select tasks to enable actions.')).toBeInTheDocument();
  });

  it('guides an empty selection toward histories search and general chat review', () => {
    renderPanel([]);
    expect(screen.getByText('Select tasks to enable actions.')).toBeInTheDocument();
    expect(
      screen.getByText(/In Task Histories, sort\/filter to find recent tasks/),
    ).toBeInTheDocument();
    expect(screen.getByText(/tick their checkboxes to pin focused context/)).toBeInTheDocument();
    expect(screen.getByText(/the agent can inspect recent jobs with/)).toBeInTheDocument();
  });

  it('seeds the chat for find-trends', async () => {
    renderPanel(['task-failed-2']);
    fireEvent.click(screen.getByTestId('retrospective-action-find-trends'));
    expect(screen.getByTestId('seed-probe')).toHaveTextContent('1:What trends, failure pat');
    await waitFor(() => {
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
        'Find trends in selection done.',
      );
    });
  });

  it('creates a follow-up ticket and announces it', async () => {
    api.createTask.mockResolvedValueOnce({ id: 'new-1', title: 'Follow up: Migrate' });
    renderPanel(['task-failed-2']);
    fireEvent.click(screen.getByTestId('retrospective-action-create-follow-up'));
    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ title: expect.stringContaining('Migrate the session store') }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
        'Create follow-up task created task Follow up: Migrate.',
      );
    });
  });

  it('surfaces run failures as errors', async () => {
    api.createTask.mockRejectedValueOnce(new Error('quota exceeded'));
    renderPanel(['task-failed-2']);
    fireEvent.click(screen.getByTestId('retrospective-action-create-follow-up'));
    await waitFor(() => {
      expect(screen.getByText('quota exceeded')).toBeInTheDocument();
    });
  });
});
