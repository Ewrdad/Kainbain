import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import { screen, fireEvent } from '@testing-library/react';

const sectionFor = (container, id) => container.querySelector(`section[data-stage-id="${id}"]`);

test('collapse non-human columns when filter is Human only', () => {
  const collapsibleStages = [
    { id: '1', name: 'Idea', type: 'agent' },
    { id: '2', name: 'Review', type: 'human' },
    { id: '3', name: 'Deploy', type: 'deploy' },
  ];
  const collapsibleTasks = [
    {
      id: 'task-1',
      title: 'Agent Task',
      goal: 'Agent Task',
      currentStageId: '1',
      status: 'in_stage',
    },
    {
      id: 'task-2',
      title: 'Human Checkpoint Task',
      goal: 'Human Checkpoint Task',
      currentStageId: '2',
      status: 'in_stage',
    },
    {
      id: 'task-3',
      title: 'Waiting Human Build',
      goal: 'Waiting Human Build',
      currentStageId: '3',
      status: 'waiting_human',
    },
  ];

  const { container } = renderWithKainBain(<WorkflowCanvas />, {
    stages: collapsibleStages,
    tasks: collapsibleTasks,
    activeProjectId: 'proj-1',
  });

  // Initially expanded everywhere
  expect(screen.getByTestId('stage-analytics-1')).toBeInTheDocument();
  expect(screen.getByTestId('stage-analytics-3')).toBeInTheDocument();

  const searchInput = screen.getByRole('combobox', { name: 'Search tasks' });
  fireEvent.change(searchInput, { target: { value: '!human' } });

  // Idea (agent, 0 visible) collapses to a rail
  expect(sectionFor(container, '1')).toHaveAttribute('data-collapsed', 'true');
  expect(sectionFor(container, '1')).toHaveAttribute('aria-label', 'Idea (collapsed)');
  expect(screen.queryByTestId('stage-analytics-1')).not.toBeInTheDocument();

  // Its Stage Settings trigger is gone (BLOCKER-1 regression lock)
  expect(screen.queryByLabelText(/Configure stage Idea/i)).not.toBeInTheDocument();

  // Deploy stays open — it holds a visible waiting_human card
  expect(sectionFor(container, '3')).not.toHaveAttribute('data-collapsed', 'true');
  expect(screen.getByText('Waiting Human Build')).toBeInTheDocument();

  // Human Review gate stays open
  expect(sectionFor(container, '2')).not.toHaveAttribute('data-collapsed', 'true');

  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(sectionFor(container, '1')).not.toHaveAttribute('data-collapsed', 'true');
  expect(screen.queryByLabelText(/Configure stage Idea/i)).toBeInTheDocument();
});

test('collapsed rail badge counts only active tasks, excluding completed ones', () => {
  const badgeStages = [
    { id: '1', name: 'Idea', type: 'agent' },
    { id: '2', name: 'Review', type: 'human' },
    { id: '3', name: 'Archive', type: 'deploy' },
  ];
  const badgeTasks = [
    {
      id: 't-1',
      title: 'Finished Idea',
      goal: 'Finished Idea',
      currentStageId: '1',
      status: 'completed',
    },
    {
      id: 't-2',
      title: 'Legacy Done Idea',
      goal: 'Legacy Done Idea',
      currentStageId: '1',
      status: 'done',
    },
    {
      id: 't-3',
      title: 'Active Idea',
      goal: 'Active Idea',
      currentStageId: '1',
      status: 'in_stage',
    },
    {
      id: 't-4',
      title: 'Archived Build',
      goal: 'Archived Build',
      currentStageId: '3',
      status: 'completed',
    },
    {
      id: 't-5',
      title: 'Human Checkpoint Task',
      goal: 'Human Checkpoint Task',
      currentStageId: '2',
      status: 'in_stage',
    },
  ];

  const { container } = renderWithKainBain(<WorkflowCanvas />, {
    stages: badgeStages,
    tasks: badgeTasks,
    activeProjectId: 'proj-1',
  });

  // Completed tasks stay hidden while the toggle is off
  expect(screen.queryByText('Finished Idea')).not.toBeInTheDocument();

  const searchInput = screen.getByRole('combobox', { name: 'Search tasks' });
  fireEvent.change(searchInput, { target: { value: '!human' } });

  // Idea collapses: none of its tasks match the human filter
  expect(sectionFor(container, '1')).toHaveAttribute('data-collapsed', 'true');
  // Archive collapses too: it holds only a completed task
  expect(sectionFor(container, '3')).toHaveAttribute('data-collapsed', 'true');

  // Idea badge counts active work only: t-3 (in_stage) — completed t-1/t-2 are excluded
  expect(screen.getByTestId('collapsed-badge-1')).toHaveTextContent('1');
  // Archive badge reports 0: its only task is completed
  expect(screen.getByTestId('collapsed-badge-3')).toHaveTextContent('0');

  // Showing completed tasks must not inflate the badge counts (human filter
  // still hides non-human-stage tasks, so both rails remain collapsed)
  fireEvent.click(screen.getByText(/Show Completed/));
  expect(screen.getByTestId('collapsed-badge-1')).toHaveTextContent('1');
  expect(screen.getByTestId('collapsed-badge-3')).toHaveTextContent('0');
  expect(sectionFor(container, '1')).toHaveAttribute('data-collapsed', 'true');

  // Back to All: columns expand and the collapsed badges disappear
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(sectionFor(container, '1')).not.toHaveAttribute('data-collapsed', 'true');
  expect(screen.queryByTestId('collapsed-badge-1')).not.toBeInTheDocument();
  expect(screen.queryByTestId('collapsed-badge-3')).not.toBeInTheDocument();
});
