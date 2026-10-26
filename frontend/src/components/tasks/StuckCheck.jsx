import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { modelKeyForValue, modelOptionValue } from '../../services/api';
import { FALLBACK_MODELS } from '../stageTypes';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { ModelSelector } from '../common/ModelSelector';

/***
 * MARK: VERDICT_META
 * @description Presentation metadata per canonical stuck-check verdict:
 *   badge label, chromatic class (role colors) and glyph.
 ***/
const VERDICT_META = {
  stuck: {
    label: 'Looks stuck',
    icon: '⚠',
    badgeClass: 'bg-error/20 text-error border-error/40',
  },
  not_stuck: {
    label: 'Not stuck',
    icon: '✓',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
  },
  unclear: {
    label: 'Unclear',
    icon: '?',
    badgeClass: 'bg-warning/15 text-warning border-warning/30',
  },
};

/***
 * MARK: verdictMeta
 * @description Safe lookup of the presentation metadata for a verdict value;
 *   unknown values degrade to the `unclear` presentation so a new backend
 *   value can never crash the panel.
 ***/
export function verdictMeta(verdict) {
  switch (verdict) {
    case 'stuck':
      return VERDICT_META.stuck;
    case 'not_stuck':
      return VERDICT_META.not_stuck;
    default:
      return VERDICT_META.unclear;
  }
}

/***
 * MARK: stuckCheckHarnessDisabledReason
 * @description Disabled reason for harness options that cannot run the stuck
 *   check. Only harnesses whose backend entry advertises a diagnosis session
 *   factory (`supportsDiagnosis`) are selectable — today that is the harness
 *   whose SDK implements `createDiagnosisSession`. Entries from older
 *   backends carry no flag and stay selectable (a missing `harness` still
 *   resolves to the previous single-harness default server-side).
 * @example stuckCheckHarnessDisabledReason({ id: 'custom', supportsDiagnosis: false }) => 'stuck check unavailable'
 * @param {Object} [harness] - One per-harness catalogue entry from /compute/models.
 * @returns {string|null} The disabled reason, or null when selectable.
 ***/
export function stuckCheckHarnessDisabledReason(harness) {
  return harness?.supportsDiagnosis === false ? 'stuck check unavailable' : null;
}

/***
 * MARK: useStuckCheck
 * @description View-model for the advisory "Is it stuck?" control: holds the
 *   open/closed state, the harness choice (defaulting to the current stage's
 *   harness override, then the project harness, then the first harness that
 *   supports the stuck check) and the model choice scoped to that harness
 *   (stage model override, then the project default, then the first model in
 *   the selected harness — never another harness's stale key), the available
 *   model + harness lists (from the shared /compute/models cache) and the
 *   running/result/error state of the last check. The check itself is
 *   delegated to `checkTaskStuck` from the KainBain context — this hook never
 *   talks to the API directly, so tests can inject a fake.
 * @example const stuckCheck = useStuckCheck({ task, taskStage });
 * @param {Object} params
 * @param {Object} [params.task] - The task being inspected (id is required to run).
 * @param {Object} [params.taskStage] - The task's current stage object (may carry model/harness overrides).
 * @returns {Object} Stuck-check view-model consumed by StuckCheckButton / StuckCheckPanel.
 ***/
export function useStuckCheck({ task, taskStage } = {}) {
  const { activeProjectId, checkTaskStuck, projects, isHarnessDisabled } = useKainBain();
  const taskId = task?.id;
  const stageModel = taskStage?.model;
  const stageHarness = taskStage?.harness;

  const [open, setOpen] = useState(false);
  const [explicitModelKey, setExplicitModelKey] = useState('');
  const [explicitHarnessId, setExplicitHarnessId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId],
  );

  // Catalogue from the single shared fetch point (TTL-cached /compute/models):
  // the flat model list plus the additive per-harness view, with the virtual
  // `alias` entry appended at render from the active project's aliases — so
  // saved aliases appear here with no refresh, exactly like every other
  // picker. While it loads the picker stays empty (Run waits for the real
  // list, never a fallback guess); on failure FALLBACK_MODELS keeps the
  // picker non-empty and the harnesses stay absent so ModelSelector wraps the
  // flat list as its single default row, exactly like every other picker.
  const {
    models: catalogModels,
    harnesses,
    loading: catalogLoading,
    refreshing,
    refresh,
  } = useModelCatalog(FALLBACK_MODELS, { aliases: activeProject?.modelAliases });
  const models = catalogLoading ? [] : catalogModels;

  const harnessById = useMemo(() => new Map(harnesses.map((h) => [h?.id, h])), [harnesses]);

  // Default harness (used whenever the user has not picked one): the current
  // stage's harness override, then the project harness, then the first
  // harness that can actually run the check. Harnesses without diagnosis
  // support are skipped so the default never lands on a row Run cannot use;
  // an explicit user choice always wins (see harnessId below). Derived at
  // render time — no state syncing needed.
  const defaultHarnessId = useMemo(() => {
    const stored = [stageHarness, activeProject?.harness].find((id) => id && harnessById.has(id));
    if (stored && stuckCheckHarnessDisabledReason(harnessById.get(stored)) === null) {
      return stored;
    }
    const firstSupported = harnesses.find((h) => stuckCheckHarnessDisabledReason(h) === null);
    if (firstSupported?.id) return firstSupported.id;
    return harnesses.length > 0 ? harnesses[0]?.id || '' : '';
  }, [harnesses, harnessById, stageHarness, activeProject?.harness]);

  // Explicit choice wins while it still names a known harness; a stale id
  // (catalogue changed under the panel) falls back to the default above.
  const harnessId =
    explicitHarnessId && harnessById.has(explicitHarnessId) ? explicitHarnessId : defaultHarnessId;

  // The catalogue the model control scopes to: the selected harness's own
  // models, else the flat list (older backends, or an entry without one). An
  // honestly-empty harness catalogue stays empty here — never backfilled
  // with another harness's models.
  const selectedHarness = harnessId ? harnessById.get(harnessId) : undefined;
  const modelsForHarness = selectedHarness?.models ?? models;

  // How the selected harness takes a model: `none` (manages its own model)
  // hides the model control in ModelSelector and lifts the model requirement
  // on Run; anything else resolves a model key from the scoped catalogue.
  const requiresModel = (selectedHarness?.modelSelection || 'list') !== 'none';

  // Default model choice (used whenever the user has not picked one, or the
  // pick belongs to another harness): the current stage's model override,
  // then the project default, then the first model IN THE SELECTED HARNESS.
  // Scoping to the harness avoids sending a model key the chosen harness
  // cannot resolve. Legacy bare ids keep resolving via modelKeyForValue.
  const defaultModelKey = useMemo(() => {
    const stored = stageModel || activeProject?.defaultModel;
    const resolved = stored ? modelKeyForValue(modelsForHarness, stored) : '';
    const valid = modelsForHarness.some((m) => modelOptionValue(m) === resolved)
      ? resolved
      : '';
    if (valid) return valid;
    return modelsForHarness.length > 0 ? modelOptionValue(modelsForHarness[0]) : '';
  }, [modelsForHarness, stageModel, activeProject?.defaultModel]);

  // An explicit pick survives only while it names a model in the CURRENT
  // harness — switching harness falls back to that harness's default instead
  // of sending a stale key the new harness would reject. Switching back
  // restores the earlier pick (the explicit value is kept, just shadowed).
  const modelKey =
    explicitModelKey &&
    modelsForHarness.some((m) => modelOptionValue(m) === explicitModelKey)
      ? explicitModelKey
      : defaultModelKey;

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const run = useCallback(async () => {
    if (running || !taskId || !activeProjectId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await checkTaskStuck?.(activeProjectId, taskId, {
        model: requiresModel ? modelKey || undefined : undefined,
        harness: harnessId || undefined,
      });
      if (mountedRef.current) setResult(res || null);
    } catch (e) {
      if (mountedRef.current) {
        setError(e?.message || 'Stuck check failed');
      }
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }, [running, taskId, activeProjectId, modelKey, harnessId, requiresModel, checkTaskStuck]);

  return {
    open,
    toggle,
    models,
    harnesses,
    modelKey,
    setModelKey: setExplicitModelKey,
    harnessId,
    setHarnessId: setExplicitHarnessId,
    requiresModel,
    // Refresh originates from a user click (event handler): the shared hook
    // re-runs discovery past both caches (backend `?refresh=true`).
    onRefresh: refresh,
    refreshing,
    running,
    result,
    error,
    run,
    canRun: Boolean(taskId && activeProjectId),
  };
}

/***
 * MARK: StuckCheckButton
 * @description The small "Is it stuck?" toggle for the LogsPanel status bar.
 *   Follows the same compact styling as the Copy Logs button.
 ***/
export function StuckCheckButton({ open, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      aria-controls="stuck-check-panel"
      aria-label={open ? 'Close stuck check panel' : 'Is it stuck? Run an advisory stuck check'}
      title="Is it stuck? — advisory-only model check of the current stage logs"
      className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-text-muted hover:text-on-surface rounded text-xs uppercase font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {open ? '🤔 Hide Stuck Check' : '🤔 Is it stuck?'}
    </button>
  );
}

/***
 * MARK: StuckCheckResult
 * @description Renders one stuck-check result: chromatic verdict badge, the
 *   model that ran, and the reasoning summary.
 ***/
export function StuckCheckResult({ result }) {
  if (!result) return null;
  const meta = verdictMeta(result.verdict);
  return (
    <div className="space-y-1.5" data-testid="stuck-check-result">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${meta.badgeClass}`}
          data-testid="stuck-check-verdict"
        >
          {meta.icon} {meta.label}
        </span>
        {result.model?.name && (
          <span className="text-[10px] text-text-muted">Model: {result.model.name}</span>
        )}
      </div>
      {result.summary && (
        <p className="text-on-surface leading-relaxed break-words whitespace-pre-wrap m-0">
          {result.summary}
        </p>
      )}
    </div>
  );
}

/***
 * MARK: StuckCheckPanel
 * @description The expandable advisory panel: the shared harness-first model
 *   picker (harness selector + model control scoped to that harness) + run
 *   button and the last result/error. Harnesses that cannot run the check
 *   render disabled with an honest reason; `none` harnesses (own model)
 *   show the picker's built-in note and Run stays enabled without a model.
 *   Rendered between the LogsPanel status bar and the feed chips when open.
 * @example {stuckCheck.open && <StuckCheckPanel state={stuckCheck} />}
 * @param {Object} props
 * @param {Object} props.state - View-model from useStuckCheck.
 ***/
export function StuckCheckPanel({ state }) {
  if (!state?.open) return null;
  // A `none` harness owns its model, so Run needs no model key; every other
  // harness waits for the scoped catalogue to resolve one.
  const canRunModel = !state.requiresModel || Boolean(state.modelKey);
  return (
    <div
      id="stuck-check-panel"
      role="region"
      aria-label="Stuck check"
      className="p-3 bg-surface-container border border-border-standard rounded-sm space-y-3 text-xs font-mono"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
          Is it stuck? — advisory only
        </span>
        <span className="text-[10px] text-text-muted">
          Read-only check: sends the current stage logs to a model and reports an assessment. Takes
          no actions.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <ModelSelector
          models={state.models}
          harnesses={state.harnesses}
          value={state.modelKey}
          onChange={(val) => state.setModelKey(val)}
          harnessId={state.harnessId}
          onHarnessChange={(val) => state.setHarnessId(val)}
          isHarnessDisabled={
            typeof isHarnessDisabled === 'function'
              ? (harness) =>
                  isHarnessDisabled(harness) || stuckCheckHarnessDisabledReason(harness)
              : stuckCheckHarnessDisabledReason
          }
          size="sm"
          className="w-56"
          ariaLabel="Model for stuck check"
          harnessAriaLabel="Harness for stuck check"
          reasoningLabelNode={
            <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
              Reasoning
            </span>
          }
          onRefresh={state.onRefresh}
          refreshing={state.refreshing}
        />
        <button
          type="button"
          onClick={state.run}
          disabled={state.running || !state.canRun || !canRunModel}
          aria-busy={state.running}
          className="px-3 py-1.5 min-h-[44px] bg-primary text-on-primary rounded text-xs uppercase font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.running ? '⏳ Checking…' : '🔍 Run Check'}
        </button>
      </div>
      {state.error && (
        <div className="text-error" role="alert" data-testid="stuck-check-error">
          ⚠ {state.error}
        </div>
      )}
      <StuckCheckResult result={state.result} />
    </div>
  );
}
