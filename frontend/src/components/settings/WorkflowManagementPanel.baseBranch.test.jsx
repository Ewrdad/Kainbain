import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowManagementPanel } from './WorkflowManagementPanel';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowManagementPanel base branch tests
 * @description Covers the per-pipeline base branch setting: the create form
 *   sends the base, each workflow card shows and edits it, blank clears back
 *   to the repo default, validation errors surface, and mixed pipelines
 *   display correctly.
 ***/

function renderPanel(workflows, overrides = {}) {
  const context = {
    projects: [{ id: 'p1', name: 'Project A' }],
    activeProjectId: 'p1',
    projectWorkflows: workflows,
    activeWorkflowId: workflows[0]?.id,
    switchWorkflow: vi.fn(),
    createWorkflow: vi.fn().mockResolvedValue({}),
    updateWorkflowDetails: vi.fn().mockResolvedValue({}),
    deleteWorkflow: vi.fn(),
    ...overrides,
  };
  renderWithKainBain(<WorkflowManagementPanel projectId="p1" />, context);
  return context;
}

const WORKFLOWS = [
  { id: 'wf-1', name: 'Feature Track', isDefault: true, stages: [], baseBranch: 'feature/x' },
  { id: 'wf-2', name: 'Main Track', isDefault: false, stages: [] },
];

describe('WorkflowManagementPanel base branch', () => {
  it('shows the configured base or the repo default on each card', () => {
    renderPanel(WORKFLOWS);
    expect(screen.getByText('feature/x')).toBeInTheDocument();
    expect(screen.getByText('repo default')).toBeInTheDocument();
  });

  it('sends the base branch when creating a workflow', async () => {
    const context = renderPanel(WORKFLOWS);
    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: 'Release Track' },
    });
    fireEvent.change(screen.getByLabelText('Base branch'), {
      target: { value: 'release/next' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));

    await waitFor(() => {
      expect(context.createWorkflow).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Release Track', baseBranch: 'release/next' }),
      );
    });
  });

  it('omits the base branch when the create field is blank', async () => {
    const context = renderPanel(WORKFLOWS);
    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: 'Plain Track' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));

    await waitFor(() => {
      expect(context.createWorkflow).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Plain Track' }),
      );
    });
    const payload = context.createWorkflow.mock.calls[0][1];
    expect(payload.baseBranch).toBeUndefined();
  });

  it('edits and saves the base branch inline with a re-point warning', async () => {
    const context = renderPanel(WORKFLOWS);
    fireEvent.click(screen.getByRole('button', { name: 'Edit base branch for Feature Track' }));
    fireEvent.change(screen.getByLabelText('Base branch for Feature Track'), {
      target: { value: 'feature/y' },
    });
    const editor = screen.getByLabelText('Base branch for Feature Track').closest('div');
    fireEvent.click(
      Array.from(editor.querySelectorAll('button')).find((b) => b.textContent === 'Save'),
    );

    await waitFor(() => {
      expect(context.updateWorkflowDetails).toHaveBeenCalledWith('p1', 'wf-1', {
        baseBranch: 'feature/y',
      });
    });
    expect(
      await screen.findByText(/in-flight tasks keep their pinned base branch/i),
    ).toBeInTheDocument();
  });

  it('clears the base branch back to the repo default with a blank save', async () => {
    const context = renderPanel(WORKFLOWS);
    fireEvent.click(screen.getByRole('button', { name: 'Edit base branch for Feature Track' }));
    fireEvent.change(screen.getByLabelText('Base branch for Feature Track'), {
      target: { value: '   ' },
    });
    const editor = screen.getByLabelText('Base branch for Feature Track').closest('div');
    fireEvent.click(
      Array.from(editor.querySelectorAll('button')).find((b) => b.textContent === 'Save'),
    );

    await waitFor(() => {
      expect(context.updateWorkflowDetails).toHaveBeenCalledWith('p1', 'wf-1', {
        baseBranch: '',
      });
    });
  });

  it('surfaces server validation errors and blocks obvious mistakes', async () => {
    const context = renderPanel(WORKFLOWS, {
      updateWorkflowDetails: vi.fn().mockRejectedValue(new Error('Invalid base branch')),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit base branch for Main Track' }));
    fireEvent.change(screen.getByLabelText('Base branch for Main Track'), {
      target: { value: 'feature/ok' },
    });
    const editor = screen.getByLabelText('Base branch for Main Track').closest('div');
    fireEvent.click(
      Array.from(editor.querySelectorAll('button')).find((b) => b.textContent === 'Save'),
    );
    expect(await screen.findByText('Invalid base branch')).toBeInTheDocument();

    // Obvious client-side mistake: spaces never reach the server. The name is
    // filled so the submit reaches base-branch validation (an empty name
    // refuses the submit before any field is validated).
    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: 'Spaced Track' },
    });
    fireEvent.change(screen.getByLabelText('Base branch'), {
      target: { value: 'has space' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));
    expect(await screen.findByText(/cannot contain spaces/i)).toBeInTheDocument();
    expect(context.createWorkflow).not.toHaveBeenCalled();
  });

  it('hints at other invalid names without blocking valid ones', async () => {
    const context = renderPanel(WORKFLOWS);
    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: 'Hint Track' },
    });
    for (const [bad, hint] of [
      ['-leading', /cannot start with/i],
      ['trailing.', /cannot end with/i],
      ['has..dots', /cannot contain '\.\.', '\/\/' or '@\{'/i],
      ['bad;char', /can only use letters/i],
    ]) {
      fireEvent.change(screen.getByLabelText('Base branch'), {
        target: { value: bad },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));
      expect(await screen.findByText(hint)).toBeInTheDocument();
    }
    expect(context.createWorkflow).not.toHaveBeenCalled();

    // A valid name sails through the hint to the server.
    fireEvent.change(screen.getByLabelText('Base branch'), {
      target: { value: 'feature/ok-name.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));
    await waitFor(() => {
      expect(context.createWorkflow).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ baseBranch: 'feature/ok-name.1' }),
      );
    });
  });
});
