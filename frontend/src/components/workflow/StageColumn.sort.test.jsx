import { expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { StageColumn } from './StageColumn';
import '@testing-library/jest-dom';

/***
 * MARK: StageColumn sort tests
 * @description Verifies the opt-in oldest-first card order: manual (the
 * default) preserves insertion/drag order, while oldest-first surfaces the
 * longest-waiting task per column. Kept in its own file so parallel
 * branches extending StageColumn.test.jsx do not conflict.
 ***/

const NOW = Date.parse('2026-09-30T12:00:00Z');
const at = (secondsBeforeNow) => new Date(NOW - secondsBeforeNow * 1000).toISOString();

const stage = { id: 's-1', name: 'Idea', type: 'agent' };
const stages = [stage, { id: 's-2', name: 'Review', type: 'human' }];

const analytics = {
  byStage: {
    's-1': {
      throughput: 2,
      avgDuration: '3m',
      avgDurationSeconds: 180,
      passRate: 100,
      passedCount: 2,
      failedCount: 0,
      activeTasksCount: 3,
    },
  },
};

function baseProps(overrides = {}) {
  return {
    stage,
    stageIndex: 0,
    stages,
    currentStageId: 's-1',
    effectiveMobileStageId: 's-1',
    filteredTasks: [],
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
    uiPreferences: { taskSort: 'manual', taskCardDensity: 'compact' },
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
    nowMs: NOW,
    ...overrides,
  };
}

const young = { id: 'young', goal: 'Young task', currentStageId: 's-1', enteredStageAt: at(30) };
const old = { id: 'old', goal: 'Old task', currentStageId: 's-1', enteredStageAt: at(300) };
const middle = {
  id: 'middle',
  goal: 'Middle task',
  currentStageId: 's-1',
  enteredStageAt: at(120),
};

test('manual sort (default) preserves insertion order', () => {
  renderWithKainBain(<StageColumn {...baseProps({ filteredTasks: [young, old, middle] })} />, {
    uiPreferences: { taskSort: 'manual', taskCardDensity: 'compact' },
  });
  const cards = screen.getAllByTestId('task-stage-age');
  expect(cards).toHaveLength(3);
  // Insertion order kept: young (30s) renders before old (300s).
  expect(cards[0]).toHaveTextContent('30s');
  expect(cards[1]).toHaveTextContent('5m');
  expect(cards[2]).toHaveTextContent('2m');
});

test('oldest-first sort surfaces the longest-waiting task on top', () => {
  renderWithKainBain(
    <StageColumn
      {...baseProps({
        filteredTasks: [young, old, middle],
        uiPreferences: { taskSort: 'oldest', taskCardDensity: 'compact' },
      })}
    />,
    { uiPreferences: { taskSort: 'oldest', taskCardDensity: 'compact' } },
  );
  const cards = screen.getAllByTestId('task-stage-age');
  expect(cards).toHaveLength(3);
  expect(cards[0]).toHaveTextContent('5m');
  expect(cards[1]).toHaveTextContent('2m');
  expect(cards[2]).toHaveTextContent('30s');
});

test('oldest-first never mutates the stored task order', () => {
  const tasks = [young, old, middle];
  const snapshot = [...tasks];
  renderWithKainBain(
    <StageColumn
      {...baseProps({
        filteredTasks: tasks,
        uiPreferences: { taskSort: 'oldest', taskCardDensity: 'compact' },
      })}
    />,
  );
  expect(tasks).toEqual(snapshot);
});
