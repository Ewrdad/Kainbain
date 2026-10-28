import { isCheckpoint } from '../stageTypes';
import { logger } from '../../services/logger';

/***
 * MARK: formatFileReference
 * @description Builds the provenance line pre-filled into a file-originated
 *   task description, so the reader always knows which file to look at.
 * @example formatFileReference('src/api.js') => 'In reference to: src/api.js'
 * @param {string} filePath - Project-relative file path.
 * @returns {string} The reference line.
 ***/
export function formatFileReference(filePath) {
  return `In reference to: ${filePath || ''}`.trimEnd();
}

/***
 * MARK: defaultFileTaskTitle
 * @description Builds the suggested title for a file-originated cleanup task
 *   from the file's base name. Always editable by the user.
 * @example defaultFileTaskTitle('src/api.js') => 'Cleanup: api.js'
 * @param {string} filePath - Project-relative file path.
 * @returns {string} The suggested title.
 ***/
export function defaultFileTaskTitle(filePath) {
  const baseName =
    String(filePath || '')
      .split('/')
      .pop() || 'file';
  return `Cleanup: ${baseName}`;
}

/***
 * MARK: stagesForWorkflow
 * @description Picks the stage list for one pipeline. Each named workflow
 *   carries its own stages array; when the selected entry has none (older
 *   payloads), it falls back to the active workflow's stage list.
 * @example stagesForWorkflow([{ id: 'wf-1', stages: [...] }], 'wf-1', []) => [...]
 * @param {Array<Object>} [workflows] - Named pipelines from context.
 * @param {string} [workflowId] - Selected pipeline id.
 * @param {Array<Object>} [fallbackStages] - Active workflow's stages.
 * @returns {Array<Object>} Stages belonging to the selected pipeline.
 ***/
export function stagesForWorkflow(workflows = [], workflowId, fallbackStages = []) {
  const selected = (Array.isArray(workflows) ? workflows : []).find(
    (workflow) => String(workflow?.id) === String(workflowId),
  );
  if (Array.isArray(selected?.stages) && selected.stages.length > 0) return selected.stages;
  return Array.isArray(fallbackStages) ? fallbackStages : [];
}

/***
 * MARK: submitCreateTask
 * @description Shared task-submission core behind every "create a task"
 *   button: files the task on the chosen pipeline/stage, opens it in the
 *   inspector, and starts the agent immediately for automated stages while
 *   leaving human checkpoints waiting for review.
 *
 *   When the target pipeline is not the active one, the board is switched
 *   over first: the backend only resolves stage ids against the active
 *   pipeline, so creating without switching would silently land the task on
 *   the wrong stage. Switching also makes the new card visible on the board.
 * @example await submitCreateTask({ projectId: 'proj-1', title: 'Cleanup', goal: 'In reference to: a.js', stageId: 'stage-1', workflowId: 'wf-1', ... })
 * @param {Object} args
 * @param {string} args.projectId - Active project id.
 * @param {string} args.title - Task title.
 * @param {string} args.goal - Task description (carries the file reference).
 * @param {string} args.stageId - Target stage id.
 * @param {string} [args.workflowId] - Target pipeline id (defaults to active).
 * @param {string} [args.activeWorkflowId] - Currently active pipeline id.
 * @param {Array<Object>} [args.stages] - Active pipeline's stages.
 * @param {Function} args.createTask - Task-creation hook (POST /tasks).
 * @param {Function} [args.switchWorkflow] - Pipeline switch hook.
 * @param {Function} [args.executeTaskStage] - Agent dispatch hook.
 * @param {Function} [args.setSelectedTask] - Opens the inspector on the new task.
 * @returns {Promise<Object|null>} The created task, or null when skipped.
 ***/
export async function submitCreateTask({
  projectId,
  title,
  goal,
  stageId,
  workflowId,
  activeWorkflowId,
  stages = [],
  createTask,
  switchWorkflow,
  executeTaskStage,
  setSelectedTask,
}) {
  const targetWorkflowId = workflowId || activeWorkflowId;
  let effectiveStages = Array.isArray(stages) ? stages : [];

  if (
    targetWorkflowId &&
    activeWorkflowId &&
    String(targetWorkflowId) !== String(activeWorkflowId) &&
    typeof switchWorkflow === 'function'
  ) {
    const switched = await switchWorkflow(projectId, targetWorkflowId);
    if (Array.isArray(switched?.stages) && switched.stages.length > 0) {
      effectiveStages = switched.stages;
    } else if (Array.isArray(switched?.workflow?.stages) && switched.workflow.stages.length > 0) {
      effectiveStages = switched.workflow.stages;
    }
  }

  // Preserves the inline creation call-site's tolerance of a missing hook.
  if (typeof createTask !== 'function') return null;

  const created = await createTask(projectId, {
    title,
    goal,
    stageId,
    workflowId: targetWorkflowId,
  });

  // A null result means the creation was skipped (the hook's own
  // single-flight guard): there is no card to open or dispatch.
  if (!created?.id) return created;

  setSelectedTask?.(created);

  const stage = effectiveStages.find((s) => String(s?.id) === String(stageId));
  const isHumanCheckpoint = isCheckpoint(stage?.type || 'agent');
  if (!isHumanCheckpoint && typeof executeTaskStage === 'function') {
    const dispatch = executeTaskStage(projectId, created.id);
    if (dispatch && typeof dispatch.catch === 'function') {
      dispatch.catch((err) => {
        logger.warn('Auto-dispatch background error:', err);
      });
    }
  }

  return created;
}
