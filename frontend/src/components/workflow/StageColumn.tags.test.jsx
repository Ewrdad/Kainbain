import { expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { StageColumn } from './StageColumn';
import '@testing-library/jest-dom';

/***
 * MARK: StageColumn tag chip tests
 * @description Colocated tests for the stage tag chips in the column header:
 *   up to 3 chips plus a +N overflow in the expanded header (tooltip lists all
 *   tags), a tag-count badge on the Human-filter collapsed rail, and no chip
 *   row for untagged stages.
 ***/

const stages = [
  { id: 's-1', name: 'Idea', type: 'agent' },
  { id: 's-2', name: 'Review', type: 'human' },
];

const analytics = {
  byStage: {
    's-1': {
      throughput: 0,
      avgDuration: '--',
      passRate: 100,
      passedCount: 0,
      failedCount: 0,
      activeTasksCount: 2,
    },
  },
};

function baseProps(overrides = {}) {
  return {
    stage: stages[0],
    stageIndex: 0,
    stages,
    currentStageId: 's-1',
    effectiveMobileStageId: 's-1',
    filteredTasks: [],
    searchQuery: '',
    searchQuery: '',
    addingTaskStageId: null,
    expandedSettingsStageId: null,
    draggingStageId: null,
    dragOverStageId: null,
    stageAnalytics: analytics,
    colStyle: { width: '300px' },
    collapsedStyle: { width: '48px' },
    engineState: 'idle',
    isAgentRunning: false,
    uiPreferences: {},
    newTaskTitle: '',
    isSubmittingTask: false,
    pendingStageAction: null,
    activeProjectId: 'p1',
    setAddingTaskStageId: vi.fn(),
    setNewTaskTitle: vi.fn(),
    setExpandedSettingsStageId: vi.fn(),
    setSelectedTask: vi.fn(),
    handleApprove: vi.fn(),
    handleReject: vi.fn(),
    handleExecute: vi.fn(),
    handleCreateTaskInline: vi.fn(),
    handleUpdateStage: vi.fn(),
    saveStages: vi.fn(),
    removeStageAndSave: vi.fn(),
    reorderAndSave: vi.fn(),
    handleStageDragStart: vi.fn(),
    handleStageDragEnd: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    availableModels: [],
    availableHarnesses: [],
    modelsRefreshing: false,
    refreshModels: vi.fn(),
    projectHarnessId: 'pi',
    projectHarnessLabel: 'pi',
    isHarnessDisabled: false,
    skills: [],
    skillsLoading: false,
    skillsError: null,
    fetchSkills: vi.fn(),
    getSkillByName: vi.fn(),
    ...overrides,
  };
}

test('expanded header renders up to 3 tag chips plus a +N overflow with a full tooltip', () => {
  renderWithKainBain(
    <StageColumn
      {...baseProps({
        stage: { ...stages[0], tags: ['PO', 'Dev', 'QA', 'Infra', 'Docs'] },
      })}
    />,
  );
  const chipRow = screen.getByTestId('stage-tag-chips-s-1');
  expect(chipRow).toHaveAttribute('title', 'Tags: PO, Dev, QA, Infra, Docs');
  expect(chipRow).toHaveTextContent('PO');
  expect(chipRow).toHaveTextContent('Dev');
  expect(chipRow).toHaveTextContent('QA');
  // Overflow badge instead of the remaining chips.
  expect(chipRow).toHaveTextContent('+2');
  expect(chipRow).not.toHaveTextContent('Infra');
});

test('expanded header renders all chips when there are 3 or fewer tags', () => {
  renderWithKainBain(
    <StageColumn {...baseProps({ stage: { ...stages[0], tags: ['PO', 'Dev'] } })} />,
  );
  const chipRow = screen.getByTestId('stage-tag-chips-s-1');
  expect(chipRow).toHaveTextContent('PO');
  expect(chipRow).toHaveTextContent('Dev');
  expect(chipRow).not.toHaveTextContent('+');
});

test('expanded header renders no chip row for an untagged stage', () => {
  renderWithKainBain(<StageColumn {...baseProps()} />);
  expect(screen.queryByTestId('stage-tag-chips-s-1')).not.toBeInTheDocument();
});

test('expanded header ignores non-string tag entries (corrupt data stays invisible)', () => {
  renderWithKainBain(
    <StageColumn {...baseProps({ stage: { ...stages[0], tags: ['PO', 42, null, '  '] } })} />,
  );
  const chipRow = screen.getByTestId('stage-tag-chips-s-1');
  expect(chipRow).toHaveTextContent('PO');
  expect(chipRow).not.toHaveTextContent('42');
});

test('human-filter collapsed rail shows a tag-count badge', () => {
  renderWithKainBain(
    <StageColumn
      {...baseProps({
        stage: { ...stages[0], tags: ['PO', 'Dev'] },
        searchQuery: '!human', // agent stage with no visible tasks collapses
      })}
    />,
  );
  expect(screen.getByTestId('collapsed-tags-s-1')).toHaveTextContent('2 tags');
});

test('human-filter collapsed rail shows no tag badge for an untagged stage', () => {
  renderWithKainBain(<StageColumn {...baseProps({ searchQuery: '!human' })} />);
  expect(screen.queryByTestId('collapsed-tags-s-1')).not.toBeInTheDocument();
});
