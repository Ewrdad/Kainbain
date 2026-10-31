/***
 * MARK: TaskDetailsTab
 * @description The task inspector's Details tab: status banners, the human
 *   review checkpoint, manual steering, the report shortcut, goal editing,
 *   and the action bar. Pure composition over props owned by TaskDetailOverlay
 *   — it fetches nothing itself.
 ***/
import { TaskGoalSection } from './TaskGoalSection';
import { BlockedByEditor } from './BlockedByEditor';
import { InfoTooltip } from '../common/InfoTooltip';
import { approvalCopy } from '../stageTypes';
import { FailureMessage } from './FailureMessage';
import { RetryStatusBlock } from './RetryStatusBlock';

export function TaskDetailsTab({
  activeProjectId,
  approvalGuidance,
  completeTask,
  copiedKeyword,
  currentStageId,
  failureMessage,
  formattedKey,
  goalError,
  goalHandleBlur,
  goalIsDirty,
  goalIsSaving,
  goalLastSaved,
  hasUnsyncedChanges = false,
  handleApprove,
  handleCopyKeyword,
  handleExecuteStage,
  handleReject,
  handleResumeTask,
  handleRetryStage,
  handleSendFollowUp,
  handleSendSteering,
  interventionText,
  isAdvancing,
  isBlocked = false,
  isExecutingStage,
  isFailed,
  isFlushingSave,
  isIntervening,
  isInterrupted,
  isMutating,
  isNonAgentStage,
  isPaused,
  isRejected = false,
  isRetryingStage = false,
  isTaskExecuting,
  isTerminalApproval = false,
  isWaitingHuman,
  jumpTask,
  keywordTokens,
  logs,
  pendingAction,
  renderExecutionControls,
  runTaskAction,
  saveChanges,
  saved,
  setActiveTab,
  setApprovalGuidance,
  setInterventionText,
  setShowApprovalGuidance,
  onTitleChange,
  showApprovalGuidance,
  task,
  taskStage,
  title,
  uniqueReports,
}) {
  // Approval wording: a last-stage checkpoint completes the task, so the
  // banner promises completion instead of a next stage that does not exist.
  const bannerCopy = approvalCopy(isTerminalApproval);
  // A terminal-failed task has no stage to advance from (approving is a
  // backend 409): the checkpoint banner hides and the failure banner above
  // — with its prominent Retry Stage — owns recovery.
  const isTerminallyFailed = task?.status === 'failed';
  return (
    <div className="space-y-5">
      {/* Scheduled-retry status: attempt x/y plus the recorded ladder. */}
      <RetryStatusBlock task={task} />
      {/* Stage Execution Failure Alert Banner */}
      {isFailed && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 bg-error/10 border-2 border-error/60 rounded-sm space-y-2.5 shadow-md animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse shadow-[0_0_8px_rgba(248,81,73,0.6)]" />
              <span className="text-xs font-bold uppercase tracking-wider text-error font-mono flex items-center gap-1">
                {isRejected ? '⚠️ Stage Rejected' : '⚠️ Stage Execution Failed'}
              </span>
            </div>
            {(task?.lastError?.stageName || taskStage?.name) && (
              <span className="text-[10px] uppercase font-mono text-error bg-error/20 px-2 py-0.5 rounded border border-error/40 font-semibold">
                Stage: {task?.lastError?.stageName || taskStage?.name}
              </span>
            )}
          </div>
          <FailureMessage
            message={failureMessage}
            projectId={activeProjectId}
            taskId={task?.id}
            className="p-2.5 bg-surface-container rounded border border-error/30 font-mono text-xs text-error break-words whitespace-pre-wrap leading-relaxed select-text"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isMutating}
              onClick={handleRetryStage}
              aria-busy={isRetryingStage}
              aria-label={`Retry ${isRejected ? 'rejected' : 'failed'} stage on task ${formattedKey}`}
              className="flex-1 py-2.5 min-h-[44px] bg-error text-on-error rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
            >
              {isRetryingStage ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-on-error border-t-transparent rounded-full animate-spin" />
                  <span>Retrying Stage...</span>
                </>
              ) : (
                <span>↻ Retry Stage</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                logs.viewer.setSearch('error');
                setActiveTab('logs');
              }}
              aria-label={`View error logs for task ${formattedKey}`}
              className="px-3.5 py-2.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono"
            >
              <span>📜 View Logs</span>
            </button>
          </div>
        </div>
      )}

      {/* Interrupted Recovery Banner (#Resilience) */}
      {isInterrupted && (
        <div className="p-3.5 bg-warning/15 border border-warning/60 rounded-sm space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-warning animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-warning font-mono flex items-center gap-1">
                ⚡ Interrupted Task Restored
              </span>
            </div>
            <span className="text-[10px] uppercase font-mono text-warning bg-warning/20 px-2 py-0.5 rounded border border-warning/40 font-semibold">
              Stage: {taskStage?.name || task?.currentStageId || 'In Stage'}
            </span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">
            This task was active when the server stopped or restarted. Its state has been safely
            preserved on disk. You can resume execution from where it left off, or retry this stage.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isMutating}
              onClick={handleResumeTask}
              aria-label={`Resume interrupted task ${formattedKey}`}
              className="flex-1 py-2.5 min-h-[44px] bg-warning text-surface-deep rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
            >
              <span>▶ Resume Task</span>
            </button>
            <button
              type="button"
              disabled={isMutating}
              onClick={handleRetryStage}
              aria-label={`Retry stage on task ${formattedKey}`}
              className="px-3.5 py-2.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono"
            >
              <span>↻ Retry Stage</span>
            </button>
          </div>
        </div>
      )}

      {/* Paused Task Banner */}
      {isPaused && (
        <div className="p-3.5 bg-surface-container-high border border-border-standard rounded-sm space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-text-muted" />
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted font-mono">
                ⏸ Task Execution Paused
              </span>
            </div>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Execution is temporarily paused. Click Resume to continue pipeline processing.
          </p>
          <div className="pt-1">
            <button
              type="button"
              disabled={isMutating}
              aria-busy={pendingAction === 'resume'}
              onClick={handleResumeTask}
              className="py-2 px-4 min-h-[44px] bg-primary text-on-primary rounded-sm text-xs font-bold uppercase hover:brightness-110 disabled:opacity-40 cursor-pointer font-mono"
            >
              {pendingAction === 'resume' ? 'Resuming...' : '▶ Resume Execution'}
            </button>
          </div>
        </div>
      )}

      {/* Stage Checkpoint Alert Banner for Human Review */}
      {isWaitingHuman && !isTerminallyFailed && (
        <div className="p-3.5 bg-human-fill/60 border border-secondary/50 rounded-sm space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-secondary font-mono">
                Human Review Checkpoint
              </span>
            </div>
            <span className="text-[10px] uppercase font-mono text-text-muted bg-surface-deep px-2 py-0.5 rounded border border-border-standard">
              Stage: {taskStage?.name || 'Review'}
            </span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">{bannerCopy.detailsExplainer}</p>

          {showApprovalGuidance ? (
            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="approval-guidance"
                className="text-[11px] font-mono text-secondary font-semibold"
              >
                {bannerCopy.guidanceLabel}
              </label>
              <textarea
                id="approval-guidance"
                value={approvalGuidance}
                onChange={(e) => setApprovalGuidance(e.target.value)}
                placeholder="e.g. Please ensure API error handling covers timeout cases..."
                rows={2}
                className="w-full bg-surface-deep border border-secondary/40 rounded p-2 text-xs font-mono text-on-surface focus:outline-none focus:border-secondary"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowApprovalGuidance(true)}
              className="text-[11px] font-mono text-secondary hover:underline cursor-pointer block"
            >
              {bannerCopy.guidanceToggle}
            </button>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isMutating || isFlushingSave}
              onClick={handleApprove}
              aria-label={`Approve task ${formattedKey}${bannerCopy.bannerAriaSuffix}`}
              className="flex-1 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
            >
              {isAdvancing || isFlushingSave ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
                  <span>{isFlushingSave ? 'Saving edits...' : bannerCopy.bannerBusy}</span>
                </>
              ) : (
                <span>{bannerCopy.bannerButton}</span>
              )}
            </button>
            <button
              type="button"
              disabled={isMutating || isFlushingSave}
              onClick={handleReject}
              aria-label={`Reject task ${formattedKey}`}
              className="flex-1 py-2.5 min-h-[44px] bg-error-container text-on-error-container rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
            >
              {isFlushingSave ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-on-error-container border-t-transparent rounded-full animate-spin" />
                  <span>Saving edits...</span>
                </>
              ) : (
                <span>✕ Reject (Add Feedback...)</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Live Manual Intervention & Steering (#Intervention) */}
      {!isNonAgentStage && (
        <div className="p-3.5 bg-surface-container/60 border border-primary/40 rounded-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🕹️</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary font-mono">
                Manual Intervention & Real-Time Steering
              </span>
              <InfoTooltip
                title="Real-Time Agent Steering"
                description="Inject guidance into the actively running agent reasoning loop without restarting the task."
                behindTheScenes="Calls POST /steer or /follow-up to stream instructions directly into the active PI agent subprocess"
                position="bottom"
              />
            </div>
            <div className="flex items-center gap-1">{renderExecutionControls()}</div>
          </div>

          <p className="text-[11px] text-text-muted leading-relaxed font-mono">
            Send instructions directly to the agent session or steer execution in real time without
            restarting the task.
          </p>

          <div className="space-y-2">
            <textarea
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              placeholder="Type follow-up prompt or steering instruction..."
              rows={2}
              className="w-full bg-surface-deep border border-border-standard rounded p-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary placeholder:text-text-muted/60 resize-y min-h-[52px]"
            />
            <div className="flex items-center justify-end gap-2">
              <InfoTooltip
                title="Steer Active Agent"
                description="Injects immediate corrective guidance while the model is actively thinking."
                position="top"
              >
                <button
                  type="button"
                  disabled={!interventionText.trim() || isIntervening}
                  onClick={handleSendSteering}
                  className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-on-surface rounded text-[11px] font-mono font-semibold uppercase disabled:opacity-40 cursor-pointer flex items-center gap-1 transition-all"
                >
                  <span>🧭 Steer Agent</span>
                </button>
              </InfoTooltip>
              <InfoTooltip
                title="Queue Follow-Up Prompt"
                description="Queues a subsequent instruction for the agent upon completing the current stage."
                position="top"
              >
                <button
                  type="button"
                  disabled={!interventionText.trim() || isIntervening}
                  onClick={handleSendFollowUp}
                  className="px-3.5 py-1.5 min-h-[44px] bg-primary text-on-primary rounded text-[11px] font-mono font-bold uppercase hover:brightness-110 disabled:opacity-40 cursor-pointer flex items-center gap-1 transition-all"
                >
                  {isIntervening ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>💬 Send Follow-Up</span>
                  )}
                </button>
              </InfoTooltip>
            </div>
          </div>
        </div>
      )}

      {/* Generated Reports Quick Access Banner with Interactive In-App Link (#1, #5) */}
      {(task.outputReport || uniqueReports.length > 0) && (
        <div className="p-3 bg-surface-container border border-primary/30 rounded-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-base" aria-hidden="true">
              📄
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono font-bold uppercase text-primary">
                Generated Stage Report Available
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="text-[11px] font-mono text-text-muted hover:text-primary hover:underline truncate text-left block w-full cursor-pointer"
                title="Open report in inspector"
              >
                {task.outputReport || uniqueReports[0]?.path || `./docs/tasks/${task.id}/...`}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className="px-3 py-2 min-h-[44px] bg-primary text-on-primary rounded text-[10px] font-bold uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer flex items-center justify-center"
            >
              View Report →
            </button>
          </div>
        </div>
      )}

      {/* Primary Task Goal & Markdown Description (#33, preview-by-default except just-created tasks) */}
      <TaskGoalSection
        taskId={task?.id}
        createdAt={task?.createdAt}
        title={title}
        onTitleChange={onTitleChange}
        onBlurSave={goalHandleBlur}
        isSaving={goalIsSaving}
        lastSaved={goalLastSaved}
        error={goalError}
        isExecuting={isTaskExecuting}
        isDirty={goalIsDirty}
        hasUnsyncedChanges={hasUnsyncedChanges}
        idPrefix="task-goal"
        variant="overlay"
        projectId={activeProjectId}
      >
        {/* Keyword Tokens — click to copy the token into the description (#keyword-system) */}
        <div className="pt-1 border-t border-border-standard/60">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted font-mono">
                Dynamic Context Tokens
              </span>
              <InfoTooltip
                title="Context Curation Tokens"
                description="Tokens dynamically replaced with actual project paths, previous reports, and repository info."
                behindTheScenes="Evaluated by prompt curation service prior to LLM dispatch"
                position="top"
              />
            </div>
            <span className="text-[9px] font-mono text-text-muted">Click token to copy</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keywordTokens.map((kw) => (
              <InfoTooltip
                key={kw.token}
                title={`Token: ${kw.token}`}
                description={kw.hint}
                behindTheScenes={`Resolves to: ${kw.value}`}
                position="top"
              >
                <button
                  type="button"
                  onClick={() => handleCopyKeyword(kw)}
                  aria-label={`Copy keyword ${kw.token} (${kw.hint})`}
                  className="px-2 py-1 rounded bg-surface border border-border-standard hover:border-primary hover:bg-surface-container-high text-[10px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="text-primary">{kw.token}</span>
                  <span className="text-text-muted">{kw.label}</span>
                  {copiedKeyword === kw.token && <span className="text-primary font-bold">✓</span>}
                </button>
              </InfoTooltip>
            ))}
          </div>
        </div>
      </TaskGoalSection>

      {/* Task dependencies: prerequisite tasks this task waits on before it may execute */}
      {isBlocked && (
        <p
          role="status"
          className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-[11px] font-mono text-text-muted"
        >
          Blocked by unfinished prerequisites — Run Stage is disabled until every blocker completes.
        </p>
      )}
      <BlockedByEditor task={task} disabled={isMutating} />

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isMutating}
            onClick={saveChanges}
            className="px-4 py-2.5 min-h-[44px] bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center justify-center font-mono disabled:opacity-40"
          >
            {pendingAction === 'save' ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>

          {!isWaitingHuman && task.status !== 'completed' && taskStage?.type !== 'human' && (
            <button
              type="button"
              onClick={handleExecuteStage}
              disabled={isMutating || isBlocked}
              aria-busy={isExecutingStage}
              className="px-3.5 py-2.5 min-h-[44px] bg-surface-container border border-primary text-primary hover:bg-primary hover:text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 font-mono"
            >
              {isExecutingStage ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>Run Stage</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {task.status !== 'completed' && (
            <button
              type="button"
              disabled={isMutating}
              aria-busy={pendingAction === 'complete'}
              onClick={() => {
                runTaskAction('complete', () => completeTask?.(activeProjectId, task.id)).catch(
                  () => {
                    // completeTask surfaces failures via its notification layer.
                  },
                );
              }}
              className="px-3.5 py-2.5 min-h-[44px] border border-primary/40 text-primary hover:bg-primary hover:text-on-primary rounded-sm text-xs font-bold uppercase transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {pendingAction === 'complete' ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Completing...</span>
                </>
              ) : (
                <span>✓ Complete</span>
              )}
            </button>
          )}
          <button
            type="button"
            disabled={isMutating}
            onClick={() => {
              runTaskAction('jump', () =>
                jumpTask?.(activeProjectId, task.id, currentStageId),
              ).catch(() => {
                // jumpTask surfaces failures via its logger.
              });
            }}
            className="px-3.5 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center"
          >
            Prioritise
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsTab;
