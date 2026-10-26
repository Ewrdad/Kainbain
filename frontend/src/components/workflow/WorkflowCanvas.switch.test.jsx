import { expect, test, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas.switch tests
 * @description Pipeline-switch regression coverage for the stale checkpoint
 *   bug: after switching pipelines, cards under an AGENT (non-checkpoint)
 *   column must never render AWAITING_REVIEW / Approve / Reject / PR-review
 *   chrome — even when the task payload still carries a stale
 *   `status: 'waiting_human'` or reuses the same stage/task ids as the
 *   previous pipeline's human checkpoint.
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const SPEC_AGENT = [{ id: 's-1', name: 'Specification', type: 'agent' }];
const SPEC_HUMAN = [{ id: 's-1', name: 'Specification', type: 'human' }];

function rerenderCanvas(first, overrides) {
  const nextValue = { ...first.value, ...overrides };
  first.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={nextValue}>
        <WorkflowCanvas />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );
}

function expectNoCheckpointChrome(column) {
  expect(
    within(column).queryByRole('button', { name: /Approve task/i }),
  ).not.toBeInTheDocument();
  expect(
    within(column).queryByRole('button', { name: /Reject task/i }),
  ).not.toBeInTheDocument();
  expect(
    within(column).queryByRole('button', { name: /Open PR review/i }),
  ).not.toBeInTheDocument();
  expect(within(column).queryByText('AWAITING_REVIEW')).not.toBeInTheDocument();
}

test('switching a stage from human to agent drops stale checkpoint chrome on the same task', () => {
  const staleTask = {
    id: 'task-1',
    goal: 'Write the spec',
    currentStageId: 's-1',
    status: 'waiting_human',
  };

  // Pipeline A: human checkpoint — Approve/Reject belong here.
  const first = renderWithKainBain(<WorkflowCanvas />, {
    stages: SPEC_HUMAN,
    tasks: [staleTask],
    activeProjectId: 'proj-1',
  });
  const humanCol = screen.getByText('Specification').closest('section');
  expect(
    within(humanCol).getByRole('button', { name: /Approve task/i }),
  ).toBeInTheDocument();

  // Pipeline B: same stage id + same task id, now an agent stage. The stale
  // `waiting_human` payload must not paint checkpoint UI on the agent column.
  rerenderCanvas(first, { stages: SPEC_AGENT, tasks: [{ ...staleTask }] });
  const agentCol = screen.getByText('Specification').closest('section');
  expectNoCheckpointChrome(agentCol);
});

test('a switch in flight renders a skeleton instead of a mixed stages+tasks frame', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: SPEC_HUMAN,
    tasks: [
      { id: 'task-1', goal: 'Write the spec', currentStageId: 's-1', status: 'waiting_human' },
    ],
    workflowSwitching: true,
    activeProjectId: 'proj-1',
  });
  expect(screen.getByRole('status', { name: 'Switching pipeline' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Approve task/i }),
  ).not.toBeInTheDocument();
});

test('switching workflows re-resolves checkpoint chrome from the active pipeline stages', () => {
  const taskA = {
    id: 'task-1',
    goal: 'Write the spec',
    currentStageId: 's-1',
    status: 'waiting_human',
    workflowId: 'wf-a',
  };
  const projectWorkflows = [
    { id: 'wf-a', name: 'Pipeline A' },
    { id: 'wf-b', name: 'Pipeline B' },
  ];

  const first = renderWithKainBain(<WorkflowCanvas />, {
    stages: SPEC_HUMAN,
    tasks: [taskA],
    projectWorkflows,
    activeWorkflowId: 'wf-a',
    activeProjectId: 'proj-1',
  });
  expect(
    screen.getByRole('button', { name: /Approve task/i }),
  ).toBeInTheDocument();

  // Same task id arrives under pipeline B whose s-1 is an agent stage.
  rerenderCanvas(first, {
    stages: SPEC_AGENT,
    tasks: [{ ...taskA, workflowId: 'wf-b' }],
    projectWorkflows,
    activeWorkflowId: 'wf-b',
  });
  const agentCol = screen.getByText('Specification').closest('section');
  expectNoCheckpointChrome(agentCol);
});
