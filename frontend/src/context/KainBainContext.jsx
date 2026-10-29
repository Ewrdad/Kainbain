import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useContext,
} from 'react';

import { useLocation, useNavigate } from 'react-router';
import { api } from '../services/api';
import { logger } from '../services/logger';
import { useWebSocket } from './useWebSocket';
import { useTasks } from './useTasks';
import { useWorkflow } from './useWorkflow';
import { useProjects } from './useProjects';
import { useSkills } from './useSkills';
import { useUiPreferences } from './useUiPreferences';
import { useHarnessPrefs } from '../hooks/useHarnessPrefs';
import { useNotifications } from './useNotifications';
import { useViewNavigation } from './useViewNavigation';
import { useSelectedTask } from './useSelectedTask';
import { useEngineStatus } from './useEngineStatus';
import { useTaskSubmission } from './useTaskSubmission';
import { useBoardSync } from './useBoardSync';
import { useStageNavigation } from './useStageNavigation';
import { useAccentTheme } from './useAccentTheme';
import { usePendingTaskSave } from './usePendingTaskSave';

/**
 * MARK: KainBainContext
 * @description Centralized state + actions for the KainBain orchestrator.
 * The provider composes small domain hooks so no single file owns all of the
 * app's state. Domain logic lives in: useViewNavigation (router-backed views),
 * useSelectedTask (inspector snapshot + hydration), useEngineStatus (health +
 * compute), useTaskSubmission (goal dispatch + workflow start), useBoardSync
 * (live-sync refs + polling), useStageNavigation (focus + skip), useAccentTheme
 * (per-project tint), usePendingTaskSave (editor flush) — plus the long-lived
 * useWebSocket/useTasks/useWorkflow/useProjects/useSkills/useNotifications
 * collection hooks. This module only wires them and assembles `value`.
 */

const KainBainContext = createContext(null);

export { KainBainContext };

export function KainBainProvider({ children }) {
  const notificationsHook = useNotifications();
  const {
    notifications,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    notifySuccess,
    notifyInfo,
    notifyWarning,
    notifyError,
  } = notificationsHook;

  // Keeps the live board sync handlers pointed at the latest pieces of state
  // without forcing re-creation of the (early-constructed) WebSocket hook.
  const activeProjectIdRef = useRef(null);
  const taskSyncHandlerRef = useRef(null); // (projectId) => void
  const updateProjectInStateRef = useRef(null); // (project) => void
  // Latest engine snapshot for the cross-project owner check below, plus the
  // engine-state setter so an owner update can refresh the bar's
  // project-independent snapshot without rebuilding the socket hook.
  const engineStateRef = useRef(null);
  const setEngineStateRef = useRef(null);
  // Latest REVIEW_UPDATED WS payload. The TaskReviewPage subscribes to this so
  // comment edits elsewhere (another tab) land without a manual refresh.
  const [lastReviewEvent, setLastReviewEvent] = useState(null);
  // Latest CHAT_PROGRESS WS payload. The ChatTurnProvider subscribes to this
  // so the working card scrolls live model output while a turn runs.
  const [lastChatProgress, setLastChatProgress] = useState(null);
  // UI-level chrome state (not owned by a single domain hook).
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSystemGuideOpen, setIsSystemGuideOpen] = useState(false);

  const ws = useWebSocket({
    onNotification: addNotification,
    // Live board sync: a task changed / was deleted elsewhere (drag in another
    // tab, agent stage advance, create). Route it to a coalesced task refresh
    // so the board reflects the new position without a page refresh.
    onTaskUpdated: (task) => {
      // Single-pipeline bar: the engine owner lives outside the selected
      // project after a switch, and its frames would be dropped below. Keep
      // the project-independent snapshot (`engineState.activeTask`) fresh so
      // the bar tracks the owner's live title/status while the board below
      // still filters per project.
      if (
        task?.id != null &&
        engineStateRef.current?.activeTaskId != null &&
        String(task.id) === String(engineStateRef.current.activeTaskId)
      ) {
        setEngineStateRef.current?.((prev) =>
          prev && String(prev.activeTaskId) === String(task.id)
            ? { ...prev, activeTask: task }
            : prev,
        );
      }
      const pid = activeProjectIdRef.current;
      if (!pid) return;
      // The socket is project-bound but the backend broadcasts globally; ignore
      // updates for a different project so no stray cross-project card appears.
      if (task && task.projectId && String(task.projectId) !== String(pid)) return;
      // Merge the live payload straight onto the board so a task created or
      // moved elsewhere (another tab, the agent itself) appears/updates
      // instantly, then still run the coalesced full fetch below to reconcile
      // anything the snapshot misses.
      tasks.upsertTask?.(task);
      taskSyncHandlerRef.current?.(pid);
    },
    onTaskDeleted: ({ projectId } = {}) => {
      const pid = activeProjectIdRef.current;
      if (!pid) return;
      if (projectId && String(projectId) !== String(pid)) return;
      taskSyncHandlerRef.current?.(pid);
    },
    // PR review: comment mutations from anywhere (another tab, the review
    // page itself) surface here so the open review view can merge them live.
    onReviewUpdated: (event) => {
      setLastReviewEvent({ ...event, _seq: Date.now() });
    },
    // Chat progress: streamed tails for the in-flight turn (matched by
    // turnId in the ChatTurnProvider; other tabs' turns are ignored there).
    onChatProgress: (event) => {
      setLastChatProgress({ ...event, _seq: Date.now() });
    },
    // App link: a "Go to App" record changed elsewhere (script PATCH, agent
    // skill, health probe) — merge it so the link appears without a refresh.
    // The project list is global (not active-project scoped), so every
    // update merges; unknown ids are a no-op in updateProjectInState.
    onProjectUpdated: (project) => {
      if (project?.id) updateProjectInStateRef.current?.(project);
    },
    // After a reconnect (or initial connect), catch up any board-position
    // changes that occurred while disconnected or in a throttled background tab.
    onReconnect: (projectId) => taskSyncHandlerRef.current?.(projectId),
  });
  const tasks = useTasks({ onNotification: addNotification });
  const workflow = useWorkflow({ onNotification: addNotification });

  // Destructure the stable hook functions so callbacks can list precise deps
  // instead of depending on the (per-render) hook objects.
  const { connectWebSocket, setMessages, setToolCalls, isAgentRunning } = ws;
  const { fetchTasks } = tasks;
  const { fetchWorkflow, currentStageId } = workflow;

  // The engine owns one global queue, so compute start/stop resolves its
  // target project from the engine owner (ws.engineState), not the selection.
  const engine = useEngineStatus({
    notifySuccess,
    notifyInfo,
    notifyError,
    engineState: ws.engineState,
  });

  const submission = useTaskSubmission({
    isAgentRunning,
    currentStageId,
    activeWorkflowId: workflow.activeWorkflowId,
    setMessages,
    setToolCalls,
    fetchTasks,
    fetchWorkflowList: workflow.fetchWorkflows,
    notifySuccess,
    notifyInfo,
    notifyError,
  });

  // ---- Load all data for a project after activation ----
  const loadProjectData = useCallback(
    async (projectId) => {
      connectWebSocket(projectId);
      await Promise.all([engine.fetchStatus(), fetchTasks(projectId), fetchWorkflow(projectId)]);
    },
    [connectWebSocket, engine, fetchTasks, fetchWorkflow],
  );

  const projects = useProjects({
    onSelectProject: loadProjectData,
    onNotification: addNotification,
  });

  // Keep the live app-link sync pointed at the latest project merger without
  // forcing re-creation of the (early-constructed) WebSocket hook.
  useEffect(() => {
    updateProjectInStateRef.current = projects.updateProjectInState;
  }, [projects.updateProjectInState]);

  // Keep the cross-project engine-owner check pointed at the latest engine
  // snapshot (and its setter) without rebuilding the socket hook.
  useEffect(() => {
    engineStateRef.current = ws.engineState;
    setEngineStateRef.current = ws.setEngineState;
  }, [ws.engineState, ws.setEngineState]);

  // Stage-skills library (lazily fetched when the workflow editor opens).
  // Declared after `projects` so the active-project scope is available.
  const skills = useSkills({ activeProjectId: projects?.activeProjectId });

  const selection = useSelectedTask({
    tasksList: tasks.tasks,
    activeProjectId: projects?.activeProjectId,
  });

  const nav = useViewNavigation({
    tasksList: tasks.tasks,
    selectedSnapshot: selection.selectedTaskSnapshot,
    setSelectedSnapshot: selection.setSelectedTaskSnapshot,
  });

  useBoardSync({
    activeProjectIdRef,
    taskSyncHandlerRef,
    activeProjectId: projects?.activeProjectId,
    tasks,
  });

  const stageNav = useStageNavigation({ tasks, workflow, engineState: ws.engineState });

  const pendingSave = usePendingTaskSave();

  useAccentTheme({ projects });

  const uiPrefs = useUiPreferences();
  // Harness integration prefs (System Settings › Harness): enabled +
  // autoDetect per harness id, persisted to localStorage — the single
  // instance shared by the settings panel and every ModelSelector's
  // isHarnessDisabled predicate, so toggles apply app-wide without remounts.
  const harnessPrefsState = useHarnessPrefs();

  // ---- Initialization ----
  useEffect(() => {
    const init = async () => {
      await projects.fetchProjects();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the active project is known, load its data and connect.
  useEffect(() => {
    if (!projects.activeProjectId) return;
    connectWebSocket(projects.activeProjectId);
    void (async () => {
      await Promise.all([
        engine.fetchStatus(),
        fetchTasks(projects.activeProjectId),
        workflow.fetchWorkflows(projects.activeProjectId),
        fetchWorkflow(projects.activeProjectId),
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.activeProjectId]);

  // Keep the inspector's task in sync with the freshest board snapshot done via derivation above.

  const restoreSession = useCallback(
    async (projectId) => {
      if (!projectId) return;
      try {
        const data = await api.restoreSession(projectId);
        if (data?.messages) {
          setMessages(data.messages);
        }
        await Promise.all([fetchTasks(projectId), fetchWorkflow(projectId)]);
        notifySuccess('Session state restored from disk', 'Session Restored');
        return data;
      } catch (e) {
        logger.error('Failed to restore session', e);
        notifyError('Failed to restore session from disk', 'Restore Error');
      }
    },
    [fetchTasks, fetchWorkflow, setMessages, notifySuccess, notifyError],
  );

  const value = {
    // top-level state
    view: nav.view,
    setView: nav.setView,
    // Router bridge internals (consumed only by KainBainRouteBridge).
    __registerRouter: nav.registerRouter,
    __syncRouteLocation: nav.syncRouteLocation,
    computeRunning: engine.computeRunning,
    tasks: tasks.tasks,
    tasksLoading: tasks.isLoading,
    tasksError: tasks.tasksError,
    retryTasks: tasks.fetchTasks,
    newTaskGoal: submission.newTaskGoal,
    setNewTaskGoal: submission.setNewTaskGoal,
    workflowId: submission.workflowId,
    setWorkflowId: submission.setWorkflowId,
    isFollowUp: submission.isFollowUp,
    setIsFollowUp: submission.setIsFollowUp,
    selectedTask: selection.selectedTask,
    setSelectedTask: selection.setSelectedTask,
    // Latest REVIEW_UPDATED WS payload for live comment merging in the review view
    lastReviewEvent,
    // Latest CHAT_PROGRESS WS payload for the working card's live output
    lastChatProgress,
    // Pending task-editor save flush (checkpoint approve/reject gating)
    setPendingTaskSaveFlush: pendingSave.setPendingTaskSaveFlush,
    hasPendingTaskSaveFlush: pendingSave.hasPendingTaskSaveFlush,
    flushPendingTaskSave: pendingSave.flushPendingTaskSave,
    isSettingsOpen,
    setIsSettingsOpen,
    previewPrompt: submission.previewPrompt,
    setPreviewPrompt: submission.setPreviewPrompt,
    fetchHealth: engine.fetchHealth,
    isHealthRefreshing: engine.isHealthRefreshing,
    healthState: engine.healthState,
    // domain hooks
    projects: projects.projects,
    visibleProjects: projects.visibleProjects,
    activeProjectId: projects.activeProjectId,
    activeProject: projects.activeProject,
    isProjectDropdownOpen: projects.isProjectDropdownOpen,
    setIsProjectDropdownOpen: projects.setIsProjectDropdownOpen,
    hiddenProjectIds: projects.hiddenProjectIds,
    toggleHideProject: projects.toggleHideProject,
    showArchived: projects.showArchived,
    setShowArchived: projects.setShowArchived,
    stages: workflow.stages,
    workflowLoading: workflow.isLoading,
    workflowSwitching: workflow.isSwitching,
    currentStageId: workflow.currentStageId,
    activeWorkflowId: workflow.activeWorkflowId,
    projectWorkflows: workflow.workflows,
    workflows: workflow.workflows,
    workflowRuns: workflow.workflowRuns,
    focusedStageId: stageNav.focusedStageId,
    setFocusedStageId: stageNav.setFocusedStageId,
    feedbackTask: tasks.feedbackTask,
    messages: ws.messages,
    toolCalls: ws.toolCalls,
    isAgentRunning: ws.isAgentRunning,
    processLogs: ws.processLogs,
    clearLogs: ws.clearLogs,
    addProcessLog: ws.addProcessLog,
    engineState: ws.engineState,
    connectionStatus: ws.connectionStatus,
    // notifications state & actions
    notifications,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    notifySuccess,
    notifyInfo,
    notifyWarning,
    notifyError,
    // ui preferences state & actions
    uiPreferences: uiPrefs.preferences,
    updateUiPreference: uiPrefs.updatePreference,
    updateUiPreferences: uiPrefs.updatePreferences,
    resetUiPreferences: uiPrefs.resetPreferences,
    exportUiPreferences: uiPrefs.exportPreferences,
    importUiPreferences: uiPrefs.importPreferences,
    isCustomizationModalOpen: uiPrefs.isCustomizationModalOpen,
    setIsCustomizationModalOpen: uiPrefs.setIsCustomizationModalOpen,
    isShortcutsModalOpen: uiPrefs.isShortcutsModalOpen,
    setIsShortcutsModalOpen: uiPrefs.setIsShortcutsModalOpen,
    isSystemGuideOpen,
    setIsSystemGuideOpen,
    // harness integration prefs (System Settings › Harness tab)
    harnessPrefs: harnessPrefsState.prefs,
    updateHarnessPref: harnessPrefsState.updatePref,
    resetHarnessPrefs: harnessPrefsState.resetPrefs,
    harnessPrefsFor: harnessPrefsState.prefsFor,
    isHarnessDisabled: harnessPrefsState.isHarnessDisabled,
    // actions
    toggleCompute: engine.toggleCompute,
    submitTask: submission.submitTask,
    confirmSubmitTask: submission.confirmSubmitTask,
    cancelPreview: submission.cancelPreview,
    startWorkflow: submission.startWorkflow,
    switchWorkflow: workflow.switchWorkflow,
    createWorkflow: workflow.createWorkflow,
    updateWorkflowDetails: workflow.updateWorkflowDetails,
    deleteWorkflow: workflow.deleteWorkflow,
    fetchWorkflows: submission.fetchWorkflows,
    fetchWorkflow: workflow.fetchWorkflow,
    handleUpdateStage: workflow.handleUpdateStage,
    handleAddStage: workflow.handleAddStage,
    handleRemoveStage: workflow.handleRemoveStage,
    handleReorderStages: workflow.handleReorderStages,
    saveStages: workflow.saveStages,
    // stage skills library (lazy; see useSkills)
    skills: skills.skills,
    skillsLoading: skills.skillsLoading,
    skillsError: skills.skillsError,
    fetchSkills: skills.fetchSkills,
    getSkillByName: skills.getSkillByName,
    jumpToStage: workflow.jumpToStage,
    skipStage: workflow.skipStage,
    lookBack: stageNav.lookBack,
    lookForward: stageNav.lookForward,
    jumpToActive: stageNav.jumpToActive,
    skipCurrent: stageNav.skipCurrent,
    selectProject: projects.selectProject,
    createProject: projects.createProject,
    registerProject: projects.registerProject,
    updateProjectInState: projects.updateProjectInState,
    createTask: tasks.createTask,
    deleteTask: tasks.deleteTask,
    getTask: tasks.getTask,
    getTaskReports: tasks.getTaskReports,
    advanceTask: tasks.advanceTask,
    executeTaskStage: tasks.executeTaskStage,
    rejectTask: tasks.rejectTask,
    rejectTaskWithFeedback: tasks.rejectTaskWithFeedback,
    openFeedbackDialog: tasks.openFeedbackDialog,
    closeFeedbackDialog: tasks.closeFeedbackDialog,
    jumpTask: tasks.jumpTask,
    moveTask: tasks.moveTask,
    completeTask: tasks.completeTask,
    updateTask: tasks.updateTask,
    refreshTasks: tasks.refreshTasks,
    followUpTask: tasks.followUpTask,
    steerTask: tasks.steerTask,
    pauseTask: tasks.pauseTask,
    resumeTask: tasks.resumeTask,
    retryTask: tasks.retryTask,
    abortTask: tasks.abortTask,
    checkTaskStuck: tasks.checkTaskStuck,
    restoreSession,
    // Runner control actions
    pauseRunner: async (runnerId) => {
      try {
        await api.pauseRunner(runnerId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    resumeRunner: async (runnerId) => {
      try {
        await api.resumeRunner(runnerId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    skipRunner: async (runnerId) => {
      try {
        // Skip the current task for this runner (operator surface: advances
        // the held task one stage and releases the lease).
        await api.skipRunner(runnerId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  };

  return <KainBainContext.Provider value={value}>{children}</KainBainContext.Provider>;
}

/***
 * MARK: KainBainRouteBridge
 * @description Wires a React Router location into the provider: registers the
 *   router's `navigate` so the `setView` facade navigates, and syncs every
 *   location change (boot, back/forward, deep link) back into view state +
 *   inspector task. Must render INSIDE both a router and a KainBainProvider
 *   (App renders it; tests wrap provider + bridge in a MemoryRouter).
 * @example <HashRouter><KainBainProvider><KainBainRouteBridge /><App /></KainBainProvider></HashRouter>
 ***/
export function KainBainRouteBridge() {
  const { __registerRouter, __syncRouteLocation } = useKainBain();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    __registerRouter({ navigate, pathname: location.pathname });
    return () => {
      __registerRouter(null);
    };
  }, [__registerRouter, navigate, location.pathname]);
  useEffect(() => {
    __syncRouteLocation(location.pathname);
  }, [__syncRouteLocation, location.pathname]);
  return null;
}

/**
 * Hook to consume the KainBain context.
 * @description Returns the shared KainBain state + actions. Throws if used
 *   outside a KainBainProvider.
 * @returns {Object} The context value.
 * @example const { tasks, submitTask } = useKainBain()
 */
export function useKainBain() {
  const ctx = useContext(KainBainContext);
  if (!ctx) {
    throw new Error('useKainBain must be used within a KainBainProvider');
  }
  return ctx;
}
