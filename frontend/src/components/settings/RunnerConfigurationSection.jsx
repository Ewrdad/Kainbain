import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { copyToClipboard } from '../../services/clipboard';
import { RunnerHarnessPanel } from './RunnerHarnessPanel';
import { formatRunnerElapsed } from '../observability/widgets/PerRunnerTasksWidget';
import {
  defaultRunnerConfig,
  runnerDisplayName,
  advertisedToolIds,
  effectiveTools,
  effectiveModels,
  displayDirectories,
  modelUnion,
  discoveryStatusSummary,
  modelSourceSummary,
  modelTogglePatch,
  loadedProjectIds,
  partitionProjects,
  withProjectLoaded,
  withProjectUnloaded,
  scopePatchForLoaded,
  validateSingleDirectory,
  jobTypeLabels,
  visibleRunners,
  resolveSelectedId,
  runRunnerAction,
  describeRunnerVersion,
  runnerStatusLabel,
  stalenessLabel,
  runnerCommands,
  canRequestUpdate,
  canRequestRediscovery,
  mergeRunnerRecord,
  dropDraftFor,
  buildDirectoryDraft,
  normalizeModelId,
  filterVisibleRunners,
} from './runnerConfigHelpers';

/**
 * MARK: DirectoryField
 * @description Reusable input component for editing directory paths with save action.
 *   Shows the current value, allows editing, and provides a save button. Displays
 *   a label indicating if the value is using the Runner's default.
 *
 * @param {Object} props - Component props
 * @param {string} props.label - Field label text
 * @param {string} props.testId - Test ID for the input field
 * @param {string} props.value - Current directory value
 * @param {string} props.hint - Placeholder/hint text showing effective value
 * @param {boolean} props.isDefault - Whether value is using Runner default
 * @param {boolean} props.isUnknown - Whether effective value is unknown
 * @param {string|null} props.error - Error message to display
 * @param {boolean} props.busy - Whether save action is in progress
 * @param {Function} props.onChange - Change handler for input
 * @param {Function} props.onSave - Save handler for button click
 * @returns {JSX.Element} Directory input field component
 */
const DirectoryField = ({ label, testId, value, hint, isDefault, isUnknown, error, busy, onChange, onSave }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold text-on-surface" htmlFor={`${testId}-input`}>
      {label} {isDefault && <span className="font-normal text-text-muted">(Runner default{isUnknown ? ' (unknown)' : ''})</span>}
    </label>
    <div className="flex items-center gap-2">
      <input
        id={`${testId}-input`}
        type="text"
        data-testid={testId}
        value={value}
        placeholder={hint || ''}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
      />
      <button
        type="button"
        data-testid={`${testId}-save`}
        onClick={onSave}
        disabled={busy}
        className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
      >
        Save
      </button>
    </div>
    {error && (
      <p className="text-[11px] text-error" role="alert" data-testid={`${testId}-error`}>
        {error}
      </p>
    )}
  </div>
);

/***
 * MARK: RunnerConfigurationSection
 * @description System Settings › Runners › detailed Runner configuration screen
 *   that allows operators to view and edit Runner settings including display name,
 *   project scope, available tools, model selection, directory preferences, and
 *   job type toggles. Also provides lifecycle controls (approve/deny/pause/resume/revoke),
 *   update/reload actions, and model re-detection.
 * 
 *   The screen shows a two-panel layout: a left roster of visible Runners and a
 *   right detail panel for the selected Runner. The entire Runner row is clickable
 *   to select it for configuration.
 *
 * @example <RunnerConfigurationSection />
 ***/
export function RunnerConfigurationSection() {
  const [runners, setRunners] = useState(null);
  const [projects, setProjects] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [scheduler, setScheduler] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [projectsError, setProjectsError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [freshCredential, setFreshCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [nameDrafts, setNameDrafts] = useState({});
  const [dirDrafts, setDirDrafts] = useState({});
  const [dirErrors, setDirErrors] = useState({});
  const [nowMs, setNowMs] = useState(null);
  const [filter, setFilter] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  // Fleet-wide quarantined model ids (malformed Runner-advertised ids with
  // their reasons): best-effort catalogue read, empty when the fetch fails
  // or nothing is quarantined — the block below renders only when non-empty.
  const [quarantined, setQuarantined] = useState([]);
  // Tracks follow-up refresh timers (post-command polls) and whether the
  // screen is still mounted: timers are cleared on unmount and every state
  // write behind them re-checks, so a slow poll can never write into an
  // unmounted screen or a runner row the operator already left.
  const refreshTimers = useRef([]);
  const isLive = useRef(true);

  useEffect(() => {
    isLive.current = true;
    return () => {
      isLive.current = false;
      for (const timer of refreshTimers.current) clearTimeout(timer);
      refreshTimers.current = [];
    };
  }, []);

  const loadRunners = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getRunners();
      if (!isLive.current) return;
      const rows = Array.isArray(list) ? list : [];
      setRunners(rows);
      setSelectedId((prev) => resolveSelectedId(visibleRunners(rows), prev));
      try {
        const monitor = await api.getRunnerMonitor();
        if (!isLive.current) return;
        const byRunner = {};
        for (const row of monitor?.liveAssignments || []) {
          if (row && typeof row.runnerId === 'string') byRunner[row.runnerId] = row;
        }
        setAssignments(byRunner);
        setScheduler(monitor?.scheduler || null);
        setNowMs(Date.now());
      } catch {
        if (!isLive.current) return;
        setAssignments({});
        setScheduler(null);
      }
      try {
        const fetched = await api.listProjects();
        if (!isLive.current) return;
        setProjects(Array.isArray(fetched) ? fetched : fetched?.projects || []);
        setProjectsError(null);
      } catch {
        if (!isLive.current) return;
        setProjects([]);
        setProjectsError('Could not load projects — the picker is unavailable.');
      }
      try {
        const catalogue =
          typeof api.getFleetModelCatalog === 'function'
            ? await api.getFleetModelCatalog()
            : null;
        if (!isLive.current) return;
        setQuarantined(
          Array.isArray(catalogue?.quarantined)
            ? catalogue.quarantined.filter((q) => q && typeof q.id === 'string')
            : [],
        );
      } catch {
        if (!isLive.current) return;
        setQuarantined([]);
      }
    } catch (err) {
      if (!isLive.current) return;
      setRunners(null);
      setLoadError(err?.message || 'Could not load Runner registrations.');
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadRunners());
  }, [loadRunners]);

  // The custom-model box and the revoke confirm belong to one Runner.
  // Cleared WITHOUT an effect (react-hooks/set-state-in-effect): adjust
  // state during render when the selected row moves — the documented React
  // alternative to sync-effects (same pattern as ProjectSettings). Moving
  // rows starts both empty so text typed for r1 can never be added to —
  // or revoke — r2; re-clicking the selected row keeps drafts.
  const [clearedRunnerId, setClearedRunnerId] = useState(selectedId);
  if (selectedId !== clearedRunnerId) {
    setClearedRunnerId(selectedId);
    setCustomModel('');
    setRevokeConfirm(null);
  }

  /***
   * MARK: queueRunnerRefresh
   * @description Re-reads one Runner row a few times after a queued
   *   backend-to-Runner command, so queued/failed states appear without a
   *   manual reload. Stops early on unmount or on the first failed-update
   *   report; malformed rows are ignored, never written into the roster.
   ***/
  const queueRunnerRefresh = useCallback(({ runnerId, rounds, onFailedUpdate } = {}) => {
    if (typeof runnerId !== 'string' || !runnerId || !Number.isFinite(rounds) || rounds <= 0) return;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const list = await api.getRunners();
        if (!isLive.current) return;
        const record = Array.isArray(list) ? list.find((r) => r?.runnerId === runnerId) : null;
        if (record) {
          setRunners((prev) => mergeRunnerRecord({ previousRunners: prev, incomingRecord: record }));
          if (record.updateStatus?.state === 'failed' && typeof onFailedUpdate === 'function') {
            onFailedUpdate(record.updateStatus.reason || 'Runner update failed.');
            return;
          }
        }
      } catch {
        // A failed poll is best-effort only: the next round retries, and
        // the screen keeps its last good roster either way.
      }
      if (isLive.current && tries < rounds) {
        refreshTimers.current.push(setTimeout(poll, 2000));
      }
    };
    refreshTimers.current.push(setTimeout(poll, 1500));
  }, []);

  const mutate = useCallback(
    async (runnerId, action) => {
      const key = `${action}:${runnerId}`;
      setBusyKey(key);
      setActionError(null);
      setNotice(null);
      try {
        const call = runRunnerAction({ runnerApi: api, runnerId, action });
        if (!call) {
          setActionError(`Unknown Runner action "${String(action)}" — nothing was changed.`);
          return;
        }
        const res = await call;
        if (action === 'approve' && res?.credential) {
          setFreshCredential({ runnerId, credential: res.credential });
          setCopied(false);
        }
        await loadRunners();
      } catch (err) {
        if (isLive.current) setActionError(err?.message || `Could not ${action} Runner ${runnerId}.`);
      } finally {
        if (isLive.current) {
          setBusyKey(null);
          setRevokeConfirm(null);
        }
      }
    },
    [loadRunners],
  );

  /**
   * MARK: saveConfig
   * @description Saves configuration changes for a specific Runner.
   *   Updates the Runner's operatorConfig on the backend and refreshes the
   *   local state to reflect the changes. Shows a success notification if
   *   provided and handles errors appropriately.
   *
   * @param {string} runnerId - The Runner identifier to update
   * @param {Object} patch - Configuration changes to apply (e.g., { displayName: 'New Name' })
   * @param {string} successNote - Optional success message to display after saving
   * @returns {Promise<boolean>} True if save succeeded, false if it failed
   */
  const saveConfig = useCallback(async (runnerId, patch, successNote) => {
    const key = `config:${runnerId}:${Object.keys(patch).join('+')}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const updated = await api.updateRunnerConfig(runnerId, patch);
      const nextConfig = updated?.operatorConfig || defaultRunnerConfig(updated || {});
      setRunners((prev) =>
        Array.isArray(prev)
          ? prev.map((r) => (r.runnerId === runnerId ? { ...r, operatorConfig: nextConfig } : r))
          : prev,
      );
      if (successNote && isLive.current) setNotice(successNote);
      return true;
    } catch (err) {
      if (isLive.current) setActionError(err?.message || `Could not save Runner ${runnerId} settings.`);
      return false;
    } finally {
      if (isLive.current) setBusyKey(null);
    }
  }, []);

  const reloadSelected = useCallback(async () => {
    if (!selectedId) return;
    setBusyKey(`reload:${selectedId}`);
    setActionError(null);
    try {
      const record = await api.getRunnerConfig(selectedId);
      if (!isLive.current) return;
      const nextConfig = record?.operatorConfig || defaultRunnerConfig(record || {});
      setRunners((prev) =>
        mergeRunnerRecord({
          previousRunners: prev,
          incomingRecord: { ...record, operatorConfig: nextConfig },
        }),
      );
      setNameDrafts((prev) => dropDraftFor({ drafts: prev, runnerId: selectedId }));
      setDirDrafts((prev) => dropDraftFor({ drafts: prev, runnerId: selectedId }));
      setNotice('Reloaded Runner settings from the backend.');
    } catch (err) {
      if (!isLive.current) return;
      setActionError(err?.message || `Could not reload Runner ${selectedId}.`);
    } finally {
      if (isLive.current) setBusyKey(null);
    }
  }, [selectedId]);

  if (runners === null && !loadError) {
    return (
      <div className="py-6 text-xs text-text-muted" data-testid="runner-config-loading">
        Loading Runner registrations…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6 flex flex-col gap-3" data-testid="runner-config-error">
        <p className="text-xs text-text-muted">{loadError}</p>
        <button
          type="button"
          onClick={loadRunners}
          className="self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const visible = visibleRunners(runners);
  const filtered = filterVisibleRunners({ runners: visible, query: filter });
  const selected = visible.find((r) => r.runnerId === selectedId) || null;
  const pending = visible.filter((r) => r.status === 'pending');
  const config = selected ? defaultRunnerConfig(selected) : null;
  const effectiveModelIds = selected ? effectiveModels(selected) : [];
  const allModelIds = selected ? modelUnion(selected) : [];
  const discoverySummary = selected ? discoveryStatusSummary(selected) : null;
  const sourceSummary = selected ? modelSourceSummary(selected) : null;
  const modelsOverridden = selected ? Array.isArray(config.availableModels) : false;
  // Effective advertisement source: an operator allowlist wins first, then
  // the Runner's own pin-vs-discovery label; old Runners (no source) keep
  // the historic caption.
  const modelsCaption = modelsOverridden
    ? '(operator override)'
    : sourceSummary?.source === 'pinned'
      ? '(pinned on Runner)'
      : sourceSummary?.source === 'pinned+discovered'
        ? '(pinned on Runner + auto-detected)'
        : sourceSummary?.source === 'unpinned'
          ? '(none advertised)'
          : '(auto-detected from Runner)';
  const lastScanLine = sourceSummary?.scannedAtMs != null
    ? `Last scan: ${new Date(sourceSummary.scannedAtMs).toLocaleString()}`
    : null;
  const loadedIds = selected ? loadedProjectIds(selected, projects || []) : [];
  const { available, loaded } = partitionProjects(projects || [], loadedIds);
  const advertised = selected ? advertisedToolIds(selected) : [];
  const enabledTools = selected ? effectiveTools(selected) : [];
  const nameDraft = selected ? (nameDrafts[selected.runnerId] ?? config.displayName ?? '') : '';
  const dirDraft = selected
    ? dirDrafts[selected.runnerId] || null
    : null;
  const displayDirs = selected ? displayDirectories(selected) : null;
  const masterValue = dirDraft ? dirDraft.masterDir : (displayDirs?.masterDir.value || '');
  const worktreeValue = dirDraft ? dirDraft.worktreeDir : (displayDirs?.worktreeDir.value || '');
  const masterIsDefault = displayDirs ? displayDirs.masterDir.isDefault : true;
  const worktreeIsDefault = displayDirs ? displayDirs.worktreeDir.isDefault : true;
  const masterIsUnknown = displayDirs ? displayDirs.masterDir.isUnknown : false;
  const worktreeIsUnknown = displayDirs ? displayDirs.worktreeDir.isUnknown : false;
  const nameDirty = selected && String(nameDraft).trim() !== String(config.displayName ?? '');
  const selectedCommands = selected ? runnerCommands(selected) : { pending: [], results: {}, supported: [] };
  const pendingName = (entry) => (typeof entry === 'string' ? entry : entry?.command);
  const redetectPending = selectedCommands.pending.some((p) => pendingName(p) === 'requestModelRediscovery');
  const redetectResult = selectedCommands.results.requestModelRediscovery || null;
  const updatePending = selectedCommands.pending.some((p) => pendingName(p) === 'requestUpdate');
  const updateResult = selectedCommands.results.requestUpdate || null;
  const selectedBusy = selected ? Boolean(assignments[selected.runnerId]) : false;
  // R1: the buttons queue backend-to-Runner commands, so they work only on
  // active Runners that advertise support — anything else gets a disabled
  // button plus visible guidance, never a dead control.
  const redetectReady = selected ? selected.status === 'active' && canRequestRediscovery(selected) : false;
  const updateReady = selected ? selected.status === 'active' && canRequestUpdate(selected) : false;
  const commandDisabledReason = (supported) => {
    if (!selected) return '';
    if (selected.status !== 'active') return `Needs an active Runner (this one is ${selected.status || 'unknown'}).`;
    if (!supported) return 'This Runner is too old for on-request commands — update the Runner to enable this.';
    return '';
  };
  const updateTitle = !updateReady
    ? `Update now is unavailable: ${commandDisabledReason(canRequestUpdate(selected))}`
    : selectedBusy
      ? 'Runner is busy — the update queues and applies when idle.'
      : (selected.recommendedVersion ? `Update to ${selected.recommendedVersion} (applies when idle)` : 'Update now (applies when idle)');
  const redetectTitle = redetectReady
    ? 'Ask the Runner to scan for models again'
    : `Re-detection is unavailable: ${commandDisabledReason(canRequestRediscovery(selected))}`;
  const redetectStatusLine = redetectPending
    ? 'Re-detection queued — the Runner refreshes on its next heartbeat.'
    : redetectResult
      ? (redetectResult.ok
        ? `Last re-detection: ${redetectResult.detail || 'done'}`
        : `Re-detection failed: ${redetectResult.detail || 'unknown error'}`)
      : (!redetectReady ? redetectTitle : null);
  const updateStatusLine = updatePending
    ? 'Update queued — applies when the Runner is idle.'
    : updateResult
      ? (updateResult.ok
        ? `Last update: ${updateResult.detail || 'done'}`
        : `Update failed: ${updateResult.detail || 'unknown error'}`)
      : (!updateReady
        ? (selected && selected.status !== 'active'
          ? updateTitle
          : 'This Runner is too old to update on request — update it manually.')
        : 'Updates apply when the Runner is idle — running work is never interrupted.');

  /***
   * MARK: handleNameSave
   * @description Saves the Runner display-name draft; a blank draft clears
   *   the name back to the Runner id. Drafts survive failed saves so the
   *   operator never loses typed text to a network error.
   ***/
  const handleNameSave = () => {
    if (!selected || !nameDirty) return;
    const trimmed = String(nameDraft).trim();
    const patch = trimmed ? { displayName: trimmed } : { displayName: null };
    const note = trimmed ? 'Runner name saved.' : 'Runner name reset to the Runner id.';
    void saveConfig(selected.runnerId, patch, note).then((ok) => {
      if (ok && isLive.current) {
        setNameDrafts((prev) => dropDraftFor({ drafts: prev, runnerId: selected.runnerId }));
      }
    });
  };

  /***
   * MARK: handleDirectorySave
   * @description Validates then saves one directory field. Inline errors
   *   block the network call; drafts survive failed saves.
   ***/
  const handleDirectorySave = (field) => {
    if (!selected) return;
    if (field !== 'masterDir' && field !== 'worktreeDir') return;
    const value = String(field === 'masterDir' ? masterValue : worktreeValue).trim();
    const errMsg = validateSingleDirectory(value);
    const confirmKey = `${selected.runnerId}:${field}`;
    if (errMsg) {
      setDirErrors((prev) => ({ ...prev, [confirmKey]: errMsg }));
      return;
    }
    void saveConfig(selected.runnerId, { directories: { [field]: value } }, 'Directory saved.').then((saved) => {
      if (saved && isLive.current) {
        setDirDrafts((prev) => dropDraftFor({ drafts: prev, runnerId: selected.runnerId }));
        setDirErrors((prev) => {
          const next = { ...prev };
          delete next[confirmKey];
          return next;
        });
      }
    });
  };

  /***
   * MARK: handleDirectoryType
   * @description Merges one directory keystroke over the live draft, so a
   *   fast Master-then-Worktree edit keeps both fields. Also clears that
   *   field's inline error while the operator retypes.
   ***/
  const handleDirectoryType = (field, value) => {
    if (!selected || (field !== 'masterDir' && field !== 'worktreeDir')) return;
    const confirmKey = `${selected.runnerId}:${field}`;
    setDirErrors((prev) => {
      if (!(confirmKey in prev)) return prev;
      const next = { ...prev };
      delete next[confirmKey];
      return next;
    });
    const fallbackDirs = {
      masterDir: displayDirs?.masterDir.value || '',
      worktreeDir: displayDirs?.worktreeDir.value || '',
    };
    setDirDrafts((prev) => ({
      ...prev,
      [selected.runnerId]: buildDirectoryDraft({
        previousDraft: prev[selected.runnerId] || null,
        fallbackDirs,
        field,
        value,
      }),
    }));
  };

  /**
   * MARK: handleToolToggle
   * @description Toggles a harness/tool availability for the selected Runner.
   *   When checked, adds the tool to the Runner's available tools list;
   *   when unchecked, removes it. Changes are saved to the backend immediately.
   *
   * @param {string} toolId - The harness/tool identifier to toggle
   * @param {boolean} checked - Whether the tool should be enabled
   */
  const handleToolToggle = (toolId, checked) => {
    if (!selected) return;
    const next = checked ? [...new Set([...enabledTools, toolId])] : enabledTools.filter((t) => t !== toolId);
    void saveConfig(selected.runnerId, { availableTools: next }, 'Available tools saved.');
  };

  /**
   * MARK: handleModelToggle
   * @description Toggles a model's availability for the selected Runner.
   *   When checked, adds the model to the Runner's effective model list;
   *   when unchecked, removes it. If all advertised models are selected,
   *   the configuration is reset to null to use advertised models.
   *
   * @param {string} modelId - The model identifier to toggle
   * @param {boolean} checked - Whether the model should be enabled
   */
  const handleModelToggle = (modelId, checked) => {
    if (!selected) return;
    const set = new Set(effectiveModelIds);
    if (checked) set.add(modelId);
    else set.delete(modelId);
    const next = [...set];
    const patchVal = modelTogglePatch(selected, next);
    void saveConfig(selected.runnerId, { availableModels: patchVal }, patchVal === null ? 'Models reset to advertised.' : 'Models saved.').then(() => {});
  };

  /**
   * MARK: handleCustomModelAdd
   * @description Adds one hand-typed model id to the Runner's model allowlist.
   *   Normalizes the input (trims, validates format), ignores blank or invalid
   *   ids, and saves the updated model list. Clears the input field on success.
   */
  const handleCustomModelAdd = () => {
    if (!selected) return;
    const cleaned = normalizeModelId({ value: customModel });
    if (!cleaned) return;
    const set = new Set(effectiveModelIds);
    set.add(cleaned);
    const next = [...set];
    const patchVal = modelTogglePatch(selected, next);
    void saveConfig(selected.runnerId, { availableModels: patchVal }, 'Models saved.').then((ok) => {
      if (ok && isLive.current) setCustomModel('');
    });
  };

  /**
   * MARK: handleModelsReset
   * @description Resets the Runner's model configuration to use only the
   *   models auto-detected by the Runner itself. Clears any operator overrides
   *   and allows the Runner to match tasks based on its advertised capabilities.
   */
  const handleModelsReset = () => {
    if (!selected) return;
    void saveConfig(selected.runnerId, { availableModels: null }, 'Models reset — this Runner matches its advertised models again.').then(() => {});
  };

  /**
   * MARK: handleRediscover
   * @description Triggers model re-detection on the selected Runner's backend.
   *   Queues the request and then polls the Runner status multiple times to
   *   refresh the model list without requiring a manual page reload.
   *   Shows status messages indicating queuing or any errors that occur.
   */
  const handleRediscover = async () => {
    if (!selected) return;
    const key = `rediscover:${selected.runnerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await api.requestModelRediscovery(selected.runnerId);
      if (!isLive.current) return;
      setNotice('Re-detection queued — Runner will refresh on next heartbeat.');
      queueRunnerRefresh({ runnerId: selected.runnerId, rounds: 3 });
    } catch (err) {
      if (!isLive.current) return;
      setActionError(err?.message || 'Could not queue re-detection.');
    } finally {
      if (isLive.current) setBusyKey(null);
    }
  };

  /**
   * MARK: handleUpdateNow
   * @description Initiates an immediate update of the selected Runner to its
   *   recommended version (if available). The update is queued on the backend
   *   and only applies when the Runner is idle (not executing tasks). Polls the
   *   Runner status to show progress and surface any errors that occur during
   *   the update process.
   *
   * @returns {Promise<void>} Resolves when complete
   */
  const handleUpdateNow = async () => {
    if (!selected) return;
    const key = `update:${selected.runnerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await api.requestRunnerUpdate(selected.runnerId);
      if (!isLive.current) return;
      setNotice('Update queued — Runner will update when idle.');
      queueRunnerRefresh({
        runnerId: selected.runnerId,
        rounds: 5,
        onFailedUpdate: (reason) => {
          if (isLive.current) setActionError(reason);
        },
      });
    } catch (err) {
      if (!isLive.current) return;
      setActionError(err?.message || 'Could not queue update.');
    } finally {
      if (isLive.current) setBusyKey(null);
    }
  };

  const handleJobToggle = (jobKey, checked) => {
    if (!selected) return;
    void saveConfig(selected.runnerId, { jobTypes: { [jobKey]: checked } }, 'Job type saved.');
  };

  const handleProjectMove = (projectId, direction) => {
    if (!selected) return;
    const next = direction === 'load' ? withProjectLoaded(loadedIds, projectId) : withProjectUnloaded(loadedIds, projectId);
    void saveConfig(selected.runnerId, { projectScope: scopePatchForLoaded(next, projects || []) }, direction === 'load' ? 'Project loaded.' : 'Project unloaded.');
  };

  return (
    <section aria-label="Runner configuration" data-testid="runner-configuration-section">
      <h2 className="mt-6 text-lg font-bold uppercase tracking-tight text-text-high flex items-center gap-2 font-headline-md">
        Runners
      </h2>
      <p className="mt-2 text-xs text-text-muted">
        Out-of-process task executors (runner-only: every agent stage runs on a Runner). A Runner
        joins with the operator join token set as KAINBAIN_RUNNER_JOIN_TOKEN on the backend, waits
        here for approval, then heartbeats and claims tasks with its own credential.
      </p>
      <RunnerHarnessPanel runners={runners || []} />
      {quarantined.length > 0 && (
        <div
          className="mt-3 px-3 py-2 bg-surface-container border border-warning/40 rounded-sm"
          data-testid="runner-quarantined-models"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-warning">
            Quarantined model ids ({quarantined.length}) — malformed Runner advertisements,
            never served to pickers
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {quarantined.map((entry) => (
              <li
                key={entry.id}
                className="text-[11px] text-text-muted"
                data-testid={`runner-quarantined-${entry.id}`}
                title={typeof entry.reason === 'string' ? entry.reason : undefined}
              >
                <span className="font-mono text-on-surface">{entry.id}</span>
                {typeof entry.reason === 'string' && entry.reason ? ` — ${entry.reason}` : ''}
                {Array.isArray(entry.runnerIds) && entry.runnerIds.length > 0
                  ? ` (from ${entry.runnerIds.join(', ')})`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {scheduler && (
        <p className="mt-1 text-[10px] font-mono text-text-muted" data-testid="runner-scheduler-deferrals">
          Scheduler: {scheduler.dispatched ?? 0} embedded dispatches, {scheduler.deferredDispatch ?? 0} deferred to Runners
          {scheduler.lastOutcome ? ` (last: ${scheduler.lastOutcome})` : ''}.
        </p>
      )}
      {actionError && (
        <p className="mt-2 text-xs text-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="mt-2 text-xs text-text-muted" role="status" data-testid="runner-config-notice">
          {notice}
        </p>
      )}
      {freshCredential && (
        <div className="mt-3 px-3 py-2 bg-surface-container border border-border-standard rounded-sm" data-testid="runner-credential-once">
          <p className="text-xs text-on-surface">
            Runner {freshCredential.runnerId} approved — it collects this one-time credential by itself within a minute, no paste needed. If it asks for a paste instead, copy this value into KAINBAIN_RUNNER_CREDENTIAL — it is never shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-on-surface break-all" data-testid="runner-credential-value">
              {freshCredential.credential}
            </span>
            <button type="button" onClick={async () => setCopied(await copyToClipboard(freshCredential.credential))} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={() => setFreshCredential(null)} aria-label="Dismiss credential" className="px-3 py-1.5 min-h-[44px] text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="py-4 text-xs text-text-muted" data-testid="runner-config-empty">
          No Runner registrations yet. Boot a Runner pointed at this backend and its join request will appear here.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 items-start gap-3 md:grid-cols-[240px_minmax(0,1fr)]" data-testid="runner-layout">
          <div className="flex flex-col gap-2">
            {visible.length > 4 && (
              <input
                type="text"
                placeholder="Filter runners…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                data-testid="runner-filter"
                className="px-2 py-1.5 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface outline-none focus:border-primary"
              />
            )}
            <ul className="flex flex-col gap-2" data-testid="runner-roster" role="listbox" aria-label="Runners">
              {filtered.map((runner) => {
                const isSelected = runner.runnerId === selectedId;
                const assignment = assignments[runner.runnerId];
                const versionLabel = describeRunnerVersion(runner);
                const stale = nowMs ? stalenessLabel(runner, nowMs) : null;
                return (
                  <li
                    key={runner.runnerId}
                    data-testid={`runner-row-${runner.runnerId}`}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    title={`Click to configure ${runnerDisplayName(runner)}`}
                    onClick={() => setSelectedId(runner.runnerId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(runner.runnerId);
                      }
                    }}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-container border rounded-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? 'border-primary' : 'border-border-standard'} hover:border-primary/50 transition-colors`}
                  >
                    <span className="text-xs font-mono text-on-surface underline decoration-dotted underline-offset-4 hover:decoration-solid">
                      {runnerDisplayName(runner)}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted" data-testid={`runner-status-${runner.runnerId}`}>
                      {runnerStatusLabel(runner)}
                    </span>
                    {runner.status === 'active' && runner.paused && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-warning" data-testid={`runner-paused-${runner.runnerId}`} title="Paused: this Runner finishes in-flight work but takes no new tasks">paused</span>
                    )}
                    {stale && runner.status === 'active' && (
                      <span className="text-[10px] font-mono text-text-muted" title={`Last seen ${runner.lastSeenAt}`}>
                        {stale}
                      </span>
                    )}
                    {assignment && (
                      <span className="text-[10px] font-mono text-text-muted" data-testid={`runner-assignment-${runner.runnerId}`}>
                        Running task {String(assignment.taskId).slice(0, 8)} · {assignment.stageId || '…'} · {nowMs == null ? '…' : formatRunnerElapsed(assignment.startedAt, nowMs)}
                      </span>
                    )}
                    {versionLabel && (
                      <span className="text-[10px] font-mono text-text-muted" data-testid={`runner-version-${runner.runnerId}`}>v{versionLabel}</span>
                    )}
                    {runner.updateAvailable && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-warning" data-testid={`runner-update-available-${runner.runnerId}`} title={runner.recommendedVersion ? `Runner ${runner.runnerId} can update to ${runner.recommendedVersion}` : `Runner ${runner.runnerId} has an update available`}>update available</span>
                    )}
                    {runner.belowMinimum && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-error" data-testid={`runner-below-minimum-${runner.runnerId}`} title={runner.minimumVersion ? `Runner ${runner.runnerId} is below minimum ${runner.minimumVersion}` : `Below minimum version`}>below minimum</span>
                    )}
                    {runner.updateStatus?.state === 'failed' && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-error" data-testid={`runner-update-failed-${runner.runnerId}`} title={`Last self-update failed: ${runner.updateStatus.reason || 'unknown'} — see docs/runner-update-runbook.md “runner says out of date” triage`}>update failed</span>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && visible.length > 0 && (
                <li className="text-xs text-text-muted py-2">No runners match “{filter}”.</li>
              )}
            </ul>
          </div>
          {selected ? (
            <div className="px-3 py-3 bg-surface-container border border-border-standard rounded-sm flex flex-col gap-4" data-testid={`runner-detail-${selected.runnerId}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-on-surface">{runnerDisplayName(selected)}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted" data-testid={`runner-detail-status-${selected.runnerId}`}>
                  {runnerStatusLabel(selected)}
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {selected.status === 'pending' ? (
                    <>
                      <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'approve')} aria-label={`Approve runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-primary hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-all cursor-pointer disabled:opacity-60">Approve</button>
                      <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'deny')} aria-label={`Deny runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Deny</button>
                    </>
                  ) : selected.status === 'denied' ? (
                    <>
                      <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'approve')} aria-label={`Approve runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-primary hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-all cursor-pointer disabled:opacity-60">Approve</button>
                      <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'revoke')} aria-label={`Revoke runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Revoke</button>
                    </>
                  ) : (
                    selected.status === 'active' && (
                      <>
                        {selected.paused ? (
                          <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'resume')} aria-label={`Resume runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Resume</button>
                        ) : (
                          <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(selected.runnerId, 'pause')} aria-label={`Pause runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Pause</button>
                        )}
                        {revokeConfirm === selected.runnerId ? (
                          <span className="flex items-center gap-1">
                            <button type="button" data-testid={`runner-revoke-confirm-${selected.runnerId}`} onClick={() => mutate(selected.runnerId, 'revoke')} disabled={Boolean(busyKey)} className="px-3 py-1.5 min-h-[44px] bg-error text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm cursor-pointer">Confirm revoke</button>
                            <button type="button" onClick={() => setRevokeConfirm(null)} className="px-2 py-1.5 text-xs text-text-muted cursor-pointer">Cancel</button>
                          </span>
                        ) : (
                          <button type="button" disabled={Boolean(busyKey)} onClick={() => setRevokeConfirm(selected.runnerId)} aria-label={`Revoke runner ${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Revoke</button>
                        )}
                      </>
                    )
                  )}
                  {selected.updateAvailable && (
                    <button type="button" data-testid={`runner-update-now-${selected.runnerId}`} onClick={handleUpdateNow} disabled={busyKey === `update:${selected.runnerId}` || !updateReady} title={updateTitle} className="px-3 py-1.5 min-h-[44px] bg-warning hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">
                      {busyKey === `update:${selected.runnerId}` ? 'Updating…' : 'Update Runner'}
                    </button>
                  )}
                  <button type="button" onClick={reloadSelected} disabled={busyKey === `reload:${selected.runnerId}`} data-testid={`runner-reload-${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60" title="Reload configuration from backend">Reload</button>
                </div>
              </div>
              {selected.updateAvailable && (
                <p
                  className={`text-[11px] ${updateResult && !updateResult.ok ? 'text-error' : 'text-text-muted'}`}
                  role={updateResult && !updateResult.ok ? 'alert' : 'status'}
                  data-testid={`runner-update-status-${selected.runnerId}`}
                >
                  {updateStatusLine}
                </p>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-on-surface" htmlFor={`runner-name-${selected.runnerId}`}>Runner Name:</label>
                <div className="flex items-center gap-2">
                  <input id={`runner-name-${selected.runnerId}`} type="text" data-testid={`runner-name-${selected.runnerId}`} value={nameDraft} maxLength={128} placeholder={selected.runnerId} onChange={(e) => setNameDrafts((prev) => ({ ...prev, [selected.runnerId]: e.target.value }))} className="flex-1 min-w-0 max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors" />
                  <button type="button" data-testid={`runner-name-save-${selected.runnerId}`} onClick={handleNameSave} disabled={!nameDirty || Boolean(busyKey)} className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0">Save</button>
                </div>
                <p className="text-[11px] text-text-muted">Clear the name and Save to fall back to the Runner id.</p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-on-surface" id={`projects-label-${selected.runnerId}`}>Projects</span>
                {projectsError ? (
                  <p className="text-[11px] text-text-muted" data-testid="runner-projects-error">{projectsError}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={`projects-label-${selected.runnerId}`}>
                    <div className="flex flex-col gap-1 px-2 py-2 bg-surface-deep border border-border-standard rounded-sm">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Available</span>
                      {available.length === 0 && <span className="text-[11px] text-text-muted">None</span>}
                      {available.map((project) => (
                        <div key={project.id} className="flex items-center gap-2">
                          <span className="text-xs text-on-surface truncate">{project.name || project.id}</span>
                          <button type="button" data-testid={`runner-load-project-${project.id}`} aria-label={`Load project ${project.name || project.id}`} onClick={() => handleProjectMove(project.id, 'load')} disabled={Boolean(busyKey)} className="ml-auto text-xs text-primary underline underline-offset-2 cursor-pointer disabled:opacity-60">Load →</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 px-2 py-2 bg-surface-deep border border-border-standard rounded-sm">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Loaded</span>
                      {loaded.length === 0 && <span className="text-[11px] text-text-muted">None</span>}
                      {loaded.map((project) => (
                        <div key={project.id} className="flex items-center gap-2">
                          <button type="button" data-testid={`runner-unload-project-${project.id}`} aria-label={`Unload project ${project.name || project.id}`} onClick={() => handleProjectMove(project.id, 'unload')} disabled={Boolean(busyKey)} className="text-xs text-primary underline underline-offset-2 cursor-pointer disabled:opacity-60">← Unload</button>
                          <span className="text-xs text-on-surface truncate">{project.name || project.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-text-muted">Loading makes the project active for this Runner. Unloading parks it back to Available.</p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-on-surface" id={`tools-label-${selected.runnerId}`}>Harnesses Available</span>
                {advertised.length === 0 ? (
                  <p className="text-[11px] text-text-muted" data-testid="runner-tools-empty">This Runner has not advertised any tools yet.</p>
                ) : (
                  <div className="flex items-center gap-4 flex-wrap" role="group" aria-labelledby={`tools-label-${selected.runnerId}`}>
                    {advertised.map((toolId) => (
                      <label key={toolId} className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface">
                        <input type="checkbox" data-testid={`runner-tool-${selected.runnerId}-${toolId}`} checked={enabledTools.includes(toolId)} onChange={(e) => handleToolToggle(toolId, e.target.checked)} disabled={Boolean(busyKey)} className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer" />
                        <span>{toolId}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-on-surface">Models</span>
                  <span className="text-[11px] text-text-muted">{modelsCaption}</span>
                  <button type="button" data-testid={`runner-redetect-models-${selected.runnerId}`} onClick={handleRediscover} disabled={busyKey === `rediscover:${selected.runnerId}` || !redetectReady} title={redetectTitle} className="ml-auto px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">
                    {busyKey === `rediscover:${selected.runnerId}` ? 'Queued…' : 'Re-detect models'}
                  </button>
                </div>
                {redetectStatusLine && (
                  <p
                    className={`text-[11px] ${redetectResult && !redetectResult.ok ? 'text-error' : 'text-text-muted'}`}
                    role={redetectResult && !redetectResult.ok ? 'alert' : 'status'}
                    data-testid={`runner-redetect-status-${selected.runnerId}`}
                  >
                    {redetectStatusLine}
                  </p>
                )}
                {discoverySummary && (
                  <p
                    className="text-[11px] text-text-muted"
                    data-testid={`runner-discovery-status-${selected.runnerId}`}
                  >
                    {`Auto-detect: ${discoverySummary.counts}`}
                  </p>
                )}
                {lastScanLine && (
                  <p
                    className="text-[11px] text-text-muted"
                    data-testid={`runner-last-scan-${selected.runnerId}`}
                  >
                    {lastScanLine}
                  </p>
                )}
                {discoverySummary?.warning && (
                  <p
                    className="text-[11px] text-warning"
                    role="status"
                    data-testid={`runner-discovery-warning-${selected.runnerId}`}
                  >
                    {discoverySummary.warning}
                  </p>
                )}
                {allModelIds.length === 0 ? (
                  <p className="text-[11px] text-text-muted" data-testid={`runner-models-empty-${selected.runnerId}`}>No models auto-detected. Use Re-detect to scan for models or add a custom model id below.</p>
                ) : (
                  <div className="flex flex-col gap-1" role="group" aria-label="Models" data-testid={`runner-models-list-${selected.runnerId}`}>
                    {allModelIds.map((mid) => (
                      <label key={mid} className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface">
                        <input type="checkbox" data-testid={`runner-model-${selected.runnerId}-${mid}`} checked={effectiveModelIds.includes(mid)} onChange={(e) => handleModelToggle(mid, e.target.checked)} disabled={Boolean(busyKey)} className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer" />
                        <span className="font-mono text-[11px] break-all">{mid}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label htmlFor={`runner-custom-model-${selected.runnerId}`} className="text-xs font-bold text-on-surface">Add custom model:</label>
                  <input id={`runner-custom-model-${selected.runnerId}`} type="text" data-testid={`runner-custom-model-${selected.runnerId}`} value={customModel} placeholder="model-id" onChange={(e) => setCustomModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomModelAdd(); }}} className="flex-1 min-w-0 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors" />
                  <button type="button" data-testid={`runner-add-model-${selected.runnerId}`} onClick={handleCustomModelAdd} disabled={!customModel.trim() || Boolean(busyKey)} className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0">Add</button>
                  {modelsOverridden && (
                    <button type="button" data-testid={`runner-models-reset-${selected.runnerId}`} onClick={handleModelsReset} disabled={Boolean(busyKey)} className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0">Reset to auto-detected</button>
                  )}
                </div>
                <p className="text-[11px] text-text-muted" data-testid={`runner-models-effective-${selected.runnerId}`}>
                  {effectiveModelIds.length === 0 ? 'No models selected: this Runner will only match tasks that do not require specific models.' : `Selected models: ${effectiveModelIds.join(', ')}`}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <DirectoryField label="Master directory:" testId={`runner-masterdir-${selected.runnerId}`} value={masterValue} hint={displayDirs?.masterDir.value || '/srv/kb'} isDefault={masterIsDefault && !dirDraft} isUnknown={masterIsUnknown} error={dirErrors[`${selected.runnerId}:masterDir`]} busy={Boolean(busyKey)} onChange={(value) => handleDirectoryType('masterDir', value)} onSave={() => handleDirectorySave('masterDir')} />
                <DirectoryField label="Worktree directory:" testId={`runner-worktreedir-${selected.runnerId}`} value={worktreeValue} hint={displayDirs?.worktreeDir.value || '/srv/kb-trees'} isDefault={worktreeIsDefault && !dirDraft} isUnknown={worktreeIsUnknown} error={dirErrors[`${selected.runnerId}:worktreeDir`]} busy={Boolean(busyKey)} onChange={(value) => handleDirectoryType('worktreeDir', value)} onSave={() => handleDirectorySave('worktreeDir')} />
                <p className="text-[11px] text-text-muted">Directories are stored as this Runner's preference on the backend. When empty, the Runner's own folders are used.</p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-on-surface" id={`jobs-label-${selected.runnerId}`}>Job types</span>
                <div className="flex items-center gap-4 flex-wrap" role="group" aria-labelledby={`jobs-label-${selected.runnerId}`}>
                  {jobTypeLabels().map(({ key, label, hint }) => (
                    <label key={key} title={hint} className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface">
                      <input type="checkbox" data-testid={`runner-job-${selected.runnerId}-${key}`} checked={config.jobTypes[key] === true} onChange={(e) => handleJobToggle(key, e.target.checked)} disabled={Boolean(busyKey)} className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted">CI, merge, tool, and project switches are enforced when Runners claim work.</p>
              </div>
            </div>
          ) : (
            <p className="px-3 py-6 text-xs text-text-muted" data-testid="runner-detail-empty">Select a Runner on the left to see its settings.</p>
          )}
        </div>
      )}
      {pending.length > 0 && (
        <p className="mt-2 text-xs text-text-muted" role="status">{pending.length} pending join request{pending.length === 1 ? '' : 's'}.</p>
      )}
    </section>
  );
}
