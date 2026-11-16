import { expect, test, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowManagementPanel } from './WorkflowManagementPanel';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowManagementPanel overflow tests
 * @description Regression coverage for the Settings › Named Workflows overflow:
 *   very long workflow and stage names must clip inside their cards
 *   (truncation guards + full name on hover) instead of spilling past the
 *   card border. jsdom cannot measure pixels, so these tests assert the
 *   truncation contract (classes, `title`, reachable actions); the visual
 *   proof lives in headless screenshots at 320px / 768px / 1440px.
 ***/

const LONG_SPACED = `Quarterly Release Pipeline for features hotfixes and fast-track experiments ${'repeat '.repeat(30)}final`;
const LONG_SPACELESS = `very-long-workflow-name-without-any-spaces-${'x'.repeat(150)}-final`;
const LONG_STAGE = `Super Long Technical Elaboration And Specification Review Stage Name ${'y'.repeat(80)}`;

function renderPanel(workflows) {
  return renderWithKainBain(<WorkflowManagementPanel projectId="p1" />, {
    projects: [{ id: 'p1', name: 'Project A' }],
    activeProjectId: 'p1',
    projectWorkflows: workflows,
    activeWorkflowId: workflows[0]?.id,
    switchWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    updateWorkflowDetails: vi.fn(),
    deleteWorkflow: vi.fn(),
  });
}

function workflowCard(name) {
  // Each workflow card is the bordered container around its name label.
  const label = screen.getByText(name);
  const card = label.closest('div.p-4');
  expect(card).not.toBeNull();
  return { label, card };
}

test('long workflow names truncate with the full name on hover', () => {
  renderPanel([
    { id: 'wf-1', name: LONG_SPACED, isDefault: true, stages: [] },
    { id: 'wf-2', name: 'Short', isDefault: false, stages: [] },
  ]);

  const { label } = workflowCard(LONG_SPACED);
  expect(label).toHaveClass('min-w-0', 'truncate');
  expect(label).toHaveAttribute('title', LONG_SPACED);
});

test('spaceless 200-char workflow names truncate instead of overflowing', () => {
  expect(LONG_SPACELESS.length).toBeGreaterThan(190);
  expect(LONG_SPACELESS).not.toContain(' ');
  renderPanel([
    { id: 'wf-1', name: 'Short', isDefault: true, stages: [] },
    { id: 'wf-2', name: LONG_SPACELESS, isDefault: false, stages: [] },
  ]);

  const { label, card } = workflowCard(LONG_SPACELESS);
  expect(label).toHaveClass('min-w-0', 'truncate');
  expect(label).toHaveAttribute('title', LONG_SPACELESS);
  // The name's flex container must be shrinkable so the card keeps its width.
  expect(label.parentElement).toHaveClass('min-w-0');
  expect(card).toHaveClass('min-w-0');
});

test('long stage names truncate inside their pills', () => {
  renderPanel([
    {
      id: 'wf-1',
      name: 'Feature Pipeline',
      isDefault: true,
      stages: [
        { id: '1', name: LONG_STAGE, type: 'agent' },
        { id: '2', name: 'Deploy', type: 'ci' },
      ],
    },
  ]);

  const pill = screen.getByText(LONG_STAGE);
  expect(pill).toHaveClass('truncate');
  expect(pill).toHaveAttribute('title', LONG_STAGE);
});

test('badges and action buttons stay reachable next to a long name', () => {
  renderPanel([
    { id: 'wf-1', name: 'Active One', isDefault: true, stages: [] },
    { id: 'wf-2', name: LONG_SPACED, isDefault: false, stages: [] },
  ]);

  const { card } = workflowCard(LONG_SPACED);
  const cardView = within(card);
  // Rename affordance keeps its accessible label with the full name.
  expect(
    cardView.getByRole('button', { name: `Rename workflow ${LONG_SPACED}` }),
  ).toBeInTheDocument();
  // Actions for a non-active, non-default workflow stay in the card.
  expect(cardView.getByRole('button', { name: 'Switch to Active' })).toBeInTheDocument();
  expect(cardView.getByRole('button', { name: 'Make Default' })).toBeInTheDocument();
  expect(cardView.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
});
