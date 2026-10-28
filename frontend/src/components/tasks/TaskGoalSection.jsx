import React, { useState, useRef, useEffect } from 'react';

import { MarkdownViewer } from '../common/MarkdownViewer';
import { InfoTooltip } from '../common/InfoTooltip';
import { TaskImageAttach } from './TaskImageAttach';
import { appendImagesMarkdown } from '../../services/taskImages';
import { isNewlyCreatedTask, resolveDefaultGoalMode } from './goalDefaultMode';

// Per-surface styling kept identical to the two former inline copies of this
// section (page rows/padding are slightly larger than the overlay inspector's).
const VARIANT_STYLES = {
  page: {
    wrapper: 'space-y-3 bg-surface-container/40 p-5 rounded-sm border border-border-standard',
    label: 'block text-xs font-bold uppercase tracking-wider text-primary font-mono',
    toggleGroup:
      'flex bg-surface-deep rounded-sm border border-border-standard p-0.5 text-xs font-mono',
    toggleButton: 'px-3 py-1',
    textarea:
      'w-full p-3.5 min-h-[200px] bg-surface border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary transition-colors leading-relaxed resize-y',
    textareaRows: 10,
    preview:
      'p-4 min-h-[200px] bg-surface border border-border-standard rounded-sm overflow-y-auto max-h-[400px] custom-scrollbar',
    saveRow: 'flex items-center justify-between pt-1 text-[10px] font-mono text-text-muted',
  },
  overlay: {
    wrapper: 'space-y-2 bg-surface-container/40 p-3.5 rounded-sm border border-border-standard/80',
    label: 'block text-[11px] font-bold uppercase tracking-wider text-primary font-mono',
    toggleGroup:
      'flex bg-surface-deep rounded-sm border border-border-standard p-0.5 text-[10px] font-mono',
    toggleButton: 'px-2.5 py-1',
    textarea:
      'w-full p-3 min-h-[160px] bg-surface border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary transition-colors leading-relaxed resize-y',
    textareaRows: 8,
    preview:
      'p-3.5 min-h-[160px] bg-surface border border-border-standard rounded-sm overflow-y-auto max-h-[300px] custom-scrollbar',
    saveRow: 'flex items-center gap-2 pt-1 text-[9px] font-mono text-text-muted min-h-[14px]',
  },
};

/***
 * MARK: TaskGoalSection
 * @description Shared "Task Goal & Markdown Description" editor used by both
 * task detail surfaces (full page and overlay inspector). The goal opens in
 * preview mode by default; only tasks created within the edit window open
 * ready to edit (see `goalDefaultMode`), so a user who just created a task
 * can keep refining the goal. Edits made while a stage is executing are
 * saved for the next stage but never reach the running agent (it was
 * dispatched with the goal text as it read at stage start). Clicking Edit
 * during execution reveals an amber advisory note explaining this and pointing
 * to the real-time steering section for live instructions. Editing remains
 * allowed (auto-save persists the change for the next stage).
 *
 * The parent owns the goal value (controlled `title`) and the auto-save
 * wiring; this component owns the edit/preview mode, the running-stage
 * warning, and mode transitions.
 *
 * @param {Object} props
 * @param {string|null} props.taskId - Displayed task id; changing it resets the mode to the default for the new task.
 * @param {string} props.title - Controlled goal text (the textarea value / markdown source).
 * @param {Function} props.onTitleChange - Called with the new text on every keystroke.
 * @param {Function} props.onBlurSave - Auto-save blur handler from the parent's useAutoSave.
 * @param {boolean} props.isSaving - Auto-save in flight.
 * @param {Date|null} props.lastSaved - Time of the last successful auto-save.
 * @param {Error|null} props.error - Auto-save failure, if any.
 * @param {boolean} props.isExecuting - True while an agent/CI stage is running for this task.
 * @param {boolean} props.isDirty - True while the user has unsaved goal edits (guards the preview flip).
 * @param {boolean} [props.hasUnsyncedChanges=false] - True while a local draft exists that the backend has not confirmed yet; renders the "Unsynced changes" badge.
 * @param {string|null} [props.createdAt=null] - Task creation timestamp (ISO string); feeds the newly-created default-mode rule.
 * @param {Function} [props.onManualSave] - When provided, renders the Manual Save button.
 * @param {boolean} [props.manualSaveDisabled] - Disables the Manual Save button.
 * @param {string} [props.manualSaveLabel] - Label for the Manual Save button.
 * @param {string} props.idPrefix - Id namespace preserving label/htmlFor pairs ('page-task-goal' | 'task-goal').
 * @param {string} [props.variant='page'] - 'page' | 'overlay': preserves each surface's sizing.
 * @param {string} [props.projectId] - Owning project id; enables the task image upload affordance and inline image resolution.
 * @param {React.ReactNode} [props.children] - Rendered after the save row, only in edit mode (e.g. context token chips — hidden in preview so review mode stays clean).
 * @example <TaskGoalSection taskId={task.id} title={title} onTitleChange={setTitle} onBlurSave={goalHandleBlur} isExecuting={isTaskExecuting} isDirty={goalIsDirty} idPrefix="page-task-goal" variant="page" />
 ***/
export function TaskGoalSection({
  taskId,
  title,
  onTitleChange,
  onBlurSave,
  isSaving,
  lastSaved,
  error,
  isExecuting,
  isDirty,
  hasUnsyncedChanges = false,
  createdAt = null,
  onManualSave,
  manualSaveDisabled,
  manualSaveLabel,
  idPrefix,
  variant = 'page',
  projectId = null,
  children,
}) {
  // Explicit variant selection keeps sizing identical to each surface.
  const styles = variant === 'overlay' ? VARIANT_STYLES.overlay : VARIANT_STYLES.page;
  const textareaId = `${idPrefix}-input`;

  // Initial mode comes from the shared resolver so both detail surfaces
  // default identically; the newly-created check runs once per task open
  // (no ticking clock — the mode never flips under the user mid-view).
  const [goalMode, setGoalMode] = useState(() =>
    resolveDefaultGoalMode({ isExecuting, isNewlyCreated: isNewlyCreatedTask(createdAt) }),
  );

  // Reset the mode when a different task is opened (render-phase state
  // adjustment, same pattern the parents use for their goal state). Task
  // switches — not live TASK_UPDATED refreshes — change the key, so background
  // updates never reset the mode mid-edit.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setGoalMode(
      resolveDefaultGoalMode({ isExecuting, isNewlyCreated: isNewlyCreatedTask(createdAt) }),
    );
  }

  // When a stage starts while the view is open, flip a clean editor to preview
  // so the user sees the goal the agent is working from. Never yank the mode
  // from a user mid-edit (isDirty): the warning banner covers that case. A
  // newly-created task is also never yanked — the user just opened it to
  // refine the goal (re-evaluated at flip time, so a task that aged out of
  // the window flips normally). When the run ends, leave the chosen mode
  // untouched.
  const prevIsExecutingRef = useRef(isExecuting);
  useEffect(() => {
    if (isExecuting && !prevIsExecutingRef.current && !isDirty && !isNewlyCreatedTask(createdAt)) {
      setGoalMode('preview');
    }
    prevIsExecutingRef.current = isExecuting;
  }, [isExecuting, isDirty, createdAt]);

  const isEditing = goalMode === 'edit';

  // Ref to the goal textarea: after an upload the caret is placed at the end
  // of the appended image markdown; also wires paste-to-upload in the attach
  // affordance.
  const textareaRef = useRef(null);

  // Latest-title mirror: an upload batch lands seconds after the gesture, and
  // the user may keep typing meanwhile. The batch callback fires long after
  // its render closure went stale, so it reads the ref (synced in an effect,
  // never during render) instead of the render-time `title` — otherwise those
  // keystrokes would be overwritten by the append.
  const latestTitleRef = useRef(title);
  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  /**
   * MARK: insertImagesMarkdown
   * @description Appends a whole upload batch's markdown references at the end
   *   of the controlled goal text in ONE `onTitleChange` call via the shared
   *   `appendImagesMarkdown` fold (same contract the reject dialogs use), then
   *   moves the caret to the end. A single call per gesture is what makes
   *   multi-select safe: N rapid per-file updates would each close over the
   *   same stale `title` and overwrite each other, keeping only the last
   *   reference. Appending (never caret insertion) keeps the title/first line
   *   intact.
   * @param {Array<Object>} images - Stored assets (`{ name, path }`), in link order.
   **/
  const insertImagesMarkdown = (images) => {
    if (!Array.isArray(images) || images.length === 0) return;
    const current = latestTitleRef.current;
    const next = appendImagesMarkdown(current, images);
    if (next === current) return;
    onTitleChange?.(next);
    // Focus + caret-at-end land after React re-renders with the new value.
    requestAnimationFrame(() => {
      const fresh = textareaRef.current;
      if (!fresh) return;
      fresh.focus();
      try {
        fresh.setSelectionRange(next.length, next.length);
      } catch {
        // Textarea gone mid-frame (task switch): nothing to restore.
      }
    });
  };

  // Auto-save status indicator (saving / error / last-saved / idle).
  const renderSaveStatus = () => {
    if (isSaving) {
      return <span className="text-primary">Saving…</span>;
    }
    if (error) {
      return (
        <span className="text-error" role="alert">
          Auto-save failed
        </span>
      );
    }
    if (lastSaved) {
      return <span>Saved {lastSaved.toLocaleTimeString()}</span>;
    }
    return <span>Auto-saved as you type</span>;
  };

  return (
    <section className={styles.wrapper}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor={textareaId} className={styles.label}>
            Task Goal &amp; Markdown Description
          </label>
          {hasUnsyncedChanges && (
            <span
              role="status"
              title="These edits are cached on this device until the server confirms the save"
              className="px-2 py-0.5 rounded border border-warning/50 bg-warning/15 text-warning text-[9px] font-bold uppercase tracking-wider font-mono"
            >
              Unsynced changes
            </span>
          )}
          <InfoTooltip
            title="Task Goal & Acceptance Criteria"
            description="Markdown goal describing what this task achieves. Curated into the agent system prompt."
            position="bottom"
          />
        </div>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            onClick={() => setGoalMode('edit')}
            title={isExecuting ? 'Editing now only affects the next stage' : undefined}
            className={`${styles.toggleButton} rounded-sm uppercase font-bold transition-colors cursor-pointer ${
              goalMode === 'edit'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-text-muted hover:text-on-surface'
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setGoalMode('preview')}
            className={`${styles.toggleButton} rounded-sm uppercase font-bold transition-colors cursor-pointer ${
              goalMode === 'preview'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-text-muted hover:text-on-surface'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {isEditing && isExecuting && (
        <div
          role="note"
          className="p-3 bg-warning/15 border border-warning/60 rounded-sm flex items-start gap-2.5"
        >
          <span
            className="w-2 h-2 mt-1 rounded-full bg-warning animate-pulse shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-1 text-[11px] font-mono leading-relaxed">
            <p className="font-bold uppercase tracking-wider text-warning">
              Stage is running — this edit applies from the next stage
            </p>
            <p className="text-on-surface/80">
              The active agent was dispatched with the goal as it read when the stage started. Your
              edits are saved but will not reach the running agent. To send instructions into the
              live session, use{' '}
              <span className="font-bold text-warning">
                Manual Intervention &amp; Real-Time Steering
              </span>{' '}
              below.
            </p>
          </div>
        </div>
      )}

      {isEditing ? (
        <>
          <textarea
            id={textareaId}
            aria-label="Task Title"
            ref={textareaRef}
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            onBlur={onBlurSave}
            rows={styles.textareaRows}
            className={styles.textarea}
            placeholder="Describe the task goal and acceptance criteria using markdown..."
          />
          {projectId && taskId && (
            <TaskImageAttach
              projectId={projectId}
              taskId={taskId}
              textareaRef={textareaRef}
              onUploadedBatch={insertImagesMarkdown}
            />
          )}
        </>
      ) : (
        <div className={styles.preview}>
          <MarkdownViewer
            content={title || '*(No task goal provided)*'}
            projectId={projectId}
            taskId={taskId}
          />
        </div>
      )}

      <div className={styles.saveRow}>
        <div>{renderSaveStatus()}</div>
        {onManualSave && (
          <button
            type="button"
            disabled={manualSaveDisabled}
            onClick={onManualSave}
            className="px-3 py-1 bg-primary text-on-primary rounded text-[10px] font-mono font-bold uppercase cursor-pointer hover:brightness-110 disabled:opacity-40"
          >
            {manualSaveLabel}
          </button>
        )}
      </div>

      {isEditing && children}
    </section>
  );
}
