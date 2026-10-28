// Domain: services — model-key helpers, built on the SAME canonical grammar
// as the backend (`shared/modelKeys.js`, imported directly so the two cannot
// drift). api.js re-exports every name below unchanged.

/***
 * MARK: model keys (frontend mirror of the shared grammar)
 * @description The frontend's model-key helpers, built on the SAME canonical
 *   implementation as the backend (`shared/modelKeys.js`, plain ESM, zero
 *   deps — imported directly so the two grammars cannot drift). A model is
 *   referenced by one of four forms:
 *
 *     1. `harness::provider::id::reasoning` — canonical with reasoning level (optional 4th segment)
 *     2. `harness::provider::id`             — canonical, harness-scoped
 *     3. `provider::id`                     — legacy composite key (still accepted)
 *     4. bare `id` or `name`                — oldest form (first-match fallback)
 *
 *   Parsing splits on the first three `::` occurrences only (model ids may
 *   contain single `:`, never `::`); five-plus segments are malformed.
 *   Malformed references pass through untouched so stored sentinel values
 *   keep resolving via the fallbacks.
 ***/
import {
  modelKey,
  harnessModelKey,
  parseModelKey,
  splitReasoning,
  stripReasoning,
  resolveModel,
} from '../../../shared/modelKeys.js';

export {
  MODEL_KEY_SEP,
  modelKey,
  harnessModelKey,
  parseModelKey,
  splitReasoning,
  stripReasoning,
  appendReasoning,
  checkReasoningLevelText,
  validateModelRefShape,
  classifiesForeignHarness,
  normalizeModelRef,
  resolveModel,
  resolveModelFromRegistry,
} from '../../../shared/modelKeys.js';

/***
 * MARK: modelOptionValue
 * @description Returns the unique dropdown value for a model, preferring the
 *   backend-provided `key` field (harness-scoped `harness::provider::id` from
 *   the current API) and falling back to a locally-computed composite key —
 *   harness-scoped when the model carries its owning `harness`.
 * @param {Object} m - Model object.
 * @returns {string}
 **/
export function modelOptionValue(m) {
  if (m?.key) return m.key;
  if (m?.harness && m?.provider) return harnessModelKey(m.harness, m.provider, m.id);
  if (m?.provider) return modelKey(m.provider, m.id);
  return m?.id ?? '';
}

/***
 * MARK: modelKeyForValue
 * @description Resolves a stored model reference to the option value that
 *   corresponds to an entry in the current model list. Handles backward
 *   compatibility for values persisted before harness-scoped keys existed —
 *   bare ids/names AND legacy `provider::id` keys are remapped onto the
 *   first matching model (preferring a harness match for 3-part references)
 *   so the switcher still highlights a valid option.
 * @param {Array<Object>} models - Available models.
 * @param {string} [stored] - Stored value (3-part/2-part key or bare id/name).
 * @returns {string} Resolved option value, or original value if unresolvable.
 **/
export function modelKeyForValue(models, stored) {
  if (!stored) return '';
  const list = Array.isArray(models) ? models : [];
  if (list.some((m) => modelOptionValue(m) === stored)) return stored;
  const parsed = parseModelKey(stored);
  if (parsed && parsed.form !== 'bare') {
    const sameModel = list.filter((m) => m.provider === parsed.provider && m.id === parsed.id);
    const match =
      (parsed.harness && sameModel.find((m) => m.harness === parsed.harness)) || sameModel[0];
    if (match) return modelOptionValue(match);
  }
  const byName = list.find((m) => m.id === stored || m.name === stored);
  return byName ? modelOptionValue(byName) : stored;
}

/***
 * MARK: isValidProjectId
 * @description Validates that a project ID is syntactically valid and not a stage ID or workflow ID.
 * @param {string} [projectId]
 * @returns {boolean}
 * @example isValidProjectId('proj-1') => true; isValidProjectId('stage-1') => false; isValidProjectId('1') => false; isValidProjectId('wf-default') => false
 ***/
export function isValidProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string') return false;
  const trimmed = projectId.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('wf-') || trimmed.startsWith('stage-')) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return true;
}

/**
 * MARK: groupModelsByProvider
 * @description Converts a flat model list into SelectDropdown options visually
 *   grouped by provider (the `group` field renders a non-interactive header
 *   before the first option of each group). Providers keep first-appearance
 *   order, models keep API order inside their group, and models without a
 *   provider fall into an "Ungrouped" bucket appended after the grouped ones.
 *   Option values are the same composite keys the switchers always emitted,
 *   so stored selections keep resolving unchanged.
 * @param {Array<Object>} models - Model objects ({ id, name?, provider? }).
 * @param {Object} [opts]
 * @param {string} [opts.ungroupedLabel='Ungrouped'] - Group label for provider-less models.
 * @returns {Array<{value: string, label: string, group: string}>}
 * @example groupModelsByProvider([{id:'a',name:'A',provider:'google'}])
 *   => [{value:'google::a',label:'A',group:'google'}]
 */
export function groupModelsByProvider(models, { ungroupedLabel = 'Ungrouped' } = {}) {
  const list = Array.isArray(models) ? models : [];
  const providers = [];
  const modelsByProvider = new Map();
  for (const m of list) {
    const provider = m?.provider || ungroupedLabel;
    if (!modelsByProvider.has(provider)) {
      modelsByProvider.set(provider, []);
      providers.push(provider);
    }
    modelsByProvider.get(provider).push(m);
  }
  const options = [];
  for (const provider of providers) {
    for (const m of modelsByProvider.get(provider)) {
      options.push({
        value: modelOptionValue(m),
        label: m?.name || m?.id || '',
        group: provider,
      });
    }
  }
  return options;
}

/***
 * MARK: resolveReasoningOptions
 * @description Resolves the set of reasoning levels advertised for a given
 *   harness/model pair using the Q5 precedence: the model's own
 *   `supportedReasoning` set when it carries a non-empty array, otherwise
 *   the harness's `reasoningLevels`. Returns `null` when neither carries a
 *   usable (non-empty) array, so null-harness targets stay level-free.
 * @example resolveReasoningOptions({ harnessEntry: { reasoningLevels: ['low','high'] }, selectedModel: null }) => ['low','high']
 * @example resolveReasoningOptions({ harnessEntry: { reasoningLevels: null }, selectedModel: { supportedReasoning: ['a'] } }) => ['a']
 * @example resolveReasoningOptions({ harnessEntry: { reasoningLevels: ['low'] }, selectedModel: { supportedReasoning: [] } }) => ['low']
 * @example resolveReasoningOptions({ harnessEntry: { reasoningLevels: null }, selectedModel: null }) => null
 * @param {Object} [opts]
 * @param {Object} [opts.harnessEntry] - Catalogue harness entry.
 * @param {Object} [opts.selectedModel] - Catalogue model entry.
 * @returns {string[]|null}
 ***/
export function resolveReasoningOptions({ harnessEntry, selectedModel } = {}) {
  const modelLevels = Array.isArray(selectedModel?.supportedReasoning)
    ? selectedModel.supportedReasoning
    : null;
  const harnessLevels = Array.isArray(harnessEntry?.reasoningLevels)
    ? harnessEntry.reasoningLevels
    : null;
  const candidate = modelLevels && modelLevels.length > 0 ? modelLevels : harnessLevels;
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  return [...candidate];
}

/***
 * MARK: stripReasoningIfUnsupported
 * @description Load-time strip helper (Q2): returns the bare base ref when a
 *   `::level` suffix is present but the target harness advertises no
 *   adjustable reasoning (`optionsOrNull` is null/undefined); otherwise the
 *   reference is preserved verbatim (even if the level is no longer
 *   advertised — save-time validation flags it, load never silently
 *   destroys data beyond the null-harness case). Delegates all suffix
 *   parsing to `splitReasoning` / `stripReasoning`. Accepts either a labelled
 *   options object or positional arguments.
 * @example stripReasoningIfUnsupported({ storedRef: 'pi::p::m::high', optionsOrNull: null }) => 'pi::p::m'
 * @example stripReasoningIfUnsupported('pi::p::m::high', null) => 'pi::p::m'
 * @example stripReasoningIfUnsupported('pi::p::m::high', ['high']) => 'pi::p::m::high'
 * @example stripReasoningIfUnsupported('pi::p::m', null) => 'pi::p::m'
 * @param {string|Object} storedRefOrOptions - Stored model reference or labelled options object.
 * @param {string[]|null} [optionsOrNull] - Resolved reasoning options (or null).
 * @returns {string}
 ***/
export function stripReasoningIfUnsupported(storedRefOrOptions, optionsOrNull) {
  let targetStoredRef = storedRefOrOptions;
  let targetOptions = optionsOrNull;

  if (
    storedRefOrOptions &&
    typeof storedRefOrOptions === 'object' &&
    'storedRef' in storedRefOrOptions &&
    optionsOrNull === undefined
  ) {
    targetStoredRef = storedRefOrOptions.storedRef;
    targetOptions = storedRefOrOptions.optionsOrNull;
  }

  if (targetStoredRef === null || targetStoredRef === undefined) return targetStoredRef;
  const raw =
    targetStoredRef && typeof targetStoredRef === 'object'
      ? String(targetStoredRef.modelRef ?? targetStoredRef.ref ?? '').trim()
      : String(targetStoredRef).trim();
  if (!raw) return raw;
  const { reasoning } = splitReasoning(raw);
  if (!reasoning) return raw;
  if (targetOptions == null) return stripReasoning(raw);
  return raw;
}
