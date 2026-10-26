import { useCallback, useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
import { normalizeStageTags } from '../../../shared/stageTags.js';

const STORAGE_ACTIVE_WORKFLOW = 'kainbain:activeWorkflowId';

/***
 * MARK: getStoredWorkflowId
 * @description Retrieves the stored workflow ID for a project or globally from localStorage.
 * @example getStoredWorkflowId('proj-1') => 'wf-hotfix'
 * @param {string} [projectId]
 * @returns {string|null}
 ***/
function getStoredWorkflowId(projectId) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    if (projectId) {
      const perProj = window.localStorage.getItem(`${STORAGE_ACTIVE_WORKFLOW}:${projectId}`);
      if (perProj) return perProj;
    }
    return (
      window.localStorage.getItem(STORAGE_ACTIVE_WORKFLOW) ||
      window.localStorage.getItem('activeWorkflowId')
    );
  } catch {
    return null;
  }
}

/***
 * MARK: saveStoredWorkflowId
 * @description Persists active workflow ID both globally and per-project in localStorage.
 * @example saveStoredWorkflowId('proj-1', 'wf-hotfix')
 * @param {string} [projectId]
 * @param {string} workflowId
 ***/
function saveStoredWorkflowId(projectId, workflowId) {
  if (typeof window === 'undefined' || !window.localStorage || !workflowId) return;
  try {
    window.localStorage.setItem(STORAGE_ACTIVE_WORKFLOW, workflowId);
    window.localStorage.setItem('activeWorkflowId', workflowId);
    if (projectId) {
      window.localStorage.setItem(`${STORAGE_ACTIVE_WORKFLOW}:${projectId}`, workflowId);
    }
  } catch (err) {
    logger.warn('Failed to save workflow ID to localStorage', err);
  }
}

/***
 * MARK: useWorkflow
 * @description Owns the project's named workflows, active workflow pointer,
 * workflow stages, and current-stage pointer, plus stage editing, workflow switching,
 * creating, updating, deleting, non-linear failback controls, and localStorage persistence.
 * @param {Object} [opts]
 * @param {Function} [opts.onNotification] - Notification dispatch callback.
 * @example const { workflows, activeWorkflowId, switchWorkflow, stages, currentStageId } = useWorkflow()
 ***/
export function useWorkflow({ onNotification } = {}) {
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflowId, setActiveWorkflowIdState] = useState(() => getStoredWorkflowId());
  const [stages, setStages] = useState([]);
  const [currentStageId, setCurrentStageId] = useState(null);
  // True while the boot fetch is in flight so the canvas can render a loading
  // state instead of the "No stages configured" empty state on slow links.
  const [isLoading, setIsLoading] = useState(false);
  const onNotificationRef = useRef(onNotification);
  const currentProjectIdRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  /***
   * MARK: setActiveWorkflowId
   * @description Sets the active workflow ID and persists it to localStorage.
   * @example setActiveWorkflowId('wf-1')
   * @param {string} id
   ***/
  const setActiveWorkflowId = useCallback((id) => {
    setActiveWorkflowIdState(id);
    if (id) {
      saveStoredWorkflowId(null, id);
    }
  }, []);

  /***
   * MARK: fetchWorkflow
   * @description Loads current workflow stages and named workflows for a project, applying stored workflow preferences.
   * @example await fetchWorkflow('proj-1')
   * @param {string} projectId
   ***/
  const fetchWorkflow = useCallback(async (projectId) => {
    currentProjectIdRef.current = projectId;
    setIsLoading(true);
    try {
      const data = await api.getWorkflow(projectId);
      if (data) {
        setStages(data.stages || []);
        setCurrentStageId(data.currentStageId || null);

        const projectWorkflowsList =
          Array.isArray(data.workflows) && data.workflows.length > 0
            ? data.workflows
            : data.workflow
              ? [data.workflow]
              : [];
        setWorkflows(projectWorkflowsList);

        const storedId = getStoredWorkflowId(projectId);
        const resolvedActiveId =
          (storedId && projectWorkflowsList.some((w) => w.id === storedId) && storedId) ||
          data.activeWorkflowId ||
          data.workflow?.id ||
          projectWorkflowsList[0]?.id ||
          null;

        setActiveWorkflowIdState(resolvedActiveId);
        if (resolvedActiveId) {
          saveStoredWorkflowId(projectId, resolvedActiveId);
        }
      }
    } catch (e) {
      logger.error('Failed to fetch workflow', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /***
   * MARK: fetchWorkflows
   * @description Fetches all named workflows for a project and syncs the active workflow pointer.
   * @example await fetchWorkflows('proj-1')
   * @param {string} projectId
   ***/
  const fetchWorkflows = useCallback(async (projectId) => {
    try {
      const data = await api.getWorkflows(projectId);
      if (data) {
        const wfList = data.workflows || [];
        setWorkflows(wfList);
        const storedId = getStoredWorkflowId(projectId);
        const activeId =
          (storedId && wfList.some((w) => w.id === storedId) && storedId) ||
          data.activeWorkflowId ||
          wfList[0]?.id ||
          null;

        if (activeId) {
          setActiveWorkflowIdState(activeId);
          saveStoredWorkflowId(projectId, activeId);
        }
      }
    } catch (e) {
      logger.error('Failed to fetch workflows', e);
    }
  }, []);

  /***
   * MARK: switchWorkflow
   * @description Switches the active named workflow on the server, loads its stages, and persists the choice to localStorage.
   * @example await switchWorkflow('proj-1', 'wf-hotfix')
   * @param {string} projectId
   * @param {string} workflowId
   * @returns {Promise<Object>}
   ***/
  // True while a workflow switch is in flight so the dropdown can show a
  // pending state instead of silently accepting double-taps on slow links.
  const [isSwitching, setIsSwitching] = useState(false);
  const switchWorkflow = useCallback(
    async (projectId, workflowId) => {
      setIsSwitching(true);
      try {
        const data = await api.switchProjectWorkflow(projectId, workflowId);
        if (data) {
          const newActiveId = data.activeWorkflowId || workflowId;
          setActiveWorkflowIdState(newActiveId);
          saveStoredWorkflowId(projectId, newActiveId);
          if (data.stages) {
            setStages(data.stages);
          }
          if (data.workflow?.stages) {
            setStages(data.workflow.stages);
          }
          await fetchWorkflow(projectId);
          onNotificationRef.current?.({
            type: 'info',
            title: 'Workflow Switched',
            message: `Switched active pipeline to "${data.workflow?.name || workflowId}"`,
          });
          return data;
        }
      } catch (e) {
        logger.error('Failed to switch workflow', e);
        throw e;
      } finally {
        setIsSwitching(false);
      }
    },
    [fetchWorkflow],
  );

  /***
   * MARK: createWorkflow
   * @description Creates a new named workflow for the project with custom or template stages.
   * @example await createWorkflow('proj-1', { name: 'Hotfix Pipeline' })
   * @param {string} projectId
   * @param {Object} options
   * @returns {Promise<Object>}
   ***/
  const createWorkflow = useCallback(
    async (projectId, { name, stages: customStages, isDefault = false }) => {
      try {
        const created = await api.createProjectWorkflow(projectId, {
          name,
          stages: customStages,
          isDefault,
        });
        await fetchWorkflow(projectId);
        onNotificationRef.current?.({
          type: 'success',
          title: 'Workflow Created',
          message: `Created workflow "${created?.name || name}"`,
        });
        return created;
      } catch (e) {
        logger.error('Failed to create workflow', e);
        throw e;
      }
    },
    [fetchWorkflow],
  );

  /***
   * MARK: updateWorkflowDetails
   * @description Modifies a workflow's metadata (e.g. name, default status, stages).
   * @example await updateWorkflowDetails('proj-1', 'wf-1', { name: 'Main Pipeline' })
   * @param {string} projectId
   * @param {string} workflowId
   * @param {Object} updates
   * @returns {Promise<Object>}
   ***/
  const updateWorkflowDetails = useCallback(
    async (projectId, workflowId, updates) => {
      try {
        const updated = await api.updateProjectWorkflow(projectId, workflowId, updates);
        setWorkflows((prev) => prev.map((w) => (w.id === workflowId ? { ...w, ...updated } : w)));
        if (activeWorkflowId === workflowId && updated.stages) {
          setStages(updated.stages);
        }
        await fetchWorkflow(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Workflow Updated',
          message: 'Updated workflow details',
        });
        return updated;
      } catch (e) {
        logger.error('Failed to update workflow details', e);
        throw e;
      }
    },
    [activeWorkflowId, fetchWorkflow],
  );

  /***
   * MARK: deleteWorkflow
   * @description Deletes a named workflow from the project.
   * @example await deleteWorkflow('proj-1', 'wf-old')
   * @param {string} projectId
   * @param {string} workflowId
   * @returns {Promise<Object>}
   ***/
  const deleteWorkflow = useCallback(
    async (projectId, workflowId) => {
      try {
        const result = await api.deleteProjectWorkflow(projectId, workflowId);
        await fetchWorkflow(projectId);
        onNotificationRef.current?.({
          type: 'info',
          title: 'Workflow Deleted',
          message: 'Workflow removed from project',
        });
        return result;
      } catch (e) {
        logger.error('Failed to delete workflow', e);
        throw e;
      }
    },
    [fetchWorkflow],
  );

  /***
   * MARK: handleUpdateStage
   * @description Updates a single stage configuration in local memory and debounces auto-saving to backend.
   * @example handleUpdateStage('stage-1', { name: 'Elaboration' })
   * @param {string} id
   * @param {Object} updates
   ***/
  const handleUpdateStage = useCallback((id, updates) => {
    setStages((prev) => {
      // Tags are normalised at the edit boundary so local stage objects are
      // already clean before the debounced auto-save reaches the backend.
      const cleanUpdates =
        updates && updates.tags !== undefined
          ? { ...updates, tags: normalizeStageTags(updates.tags) ?? [] }
          : updates;
      const next = prev.map((s) => (s.id === id ? { ...s, ...cleanUpdates } : s));
      const targetProjectId = currentProjectIdRef.current;
      if (targetProjectId) {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
          try {
            await api.updateWorkflow(targetProjectId, next);
          } catch (err) {
            logger.error('Auto-save workflow failed', err);
          }
        }, 500);
      }
      return next;
    });
  }, []);

  /***
   * MARK: handleAddStage
   * @description Appends a new blank stage to the active stage sequence.
   * @example handleAddStage()
   ***/
  const handleAddStage = useCallback(() => {
    setStages((prev) => [
      ...prev,
      {
        id: `stage-${Date.now()}`,
        name: `New Stage ${prev.length + 1}`,
        type: 'agent',
        prompt: '',
        paused: false,
        failback: 'previous',
      },
    ]);
  }, []);

  /***
   * MARK: handleRemoveStage
   * @description Removes a stage from the active stage sequence by its ID.
   * @example handleRemoveStage('stage-1')
   * @param {string} id
   ***/
  const handleRemoveStage = useCallback((id) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /***
   * MARK: handleReorderStages
   * @description Reorders stages by moving a stage from oldIndex to newIndex.
   * @example handleReorderStages(0, 2)
   * @param {number} oldIndex
   * @param {number} newIndex
   ***/
  const handleReorderStages = useCallback((oldIndex, newIndex) => {
    setStages((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(oldIndex, 1);
      result.splice(newIndex, 0, removed);
      return result;
    });
  }, []);

  /***
   * MARK: saveStages
   * @description Persists the active stage array to the backend and refetches configuration.
   * @example await saveStages('proj-1')
   * @param {string} projectId
   * @param {Array<Object>} [stagesToSave]
   ***/
  const saveStages = useCallback(
    async (projectId, stagesToSave) => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      try {
        // Final normalisation pass: whatever path produced the stage list
        // (drawer edits, import, drag reorder), tags reach the backend clean.
        const finalStages = (stagesToSave || stages).map((stage) =>
          stage && stage.tags !== undefined
            ? { ...stage, tags: normalizeStageTags(stage.tags) ?? [] }
            : stage,
        );
        await api.updateWorkflow(projectId, finalStages);
        await fetchWorkflow(projectId);
      } catch (e) {
        logger.error('Failed to save stages', e);
      }
    },
    [stages, fetchWorkflow],
  );

  /***
   * MARK: jumpToStage
   * @description Non-linear execution control: jumps the pipeline pointer directly to a specified stage ID.
   * @example await jumpToStage('proj-1', 'stage-3')
   * @param {string} projectId
   * @param {string} stageId
   ***/
  const jumpToStage = useCallback(async (projectId, stageId) => {
    try {
      setCurrentStageId(stageId);
      await api.jumpToStage(projectId, stageId);
      onNotificationRef.current?.({
        type: 'info',
        title: 'Stage Jumped',
        message: `Jumped to stage ${stageId}`,
      });
    } catch (e) {
      logger.error('Failed to jump to stage', e);
    }
  }, []);

  /***
   * MARK: skipStage
   * @description Advances the active pipeline pointer past the current stage.
   * @example await skipStage('proj-1')
   * @param {string} projectId
   ***/
  const skipStage = useCallback(
    async (projectId) => {
      try {
        setStages((prevStages) => {
          const idx = prevStages.findIndex((s) => s.id === currentStageId);
          if (idx !== -1 && idx < prevStages.length - 1) {
            setCurrentStageId(prevStages[idx + 1].id);
          } else if (prevStages.length > 1) {
            setCurrentStageId(prevStages[1].id);
          }
          return prevStages;
        });
        const data = await api.skipStage(projectId);
        if (data?.currentStageId) {
          setCurrentStageId(data.currentStageId);
        }
        onNotificationRef.current?.({
          type: 'info',
          title: 'Stage Skipped',
          message: 'Active stage skipped',
        });
      } catch (e) {
        logger.error('Failed to skip stage', e);
      }
    },
    [currentStageId],
  );

  return {
    workflows,
    setWorkflows,
    activeWorkflowId,
    setActiveWorkflowId,
    stages,
    setStages,
    isLoading,
    isSwitching,
    currentStageId,
    setCurrentStageId,
    fetchWorkflow,
    fetchWorkflows,
    switchWorkflow,
    createWorkflow,
    updateWorkflowDetails,
    deleteWorkflow,
    handleUpdateStage,
    handleAddStage,
    handleRemoveStage,
    handleReorderStages,
    saveStages,
    jumpToStage,
    skipStage,
  };
}
