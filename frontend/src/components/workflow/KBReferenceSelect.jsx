import React, { useState } from 'react';
import SelectDropdown from '../common/SelectDropdown';

/***
 * MARK: MANUAL_OPTION_VALUE
 * @description Sentinel option value for the "Enter value manually…" escape
 *   hatch. Never collides with real entity ids (KB ids are slugs/uuids, never
 *   this dunder-prefixed sentinel).
 ***/
export const MANUAL_OPTION_VALUE = '__kb_manual__';

/***
 * MARK: BUILTIN_OPTION_VALUE
 * @description Sentinel option value selecting the `{{project}}` built-in
 *   ("use the project the stage is running in"). Stored verbatim like today.
 ***/
export const BUILTIN_OPTION_VALUE = '{{project}}';

/***
 * MARK: isTemplateValue
 * @description True when a stored/typed value is a `{{...}}` template token
 *   (resolved by the engine at run time, not by the dropdown).
 ***/
export function isTemplateValue(value) {
  return typeof value === 'string' && value.includes('{{');
}

/***
 * MARK: pickKnownOption
 * @description Finds the known option matching a stored value using the
 *   reference rules (exact id, then case-insensitive entity name, then — for
 *   projects — case-insensitive slug). Returns the matched option or null.
 ***/
function pickKnownOption(options, value) {
  if (typeof value !== 'string') return null;
  const needle = value.trim();
  if (needle === '') return null;
  const lowerNeedle = needle.toLowerCase();
  return (
    options.find((opt) => opt.value === needle) ||
    options.find((opt) => String(opt.entity?.name ?? '').toLowerCase() === lowerNeedle) ||
    options.find(
      (opt) => opt.entity?.slug && String(opt.entity.slug).toLowerCase() === lowerNeedle,
    ) ||
    null
  );
}

/***
 * MARK: buildKnownOptions
 * @description Builds the entity options for one reference kind from the
 *   (already cascade-scoped) entities snapshot: projects / workflows / stages.
 *   Options render as "Name (id)" with a `default` badge on the default
 *   workflow, and carry the raw entity so pickKnownOption can match slugs.
 ***/
export function buildKnownOptions(kind, entities = {}) {
  const source = entities && typeof entities === 'object' ? entities : {};
  let list = [];
  if (kind === 'project') list = Array.isArray(source.projects) ? source.projects : [];
  else if (kind === 'workflow') list = Array.isArray(source.workflows) ? source.workflows : [];
  else if (kind === 'stage') list = Array.isArray(source.stages) ? source.stages : [];

  return list
    .filter((entity) => entity && typeof entity === 'object')
    .map((entity) => {
      const id = entity.id !== undefined && entity.id !== null ? String(entity.id) : '';
      const name = entity.name !== undefined && entity.name !== null ? String(entity.name) : '';
      return {
        value: id,
        label: name && id ? `${name} (${id})` : name || id,
        description: kind === 'workflow' && entity.isDefault ? 'default workflow' : null,
        badge: kind === 'workflow' && entity.isDefault ? 'default' : null,
        entity,
      };
    })
    .filter((opt) => opt.value !== '');
}

/***
 * MARK: computeHelperText
 * @description Picks the helper line under the selector: cascade error wins
 *   (rendered separately), then hard-disable reason, then the KB_config
 *   default for an empty override, then the legacy-value resolution note.
 * @param {Object} opts
 * @param {string|null} opts.error - Parent fetch error (helper suppressed).
 * @param {boolean} opts.disabled - Hard-disabled state.
 * @param {string|null} opts.disabledReason - Explanation while disabled.
 * @param {string} opts.rawValue - Stored value.
 * @param {string} opts.defaultValue - KB_config default.
 * @param {Object|null} opts.knownMatch - Matched known option, if any.
 * @returns {string|null}
 ***/
function computeHelperText({
  error,
  disabled,
  disabledReason,
  rawValue,
  defaultValue,
  knownMatch,
}) {
  if (error) return null;
  if (disabled && disabledReason) return disabledReason;
  if (rawValue.trim() === '' && defaultValue) return `Default: ${defaultValue}`;
  if (knownMatch && knownMatch.value !== rawValue) {
    return `Stored value "${rawValue}" resolves to ${knownMatch.label}`;
  }
  return null;
}

/***
 * MARK: KBReferenceSelect
 * @description One cascading KainBain-entity selector for a kbRef-declared
 *   skill keyword (project / workflow / stage), rendered on top of the shared
 *   SelectDropdown primitive. Selecting an option writes the canonical entity
 *   id via onChange — never a display label. Free text stays available: an
 *   explicit "Enter value manually…" option switches the row to a text input
 *   with Apply/Cancel, and a stored legacy value that matches no known entity
 *   renders as-is with a neutral "custom value" badge instead of breaking.
 *   The parent value (selected project / workflow) is expected to be already
 *   scoped into `entities` by the caller (StageSkillsPanel); while that parent
 *   cascade is loading or failing the control is disabled with an explanation
 *   and — on fetch failure — a retry affordance, never a dead dropdown.
 *
 * @example <KBReferenceSelect
 *            kind="workflow"
 *            entities={{ workflows: workflowsFor(projectId) }}
 *            value={attachment.config.targetWorkflow}
 *            onChange={(id) => setSkillConfigValue(name, 'targetWorkflow', id)}
 *            ariaLabel="Target workflow for creating-new-tickets" />
 *
 * @param {Object} props
 * @param {'project'|'workflow'|'stage'} props.kind - Which entity kind to pick.
 * @param {Object} [props.entities] - Cascade-scoped known entities:
 *   `{ projects?, workflows?, stages? }` (only the list matching `kind` is read).
 * @param {string} [props.value] - Stored config value (id, legacy name, '' or {{...}}).
 * @param {Function} props.onChange - Called with the next canonical value (string).
 * @param {boolean} [props.allowBuiltin=false] - Offer "Use current project ({{project}})".
 * @param {string} [props.defaultValue=''] - KB_config default shown as helper text
 *   when no override is stored.
 * @param {boolean} [props.loading=false] - Parent cascade fetch in flight.
 * @param {string|null} [props.error=null] - Parent cascade fetch failure message.
 * @param {Function} [props.onRetry] - Retry the failed parent fetch.
 * @param {boolean} [props.disabled=false] - Hard-disable (e.g. unresolved parent).
 * @param {string|null} [props.disabledReason=null] - Explanation shown when disabled.
 * @param {string} [props.ariaLabel] - Accessible name for the combobox.
 ***/
export function KBReferenceSelect({
  kind,
  entities = {},
  value = '',
  onChange,
  allowBuiltin = false,
  defaultValue = '',
  loading = false,
  error = null,
  onRetry,
  disabled = false,
  disabledReason = null,
  ariaLabel,
}) {
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState('');

  // Leave manual mode whenever the stored value changes from outside (e.g. via
  // the raw JSON editor). Render-time reset pattern (react.dev: you might not
  // need an effect) — no setState-in-effect cascade.
  const [lastSeenValue, setLastSeenValue] = useState(value);
  if (lastSeenValue !== value) {
    setLastSeenValue(value);
    setManualMode(false);
  }

  const knownOptions = buildKnownOptions(kind, entities);
  const rawValue = typeof value === 'string' ? value : '';
  const knownMatch = pickKnownOption(knownOptions, rawValue);

  const options = [...knownOptions];
  const unmatched =
    rawValue.trim() !== '' &&
    !knownMatch &&
    !(allowBuiltin && rawValue.trim() === BUILTIN_OPTION_VALUE);
  if (unmatched) {
    // Stored value matches no known entity: keep it visible verbatim — a
    // neutral badge marks legacy/custom values, templates are resolved later
    // by the engine at run time.
    options.unshift({
      value: rawValue,
      label: rawValue,
      badge: isTemplateValue(rawValue) ? 'builtin' : 'custom',
    });
  }
  if (allowBuiltin) {
    options.unshift({
      value: BUILTIN_OPTION_VALUE,
      label: 'Use current project ({{project}})',
      description: 'resolve to the project this stage runs in',
    });
  }
  options.push({ value: MANUAL_OPTION_VALUE, label: 'Enter value manually…' });

  const isCustom = unmatched && !isTemplateValue(rawValue);

  const helperText = computeHelperText({
    error,
    disabled,
    disabledReason,
    rawValue,
    defaultValue,
    knownMatch,
  });

  const handleSelect = (nextValue) => {
    if (nextValue === MANUAL_OPTION_VALUE) {
      setManualDraft(isTemplateValue(rawValue) ? '' : rawValue);
      setManualMode(true);
      return;
    }
    setManualMode(false);
    onChange?.(nextValue);
  };

  const applyManual = () => {
    setManualMode(false);
    onChange?.(manualDraft);
  };

  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  if (manualMode) {
    return (
      <div className="flex items-center gap-1" data-testid={`kb-ref-manual-${kind}`}>
        <input
          type="text"
          aria-label={ariaLabel ? `${ariaLabel} (manual entry)` : 'Manual entry'}
          value={manualDraft}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- input appears from the user's explicit manual-entry toggle
          autoFocus
          onChange={(e) => setManualDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyManual();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setManualMode(false);
            }
          }}
          placeholder={`Project / workflow / stage id or name`}
          className="flex-1 p-1 bg-surface border border-border-standard rounded-sm text-[9px] font-mono text-on-surface outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={applyManual}
          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-primary text-surface cursor-pointer"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setManualMode(false)}
          className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase text-text-muted border border-border-standard cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5" data-testid={`kb-ref-select-${kind}`}>
      <div className="flex items-center gap-1">
        <SelectDropdown
          value={knownMatch ? knownMatch.value : rawValue}
          onChange={handleSelect}
          options={options}
          placeholder={loading ? 'Loading known data…' : `Select ${kind}…`}
          ariaLabel={ariaLabel || `Select ${kind}`}
          size="sm"
          disabled={disabled || loading}
          className="flex-1"
        />
        {isCustom && (
          <span
            className="px-1 py-0.5 rounded text-[8px] font-mono bg-surface-container-high text-text-muted border border-border-standard whitespace-nowrap"
            title="Stored value does not match any known entity; it is kept as-is (legacy/custom value)."
          >
            custom value
          </span>
        )}
      </div>
      {error ? (
        <p className="text-[8px] text-red-400 font-mono flex items-center gap-1" role="alert">
          ⚠ {error}
          {typeof onRetry === 'function' && (
            <button
              type="button"
              onClick={onRetry}
              className="underline text-text-muted hover:text-on-surface cursor-pointer"
            >
              Retry
            </button>
          )}
        </p>
      ) : (
        helperText && <p className="text-[8px] text-text-muted font-mono">{helperText}</p>
      )}
      {!error && !loading && !disabled && knownOptions.length === 0 && (
        <p className="text-[8px] text-text-muted font-mono italic">
          No known {kind}s found — use manual entry.
        </p>
      )}
      {kind === 'project' && allowBuiltin && !error && !helperText && (
        <p className="text-[8px] text-text-muted font-mono">{kindLabel} selectors store ids.</p>
      )}
    </div>
  );
}

export default KBReferenceSelect;
