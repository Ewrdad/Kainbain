import React, { useContext, useState } from 'react';
import {
  approvalCopy,
  findStageIndex,
  getStageType,
  isLastStage as isFinalStage,
  isTerminalHumanApproval,
} from '../stageTypes';
import { resolveCheckpointState, resolveTaskStage } from './checkpointState';
import { isEngineBusyWithOther, isStaleRunner, isTaskRunning } from './runningTask';
import { KainBainContext } from '../../context/KainBainContext';
import {
  formatBlockerKeys,
  formatTaskKey,
  formatTaskTimestamp,
  formatTaskTitleFirstLine,
  getBlockedState,
} from './taskFormatters';
import {
  describePace,
  elapsedStageSeconds,
  formatStageAge,
  paceStatus,
  shouldShowPace,
} from './stagePace';

import { SelectDropdown } from '../common/SelectDropdown';
import { InfoTooltip } from '../common/InfoTooltip';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { isInteractiveTarget } from '../../hooks/useTapGuard';
import { copyToClipboard } from '../../services/clipboard';
import { getTaskBranchName, buildCheckoutCommand } from './taskBranch';
import { isRejectedTask } from './failureReason';

/***
 * MARK: extractModelHarnessInfo
 * @description Reads the last completed stage's resolved run choice from the
 *   persisted report metadata (reportMetadata frontmatter, same vocabulary
 *   as the history timeline rows: harnessId, modelRef, aliasName). Total on
 *   malformed input: returns null silently, never throws, never logs — a card
 *   must not fail or spam the console because one task's metadata is corrupt.
 *   Callers show the chip when a harness or a model names anything; an alias
 *   alone never qualifies, matching the timeline badge's blank rule.
 * @example extractModelHarnessInfo({ reportMetadata: '[{"harnessId":"pi","modelRef":"glm","aliasName":"w"}]' }) => { harnessId: 'pi', modelRef: 'glm', aliasName: 'w' }
 * @example extractModelHarnessInfo({}) => null
 * @param {Object} task - The task object.
 * @returns {{ harnessId: string|null, modelRef: string|null, aliasName: string|null }|null} The last run choice, or null when none is recorded.
 */
export function extractModelHarnessInfo(task) {
  if (!task || typeof task.reportMetadata !== 'string' || !task.reportMetadata.trim()) return null;
  try {
    const reportMetadata = JSON.parse(task.reportMetadata);
    if (!Array.isArray(reportMetadata)) return null;
    const lastStage = reportMetadata.length > 0 ? reportMetadata[reportMetadata.length - 1] : null;
    if (!lastStage || typeof lastStage !== 'object') return null;
    const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    return {
      modelRef: clean(lastStage.modelRef),
      harnessId: clean(lastStage.harnessId),
      aliasName: clean(lastStage.aliasName),
    };
  } catch {
    return null;
  }
}

/***
 * MARK: TaskCard
 * @description Renders a compact, draggable task card for the Kanban board
 * conforming to DESIGN_SPEC.md (role-based chromatics, 4px border accent,
 * JetBrains Mono task key, real time in stage, status dot, immediate disabled
 * in-flight approval guards on checkpoints, and accessible keyboard movement fallbacks).
 *
 * @param {Object} props
 * @param {Object} props.task - The task object.
 * @param {string} props.stageName - Name of current stage.
 * @param {string} props.role - Stage role ('agent', 'human', 'ci').
 * @param {Function} props.onClick - Click handler for card inspection.
 * @param {boolean} [props.isActive=false] - Whether this task is currently being executed.
 * @param {Function} [props.onApprove] - Callback when human approves checkpoint.
 * @param {Function} [props.onReject] - Callback when human rejects checkpoint.
 * @param {Function} [props.onExecute] - Callback when running automated stage.
 * @param {number} [props.avgDurationSeconds] - Stage average duration in
 *   seconds for the pace signal; omitted (or <= 0) renders neutrally.
 * @param {number} [props.nowMs] - The moment age is measured against; when
 *   omitted the shared board tick subscription is used.
 * @example <TaskCard task={task} stageName="Review" role="human" onClick={openTask} />
 ***/
export function TaskCard({
  task,
  stageName,
  role,
  onClick,
  isActive = false,
  onApprove,
  onReject,
  onExecute,
  avgDurationSeconds,
  nowMs,
}) {
  const ctx = useContext(KainBainContext);
  const uiPreferences = ctx?.uiPreferences;
  const stages = ctx?.stages || [];
  const engineState = ctx?.engineState;

  // Single-flight guards: while a checkpoint action (approve/reject/execute) is
  // awaiting the backend, no other mutation can fire from this card and the
  // in-flight button shows a loading state. Stage moves get their own guard so
  // the optimistic drag/reorder controls stay independent.
  const { pendingKey: pendingCheckpointAction, run: runCheckpointAction } = usePendingAction();
  const { pendingKey: pendingMoveAction, run: runMoveAction } = usePendingAction();
  const isAdvancing = pendingCheckpointAction === 'advance';
  const isRejecting = pendingCheckpointAction === 'reject';
  const isExecuting = pendingCheckpointAction === 'execute';
  const isCheckpointBusy = pendingCheckpointAction !== null;
  const isMoving = pendingMoveAction !== null;
  const [isDragging, setIsDragging] = useState(false);
  const [copiedCheckout, setCopiedCheckout] = useState(false);

  const typeConfig = getStageType(role?.toLowerCase?.());
  const isCompleted = task.status === 'completed';
  const isHuman =
    role === 'human' || stageName?.toLowerCase?.() === 'human' || typeConfig.type === 'human';
  // Checkpoint chrome derives from the active pipeline's stage record for
  // this task (task 8a056fc4): a stale `waiting_human` payload must never
  // paint Approve/Reject onto a non-checkpoint column after a pipeline
  // switch. Only a standalone card with no resolvable record falls back to
  // the column role prop.
  const cardStage = resolveTaskStage(stages, task);
  const isCheckpointStage = resolveCheckpointState(task, cardStage, {
    role,
    stageName,
  }).showCheckpoint;
  // A parked non-checkpoint stage is always a survey handoff: human approval
  // owns `waiting_human` on checkpoint stages, so anything else parked must be
  // a question-me survey — even when the stage record or the persisted
  // `surveyPending` flag is unavailable (restart, pipeline edit). Fail-visible
  // on purpose: a spurious survey link is harmless, a missing one strands the
  // task with no way forward.
  const isSurveyWaiting = task?.status === 'waiting_human' && !isCheckpointStage;
  // A terminal-failed task has no stage to advance from: approving it is a
  // backend 409 ("retry the stage instead of approving"), so the card hides
  // the checkpoint actions on failed tasks. Recovery lives in the detail
  // view, where Retry Stage is prominent.
  const isTerminallyFailed = task.status === 'failed';

  // Last run's resolved choice for display (persisted report data, so it
  // survives restarts). Same blank rule as the history badge: CI/human
  // roles show nothing, and an alias alone never qualifies — only a named
  // harness or model earns the footnote.
  const { modelRef, harnessId, aliasName } = extractModelHarnessInfo(task) || {};
  const shouldShowModelHarnessInfo =
    role !== 'human' && role !== 'ci' && Boolean(modelRef || harnessId);
  // Prefer the scheduler's verdict when the payload carries it (queue items)
  // so card and queue can never disagree; otherwise derive from live statuses.
  const { isBlocked, blockerIds } = getBlockedState(task, ctx?.tasks);
  const blockerKeys = formatBlockerKeys(blockerIds);
  const blockedByLabel = blockerKeys ? `Blocked by ${blockerKeys}` : 'Blocked by dependencies';
  // Single-active invariant: RUNNING means this card owns the running
  // engine (or the explicit isActive flag from the board). A running_*
  // label on a non-owner is stale — it renders as interrupted (see
  // isStaleRunner below), never as a second RUNNING badge.
  // Wire-executor assignments never touch the embedded engine state, so a
  // claimed task would otherwise sit at AGENT_READY looking idle. A live
  // claim means a Runner is executing it right now.
  const isRunnerHeld = !!task?.claim?.runnerId;
  const isRunning =
    isActive || isRunnerHeld || isTaskRunning(task, engineState, ctx?.isAgentRunning);
  const isStale = !isActive && isStaleRunner(task, engineState);
  // Manual dispatch while another task owns the engine answers 409
  // ("Engine is already running another task"): show queued/busy instead
  // of implying the run starts now.
  const isEngineBusy = !isRunning && isEngineBusyWithOther(task, engineState);

  // Critique #19: For human checkpoint stages, do NOT show the "Run Stage" button
  const isExecutableStage =
    !isCheckpointStage &&
    !isCompleted &&
    !isHuman &&
    (role === 'agent' || role === 'ci' || role === 'script' || role === 'merge');

  const showTaskId = uiPreferences?.showTaskId !== false;
  const showStageBadge = uiPreferences?.showStageBadge !== false;
  const showTimeInStage = uiPreferences?.showTimeInStage !== false;
  const previewLines = uiPreferences?.cardPreviewLines ?? 2;

  // Task-card density (task 7a411b12 R2): 'compact' is the product default —
  // cards shrink on all viewports (mobile AND desktop, where only 1–2 cards
  // used to fit). The explicit 'default' value restores the full card.
  // Compact keeps: task ID, status dot/label, a short stage-age readout,
  // failure + Done badges, and the checkpoint Approve/Reject + PR review
  // actions (critical signals/actions); it drops: stage badge, blocked
  // badge, report count, the Run Stage row and the stage-navigation arrows
  // row (all still reachable via drag-and-drop, keyboard fallbacks, or the
  // Task Inspector overlay).
  const isCompact = uiPreferences?.taskCardDensity !== 'default';

  // Resolve line-clamp class from user preview preference (if/else chain for readability).
  // Compact density always clamps the goal to one line, overriding cardPreviewLines.
  const clampClass = (() => {
    if (isCompact) return 'line-clamp-1';
    if (previewLines === 1) return 'line-clamp-1';
    if (previewLines === 3) return 'line-clamp-3';
    if (previewLines === 'unlimited') return 'line-clamp-none';
    return 'line-clamp-2';
  })();

  // Compute stage positions for keyboard / button navigation fallbacks (#34).
  // Shared backend-parity matching (id, then case-insensitive name): the
  // card, the approval copy, and the API agree on which stage is last.
  const currentStageIndex = findStageIndex(stages, task.currentStageId || stageName);
  const isFirstStage = currentStageIndex <= 0;
  const isLastStage = isFinalStage(stages, task.currentStageId || stageName);
  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < stages.length - 1
      ? stages[currentStageIndex + 1]
      : null;

  /***
   * MARK: handleDragStart
   * @description Attaches task ID data to drag payload.
   * @param {React.DragEvent} e
   * @example onDragStart={handleDragStart}
   ***/
  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/kainbain-task', task.id);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  /***
   * MARK: handleDragEnd
   * @description Cleans up dragging state when drag release completes.
   * @example onDragEnd={handleDragEnd}
   ***/
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  /***
   * MARK: handleMoveLeft
   * @description Moves the task to the preceding stage in the pipeline workflow (#34).
   * Guarded by usePendingAction so a fast double-click cannot fire two moves.
   * @param {React.MouseEvent} [e]
   * @example handleMoveLeft(e)
   ***/
  const handleMoveLeft = (e) => {
    e?.stopPropagation();
    if (isFirstStage || !prevStage) return;
    runMoveAction('move', async () => {
      if (ctx?.moveTask && ctx?.activeProjectId) {
        await ctx.moveTask(ctx.activeProjectId, task.id, prevStage.id);
      }
    }).catch(() => {
      // Reconciled by moveTask's refresh; nothing further to do here.
    });
  };

  /***
   * MARK: handleMoveRight
   * @description Moves the task to the succeeding stage in the pipeline workflow (#34).
   * Guarded by usePendingAction so a fast double-click cannot fire two moves.
   * @param {React.MouseEvent} [e]
   * @example handleMoveRight(e)
   ***/
  const handleMoveRight = (e) => {
    e?.stopPropagation();
    if (isLastStage || !nextStage) return;
    runMoveAction('move', async () => {
      if (ctx?.moveTask && ctx?.activeProjectId) {
        await ctx.moveTask(ctx.activeProjectId, task.id, nextStage.id);
      }
    }).catch(() => {
      // Reconciled by moveTask's refresh; nothing further to do here.
    });
  };

  /***
   * MARK: handleMoveToStage
   * @description Moves the task to a chosen stage ID from the accessibility dropdown (#34).
   * Guarded by usePendingAction so a rapid re-selection cannot fire two moves.
   * @param {string} targetStageId
   * @example handleMoveToStage('stage-2')
   ***/
  const handleMoveToStage = (targetStageId) => {
    if (!targetStageId || targetStageId === task.currentStageId) return;
    runMoveAction('move', async () => {
      if (ctx?.moveTask && ctx?.activeProjectId) {
        await ctx.moveTask(ctx.activeProjectId, task.id, targetStageId);
      }
    }).catch(() => {
      // Reconciled by moveTask's refresh; nothing further to do here.
    });
  };

  /***
   * MARK: handleCardKeyDown
   * @description Keyboard navigation handlers: Enter/Space to inspect, Alt+Left/[ to move left, Alt+Right/] to move right (#34).
   *   Key events from a focused button (Approve/Reject/nav arrows, dropdown)
   *   bubble up to this card handler; those must actuate the control itself,
   *   so the inspect shortcut is skipped for them — otherwise Enter on the
   *   Approve button would preventDefault the native activation and open the
   *   full-screen inspector instead.
   * @param {React.KeyboardEvent} e
   * @example onKeyDown={handleCardKeyDown}
   ***/
  const handleCardKeyDown = (e) => {
    if (isInteractiveTarget(e.target)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(e);
    } else if ((e.altKey && e.key === 'ArrowLeft') || e.key === '[') {
      e.preventDefault();
      handleMoveLeft(e);
    } else if ((e.altKey && e.key === 'ArrowRight') || e.key === ']') {
      e.preventDefault();
      handleMoveRight(e);
    }
  };

  /***
   * MARK: handleCardClick
   * @description Opens the task inspector only when the tap landed on a
   *   non-button region of the card. Taps on buttons, dropdown triggers, and
   *   inputs actuate the control itself and must never pop the inspector over
   *   it — on mobile the inspector is a full-screen dialog that would hide the
   *   whole board (task e2cf55ac). InfoTooltip-wrapped badges already pin
   *   their popover and stop propagation in touch mode; this root guard backs
   *   that policy up for every other interactive element.
   * @param {React.MouseEvent} e
   ***/
  const handleCardClick = (e) => {
    if (isInteractiveTarget(e.target)) return;
    onClick?.(e);
  };

  /***
   * MARK: handleExecuteClick
   * @description Dispatches the automated AI agent or CI bash execution for this stage.
   * Guarded by usePendingAction so a fast double-click cannot dispatch twice.
   * @param {React.MouseEvent} e
   * @example onClick={handleExecuteClick}
   ***/
  const handleExecuteClick = (e) => {
    e.stopPropagation();
    if (isExecuting || isRunning || isEngineBusy) return;
    runCheckpointAction('execute', async () => {
      if (onExecute) {
        await onExecute(task.id);
      } else if (ctx?.executeTaskStage && ctx?.activeProjectId) {
        await ctx.executeTaskStage(ctx.activeProjectId, task.id);
      }
    }).catch(() => {
      // Handled by notification layer
    });
  };

  /***
   * MARK: handleApproveClick
   * @description Approves checkpoint and advances task to next stage.
   * Guarded by usePendingAction so a fast double-click cannot approve twice.
   * @param {React.MouseEvent} e
   * @example onClick={handleApproveClick}
   ***/
  const handleApproveClick = (e) => {
    e.stopPropagation();
    if (isCheckpointBusy) return;
    runCheckpointAction('advance', async () => {
      if (onApprove) {
        await onApprove(task.id);
      } else if (ctx?.advanceTask && ctx?.activeProjectId) {
        await ctx.advanceTask(ctx.activeProjectId, task.id);
      }
    }).catch(() => {
      // Error handled by context/notification layer
    });
  };

  /***
   * MARK: handleRejectClick
   * @description Opens feedback rejection dialog with correction criteria (#35).
   * Guarded by usePendingAction so approve/reject cannot interleave.
   * @param {React.MouseEvent} e
   * @example onClick={handleRejectClick}
   ***/
  const handleRejectClick = (e) => {
    e.stopPropagation();
    if (isCheckpointBusy) return;
    runCheckpointAction('reject', async () => {
      if (onReject) {
        await onReject(task);
      } else if (ctx?.openFeedbackDialog) {
        ctx.openFeedbackDialog(task);
      }
    }).catch(() => {
      // Error handled by context/notification layer
    });
  };

  /***
   * MARK: handleOpenPrReview
   * @description Opens the MR-style PR review page (`#/tasks/<id>/review`)
   *   for this task. Available when the project opted into per-task branches;
   *   disabled otherwise (D7).
   ***/
  const handleOpenSurvey = (e) => {
    e?.stopPropagation?.();
    if (!task?.id) return;
    ctx?.setView?.('task-survey', { taskId: task.id });
  };

  const branchReviewAvailable = Boolean(
    ctx?.projects?.find?.((p) => String(p.id) === String(ctx?.activeProjectId))?.useBranches,
  );
  const handleOpenPrReview = (e) => {
    e.stopPropagation();
    if (!task?.id) return;
    // Opening review IS a navigation: the facade routes to the canonical
    // `/tasks/:id/review` path and the bridge resolves the inspector task.
    ctx?.setView?.('task-review', { taskId: task.id });
  };

  /***
   * MARK: handleCopyCheckout
   * @description Copies a ready-to-paste `git fetch origin && git checkout
   *   <branch>` command for this task's branch so the reviewer can open the
   *   branch in another tool or terminal. Shows `Copied ✓` for 2s on success.
   ***/
  const handleCopyCheckout = async (e) => {
    e.stopPropagation();
    const command = buildCheckoutCommand(getTaskBranchName(task));
    if (!command) return;
    const ok = await copyToClipboard(command);
    if (ok) {
      setCopiedCheckout(true);
      setTimeout(() => setCopiedCheckout(false), 2000);
    }
  };

  const isRetrying = task.autoRetrying === true;
  // A deliberate rejection keeps its flag even while an auto-retry is
  // queued: the reason is about to be snapshotted into the next attempt's
  // prompt, so hiding it would hide the pending context.
  const isRejectedFailure = isRejectedTask(task);
  const isFailed =
    task.status === 'failed' ||
    (Boolean(task.failureReason) && (!task.autoRetrying || isRejectedFailure));
  const isRejected = isFailed && isRejectedFailure;
  const isInterrupted = task.wasInterrupted === true || task.status === 'interrupted' || isStale;
  const isPaused = task.status === 'paused';

  const statusLabel = () => {
    if (isRetrying) return 'RETRYING';
    if (isRejected) return 'REJECTED';
    if (isFailed) return 'FAILED';
    if (isInterrupted) return 'INTERRUPTED';
    if (isPaused) return 'PAUSED';
    if (isRunnerHeld) return `RUNNING · ${task.claim.runnerId}`;
    if (isRunning) return 'RUNNING';
    if (isCompleted) return 'DONE';
    if (isBlocked) return 'BLOCKED';
    if (isSurveyWaiting) return 'AWAITING_SURVEY';
    if (isCheckpointStage) return 'AWAITING_REVIEW';
    if (role === 'agent') return 'AGENT_READY';
    if (role === 'ci') return 'CI_READY';
    if (role === 'merge') return 'MERGE_READY';
    return 'PENDING';
  };

  const statusColorClass = () => {
    if (isRetrying) return 'text-warning font-bold';
    if (isFailed) return 'text-error font-bold';
    if (isInterrupted) return 'text-warning font-bold';
    if (isPaused) return 'text-text-muted font-bold';
    if (isCompleted) return 'text-primary';
    if (isRunning) return 'text-primary';
    if (isBlocked) return 'text-[#ffb4ab] font-bold';
    if (role === 'agent') return 'text-primary';
    return 'text-secondary';
  };

  const statusDotClass = () => {
    if (isRetrying) return 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse';
    if (isFailed) return 'bg-error shadow-[0_0_8px_rgba(248,81,73,0.5)]';
    if (isInterrupted) return 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse';
    if (isPaused) return 'bg-text-muted';
    if (isCompleted) return 'bg-primary';
    if (isRunning) return 'bg-primary';
    if (isBlocked) return 'bg-[#ffb4ab]';
    if (role === 'agent') return 'bg-primary';
    return 'bg-secondary';
  };

  const formattedKey = formatTaskKey(task.id);
  const formattedTimestamp = formatTaskTimestamp(task);

  // Pace signal: running and human-review tasks are tinted against the stage
  // average (green under, amber near, red over); everything else — idle
  // tasks, error states, missing averages — stays neutral. Tint-only, so the
  // meta row keeps its single line in both densities. The tick is the shared
  // board subscription (one interval for all cards); an explicit nowMs prop
  // wins so tests can freeze the clock.
  const sharedNowMs = useNow();
  const effectiveNowMs = nowMs ?? sharedNowMs;
  const showPace = shouldShowPace(task, { isRunning, isReview: isCheckpointStage });
  const elapsedSec = elapsedStageSeconds(task, effectiveNowMs);
  const pace = showPace ? paceStatus(elapsedSec, avgDurationSeconds) : 'unknown';
  const paceCopy = describePace(elapsedSec, avgDurationSeconds);
  const shortStageAge = formatStageAge(task, effectiveNowMs);
  const paceTextClass =
    pace === 'over'
      ? 'text-error font-bold'
      : pace === 'near'
        ? 'text-warning font-bold'
        : pace === 'under'
          ? 'text-primary'
          : 'text-text-muted';
  const paceDotClass = pace === 'over' ? 'bg-error' : pace === 'near' ? 'bg-warning' : 'bg-primary';
  const reportsCount = (() => {
    // Board summaries cap the reports array (see toTaskSummary) and carry
    // the total separately — prefer it so old tasks don't undercount, but
    // keep the outputReport fallback when there is genuinely no report list.
    if (Number.isFinite(task.reportCount) && (task.reportCount > 0 || Array.isArray(task.reports)))
      return task.reportCount;
    if (Array.isArray(task.reports)) return task.reports.length;
    if (task.outputReport) return 1;
    return 0;
  })();

  // Card container state styling (failure/completed/running vs default).
  const stateClass = (() => {
    if (isRetrying)
      return 'bg-warning/5 border-warning/70 hover:border-warning hover:bg-warning/10 shadow-[0_0_10px_rgba(234,179,8,0.15)]';
    if (isFailed)
      return 'bg-error/5 border-error/80 hover:border-error hover:bg-error/10 shadow-[0_0_10px_rgba(248,81,73,0.15)]';
    if (isCompleted)
      return 'opacity-80 bg-surface-container/50 border-primary/40 hover:opacity-100';
    if (isRunning)
      return 'bg-agent-fill/20 outline outline-1 outline-primary/30 shadow-[0_0_12px_rgba(123,219,133,0.25)] border-primary animate-pulse';
    return 'hover:border-primary hover:bg-surface-container';
  })();

  // Run Stage description per role.
  const runStageDescription = (() => {
    if (role === 'ci') return 'Executes automated CI verification command in terminal.';
    if (role === 'merge') return 'Merges the task branch into main — git operations only.';
    return 'Spawns autonomous AI agent to execute stage system prompt.';
  })();

  // Run Stage button label per role.
  const runStageLabel = (() => {
    if (role === 'ci') return 'Run CI';
    if (role === 'merge') return 'Merge to Main';
    return 'Dispatch Agent';
  })();

  // Run Stage button content per execution state.
  const renderRunStageContent = () => {
    if (isExecuting || isRunning) {
      return (
        <>
          <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Executing...</span>
        </>
      );
    }
    if (isEngineBusy) {
      return (
        <>
          <span>⏳</span>
          <span>Queued — engine busy</span>
        </>
      );
    }
    if (isBlocked) {
      return (
        <>
          <span>⛔</span>
          <span>Blocked by dependencies</span>
        </>
      );
    }
    return (
      <>
        <span>▶</span>
        <span>Run Stage ({runStageLabel})</span>
      </>
    );
  };

  // ---- Card row blocks ----
  // Pure code motion: the former inline JSX rows are now named consts so each
  // row can be composed conditionally (e.g. compact task-card density) with a
  // small, reviewable diff. JSX and classNames are byte-identical to the
  // original inline markup — this refactor changes no visual output.

  // Header row: task ID (left) + status/role badges (right).
  // Compact keeps only the failure and ✓ Done badges (critical state signals);
  // stage identity is already the column heading, and details live in the
  // Task Inspector. In compact the row renders when any of its kept parts do.
  const headerRow = (showTaskId ||
    isCompleted ||
    isFailed ||
    (!isCompact && (showStageBadge || reportsCount > 0))) && (
    <div className="flex justify-between items-start mb-2">
      {showTaskId ? (
        <InfoTooltip
          title={`Task ID: ${formattedKey}`}
          description="Unique task identifier mapped to task directory."
          behindTheScenes={`Disk directory: docs/tasks/${task.id}/ containing markdown reports and logs.`}
          position="top-left"
        >
          <span
            className={`font-mono font-semibold text-text-muted cursor-help ${
              isCompact ? 'text-[10px]' : 'text-xs'
            }`}
          >
            {formattedKey}
          </span>
        </InfoTooltip>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1.5">
        {isFailed && (
          <InfoTooltip
            title={isRejected ? 'Stage Rejected' : 'Stage Execution Failed'}
            description={task.failureReason || task.lastError?.message || 'Stage execution failed.'}
            behindTheScenes={
              isRejected
                ? 'Deliberate rejection (human review or review-stage verdict). The reason rides into the next attempt. Use Retry or manual move to recover.'
                : 'Exit code != 0 or runtime exception. Use Retry or manual move to recover.'
            }
            position="top"
          >
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm font-bold bg-error/20 text-error border border-error/40 flex items-center gap-0.5 cursor-help"
              aria-label={isRejected ? 'Rejected execution' : 'Failed execution'}
            >
              {isRejected ? '⚠️ Rejected' : '⚠️ Failed'}
            </span>
          </InfoTooltip>
        )}
        {isBlocked && !isCompleted && !isCompact && (
          <InfoTooltip
            title="Task Dependency Blocked"
            description={`Blocked by prerequisite unfinished tasks: ${blockerKeys || 'tasks'}`}
            position="top"
          >
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm font-bold bg-[#ffb4ab]/15 text-[#ffb4ab] border border-[#ffb4ab]/30 flex items-center gap-0.5 cursor-help"
              aria-label={blockedByLabel}
            >
              ⛔ Blocked
            </span>
          </InfoTooltip>
        )}
        {isCompleted && (
          <InfoTooltip
            title="Task Completed"
            description="Task has traversed all pipeline stages successfully."
            position="top"
          >
            <span className="text-[8px] font-label-caps px-1.5 py-0.5 rounded-sm font-bold uppercase bg-primary/20 text-primary border border-primary/30 cursor-help">
              ✓ Done
            </span>
          </InfoTooltip>
        )}
        {reportsCount > 0 && !isCompact && (
          <InfoTooltip
            title="Generated Reports"
            description={`${reportsCount} markdown report${reportsCount === 1 ? '' : 's'} saved on disk.`}
            behindTheScenes="Stored in docs/tasks/<id>/ and linked to the notes space."
            position="top"
          >
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm font-bold bg-surface-container-high border border-border-standard text-primary flex items-center gap-0.5 cursor-help"
              aria-label={`${reportsCount} reports`}
            >
              📄 {reportsCount}
            </span>
          </InfoTooltip>
        )}
        {shouldShowModelHarnessInfo && !isCompact && (
          <InfoTooltip
            title="Model & Harness"
            description={`Model: ${modelRef || 'unknown'}
Harness: ${harnessId || 'unknown'}${aliasName ? `\nAlias: ${aliasName}` : ''}`}
            position="top"
          >
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm text-text-muted flex items-center gap-0.5 cursor-help"
              aria-label={`Model: ${modelRef || 'unknown'}, Harness: ${harnessId || 'unknown'}${aliasName ? `, Alias: ${aliasName}` : ''}`}
            >
              {[harnessId, modelRef, aliasName ? `alias ${aliasName}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </InfoTooltip>
        )}
        {showStageBadge && !isCompact && (
          <span
            className={`text-[8px] font-label-caps px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider ${typeConfig.badgeClass}`}
          >
            {typeConfig.label}
          </span>
        )}
      </div>
    </div>
  );

  // Goal title row (line-clamped by user preference; compact forces one line).
  const titleRow = (
    <div
      className={`font-headline-sm text-on-surface ${isCompact ? 'mb-1.5' : 'mb-3'} ${clampClass} leading-snug font-medium`}
    >
      {formatTaskTitleFirstLine(task)}
    </div>
  );

  // Meta row: time in stage (left) + status dot & label (right). The age
  // renders in both densities — full timestamp on full cards, short age on
  // compact — tinted by the pace signal when one applies. The tooltip carries
  // the elapsed-vs-average detail so colour is never the only signal.
  const ageText = isCompact ? shortStageAge : formattedTimestamp;
  const metaRow = (
    <div className="flex justify-between items-center text-text-muted font-label-caps text-[9px] font-mono">
      {showTimeInStage ? (
        showPace ? (
          <InfoTooltip
            title={paceCopy.title}
            description={paceCopy.description}
            position="top"
            size="sm"
          >
            <span data-testid="task-stage-age" data-pace={pace} className={paceTextClass}>
              {ageText}
            </span>
          </InfoTooltip>
        ) : (
          <span data-testid="task-stage-age" data-pace={pace} className="text-text-muted">
            {ageText}
          </span>
        )
      ) : (
        <span />
      )}
      <span
        className={`flex items-center gap-1.5 font-bold ${statusColorClass()}`}
        aria-label={isBlocked ? blockedByLabel : undefined}
        title={isBlocked ? blockedByLabel : undefined}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${pace !== 'unknown' ? paceDotClass : statusDotClass()}`}
        />
        {statusLabel()}
      </span>
    </div>
  );

  // Approval wording: a last-stage checkpoint completes the task, so the
  // button promises completion instead of a next stage that does not exist.
  const checkpointCopy = approvalCopy(
    isTerminalHumanApproval(stages, task.currentStageId || stageName),
  );

  // Human checkpoint approval banner & actions.
  const checkpointActions = isCheckpointStage && !isCompleted && !isTerminallyFailed && (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- propagation guard only; inner buttons are the keyboard path
    <div
      className="mt-2.5 pt-2.5 border-t border-border-standard/60 flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <InfoTooltip
        title={checkpointCopy.cardTooltipTitle}
        description={checkpointCopy.cardTooltipDescription}
        position="top"
        className="flex-1 min-w-0"
      >
        <button
          type="button"
          disabled={isCheckpointBusy || isBlocked}
          onClick={handleApproveClick}
          aria-label={`Approve task ${formattedKey}${checkpointCopy.cardAriaSuffix}`}
          className="w-full py-1.5 px-2 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-[10px] font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1 font-mono overflow-hidden"
        >
          {isAdvancing ? (
            <>
              <span className="inline-block w-2.5 h-2.5 border-2 border-on-secondary border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="truncate">{checkpointCopy.cardBusy}</span>
            </>
          ) : (
            <span className="truncate">{checkpointCopy.cardButton}</span>
          )}
        </button>
      </InfoTooltip>

      <InfoTooltip
        title="Reject with Feedback"
        description="Rejects checkpoint, captures feedback, and sends task back to the fallback stage for revision."
        behindTheScenes="Attaches guidance to task metadata and triggers fallback stage execution"
        position="top"
        className="flex-1 min-w-0"
      >
        <button
          type="button"
          disabled={isCheckpointBusy}
          onClick={handleRejectClick}
          aria-label={`Reject task ${formattedKey}`}
          className="w-full py-1.5 px-2 min-h-[44px] bg-surface-container text-error border border-error/40 hover:bg-error hover:text-on-error rounded-sm text-[10px] font-bold uppercase active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1 font-mono overflow-hidden"
        >
          {isRejecting ? (
            <>
              <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="truncate">Rejecting...</span>
            </>
          ) : (
            <span className="truncate">✕ Reject (Add Feedback...)</span>
          )}
        </button>
      </InfoTooltip>
    </div>
  );

  // PR review quick access on human checkpoint cards (A1).
  const prReviewRow = isCheckpointStage && !isCompleted && (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- propagation guard only; inner button is the keyboard path */
    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <InfoTooltip
        title="Open PR Review"
        description={
          branchReviewAvailable
            ? 'Review the code changes on this task branch line by line before approving.'
            : 'Enable branch support in project settings to review code changes.'
        }
        position="top"
        className="flex-1"
      >
        <button
          type="button"
          disabled={!branchReviewAvailable}
          onClick={handleOpenPrReview}
          aria-label={`Open PR review for task ${formattedKey}`}
          className="w-full py-1.5 px-2 min-h-[44px] bg-surface-deep text-on-surface border border-border-standard hover:bg-surface-container hover:text-primary rounded-sm text-[10px] font-bold uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center justify-center gap-1 font-mono"
        >
          🔍 Open PR Review
        </button>
      </InfoTooltip>
      <InfoTooltip
        title="Copy Checkout"
        description={
          branchReviewAvailable
            ? 'Copy a git fetch + checkout command for this task branch to review or edit it in another tool.'
            : 'Enable branch support in project settings to copy the checkout command.'
        }
        position="top"
        className="flex-1"
      >
        <button
          type="button"
          disabled={!branchReviewAvailable}
          onClick={handleCopyCheckout}
          aria-label={`Copy checkout command for task ${formattedKey}`}
          className="w-full py-1.5 px-2 min-h-[44px] bg-surface-deep text-on-surface border border-border-standard hover:bg-surface-container hover:text-primary rounded-sm text-[10px] font-bold uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center justify-center gap-1 font-mono"
        >
          {copiedCheckout ? 'Copied ✓' : '⧉ Copy Checkout'}
        </button>
      </InfoTooltip>
    </div>
  );

  // Survey quick access on parked question-me stages (human intervention).
  const surveyRow = isSurveyWaiting && !isCompleted && (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- propagation guard only; inner button is the keyboard path
    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <InfoTooltip
        title="Open Survey"
        description="This stage asked questions before continuing. Open the survey, answer, and submit to move on."
        position="top"
        className="flex-1"
      >
        <button
          type="button"
          onClick={handleOpenSurvey}
          aria-label={`Open survey for task ${formattedKey}`}
          className="w-full py-1.5 px-2 min-h-[44px] bg-secondary text-on-secondary border border-secondary/40 hover:brightness-110 rounded-sm text-[10px] font-bold uppercase transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1 font-mono"
        >
          📋 Open Survey
        </button>
      </InfoTooltip>
    </div>
  );

  // Direct Run / Execute Stage button for automated stages (#19).
  const executeRow = isExecutableStage && (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- propagation guard only; inner button is the keyboard path
    <div
      className="mt-2.5 pt-2.5 border-t border-border-standard/60 flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <InfoTooltip
        title="Run Stage"
        description={runStageDescription}
        behindTheScenes="Streams logs to Live Activity Console in real time via WebSocket"
        position="top"
      >
        <button
          type="button"
          disabled={isCheckpointBusy || isRunning || isBlocked || isEngineBusy}
          onClick={handleExecuteClick}
          aria-label={
            isEngineBusy
              ? `Engine busy — task ${formattedKey} stays queued`
              : `Run stage for task ${formattedKey}`
          }
          title={
            isEngineBusy
              ? 'Engine is already running another task; retry after it finishes'
              : undefined
          }
          className="w-full py-1.5 px-2.5 min-h-[44px] bg-surface-container hover:bg-primary hover:text-on-primary text-primary border border-primary/40 rounded-sm text-[10px] font-bold uppercase transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
        >
          {renderRunStageContent()}
        </button>
      </InfoTooltip>
    </div>
  );

  // Accessible Stage Movement Fallback Controls (#34).
  const stageNavRow = stages.length > 1 && (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- propagation guard only; inner buttons are the keyboard path
    <div
      className="mt-2 pt-2 border-t border-border-standard/40 flex items-center justify-between gap-1 text-[10px] select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <InfoTooltip title="Move Stage Left" shortcut="Alt+Left or [" position="top">
          <button
            type="button"
            disabled={isFirstStage || isMoving}
            onClick={handleMoveLeft}
            aria-label={`Move task ${formattedKey} left`}
            className="p-1 min-w-[44px] min-h-[44px] bg-surface-container hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed border border-border-standard rounded-sm text-text-muted hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center font-mono font-bold"
          >
            ◀
          </button>
        </InfoTooltip>
        <InfoTooltip title="Move Stage Right" shortcut="Alt+Right or ]" position="top">
          <button
            type="button"
            disabled={isLastStage || !nextStage || isMoving}
            onClick={handleMoveRight}
            aria-label={`Move task ${formattedKey} right`}
            className="p-1 min-w-[44px] min-h-[44px] bg-surface-container hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed border border-border-standard rounded-sm text-text-muted hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center font-mono font-bold"
          >
            ▶
          </button>
        </InfoTooltip>
      </div>

      <SelectDropdown
        ariaLabel={`Move task ${formattedKey} to stage`}
        value={task.currentStageId || ''}
        onChange={handleMoveToStage}
        size="sm"
        className="max-w-[130px]"
        options={[...stages.map((s, idx) => ({ value: s.id, label: `${idx + 1}. ${s.name}` }))]}
      />
    </div>
  );

  // Card root: Enter/Space opens, Alt+arrows/[ ] move (see handleCardKeyDown).
  // It stays a labelled generic container (not role=button) because it owns
  // nested action buttons; keyboard parity is via the key handler (WCAG 2.1.1).
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard parity via handleCardKeyDown (Enter/Space/arrows); role=button invalid with nested action buttons
    <div
      draggable
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable labelled card container with full keyboard handling
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      aria-label={`Task ${formattedKey} in ${stageName}`}
      className={`w-full text-left ${isCompact ? 'p-2' : 'p-3'} rounded bg-surface-subtle border-l-4 transition-all duration-200 cursor-grab active:cursor-grabbing group select-none animate-stage-transition focus-visible:ring-2 focus-visible:ring-primary focus:outline-none ${
        typeConfig.borderAccentClass
      } ${isDragging ? 'opacity-40 scale-[0.98]' : 'opacity-100'} ${stateClass}`}
    >
      {headerRow}

      {titleRow}

      {metaRow}

      {checkpointActions}

      {surveyRow}

      {prReviewRow}

      {!isCompact && executeRow}

      {!isCompact && stageNavRow}
    </div>
  );
}
