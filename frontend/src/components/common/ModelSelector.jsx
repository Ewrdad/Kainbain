import React, { useState, useEffect } from 'react';
import { SelectDropdown } from './SelectDropdown';
import {
  modelKeyForValue,
  modelOptionValue,
  groupModelsByProvider,
  splitReasoning,
  stripReasoning,
  appendReasoning,
  parseModelKey,
  resolveReasoningOptions,
  stripReasoningIfUnsupported,
} from '../../services/api';
import { modelBadgeNode } from '../../services/modelStatus';
import {
  availabilityBadge,
  availabilityFromEntry,
  availabilityToneClass,
} from '../../services/harnessPrefs';
import { ALIAS_HARNESS_ID } from '../../../../shared/modelAliases.js';

/***
 * MARK: harnessAvailabilityBadgeNode
 * @description Availability badge for one harness dropdown option, derived
 *   from the backend's discovery projection (`available`) — the same
 *   text + tones as the System Settings harness list. Entries from older
 *   backends (no `available` field) render badge-free, never mislead.
 * @example harnessAvailabilityBadgeNode({ id: 'pi', available: true }) => <span>Detected</span>
 * @param {Object} entry - Harness view entry.
 * @returns {React.ReactNode|null} The badge node, or null when unjudgeable.
 ***/
function harnessAvailabilityBadgeNode(entry) {
  const availability = availabilityFromEntry(entry);
  if (!availability) return null;
  const badge = availabilityBadge({ enabled: true, autoDetect: true }, availability);
  return (
    <span
      className={`px-1.5 py-px text-[10px] font-bold uppercase tracking-wider rounded-full border ${availabilityToneClass(badge.tone)}`}
    >
      {badge.text}
    </span>
  );
}

/***
 * MARK: DEFAULT_HARNESS_ID
 * @description The harness id assumed when the backend's model response
 *   carries no harnesses (older backend or a mocked catalogue): the flat
 *   model list is wrapped as the single `pi` harness so the harness-first
 *   layout always has a row to render.
 ***/
export const DEFAULT_HARNESS_ID = 'pi';

/***
 * MARK: resolveStoredModelValidity
 * @description Reports whether a stored model reference resolves against one
 *   harness's catalogue: `known` (the resolved dropdown value names a
 *   catalogued model), `unknown` (a stale/foreign ref — badge it, never
 *   block on it), or `blank` (no stored value — inherit). Settings screens
 *   use this to badge stale refs without duplicating the resolution.
 * @example resolveStoredModelValidity([{ id: 'm', provider: 'p', key: 'p::m' }], 'p::m')
 *   => { status: 'known', resolvedValue: 'p::m' }
 * @param {Array<Object>} models - One harness's catalogue.
 * @param {string} [stored] - Stored reference (any accepted form).
 * @returns {{status: 'known'|'unknown'|'blank', resolvedValue: string}} The validity + resolved dropdown value.
 ***/
export function resolveStoredModelValidity(models, stored) {
  if (!stored) return { status: 'blank', resolvedValue: '' };
  const list = Array.isArray(models) ? models : [];
  const resolvedValue = modelKeyForValue(list, stored);
  const known = list.some((m) => modelOptionValue(m) === resolvedValue);
  return { status: known ? 'known' : 'unknown', resolvedValue };
}

/***
 * MARK: ModelSelector
 * @description The shared harness-first AI-model picker used by every model
 *   selector in the app. It renders a Harness selector plus the model control
 *   for the chosen harness, driven by the harness's `modelSelection` mode:
 *   - `list` (default, catalogue harnesses): the model dropdown scoped to the
 *     harness's catalogue, visually grouped by provider (group headers carry
 *     the provider name). The stored model reference (composite
 *     `provider::id` key or legacy bare id) is resolved against the visible
 *     catalogue and composite keys are emitted on change, so persisted values
 *     keep resolving unchanged. With a single registered harness the harness
 *     row renders disabled-but-visible so the structure is evident and future
 *     harnesses drop in without layout change. An empty catalogue renders an
 *     honest empty state (never another harness's models) with an optional
 *     Refresh action. When the harness entry carries a `discoveryError`
 *     (`{ code, message, hint }` from the backend), the empty state names the
 *     specific reason + fix; otherwise the backend's availability `hint`
 *     (when present), else the generic "check harness availability" line.
 *   - `none` (a harness that manages its own model, e.g. custom bakes
 *     `--model` into its command line): no model control at all.
 *   Callers that inherit their harness (per-stage pickers following the
 *   project harness) pass `harnessAllowEmpty` + `fallbackHarnessId`: the
 *   dropdown gains an explicit inherit option and the model control stays
 *   scoped to the inherited harness while it is selected.
 *   When the selected harness advertises no reasoning levels (null-harness
 *   targets stay level-free by design), a muted note says so where the
 *   Reasoning dropdown would be — the absence is explained, never silent.
 * @example <ModelSelector models={models} harnesses={harnesses} value={defaultModel} onChange={setDefaultModel} ariaLabel="Default AI Model" id="project-default-model-select" />
 * @param {Object} props
 * @param {Array<Object>} props.models - Flat model catalogue (fallback / union snapshot).
 * @param {Array<Object>} [props.harnesses] - Per-harness view from the backend ({ id, label, description, modelSelection, models }).
 * @param {string} [props.value] - Stored model reference (composite key or bare id/name).
 * @param {Function} props.onChange - Selection handler receiving the option value.
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.size='md'] - Sizing ('sm' | 'md').
 * @param {string} [props.id] - DOM id for the model control.
 * @param {string} [props.ariaLabel] - Accessible label for the model control.
 * @param {React.ReactNode} [props.modelLabelNode] - Optional label rendered above the model control.
 * @param {React.ReactNode} [props.reasoningLabelNode] - Optional label rendered above the Reasoning dropdown (shown only for reasoning-capable harnesses).
 * @param {string} [props.className] - Extra classes for the model control trigger.
 * @param {boolean} [props.allowEmpty=false] - Prepend an empty-value choice (e.g. "Inherit Project Default").
 * @param {string} [props.emptyLabel='Inherit Project Default'] - Label for the empty choice.
 * @param {string} [props.harnessSelectId] - DOM id for the harness dropdown trigger.
 * @param {string} [props.harnessAriaLabel='AI Harness'] - Accessible label for the harness dropdown.
 * @param {React.ReactNode} [props.harnessLabelNode] - Optional label rendered above the harness dropdown.
 * @param {string} [props.harnessId] - Controlled harness selection (uncontrolled internal state when omitted; '' with harnessAllowEmpty = inherit).
 * @param {Function} [props.onHarnessChange] - Harness change handler for the controlled mode.
 * @param {boolean} [props.hideHarness=false] - Hide the harness row (the caller scopes selection to `harnessId`).
 * @param {boolean} [props.harnessAllowEmpty=false] - Offer an explicit empty (inherit) harness choice.
 * @param {string} [props.harnessEmptyLabel] - Label for the inherit choice (defaults to naming the inherited harness).
 * @param {string} [props.fallbackHarnessId] - Harness id the model control scopes to while the inherit choice is selected.
 * @param {Function} [props.onRefresh] - Refresh action for the empty-catalogue state (re-runs discovery).
 * @param {boolean} [props.refreshing=false] - Refresh in flight (disables the Refresh action).
 * @param {Function} [props.isHarnessDisabled] - Optional predicate over a visible harness entry returning a disabled reason string (truthy = that harness option renders disabled with the reason shown), or a falsy value when the harness stays selectable. Omitted = every harness selectable. Callers disable only on an explicit negative signal (e.g. `supportsDiagnosis === false`) so entries from older backends that carry no flag keep working.
 ***/
export function ModelSelector({
  models = [],
  harnesses = [],
  value = '',
  onChange,
  disabled = false,
  size = 'md',
  id,
  ariaLabel,
  modelLabelNode = null,
  reasoningLabelNode = null,
  className = '',
  allowEmpty = false,
  emptyLabel = 'Inherit Project Default',
  harnessSelectId,
  harnessAriaLabel = 'AI Harness',
  harnessLabelNode = null,
  harnessId: controlledHarnessId,
  onHarnessChange,
  hideHarness = false,
  harnessAllowEmpty = false,
  harnessEmptyLabel,
  fallbackHarnessId,
  onRefresh,
  refreshing = false,
  isHarnessDisabled,
}) {
  // Harness-first navigation: the model catalogue is scoped to the selected
  // harness. Older backends (or mocked test doubles) send no harnesses — wrap
  // the flat catalogue as the single pi harness so the row is never empty.
  const visibleHarnesses =
    harnesses.length > 0
      ? harnesses
      : [
          {
            id: DEFAULT_HARNESS_ID,
            label: DEFAULT_HARNESS_ID,
            description: 'pi coding-agent harness',
            modelSelection: 'list',
            models,
          },
        ];

  const [internalHarnessId, setInternalHarnessId] = useState(visibleHarnesses[0]?.id);
  const [pendingHarnessId, setPendingHarnessId] = useState(null);
  const [showLevelClearNotice, setShowLevelClearNotice] = useState(false);
  const rawSelectedHarnessId = controlledHarnessId ?? internalHarnessId;

  // The harness the model control scopes to: the valid selection, else the
  // inherited default while the inherit choice is selected (or when the
  // stored id went stale), else the first harness.
  const hasHarness = (hid) => visibleHarnesses.some((h) => h.id === hid);
  const inheritedHarnessId = hasHarness(fallbackHarnessId)
    ? fallbackHarnessId
    : visibleHarnesses[0]?.id;
  const effectiveHarnessId = hasHarness(rawSelectedHarnessId)
    ? rawSelectedHarnessId
    : inheritedHarnessId;
  const isInheriting =
    harnessAllowEmpty && (rawSelectedHarnessId === '' || rawSelectedHarnessId == null);

  const handleHarnessChange = (nextHarnessId, option) => {
    if (onHarnessChange) {
      onHarnessChange(nextHarnessId, option);
    } else {
      setInternalHarnessId(nextHarnessId);
    }
  };

  const handleHarnessSelect = (nextHarnessId, option) => {
    const nextEntry = visibleHarnesses.find((h) => h.id === nextHarnessId);
    const nextLevelOptions = resolveReasoningOptions({ harnessEntry: nextEntry });
    const { reasoning: currentLevel } = splitReasoning(value);
    if (currentLevel && nextLevelOptions === null) {
      setPendingHarnessId(nextHarnessId);
      setShowLevelClearNotice(true);
      return;
    }
    setPendingHarnessId(null);
    setShowLevelClearNotice(false);
    handleHarnessChange(nextHarnessId, option);
  };

  const selectedHarness = visibleHarnesses.find((h) => h.id === effectiveHarnessId);
  // How the selected harness takes a model: list (dropdown over the
  // catalogue) or none (no model control). Entries from older backends carry
  // no mode — they are catalogue harnesses.
  const modelSelection = selectedHarness?.modelSelection || 'list';
  const modelsForHarness = selectedHarness?.models ?? models;

  // Resolve the stored reference (composite or legacy bare id) to the
  // composite option key the current list actually contains.
  const resolvedValue = modelKeyForValue(modelsForHarness, value);

  const selectedModelEntry = modelsForHarness.find(
    (m) => (m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id)) === resolvedValue,
  );
  const reasoningLevelOptions = resolveReasoningOptions({
    harnessEntry: selectedHarness,
    selectedModel: selectedModelEntry,
  });
  // A level-free harness is a designed state, not a missing feature: say so
  // right where the Reasoning dropdown would be, so "where is the reasoning
  // picker?" has an answer at the exact spot. Only a REAL catalogue entry
  // judges — the synthetic fallback (older backend) carries no advertisement
  // and must never claim anything.
  const showReasoningUnavailableNote =
    harnesses.length > 0 && Boolean(selectedHarness) && reasoningLevelOptions === null;

  const handleModelChange = (next, option) => {
    if (!next) {
      onChange?.(next, option);
      return;
    }
    const { reasoning: currentLevel } = splitReasoning(value);
    if (currentLevel) {
      try {
        onChange?.(appendReasoning(next, currentLevel), option);
      } catch {
        onChange?.(next, option);
      }
    } else {
      onChange?.(next, option);
    }
  };

  const handleReasoningChange = (level, option) => {
    const base = resolvedValue || splitReasoning(value).baseRef;
    if (!base) return;
    if (level) {
      try {
        onChange?.(appendReasoning(base, level), option);
      } catch {
        onChange?.(base, option);
      }
    } else {
      onChange?.(base, option);
    }
  };

  useEffect(() => {
    // Q2: a stored `::level` on a null-reasoning harness collapses to the
    // bare ref once. Use the harness embedded in the stored reference (not
    // the currently selected UI harness) to decide whether reasoning is
    // supported, so a level that belongs to a capable harness is never
    // stripped just because the picker is momentarily scoped to a null one.
    if (harnesses.length === 0) return;
    const { baseRef, reasoning } = splitReasoning(value);
    if (!reasoning) return;
    const parsed = parseModelKey(value);
    const targetHarnessId = parsed?.harness ?? null;
    if (targetHarnessId && !harnesses.some((h) => h?.id === targetHarnessId)) return;
    // Resolve the advertised set for the stored harness (and its model) so
    // the Q5 precedence (model `supportedReasoning` else harness
    // `reasoningLevels`) is honoured here too — not just the selected one.
    const targetHarnessEntry = targetHarnessId
      ? harnesses.find((h) => h?.id === targetHarnessId)
      : selectedHarness;
    const targetModels = Array.isArray(targetHarnessEntry?.models) ? targetHarnessEntry.models : [];
    const resolvedTargetValue = modelKeyForValue(targetModels, baseRef);
    const targetModelEntry = targetModels.find(
      (m) => (m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id)) === resolvedTargetValue,
    );
    const targetOptions = resolveReasoningOptions({
      harnessEntry: targetHarnessEntry,
      selectedModel: targetModelEntry,
    });
    const stripped = stripReasoningIfUnsupported(value, targetOptions);
    if (stripped !== value) onChange?.(stripped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harnesses, value]);

  // Models grouped by provider: the group header carries the provider name,
  // so option labels are the plain model names (no "(provider)" suffix).
  // Credential-status badges (frontend/src/services/modelStatus.js) attach to
  // the options of models that carry enrichment info from /compute/models —
  // a model without status info renders badge-free (never mislead).
  const modelsByValue = new Map(
    modelsForHarness.map((m) => [m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id), m]),
  );
  const modelOptions = [
    ...(allowEmpty ? [{ value: '', label: emptyLabel }] : []),
    ...groupModelsByProvider(modelsForHarness).map((option) => {
      const model = modelsByValue.get(option.value);
      const badge = model ? modelBadgeNode(model) : null;
      return badge ? { ...option, badge } : option;
    }),
  ];

  const inheritLabel =
    harnessEmptyLabel || `Inherit (${selectedHarness?.label || selectedHarness?.id || 'default'})`;
  // Per-harness opt-outs (e.g. a picker whose action only runs on capable
  // harnesses): a truthy reason renders that option disabled with the reason
  // shown, never silently hidden. No predicate = every harness selectable.
  const harnessOptions = [
    ...(harnessAllowEmpty ? [{ value: '', label: inheritLabel }] : []),
    ...visibleHarnesses.map((h) => {
      const reason = typeof isHarnessDisabled === 'function' ? isHarnessDisabled(h) : null;
      const badge = harnessAvailabilityBadgeNode(h);
      return {
        value: h.id,
        label: h.label || h.id,
        ...(reason ? { disabled: true, description: String(reason) } : {}),
        ...(badge ? { badge } : {}),
      };
    }),
  ];
  // A single registered harness is shown for structure but cannot be changed
  // (unless the inherit choice is offered — then the row is always live).
  const harnessDisabled = disabled || (!harnessAllowEmpty && visibleHarnesses.length <= 1);
  // The trigger shows the inherit label while inheriting (the '' value has
  // no harness of its own to name).
  const harnessTriggerValue = isInheriting ? '' : effectiveHarnessId;

  return (
    <div
      className={`flex flex-col ${size === 'sm' ? 'gap-1' : 'gap-2'}`}
      data-testid="model-selector"
    >
      {!hideHarness && (
        <>
          {harnessLabelNode}
          <SelectDropdown
            id={harnessSelectId}
            ariaLabel={harnessAriaLabel}
            value={harnessTriggerValue}
            onChange={handleHarnessSelect}
            disabled={harnessDisabled}
            size={size}
            className={className}
            options={harnessOptions}
          />
          {selectedHarness?.hint && (
            <p className="text-[10px] text-text-muted" data-testid="harness-availability-hint">
              {selectedHarness.hint}
            </p>
          )}
        </>
      )}
      {modelSelection === 'none' ? (
        <p className="text-[10px] text-text-muted" data-testid="model-none-note">
          This harness manages its own model — no model selection.
        </p>
      ) : modelsForHarness.length === 0 ? (
        <>
          {modelLabelNode}
          <p className="text-[10px] text-text-muted" data-testid="model-empty-note">
            {selectedHarness?.id === ALIAS_HARNESS_ID ? (
              <>No aliases yet — add them in Settings › Model Aliases.</>
            ) : selectedHarness?.discoveryError?.message ? (
              <>
                {selectedHarness.discoveryError.message} {selectedHarness.discoveryError.hint}
              </>
            ) : selectedHarness?.hint ? (
              <>{selectedHarness.hint}</>
            ) : (
              <>
                No models discovered for{' '}
                {selectedHarness?.label || selectedHarness?.id || 'this harness'} yet — check
                harness availability.
              </>
            )}
            {selectedHarness?.id !== ALIAS_HARNESS_ID && onRefresh && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={disabled || refreshing}
                  className="underline text-primary disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <>
          {modelLabelNode}
          <SelectDropdown
            id={id}
            ariaLabel={ariaLabel}
            value={resolvedValue}
            onChange={handleModelChange}
            disabled={disabled}
            size={size}
            className={className}
            options={modelOptions}
          />
          {reasoningLevelOptions && (
            <>
              {reasoningLabelNode}
              <SelectDropdown
                id={id ? `${id}-reasoning` : undefined}
                ariaLabel="Reasoning"
                value={splitReasoning(value).reasoning || ''}
                onChange={handleReasoningChange}
                disabled={disabled}
                size={size}
                className={className}
                options={[
                  { value: '', label: 'Default (no level)' },
                  ...reasoningLevelOptions.map((level) => ({ value: level, label: level })),
                ]}
              />
            </>
          )}
          {showReasoningUnavailableNote && (
            <p className="text-[10px] text-text-muted" data-testid="reasoning-unavailable-note">
              This harness doesn&apos;t support adjustable reasoning — the Reasoning dropdown
              appears for pi, antigravity and mock targets.
            </p>
          )}
          {/* The notice only names a real blocker: a pending switch plus a
              level still on the stored ref. Clearing the level through the
              Reasoning dropdown (instead of Clear below) retires the notice
              without needing the pending state tidied first — the next
              switch resets it. */}
          {showLevelClearNotice && pendingHarnessId && splitReasoning(value).reasoning && (
            <div
              data-testid="reasoning-clear-notice"
              className="flex items-center gap-2 text-[10px] text-text-muted"
            >
              <span>Clear the reasoning level first</span>
              <button
                type="button"
                onClick={() => {
                  onChange?.(stripReasoning(value));
                  setShowLevelClearNotice(false);
                  if (pendingHarnessId) {
                    handleHarnessChange(pendingHarnessId);
                    setPendingHarnessId(null);
                  }
                }}
                className="px-2 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ModelSelector;
