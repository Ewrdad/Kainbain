import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { copyToClipboard } from '../../services/clipboard';
import { formatRunnerElapsed } from '../observability/widgets/PerRunnerTasksWidget';
import {
  describeMemoryPressure,
  formatMemoryMb,
  groupLiveAssignments,
} from '../observability/widgets/runnerSlots';
import {
  defaultRunnerConfig,
  runnerDisplayName,
  advertisedToolIds,
  advertisedModels,
  effectiveTools,
  effectiveModels,
  parseModelsInput,
  loadedProjectIds,
  partitionProjects,
  withProjectLoaded,
  withProjectUnloaded,
  scopePatchForLoaded,
  validateDirectories,
  jobTypeLabels,
  visibleRunners,
  resolveSelectedId,
  runRunnerAction,
  describeRunnerVersion,
} from './runnerConfigHelpers';

const DirectoryField = ({ label, testId, value, error, busy, confirmArmed, onChange, onSave }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold text-on-surface" htmlFor={`${testId}-input`}>
      {label}
    </label>
    <div className="flex items-center gap-2">
      <input
        id={`${testId}-input`}
        type="text"
        data-testid={testId}
        value={value}
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
        {confirmArmed ? 'Sure?' : 'Save'}
      </button>
    </div>
    {confirmArmed && (
      <p className="text-[11px] text-warning" data-testid={`${testId}-confirm`}>
        Saved on the backend as this Runner&apos;s directory preference. It is not sent to the
        Runner yet, so the Runner keeps using its own folders until that wiring lands. Click Save
        again to confirm.
      </p>
    )}
    {error && (
      <p className="text-[11px] text-error" role="alert" data-testid={`${testId}-error`}>
        {error}
      </p>
    )}
  </div>
);

/***
 * MARK: RunnerConfigurationSection
 * @description System Settings › Runners › detailed Runner configuration:
 *   a side-by-side panel with the visible Runner roster on the left and
 *   the selected Runner's settings on the right. Revoked Runners are
 *   hidden completely (no row, no detail panel, no selection); the left
 *   list shows active (including paused), pending ("Needs setup"), and
 *   denied registrations. The right panel carries the contextual actions
 *   (approve/deny for join requests, pause/resume/revoke for active
 *   Runners) plus a configuration form for the selected Runner — display
 *   name, Available/Loaded project picker, available-tool checkboxes,
 *   Models editor (operator allowlist replacing the advertised list),
 *   Master/Worktree directory editors with save confirmation, and Runs
 *   CI / Runs merges / Runs Impromptu switches. Operator choices persist
 *   per Runner via `PATCH /runners/:id/config` and heartbeats never
 *   overwrite them. Credential values are never rendered (the approve
 *   response carries the single one-time copy). Fail-safe: unknown action
 *   names are refused with no endpoint called (never a fall-through
 *   revoke), and a selection that goes stale without a roster reload
 *   renders guidance instead of a hidden record or a blank panel.
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
  const [modelDrafts, setModelDrafts] = useState({});
  const [dirDrafts, setDirDrafts] = useState({});
  const [dirConfirm, setDirConfirm] = useState(null);
  const [dirErrors, setDirErrors] = useState({});
  const [nowMs, setNowMs] = useState(null);

  const loadRunners = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getRunners();
      const rows = Array.isArray(list) ? list : [];
      setRunners(rows);
      // Revoked registrations stay in state (the backend record is intact)
      // but never render: selection resolves against the visible roster so
      // a revoked Runner can neither auto-select nor linger selected.
      setSelectedId((prev) => resolveSelectedId(visibleRunners(rows), prev));
      try {
        const monitor = await api.getRunnerMonitor();
        // One slot per Runner (shared grouping helper): a Runner holding
        // two leases renders its single current task plus a warning, never
        // two live rows.
        const byRunner = {};
        for (const slot of groupLiveAssignments(
          monitor?.liveAssignments,
          monitor?.runnerLoad,
        )) {
          byRunner[slot.runnerId] = slot;
        }
        setAssignments(byRunner);
        setScheduler(monitor?.scheduler || null);
        setNowMs(Date.now());
      } catch {
        setAssignments({});
        setScheduler(null);
      }
      try {
        const fetched = await api.listProjects();
        setProjects(Array.isArray(fetched) ? fetched : fetched?.projects || []);
        setProjectsError(null);
      } catch {
        setProjects([]);
        setProjectsError('Could not load projects — the picker is unavailable.');
      }
    } catch (err) {
      setRunners(null);
      setLoadError(err?.message || 'Could not load Runner registrations.');
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadRunners());
  }, [loadRunners]);

  const mutate = useCallback(
    async (runnerId, action) => {
      const key = `${action}:${runnerId}`;
      setBusyKey(key);
      setActionError(null);
      setNotice(null);
      try {
        // The dispatch refuses unknown action names (null, no endpoint
        // called) instead of falling through to revoke: a typo must never
        // destroy a Runner, and the operator sees plainly that nothing ran.
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
        setActionError(err?.message || `Could not ${action} Runner ${runnerId}.`);
      } finally {
        setBusyKey(null);
      }
    },
    [loadRunners],
  );

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
      if (successNote) setNotice(successNote);
      return true;
    } catch (err) {
      setActionError(err?.message || `Could not save Runner ${runnerId} settings.`);
      return false;
    } finally {
      setBusyKey(null);
    }
  }, []);

  const reloadSelected = useCallback(async () => {
    if (!selectedId) return;
    setBusyKey(`reload:${selectedId}`);
    setActionError(null);
    try {
      const record = await api.getRunnerConfig(selectedId);
      const nextConfig = record?.operatorConfig || defaultRunnerConfig(record || {});
      setRunners((prev) =>
        Array.isArray(prev)
          ? prev.map((r) =>
              r.runnerId === selectedId ? { ...r, ...record, operatorConfig: nextConfig } : r,
            )
          : prev,
      );
      setNameDrafts((prev) => {
        const next = { ...prev };
        // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
        delete next[selectedId];
        return next;
      });
      setDirDrafts((prev) => {
        const next = { ...prev };
        // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
        delete next[selectedId];
        return next;
      });
      setModelDrafts((prev) => {
        const next = { ...prev };
        // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
        delete next[selectedId];
        return next;
      });
      setDirConfirm(null);
      setNotice('Reloaded Runner settings from the backend.');
    } catch (err) {
      setActionError(err?.message || `Could not reload Runner ${selectedId}.`);
    } finally {
      setBusyKey(null);
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

  // Frontend-only filter: revoked Runners never render (no row, no detail
  // panel, no selection) while the backend record stays intact for audit.
  const visible = visibleRunners(runners);
  const selected = visible.find((r) => r.runnerId === selectedId) || null;
  const pending = visible.filter((r) => r.status === 'pending');
  const config = selected ? defaultRunnerConfig(selected) : null;
  const advertisedModelIds = selected ? advertisedModels(selected) : [];
  const effectiveModelIds = selected ? effectiveModels(selected) : [];
  const modelsOverridden = selected
    ? Array.isArray(config.availableModels)
    : false;
  const loadedIds = selected ? loadedProjectIds(selected, projects || []) : [];
  const { available, loaded } = partitionProjects(projects || [], loadedIds);
  const advertised = selected ? advertisedToolIds(selected) : [];
  const enabledTools = selected ? effectiveTools(selected) : [];
  const nameDraft = selected ? (nameDrafts[selected.runnerId] ?? config.displayName ?? '') : '';
  const modelDraftText = selected
    // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
    ? (modelDrafts[selected.runnerId] ?? effectiveModelIds.join(', '))
    : '';
  const modelsDirty =
    selected &&
    [...parseModelsInput(modelDraftText)].sort().join(',') !==
      [...effectiveModelIds].sort().join(',');
  const dirDraft = selected
    ? dirDrafts[selected.runnerId] || config.directories
    : { masterDir: '', worktreeDir: '' };
  const nameDirty = selected && String(nameDraft).trim() !== String(config.displayName ?? '');

  const handleNameSave = () => {
    if (!selected || !nameDirty) return;
    const trimmed = String(nameDraft).trim();
    // Clearing the field resets the name: the backend treats
    // `displayName: null` as "fall back to the Runner id", so a custom
    // name is never a dead end with no way back to the default.
    const patch = trimmed ? { displayName: trimmed } : { displayName: null };
    const note = trimmed ? 'Runner name saved.' : 'Runner name reset to the Runner id.';
    void saveConfig(selected.runnerId, patch, note).then((ok) => {
      if (ok) {
        setNameDrafts((prev) => {
          const next = { ...prev };

          delete next[selected.runnerId];
          return next;
        });
      }
    });
  };

  const handleDirectorySave = (field) => {
    if (!selected) return;
    const confirmKey = `${selected.runnerId}:${field}`;
    if (dirConfirm !== confirmKey) {
      setDirConfirm(confirmKey);
      return;
    }
    const { ok, errors } = validateDirectories(dirDraft);
    // eslint-disable-next-line security/detect-object-injection -- field is a fixed directory key
    if (!ok && errors[field]) {
      // eslint-disable-next-line security/detect-object-injection -- field is a fixed directory key
      setDirErrors((prev) => ({ ...prev, [confirmKey]: errors[field] }));
      return;
    }
    // eslint-disable-next-line security/detect-object-injection -- field is a fixed directory key
    const value = String(dirDraft[field] || '').trim();
    void saveConfig(
      selected.runnerId,
      { directories: { [field]: value } },
      'Directory saved.',
    ).then((saved) => {
      if (saved) {
        setDirDrafts((prev) => {
          const next = { ...prev };

          delete next[selected.runnerId];
          return next;
        });
        setDirConfirm(null);
        setDirErrors((prev) => {
          const next = { ...prev };
          // eslint-disable-next-line security/detect-object-injection -- confirm key for this Runner/field
          delete next[confirmKey];
          return next;
        });
      }
    });
  };

  const handleToolToggle = (toolId, checked) => {
    if (!selected) return;
    const next = checked
      ? [...new Set([...enabledTools, toolId])]
      : enabledTools.filter((t) => t !== toolId);
    void saveConfig(selected.runnerId, { availableTools: next }, 'Available tools saved.');
  };

  const handleModelsSave = () => {
    if (!selected) return;
    const next = parseModelsInput(modelDraftText);
    void saveConfig(
      selected.runnerId,
      { availableModels: next },
      'Models saved — this Runner now matches these model ids.',
    ).then((saved) => {
      if (saved) {
        setModelDrafts((prev) => {
          const nextDrafts = { ...prev };
          // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
          delete nextDrafts[selected.runnerId];
          return nextDrafts;
        });
      }
    });
  };

  const handleModelsReset = () => {
    if (!selected) return;
    void saveConfig(
      selected.runnerId,
      { availableModels: null },
      'Models reset — this Runner matches its advertised models again.',
    ).then((saved) => {
      if (saved) {
        setModelDrafts((prev) => {
          const nextDrafts = { ...prev };
          // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
          delete nextDrafts[selected.runnerId];
          return nextDrafts;
        });
      }
    });
  };

  const handleJobToggle = (jobKey, checked) => {
    if (!selected) return;
    void saveConfig(selected.runnerId, { jobTypes: { [jobKey]: checked } }, 'Job type saved.');
  };

  const handleProjectMove = (projectId, direction) => {
    if (!selected) return;
    const next =
      direction === 'load'
        ? withProjectLoaded(loadedIds, projectId)
        : withProjectUnloaded(loadedIds, projectId);
    void saveConfig(
      selected.runnerId,
      { projectScope: scopePatchForLoaded(next, projects || []) },
      direction === 'load' ? 'Project loaded.' : 'Project unloaded.',
    );
  };

  return (
    <section aria-label="Runner configuration" data-testid="runner-configuration-section">
      <h2 className="mt-6 text-lg font-bold uppercase tracking-tight text-text-high flex items-center gap-2 font-headline-md">
        Runners
      </h2>
      <p className="mt-2 text-xs text-text-muted">
        Out-of-process task executors (runner-only: every agent stage runs on a Runner). A Runner
        joins with the operator join token set as KAINBAIN_RUNNER_JOIN_TOKEN on the backend, waits
        here for approval, then heartbeats and claims tasks with its own credential. Select a Runner
        on the left to configure its name, projects, tools, models, directories, and job types.
      </p>
      <p
        className="mt-1 text-[11px] font-mono text-text-muted"
        data-testid="runner-invariant-note"
      >
        One task per Runner: a Busy Runner never takes a second task — waiting work goes to a
        Free Runner instead.
      </p>
      {scheduler && (
        <p
          className="mt-1 text-[10px] font-mono text-text-muted"
          data-testid="runner-scheduler-deferrals"
        >
          Scheduler: {scheduler.dispatched ?? 0} embedded dispatches,{' '}
          {scheduler.deferredDispatch ?? 0} deferred to Runners
          {scheduler.lastOutcome ? ` (last: ${scheduler.lastOutcome})` : ''}.
        </p>
      )}
      {actionError && (
        <p className="mt-2 text-xs text-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p
          className="mt-2 text-xs text-text-muted"
          role="status"
          data-testid="runner-config-notice"
        >
          {notice}
        </p>
      )}
      {freshCredential && (
        <div
          className="mt-3 px-3 py-2 bg-surface-container border border-border-standard rounded-sm"
          data-testid="runner-credential-once"
        >
          <p className="text-xs text-on-surface">
            Runner {freshCredential.runnerId} approved. Paste this one-time credential into its
            environment as KAINBAIN_RUNNER_CREDENTIAL and restart it — it is never shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-mono text-on-surface break-all"
              data-testid="runner-credential-value"
            >
              {freshCredential.credential}
            </span>
            <button
              type="button"
              onClick={async () => {
                // copyToClipboard never throws (false on failure), so the
                // label only flips when the text is really in the clipboard.
                setCopied(await copyToClipboard(freshCredential.credential));
              }}
              className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setFreshCredential(null)}
              aria-label="Dismiss credential"
              className="px-3 py-1.5 min-h-[44px] text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <p className="py-4 text-xs text-text-muted" data-testid="runner-config-empty">
          No Runner registrations yet. Boot a Runner pointed at this backend and its join request
          will appear here.
        </p>
      ) : (
        <div
          className="mt-3 grid grid-cols-1 items-start gap-3 md:grid-cols-[240px_minmax(0,1fr)]"
          data-testid="runner-layout"
        >
          <ul className="flex flex-col gap-2" data-testid="runner-roster">
            {visible.map((runner) => {
              const isSelected = runner.runnerId === selectedId;
              const slot = assignments[runner.runnerId] || null;
              const assignment = slot?.current || null;
              const memory = describeMemoryPressure(runner.facts);
              const extraHolds =
                slot && slot.liveHoldCount > 1 ? slot.liveHoldCount - 1 : 0;
              const versionLabel = describeRunnerVersion(runner);
              return (
                <li
                  key={runner.runnerId}
                  data-testid={`runner-row-${runner.runnerId}`}
                  className={`flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-container border rounded-sm ${
                    isSelected ? 'border-primary' : 'border-border-standard'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(runner.runnerId)}
                    aria-pressed={isSelected}
                    aria-label={`Configure runner ${runner.runnerId}`}
                    data-testid={`runner-select-${runner.runnerId}`}
                    className="text-xs font-mono text-on-surface underline decoration-dotted underline-offset-4 cursor-pointer"
                  >
                    {runnerDisplayName(runner)}
                  </button>
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest text-text-muted"
                    data-testid={`runner-status-${runner.runnerId}`}
                  >
                    {runner.status}
                  </span>
                  {runner.status === 'active' && runner.paused && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest text-warning"
                      data-testid={`runner-paused-${runner.runnerId}`}
                      title="Paused: this Runner finishes in-flight work but takes no new tasks"
                    >
                      paused
                    </span>
                  )}
                  {runner.status === 'active' && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        assignment ? 'text-primary' : 'text-text-muted'
                      }`}
                      data-testid={`runner-busystate-${runner.runnerId}`}
                      title={
                        assignment
                          ? 'Busy: this Runner is executing its one current task'
                          : 'Free: this Runner holds no task and can pick up work'
                      }
                    >
                      {assignment ? 'Busy' : 'Free'}
                    </span>
                  )}
                  {assignment && (
                    <span
                      className="text-[10px] font-mono text-text-muted"
                      data-testid={`runner-assignment-${runner.runnerId}`}
                    >
                      Running task {String(assignment.taskId).slice(0, 8)}
                      {' · '}
                      {assignment.stageId || '…'}
                      {' · '}
                      {nowMs == null ? '…' : formatRunnerElapsed(assignment.startedAt, nowMs)}
                    </span>
                  )}
                  {extraHolds > 0 && (
                    <span
                      className="text-[10px] font-mono text-warning"
                      data-testid={`runner-extras-${runner.runnerId}`}
                      role="alert"
                    >
                      {`+${extraHolds} extra live hold${extraHolds === 1 ? '' : 's'} (fence converging)`}
                    </span>
                  )}
                  {memory && (
                    <span
                      className={`text-[10px] font-mono ${
                        memory.low ? 'text-warning font-bold' : 'text-text-muted'
                      }`}
                      data-testid={`runner-memory-${runner.runnerId}`}
                      title={
                        memory.low
                          ? 'Low free memory on this Runner (display-only — dispatch is fenced to one task per Runner)'
                          : 'Free memory on this Runner (best-effort heartbeat posture)'
                      }
                    >
                      Mem {formatMemoryMb(memory.freeMb)}
                      {memory.low ? ' — low' : ''}
                    </span>
                  )}
                  {versionLabel && (
                    <span
                      className="text-[10px] font-mono text-text-muted"
                      data-testid={`runner-version-${runner.runnerId}`}
                    >
                      v{versionLabel}
                    </span>
                  )}
                  {runner.updateAvailable && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest text-warning"
                      data-testid={`runner-update-available-${runner.runnerId}`}
                      title={
                        runner.recommendedVersion
                          ? `Runner ${runner.runnerId} can update to ${runner.recommendedVersion} (automatic on idle; verified by signature)`
                          : `Runner ${runner.runnerId} has an update available (automatic on idle; verified by signature)`
                      }
                    >
                      update available
                    </span>
                  )}
                  {runner.belowMinimum && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest text-error"
                      data-testid={`runner-below-minimum-${runner.runnerId}`}
                      title={
                        runner.minimumVersion
                          ? `Runner ${runner.runnerId} is below the minimum ${runner.minimumVersion}: dispatch is refused until it updates`
                          : `Runner ${runner.runnerId} is below the minimum version: dispatch is refused until it updates`
                      }
                    >
                      below minimum
                    </span>
                  )}
                  {runner.updateStatus?.state === 'failed' && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest text-error"
                      data-testid={`runner-update-failed-${runner.runnerId}`}
                      title={`Last self-update attempt failed: ${runner.updateStatus.reason || 'unknown reason'}`}
                    >
                      update failed
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div
              className="px-3 py-3 bg-surface-container border border-border-standard rounded-sm flex flex-col gap-4"
              data-testid={`runner-detail-${selected.runnerId}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-on-surface">{runnerDisplayName(selected)}</h3>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest text-text-muted"
                  data-testid={`runner-detail-status-${selected.runnerId}`}
                >
                  {selected.status === 'pending' ? 'Needs setup' : selected.status}
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {selected.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => mutate(selected.runnerId, 'approve')}
                        aria-label={`Approve runner ${selected.runnerId}`}
                        className="px-3 py-1.5 min-h-[44px] bg-primary hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-all cursor-pointer disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => mutate(selected.runnerId, 'deny')}
                        aria-label={`Deny runner ${selected.runnerId}`}
                        className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                      >
                        Deny
                      </button>
                    </>
                  ) : selected.status === 'denied' ? (
                    // A denied join request is not a dead end: the operator can
                    // still approve it (backend issues the credential) or park
                    // it terminally with revoke. Deny is not offered here —
                    // denying a denied Runner 409s, so the button would always fail.
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => mutate(selected.runnerId, 'approve')}
                        aria-label={`Approve runner ${selected.runnerId}`}
                        className="px-3 py-1.5 min-h-[44px] bg-primary hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-all cursor-pointer disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => mutate(selected.runnerId, 'revoke')}
                        aria-label={`Revoke runner ${selected.runnerId}`}
                        className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                      >
                        Revoke
                      </button>
                    </>
                  ) : (
                    selected.status === 'active' && (
                      <>
                        {selected.paused ? (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => mutate(selected.runnerId, 'resume')}
                            aria-label={`Resume runner ${selected.runnerId}`}
                            className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => mutate(selected.runnerId, 'pause')}
                            aria-label={`Pause runner ${selected.runnerId}`}
                            className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                          >
                            Pause
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => mutate(selected.runnerId, 'revoke')}
                          aria-label={`Revoke runner ${selected.runnerId}`}
                          className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                        >
                          Revoke
                        </button>
                      </>
                    )
                  )}
                  <button
                    type="button"
                    onClick={reloadSelected}
                    disabled={busyKey === `reload:${selected.runnerId}`}
                    data-testid={`runner-reload-${selected.runnerId}`}
                    className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Reload
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs font-bold text-on-surface"
                  htmlFor={`runner-name-${selected.runnerId}`}
                >
                  Runner Name:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`runner-name-${selected.runnerId}`}
                    type="text"
                    data-testid={`runner-name-${selected.runnerId}`}
                    value={nameDraft}
                    maxLength={128}
                    placeholder={selected.runnerId}
                    onChange={(e) =>
                      setNameDrafts((prev) => ({
                        ...prev,

                        [selected.runnerId]: e.target.value,
                      }))
                    }
                    className="flex-1 min-w-0 max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    data-testid={`runner-name-save-${selected.runnerId}`}
                    onClick={handleNameSave}
                    disabled={!nameDirty || Boolean(busyKey)}
                    className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[11px] text-text-muted">
                  Clear the name and Save to fall back to the Runner id.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-bold text-on-surface"
                  id={`projects-label-${selected.runnerId}`}
                >
                  Projects
                </span>
                {projectsError ? (
                  <p className="text-[11px] text-text-muted" data-testid="runner-projects-error">
                    {projectsError}
                  </p>
                ) : (
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="group"
                    aria-labelledby={`projects-label-${selected.runnerId}`}
                  >
                    <div className="flex flex-col gap-1 px-2 py-2 bg-surface-deep border border-border-standard rounded-sm">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                        Available
                      </span>
                      {available.length === 0 && (
                        <span className="text-[11px] text-text-muted">None</span>
                      )}
                      {available.map((project) => (
                        <div key={project.id} className="flex items-center gap-2">
                          <span className="text-xs text-on-surface truncate">
                            {project.name || project.id}
                          </span>
                          <button
                            type="button"
                            data-testid={`runner-load-project-${project.id}`}
                            aria-label={`Load project ${project.name || project.id}`}
                            onClick={() => handleProjectMove(project.id, 'load')}
                            disabled={Boolean(busyKey)}
                            className="ml-auto text-xs text-primary underline underline-offset-2 cursor-pointer disabled:opacity-60"
                          >
                            Load →
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 px-2 py-2 bg-surface-deep border border-border-standard rounded-sm">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                        Loaded
                      </span>
                      {loaded.length === 0 && (
                        <span className="text-[11px] text-text-muted">None</span>
                      )}
                      {loaded.map((project) => (
                        <div key={project.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`runner-unload-project-${project.id}`}
                            aria-label={`Unload project ${project.name || project.id}`}
                            onClick={() => handleProjectMove(project.id, 'unload')}
                            disabled={Boolean(busyKey)}
                            className="text-xs text-primary underline underline-offset-2 cursor-pointer disabled:opacity-60"
                          >
                            ← Unload
                          </button>
                          <span className="text-xs text-on-surface truncate">
                            {project.name || project.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-text-muted">
                  Loading makes the project active for this Runner. Unloading parks it back to
                  Available.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-bold text-on-surface"
                  id={`tools-label-${selected.runnerId}`}
                >
                  Harnesses Available
                </span>
                {advertised.length === 0 ? (
                  <p className="text-[11px] text-text-muted" data-testid="runner-tools-empty">
                    This Runner has not advertised any tools yet.
                  </p>
                ) : (
                  <div
                    className="flex items-center gap-4 flex-wrap"
                    role="group"
                    aria-labelledby={`tools-label-${selected.runnerId}`}
                  >
                    {advertised.map((toolId) => (
                      <label
                        key={toolId}
                        className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface"
                      >
                        <input
                          type="checkbox"
                          data-testid={`runner-tool-${selected.runnerId}-${toolId}`}
                          checked={enabledTools.includes(toolId)}
                          onChange={(e) => handleToolToggle(toolId, e.target.checked)}
                          disabled={Boolean(busyKey)}
                          className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                        />
                        <span>{toolId}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-bold text-on-surface"
              htmlFor={`runner-models-${selected.runnerId}`}
            >
              Models
              {modelsOverridden ? ' (operator override)' : ' (advertised)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`runner-models-${selected.runnerId}`}
                type="text"
                data-testid={`runner-models-${selected.runnerId}`}
                value={modelDraftText}
                placeholder={
                  advertisedModelIds.length > 0
                    ? advertisedModelIds.join(', ')
                    : 'model-id-1, model-id-2'
                }
                onChange={(e) =>
                  setModelDrafts((prev) => ({
                    ...prev,
                    // eslint-disable-next-line security/detect-object-injection -- key is the selected Runner id
                    [selected.runnerId]: e.target.value,
                  }))
                }
                className="flex-1 min-w-0 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors"
              />
              <button
                type="button"
                data-testid={`runner-models-save-${selected.runnerId}`}
                onClick={handleModelsSave}
                disabled={!modelsDirty || Boolean(busyKey)}
                className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
              >
                Save
              </button>
              {modelsOverridden && (
                <button
                  type="button"
                  data-testid={`runner-models-reset-${selected.runnerId}`}
                  onClick={handleModelsReset}
                  disabled={Boolean(busyKey)}
                  className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
            <p className="text-[11px] text-text-muted" data-testid={`runner-models-effective-${selected.runnerId}`}>
              {effectiveModelIds.length === 0
                ? 'No models: this Runner matches model-less tasks only.'
                : `Effective: ${effectiveModelIds.join(', ')}`}
              {' '}Comma-separated model ids. Saving replaces the advertised
              list for matching, so an under-reporting Runner can serve
              declared models. Reset returns to advertised.
            </p>
          </div>

              <div className="flex flex-col gap-3">
                <DirectoryField
                  label="Master directory:"
                  testId={`runner-masterdir-${selected.runnerId}`}
                  value={dirDraft.masterDir || ''}
                  error={dirErrors[`${selected.runnerId}:masterDir`]}
                  busy={Boolean(busyKey)}
                  confirmArmed={dirConfirm === `${selected.runnerId}:masterDir`}
                  onChange={(value) => {
                    setDirConfirm(null);
                    // Typing clears this field's error: the message describes the
                    // last save attempt, and keeping it while the text changes
                    // reads as if the new text already failed.
                    setDirErrors((prev) => {
                      const next = { ...prev };

                      delete next[`${selected.runnerId}:masterDir`];
                      return next;
                    });
                    setDirDrafts((prev) => ({
                      ...prev,

                      [selected.runnerId]: {
                        masterDir: value,
                        worktreeDir:
                          prev[selected.runnerId]?.worktreeDir ?? config.directories.worktreeDir,
                      },
                    }));
                  }}
                  onSave={() => handleDirectorySave('masterDir')}
                />
                <DirectoryField
                  label="Worktree directory:"
                  testId={`runner-worktreedir-${selected.runnerId}`}
                  value={dirDraft.worktreeDir || ''}
                  error={dirErrors[`${selected.runnerId}:worktreeDir`]}
                  busy={Boolean(busyKey)}
                  confirmArmed={dirConfirm === `${selected.runnerId}:worktreeDir`}
                  onChange={(value) => {
                    setDirConfirm(null);
                    // Typing clears this field's error: the message describes the
                    // last save attempt, and keeping it while the text changes
                    // reads as if the new text already failed.
                    setDirErrors((prev) => {
                      const next = { ...prev };

                      delete next[`${selected.runnerId}:worktreeDir`];
                      return next;
                    });
                    setDirDrafts((prev) => ({
                      ...prev,

                      [selected.runnerId]: {
                        masterDir:
                          prev[selected.runnerId]?.masterDir ?? config.directories.masterDir,
                        worktreeDir: value,
                      },
                    }));
                  }}
                  onSave={() => handleDirectorySave('worktreeDir')}
                />
                <p className="text-[11px] text-text-muted">
                  Directories are stored as this Runner&apos;s preference on the backend. They are
                  not sent to the Runner yet — it keeps using its own folders until that wiring
                  lands.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-bold text-on-surface"
                  id={`jobs-label-${selected.runnerId}`}
                >
                  Job types
                </span>
                <div
                  className="flex items-center gap-4 flex-wrap"
                  role="group"
                  aria-labelledby={`jobs-label-${selected.runnerId}`}
                >
                  {jobTypeLabels().map(({ key, label, hint }) => (
                    <label
                      key={key}
                      title={hint}
                      className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface"
                    >
                      <input
                        type="checkbox"
                        data-testid={`runner-job-${selected.runnerId}-${key}`}
                        checked={
                          // eslint-disable-next-line security/detect-object-injection -- key is a fixed job-type switch name
                          config.jobTypes[key] === true
                        }
                        onChange={(e) => handleJobToggle(key, e.target.checked)}
                        disabled={Boolean(busyKey)}
                        className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted">
                  CI, merge, tool, and project switches are enforced when Runners claim work.
                  Impromptu is recorded for now: live follow-up steers still ride the owning
                  Runner&apos;s heartbeat.
                </p>
              </div>
            </div>
          ) : (
            // Reachable only when the selection goes stale without a roster
            // reload (e.g. another operator revoked the selected Runner and
            // this screen reloaded it): the roster still lists Runners, so
            // the right column guides back to the list instead of rendering
            // a hidden record or a blank panel.
            <p className="px-3 py-6 text-xs text-text-muted" data-testid="runner-detail-empty">
              Select a Runner on the left to see its settings.
            </p>
          )}
        </div>
      )}
      {pending.length > 0 && (
        <p className="mt-2 text-xs text-text-muted" role="status">
          {pending.length} pending join request{pending.length === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}
