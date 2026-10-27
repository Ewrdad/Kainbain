import React from 'react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from './context/KainBainContext';

/**
 * MARK: renderWithKainBain
 * @description Test helper that renders a component inside a mock KainBain
 * context, so individual components can be unit-tested in isolation.
 * The tree renders inside a MemoryRouter (default entry `/`) so components
 * using router hooks (useParams/useNavigate for docs/task routes) work and
 * no test touches the real `window.location.hash`.
 * @param {React.ReactElement} ui
 * @param {Object} [overrides] - Partial context value overrides.
 * @param {Object} [options]
 * @param {string[]} [options.initialEntries] - MemoryRouter initial entries.
 * @returns {Object} The rendered result.
 */
export function renderWithKainBain(ui, overrides = {}, options = {}) {
  const { initialEntries = ['/'] } = options;
  const value = {
    view: 'orchestrator',
    setView: () => {},
    computeRunning: false,
    tasks: [],
    workflows: [],
    newTaskGoal: '',
    setNewTaskGoal: () => {},
    workflowId: '',
    setWorkflowId: () => {},
    isFollowUp: false,
    setIsFollowUp: () => {},
    selectedTask: null,
    setSelectedTask: () => {},
    isSettingsOpen: false,
    setIsSettingsOpen: () => {},
    projects: [],
    activeProjectId: 'proj-1',
    isProjectDropdownOpen: false,
    setIsProjectDropdownOpen: () => {},
    stages: [],
    currentStageId: null,
    messages: [],
    toolCalls: [],
    isAgentRunning: false,
    previewPrompt: null,
    feedbackTask: null,
    uiPreferences: {
      theme: 'dark',
      density: 'comfortable',
      fontSize: 'medium',
      fontMono: 'jetbrains',
      reduceMotion: false,
      columnWidth: '280px',
      showNowPlayingBar: true,
      showRunnerBoxes: true,
      activityDrawerDefaultOpen: false,
      keepScreenAwakeOnMonitor: true,
      showTaskId: true,
      showStageBadge: true,
      showTimeInStage: true,
      cardPreviewLines: 2,
      taskCardDensity: 'compact',
      taskSort: 'manual',
      defaultShowCompletedTasks: false,
      enableAudioChimes: false,
      autoScrollLogs: true,
      enableKeyboardShortcuts: true,
      showKeyboardHints: true,
    },
    updateUiPreference: () => {},
    updateUiPreferences: () => {},
    resetUiPreferences: () => {},
    exportUiPreferences: () => '{}',
    importUiPreferences: () => ({ success: true }),
    isCustomizationModalOpen: false,
    setIsCustomizationModalOpen: () => {},
    isShortcutsModalOpen: false,
    setIsShortcutsModalOpen: () => {},
    isSystemGuideOpen: false,
    setIsSystemGuideOpen: () => {},
    notifications: [],
    addNotification: () => {},
    dismissNotification: () => {},
    clearAllNotifications: () => {},
    notifySuccess: () => {},
    notifyInfo: () => {},
    notifyWarning: () => {},
    notifyError: () => {},
    lastChatProgress: null,
    toggleCompute: () => {},
    submitTask: () => {},
    confirmSubmitTask: () => {},
    cancelPreview: () => {},
    startWorkflow: () => {},
    handleUpdateStage: () => {},
    handleAddStage: () => {},
    handleRemoveStage: () => {},
    handleReorderStages: () => {},
    saveStages: () => {},
    jumpToStage: () => {},
    skipStage: () => {},
    selectProject: () => {},
    createProject: () => {},
    registerProject: () => {},
    advanceTask: () => {},
    retryTasks: () => Promise.resolve([]),
    rejectTask: () => {},
    rejectTaskWithFeedback: () => {},
    openFeedbackDialog: () => {},
    closeFeedbackDialog: () => {},
    jumpTask: () => {},
    moveTask: () => {},
    completeTask: () => {},
    updateTask: () => {},
    refreshTasks: () => {},
    // Pending task-editor save flush (checkpoint approve/reject gating)
    setPendingTaskSaveFlush: () => {},
    hasPendingTaskSaveFlush: () => false,
    flushPendingTaskSave: () => Promise.resolve(),
    ...overrides,
  };

  return {
    value,
    ...require('@testing-library/react').render(
      <MemoryRouter initialEntries={initialEntries}>
        <KainBainContext.Provider value={value}>{ui}</KainBainContext.Provider>
      </MemoryRouter>,
    ),
  };
}
