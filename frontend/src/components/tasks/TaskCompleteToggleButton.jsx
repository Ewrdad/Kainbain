/***
 * MARK: TaskCompleteToggleButton
 * @description The single Complete/Uncomplete button shared by the task
 *   inspector (details tab) and the task detail page, so the two surfaces can
 *   never drift. On a non-completed task it renders the Complete action; once
 *   the task is completed the same button swaps to Uncomplete, which reopens
 *   the task back into the workflow (the backend restores the status/stage it
 *   had before completion). Both actions run through the caller's
 *   runTaskAction single-flight guard under their own pending key
 *   ('complete' / 'uncomplete'), so a fast double-click fires at most once.
 * @example <TaskCompleteToggleButton task={task} activeProjectId={activeProjectId} completeTask={completeTask} uncompleteTask={uncompleteTask} isMutating={isMutating} pendingAction={pendingAction} runTaskAction={runTaskAction} />
 * @param {Object} props
 * @param {Object} props.task - The task being inspected.
 * @param {string} props.activeProjectId - Active project id, sent with the mutation.
 * @param {Function} [props.completeTask] - Complete mutation from context.
 * @param {Function} [props.uncompleteTask] - Uncomplete mutation from context.
 * @param {boolean} props.isMutating - Disables the button while any task action is in flight.
 * @param {string|null} props.pendingAction - Current single-flight pending key.
 * @param {Function} props.runTaskAction - Single-flight action runner.
 * @param {string} [props.className] - Extra button classes (call sites keep their own padding).
 ***/
export function TaskCompleteToggleButton({
  task,
  activeProjectId,
  completeTask,
  uncompleteTask,
  isMutating,
  pendingAction,
  runTaskAction,
  className = 'px-3.5 py-2.5 min-h-[44px] border border-primary/40 text-primary hover:bg-primary hover:text-on-primary rounded-sm text-xs font-bold uppercase transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5',
}) {
  const isCompleted = task?.status === 'completed';
  const action = isCompleted ? 'uncomplete' : 'complete';
  const handler = isCompleted ? uncompleteTask : completeTask;
  return (
    <button
      type="button"
      disabled={isMutating || pendingAction === action}
      aria-busy={pendingAction === action}
      onClick={() => {
        runTaskAction(action, () => handler?.(activeProjectId, task.id)).catch(() => {
          // completeTask/uncompleteTask surface failures via the notification layer.
        });
      }}
      className={className}
    >
      {pendingAction === action ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>{isCompleted ? 'Uncompleting...' : 'Completing...'}</span>
        </>
      ) : (
        <span>{isCompleted ? '↺ Uncomplete' : '✓ Complete'}</span>
      )}
    </button>
  );
}

/***
 * MARK: TaskCompleteToggleButton default
 * @description Default export of the shared Complete/Uncomplete toggle button.
 * @example <TaskCompleteToggleButton task={task} activeProjectId={activeProjectId} completeTask={completeTask} uncompleteTask={uncompleteTask} isMutating={isMutating} pendingAction={pendingAction} runTaskAction={runTaskAction} />
 ***/
export default TaskCompleteToggleButton;
