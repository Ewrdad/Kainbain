import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { CreateTaskFromFileModal } from './CreateTaskFromFileModal';
import '@testing-library/jest-dom';

/***
 * MARK: CreateTaskFromFileModal tests
 * @description Verifies the "create task from here" dialog: the file
 *   reference pre-fill, pipeline/stage defaults and re-filtering, the exact
 *   submit payload, the double-submit guard, and the failure path that keeps
 *   the dialog open with the user's input intact.
 ***/
describe('CreateTaskFromFileModal', () => {
  const featureStages = [
    { id: 'stage-1', name: 'Idea', type: 'agent' },
    { id: 'stage-2', name: 'Review', type: 'human' },
  ];
  const hotfixStages = [{ id: 'stage-9', name: 'Fix', type: 'agent' }];
  const mockWorkflows = [
    { id: 'wf-1', name: 'Feature', stages: featureStages },
    { id: 'wf-2', name: 'Hotfix', stages: hotfixStages },
  ];
  const createdTask = { id: 'task-123', title: 'Cleanup: api.js' };

  function renderModal(overrides = {}) {
    const onClose = vi.fn();
    const createTask = vi.fn().mockResolvedValue(createdTask);
    const context = {
      projects: [{ id: 'proj-1', name: 'Project Alpha' }],
      activeProjectId: 'proj-1',
      projectWorkflows: mockWorkflows,
      stages: featureStages,
      activeWorkflowId: 'wf-1',
      createTask,
      executeTaskStage: vi.fn().mockResolvedValue({ status: 'running' }),
      setSelectedTask: vi.fn(),
      switchWorkflow: vi.fn().mockResolvedValue({ stages: hotfixStages }),
      ...overrides,
    };
    renderWithKainBain(
      <CreateTaskFromFileModal filePath="src/api.js" onClose={onClose} />,
      context,
    );
    return { onClose, context };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills the title and description with the file reference', () => {
    renderModal();
    expect(screen.getByLabelText('Task title')).toHaveValue('Cleanup: api.js');
    expect(screen.getByLabelText('Task description')).toHaveValue(
      'In reference to: src/api.js\n\n',
    );
  });

  it('defaults to the active pipeline and its first stage', () => {
    renderModal();
    expect(screen.getByRole('combobox', { name: 'Target pipeline' })).toHaveTextContent('Feature');
    expect(screen.getByRole('combobox', { name: 'Target stage' })).toHaveTextContent('Idea');
  });

  it('re-filters stages and resets the selection when the pipeline changes', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('combobox', { name: 'Target pipeline' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Hotfix' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Target stage' })).toHaveTextContent('Fix');
    });
  });

  it('submits the exact payload and closes on success', async () => {
    const { onClose, context } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(context.createTask).toHaveBeenCalledWith('proj-1', {
        title: 'Cleanup: api.js',
        goal: 'In reference to: src/api.js',
        stageId: 'stage-1',
        workflowId: 'wf-1',
      });
    });
    expect(context.switchWorkflow).not.toHaveBeenCalled();
    expect(context.setSelectedTask).toHaveBeenCalledWith(createdTask);
    expect(onClose).toHaveBeenCalled();
  });

  it('switches pipelines when filing onto a non-active pipeline', async () => {
    const { context } = renderModal();

    fireEvent.click(screen.getByRole('combobox', { name: 'Target pipeline' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Hotfix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(context.switchWorkflow).toHaveBeenCalledWith('proj-1', 'wf-2');
      expect(context.createTask).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ stageId: 'stage-9', workflowId: 'wf-2' }),
      );
    });
  });

  it('warns that the agent starts immediately on automated stages', () => {
    renderModal({ activeWorkflowId: 'wf-1' });
    expect(
      screen.getByText(/The agent will start work on this stage immediately/i),
    ).toBeInTheDocument();
  });

  it('guards against double submission', async () => {
    let resolveCreate;
    const gatedCreate = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { onClose, context } = renderModal({ createTask: gatedCreate });

    const submitButton = screen.getByRole('button', { name: 'Create Task' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(gatedCreate).toHaveBeenCalledTimes(1);
    resolveCreate(createdTask);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(context.setSelectedTask).toHaveBeenCalledWith(createdTask);
  });

  it('keeps the dialog open with input preserved when creation fails', async () => {
    renderModal({ createTask: vi.fn().mockRejectedValue(new Error('stage unknown')) });

    fireEvent.change(screen.getByLabelText('Task title'), {
      target: { value: 'Cleanup: api.js (needs tests)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('stage unknown');
    });
    expect(screen.getByText('Create task from here')).toBeInTheDocument();
    expect(screen.getByLabelText('Task title')).toHaveValue('Cleanup: api.js (needs tests)');
    expect(screen.getByLabelText('Task description')).toHaveValue(
      'In reference to: src/api.js\n\n',
    );
  });

  it('disables submission while the stage list is still loading', () => {
    renderModal({ projectWorkflows: [], stages: [], activeWorkflowId: null });
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeDisabled();
  });
});
