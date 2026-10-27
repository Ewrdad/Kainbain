import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { usePersistentState } from '../../hooks/usePersistentState';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock';
import { useKainBain } from '../../context/KainBainContext';
import { shouldShowGlobalHeader } from '../util/headerVisibility';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { subscribeObservability } from '../../services/observabilityEvents';
import { isTaskRunning, resolveRunningTask } from '../tasks/runningTask';
import { isMonitorRunning } from '../tasks/isMonitorRunning';
import {
  WIDGET_CATALOG,
  DEFAULT_LAYOUT,
  PRESET_LAYOUTS,
  cloneLayout,
  normalizeLayout,
} from './widgetRegistry';
import { WidgetContainer } from './WidgetContainer';
import { WidgetManagerModal } from './WidgetManagerModal';
import { EngineStatePill } from './EngineStatePill';
import { MobileMonitorView } from './MobileMonitorView';
import {
  readCompactMonitorRequest,
  clearCompactMonitorView,
  useIsNarrowViewport,
} from './monitorCompact';
import { KpiRibbonWidget } from './widgets/KpiRibbonWidget';
import { KpiSuccessesWidget } from './widgets/KpiSuccessesWidget';
import { KpiFailuresWidget } from './widgets/KpiFailuresWidget';
import { KpiQueueDepthWidget } from './widgets/KpiQueueDepthWidget';
import { KpiCheckpointsWidget } from './widgets/KpiCheckpointsWidget';
import { KpiEngineWidget } from './widgets/KpiEngineWidget';
import { QueueOrderWidget } from './widgets/QueueOrderWidget';
import { ActiveTaskPromptWidget } from './widgets/ActiveTaskPromptWidget';
import { PerRunnerTasksWidget } from './widgets/PerRunnerTasksWidget';
import { LiveConsoleWidget } from './widgets/LiveConsoleWidget';
import { SubsystemHealthWidget } from './widgets/SubsystemHealthWidget';
import { HealthLitellmWidget } from './widgets/HealthLitellmWidget';
import { HealthDeviceWidget } from './widgets/HealthDeviceWidget';
import { HealthOllamaWidget } from './widgets/HealthOllamaWidget';
import { HealthWebsocketWidget } from './widgets/HealthWebsocketWidget';
import { HealthHarnessWidget } from './widgets/HealthHarnessWidget';
import { RecentOutcomesWidget } from './widgets/RecentOutcomesWidget';
import { StatsBreakdownWidget } from './widgets/StatsBreakdownWidget';
import { HarnessReliabilityWidget } from './widgets/HarnessReliabilityWidget';

const STORAGE_KEY = 'kainbain_observability_layout_v2';
// Version 1 layouts (one entry per widget type, no instanceId) are read once
// and migrated by `normalizeLayout`; the successful v2 write retires the key.
const LEGACY_STORAGE_KEY = 'kainbain_observability_layout_v1';

/***
 * MARK: mergeMissingCatalogWidgets
 * @description Migration-only helper: appends factory entries for the shipped
 *   cockpit widgets (`DEFAULT_LAYOUT` types) a saved version 1 layout
 *   predates, so an upgrade that adds a cockpit widget never reshuffles what
 *   the operator already arranged. Existing types keep every instance the
 *   operator added; only wholly absent cockpit types are appended. Newer
 *   atomic widgets stay opt-in via the add-widget menu rather than appearing
 *   uninvited. Never applied to version 2 stores: a v2 layout is the
 *   operator's exact arrangement, and merging would resurrect widgets they
 *   deliberately removed the next time the monitor loads.
 *   The merged array is re-normalized because an imported/edited layout may
 *   legitimately already use any `instanceId` — including a factory one on a
 *   different widget type — and duplicate keys would make one resize/hide
 *   control drive two widgets. `normalizeLayout` re-keys only a collision.
 * @example mergeMissingCatalogWidgets([{ instanceId: 'kpis', id: 'kpis' }]) // => kpis plus the other cockpit defaults
 * @param {Array<Object>} layout - A normalized saved layout.
 * @returns {Array<Object>} The layout plus any missing cockpit defaults, normalized.
 ***/
export function mergeMissingCatalogWidgets(layout) {
  const presentTypes = new Set(layout.map((entry) => entry.id));
  const missingDefaults = DEFAULT_LAYOUT.filter((entry) => !presentTypes.has(entry.id));
  if (missingDefaults.length === 0) return layout;
  return normalizeLayout([...layout, ...cloneLayout(missingDefaults)]);
}

/***
 * MARK: readStoredLayout
 * @description Parses one localStorage layout key without throwing: corrupt
 *   JSON (or a non-array payload) reads as absent so the caller can fall
 *   through to the next source. A corrupt store must never lose an older
 *   good copy sitting under the other key.
 * @example readStoredLayout('kainbain_observability_layout_v2') // => parsed array, or null
 * @param {string} key - The localStorage key to read.
 * @returns {Array<Object>|null} The stored entries, or null when absent/unreadable.
 ***/
function readStoredLayout(key) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    logger.warn(`Failed to read dashboard layout key ${key}`, e);
    return null;
  }
}

/***
 * MARK: loadSavedLayout
 * @description Loads the persisted widget layout, newest key first. A version
 *   2 store is the operator's exact arrangement and is only normalized
 *   (validated, re-keyed on collision) — never merged — so a widget removed
 *   via the manager stays removed across reloads. A version 1 store (or a
 *   legacy export pasted as JSON) is normalized and then merged with any
 *   cockpit defaults it predates, so upgrading never loses the arrangement
 *   and never drops the operator into a half-empty cockpit. A corrupt
 *   version 2 value falls back to the legacy key before the factory layout,
 *   so one bad write never orphans a good saved customization; unknown
 *   widget types are dropped rather than rendered as "not found in registry"
 *   placeholders. Failure mode: every branch returns a renderable layout —
 *   this function never throws to its caller (`useState` initializer).
 * @returns {Array<Object>} A valid, uniquely-keyed layout array.
 ***/
function loadSavedLayout() {
  if (typeof window === 'undefined') return cloneLayout(DEFAULT_LAYOUT);
  const savedV2 = readStoredLayout(STORAGE_KEY);
  if (savedV2) {
    try {
      return normalizeLayout(savedV2);
    } catch (e) {
      logger.warn('Failed to normalize saved dashboard layout', e);
    }
  }
  // Reached only when no usable v2 store exists (absent, corrupt, or
  // un-normalizable): a legacy customization still outranks the factory.
  const savedV1 = readStoredLayout(LEGACY_STORAGE_KEY);
  if (savedV1) {
    try {
      return mergeMissingCatalogWidgets(normalizeLayout(savedV1));
    } catch (e) {
      logger.warn('Failed to migrate legacy dashboard layout', e);
    }
  }
  return cloneLayout(DEFAULT_LAYOUT);
}

/***
 * MARK: ObservabilityDashboard
 * @description Fully customizable telemetry & observability dashboard for secondary monitors,
 * kiosks, and debug consoles. Supports dynamic widget reordering, resizing, adding/removing widgets,
 * layout presets, and persistent custom configurations.
 ***/
export function ObservabilityDashboard() {
  const {
    view,
    setView = () => {},
    tasks = [],
    engineState = {},
    isAgentRunning,
    processLogs = [],
    healthState = {},
    projects = [],
    connectionStatus,
    clearLogs,
    uiPreferences = {},
    stages = [],
  } = useKainBain();

  // Widget layout & customization state
  const [layout, setLayout] = useState(loadSavedLayout);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  // Whether the configuration controls (project select, presets, edit, customize)
  // are visible. Off by default so the default monitor view is clean and
  // distraction-free (the "one page" / no-scroll requirement).
  const [showConfigure, setShowConfigure] = useState(false);

  // Telemetry & Kiosk controls
  const [metricsData, setMetricsData] = useState(null);
  const [queueData, setQueueData] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = usePersistentState(
    'kainbain:observability:projectId',
    'all',
    { validate: (v) => typeof v === 'string' && v.length > 0 && v.length <= 200 },
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [activeTaskElapsed, setActiveTaskElapsed] = useState(0);
  // Compact logs-only presentation: explicit desktop request (right-click
  // the header Monitor button) or an automatically detected phone viewport.
  const [compactRequested, setCompactRequested] = useState(readCompactMonitorRequest);
  const isNarrowViewport = useIsNarrowViewport();
  const showCompact = compactRequested || isNarrowViewport;

  // Leaving the monitor always returns to viewport-driven presentation, so
  // a one-off desktop compact request never sticks for the next visit.
  const exitToOrchestrator = () => {
    clearCompactMonitorView();
    setCompactRequested(false);
    setView('orchestrator');
  };

  const activeTaskStartRef = useRef(0);
  const activeTaskIdRef = useRef(null);
  const liveEngineRef = useRef(engineState);
  useEffect(() => {
    liveEngineRef.current = engineState;
  }, [engineState]);

  // Save layout changes to localStorage. The legacy v1 key is retired only
  // after the v2 write succeeds, so a failed write never loses a saved layout.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      logger.warn('Failed to save layout to localStorage', e);
    }
  }, [layout]);

  // Live wall clock timer (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track active task elapsed execution seconds
  useEffect(() => {
    const activeId = engineState?.activeTaskId;
    if (activeId !== activeTaskIdRef.current) {
      activeTaskIdRef.current = activeId;
      activeTaskStartRef.current = Date.now();
      setActiveTaskElapsed(0);
    }

    if (isMonitorRunning(engineState, isAgentRunning)) {
      if (activeTaskStartRef.current === 0) {
        activeTaskStartRef.current = Date.now();
      }
      const timer = setInterval(() => {
        const diff = Math.floor((Date.now() - activeTaskStartRef.current) / 1000);
        setActiveTaskElapsed(diff);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [engineState?.activeTaskId, engineState?.status, isAgentRunning]);

  // REST owns the prompt. Socket events request fresh reads, never merge payloads.
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;
    let dirty = false;
    let debounceTimer;
    const isVisible = () => document.visibilityState !== 'hidden';
    const projId = selectedProjectId !== 'all' ? selectedProjectId : undefined;

    const load = async (refresh = false) => {
      dirty ||= refresh;
      if (!isMounted || !isVisible() || inFlight) return;
      inFlight = true;
      const bypassCache = dirty;
      dirty = false;
      try {
        const res = await api.observabilityStatus(projId, bypassCache);
        // Discard invalidated cached polls, but publish each fresh REST read even
        // while events continue. The dirty flag still queues one follow-up; task/
        // stage matching below prevents showing a previous run's prompt.
        if (isMounted && (!dirty || bypassCache) && res?.observability) {
          setMetricsData(res.observability);
          setQueueData(res.observability.queue || []);
        }
      } catch (e) {
        logger.error('Failed to fetch observability status', e);
      } finally {
        inFlight = false;
        if (isMounted && dirty && isVisible()) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void load(true);
          }, 500);
        }
      }
    };
    const unsubscribe = subscribeObservability((event) => {
      if (event.type === 'TASK_UPDATED' && event.taskId !== liveEngineRef.current?.activeTaskId)
        return;
      if (event.projectId && projId && event.projectId !== projId) return;
      dirty = true;
      // Bounded coalescing: continuous traffic cannot postpone refresh forever.
      if (!debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void load(true);
        }, 500);
    });
    void load();
    const interval = setInterval(() => void load(), 15000);
    const onVisibility = () => {
      if (isVisible()) void load(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(interval);
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [selectedProjectId]);

  // Harness reliability for the reliability widget: a global (all projects,
  // all time) slow-moving payload, so it keeps its own lightweight poll
  // instead of riding the project-filtered observability snapshot — and it
  // only polls while the widget is actually on the dashboard (default-off).
  // `reliability === null` means the first fetch has not landed yet, which
  // renders as the widget's honest loading state; a build without the api
  // helper surfaces an honest unavailable message instead.
  const [reliability, setReliability] = useState(null);
  const [reliabilityError, setReliabilityError] = useState(() =>
    typeof api.getHarnessReliability === 'function'
      ? null
      : 'Harness reliability is unavailable in this build.',
  );
  const reliabilityWidgetEnabled = layout.some((w) => w.id === 'reliability' && w.enabled);
  const reliabilityPending =
    reliability === null && !reliabilityError && typeof api.getHarnessReliability === 'function';

  /***
   * MARK: loadReliability
   * @description Event-handler (re)fetch of `GET /harnesses/reliability`
   *   for the reliability widget's Retry button. The mount/refresh effect
   *   below inlines its own fetch chain so no setState ever runs
   *   synchronously inside an effect.
   ***/
  const loadReliability = useCallback(() => {
    if (typeof api.getHarnessReliability !== 'function') return;
    api
      .getHarnessReliability()
      .then((res) => {
        setReliability(Array.isArray(res?.reliability) ? res.reliability : []);
        setReliabilityError(null);
      })
      .catch(() => {
        setReliabilityError('Could not load harness reliability — check the connection.');
      });
  }, []);

  // Reliability refresh cycle, active only while the widget is enabled on
  // the full dashboard (the compact logs-only view renders no widgets and
  // never polls reliability):
  // REST is the source of truth; socket events request a debounced (~2 s)
  // fresh read, and a 60 s poll plus visibility / focus returns are the
  // safety nets (reliability moves slowly — no need to ride the 15 s
  // observability cycle).
  useEffect(() => {
    if (showCompact || !reliabilityWidgetEnabled || typeof api.getHarnessReliability !== 'function')
      return undefined;
    const load = () =>
      api.getHarnessReliability().then(
        (res) => {
          setReliability(Array.isArray(res?.reliability) ? res.reliability : []);
          setReliabilityError(null);
        },
        () => {
          setReliabilityError('Could not load harness reliability — check the connection.');
        },
      );
    let debounceTimer = null;
    const scheduleLoad = () => {
      if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void load();
        }, 2000);
      }
    };
    const unsubscribe = subscribeObservability(scheduleLoad);
    void load();
    const interval = setInterval(() => void load(), 60000);
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      unsubscribe();
      clearInterval(interval);
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [reliabilityWidgetEnabled, showCompact]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Filter tasks by project if selected
  const filteredTasks = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    if (selectedProjectId === 'all') return tasks;
    return tasks.filter((t) => t.projectId === selectedProjectId);
  }, [tasks, selectedProjectId]);

  // Compute live stats from tasks
  const stats = useMemo(() => {
    if (metricsData?.stats) {
      return metricsData.stats;
    }
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === 'completed').length;
    const failed = filteredTasks.filter((t) => t.status === 'failed').length;
    // Single-active invariant: only the engine owner counts as running
    // (0..1). Stale running_* labels on non-owners must not inflate this.
    const running = filteredTasks.filter((t) => isTaskRunning(t, engineState)).length;
    const waitingHuman = filteredTasks.filter((t) => t.status === 'waiting_human').length;
    const paused = filteredTasks.filter((t) => t.status === 'paused').length;
    const inStage = filteredTasks.filter(
      (t) => t.status === 'in_stage' || (!t.status && t.status !== 'completed'),
    ).length;
    const blocked = filteredTasks.filter(
      (t) => Array.isArray(t.blockedBy) && t.blockedBy.length > 0 && t.status !== 'completed',
    ).length;

    const resolved = completed + failed;
    const successRate = resolved > 0 ? Number(((completed / resolved) * 100).toFixed(1)) : 100.0;
    const failureRate = resolved > 0 ? Number(((failed / resolved) * 100).toFixed(1)) : 0.0;

    return {
      total,
      completed,
      failed,
      running,
      waitingHuman,
      paused,
      inStage,
      blocked,
      queueDepth: inStage + running + waitingHuman,
      successRate,
      failureRate,
    };
  }, [metricsData, filteredTasks, engineState]);

  // Resolved Active Task details: the engine owner, or nothing.
  // Single-active invariant — there is deliberately NO fallback to the
  // first task with a running_* label here (nor to a server snapshot that
  // is not the owner): that fallback is the phantom-second-runner bug.
  // With no owner the panel shows the last-executed task or its empty state.
  const activeTask = useMemo(() => {
    const activeId = engineState?.activeTaskId;
    if (activeId) {
      const snapshot = metricsData?.activeTask;
      const sameStage =
        !engineState.activeStageId ||
        metricsData?.engineState?.activeStageId === engineState.activeStageId;
      if (snapshot?.id === activeId && sameStage) return snapshot;
      const found = filteredTasks.find((t) => t.id === activeId);
      // Never label a previous stage's prompt/model as the newly executing run.
      return found
        ? {
            ...found,
            prompt: '',
            model: null,
            harness: null,
            modelDetails: null,
            alias: null,
            aliasMissing: null,
            currentStageName: null,
            currentStageType: null,
          }
        : null;
    }
    return resolveRunningTask(filteredTasks, engineState);
  }, [metricsData, engineState, filteredTasks]);

  // Resolved Scheduled Queue
  const scheduledQueue = useMemo(() => {
    if (queueData && queueData.length > 0) {
      return queueData;
    }
    // Client fallback queue sorting
    const pending = filteredTasks.filter((t) => t.status !== 'completed' && t.status !== 'failed');
    return pending.map((t, idx) => ({
      ...t,
      queueOrder: idx + 1,
      currentStageName: t.currentStageId || 'Stage',
      priorityReason:
        t.id === engineState.activeTaskId
          ? 'Active Execution'
          : t.status === 'waiting_human'
            ? 'Waiting Human Review'
            : t.status === 'paused'
              ? 'Paused'
              : 'Standard Priority',
    }));
  }, [queueData, filteredTasks, engineState]);

  // Recent Completed & Failed lists
  const recentCompleted = useMemo(() => {
    if (metricsData?.recentCompleted) return metricsData.recentCompleted;
    return filteredTasks
      .filter((t) => t.status === 'completed')
      .slice(-10)
      .reverse();
  }, [metricsData, filteredTasks]);

  const recentFailed = useMemo(() => {
    if (metricsData?.recentFailed) return metricsData.recentFailed;
    return filteredTasks
      .filter((t) => t.status === 'failed')
      .slice(-10)
      .reverse();
  }, [metricsData, filteredTasks]);

  // Layout Reorder & Resize Helpers
  const handleMoveWidget = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= layout.length) return;
    const updated = [...layout];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setLayout(updated);
  };

  const handleResizeWidth = (instanceId, newColSpan) => {
    setLayout((prev) =>
      prev.map((w) => (w.instanceId === instanceId ? { ...w, colSpan: newColSpan } : w)),
    );
  };

  const handleResizeHeight = (instanceId, newHeight) => {
    setLayout((prev) =>
      prev.map((w) => (w.instanceId === instanceId ? { ...w, height: newHeight } : w)),
    );
  };

  const handleToggleWidgetVisibility = (instanceId) => {
    setLayout((prev) =>
      prev.map((w) => (w.instanceId === instanceId ? { ...w, enabled: !w.enabled } : w)),
    );
  };

  const handleApplyPreset = (presetLayout) => {
    setLayout(normalizeLayout(presetLayout));
  };

  const handleResetLayout = () => {
    setLayout(cloneLayout(DEFAULT_LAYOUT));
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Status pulse styling
  const engineStatus = engineState?.status || (isAgentRunning ? 'running' : 'idle');
  const isRunning = isMonitorRunning(engineState, isAgentRunning);
  const isCheckpoint = engineStatus === 'checkpoint' || engineStatus === 'waiting_human';
  const isPaused = engineStatus === 'paused';

  // Screen wake lock: held while and only while the monitor is open (this
  // component is mounted), monitoring is active, the preference is on, and
  // the document is visible. One mount covers desktop and the compact
  // mobile branch below; unmount, idle, hidden tab, or pref-off releases.
  const keepScreenAwake = uiPreferences?.keepScreenAwakeOnMonitor !== false;
  useScreenWakeLock({
    wanted: keepScreenAwake && isRunning,
  });

  // Visible widgets filter
  const visibleWidgets = layout.filter((w) => w.enabled);

  // Render individual widget content by instance. The per-instance extension
  // seam lives in the layout entry itself: `normalizeLayout` preserves each
  // entry's opaque `config` object across load/preset/import, and
  // `WidgetContainer` renders `config.title` as a per-copy title override.
  // A future parameterised widget (for example a reliability card pinned to
  // one harness) declares its own `config` prop and reads it in its case
  // below — no widget is passed a prop it does not declare today.
  const renderWidgetContent = (widgetInstance) => {
    const widgetId = widgetInstance?.id;
    switch (widgetId) {
      case 'kpis':
        return (
          <KpiRibbonWidget
            stats={stats}
            scheduledQueue={scheduledQueue}
            engineState={engineState}
            activeTask={activeTask}
          />
        );
      case 'kpi-successes':
        return <KpiSuccessesWidget stats={stats} />;
      case 'kpi-failures':
        return <KpiFailuresWidget stats={stats} />;
      case 'kpi-queue':
        return <KpiQueueDepthWidget stats={stats} scheduledQueue={scheduledQueue} />;
      case 'kpi-checkpoints':
        return <KpiCheckpointsWidget stats={stats} />;
      case 'kpi-engine':
        return <KpiEngineWidget engineState={engineState} activeTask={activeTask} />;
      case 'queue':
        return (
          <QueueOrderWidget
            scheduledQueue={scheduledQueue}
            engineState={engineState}
            schedulerRunning={metricsData?.schedulerRunning}
          />
        );
      case 'activeTask':
        return (
          <ActiveTaskPromptWidget
            activeTask={activeTask}
            engineState={engineState}
            isRunning={isRunning}
            activeTaskElapsed={activeTaskElapsed}
          />
        );
      case 'runnerTasks':
        return <PerRunnerTasksWidget tasks={filteredTasks} stages={stages} compact={false} />;
      case 'console':
        return <LiveConsoleWidget processLogs={processLogs} onClearLogs={clearLogs} />;
      case 'health':
        return (
          <SubsystemHealthWidget healthState={healthState} connectionStatus={connectionStatus} />
        );
      case 'health-litellm':
        return <HealthLitellmWidget healthState={healthState} />;
      case 'health-device':
        return <HealthDeviceWidget healthState={healthState} />;
      case 'health-ollama':
        return <HealthOllamaWidget healthState={healthState} />;
      case 'health-websocket':
        return <HealthWebsocketWidget connectionStatus={connectionStatus} />;
      case 'health-harness':
        return <HealthHarnessWidget healthState={healthState} />;
      case 'outcomes':
        return (
          <RecentOutcomesWidget recentCompleted={recentCompleted} recentFailed={recentFailed} />
        );
      case 'statsBreakdown':
        return <StatsBreakdownWidget stats={stats} />;
      case 'reliability':
        return (
          <HarnessReliabilityWidget
            reliability={reliability || []}
            pending={reliabilityPending}
            error={reliabilityError}
            onRetry={() => {
              void loadReliability();
            }}
          />
        );
      default:
        return (
          <div className="p-4 text-xs text-slate-400 font-mono">
            Widget [{widgetId}] not found in registry.
          </div>
        );
    }
  };

  // Compact logs-only presentation for phones and explicit desktop
  // requests: slim status header + live console, none of the cockpit
  // widgets. Same view id, same data hooks — presentation only.
  if (showCompact) {
    return (
      <div
        data-testid="observability-dashboard"
        className="flex-1 flex flex-col h-full min-w-0 bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden"
      >
        <h1 className="sr-only">Observability monitor</h1>
        <MobileMonitorView
          engineState={engineState}
          activeTask={activeTask}
          stages={stages}
          isAgentRunning={isAgentRunning}
          runnerTasks={filteredTasks}
          runnerStages={stages}
          stats={stats}
          queueCount={scheduledQueue.length}
          schedulerRunning={metricsData?.schedulerRunning}
          processLogs={processLogs}
          onClearLogs={clearLogs}
          onExit={exitToOrchestrator}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="observability-dashboard"
      className="flex-1 flex flex-col h-full min-w-0 bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden"
    >
      <h1 className="sr-only">Observability monitor</h1>
      {/* ========================================================================= */}
      {/* 1. TOP TELEMETRY & SYSTEM HEALTH BAR (#6)                                  */}
      {/* ========================================================================= */}
      <header className="px-3 py-1.5 bg-[#0f172a] border-b border-slate-800/80 shrink-0 flex items-center justify-between gap-2 z-20 shadow-md">
        {/* Left: Brand / Title + Engine State Badge */}
        <div className="flex items-center gap-2 min-w-0">
          {!shouldShowGlobalHeader(view) && (
            <button
              type="button"
              onClick={exitToOrchestrator}
              aria-label="Exit monitor view"
              title="Back to orchestrator"
              className="px-2 py-0.5 min-h-[44px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500 text-xs font-mono font-bold transition-colors cursor-pointer shrink-0"
            >
              ← Back
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-base animate-pulse">📡</span>
            <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent truncate">
              Observability
            </h2>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-0.5 hidden sm:block" />

          {/* Glowing Engine State Pill (shared with the compact monitor header) */}
          <EngineStatePill
            engineState={engineState}
            activeTask={activeTask}
            stages={stages}
            isRunning={isRunning}
            isCheckpoint={isCheckpoint}
            isPaused={isPaused}
            schedulerRunning={metricsData?.schedulerRunning}
            testId="engine-state-badge"
          />
        </div>

        {/* Center: Subsystem Health Traffic Lights */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono">
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900/90 rounded border border-slate-800"
            title={healthState?.checks?.litellm?.message || 'LiteLLM Proxy'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthState?.checks?.litellm?.status === 'ok'
                  ? 'bg-emerald-400'
                  : healthState?.checks?.litellm?.status === 'warn' ||
                      healthState?.checks?.litellm?.status === 'warning'
                    ? 'bg-amber-400'
                    : healthState?.checks?.litellm?.status === 'disabled' ||
                        healthState?.checks?.litellm?.status === 'unconfigured'
                      ? 'bg-slate-500'
                      : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300">LiteLLM:</span>
            <span className="font-semibold text-slate-200">
              {healthState?.checks?.litellm?.latencyMs
                ? `${healthState.checks.litellm.latencyMs}ms`
                : healthState?.checks?.litellm?.status === 'disabled'
                  ? 'Disabled'
                  : healthState?.checks?.litellm?.status === 'unconfigured'
                    ? 'Not configured'
                    : healthState?.checks?.litellm?.status || 'OK'}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900/90 rounded border border-slate-800"
            title={healthState?.checks?.device?.message || 'Host Device'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthState?.checks?.device?.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300">RAM:</span>
            <span className="font-semibold text-slate-200">
              {healthState?.checks?.device?.memoryUsagePct
                ? `${healthState.checks.device.memoryUsagePct}%`
                : 'Normal'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900/90 rounded border border-slate-800">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400'
                  : connectionStatus === 'reconnecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300">Stream:</span>
            <span className="font-semibold text-slate-200 capitalize">
              {connectionStatus || 'connected'}
            </span>
          </div>
        </div>

        {/* Right: Configure toggle, Wall Clock & Fullscreen (clean monitor header) */}
        <div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
          {/* Configure Toggle: reveals project select, presets, edit & customize */}
          <button
            type="button"
            onClick={() => setShowConfigure(!showConfigure)}
            aria-expanded={showConfigure}
            aria-label="Toggle dashboard configuration controls"
            className={`px-2 py-0.5 rounded font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
              showConfigure
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
          >
            <span>{showConfigure ? '🔧 Done' : '⚙ Configure'}</span>
          </button>

          {/* Project Filter (hidden behind configure toggle for a clean monitor view) */}
          {showConfigure && (
            <select
              aria-label="Filter project observability scope"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setMetricsData(null);
                setQueueData([]);
              }}
              className="bg-slate-900 text-slate-200 border border-slate-700 px-2 py-0.5 rounded text-xs outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">🌐 All Projects Scope</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Quick Presets Dropdown (hidden behind configure toggle) */}
          {showConfigure && (
            <select
              aria-label="Select dashboard layout preset"
              onChange={(e) => {
                const preset = PRESET_LAYOUTS.find((p) => p.id === e.target.value);
                if (preset) handleApplyPreset(preset.layout);
              }}
              defaultValue=""
              className="hidden md:block bg-slate-900 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-xs outline-none cursor-pointer"
            >
              <option value="" disabled>
                📐 Layout Presets
              </option>
              {PRESET_LAYOUTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Edit Layout Toggle (hidden behind configure toggle) */}
          {showConfigure && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-2 py-0.5 rounded font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                isEditMode
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 animate-pulse'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
              }`}
              title={
                isEditMode
                  ? 'Lock Dashboard Layout'
                  : 'Unlock & Rearrange / Resize Dashboard Widgets'
              }
            >
              <span>{isEditMode ? '🔒 Done' : '✏️ Edit'}</span>
            </button>
          )}

          {/* Customize Widgets Modal Button (hidden behind configure toggle) */}
          {showConfigure && (
            <button
              type="button"
              onClick={() => setIsManagerOpen(true)}
              className="p-1 min-w-[44px] min-h-[44px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500 transition-colors cursor-pointer"
              title="Add / Remove Widgets & Backup Layout"
              aria-label="Manage Widgets"
            >
              <span>⚙️</span>
            </button>
          )}

          {/* Live Clock */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-slate-900/80 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            <span>🕒</span>
            <span>{currentTime.toLocaleTimeString()}</span>
          </div>

          {/* Fullscreen Kiosk Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1 min-w-[44px] min-h-[44px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (Kiosk Mode)'}
            aria-label="Toggle Fullscreen"
          >
            <span>{isFullscreen ? '🗗' : '⛶'}</span>
          </button>
        </div>
      </header>

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="px-4 py-2 bg-emerald-950/70 border-b border-emerald-500/50 flex items-center justify-between text-xs font-mono text-emerald-300 shrink-0">
          <div className="flex items-center gap-2">
            <span>✏️</span>
            <span className="uppercase font-bold">Dashboard customization mode active</span>
            <span className="text-slate-300 hidden sm:inline">
              — Use the ◀ ▶ buttons to reorder, change column spans, or resize widget heights.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsManagerOpen(true)}
              className="px-2 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-600 font-bold transition-colors cursor-pointer"
            >
              + Add Widgets
            </button>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="px-2.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors cursor-pointer"
            >
              Save & Lock
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DYNAMIC CUSTOMIZABLE WIDGET GRID                                       */}
      {/* ========================================================================= */}
      <div id="observability-grid" className="flex-1 p-3 overflow-hidden custom-scrollbar">
        <div className="grid grid-cols-12 gap-3 h-full min-h-0 content-start">
          {visibleWidgets.length === 0 ? (
            <div className="col-span-12 h-64 flex flex-col items-center justify-center p-8 text-center text-slate-400 font-mono text-xs border border-dashed border-slate-800 rounded-lg">
              <span className="text-3xl mb-2 opacity-50">📦</span>
              <p className="font-bold text-slate-300">All Widgets are Currently Hidden</p>
              <p className="text-[11px] mt-1 text-slate-400">
                Click below to add widgets or apply a dashboard layout preset.
              </p>
              <button
                type="button"
                onClick={() => setIsManagerOpen(true)}
                className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-xs font-mono transition-colors cursor-pointer"
              >
                + Customize & Add Widgets
              </button>
            </div>
          ) : (
            visibleWidgets.map((widgetConfig) => {
              const meta = WIDGET_CATALOG.find((w) => w.id === widgetConfig.id);
              // Object identity: two copies of one widget type share an `id`, so
              // only the exact entry reference identifies the move position.
              const originalIndex = layout.indexOf(widgetConfig);

              return (
                <WidgetContainer
                  key={widgetConfig.instanceId}
                  id={widgetConfig.instanceId}
                  instanceId={widgetConfig.instanceId}
                  title={meta?.title || widgetConfig.id}
                  titleOverride={widgetConfig.config?.title}
                  shortTitle={meta?.shortTitle}
                  icon={meta?.icon}
                  colSpan={widgetConfig.colSpan || meta?.defaultColSpan || 6}
                  height={widgetConfig.height || meta?.defaultHeight || 'normal'}
                  isEditMode={isEditMode}
                  canMoveUp={originalIndex > 0}
                  canMoveDown={originalIndex < layout.length - 1}
                  onMoveUp={() => handleMoveWidget(originalIndex, -1)}
                  onMoveDown={() => handleMoveWidget(originalIndex, 1)}
                  onResizeWidth={(w) => handleResizeWidth(widgetConfig.instanceId, w)}
                  onResizeHeight={(h) => handleResizeHeight(widgetConfig.instanceId, h)}
                  onToggleVisibility={() => handleToggleWidgetVisibility(widgetConfig.instanceId)}
                >
                  {renderWidgetContent(widgetConfig)}
                </WidgetContainer>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. BOTTOM SLIM STATUS STRIP (#6)                                         */}
      {/* ========================================================================= */}
      <footer className="px-3 py-1 bg-[#0b101e] border-t border-slate-800/80 shrink-0 flex items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-emerald-400">✓ Done:</span>
            <span className="font-bold text-slate-200">{stats.completed}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-rose-400">✕ Failures:</span>
            <span className="font-bold text-slate-200">{stats.failed}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-cyan-400">⏳ Queue:</span>
            <span className="font-bold text-slate-200">{scheduledQueue.length}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-amber-400">✋ Checkpoints:</span>
            <span className="font-bold text-slate-200">{stats.waitingHuman}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400 shrink-0">
          <span>{visibleWidgets.length} Active Widgets</span>
          <span>•</span>
          <span>Zero-Touch Monitor</span>
        </div>
      </footer>

      {/* Widget Customizer Modal */}
      <WidgetManagerModal
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        layout={layout}
        onUpdateLayout={setLayout}
        onApplyPreset={handleApplyPreset}
        onResetLayout={handleResetLayout}
      />
    </div>
  );
}

export default ObservabilityDashboard;
