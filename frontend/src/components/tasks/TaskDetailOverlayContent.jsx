import { useState, useEffect, useMemo, useRef } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import {
  buildDisplayTimeline,
  formatBlockerKeys,
  formatTaskKey,
  formatTaskTitleFirstLine,
  getBlockedState,
  isTaskCompleted as isCompletedStatus,
  selectStagePresentation,
} from './taskFormatters';
import { isTerminalHumanApproval, normalizeStageType } from '../stageTypes';
import { resolveCheckpointState } from './checkpointState';
import { SelectDropdown } from '../common/SelectDropdown';
import { useNow } from '../../hooks/useNow';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useFullTask } from './useFullTask';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useTaskGoalDraft } from '../../hooks/useTaskGoalDraft';
import { formatStageAge } from './stagePace';
// Shared board seam: the inspector reuses the board's own averaging and
// workflow-scope helpers so its per-stage averages always match the column
// headers — never a second averaging path.
import { computeStageAnalytics } from '../workflow/stageAnalytics';
import { filterActiveWorkflowTasks } from '../workflow/nodeModel';
import { InfoTooltip } from '../common/InfoTooltip';
import { isTaskRunning } from './runningTask';
import { CopyableTaskKey } from './CopyableTaskKey';
import { TaskReportsTab } from './TaskReportsTab';
import { TaskHistoryTab } from './TaskHistoryTab';
import { TaskDetailsTab } from './TaskDetailsTab';
import { isRejectedTask } from './failureReason';
import { isRetryingTask, retryProgressLabel, retryWaitLabel } from './taskRetryState';
import { LogsPanel, useTaskLogs } from './LogsPanel';

/***
 * MARK: TaskDetailOverlay
 * @description An integrated slide-over inspector for task details, rich markdown goal editing,
 * notes-viewer links, deduplicated report inspection,
 * and orchestration history. Anchored as a right-hand side panel without a full-screen blocking backdrop.
 *
 * @param {Object} props
 * @param {Object} props.task - The task object to inspect.
 * @param {Function} props.onClose - Callback when closing the inspector.
 * @param {boolean} [props.footerReserved=true] - Whether the fixed Now Playing
 *   footer (72px) is rendered on the orchestrator view. When true the panel
 *   ends above the footer on mobile AND desktop, mirroring the Configure
 *   drawer, so the footer never covers the panel and the panel never covers
 *   the footer (#footer-overlap consistency contract).
 * @example <TaskDetailOverlay task={task} onClose={() => setSelectedTask(null)} />
 ***/
export function TaskDetailOverlay({ task, onClose, footerReserved = true }) {
  const {
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
    setView,
    setPendingTaskSaveFlush,
    tasks: siblingTasks = [],
    projectWorkflows = [],
    activeWorkflowId,
  } = useKainBain();

  // Single-active invariant: executing means owning the running engine,
  // never merely carrying a running_* label (a stale label on a non-owner
  // shows run/retry controls instead of pause/abort for a dead run).
  const isTaskExecuting = isTaskRunning(task, engineState, isAgentRunning);

  const [activeTab, setActiveTab] = usePersistentState(
    'kainbain:taskOverlay:activeTab',
    'details', // 'details' | 'logs' | 'reports' | 'history'
    { validate: (v) => ['details', 'logs', 'reports', 'history'].includes(v) },
  );
  const [reportsData, setReportsData] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Single-flight guard for every button-triggered mutation in the inspector
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

  const overlayRef = useRef(null);
  // Capture task presence at mount so the focus-trap effect can guard on it
  // without depending on the live task object (whose auto-save updates would
  // otherwise re-trigger focus management and steal focus).
  const hasTaskRef = useRef(Boolean(task?.id));

  // Keep the latest onClose in a ref so the focus-trap effect below can be
  // mounted once (deps []) without re-running — and without stealing focus —
  // every time the parent re-renders. The parent passes an inline arrow
  // (() => setSelectedTask(null)), so its identity changes on every parent
  // render. Auto-save updates the task in context, which re-renders the parent
  // and would otherwise re-run the effect; its cleanup calls
  // previouslyFocused.focus(), yanking focus back to the task card and closing
  // the mobile keyboard mid-typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus management & Escape-to-close for the slide-over panel.
  // On small screens the inspector is a full-screen overlay, so it behaves
  // as a dialog: move focus in on open, trap it while open, and restore it
  // to the previously-focused trigger on close (WCAG 2.1.1 / 2.1.2 / 3.2.5).
  // Mounted once (deps []) so focus is only restored on actual unmount, never
  // on re-renders triggered by auto-save / context updates.
  useEffect(() => {
    if (!hasTaskRef.current) return undefined;
    const previouslyFocused = document.activeElement;
    const node = overlayRef.current;
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from((node || document).querySelectorAll(FOCUSABLE)).filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true' &&
          el.offsetParent !== null,
      );

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  // Goal/title draft lifecycle (keystroke cache, confirm-to-clear, reopen
  // retry, checkpoint flush, manual save): shared with the full task page so
  // the two editors can never drift apart.
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
    isFlushingSave,
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

  // Deduplicate reports list by filename or relative path (#43)
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

  // Reports to show in the reports tab: unique reports, else the single output report.
  const reportsForViewer = (() => {
    if (uniqueReports.length > 0) return uniqueReports;
    if (task?.outputReport) {
      return [
        {
          path: task.outputReport,
          content: task.outputReport,
          name: 'Output Report',
          filename: 'output.md',
          stageName: 'Output Report',
        },
      ];
    }
    return [];
  })();

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId],
  );
  const taskCurrentStageId = task?.currentStageId;
  const taskStage = useMemo(
    () => stages.find((s) => s.id === taskCurrentStageId),
    [stages, taskCurrentStageId],
  );

  // Live elapsed source for the current-stage history row (one tick while
  // the inspector is open; the board owns its own shared tick).
  const nowMs = useNow();

  // Per-stage averages for the history hints, computed with the board's own
  // analytics over the same active-workflow scope so the numbers match the
  // column headers exactly.
  const avgSecondsByStage = useMemo(() => {
    const activeWfId = activeWorkflowId || projectWorkflows[0]?.id || 'wf-default';
    const activeWorkflow = projectWorkflows.find((w) => w.id === activeWfId) || projectWorkflows[0];
    const scoped = filterActiveWorkflowTasks(siblingTasks, activeWfId, activeWorkflow);
    const analytics = computeStageAnalytics(stages, scoped);
    const byName = {};
    for (const stat of Object.values(analytics.byStage || {})) {
      if (stat.avgDurationSeconds > 0)
        byName[String(stat.stageName).toLowerCase()] = stat.avgDurationSeconds;
    }
    return byName;
  }, [activeWorkflowId, projectWorkflows, siblingTasks, stages]);

  // Orchestration history timeline deduplication (#18)
  const isTaskCompleted = isCompletedStatus(task);
  // Settled-but-open tasks (failed/interrupted/blocked) render a static
  // PARKED row — never a live ACTIVE row with a growing timer.
  const stagePresentation = selectStagePresentation(task);
  const timelineData = useMemo(
    () =>
      buildDisplayTimeline({
        storedTimeline: task?.timeline,
        stages,
        currentStageName: taskStage?.name,
        liveDurationLabel: `${formatStageAge(task, nowMs)} in stage`,
        includeLiveRow: !isTaskCompleted && Boolean(taskStage),
        presentation: stagePresentation,
      }),
    [task, stages, taskStage, isTaskCompleted, stagePresentation, nowMs],
  );

  // History audit log events deduplication (#18)
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

  // Blocked state prefers the scheduler's verdict when present so the
  // inspector agrees with the queue; otherwise it derives from live statuses.
  const { isBlocked: isBlockedByDependencies, blockerIds: overlayBlockerIds } = getBlockedState(
    task,
    siblingTasks,
  );
  const overlayBlockerKeys = formatBlockerKeys(overlayBlockerIds);
  const overlayBlockedLabel = overlayBlockerKeys
    ? `Blocked by ${overlayBlockerKeys}`
    : 'Blocked by dependencies';

  // Same source of truth as the board card (task 8a056fc4): the resolved
  // stage record decides, never a stale `waiting_human` payload alone.
  const isWaitingHuman = resolveCheckpointState(task, taskStage).showCheckpoint;
  const isInterrupted = task?.wasInterrupted === true || task?.status === 'interrupted';
  const isPaused = task?.status === 'paused';
  const isRetrying = isRetryingTask(task);
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

  // Header status badge (completed / failed / rejected / retrying / blocked / in-progress).
  // A scheduled retry names itself ("RETRYING (scheduled) 2/5 · in 12s").
  const statusLabel = (() => {
    if (task?.status === 'completed') return 'COMPLETED';
    if (isRetrying) {
      const base = retryProgressLabel(task) || 'RETRYING';
      const wait = retryWaitLabel(task, nowMs);
      return wait ? `${base} · ${wait}` : base;
    }
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
          <InfoTooltip
            title="Pause Execution"
            description="Temporarily pauses active agent compute"
            position="top"
          >
            <button
              type="button"
              onClick={handlePauseTask}
              disabled={isMutating}
              aria-busy={pendingAction === 'pause'}
              className="px-2 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded text-[10px] font-mono text-warning cursor-pointer disabled:opacity-40"
            >
              {pendingAction === 'pause' ? '⏳ Pausing...' : '⏸ Pause'}
            </button>
          </InfoTooltip>
          <InfoTooltip
            title="Abort Execution"
            description="Immediately terminates running agent process safely"
            position="top"
          >
            <button
              type="button"
              onClick={handleAbortTask}
              disabled={isMutating}
              aria-busy={pendingAction === 'abort'}
              className="px-2 py-1 bg-error/20 hover:bg-error/30 border border-error/40 rounded text-[10px] font-mono text-error cursor-pointer disabled:opacity-40"
            >
              {pendingAction === 'abort' ? '⏹ Aborting...' : '⏹ Abort'}
            </button>
          </InfoTooltip>
        </>
      );
    }
    if (isPaused) {
      return (
        <InfoTooltip
          title="Resume Execution"
          description="Continues agent compute from paused state"
          position="top"
        >
          <button
            type="button"
            onClick={handleResumeTask}
            disabled={isMutating}
            aria-busy={pendingAction === 'resume'}
            className="px-2 py-1 bg-primary text-on-primary rounded text-[10px] font-mono font-bold cursor-pointer disabled:opacity-40"
          >
            {pendingAction === 'resume' ? '▶ Resuming...' : '▶ Resume'}
          </button>
        </InfoTooltip>
      );
    }
    return null;
  };

  const handleApprove = async () => {
    if (isMutating) return;
    runTaskAction('advance', async () => {
      // Approve only on persisted state: flush this inspector's pending
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

  const handleReject = async () => {
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
      onClose();
    }).catch(() => {
      // deleteTask surfaces failures via its notification layer.
    });
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

  // Keyword tokens that resolve to real values at prompt-creation time.
  // Each entry carries a human label, the literal token to insert into the
  // task description, and a short description of what it resolves to.
  const keywordTokens = useMemo(() => {
    const taskId = task?.id || 'task';
    const projectRoot = activeProject?.cwd || './';
    const taskDocs = `${projectRoot.replace(/\/+$/, '')}/docs/tasks/${taskId}/`;
    // Board summaries cap task.reports at the recent few: prefer the full
    // separately-fetched report list when it has loaded so old plan paths
    // still resolve, falling back to the summary's recent entries.
    const tokenReports =
      Array.isArray(reportsData) && reportsData.length > 0
        ? reportsData
        : Array.isArray(task?.reports)
          ? task.reports
          : [];
    const priorPaths = tokenReports
      .map((r) => {
        if (typeof r === 'string') return r;
        return r.path || r.filename;
      })
      .filter(Boolean);
    const latestPath = priorPaths.at(-1) || '';
    const planPath =
      tokenReports
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
  }, [task, activeProject, taskStage, reportsData]);

  const [copiedKeyword, setCopiedKeyword] = useState(null);
  const handleCopyKeyword = (kw) => {
    if (navigator.clipboard && kw) {
      navigator.clipboard.writeText(kw.token);
      setCopiedKeyword(kw.token);
      setTimeout(() => setCopiedKeyword(null), 2000);
    }
  };

  const timelineDotClass = (status) => {
    if (status === 'Success' || status === 'SUCCESS' || status === 'completed') {
      return 'bg-primary shadow-[0_0_8px_rgba(123,219,133,0.4)]';
    }
    if (status === 'Fail' || status === 'FAIL' || status === 'Failed') {
      return 'bg-error';
    }
    // A parked failure is settled, never live: solid error dot with no pulse
    // so it cannot read as an executing stage.
    if (status === 'Parked' || status === 'PARKED') {
      return 'bg-error';
    }
    return 'bg-secondary animate-pulse';
  };

  const timelineTextClass = (status) => {
    if (status === 'Success' || status === 'SUCCESS' || status === 'completed')
      return 'text-primary';
    if (status === 'Fail' || status === 'FAIL' || status === 'Failed') return 'text-error';
    if (status === 'Parked' || status === 'PARKED') return 'text-error';
    return 'text-secondary';
  };

  if (!task) return null;

  return (
    <aside
      ref={overlayRef}
      aria-label="Task Inspector"
      // MARK: footer reservation contract (#footer-overlap)
      // The fixed Now Playing footer occupies the bottom 72px of the viewport.
      // When it is rendered (footerReserved), this panel must end ABOVE it —
      // `bottom-[72px]` overrides `inset-0`'s bottom on mobile, and
      // `h-[calc(100%-72px)]` sizes the panel 72px short of the row on desktop
      // (md:inset-auto resets the mobile bottom offset). This mirrors the
      // Configure drawer so the footer never covers the panel and the panel
      // never covers the footer.
      className={`fixed inset-0 z-50 md:relative md:inset-auto md:z-50 w-full md:w-[480px] lg:w-[560px] xl:w-[620px] flex-shrink-0 ${
        footerReserved ? 'bottom-[72px] h-[calc(100%-72px)]' : 'h-full'
      } border-l border-border-standard bg-surface flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300`}
    >
      {/* Inspector Header */}
      <header className="p-4 border-b border-border-standard bg-surface-container flex flex-col gap-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* copyable task key – intentional */}
              <CopyableTaskKey
                taskId={task?.id}
                label={formattedKey}
                className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded"
              />
              <span className="text-[10px] uppercase font-mono text-text-muted">
                {activeProject?.name || 'Project'}
              </span>
            </div>
            <h2
              className="font-headline-md text-sm font-bold text-on-surface truncate mt-1"
              title={title}
            >
              {formatTaskTitleFirstLine(title)}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <InfoTooltip
              title="Open in Full Page"
              description="Open this task in its own dedicated, focused page view."
              position="left"
            >
              <button
                type="button"
                onClick={() => {
                  // Opening the full page IS a navigation: the facade routes
                  // to the canonical `/tasks/:id` path for this task.
                  if (task?.id) setView?.('task-detail', { taskId: task.id });
                  else setView?.('task-detail');
                }}
                aria-label="Open in full page"
                className="min-w-[44px] min-h-[44px] p-2 text-text-muted hover:text-primary hover:bg-surface-container-high rounded transition-colors cursor-pointer flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  open_in_new
                </span>
              </button>
            </InfoTooltip>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Task Inspector"
              className="min-w-[44px] min-h-[44px] p-2 text-text-muted hover:text-on-surface hover:bg-surface-container-high rounded transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Stage selection & status pills */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border-standard/50">
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
              <span className="text-on-surface">{taskStage?.name || '—'}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${
                statusBadgeClass
              }`}
              aria-label={isBlockedByDependencies ? overlayBlockedLabel : undefined}
              title={isBlockedByDependencies ? overlayBlockedLabel : undefined}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Inspector Navigation Tabs (div, not nav: a tablist is its own
            landmark-grade widget — WCAG 4.1.2). */}
        <div
          className="flex bg-surface-deep rounded p-0.5 border border-border-standard shrink-0 mt-1"
          role="tablist"
          aria-label="Task inspector tabs"
        >
          {[
            {
              id: 'details',
              label: 'Details',
              icon: '📝',
              desc: 'Goal markdown description, keyword tokens, and steering intervention.',
            },
            {
              id: 'logs',
              label: isTaskExecuting ? 'Logs 🔴' : 'Logs',
              icon: '💻',
              desc: 'Real-time WebSocket streaming logs and subprocess stdout/stderr traces.',
            },
            {
              id: 'reports',
              label: `Reports (${uniqueReports.length})`,
              icon: '📄',
              desc: 'Structured Markdown reports generated by autonomous agents under docs/tasks/<id>/.',
            },
            {
              id: 'history',
              label: 'History',
              icon: '⏱️',
              desc: 'Audit trail of stage transitions, elapsed durations, retries, and reviewer approvals.',
            },
          ].map((tab) => (
            <InfoTooltip
              key={tab.id}
              title={`Inspector Tab: ${tab.label}`}
              description={tab.desc}
              position="bottom"
              className="flex-1"
            >
              <button
                id={`task-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`task-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full py-2.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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

      {/* Inspector Body Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 bg-surface-deep">
        {activeTab === 'details' && (
          <TaskDetailsTab
            activeProject={activeProject}
            activeProjectId={activeProjectId}
            approvalGuidance={approvalGuidance}
            completeTask={completeTask}
            copiedKeyword={copiedKeyword}
            currentStageId={currentStageId}
            failureMessage={failureMessage}
            formattedKey={formattedKey}
            goalError={goalError}
            goalHandleBlur={goalHandleBlur}
            goalIsDirty={goalIsDirty}
            goalIsSaving={goalIsSaving}
            goalLastSaved={goalLastSaved}
            handleApprove={handleApprove}
            handleCopyKeyword={handleCopyKeyword}
            handleExecuteStage={handleExecuteStage}
            handleReject={handleReject}
            handleResumeTask={handleResumeTask}
            handleRetryStage={handleRetryStage}
            handleSendFollowUp={handleSendFollowUp}
            handleSendSteering={handleSendSteering}
            interventionText={interventionText}
            isAdvancing={isAdvancing}
            isBlocked={isBlockedByDependencies}
            isExecutingStage={isExecutingStage}
            isFailed={isFailed}
            isRejected={isRejected}
            isFlushingSave={isFlushingSave}
            isIntervening={isIntervening}
            isInterrupted={isInterrupted}
            isMutating={isMutating}
            isNonAgentStage={isNonAgentStage}
            isPaused={isPaused}
            isRetryingStage={isRetryingStage}
            isTaskExecuting={isTaskExecuting}
            isTerminalApproval={isTerminalHumanApproval(stages, task)}
            isWaitingHuman={isWaitingHuman}
            jumpTask={jumpTask}
            keywordTokens={keywordTokens}
            logs={logs}
            pendingAction={pendingAction}
            renderExecutionControls={renderExecutionControls}
            runTaskAction={runTaskAction}
            saveChanges={saveChanges}
            saved={saved}
            setActiveTab={setActiveTab}
            setApprovalGuidance={setApprovalGuidance}
            setInterventionText={setInterventionText}
            setShowApprovalGuidance={setShowApprovalGuidance}
            onTitleChange={handleTitleChange}
            hasUnsyncedChanges={hasUnsyncedGoalChanges}
            showApprovalGuidance={showApprovalGuidance}
            task={task}
            taskStage={taskStage}
            title={title}
            uniqueReports={uniqueReports}
          />
        )}

        {/* Dedicated Live Logs / Terminal Tab */}
        {activeTab === 'logs' && (
          <LogsPanel
            logs={logs}
            taskStage={taskStage}
            task={task}
            isTaskExecuting={isTaskExecuting}
            isActive={activeTab === 'logs'}
          />
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <TaskReportsTab
            reports={reportsForViewer}
            loading={loadingReports}
            activeProject={activeProject}
            taskId={task.id}
          />
        )}

        {/* History Tab with Deduplicated Timeline & Audit Events (#18) */}
        {activeTab === 'history' && (
          <TaskHistoryTab
            timelineData={timelineData}
            auditEvents={auditEvents}
            timelineDotClass={timelineDotClass}
            timelineTextClass={timelineTextClass}
            avgSecondsByStage={avgSecondsByStage}
            onOpenReport={() => setActiveTab('reports')}
          />
        )}
      </div>

      {/* Inspector Footer
          No extra bottom padding needed: with the footer-reservation contract
          (see MARK: footer reservation contract) the panel ends above the Now
          Playing footer, so its own uniform padding is consistent on mobile
          and desktop. */}
      <footer className="p-3.5 border-t border-border-standard bg-surface-container flex items-center justify-between shrink-0">
        <button
          type="button"
          disabled={isMutating}
          aria-busy={isDeleting}
          onClick={handleDelete}
          className="text-xs font-bold uppercase tracking-wider text-error hover:bg-error/10 px-3.5 py-2.5 min-h-[44px] rounded transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 font-mono"
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

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Inspector"
          className="text-xs font-bold uppercase tracking-wider bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-4 py-2.5 min-h-[44px] rounded transition-colors cursor-pointer flex items-center justify-center font-mono"
        >
          Close Inspector
        </button>
      </footer>
    </aside>
  );
}

export default TaskDetailOverlay;
