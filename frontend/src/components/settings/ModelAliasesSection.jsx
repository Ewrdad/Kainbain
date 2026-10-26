import { useCallback, useEffect, useRef, useState } from 'react';
import { useCollapsibleRows } from './useCollapsibleRows';
import { SelectDropdown } from '../common/SelectDropdown';
import { resolveStoredModelValidity } from '../common/ModelSelector';
import { splitReasoning, appendReasoning, resolveReasoningOptions, stripReasoningIfUnsupported, checkReasoningLevelText } from '../../services/modelKeys';
import {
  api,
  modelKeyForValue,
  groupModelsByProvider,
  normalizeModelRef,
} from '../../services/api';
import { modelBadgeNode } from '../../services/modelStatus';
import { ReliabilityLine } from './ReliabilityLine';
import {
  ALIAS_HARNESS_ID,
  getAliasTargets,
  normalizeAliasName,
  normalizeTargetPercents,
  validateModelAlias,
} from '../../../../shared/modelAliases.js';

/***
 * MARK: rowTargetsForEdit
 * @description Reads one draft alias row as editable target sub-rows,
 *   upgrading legacy single-target rows (`{ harness, model }`) to one
 *   100% target so the editor always works on a single shape. Draft rows
 *   already carrying a `targets` array are kept verbatim (even with a
 *   blank/invalid percent) so in-progress edits survive re-renders.
 * @example rowTargetsForEdit({ name: 's', harness: 'pi', model: 'm' }) => [{ harness: 'pi', model: 'm', percent: 100 }]
 * @param {Object} row - Draft alias row (either shape).
 * @returns {Array<Object>} Target sub-rows (at least one).
 ***/
export function rowTargetsForEdit(row) {
  // Draft preservation first: while the user is editing, `row.targets` may
  // hold rows that are not yet valid (a freshly added target, a cleared
  // percent field) and `getAliasTargets` would drop them — collapsing the
  // second target row back to one on the very next render. Keep every object
  // row verbatim (percent included, even ''/undefined) so in-progress edits
  // survive the onChange → draft-state → re-render round-trip; validation
  // (not the editor) is what flags the invalid rows.
  if (row && typeof row === 'object' && Array.isArray(row.targets) && row.targets.length > 0) {
    const draft = [];
    for (const t of row.targets) {
      if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
      draft.push({
        harness: typeof t.harness === 'string' ? t.harness : '',
        model: typeof t.model === 'string' ? t.model : '',
        percent: t.percent,
      });
    }
    if (draft.length > 0) return draft;
  }
  const targets = getAliasTargets(row);
  if (targets.length > 0) return targets.map((t) => ({ ...t }));
  return [{ harness: '', model: '', percent: 100 }];
}

/***
 * MARK: canonicalRowForSave
 * @description Folds edited target sub-rows back into one canonical alias
 *   row: `{ name, targets }` with the first target mirrored onto the legacy
 *   `harness`/`model` fields (rollback builds keep serving the top target).
 * @example canonicalRowForSave('s', [{ harness: 'pi', model: 'm', percent: 100 }]) => { name: 's', harness: 'pi', model: 'm', targets: [...] }
 * @param {string} name - Alias name.
 * @param {Array<Object>} targets - Edited target sub-rows.
 * @returns {Object} Canonical alias row.
 ***/
export function canonicalRowForSave(name, targets) {
  const rows = (Array.isArray(targets) ? targets : []).map((t) => ({
    harness: typeof t?.harness === 'string' ? t.harness : '',
    model: typeof t?.model === 'string' ? t.model : '',
    percent: t?.percent,
  }));
  return {
    name,
    harness: rows[0]?.harness || '',
    model: rows[0]?.model || '',
    targets: rows,
  };
}

/***
 * MARK: reasoningOptionsForTarget
 * @description Single source for the Q5 precedence behind every reasoning
 *   decision on an alias target: the selected model's `supportedReasoning`
 *   set when it carries a non-empty array, otherwise the harness entry's
 *   `reasoningLevels`, else `null` (null-harness targets stay level-free).
 *   Shared by `targetValidity`, `AliasTargetRow`, and the Q2 load-strip so
 *   the three can never drift apart. An unknown harness yields no entry —
 *   callers leave such targets untouched (loading races) or judge them
 *   elsewhere (`targetValidity` reports unknown-harness first).
 * @example reasoningOptionsForTarget({ harness: 'pi', model: 'google::m1' }, [{ id: 'pi', reasoningLevels: ['low'] }]) => { entry: {…}, options: ['low'], … }
 * @param {Object} target - One target sub-row (`{ harness, model }`).
 * @param {Array<Object>} catalogue - Catalogue harness view.
 * @returns {{entry: Object|undefined, options: string[]|null, model: string, harnessId: string}} The entry, resolved levels, and trimmed inputs.
 ***/
function reasoningOptionsForTarget(target, catalogue) {
  const harnessId = typeof target?.harness === 'string' ? target.harness.trim() : '';
  const model = typeof target?.model === 'string' ? target.model.trim() : '';
  const list = Array.isArray(catalogue) ? catalogue : [];
  const entry = list.find((h) => h?.id === harnessId);
  if (!entry) return { entry: undefined, options: null, model, harnessId };
  const modelsForHarness = Array.isArray(entry?.models) ? entry.models : [];
  const resolvedForModel = modelKeyForValue(modelsForHarness, splitReasoning(model).baseRef);
  const selectedModel = modelsForHarness.find(
    (m) => (m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id)) === resolvedForModel,
  );
  return {
    entry,
    options: resolveReasoningOptions({ harnessEntry: entry, selectedModel }),
    model,
    harnessId,
  };
}

/***
 * MARK: targetValidity
 * @description Classifies one alias target's harness↔model pairing against
 *   the catalogue harness view: `valid` (known harness, model resolves —
 *   or blank where blank is legal), `unknown-harness` (hard — the backend
 *   refuses the save), `unknown-model` (soft — the save succeeds with a
 *   warning; catalogues drift), `invalid` (hard pairing error, e.g. a model
 *   on a self-managed harness), or `blank` (an empty slot the row validator
 *   already flags). An empty catalogue judges nothing (still loading).
 * @example targetValidity({ harness: 'pi', model: 'google::m1' }, HARNESSES) => { status: 'valid', message: null }
 * @param {Object} target - One target sub-row (`{ harness, model }`).
 * @param {Array<Object>} harnesses - Catalogue harness view.
 * @returns {{status: string, message: string|null}} The validity + human-readable note.
 ***/
export function targetValidity(target, harnesses) {
  const harnessId = typeof target?.harness === 'string' ? target.harness.trim() : '';
  const model = typeof target?.model === 'string' ? target.model.trim() : '';
  const catalogue = Array.isArray(harnesses) ? harnesses : [];
  if (!harnessId || catalogue.length === 0) return { status: 'blank', message: null };
  const entry = catalogue.find((h) => h?.id === harnessId);
  if (!entry) {
    return {
      status: 'unknown-harness',
      message: `Unknown harness "${harnessId}" — pick a registered harness`,
    };
  }
  if ((entry.modelSelection || 'list') === 'none') {
    if (model) {
      return {
        status: 'invalid',
        message: `Harness "${harnessId}" manages its own model — leave the model blank`,
      };
    }
    return { status: 'valid', message: null };
  }
  if (!model) return { status: 'blank', message: null };
  const modelsForHarness = Array.isArray(entry?.models) ? entry.models : [];
  const { reasoning } = splitReasoning(model);
  if (reasoning) {
    const levelProblem = checkReasoningLevelText({ level: reasoning });
    const { options } = reasoningOptionsForTarget(target, catalogue);
    if (levelProblem) {
      return {
        status: 'invalid',
        message: `Harness "${harnessId}" model ref "${model}" has an invalid reasoning level "${reasoning}" (${levelProblem})`,
      };
    }
    if (!options) {
      return {
        status: 'invalid',
        message: `Harness "${harnessId}" does not support adjustable reasoning, but model "${model}" carries reasoning level "${reasoning}"`,
      };
    }
    if (!options.includes(reasoning)) {
      return {
        status: 'invalid',
        message: `Harness "${harnessId}" reasoning level "${reasoning}" is not supported (supported: ${options.join(', ')})`,
      };
    }
  }
  if (modelsForHarness.length === 0) return { status: 'blank', message: null };
  const validity = resolveStoredModelValidity(modelsForHarness, model);
  if (validity.status === 'unknown') {
    return {
      status: 'unknown-model',
      message: `Model "${model}" is not in the ${harnessId} catalogue right now`,
    };
  }
  return { status: 'valid', message: null };
}

/***
 * MARK: validateAliasList
 * @description Validates a whole alias table, returning per-row errors. Each
 *   row must satisfy the shared grammar (`validateModelAlias`, covering both
 *   legacy and weighted rows); names must be unique across the table (later
 *   duplicates are flagged, first wins at save — mirroring write-time
 *   dedupe); target percents must add to 100%; every target must name a
 *   registered harness (mirroring the API refusal — an empty catalogue
 *   judges nothing while loading); every target on a `list` harness needs
 *   a model; and every target on a self-managed `none` harness (muse,
 *   custom) must leave its model blank (mirroring the API refusal —
 *   dispatch would ignore the model there anyway). Catalog-miss models are
 *   NOT errors (soft backend warning only) — they render as badges.
 * @example validateAliasList([{ name: 's', harness: 'pi', model: '' }], [{ id: 'pi', modelSelection: 'list' }])
 *   => [{ index: 0, message: '…' }]
 * @param {Array<Object>} aliases - Draft alias rows.
 * @param {Array<Object>} harnesses - Catalogue harness view (for modelSelection lookup).
 * @returns {Array<{index: number, message: string}>} Row errors (empty when valid).
 ***/
export function validateAliasList(aliases, harnesses) {
  const list = Array.isArray(aliases) ? aliases : [];
  const errors = [];
  const seenNames = new Set();
  list.forEach((row, index) => {
    const sharedError = validateModelAlias(row);
    if (sharedError) {
      errors.push({ index, message: sharedError });
      return;
    }
    const name = normalizeAliasName(row?.name);
    if (seenNames.has(name)) {
      errors.push({
        index,
        message: `Duplicate alias name "${name}" — names must be unique per project`,
      });
      return;
    }
    seenNames.add(name);
    const catalogue = Array.isArray(harnesses) ? harnesses : [];
    for (const target of getAliasTargets(row)) {
      const harnessId = typeof target?.harness === 'string' ? target.harness.trim() : '';
      const entry = catalogue.find((h) => h?.id === harnessId);
      if (harnessId && catalogue.length > 0 && !entry) {
        errors.push({
          index,
          message: `Alias "${name}" targets unknown harness "${harnessId}" — pick a registered harness`,
        });
        return;
      }
      const selection = entry?.modelSelection || 'list';
      const validity = targetValidity(target, catalogue);
      // The validity gate adds the reasoning-level hard errors. A model on a
      // self-managed (`none`) harness keeps its historic alias-named message
      // from the checks below, so that path is excluded here.
      if (validity.status === 'invalid' && validity.message && selection !== 'none') {
        errors.push({ index, message: validity.message });
        return;
      }
      if (selection !== 'none' && !normalizeAliasName(target?.model)) {
        errors.push({
          index,
          message: `Alias "${name}" needs a model for the ${target.percent}% ${harnessId} target`,
        });
        return;
      }
      if (selection === 'none' && normalizeAliasName(target?.model)) {
        errors.push({
          index,
          message: `Alias "${name}" targets harness "${harnessId}", which manages its own model — leave the model blank`,
        });
        return;
      }
    }
  });
  return errors;
}

/***
 * MARK: aliasReliabilityByName
 * @description Folds a `GET /projects/:id/aliases/reliability` payload into
 *   alias entries keyed by trimmed alias name (null-prototype map, so a
 *   stored alias literally named e.g. `__proto__` can never poison lookups
 *   for other aliases). Non-array payloads fold to an empty map (fail-safe:
 *   no lines render rather than a crash); blank names are skipped; later
 *   duplicates win (the endpoint groups, so duplicates should not occur).
 *   Shared by the mount effect and the Retry handler so the two can never
 *   drift apart.
 * @example aliasReliabilityByName({ aliases: [{ aliasName: 'w', targets: [] }] }) => { w: { aliasName: 'w', … } }
 * @param {Object} [res] - Decoded reliability payload.
 * @returns {Object} Alias entries keyed by name (never null).
 ***/
export function aliasReliabilityByName(res) {
  const byAlias = Object.create(null);
  const list = Array.isArray(res?.aliases) ? res.aliases : [];
  for (const entry of list) {
    const name = typeof entry?.aliasName === 'string' ? entry.aliasName.trim() : '';
    if (!name) continue;
    // eslint-disable-next-line security/detect-object-injection -- write into our own null-prototype map: no prototype to poison
    byAlias[name] = entry;
  }
  return byAlias;
}

/***
 * MARK: sameModelRefForReliability
 * @description Decides whether two stored model refs name the same target for
 *   reliability lookup. Exact trimmed equality wins (the common case: the
 *   backend records the alias target's stored string verbatim). The harness
 *   halves must name the same non-blank harness first — one model id served
 *   by two harnesses is two deployment paths with separate failure modes,
 *   so they are never merged. Otherwise — when both refs are non-blank —
 *   each side is canonicalized through the shared model grammar
 *   (`provider::id` gains its harness prefix) so a catalogue key migration
 *   that re-spelled the stored ref cannot orphan years of history.
 *   Blank-vs-set pairs never match: an unmatched lookup must stay an honest
 *   no-data, never a neighbouring target's rate. Never throws (fail-safe:
 *   false on any error).
 * @example sameModelRefForReliability('google::m', 'pi', 'pi::google::m', 'pi') => true
 * @param {string} a - First stored model ref.
 * @param {string} harnessA - First target harness id.
 * @param {string} b - Second stored model ref.
 * @param {string} harnessB - Second target harness id.
 * @returns {boolean} True when both refs name the same model on one harness.
 ***/
export function sameModelRefForReliability(a, harnessA, b, harnessB) {
  const harnessLeft = typeof harnessA === 'string' ? harnessA.trim() : '';
  const harnessRight = typeof harnessB === 'string' ? harnessB.trim() : '';
  if (!harnessLeft || harnessLeft !== harnessRight) return false;
  const left = typeof a === 'string' ? a.trim() : '';
  const right = typeof b === 'string' ? b.trim() : '';
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return normalizeModelRef(left, harnessLeft) === normalizeModelRef(right, harnessRight);
  } catch {
    return false;
  }
}

/***
 * MARK: reliabilityForTarget
 * @description Finds one alias target's reliability bucket inside the
 *   `GET /projects/:id/aliases/reliability` payload: the alias entry keyed
 *   by exact trimmed name, then the target keyed by trimmed harness + model
 *   (blank model = harness-managed), with a canonical-equivalence fallback
 *   so legacy (`provider::id`) and canonical (`harness::provider::id`)
 *   spellings of the same model still find each other's history. Returns
 *   undefined when nothing is attributed yet — the line renders the honest
 *   no-data state, never a fake 0%.
 * @example reliabilityForTarget({ worker: { targets: [{ harness: 'pi', model: 'm', runs: 2 }] } }, 'worker', 'pi', 'm') => { harness: 'pi', … }
 * @param {Object|null} byAlias - Alias entries keyed by name (null until loaded).
 * @param {string} aliasName - Draft alias name.
 * @param {string} harness - Target harness id.
 * @param {string} model - Target model ref (blank when harness-managed).
 * @returns {Object|undefined} The target bucket, if attributed.
 ***/
export function reliabilityForTarget(byAlias, aliasName, harness, model) {
  if (!byAlias || typeof byAlias !== 'object') return undefined;
  const name = typeof aliasName === 'string' ? aliasName.trim() : '';
  if (!name) return undefined;
  // Read-only key lookup into our own fetch payload: an inherited key
  // ("constructor", …) resolves to no `targets` array and returns
  // undefined via the optional chain below — never a fake bucket.
  // eslint-disable-next-line security/detect-object-injection -- read-only lookup of an app-scoped alias key
  const entry = byAlias[name];
  const targets = Array.isArray(entry?.targets) ? entry.targets : [];
  const wantHarness = typeof harness === 'string' ? harness.trim() : '';
  const wantModel = typeof model === 'string' ? model.trim() : '';
  return targets.find(
    (t) =>
      (typeof t?.harness === 'string' ? t.harness.trim() : '') === wantHarness &&
      sameModelRefForReliability(
        typeof t?.model === 'string' ? t.model : '',
        typeof t?.harness === 'string' ? t.harness : '',
        wantModel,
        wantHarness,
      ),
  );
}

/***
 * MARK: reliabilityForAlias
 * @description Reads one alias's aggregate reliability bucket (all its
 *   targets combined) from the folded payload. Same fail-safe contract as
 *   the per-target read: undefined until attributed — the aggregate line
 *   renders loading or no-data, never a fake 0%.
 * @example reliabilityForAlias({ worker: { runs: 3 } }, 'worker') => { runs: 3 }
 * @param {Object|null} byAlias - Alias entries keyed by name (null until loaded).
 * @param {string} aliasName - Draft alias name.
 * @returns {Object|undefined} The alias aggregate bucket, if attributed.
 ***/
export function reliabilityForAlias(byAlias, aliasName) {
  if (!byAlias || typeof byAlias !== 'object') return undefined;
  const name = typeof aliasName === 'string' ? aliasName.trim() : '';
  if (!name) return undefined;
  // eslint-disable-next-line security/detect-object-injection -- read-only lookup of an app-scoped alias key
  const entry = byAlias[name];
  return entry && typeof entry === 'object' ? entry : undefined;
}

/***
 * MARK: aliasTargetReliabilityTitles
 * @description Tooltip wording for one alias target's reliability line:
 *   what the rate counts (clean runs vs timeouts/harness errors — the
 *   non-chosen failures) and the honest no-data wording. Same wording
 *   family as the harness note; the strings stay here so the alias view
 *   keeps owning its own prose.
 * @example aliasTargetReliabilityTitles('pi', 'google::m', { runs: 3, successes: 2, infraFailures: 1 }) => { title: '…', emptyTitle: '…' }
 * @param {string} harness - Target harness id.
 * @param {string} model - Target model ref (blank when harness-managed).
 * @param {Object} [stats] - Reliability bucket for the target, if any.
 * @returns {{title: string, emptyTitle: string}} Tooltip wording.
 ***/
export function aliasTargetReliabilityTitles(harness, model, stats) {
  const runs = stats?.runs || 0;
  const runWord = runs === 1 ? 'run' : 'runs';
  const subject =
    model && model.trim() ? `${harness} + ${model.trim()}` : `${harness} (harness-managed model)`;
  return {
    title: stats
      ? `All-time success rate for the ${subject} target over ${runs} ${runWord} (${stats.successes} clean, ${stats.infraFailures} timeouts or harness errors). Deliberate agent decisions to fail a stage are excluded.`
      : '',
    emptyTitle:
      'No attributed runs yet for this target — reliability appears after it completes stages.',
  };
}

/***
 * MARK: aliasReliabilityTitles
 * @description Tooltip wording for one alias's aggregate reliability line
 *   (all targets combined): what the rate counts and the honest no-data
 *   wording. Same wording family as the per-target note; the strings stay
 *   here so the alias view keeps owning its own prose.
 * @example aliasReliabilityTitles('worker', { runs: 3, successes: 2, infraFailures: 1 }) => { title: '…', emptyTitle: '…' }
 * @param {string} aliasName - Draft alias name.
 * @param {Object} [stats] - Aggregate reliability bucket for the alias, if any.
 * @returns {{title: string, emptyTitle: string}} Tooltip wording.
 ***/
export function aliasReliabilityTitles(aliasName, stats) {
  const runs = stats?.runs || 0;
  const runWord = runs === 1 ? 'run' : 'runs';
  const subject = aliasName && aliasName.trim() ? `"${aliasName.trim()}"` : 'this alias';
  return {
    title: stats
      ? `All-time success rate for alias ${subject} over ${runs} ${runWord} across all its targets (${stats.successes} clean, ${stats.infraFailures} timeouts or harness errors). Deliberate agent decisions to fail a stage are excluded.`
      : '',
    emptyTitle:
      'No attributed runs yet for this alias — reliability appears after its targets complete stages.',
  };
}

/***
 * MARK: AliasTargetRow
 * @description One weighted target card inside an alias: a header naming
 *   the target ("Target 2 · 40%", with the remove button beside it), the
 *   harness/model/percent inputs, and a footer grouping that target's
 *   resolution status with its own "Target reliability:" line. Every part
 *   of a target lives inside its own bordered card so the reliability
 *   rate can never be misread as belonging to a neighbouring target, and
 *   the card announces itself as a labelled group for assistive
 *   technology. Responsive layout: stacks full-width on mobile (<640px),
 *   restoring the 3-column grid on desktop (sm:+).
 * @example <AliasTargetRow aliasIndex={0} targetIndex={1} targetCount={2} target={{ harness: 'pi', model: 'm1', percent: 40 }} />
 *   => a bordered card titled "Target 2 · 40%" whose footer reads
 *      "Target reliability: …"
 ***/
function AliasTargetRow({
  aliasIndex,
  targetIndex,
  targetCount,
  target,
  targetHarnesses,
  disabled,
  onTargetChange,
  onRemoveTarget,
  reliability,
  reliabilityPending,
  showReliabilityLines,
}) {
  const harnessId = typeof target?.harness === 'string' ? target.harness.trim() : '';
  const [blockedHarnessId, setBlockedHarnessId] = useState(null);
  // Fail-safe: the row still renders its inputs when the catalogue prop ever
  // arrives non-array (loading races, future callers) — the validity helpers
  // already judge nothing on an empty catalogue.
  const catalogue = Array.isArray(targetHarnesses) ? targetHarnesses : [];
  const entry = catalogue.find((h) => h.id === harnessId);
  const selection = entry?.modelSelection || 'list';
  // Fail-safe: a malformed catalogue entry (models not an array) must never
  // crash the whole section — treat it as an empty model list so the row
  // still renders its harness/percent controls. `targetValidity` guards the
  // same way, so the row and its status badge stay consistent.
  const modelsForHarness = Array.isArray(entry?.models) ? entry.models : [];
  const resolvedModel = modelKeyForValue(modelsForHarness, target?.model || '');
  const { options: reasoningOptions } = reasoningOptionsForTarget(target, catalogue);
  const { reasoning: draftReasoning } = splitReasoning(target?.model || '');
  const modelsByValue = new Map(
    modelsForHarness.map((m) => [m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id), m]),
  );
  const modelOptions = groupModelsByProvider(modelsForHarness).map((option) => {
    const model = modelsByValue.get(option.value);
    const badge = model ? modelBadgeNode(model) : null;
    return badge ? { ...option, badge } : option;
  });
  // First target keeps the historic labels so single-target rows read
  // exactly like the old one-harness-per-alias table.
  const single = targetCount === 1;
  const harnessLabel = single
    ? `Alias ${aliasIndex + 1} harness`
    : `Alias ${aliasIndex + 1} target ${targetIndex + 1} harness`;
  const modelLabel = single
    ? `Alias ${aliasIndex + 1} model`
    : `Alias ${aliasIndex + 1} target ${targetIndex + 1} model`;
  const percentLabel = single
    ? `Alias ${aliasIndex + 1} percent`
    : `Alias ${aliasIndex + 1} target ${targetIndex + 1} percent`;
  const managedNoteTestId = single
    ? `model-alias-managed-note-${aliasIndex}`
    : `model-alias-target-managed-note-${aliasIndex}-${targetIndex}`;
  const validity = targetValidity(target, catalogue);
  const validityTestId = `model-alias-target-validity-${aliasIndex}-${targetIndex}`;
  // The card's accessible name: which alias and which target (plus harness)
  // the grouped controls belong to.
  const cardLabel = single
    ? `Alias ${aliasIndex + 1} target`
    : `Alias ${aliasIndex + 1} target ${targetIndex + 1} (${harnessId || 'unassigned'})`;
  const shareSuffix =
    typeof target?.percent === 'number' && !Number.isNaN(target.percent)
      ? ` · ${target.percent}%`
      : '';
  const headerText = single ? 'Target' : `Target ${targetIndex + 1}${shareSuffix}`;
  const showTargetFooter = validity.status !== 'blank' || showReliabilityLines;
  return (
    <div
      data-testid="model-alias-target-row"
      role="group"
      aria-label={cardLabel}
      className="p-2.5 rounded-sm bg-surface-subtle border border-border-standard flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-standard/40 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {headerText}
        </span>
        {!single && (
          <button
            type="button"
            aria-label={`Remove ${target?.harness || 'target'} target from alias ${aliasIndex + 1}`}
            onClick={onRemoveTarget}
            disabled={disabled}
            title="Remove this target"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-text-muted hover:text-error disabled:opacity-50 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
      <div className={`grid grid-cols-1 ${reasoningOptions && selection !== 'none' ? 'sm:grid-cols-[1fr_1fr_1fr_64px]' : 'sm:grid-cols-[1fr_1fr_64px]'} gap-2 items-start`}>
        <div className="flex flex-col gap-1 min-w-0">
          <label
            className="text-[9px] font-bold uppercase text-text-muted tracking-wider"
            htmlFor={`model-alias-harness-${aliasIndex}-${targetIndex}`}
          >
            Harness
          </label>
          <SelectDropdown
            id={`model-alias-harness-${aliasIndex}-${targetIndex}`}
            ariaLabel={harnessLabel}
            value={harnessId}
            onChange={(next) => {
              const nextEntry = catalogue.find((h) => h.id === next);
              const nextOptions = resolveReasoningOptions({ harnessEntry: nextEntry });
              const { reasoning: currentLevel } = splitReasoning(target?.model || '');
              if (currentLevel && nextOptions === null) {
                setBlockedHarnessId(next);
                return;
              }
              setBlockedHarnessId(null);
              onTargetChange({ harness: next, model: '' });
            }}
            disabled={disabled}
            size="sm"
            options={catalogue.map((h) => ({
              value: h.id,
              label: h.label || h.id,
            }))}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label
            className="text-[9px] font-bold uppercase text-text-muted tracking-wider"
            htmlFor={`model-alias-model-${aliasIndex}-${targetIndex}`}
          >
            Model
          </label>
          {selection === 'none' ? (
            <div className="flex items-center gap-2 py-2">
              <p className="text-[10px] text-text-muted" data-testid={managedNoteTestId}>
                Harness manages its own model.
              </p>
              {typeof target?.model === 'string' && target.model.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => onTargetChange({ model: '' })}
                  disabled={disabled}
                  aria-label={`Clear stored model for alias ${aliasIndex + 1} target ${targetIndex + 1}`}
                  title={`Clear the stored model "${target.model.trim()}" (this harness manages its own model)`}
                  className="px-2 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <SelectDropdown
              id={`model-alias-model-${aliasIndex}-${targetIndex}`}
              ariaLabel={modelLabel}
              value={resolvedModel}
              onChange={(next) => {
                const { reasoning: currentLevel } = splitReasoning(target?.model || '');
                if (currentLevel && next) {
                  try {
                    onTargetChange({ model: appendReasoning(next, currentLevel) });
                  } catch {
                    onTargetChange({ model: next });
                  }
                } else {
                  onTargetChange({ model: next });
                }
              }}
              disabled={disabled}
              size="sm"
              options={modelOptions}
            />
          )}
        </div>
        {reasoningOptions && selection !== 'none' && (
          <div className="flex flex-col gap-1 min-w-0">
            <label
              className="text-[9px] font-bold uppercase text-text-muted tracking-wider"
              htmlFor={`model-alias-reasoning-${aliasIndex}-${targetIndex}`}
            >
              Reasoning
            </label>
            <SelectDropdown
              id={`model-alias-reasoning-${aliasIndex}-${targetIndex}`}
              ariaLabel="Reasoning"
              value={draftReasoning || ''}
              onChange={(level) => {
                const base = resolvedModel || splitReasoning(target?.model || '').baseRef;
                if (!base) return;
                if (level) {
                  try {
                    onTargetChange({ model: appendReasoning(base, level) });
                  } catch {
                    onTargetChange({ model: base });
                  }
                } else {
                  onTargetChange({ model: base });
                }
              }}
              disabled={disabled}
              size="sm"
              options={[
                { value: '', label: 'Default (no level)' },
                ...reasoningOptions.map((lvl) => ({ value: lvl, label: lvl })),
              ]}
            />
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <label
            className="text-[9px] font-bold uppercase text-text-muted tracking-wider"
            htmlFor={`model-alias-percent-${aliasIndex}-${targetIndex}`}
          >
            %
          </label>
          <input
            id={`model-alias-percent-${aliasIndex}-${targetIndex}`}
            aria-label={percentLabel}
            type="number"
            min={1}
            max={100}
            step={1}
            value={target?.percent ?? ''}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              onTargetChange({ percent: Number.isNaN(parsed) ? '' : parsed });
            }}
            disabled={disabled || single}
            title={
              single
                ? 'A single target always serves 100% — add another target to split the alias'
                : undefined
            }
            placeholder="100"
            className="p-2 bg-surface-deep border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
      </div>
      {/* Same guard as the shared picker: the notice only names a real
          blocker (a pending switch plus a level still on the target). A
          level cleared through the Reasoning dropdown retires the notice;
          the next switch resets the pending state. */}
      {blockedHarnessId && splitReasoning(target?.model || '').reasoning && (
        <div data-testid="reasoning-clear-notice" className="flex items-center gap-2 text-[10px] text-text-muted">
          <span>Clear the reasoning level first</span>
          <button
            type="button"
            onClick={() => {
              // One-click unblock: drop the level and complete the pending
              // switch. The model resets like every harness switch (the row's
              // normal path always clears the model on harness change).
              onTargetChange({ harness: blockedHarnessId, model: '' });
              setBlockedHarnessId(null);
            }}
            disabled={disabled}
            className="px-2 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
      {showTargetFooter && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pt-1.5 border-t border-border-standard/40">
          <div className="min-w-0">
            {validity.status === 'valid' && (
              <p
                data-testid={validityTestId}
                title="This target resolves against the current catalogue"
                className="text-[10px] text-green-600 dark:text-green-400"
              >
                ✓ Resolves
              </p>
            )}
            {validity.status === 'unknown-model' && (
              <p
                data-testid={validityTestId}
                title={validity.message}
                className="text-[10px] font-bold text-amber-600 dark:text-amber-400"
              >
                ⚠ Unknown model — saves with a warning
              </p>
            )}
            {(validity.status === 'unknown-harness' || validity.status === 'invalid') && (
              <p
                data-testid={validityTestId}
                title={validity.message}
                className="text-[10px] font-bold text-error"
              >
                ✕ {validity.message}
              </p>
            )}
          </div>
          {showReliabilityLines && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-text-muted">Target reliability:</span>
              <ReliabilityLine
                testId={`alias-reliability-${aliasIndex}-${targetIndex}`}
                stats={reliability}
                pending={reliabilityPending}
                showRecent
                {...aliasTargetReliabilityTitles(harnessId, target?.model, reliability)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/***
 * MARK: formatAliasSummary
 * @description Produces a concise human-readable summary string of an alias's
 *   targets for the collapsed header card (e.g. "1 target · 100% Muse" or
 *   "2 targets · 50% pi (m1), 50% Antigravity").
 * @example formatAliasSummary([{ harness: 'muse', percent: 100 }], harnesses) => "1 target · 100% Muse"
 * @param {Array<Object>} targets - Edited or draft target sub-rows.
 * @param {Array<Object>} [targetHarnesses=[]] - Catalogue harness view.
 * @returns {string} Summary preview text.
 ***/
export function formatAliasSummary(targets, targetHarnesses = []) {
  const list = Array.isArray(targets) ? targets : [];
  if (list.length === 0) return '0 targets';
  const countStr = list.length === 1 ? '1 target' : `${list.length} targets`;
  const parts = list.map((t) => {
    const harnessId = typeof t?.harness === 'string' ? t.harness.trim() : '';
    const entry = (Array.isArray(targetHarnesses) ? targetHarnesses : []).find(
      (h) => h?.id === harnessId,
    );
    const harnessName = entry?.label || harnessId || 'unassigned';
    const percentStr =
      typeof t?.percent === 'number' && !Number.isNaN(t.percent) ? `${t.percent}%` : '';

    let targetDesc = harnessName;
    if (
      entry?.modelSelection !== 'none' &&
      t?.model &&
      typeof t.model === 'string' &&
      t.model.trim()
    ) {
      targetDesc = `${harnessName} (${t.model.trim()})`;
    }
    return percentStr ? `${percentStr} ${targetDesc}` : targetDesc;
  });
  return `${countStr} · ${parts.join(', ')}`;
}

/***
 * MARK: CollapseToggleButton
 * @description Shared expand/collapse chevron for one alias card header.
 *   Single source for the toggle's test id, ARIA wiring (`aria-expanded` /
 *   `aria-controls` / `aria-label`), and chevron glyph, so the collapsed and
 *   expanded headers cannot drift apart.
 * @example <CollapseToggleButton index={0} aliasName="small" expanded onToggle={() => toggle(key)} disabled={false} />
 * @param {Object} props
 * @param {number} props.index - Positional alias index (test ids + control ids).
 * @param {string} props.aliasName - Draft alias name (accessible label fallback).
 * @param {boolean} props.expanded - True when the card body is visible.
 * @param {Function} props.onToggle - Click handler.
 * @param {boolean} [props.disabled=false] - Disables the toggle.
 ***/
function CollapseToggleButton({ index, aliasName, expanded, onToggle, disabled = false }) {
  const label = aliasName || index + 1;
  return (
    <button
      type="button"
      data-testid={`model-alias-toggle-${index}`}
      aria-expanded={expanded}
      aria-controls={`model-alias-body-${index}`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} alias ${label}`}
      onClick={onToggle}
      disabled={disabled}
      className="px-1.5 py-0.5 text-xs text-text-muted hover:text-on-surface cursor-pointer select-none font-mono"
    >
      {expanded ? '▾' : '▸'}
    </button>
  );
}

/***
 * MARK: DeleteAliasButton
 * @description Shared delete button for one alias card header. Single source
 *   for the accessible label and styling, so the collapsed and expanded
 *   headers cannot drift apart.
 * @example <DeleteAliasButton index={0} aliasName="small" onDelete={() => deleteRow(0)} disabled={false} />
 * @param {Object} props
 * @param {number} props.index - Positional alias index.
 * @param {string} props.aliasName - Draft alias name (accessible label fallback).
 * @param {Function} props.onDelete - Click handler.
 * @param {boolean} [props.disabled=false] - Disables the button.
 ***/
function DeleteAliasButton({ index, aliasName, onDelete, disabled = false }) {
  return (
    <button
      type="button"
      aria-label={`Delete alias ${aliasName || index + 1}`}
      onClick={onDelete}
      disabled={disabled}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-text-muted hover:text-error disabled:opacity-50 cursor-pointer"
    >
      ✕
    </button>
  );
}

/***
 * MARK: ModelAliasesSection
 * @description The per-project model-alias table (Settings › Model Aliases):
 *   one section per alias (name, 1..N weighted target sub-rows, percent
 *   split, delete) plus an add-alias button. Alias cards default to collapsed
 *   on initial render to reduce clutter, while newly added cards open
 *   immediately and remain fully editable. Each alias card can be collapsed
 *   into a compact summary row or expanded to edit its full configuration,
 *   with global Collapse All / Expand All controls when multiple aliases
 *   exist. Each target picks a real harness (the virtual `alias` entry is
 *   excluded — aliases cannot point at aliases) with its model dropdown
 *   scoped to that harness, and a percent share; the shares must add to
 *   exactly 100% (the normalize button spreads 100% evenly). Dispatch serves
 *   the targets in smooth round-robin rotation, so a 90/10 split sends every
 *   10th run to the minority target. Reliability metrics are grouped so each
 *   rate reads as its own subject: the alias's aggregate rate sits in a
 *   labeled "Overall Alias Reliability" bar above the targets, and each
 *   target card carries its own "Target reliability:" line in its footer —
 *   no rate can be misread as belonging to a neighbouring target. Edits
 *   flow to the caller via `onChange`
 *   and persist with the Settings save; renaming an alias migrates every
 *   referencing stage in the same save (see `inferAliasRenames`).
 * @example <ModelAliasesSection aliases={aliases} onChange={setAliases} harnesses={harnesses} usagesForName={(n) => findAliasUsages(project, n)} />
 * @param {Object} props
 * @param {Array<Object>} [props.aliases=[]] - Draft alias rows.
 * @param {Function} props.onChange - Change handler receiving the next rows.
 * @param {Array<Object>} [props.harnesses=[]] - Catalogue harness view.
 * @param {boolean} [props.disabled=false]
 * @param {Function} [props.usagesForName] - `(name) => { stages, usesAsDefault }` for the usage hint.
 * @param {string} [props.projectId] - Owning project id: scopes the per-target
 *   reliability fetch (`GET /projects/:id/aliases/reliability`). Without it
 *   no reliability lines render.
 ***/
export function ModelAliasesSection({
  aliases = [],
  onChange,
  harnesses = [],
  disabled = false,
  usagesForName,
  projectId,
}) {
  const rows = Array.isArray(aliases) ? aliases : [];

  // Collapse state keyed by stable per-row keys (not array indices), so
  // adding/deleting rows never misassigns collapse state. Row data stays in
  // the parent `rows` array — collapse only hides bodies, so every row
  // submits, validates, and resets identically collapsed or expanded.
  const {
    keys: rowKeys,
    isCollapsed,
    toggle: toggleCollapse,
    collapseAll,
    expandAll,
    allCollapsed,
    addRowKey,
    removeRowKeyAt,
  } = useCollapsibleRows(rows.length, { startCollapsed: true });
  const shouldFocusNewRowRef = useRef(false);

  // Per-alias per-target reliability (`GET /projects/:id/aliases/reliability`):
  // entries keyed by alias name (null until the one-shot fetch lands; a
  // failed fetch flips reliabilityError instead of faking zeros). Without a
  // project id there is nothing to scope the fetch to, so no lines render.
  const [reliabilityByAlias, setReliabilityByAlias] = useState(null);
  const [reliabilityError, setReliabilityError] = useState(false);

  /***
   * MARK: loadAliasReliability
   * @description (Re)fetches the project-scoped alias reliability into the
   *   per-alias map. Event-handler only (the Retry button): the mount
   *   effect below inlines its own fetch so no synchronous setState runs
   *   inside an effect.
   **/
  const loadAliasReliability = useCallback(async () => {
    if (!projectId || typeof api.getAliasReliability !== 'function') return;
    setReliabilityError(false);
    try {
      const res = await api.getAliasReliability(projectId);
      setReliabilityByAlias(aliasReliabilityByName(res));
    } catch {
      setReliabilityError(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof api.getAliasReliability !== 'function') return undefined;
    let cancelled = false;
    api
      .getAliasReliability(projectId)
      .then((res) => {
        if (cancelled) return;
        setReliabilityByAlias(aliasReliabilityByName(res));
      })
      .catch(() => {
        if (!cancelled) setReliabilityError(true);
      });
    return () => {
      cancelled = true;
    };
    // One-shot fetch on mount / project change (same pattern as
    // HarnessSection's reliability fetch). No exhaustive-deps disable: the
    // effect references only projectId.
  }, [projectId]);

  // Q2: a stored `::level` on a null-reasoning harness collapses to the
  // bare ref on load. Runs only once a real catalogue is present (an empty
  // catalogue judges nothing, so loading races never destroy data) and
  // settles on its own: stripped rows no longer match, so no further
  // onChange fires. Row shapes are preserved — legacy single-target rows
  // keep their `{ harness, model }` form; only the model string changes.
  useEffect(() => {
    if (!Array.isArray(harnesses) || harnesses.length === 0) return;
    if (!Array.isArray(aliases) || aliases.length === 0) return;
    let changed = false;
    const next = aliases.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      if (Array.isArray(row.targets) && row.targets.length > 0) {
        let rowChanged = false;
        const targets = row.targets.map((t) => {
          if (!t || typeof t !== 'object' || Array.isArray(t)) return t;
          const model = typeof t.model === 'string' ? t.model : '';
          if (!splitReasoning(model).reasoning) return t;
          const { entry, options } = reasoningOptionsForTarget(t, harnesses);
          if (!entry || options !== null) return t;
          rowChanged = true;
          return { ...t, model: stripReasoningIfUnsupported(model, null) };
        });
        if (!rowChanged) return row;
        changed = true;
        return { ...row, targets };
      }
      const model = typeof row.model === 'string' ? row.model : '';
      if (!splitReasoning(model).reasoning) return row;
      const { entry, options } = reasoningOptionsForTarget(
        { harness: row.harness, model },
        harnesses,
      );
      if (!entry || options !== null) return row;
      changed = true;
      return { ...row, model: stripReasoningIfUnsupported(model, null) };
    });
    if (changed) onChange?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliases, harnesses]);

  // Reliability lines render in three states: loading (the fetch has not
  // landed yet — each line says so explicitly instead of vanishing),
  // ready (rates or honest no-data), or hidden on fetch failure (the error
  // note + Retry above owns that state — never fake zeros). Without a
  // project id there is nothing to scope the fetch to, so no lines render
  // at all (a loading line would promise a fetch that never runs).
  //
  // `reliabilitySupported` mirrors the api guard in the fetch effect: when
  // the build has no alias reliability reader there is no pending fetch to
  // wait for, so gating on it prevents a perpetual "Loading reliability…"
  // state (same contract as HarnessSection).
  const reliabilitySupported = typeof api.getAliasReliability === 'function';
  const reliabilityPending =
    reliabilitySupported && !reliabilityError && reliabilityByAlias === null;
  const showReliabilityLines = reliabilitySupported && !reliabilityError && Boolean(projectId);
  // Real harnesses only: an alias can never target the virtual entry.
  const targetHarnesses = (Array.isArray(harnesses) ? harnesses : []).filter(
    (h) => h?.id && h.id !== ALIAS_HARNESS_ID,
  );
  const errors = validateAliasList(rows, harnesses);
  const errorFor = (index) => errors.find((e) => e.index === index)?.message || '';

  const updateRow = (index, name, targets) => {
    onChange?.(
      rows.map((row, i) =>
        i === index ? canonicalRowForSave(name ?? row?.name ?? '', targets) : row,
      ),
    );
  };

  const addRow = () => {
    // New rows start expanded; the key is registered in the same event as
    // the row so lengths stay in sync on the next render.
    addRowKey();
    shouldFocusNewRowRef.current = true;
    onChange?.([
      ...rows,
      canonicalRowForSave('', [{ harness: targetHarnesses[0]?.id || '', model: '', percent: 100 }]),
    ]);
  };

  const deleteRow = (index) => {
    removeRowKeyAt(index);
    onChange?.(rows.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (shouldFocusNewRowRef.current && rows.length > 0) {
      shouldFocusNewRowRef.current = false;
      const lastIndex = rows.length - 1;
      // Persist the open state in the hook for the fresh row so it stays
      // open after the focus pass even when it was initialised collapsed.
      // eslint-disable-next-line security/detect-object-injection -- positional read of our own key
      const key = rowKeys[lastIndex];
      if (key && isCollapsed(key)) {
        toggleCollapse(key);
      }
      const input = document.getElementById(`model-alias-name-${lastIndex}`);
      input?.focus();
    }
  }, [rows.length, rowKeys, isCollapsed, toggleCollapse]);

  return (
    <div data-testid="model-aliases-section" className="space-y-3 max-w-2xl">
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-high flex items-center gap-2">
        <span className="text-primary">🏷️</span> Model Aliases
      </h3>
      <p className="text-[10px] text-text-muted">
        Named harness + model combinations (e.g. small, medium, large, design) selectable through
        the <span className="font-mono text-primary">Alias</span> harness in every model picker. An
        alias can split across several targets with a percent share each (e.g. 90% Muse / 10%
        antigravity to balance quota) — runs rotate through the targets so the shares land evenly
        instead of clustering. Editing an alias updates all stages using it — renaming migrates
        every reference in the same save. Deleting an alias a stage still uses warns loudly and
        falls back to the project default. Targets on reasoning-capable harnesses (pi, antigravity,
        mock) show a Reasoning dropdown — Default (no level) stores the bare model reference.
      </p>
      <p data-testid="alias-reliability-note" className="text-[11px] text-text-muted">
        Reliability counts timeouts and harness errors as failures; deliberate agent decisions to
        fail a stage are excluded from the rate. Each target shows its own all-time rate for this
        project only.
      </p>
      {reliabilityError && (
        <div data-testid="alias-reliability-error" className="flex items-center gap-3">
          <p className="text-[11px] text-text-muted">Could not load alias reliability.</p>
          <button
            type="button"
            onClick={loadAliasReliability}
            className="text-[11px] underline text-primary cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
      {rows.length > 1 && (
        <div className="flex items-center justify-between pb-1 pt-1">
          <span
            data-testid="model-aliases-count"
            className="text-[11px] font-medium text-text-muted"
          >
            {rows.length} configured {rows.length === 1 ? 'alias' : 'aliases'}
          </span>
          <button
            type="button"
            data-testid="model-aliases-collapse-all-toggle"
            onClick={allCollapsed ? expandAll : collapseAll}
            disabled={disabled}
            className="px-2 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
          >
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-[11px] text-text-muted" data-testid="model-aliases-empty">
          No aliases yet — add one to offer short names like{' '}
          <code className="font-mono text-primary">small</code> in the model pickers.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => {
            // Transient fallback only: on the single render where the parent
            // replaced the array externally (discard/reset), keys reconcile
            // above via a render-phase update and the next render carries the
            // real keys. Fallbacks start expanded and submit identically —
            // collapse never owns row data, only visibility.
            // eslint-disable-next-line security/detect-object-injection
            const key = rowKeys[index] || `alias-key-fallback-${index}`;
            // The fresh row's key is minted by addRowKey() outside the
            // collapsed set, so it already renders expanded here; the focus
            // effect below only persists that open state in the hook.
            const collapsed = isCollapsed(key);
            const targets = rowTargetsForEdit(row);
            const total = targets.reduce(
              (sum, t) => sum + (typeof t?.percent === 'number' ? t.percent : 0),
              0,
            );
            const usage =
              normalizeAliasName(row?.name) && typeof usagesForName === 'function'
                ? usagesForName(normalizeAliasName(row.name))
                : null;
            const usageCount = usage?.stages?.length || 0;
            const rowError = errorFor(index);
            const aliasStats = reliabilityForAlias(reliabilityByAlias, row?.name);
            const setTargets = (next) => updateRow(index, row?.name, next);

            return (
              <div
                key={key}
                data-testid="model-alias-row"
                className="flex flex-col gap-2 p-2 bg-surface-container border border-border-standard rounded-sm"
              >
                {collapsed ? (
                  <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <CollapseToggleButton
                        index={index}
                        aliasName={row?.name}
                        expanded={false}
                        onToggle={() => toggleCollapse(key)}
                        disabled={disabled}
                      />
                      <span
                        id={`model-alias-header-${index}`}
                        className="text-xs font-mono font-bold text-on-surface truncate"
                        title={row?.name || `Alias ${index + 1}`}
                      >
                        {row?.name || `Alias ${index + 1}`}
                      </span>
                      <span
                        data-testid={`model-alias-summary-${index}`}
                        className="px-1.5 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] text-text-muted font-mono"
                      >
                        {formatAliasSummary(targets, targetHarnesses)}
                      </span>
                      {rowError && (
                        <span
                          role="alert"
                          data-testid={`model-alias-error-alert-${index}`}
                          className="inline-flex"
                        >
                          {/* Read-only view change: intentionally not disabled —
                              expanding a card to read its error mutates
                              nothing, even while the section is saving. */}
                          <button
                            type="button"
                            data-testid={`model-alias-error-badge-${index}`}
                            onClick={() => toggleCollapse(key)}
                            title={`${rowError} (Click to expand)`}
                            className="px-1.5 py-0.5 bg-error/10 border border-error/50 rounded-sm text-[10px] font-bold text-error cursor-pointer"
                          >
                            ⚠ {rowError}
                          </button>
                        </span>
                      )}
                      {showReliabilityLines && (
                        <div className="text-[10px] text-text-muted">
                          {/* Collapsed cards stay compact: the visual badge is
                              unchanged, but assistive technology hears that
                              this rate is the alias aggregate, not a target's. */}
                          <span className="sr-only">Overall alias reliability: </span>
                          <ReliabilityLine
                            testId={`alias-reliability-${index}`}
                            stats={aliasStats}
                            pending={reliabilityPending}
                showRecent
                            {...aliasReliabilityTitles(row?.name, aliasStats)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <DeleteAliasButton
                        index={index}
                        aliasName={row?.name}
                        onDelete={() => deleteRow(index)}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CollapseToggleButton
                          index={index}
                          aliasName={row?.name}
                          expanded
                          onToggle={() => toggleCollapse(key)}
                          disabled={disabled}
                        />
                        <span
                          id={`model-alias-header-${index}`}
                          className="text-xs font-bold uppercase text-text-muted tracking-wider"
                        >
                          {row?.name ? `Alias: ${row.name}` : `Alias ${index + 1}`}
                        </span>
                      </div>
                      <DeleteAliasButton
                        index={index}
                        aliasName={row?.name}
                        onDelete={() => deleteRow(index)}
                        disabled={disabled}
                      />
                    </div>
                    <div
                      id={`model-alias-body-${index}`}
                      role="region"
                      aria-labelledby={`model-alias-header-${index}`}
                      className="flex flex-col gap-2 pt-1"
                    >
                      <div className="flex flex-col gap-1">
                        <label
                          className="text-[9px] font-bold uppercase text-text-muted tracking-wider"
                          htmlFor={`model-alias-name-${index}`}
                        >
                          Name
                        </label>
                        <input
                          id={`model-alias-name-${index}`}
                          aria-label={`Alias ${index + 1} name`}
                          type="text"
                          value={row?.name || ''}
                          onChange={(e) => updateRow(index, e.target.value, targets)}
                          disabled={disabled}
                          placeholder="small"
                          className="p-2 bg-surface-deep border border-border-standard rounded-sm text-xs font-mono text-on-surface outline-none focus:border-primary"
                        />
                      </div>
                      {showReliabilityLines && (
                        <div
                          data-testid={`model-alias-aggregate-reliability-${index}`}
                          role="group"
                          aria-label={`Alias ${index + 1} overall reliability`}
                          className="flex items-center justify-between gap-2 p-2 rounded-sm bg-surface-subtle border border-border-standard"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                            Overall Alias Reliability
                          </span>
                          <ReliabilityLine
                            testId={`alias-reliability-${index}`}
                            stats={aliasStats}
                            pending={reliabilityPending}
                showRecent
                            {...aliasReliabilityTitles(row?.name, aliasStats)}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1 pb-0.5">
                        <span
                          id={`model-alias-targets-heading-${index}`}
                          className="text-[10px] font-bold uppercase text-text-muted tracking-wider"
                        >
                          Targets ({targets.length})
                        </span>
                      </div>
                      <div
                        id={`alias-targets-${index}`}
                        role="group"
                        aria-labelledby={`model-alias-targets-heading-${index}`}
                        className="space-y-2"
                      >
                        {targets.map((target, targetIndex) => (
                          <AliasTargetRow
                            key={targetIndex}
                            aliasIndex={index}
                            targetIndex={targetIndex}
                            targetCount={targets.length}
                            target={target}
                            targetHarnesses={targetHarnesses}
                            disabled={disabled}
                            onTargetChange={(patch) =>
                              setTargets(
                                targets.map((t, i) => (i === targetIndex ? { ...t, ...patch } : t)),
                              )
                            }
                            onRemoveTarget={() =>
                              setTargets(targets.filter((_, i) => i !== targetIndex))
                            }
                            reliability={reliabilityForTarget(
                              reliabilityByAlias,
                              row?.name,
                              target?.harness,
                              target?.model,
                            )}
                            reliabilityPending={reliabilityPending}
                            showReliabilityLines={showReliabilityLines}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          data-testid={`model-alias-total-${index}`}
                          className="text-[11px] font-mono text-text-muted"
                        >
                          Total: {total}%
                        </span>
                        {targets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTargets(normalizeTargetPercents(targets))}
                            disabled={disabled}
                            aria-label={`Normalize alias ${index + 1} shares to 100 percent`}
                            className="px-2 py-1 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
                          >
                            Normalize to 100%
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setTargets(
                              normalizeTargetPercents([
                                ...targets,
                                { harness: targetHarnesses[0]?.id || '', model: '' },
                              ]),
                            )
                          }
                          disabled={disabled}
                          aria-label={`Add target to alias ${index + 1}`}
                          className="px-2 py-1 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
                        >
                          + Add target
                        </button>
                      </div>
                      {(rowError || usageCount > 0 || usage?.usesAsDefault) && (
                        <div>
                          {rowError && (
                            <p role="alert" className="text-[11px] font-bold text-error">
                              {rowError}
                            </p>
                          )}
                          {!rowError && (usageCount > 0 || usage?.usesAsDefault) && (
                            <p className="text-[10px] text-text-muted">
                              Used by {usageCount} stage{usageCount === 1 ? '' : 's'}
                              {usage?.usesAsDefault ? ' + the project default' : ''} — edits apply
                              everywhere.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="px-3 py-1.5 bg-surface-deep border border-border-standard rounded-sm text-xs font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
      >
        + Add alias
      </button>
    </div>
  );
}

export default ModelAliasesSection;
