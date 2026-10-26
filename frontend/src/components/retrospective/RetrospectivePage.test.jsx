import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { RetrospectivePage } from './RetrospectivePage';
import { retrospectiveTaskFixtures } from './__fixtures__/index.js';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      listTasks: vi.fn(),
      getTask: vi.fn(),
      retrospectiveChat: vi.fn(),
      createTask: vi.fn(),
    },
  };
});
import { api } from '../../services/api';

/***
 * MARK: RetrospectivePage tests
 * @description Locks the page shell: three panes render behind one provider,
 *   selection in histories enables quick actions, and the page leaves the
 *   document title alone (App.jsx is the single title owner — a second
 *   owner here used to leave "Retrospective" stuck in the tab).
 ***/
describe('RetrospectivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTasks.mockResolvedValue(retrospectiveTaskFixtures);
  });

  it('renders all three panes and leaves the document title alone', async () => {
    document.title = 'previous title';
    renderWithKainBain(<RetrospectivePage />, { activeProjectId: 'proj-1' });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-task-task-done-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('retrospective-page')).toBeInTheDocument();
    expect(screen.getByTestId('retrospective-histories')).toBeInTheDocument();
    expect(screen.getByTestId('retrospective-quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('retrospective-chat')).toBeInTheDocument();
    expect(document.title).toBe('previous title');
  });

  it('guides an empty selection toward histories search and general chat review', async () => {
    renderWithKainBain(<RetrospectivePage />, { activeProjectId: 'proj-1' });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-task-task-done-1')).toBeInTheDocument();
    });
    // Quick actions stay disabled but explain how to find and pin tasks —
    // or leave nothing selected for a general chat review.
    expect(screen.getByText('Select tasks to enable actions.')).toBeInTheDocument();
    expect(
      screen.getByText(/In Task Histories, sort\/filter to find recent tasks/),
    ).toBeInTheDocument();
    expect(screen.getByText('No task context — general chat.')).toBeInTheDocument();
    expect(screen.getByText('The agent may search recent tasks.')).toBeInTheDocument();
  });

  it('shares selection across panes', async () => {
    renderWithKainBain(<RetrospectivePage />, { activeProjectId: 'proj-1' });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-task-task-done-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('retrospective-action-find-trends')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Select Add pagination to the task list as chat context'));
    expect(screen.getByTestId('retrospective-action-find-trends')).toBeEnabled();
    expect(screen.getByTestId('retrospective-action-context')).toHaveTextContent('1 task selected.');
    expect(screen.getByText('Use selection (1)')).toBeInTheDocument();
  });
});
