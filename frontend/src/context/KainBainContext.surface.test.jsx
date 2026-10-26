import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { KainBainProvider, useKainBain } from './KainBainContext';

vi.mock('../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    activateProject: vi.fn(),
    createProject: vi.fn(),
    healthStatus: vi.fn(),
    computeStatus: vi.fn(),
    listTasks: vi.fn(),
    getTask: vi.fn().mockResolvedValue(null),
    getWorkflow: vi.fn(),
    getWorkflows: vi.fn(),
    sessionHistory: vi.fn(),
    engineStatus: vi.fn(),
    systemStatus: vi.fn(),
  },
  wsUrl: vi.fn(() => 'ws://localhost/ws?projectId=p1'),
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: KainBainContext value-key pin
 * @description Compatibility oracle for the provider split: the context value
 * key set must stay identical while logic moves to domain hooks. Fails on any
 * accidental rename/drop (silent prop drops are the highest-risk regression).
 ***/
describe('KainBainContext value surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    api.listProjects.mockResolvedValue([]);
    api.listTasks.mockResolvedValue([]);
    api.getWorkflow.mockResolvedValue({ stages: [] });
    api.getWorkflows.mockResolvedValue([]);
    api.sessionHistory.mockResolvedValue({ messages: [] });
    api.engineStatus.mockResolvedValue({});
    api.healthStatus.mockResolvedValue({});
    api.computeStatus.mockResolvedValue({ running: false });
    api.activateProject.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the exact pinned context value key set', () => {
    let keys = null;
    function Probe() {
      const ctx = useKainBain();
      keys = Object.keys(ctx).sort();
      return null;
    }
    render(
      <KainBainProvider>
        <Probe />
      </KainBainProvider>,
    );
    expect(keys).toEqual([
      '__registerRouter',
      '__syncRouteLocation',
      'abortTask',
      'activeProject',
      'activeProjectId',
      'activeWorkflowId',
      'addNotification',
      'addProcessLog',
      'advanceTask',
      'cancelPreview',
      'checkTaskStuck',
      'clearAllNotifications',
      'clearLogs',
      'closeFeedbackDialog',
      'completeTask',
      'computeRunning',
      'confirmSubmitTask',
      'connectionStatus',
      'createProject',
      'createTask',
      'createWorkflow',
      'currentStageId',
      'deleteTask',
      'deleteWorkflow',
      'dismissNotification',
      'engineState',
      'executeTaskStage',
      'exportUiPreferences',
      'feedbackTask',
      'fetchHealth',
      'fetchSkills',
      'fetchWorkflow',
      'fetchWorkflows',
      'flushPendingTaskSave',
      'focusedStageId',
      'followUpTask',
      'getSkillByName',
      'getTaskReports',
      'handleAddStage',
      'handleRemoveStage',
      'handleReorderStages',
      'handleUpdateStage',
      'harnessPrefs',
      'harnessPrefsFor',
      'hasPendingTaskSaveFlush',
      'healthState',
      'hiddenProjectIds',
      'importUiPreferences',
      'isAgentRunning',
      'isCustomizationModalOpen',
      'isFollowUp',
      'isHarnessDisabled',
      'isHealthRefreshing',
      'isProjectDropdownOpen',
      'isSettingsOpen',
      'isShortcutsModalOpen',
      'isSystemGuideOpen',
      'jumpTask',
      'jumpToActive',
      'jumpToStage',
      'lastChatProgress',
      'lastReviewEvent',
      'lookBack',
      'lookForward',
      'messages',
      'moveTask',
      'newTaskGoal',
      'notifications',
      'notifyError',
      'notifyInfo',
      'notifySuccess',
      'notifyWarning',
      'openFeedbackDialog',
      'pauseTask',
      'previewPrompt',
      'processLogs',
      'projectWorkflows',
      'projects',
      'refreshTasks',
      'registerProject',
      'rejectTask',
      'rejectTaskWithFeedback',
      'resetHarnessPrefs',
      'resetUiPreferences',
      'restoreSession',
      'resumeTask',
      'retryTask',
      'retryTasks',
      'saveStages',
      'selectProject',
      'selectedTask',
      'setFocusedStageId',
      'setIsCustomizationModalOpen',
      'setIsFollowUp',
      'setIsProjectDropdownOpen',
      'setIsSettingsOpen',
      'setIsShortcutsModalOpen',
      'setIsSystemGuideOpen',
      'setNewTaskGoal',
      'setPendingTaskSaveFlush',
      'setPreviewPrompt',
      'setSelectedTask',
      'setShowArchived',
      'setView',
      'setWorkflowId',
      'showArchived',
      'skills',
      'skillsError',
      'skillsLoading',
      'skipCurrent',
      'skipStage',
      'stages',
      'startWorkflow',
      'steerTask',
      'submitTask',
      'switchWorkflow',
      'tasks',
      'tasksError',
      'tasksLoading',
      'toggleCompute',
      'toggleHideProject',
      'toolCalls',
      'uiPreferences',
      'updateHarnessPref',
      'updateProjectInState',
      'updateTask',
      'updateUiPreference',
      'updateUiPreferences',
      'updateWorkflowDetails',
      'view',
      'visibleProjects',
      'workflowId',
      'workflowLoading',
      'workflowRuns',
      'workflowSwitching',
      'workflows',
    ]);
  });
});
