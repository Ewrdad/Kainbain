import React, { useState } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { Modal } from '../Modal';
import { SelectDropdown } from '../common/SelectDropdown';
import { usePendingAction } from '../../hooks/usePendingAction';
import { isCheckpoint } from '../stageTypes';
import {
  defaultFileTaskTitle,
  formatFileReference,
  stagesForWorkflow,
  submitCreateTask,
} from '../tasks/createTaskSubmit';

/***
 * MARK: CreateTaskFromFileModal
 * @description Modal opened from the files/repo view ("Create task from
 *   here") that files a cleanup/refactor task referencing the selected file.
 *   The user picks a target pipeline and stage, edits the suggested title,
 *   and extends the pre-filled description (`In reference to: <file path>`).
 * @example <CreateTaskFromFileModal filePath="src/api.js" onClose={() => setOpen(false)} />
 * @param {Object} props
 * @param {string} props.filePath - Project-relative path of the referenced file.
 * @param {Function} props.onClose - Called when the dialog should close.
 ***/
export function CreateTaskFromFileModal({ filePath, onClose }) {
  const {
    activeProjectId,
    projectWorkflows = [],
    stages = [],
    activeWorkflowId,
    createTask,
    executeTaskStage,
    setSelectedTask,
    switchWorkflow,
  } = useKainBain();

  // Single-flight guard: while the task is being filed the submit button is
  // disabled and a fast double-click cannot create the task twice.
  const { pendingKey, run } = usePendingAction();
  const isSubmitting = pendingKey === 'create';

  const defaultWorkflowId = activeWorkflowId || projectWorkflows[0]?.id || 'wf-default';
  // The user's explicit pipeline pick wins; otherwise the default tracks the
  // active pipeline live (context may resolve after the modal opens).
  const [pickedWorkflowId, setPickedWorkflowId] = useState(null);
  const selectedWorkflowId = pickedWorkflowId || defaultWorkflowId;

  const availableStages = stagesForWorkflow(projectWorkflows, selectedWorkflowId, stages);
  // The user's explicit stage pick wins while it still belongs to the
  // selected pipeline; switching pipelines resets to that pipeline's first
  // stage automatically.
  const [pickedStageId, setPickedStageId] = useState(null);
  const selectedStageId =
    pickedStageId && availableStages.some((s) => String(s?.id) === String(pickedStageId))
      ? pickedStageId
      : (availableStages[0]?.id ?? '');

  const [title, setTitle] = useState(() => defaultFileTaskTitle(filePath));
  const [goal, setGoal] = useState(() => `${formatFileReference(filePath)}\n\n`);
  const [error, setError] = useState(null);

  const selectedStage = availableStages.find((s) => String(s?.id) === String(selectedStageId));
  const stageAutoStarts = selectedStage ? !isCheckpoint(selectedStage?.type || 'agent') : false;
  const switchesPipeline =
    Boolean(activeWorkflowId) && String(selectedWorkflowId) !== String(activeWorkflowId);

  const pipelineOptions =
    projectWorkflows.length > 0
      ? projectWorkflows.map((workflow) => ({
          value: workflow.id,
          label: workflow.name || workflow.id,
        }))
      : [{ value: selectedWorkflowId, label: 'Default pipeline' }];
  const stageOptions = availableStages.map((stage) => ({
    value: stage.id,
    label: stage.name || stage.id,
  }));

  const canSubmit =
    title.trim().length > 0 &&
    goal.trim().length > 0 &&
    Boolean(selectedStageId) &&
    pendingKey === null;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    run('create', () =>
      submitCreateTask({
        projectId: activeProjectId,
        title: title.trim(),
        goal: goal.trim(),
        stageId: selectedStageId,
        workflowId: selectedWorkflowId,
        activeWorkflowId,
        stages: availableStages,
        createTask,
        switchWorkflow,
        executeTaskStage,
        setSelectedTask,
      }),
    )
      .then((created) => {
        if (created?.id) onClose?.();
      })
      .catch((err) => {
        // The dialog stays open with the user's input intact so they can retry.
        setError(err?.message || 'Could not create the task. Please try again.');
      });
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="create-task-from-file-title"
      describedBy="create-task-from-file-description"
      dialogClassName="w-full max-w-xl bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="p-4 sm:p-6 border-b border-border-standard bg-surface-container">
        <h2
          id="create-task-from-file-title"
          className="text-base sm:text-lg font-bold text-on-surface tracking-tight flex items-center gap-2"
        >
          <span aria-hidden="true">➕</span>
          <span>Create task from here</span>
        </h2>
        <p
          id="create-task-from-file-description"
          className="text-[10px] font-mono text-text-muted mt-1 truncate"
          title={filePath}
        >
          {formatFileReference(filePath)}. Press{' '}
          <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-text-high border border-border-standard">
            Ctrl+Enter
          </kbd>{' '}
          to submit.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="create-task-pipeline"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Target pipeline
              </label>
              <SelectDropdown
                id="create-task-pipeline"
                value={selectedWorkflowId}
                onChange={(value) => setPickedWorkflowId(value)}
                options={pipelineOptions}
                ariaLabel="Target pipeline"
                size="sm"
                className="w-full"
              />
            </div>
            <div>
              <label
                htmlFor="create-task-stage"
                className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
              >
                Target stage
              </label>
              <SelectDropdown
                id="create-task-stage"
                value={selectedStageId}
                onChange={(value) => setPickedStageId(value)}
                options={stageOptions}
                ariaLabel="Target stage"
                size="sm"
                className="w-full"
                disabled={stageOptions.length === 0}
                placeholder={stageOptions.length === 0 ? 'Loading stages…' : 'Select...'}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="create-task-title"
              className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
            >
              Task title
            </label>
            <input
              id="create-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Cleanup: api.js"
              className="w-full px-3 py-2 bg-surface-deep border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="create-task-goal"
              className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
            >
              Task description
            </label>
            <textarea
              id="create-task-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the cleanup or tweak needed…"
              className="w-full p-3 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono leading-relaxed outline-none focus:border-primary transition-colors h-28 sm:h-32 resize-y"
            />
          </div>

          {switchesPipeline && (
            <p className="text-[10px] font-mono text-text-muted">
              The board will switch to the selected pipeline so the new task lands on the right
              stage.
            </p>
          )}
          {selectedStage && stageAutoStarts && (
            <p className="text-[10px] font-mono text-text-muted">
              The agent will start work on this stage immediately. Human checkpoints wait for review
              instead.
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-mono text-error">
              {error}
            </p>
          )}
        </div>

        <footer className="p-4 sm:p-6 border-t border-border-standard bg-surface flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={isSubmitting}
            className="px-6 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Task</span>
            )}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
