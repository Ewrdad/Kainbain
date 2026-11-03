import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { normalizeStageRunnerPolicy } from '../../../../shared/stageRunnerPolicy.js';
import { runnerDisplayName, visibleRunners } from '../settings/runnerConfigHelpers';
import { InfoTooltip } from '../common/InfoTooltip';
import { SelectDropdown } from '../common/SelectDropdown';

const MODE_COPY = {
  off: 'Every Runner may take this stage.',
  allow: 'Only the selected Runners may take this stage.',
  block: 'Every Runner except the selected ones may take this stage.',
};

const loadRoster = async () => {
  const list = await api.getRunners();
  return Array.isArray(list) ? list : [];
};

/***
 * MARK: StageRunnerPolicyEditor
 * @description Runner allow/block list editor for stage settings. A mode
 *   selector (`Off` / `Only these runners` / `All except these runners`)
 *   plus a Runner checkbox roster fed by `GET /runners`. Writes through
 *   `onChange` as `{ mode, runners }`, or `undefined` when Off or when the
 *   selection is empty (empty always means unrestricted, so stored stages
 *   stay clean). Runner ids in the policy that no longer register stay in
 *   the list with an "unknown" badge — removing them is explicit, so a
 *   renamed Runner can never silently open a compliance gate.
 * @example <StageRunnerPolicyEditor value={stage.runnerPolicy} stageName="Publish" onChange={(p) => onUpdateStage(id, { runnerPolicy: p })} />
 * @param {Object} props
 * @param {Object} [props.value] - Current `stage.runnerPolicy` (or undefined when unrestricted).
 * @param {Array} [props.runners] - Runner records; when omitted the editor fetches `GET /runners` itself.
 * @param {string} [props.stageName] - Stage name for labels.
 * @param {string} [props.stageType] - Stage type (human stages show an unaffected note).
 * @param {Function} props.onChange - Called with the next policy or `undefined`.
 * @param {boolean} [props.disabled=false]
 ***/
export function StageRunnerPolicyEditor({
  value,
  runners,
  stageName = '',
  stageType = '',
  onChange,
  disabled = false,
}) {
  // Draft mode keeps the selector on allow/block while the selection is
  // empty (which writes undefined = unrestricted): without it the control
  // would snap back to Off before the first checkbox can be ticked. A
  // stored policy always wins over the draft.
  const [draftMode, setDraftMode] = useState(null);
  const [fetched, setFetched] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const selfFetch = runners === undefined;

  useEffect(() => {
    if (!selfFetch) return undefined;
    let mounted = true;
    loadRoster().then(
      (list) => {
        if (mounted) setFetched(list);
      },
      () => {
        if (mounted) {
          setFetched([]);
          setLoadFailed(true);
        }
      }
    );
    return () => {
      mounted = false;
    };
  }, [selfFetch]);

  const loading = selfFetch ? fetched === null : runners === null;
  const roster = visibleRunners(selfFetch ? fetched : runners);
  const policy = normalizeStageRunnerPolicy(value);
  const selection = policy ? policy.runners : [];
  const mode = policy ? policy.mode : draftMode || 'off';

  const selectMode = (next) => {
    if (disabled) return;
    if (next === 'off') {
      setDraftMode(null);
      if (policy) onChange?.(undefined);
      return;
    }
    if (selection.length === 0) {
      setDraftMode(next);
      if (policy) onChange?.(undefined);
      return;
    }
    setDraftMode(null);
    onChange?.({ mode: next, runners: selection });
  };

  const toggleRunner = (runnerId, checked) => {
    if (disabled) return;
    const next = checked
      ? selection.includes(runnerId)
        ? selection
        : [...selection, runnerId]
      : selection.filter((id) => id !== runnerId);
    if (next.length === 0) {
      setDraftMode(mode === 'off' ? null : mode);
      onChange?.(undefined);
      return;
    }
    setDraftMode(null);
    onChange?.({ mode: mode === 'off' ? 'allow' : mode, runners: next });
  };

  const staleIds = selection.filter(
    (id) => !roster.some((r) => r && r.runnerId === id)
  );

  return (
    <div className="space-y-3 pt-2 border-t border-border-standard/60">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider block">
            Runner access:
          </span>
          <InfoTooltip
            title="Stage Runner Access"
            description="Restricts which Runners may take this stage: keep a publish step on one Runner, or a compliance scan onsite."
            behindTheScenes="Dispatch, direct claim, and merge leases all refuse Runners the stage does not allow"
            position="left"
          />
        </div>
        <SelectDropdown
          ariaLabel={`Runner access for ${stageName || 'stage'}`}
          className="block w-full"
          value={mode}
          onChange={selectMode}
          size="sm"
          options={[
            { value: 'off', label: 'Off (every Runner)' },
            { value: 'allow', label: 'Only these runners' },
            { value: 'block', label: 'All except these runners' },
          ]}
        />
        <p className="text-[10px] text-text-muted font-mono">{MODE_COPY[mode]}</p>
      </div>

      {mode !== 'off' && (
        <div className="space-y-1">
          {loading ? (
            <p className="text-[11px] text-text-muted">Loading runners…</p>
          ) : loadFailed ? (
            <p className="text-[11px] text-text-muted" role="alert">
              Could not load the Runner roster — the saved list below is unchanged.
            </p>
          ) : roster.length === 0 && staleIds.length === 0 ? (
            <p className="text-[11px] text-text-muted">No Runners have registered yet.</p>
          ) : (
            <div
              role="group"
              aria-label={`Runners for ${stageName || 'stage'}`}
              className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar p-1.5 bg-surface-container border border-border-standard rounded-sm"
            >
              {roster.map((runner) => {
                const id = runner?.runnerId;
                if (typeof id !== 'string' || !id) return null;
                const name = runnerDisplayName(runner) || id;
                const statusNote =
                  runner?.paused === true
                    ? 'paused'
                    : runner?.status && runner.status !== 'active'
                      ? runner.status
                      : '';
                return (
                  <label
                    key={id}
                    className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-on-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selection.includes(id)}
                      onChange={(e) => toggleRunner(id, e.target.checked)}
                      disabled={disabled}
                      aria-label={`${mode === 'allow' ? 'Allow' : 'Block'} runner ${name}`}
                      className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                    />
                    <span className="font-mono truncate">{name}</span>
                    {name !== id && (
                      <span className="font-mono text-text-muted truncate">{id}</span>
                    )}
                    {statusNote && (
                      <span className="text-[10px] font-mono text-text-muted">
                        ({statusNote})
                      </span>
                    )}
                  </label>
                );
              })}
              {staleIds.map((id) => (
                <label
                  key={`stale-${id}`}
                  className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-on-surface"
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={(e) => toggleRunner(id, e.target.checked)}
                    disabled={disabled}
                    aria-label={`Remove unknown runner ${id}`}
                    className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono truncate">{id}</span>
                  <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-px rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    unknown
                  </span>
                </label>
              ))}
            </div>
          )}
          {selection.length === 0 && !loading && (
            <p className="text-[10px] text-text-muted font-mono">
              No runners selected — every Runner may take this stage until you select one.
            </p>
          )}
        </div>
      )}

      {String(stageType).toLowerCase() === 'human' && (
        <p className="text-[10px] text-text-muted font-mono">
          Human stages run no Runner work, so this list does not affect them.
        </p>
      )}
    </div>
  );
}
