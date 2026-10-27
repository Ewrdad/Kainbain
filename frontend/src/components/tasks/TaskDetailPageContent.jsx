import { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router';

import { useKainBain } from '../../context/KainBainContext';
import {
  buildDisplayTimeline,
  formatBlockerKeys,
  formatTaskKey,
  formatTaskTitleFirstLine,
  getBlockedState,
} from './taskFormatters';
import { approvalCopy, isTerminalHumanApproval, normalizeStageType } from '../stageTypes';
import { resolveCheckpointState } from './checkpointState';
import { SelectDropdown } from '../common/SelectDropdown';
import { usePendingAction } from '../../hooks/usePendingAction';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useTaskGoalDraft } from '../../hooks/useTaskGoalDraft';
import { InfoTooltip } from '../common/InfoTooltip';
import { isTaskRunning } from './runningTask';
import { useFullTask } from './useFullTask';
import { ReportViewer } from '../reports/ReportViewer';
import { copyToClipboard } from '../../services/clipboard';
import { getTaskBranchName, buildCheckoutCommand } from './taskBranch';
import { TaskGoalSection } from './TaskGoalSection';
import { CopyableTaskKey } from './CopyableTaskKey';
import { DiffStatBadge } from './DiffStatBadge';
import { RunAttributionBadge } from './RunAttributionBadge';
import { HistoryFailureReason } from './HistoryFailureReason';
import { FailureMessage } from './FailureMessage';
import { isRejectedTask } from './failureReason';
import { BlockedByEditor } from './BlockedByEditor';
import { LogsPanel, useTaskLogs } from './LogsPanel';
import { TaskDetailHistoryPane } from './TaskDetailHistoryPane';
import { TaskDetailReportsPane } from './TaskDetailReportsPane';
import { TaskDetailLogsPane } from './TaskDetailLogsPane';
import { SurveyBanner } from './SurveyBanner';
import { RunnerBanner } from './RunnerBanner';
import { stageHasQuestionMe as stageHasQuestionMeSkill } from '../../../../shared/survey.js';

/***
 * MARK: TaskDetailPage
 * @description Dedicated full-page view for focused task elaboration, stage execution,
 * report reading via ReportViewer, live terminal streaming, and audit history.
 * Accessible at `#/tasks/<id>` and free from Kanban board distractions.
 *
 * @param {Object} [props]
 * @param {Object} [props.task] - Optional task object override.
 * @param {Function} [props.onBack] - Optional callback when navigating back to board.
 * @example <TaskDetailPage />
 ***/
export function TaskDetailPage({ task: propTask, onBack }) {
  const {
    tasks = [],
    selectedTask: ctxSelectedTask,
    setSelectedTask,
    setView,
    activeProjectId,
    updateTask,
    deleteTask,
    getTask,
    getTaskReports,
    jumpTask,
    moveTask,
    completeTask,
    advanceTask,
    executeTaskStage,
    openFeedbackDialog,
    currentStageId,
    stages = [],
    projects = [],
    processLogs: wsProcessLogs = [],
    engineState,
    isAgentRunning,
    followUpTask,
    steerTask,
    pauseTask,
    resumeTask,
    retryTask,
    abortTask,
    setPendingTaskSaveFlush,
  } = useKainBain();

  // Resolve task: propTask -> ctxSelectedTask -> route param lookup.
  // The pathname fallback keeps isolated unit tests (bare MemoryRouter,
  // no `<Routes>`) on the same resolution as the routed app.
  const { id: paramTaskId } = useParams();
  const routeLocation = useLocation();
  const pathTaskId = routeLocation.pathname.match(/^\/(?:tasks|task)\/([^/]+)/)?.[1] ?? null;
  let decodedPathId = pathTaskId;
  if (decodedPathId) {
    try {
      decodedPathId = decodeURIComponent(decodedPathId);
    } catch {
      // Keep the raw segment when it is not valid percent-encoding.
    }
  }
  const routeTaskId = paramTaskId ?? decodedPathId;
  const resolvedTask = useMemo(() => {
    if (propTask) return propTask;
    if (ctxSelectedTask) return ctxSelectedTask;
    if (routeTaskId) {
      const found = tasks.find((t) => String(t.id) === String(routeTaskId));
      if (found) return found;
    }
    return tasks[0] || null;
  }, [propTask, ctxSelectedTask, routeTaskId, tasks]);

  const task = resolvedTask;

  // Single-active invariant: executing means owning the running engine,
  // never merely carrying a running_* label (a stale label on a non-owner
  // shows run/retry controls instead of pause/abort for a dead run).
  const isTaskExecuting = isTaskRunning(task, engineState, isAgentRunning);

  const [activeTab, setActiveTab] = usePersistentState(
    'kainbain:taskDetail:activeTab',
    'details', // 'details' | 'reports' | 'logs' | 'history'
    { validate: (v) => ['details', 'reports', 'logs', 'history'].includes(v) },
  );
  const [reportsData, setReportsData] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCheckout, setCopiedCheckout] = useState(false);

  // Single-flight guard for every button-triggered mutation on the task page
  // (approve, reject, run/retry stage, pause, resume, abort, delete, complete,
  // prioritise, manual save, follow-up, steering). While one action is awaiting
  // the backend, the other mutation buttons are disabled so a slow connection
  // can never repeat an action or fire a second one on stale data.
  const { pendingKey: pendingAction, run: runTaskAction } = usePendingAction();
  const isAdvancing = pendingAction === 'advance';
  const isExecutingStage = pendingAction === 'execute';
  const isRetryingStage = pendingAction === 'retry';
  const isIntervening = pendingAction === 'follow-up' || pendingAction === 'steer';
  const isDeleting = pendingAction === 'delete';
  const isMutating = pendingAction !== null;

  // Goal/title draft lifecycle (keystroke cache, confirm-to-clear, reopen
  // retry, checkpoint flush, manual save): shared with the slide-over
  // inspector so the two editors can never drift apart.
  const {
    title,
    handleTitleChange,
    goalIsSaving,
    goalLastSaved,
    goalError,
    goalIsDirty,
    goalHandleBlur,
    hasUnsyncedGoalChanges,
    hasPendingEdits,
    flushPendingTaskSaves,
    saveChanges,
    saved,
  } = useTaskGoalDraft({
    task,
    activeProjectId,
    updateTask,
    setPendingTaskSaveFlush,
    runTaskAction,
  });

  // Fetch reports when task changes or reports tab is active
  useEffect(() => {
    if (!task?.id || !activeProjectId) return;
    let isMounted = true;
    const loadReports = async () => {
      setLoadingReports(true);
      try {
        const data = await getTaskReports?.(activeProjectId, task.id);
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data?.reports || [];
        setReportsData(list);
      } catch {
        if (isMounted) setReportsData([]);
      } finally {
        if (isMounted) setLoadingReports(false);
      }
    };
    loadReports();
    return () => {
      isMounted = false;
    };
  }, [task?.id, activeProjectId, getTaskReports]);

  // Deduplicate reports list by filename or relative path
  const uniqueReports = useMemo(() => {
    const list = Array.isArray(reportsData) ? reportsData : reportsData?.reports || [];
    const seen = new Set();
    const result = [];
    for (const r of list) {
      const key = r.filename || r.name || r.path;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
    return result;
  }, [reportsData]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId],
  );
  const taskCurrentStageId = task?.currentStageId;
  const taskStage = useMemo(
    () => stages.find((s) => s.id === taskCurrentStageId),
    [stages, taskCurrentStageId],
  );

  // Orchestration history timeline deduplication
  const timelineData = useMemo(
    () =>
      buildDisplayTimeline({
        storedTimeline: task?.timeline,
        stages,
        currentStageName: taskStage?.name,
        includeLiveRow: false,
      }),
    [task, stages, taskStage],
  );

  // History audit log events deduplication
  const auditEvents = useMemo(() => {
    const raw =
      task?.history && task.history.length > 0
        ? task.history
        : [{ timestamp: new Date().toLocaleTimeString(), action: 'Task created' }];
    const seen = new Set();
    return raw.filter((event) => {
      const key = `${event.timestamp || ''}::${event.action || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [task]);

  // Same source of truth as the board card (task 8a056fc4): the resolved
  // stage record decides, never a stale `waiting_human` payload alone.
  const isWaitingHuman = resolveCheckpointState(task, taskStage).showCheckpoint;
  // The survey banner keys off the parked state, not only the stage record:
  // stages that attach the `question-me` skill (or a persisted surveyPending
  // flag) always show it, and any other parked non-checkpoint task does too —
  // human approval owns `waiting_human` on checkpoint stages, so the remainder
  // must be survey handoffs whose metadata may be unavailable (restart,
  // pipeline edit). Fail-visible: a spurious banner is harmless, a missing
  // one strands the task with no way forward.
  const stageHasQuestionMe =
    stageHasQuestionMeSkill(taskStage) ||
    task?.surveyPending === true ||
    (task?.status === 'waiting_human' && !isWaitingHuman);
  // Approval wording: a last-stage checkpoint completes the task, so the
  // banner promises completion instead of a next stage that does not exist.
  const bannerCopy = approvalCopy(isTerminalHumanApproval(stages, task));
  // D7: the PR review view is available when the project opted into per-task
  // branches. When off, the button renders disabled with a tooltip; the review
  // page itself still opens for human stages with an empty-state payload.
  const branchReviewAvailable = Boolean(activeProject?.useBranches);

  /***
   * MARK: handleOpenPrReview
   * @description Opens the MR-style review page (`/tasks/<id>/review`) for the
   *   current task. The facade navigates; the bridge resolves the snapshot.
   ***/
  const handleOpenPrReview = () => {
    if (!task?.id) return;
    setView('task-review', { taskId: task.id });
  };

  /***
   * MARK: handleCopyCheckout
   * @description Copies a ready-to-paste `git fetch origin && git checkout
   *   <branch>` command for this task's branch so the reviewer can open the
   *   branch in another tool or terminal. Shows `Copied ✓` for 2s on success.
   ***/
  const handleCopyCheckout = async () => {
    const command = buildCheckoutCommand(getTaskBranchName(task));
    if (!command) return;
    const ok = await copyToClipboard(command);
    if (ok) {
      setCopiedCheckout(true);
      setTimeout(() => setCopiedCheckout(false), 2000);
    }
  };
  const isInterrupted = task?.wasInterrupted === true || task?.status === 'interrupted';
  const isPaused = task?.status === 'paused';
  const isRetrying = task?.autoRetrying === true;
  // A deliberate rejection keeps its reason banner even while an auto-retry
  // is queued: the reason is about to be snapshotted into the next
  // attempt's prompt, so hiding it would hide the pending context.
  const isRejectedFailure = isRejectedTask(task);
  const isFailed =
    task?.status === 'failed' ||
    (Boolean(task?.failureReason) && (!isRetrying || isRejectedFailure));
  const isRejected = isFailed && isRejectedFailure;
  const failureMessage =
    task?.failureReason || task?.lastError?.message || 'Stage execution failed.';
  const formattedKey = task?.id ? formatTaskKey(task.id) : '';
  // A terminal-failed task has no stage to advance from (approving is a
  // backend 409): the checkpoint banner hides and the failure banner above
  // — with its prominent Retry Stage — owns recovery.
  const isTerminallyFailed = task?.status === 'failed';

  // Blocked state prefers the scheduler's verdict when present so the page
  // agrees with the board; otherwise it derives from live statuses.
  const { isBlocked: isBlockedByDependencies, blockerIds: pageBlockerIds } = getBlockedState(
    task,
    tasks,
  );
  const pageBlockerKeys = formatBlockerKeys(pageBlockerIds);
  const pageBlockedLabel = pageBlockerKeys
    ? `Blocked by ${pageBlockerKeys}`
    : 'Blocked by dependencies';

  // Header status badge (completed / failed / rejected / retrying / blocked / in-progress).
  const statusLabel = (() => {
    if (task?.status === 'completed') return 'COMPLETED';
    if (isRetrying) return 'RETRYING';
    if (isRejected) return 'REJECTED';
    if (isFailed) return 'FAILED';
    if (isBlockedByDependencies) return 'BLOCKED';
    return 'IN PROGRESS';
  })();
  const statusBadgeClass = (() => {
    if (task?.status === 'completed') return 'bg-primary/20 text-primary border-primary/40';
    if (isRetrying)
      return 'bg-warning/20 text-warning border-warning/40 shadow-[0_0_8px_rgba(234,179,8,0.4)]';
    if (isFailed)
      return 'bg-error/20 text-error border-error/40 shadow-[0_0_8px_rgba(248,81,73,0.4)]';
    if (isBlockedByDependencies) return 'bg-[#ffb4ab]/20 text-[#ffb4ab] border-[#ffb4ab]/40';
    return 'bg-secondary/20 text-secondary-fixed border-secondary/40';
  })();

  // Real-time steering is only meaningful while an agent is executing, so hide
  // the intervention section when the current stage is a human or CI checkpoint.
  const isNonAgentStage =
    !!taskStage && ['human', 'ci'].includes(normalizeStageType(taskStage.type));

  const [interventionText, setInterventionText] = useState('');
  const [approvalGuidance, setApprovalGuidance] = useState('');
  const [showApprovalGuidance, setShowApprovalGuidance] = useState(false);

  // Label for the goal section's Manual Save button, mirroring the
  // single-flight save action state (in-flight confirmation saved).
  const goalManualSaveLabel = (() => {
    if (pendingAction === 'save') return 'Saving...';
    if (saved) return 'Saved ✓';
    return 'Manual Save';
  })();

  const handleBackToBoard = () => {
    if (onBack) {
      onBack();
      return;
    }
    setSelectedTask?.(null);
    // Leaving IS a navigation: the facade routes to `/`, clearing the task
    // location so refresh/back can never resurrect this detail page.
    setView?.('orchestrator');
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && task?.id) {
      const shareUrl = `${window.location.origin}${window.location.pathname}#/tasks/${task.id}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  };

  const handleSendFollowUp = () => {
    if (!interventionText.trim() || isIntervening) return;
    runTaskAction('follow-up', async () => {
      await followUpTask?.(activeProjectId, task.id, interventionText);
      setInterventionText('');
    }).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleSendSteering = () => {
    if (!interventionText.trim() || isIntervening) return;
    runTaskAction('steer', async () => {
      await steerTask?.(activeProjectId, task.id, interventionText);
      setInterventionText('');
    }).catch(() => {
      // Handled by feedback layer
    });
  };

  const handlePauseTask = () => {
    runTaskAction('pause', () => pauseTask?.(activeProjectId, task.id)).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleResumeTask = () => {
    runTaskAction('resume', () => resumeTask?.(activeProjectId, task.id)).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleRetryStage = () => {
    runTaskAction('retry', () => retryTask?.(activeProjectId, task.id)).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleAbortTask = () => {
    // Guard before prompting so a fast double-click never re-opens the dialog.
    if (isMutating) return;
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Are you sure you want to abort execution of ${formattedKey}?`)
        : true;
    if (!confirmed) return;
    runTaskAction('abort', () => abortTask?.(activeProjectId, task.id)).catch(() => {
      // Handled by feedback layer
    });
  };

  // Pause/Abort while running, Resume while paused, else nothing.
  // (isTaskExecuting alone: a stale running_agent label is not pausable.)
  const renderExecutionControls = () => {
    if (isTaskExecuting) {
      return (
        <>
          <button
            type="button"
            onClick={handlePauseTask}
            disabled={isMutating}
            aria-busy={pendingAction === 'pause'}
            className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded text-[11px] font-mono text-warning cursor-pointer disabled:opacity-40"
          >
            {pendingAction === 'pause' ? '⏳ Pausing...' : '⏸ Pause'}
          </button>
          <button
            type="button"
            onClick={handleAbortTask}
            disabled={isMutating}
            aria-busy={pendingAction === 'abort'}
            className="px-2.5 py-1 bg-error/20 hover:bg-error/30 border border-error/40 rounded text-[11px] font-mono text-error cursor-pointer disabled:opacity-40"
          >
            {pendingAction === 'abort' ? '⏹ Aborting...' : '⏹ Abort'}
          </button>
        </>
      );
    }
    if (isPaused) {
      return (
        <button
          type="button"
          onClick={handleResumeTask}
          disabled={isMutating}
          aria-busy={pendingAction === 'resume'}
          className="px-2.5 py-1 bg-primary text-on-primary rounded text-[11px] font-mono font-bold cursor-pointer disabled:opacity-40"
        >
          {pendingAction === 'resume' ? '▶ Resuming...' : '▶ Resume'}
        </button>
      );
    }
    return null;
  };

  const handleApprove = () => {
    if (isMutating) return;
    runTaskAction('advance', async () => {
      // Approve only on persisted state: flush this editor's pending
      // goal edits first; a failed save aborts the approval and the
      // error is surfaced by the updateTask notification layer.
      if (hasPendingEdits) await flushPendingTaskSaves();
      const guidance =
        showApprovalGuidance && approvalGuidance.trim() ? approvalGuidance.trim() : undefined;
      if (guidance) {
        await advanceTask?.(activeProjectId, task.id, { guidance });
      } else {
        await advanceTask?.(activeProjectId, task.id);
      }
      setApprovalGuidance('');
      setShowApprovalGuidance(false);
    }).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleExecuteStage = () => {
    if (isMutating) return;
    runTaskAction('execute', () => executeTaskStage?.(activeProjectId, task.id)).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleReject = () => {
    if (isMutating) return;
    runTaskAction('reject', async () => {
      // Reject only on persisted state: flush pending edits before opening the
      // feedback dialog so the rejection is recorded against the saved task.
      if (hasPendingEdits) await flushPendingTaskSaves();
      openFeedbackDialog?.(task);
    }).catch(() => {
      // Handled by feedback layer
    });
  };

  const handleDelete = () => {
    // Guard before prompting so a fast double-click never re-opens the dialog.
    if (isMutating) return;
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Are you sure you want to delete task ${formattedKey}?`)
        : true;
    if (!confirmed) return;
    runTaskAction('delete', async () => {
      await deleteTask(activeProjectId, task.id);
      handleBackToBoard();
    }).catch(() => {
      // deleteTask surfaces failures via its notification layer.
    });
  };

  // Keyword tokens
  const keywordTokens = useMemo(() => {
    const taskId = task?.id || 'task';
    const projectRoot = activeProject?.cwd || './';
    const taskDocs = `${projectRoot.replace(/\/+$/, '')}/docs/tasks/${taskId}/`;
    const priorPaths = Array.isArray(task?.reports)
      ? task.reports
          .map((r) => {
            if (typeof r === 'string') return r;
            return r.path || r.filename;
          })
          .filter(Boolean)
      : [];
    const latestPath = priorPaths.at(-1) || '';
    const planPath =
      (Array.isArray(task?.reports) ? task.reports : [])
        .filter((r) => {
          if (typeof r === 'string') return false;
          return r.stageSlug === 'plan' || String(r.stageName || '').toLowerCase() === 'plan';
        })
        .map((r) => r.path || r.filename)
        .filter(Boolean)
        .at(-1) || '';
    return [
      {
        token: '{{project}}',
        label: 'Project',
        hint: 'Project name',
        value: activeProject?.name || 'Project',
      },
      {
        token: '{{projectRoot}}',
        label: 'Project Root',
        hint: 'Absolute path to project root',
        value: projectRoot,
      },
      {
        token: '{{taskDocs}}',
        label: 'Task Folder',
        hint: "Path to this task's dedicated docs folder",
        value: taskDocs,
      },
      {
        token: '{{previousReports}}',
        label: 'Previous Reports',
        hint: 'Paths of all prior stage reports',
        value:
          priorPaths.length > 0 ? priorPaths.join('\n') : '(No previous stage reports available)',
      },
      {
        token: '{{latestReportPath}}',
        label: 'Latest Report',
        hint: 'Path of the most recent stage report',
        value: latestPath || '(No report available)',
      },
      {
        token: '{{latestReportPath:plan}}',
        label: 'Plan Report Path',
        hint: 'Path of the most recent plan stage report (replace plan with any stage slug)',
        value: planPath || '(No report available for stage plan)',
      },
      {
        token: '{{taskId}}',
        label: 'Task ID',
        hint: 'Unique task identifier',
        value: task?.id || 'task',
      },
      {
        token: '{{stageName}}',
        label: 'Stage Name',
        hint: 'Current stage name',
        value: taskStage?.name || '',
      },
      {
        token: '{{taskGoal}}',
        label: 'Task Goal',
        hint: 'The task goal / title',
        value: task?.goal || task?.title || '',
      },
      {
        token: '{{projectRepo}}',
        label: 'Repo',
        hint: 'Git repository URL or path',
        value: activeProject?.gitUrl || activeProject?.gitRepo || '',
      },
      {
        token: '{{taskRepo}}',
        label: 'Task Repo',
        hint: 'Task repository URL or path',
        value: task?.taskRepo || task?.gitUrl || task?.gitRepo || '',
      },
    ];
  }, [task, activeProject, taskStage]);

  const [copiedKeyword, setCopiedKeyword] = useState(null);
  const handleCopyKeyword = (kw) => {
    if (navigator.clipboard && kw) {
      navigator.clipboard.writeText(kw.token);
      setCopiedKeyword(kw.token);
      setTimeout(() => setCopiedKeyword(null), 2000);
    }
  };

  const taskStageName = taskStage?.name;
  const activeProjectCwd = activeProject?.cwd;

  // Board summaries strip log entries for list weight: hydrate the full
  // record for the Logs tab only (read-only — edits keep using `task`).
  const logsTask = useFullTask({ task, activeProjectId, getTask });

  const logs = useTaskLogs({
    task: logsTask,
    wsProcessLogs,
    activeProjectId,
    isTaskExecuting,
    taskStageName,
    activeProjectCwd,
  });

  const timelineDotClass = (status) => {
    if (status === 'Success' || status === 'SUCCESS' || status === 'completed') {
      return 'bg-primary shadow-[0_0_8px_rgba(123,219,133,0.4)]';
    }
    if (status === 'Fail' || status === 'FAIL' || status === 'Failed') {
      return 'bg-error';
    }
    return 'bg-secondary animate-pulse';
  };

  const timelineTextClass = (status) => {
    if (status === 'Success' || status === 'SUCCESS' || status === 'completed')
      return 'text-primary';
    if (status === 'Fail' || status === 'FAIL' || status === 'Failed') return 'text-error';
    return 'text-secondary';
  };

  if (!task) {
    return (
      <div
        role="region"
        aria-label="Task Page Not Found"
        className="flex-1 flex flex-col items-center justify-center p-8 bg-surface-deep text-center space-y-4"
      >
        <div className="text-4xl">🔍</div>
        <h2 className="text-lg font-bold text-on-surface font-headline-md">Task Not Found</h2>
        <p className="text-sm text-text-muted max-w-md">
          The requested task could not be loaded. It may have been deleted or moved.
        </p>
        <button
          type="button"
          onClick={handleBackToBoard}
          className="px-4 py-2 bg-primary text-on-primary font-bold rounded text-xs font-mono uppercase cursor-pointer"
        >
          ← Back to Board
        </button>
      </div>
    );
  }

  return (
    <article
      aria-label={`Task Page: ${title || formattedKey}`}
      className="flex-1 flex flex-col h-full overflow-hidden bg-surface-deep"
    >
      {/* Full Page Header */}
      <header className="p-4 border-b border-border-standard bg-surface-container flex flex-col gap-3 shrink-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={handleBackToBoard}
              aria-label="Back to Board"
              className="px-3 py-2 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard rounded text-xs font-mono font-bold uppercase text-on-surface hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>←</span>
              <span>Back to Board</span>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              {/* copyable task key – intentional */}
              <CopyableTaskKey
                taskId={task?.id}
                label={formattedKey}
                className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20 shrink-0"
              />
              <span className="text-[11px] uppercase font-mono text-text-muted bg-surface px-2 py-0.5 rounded border border-border-standard shrink-0">
                {activeProject?.name || 'Project'}
              </span>
            </div>

            <h1
              className="font-headline-md text-base font-bold text-on-surface truncate min-w-0 flex-1"
              title={title}
            >
              {formatTaskTitleFirstLine(title)}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Shareable Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy shareable task URL"
              className="px-3 py-2 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard rounded text-xs font-mono font-semibold uppercase text-text-muted hover:text-on-surface transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>🔗</span>
              <span>{copiedLink ? 'Copied Link ✓' : 'Copy Link'}</span>
            </button>

            {/* Stage Selector */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-text-muted text-[10px] uppercase font-bold">Stage:</span>
              {stages.length > 0 ? (
                <SelectDropdown
                  ariaLabel="Move task to stage"
                  value={task.currentStageId || ''}
                  onChange={(val) => moveTask?.(activeProjectId, task.id, val)}
                  size="sm"
                  options={stages.map((s) => ({ value: s.id, label: s.name }))}
                />
              ) : (
                <span className="text-on-surface font-semibold">{taskStage?.name || '—'}</span>
              )}
            </div>

            {/* Status pill */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-sm border ${statusBadgeClass}`}
              aria-label={isBlockedByDependencies ? pageBlockedLabel : undefined}
              title={isBlockedByDependencies ? pageBlockedLabel : undefined}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Primary Navigation Tabs (div, not nav: a tablist is its own
            landmark-grade widget; nesting it in navigation double-exposes it
            to assistive tech — WCAG 4.1.2). */}
        <div
          className="flex bg-surface-deep rounded p-1 border border-border-standard shrink-0"
          role="tablist"
          aria-label="Task full page sections"
        >
          {[
            {
              id: 'details',
              label: 'Details & Goal',
              icon: '📝',
              desc: 'Markdown goal, context tokens, and real-time steering.',
            },
            {
              id: 'reports',
              label: `Reports (${uniqueReports.length})`,
              icon: '📄',
              desc: 'All generated stage reports with sidebar selector and full reading pane.',
            },
            {
              id: 'logs',
              label: isTaskExecuting ? 'Live Terminal 🔴' : 'Terminal Logs',
              icon: '💻',
              desc: 'Real-time WebSocket streaming logs and subprocess traces.',
            },
            {
              id: 'history',
              label: 'History & Timeline',
              icon: '⏱️',
              desc: 'Stage transitions, elapsed time, and audit events.',
            },
          ].map((tab) => (
            <InfoTooltip
              key={tab.id}
              title={`Section: ${tab.label}`}
              description={tab.desc}
              position="bottom"
              className="flex-1"
            >
              <button
                id={`task-page-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`task-page-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full py-2.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-text-muted hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            </InfoTooltip>
          ))}
        </div>
      </header>

      {/* Main Full Page Body */}
      <div
        id={`task-page-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`task-page-tab-${activeTab}`}
        className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6"
      >
        {activeTab === 'details' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Stage Execution Failure Alert Banner */}
            {isFailed && (
              <div
                role="alert"
                aria-live="polite"
                className="p-4 bg-error/10 border-2 border-error/60 rounded-sm space-y-3 shadow-md animate-in fade-in duration-200"
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
                  className="p-3 bg-surface-container rounded border border-error/30 font-mono text-xs text-error break-words whitespace-pre-wrap leading-relaxed select-text"
                />
                <div className="flex items-center gap-3 pt-1">
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
                    className="px-4 py-2.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono"
                  >
                    <span>📜 View Logs</span>
                  </button>
                </div>
              </div>
            )}

            {/* Interrupted Recovery Banner */}
            {isInterrupted && (
              <div className="p-4 bg-warning/15 border border-warning/60 rounded-sm space-y-3 shadow-sm">
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
                  This task was active when the server stopped or restarted. Its state has been
                  safely preserved on disk.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleResumeTask}
                    className="flex-1 py-2.5 min-h-[44px] bg-warning text-surface-deep rounded-sm text-xs font-bold uppercase hover:brightness-110 cursor-pointer shadow-sm font-mono disabled:opacity-40"
                  >
                    {pendingAction === 'resume' ? 'Resuming...' : '▶ Resume Task'}
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleRetryStage}
                    className="px-4 py-2.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer font-mono"
                  >
                    ↻ Retry Stage
                  </button>
                </div>
              </div>
            )}

            {/* Live runner assignment: a claimed task is executing off-process */}
            <RunnerBanner claim={task?.claim} stageName={taskStage?.name} />

            {/* Question-me survey banner: parked agent stages route humans to /tasks/:id/survey */}
            <SurveyBanner
              taskId={task?.id}
              projectId={activeProjectId}
              enabled={stageHasQuestionMe}
            />

            {/* Human Review Checkpoint Alert Banner */}
            {isWaitingHuman && !isTerminallyFailed && (
              <div className="p-4 bg-human-fill/60 border border-secondary/50 rounded-sm space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary font-mono">
                      Human Review Checkpoint
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-mono text-text-muted bg-surface-deep px-2 py-0.5 rounded border border-border-standard">
                    Stage: {taskStage?.name || 'Review'}
                  </span>
                </div>
                <p className="text-xs text-on-surface leading-relaxed">
                  {bannerCopy.pageExplainer}
                </p>
                {showApprovalGuidance ? (
                  <div className="space-y-1.5 pt-1">
                    <label
                      htmlFor="page-approval-guidance"
                      className="text-[11px] font-mono text-secondary font-semibold"
                    >
                      {bannerCopy.guidanceLabel}
                    </label>
                    <textarea
                      id="page-approval-guidance"
                      value={approvalGuidance}
                      onChange={(e) => setApprovalGuidance(e.target.value)}
                      placeholder="e.g. Please ensure edge case unit tests are added..."
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
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleApprove}
                    aria-label={`Approve task ${formattedKey}${bannerCopy.bannerAriaSuffix}`}
                    className="flex-1 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
                  >
                    {isAdvancing ? bannerCopy.bannerBusy : bannerCopy.bannerButton}
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleReject}
                    aria-label={`Reject task ${formattedKey}`}
                    className="flex-1 py-2.5 min-h-[44px] bg-error-container text-on-error-container rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 font-mono"
                  >
                    ✕ Reject (Add Feedback...)
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenPrReview}
                    disabled={!branchReviewAvailable}
                    aria-label={`Open PR review for task ${formattedKey}`}
                    title={
                      branchReviewAvailable
                        ? 'Review the code changes on this task branch line by line'
                        : 'Enable branch support in project settings to review changes'
                    }
                    className="flex-1 py-2.5 min-h-[44px] bg-surface-deep hover:bg-surface-container border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    🔍 Open PR Review
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCheckout}
                    disabled={!branchReviewAvailable}
                    aria-label={`Copy checkout command for task ${formattedKey}`}
                    title={
                      branchReviewAvailable
                        ? 'Copy a git fetch + checkout command for this task branch'
                        : 'Enable branch support in project settings to copy the checkout command'
                    }
                    className="flex-1 py-2.5 min-h-[44px] bg-surface-deep hover:bg-surface-container border border-border-standard rounded-sm text-xs font-bold uppercase text-on-surface hover:text-primary transition-all cursor-pointer font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {copiedCheckout ? 'Copied ✓' : '⧉ Copy Checkout'}
                  </button>
                </div>
              </div>
            )}

            {/* Task Goal & Markdown Description (preview-by-default, except just-created tasks) */}
            <TaskGoalSection
              taskId={task?.id}
              createdAt={task?.createdAt}
              title={title}
              onTitleChange={handleTitleChange}
              onBlurSave={goalHandleBlur}
              isSaving={goalIsSaving}
              lastSaved={goalLastSaved}
              error={goalError}
              isExecuting={isTaskExecuting}
              isDirty={goalIsDirty}
              hasUnsyncedChanges={hasUnsyncedGoalChanges}
              onManualSave={saveChanges}
              manualSaveDisabled={isMutating}
              manualSaveLabel={goalManualSaveLabel}
              idPrefix="page-task-goal"
              variant="page"
              projectId={activeProjectId}
            >
              {/* Dynamic Context Tokens */}
              <div className="pt-3 border-t border-border-standard/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted font-mono">
                    Dynamic Context Tokens (Click to Copy)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
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
                        aria-label={`Copy keyword ${kw.token}`}
                        className="px-2.5 py-1 rounded bg-surface border border-border-standard hover:border-primary hover:bg-surface-container text-[11px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="text-primary">{kw.token}</span>
                        <span className="text-text-muted text-[10px]">{kw.label}</span>
                        {copiedKeyword === kw.token && (
                          <span className="text-primary font-bold text-xs">✓</span>
                        )}
                      </button>
                    </InfoTooltip>
                  ))}
                </div>
              </div>
            </TaskGoalSection>

            {/* Task dependencies: prerequisite tasks this task waits on before it may execute */}
            <BlockedByEditor task={task} disabled={isMutating} />

            {/* Manual Intervention & Steering */}
            {!isNonAgentStage && (
              <section className="p-4 bg-surface-container/60 border border-primary/40 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🕹️</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono">
                      Manual Intervention & Real-Time Steering
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">{renderExecutionControls()}</div>
                </div>

                <p className="text-xs text-text-muted leading-relaxed font-mono">
                  Send instructions directly into the active agent loop without restarting the
                  stage.
                </p>

                <div className="space-y-2">
                  <textarea
                    value={interventionText}
                    onChange={(e) => setInterventionText(e.target.value)}
                    placeholder="Type follow-up prompt or steering instruction..."
                    rows={3}
                    className="w-full bg-surface-deep border border-border-standard rounded p-2.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary resize-y min-h-[64px]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={!interventionText.trim() || isIntervening}
                      onClick={handleSendSteering}
                      className="px-3.5 py-2 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-on-surface rounded text-xs font-mono font-semibold uppercase disabled:opacity-40 cursor-pointer"
                    >
                      🧭 Steer Agent
                    </button>
                    <button
                      type="button"
                      disabled={!interventionText.trim() || isIntervening}
                      onClick={handleSendFollowUp}
                      className="px-4 py-2 bg-primary text-on-primary rounded text-xs font-mono font-bold uppercase hover:brightness-110 disabled:opacity-40 cursor-pointer"
                    >
                      {isIntervening ? 'Sending...' : '💬 Send Follow-Up'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border-standard gap-3 flex-wrap">
              <button
                type="button"
                disabled={isMutating}
                aria-busy={isDeleting}
                onClick={handleDelete}
                className="text-xs font-bold uppercase tracking-wider text-error hover:bg-error/10 px-4 py-2.5 min-h-[44px] rounded transition-colors cursor-pointer disabled:opacity-40 font-mono flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>✕ Delete Task</span>
                )}
              </button>

              <div className="flex items-center gap-2">
                {!isWaitingHuman && task.status !== 'completed' && taskStage?.type !== 'human' && (
                  <button
                    type="button"
                    disabled={isMutating}
                    aria-busy={isExecutingStage}
                    onClick={handleExecuteStage}
                    className="px-4 py-2.5 min-h-[44px] bg-surface-container border border-primary text-primary hover:bg-primary hover:text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 font-mono flex items-center gap-1.5"
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

                {task.status !== 'completed' && (
                  <button
                    type="button"
                    disabled={isMutating}
                    aria-busy={pendingAction === 'complete'}
                    onClick={() => {
                      runTaskAction('complete', () =>
                        completeTask?.(activeProjectId, task.id),
                      ).catch(() => {
                        // completeTask surfaces failures via its notification layer.
                      });
                    }}
                    className="px-4 py-2.5 min-h-[44px] border border-primary/40 text-primary hover:bg-primary hover:text-on-primary rounded-sm text-xs font-bold uppercase transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
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
                  className="px-4 py-2.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-xs font-bold uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center"
                >
                  Prioritise
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <TaskDetailReportsPane
            reports={uniqueReports}
            loading={loadingReports}
            activeProject={activeProject}
            taskId={task.id}
          />
        )}

        {/* Live Terminal / Logs Tab */}
        {activeTab === 'logs' && (
          <TaskDetailLogsPane
            logs={logs}
            taskStage={taskStage}
            task={task}
            isTaskExecuting={isTaskExecuting}
            isActive={activeTab === 'logs'}
          />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <TaskDetailHistoryPane
            timelineData={timelineData}
            auditEvents={auditEvents}
            timelineDotClass={timelineDotClass}
            timelineTextClass={timelineTextClass}
          />
        )}
      </div>
    </article>
  );
}

export default TaskDetailPage;
