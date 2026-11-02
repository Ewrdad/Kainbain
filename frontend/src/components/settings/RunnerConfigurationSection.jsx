import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { copyToClipboard } from '../../services/clipboard';
import { formatRunnerElapsed } from '../observability/widgets/PerRunnerTasksWidget';
import {
  defaultRunnerConfig,
  runnerDisplayName,
  advertisedToolIds,
  advertisedModels,
  effectiveTools,
  effectiveModels,
  effectiveDirectoryValue,
  displayDirectories,
  modelUnion,
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
} from './runnerConfigHelpers';

const DirectoryField = ({ label, testId, value, hint, isDefault, error, busy, onChange, onSave }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold text-on-surface" htmlFor={`${testId}-input`}>
      {label} {isDefault && <span className="font-normal text-text-muted">(Runner default)</span>}
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
 * @description System Settings › Runners › detailed Runner configuration
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

  const loadRunners = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api.getRunners();
      const rows = Array.isArray(list) ? list : [];
      setRunners(rows);
      setSelectedId((prev) => resolveSelectedId(visibleRunners(rows), prev));
      try {
        const monitor = await api.getRunnerMonitor();
        const byRunner = {};
        for (const row of monitor?.liveAssignments || []) {
          if (row && typeof row.runnerId === 'string') byRunner[row.runnerId] = row;
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
        setRevokeConfirm(null);
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
        delete next[selectedId];
        return next;
      });
      setDirDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
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

  const visible = visibleRunners(runners);
  const filtered = filter.trim()
    ? visible.filter((r) => {
        const q = filter.trim().toLowerCase();
        return (
          String(r.runnerId || '').toLowerCase().includes(q) ||
          String(runnerDisplayName(r) || '').toLowerCase().includes(q) ||
          String(r.status || '').toLowerCase().includes(q)
        );
      })
    : visible;
  const selected = visible.find((r) => r.runnerId === selectedId) || null;
  const pending = visible.filter((r) => r.status === 'pending');
  const config = selected ? defaultRunnerConfig(selected) : null;
  const effectiveModelIds = selected ? effectiveModels(selected) : [];
  const allModelIds = selected ? modelUnion(selected) : [];
  const modelsOverridden = selected ? Array.isArray(config.availableModels) : false;
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
  const nameDirty = selected && String(nameDraft).trim() !== String(config.displayName ?? '');

  const handleNameSave = () => {
    if (!selected || !nameDirty) return;
    const trimmed = String(nameDraft).trim();
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
    const value = String(field === 'masterDir' ? masterValue : worktreeValue).trim();
    const errMsg = validateSingleDirectory(value);
    const confirmKey = `${selected.runnerId}:${field}`;
    if (errMsg) {
      setDirErrors((prev) => ({ ...prev, [confirmKey]: errMsg }));
      return;
    }
    void saveConfig(selected.runnerId, { directories: { [field]: value } }, 'Directory saved.').then((saved) => {
      if (saved) {
        setDirDrafts((prev) => {
          const next = { ...prev };
          delete next[selected.runnerId];
          return next;
        });
        setDirErrors((prev) => {
          const next = { ...prev };
          delete next[confirmKey];
          return next;
        });
      }
    });
  };

  const handleToolToggle = (toolId, checked) => {
    if (!selected) return;
    const next = checked ? [...new Set([...enabledTools, toolId])] : enabledTools.filter((t) => t !== toolId);
    void saveConfig(selected.runnerId, { availableTools: next }, 'Available tools saved.');
  };

  const handleModelToggle = (modelId, checked) => {
    if (!selected) return;
    const set = new Set(effectiveModelIds);
    if (checked) set.add(modelId);
    else set.delete(modelId);
    const next = [...set];
    const patchVal = modelTogglePatch(selected, next);
    void saveConfig(selected.runnerId, { availableModels: patchVal }, patchVal === null ? 'Models reset to advertised.' : 'Models saved.').then(() => {});
  };

  const handleCustomModelAdd = () => {
    const v = customModel.trim();
    if (!v || !selected) return;
    const set = new Set(effectiveModelIds);
    set.add(v);
    const next = [...set];
    const patchVal = modelTogglePatch(selected, next);
    void saveConfig(selected.runnerId, { availableModels: patchVal }, 'Models saved.').then((ok) => {
      if (ok) setCustomModel('');
    });
  };

  const handleModelsReset = () => {
    if (!selected) return;
    void saveConfig(selected.runnerId, { availableModels: null }, 'Models reset — this Runner matches its advertised models again.').then(() => {});
  };

  const handleRediscover = async () => {
    if (!selected) return;
    const key = `rediscover:${selected.runnerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await api.requestModelRediscovery(selected.runnerId);
      setNotice('Re-detection queued — Runner will refresh on next heartbeat.');
      // Brief poll for updated models
      let tries = 0;
      const poll = async () => {
        tries += 1;
        try {
          const list = await api.getRunners();
          const rec = Array.isArray(list) ? list.find((r) => r.runnerId === selected.runnerId) : null;
          if (rec) {
            setRunners((prev) =>
              Array.isArray(prev)
                ? prev.map((r) => (r.runnerId === selected.runnerId ? { ...r, ...rec } : r))
                : [rec],
            );
          }
          if (tries < 3) setTimeout(poll, 2000);
        } catch {}
      };
      setTimeout(poll, 1500);
    } catch (err) {
      setActionError(err?.message || 'Could not queue re-detection.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleUpdateNow = async () => {
    if (!selected) return;
    const key = `update:${selected.runnerId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      await api.requestRunnerUpdate(selected.runnerId);
      setNotice('Update queued — Runner will update when idle.');
      // Brief poll for progress/failure state from the runner.
      let tries = 0;
      const poll = async () => {
        tries += 1;
        try {
          const list = await api.getRunners();
          const rec = Array.isArray(list) ? list.find((r) => r.runnerId === selected.runnerId) : null;
          if (rec) {
            setRunners((prev) =>
              Array.isArray(prev)
                ? prev.map((r) => (r.runnerId === selected.runnerId ? { ...r, ...rec } : r))
                : [rec],
            );
            if (rec.updateStatus?.state === 'failed') {
              setActionError(rec.updateStatus.reason || 'Runner update failed.');
            }
          }
          if (tries < 5) setTimeout(poll, 2000);
        } catch {}
      };
      setTimeout(poll, 1500);
    } catch (err) {
      setActionError(err?.message || 'Could not queue update.');
    } finally {
      setBusyKey(null);
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
            Runner {freshCredential.runnerId} approved. Paste this one-time credential into its environment as KAINBAIN_RUNNER_CREDENTIAL and restart it — it is never shown again.
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
                    onClick={() => setSelectedId(runner.runnerId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(runner.runnerId);
                      }
                    }}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-container border rounded-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? 'border-primary' : 'border-border-standard'} hover:border-primary/50 transition-colors`}
                  >
                    <span className="text-xs font-mono text-on-surface underline decoration-dotted underline-offset-4">
                      {runnerDisplayName(runner)}
                    </span>
                    {/* Hidden accessible button keeps existing test id */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(runner.runnerId); }}
                      aria-label={`Configure runner ${runner.runnerId}`}
                      aria-pressed={isSelected}
                      data-testid={`runner-select-${runner.runnerId}`}
                      tabIndex={-1}
                      className="sr-only"
                    >
                      Select
                    </button>
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
                      <span className="text-[10px] font-bold uppercase tracking-widest text-error" data-testid={`runner-update-failed-${runner.runnerId}`} title={`Last self-update failed: ${runner.updateStatus.reason || 'unknown'}`}>update failed</span>
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
                    <button type="button" data-testid={`runner-update-now-${selected.runnerId}`} onClick={handleUpdateNow} disabled={busyKey === `update:${selected.runnerId}`} title={selected.recommendedVersion ? `Update to ${selected.recommendedVersion} (applies when idle)` : 'Update now (applies when idle)'} className="px-3 py-1.5 min-h-[44px] bg-warning hover:brightness-110 text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">
                      {busyKey === `update:${selected.runnerId}` ? 'Updating…' : 'Update now'}
                    </button>
                  )}
                  <button type="button" onClick={reloadSelected} disabled={busyKey === `reload:${selected.runnerId}`} data-testid={`runner-reload-${selected.runnerId}`} className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">Reload</button>
                </div>
              </div>

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
                  <label className="text-xs font-bold text-on-surface" htmlFor={`runner-custom-model-${selected.runnerId}`}>Models {modelsOverridden ? '(operator override)' : '(advertised)'}</label>
                  <button type="button" data-testid={`runner-redetect-models-${selected.runnerId}`} onClick={handleRediscover} disabled={busyKey === `rediscover:${selected.runnerId}`} className="ml-auto px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60">
                    {busyKey === `rediscover:${selected.runnerId}` ? 'Queued…' : 'Re-detect models'}
                  </button>
                </div>
                {allModelIds.length === 0 ? (
                  <p className="text-[11px] text-text-muted" data-testid={`runner-models-empty-${selected.runnerId}`}>No models advertised. Use Re-detect or add a custom id below.</p>
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
                  <input id={`runner-custom-model-${selected.runnerId}`} type="text" data-testid={`runner-custom-model-${selected.runnerId}`} value={customModel} placeholder="Add custom model id" onChange={(e) => setCustomModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomModelAdd(); }}} className="flex-1 min-w-0 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors" />
                  <button type="button" data-testid={`runner-add-model-${selected.runnerId}`} onClick={handleCustomModelAdd} disabled={!customModel.trim() || Boolean(busyKey)} className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0">Add</button>
                  {modelsOverridden && (
                    <button type="button" data-testid={`runner-models-reset-${selected.runnerId}`} onClick={handleModelsReset} disabled={Boolean(busyKey)} className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0">Reset</button>
                  )}
                </div>
                <p className="text-[11px] text-text-muted" data-testid={`runner-models-effective-${selected.runnerId}`}>
                  {effectiveModelIds.length === 0 ? 'No models: this Runner matches model-less tasks only.' : `Effective: ${effectiveModelIds.join(', ')}`}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <DirectoryField label="Master directory:" testId={`runner-masterdir-${selected.runnerId}`} value={masterValue} hint="/srv/kb" isDefault={masterIsDefault && !dirDraft} error={dirErrors[`${selected.runnerId}:masterDir`]} busy={Boolean(busyKey)} onChange={(value) => { setDirErrors((prev) => { const next = { ...prev }; delete next[`${selected.runnerId}:masterDir`]; return next; }); setDirDrafts((prev) => ({ ...prev, [selected.runnerId]: { masterDir: value, worktreeDir: dirDraft ? dirDraft.worktreeDir : displayDirs.worktreeDir.value } })); }} onSave={() => handleDirectorySave('masterDir')} />
                <DirectoryField label="Worktree directory:" testId={`runner-worktreedir-${selected.runnerId}`} value={worktreeValue} hint="/srv/kb-trees" isDefault={worktreeIsDefault && !dirDraft} error={dirErrors[`${selected.runnerId}:worktreeDir`]} busy={Boolean(busyKey)} onChange={(value) => { setDirErrors((prev) => { const next = { ...prev }; delete next[`${selected.runnerId}:worktreeDir`]; return next; }); setDirDrafts((prev) => ({ ...prev, [selected.runnerId]: { masterDir: dirDraft ? dirDraft.masterDir : displayDirs.masterDir.value, worktreeDir: value } })); }} onSave={() => handleDirectorySave('worktreeDir')} />
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
