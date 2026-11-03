import { parseModelKey } from './modelKeys.js';

/***
 * MARK: fleet model options
 * @description Turns fleet catalogue availability (`fleetCountsById`: exact
 *   advertised model ids) into picker options for harnesses the backend
 *   catalogue leaves empty. The backend host can only list models ITS
 *   credentials unlock; the fleet serves more (e.g. a runner's
 *   auto-discovered `muse` menu). Options carry the EXACT advertised id as
 *   their key — dispatch matches requirements against advertised ids
 *   verbatim, so an exact id is a guaranteed matchable selection.
 *
 *   Attribution is strict for harness-scoped ids (`h::p::m` only ever
 *   appears under `h`, so a `pi`-grammar id can never be picked for
 *   `muse`); legacy `provider::id` and bare ids name no harness and appear
 *   under every section the fleet serves them on. Ids already present by
 *   value are never duplicated. Unknown or malformed ids are skipped.
 ***/

/***
 * MARK: fleetModelsForHarness
 * @description Synthesizes fleet-served model entries for one harness
 *   section: `{ key, id, provider, name, fleet: true }`. `key` is the exact
 *   advertised id (the stored selection value). Only meaningful when fleet
 *   data loaded — pass `undefined` counts and it returns `[]` (badge-free
 *   and option-free, never mislead).
 * @example fleetModelsForHarness('muse', { 'muse::meta::muse-spark-1.3': { runnerCount: 1 } })
 *   => [{ key: 'muse::meta::muse-spark-1.3', id: 'muse-spark-1.3', provider: 'meta', name: 'muse-spark-1.3', fleet: true }]
 * @param {string} harnessId - Catalogue harness section being rendered.
 * @param {Object} [fleetCounts] - Fleet map from `fleetCountsById`.
 * @returns {Array<Object>} Synthesized model entries (possibly empty).
 ***/
export function fleetModelsForHarness(harnessId, fleetCounts) {
  const hid = typeof harnessId === 'string' ? harnessId.trim() : '';
  if (!hid || !fleetCounts || typeof fleetCounts !== 'object') return [];
  const out = [];
  for (const exactId of Object.keys(fleetCounts)) {
    const id = typeof exactId === 'string' ? exactId.trim() : '';
    if (!id) continue;
    let parsed = null;
    try {
      parsed = parseModelKey(id);
    } catch {
      continue;
    }
    if (!parsed) continue;
    // Section gate: the entry's serving harnesses (empty = unknown, keep
    // lenient). An operator allowlist can advertise ids for harnesses the
    // runner does not offer — those sections must not offer the id, or
    // dispatch would match a model no serving runner can run there.
    // eslint-disable-next-line security/detect-object-injection -- exactId is a catalogue model id, not user input
    const entry = fleetCounts[exactId];
    const serving =
      entry && typeof entry === 'object' && Array.isArray(entry.harnesses) ? entry.harnesses : [];
    if (serving.length > 0 && !serving.includes(hid)) continue;
    if (parsed.form === 'harness' || parsed.form === 'harnessReasoning') {
      // Harness-scoped ids additionally name their section: strict match.
      if (parsed.harness !== hid) continue;
      out.push({
        key: id,
        id: parsed.form === 'harnessReasoning' ? `${parsed.id}::${parsed.reasoning}` : parsed.id,
        provider: parsed.provider,
        name: parsed.id,
        fleet: true,
      });
    } else if (parsed.form === 'provider') {
      out.push({ key: id, id: parsed.id, provider: parsed.provider, name: parsed.id, fleet: true });
    } else if (parsed.form === 'bare') {
      out.push({ key: id, id: parsed.id, provider: '', name: parsed.id, fleet: true });
    }
  }
  return out;
}

/***
 * MARK: fleetServesHarness
 * @description Whether the loaded fleet serves any model attributable to
 *   one harness section: a strict harness-scoped id for it, or a legacy /
 *   bare id (attributable everywhere). Drives the fleet-aware `none`-gate —
 *   a `none` harness the fleet serves behaves as `list` in fleet-executed
 *   pickers. Unloaded fleet data (`undefined`) never serves.
 * @example fleetServesHarness('muse', { 'muse::meta::m': {} }) => true
 * @param {string} harnessId - Catalogue harness section being rendered.
 * @param {Object} [fleetCounts] - Fleet map from `fleetCountsById`.
 * @returns {boolean} True when at least one fleet id belongs in the section.
 ***/
export function fleetServesHarness(harnessId, fleetCounts) {
  return fleetModelsForHarness(harnessId, fleetCounts).length > 0;
}

/***
 * MARK: withFleetModels
 * @description Merges synthesized fleet entries into one harness section's
 *   backend model list, skipping ids already present by option value so
 *   backend entries (with their richer labels) always win ties.
 * @example withFleetModels([{ key: 'a', id: 'a' }], 'h', { b: {} })
 * @param {Array<Object>} modelsForHarness - Backend catalogue models.
 * @param {string} harnessId - Catalogue harness section being rendered.
 * @param {Object} [fleetCounts] - Fleet map from `fleetCountsById`.
 * @returns {Array<Object>} Merged model list.
 ***/
export function withFleetModels(modelsForHarness, harnessId, fleetCounts) {
  const base = Array.isArray(modelsForHarness) ? modelsForHarness : [];
  if (!fleetCounts || typeof fleetCounts !== 'object') return base;
  const seen = new Set(
    base.map((m) => m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id)),
  );
  const extra = fleetModelsForHarness(harnessId, fleetCounts).filter((m) => !seen.has(m.key));
  return extra.length > 0 ? [...base, ...extra] : base;
}

/***
 * MARK: effectiveModelSelection
 * @description The model-selection mode one picker section actually offers:
 *   backend `list` stays `list`; a backend `none` the fleet serves behaves
 *   as `list` in fleet-executed pickers (the fleet runs the choice). Every
 *   other mode passes through; backend-executed pickers (no fleet data)
 *   always see the backend mode.
 * @example effectiveModelSelection('none', 'muse', { 'muse::meta::m': {} }) => 'list'
 * @param {string} backendSelection - Catalogue `modelSelection` (`'list'`/`'none'`).
 * @param {string} harnessId - Catalogue harness section being rendered.
 * @param {Object} [fleetCounts] - Fleet map from `fleetCountsById`.
 * @returns {string} Effective mode for the picker.
 ***/
export function effectiveModelSelection(backendSelection, harnessId, fleetCounts) {
  if (backendSelection === 'list') return 'list';
  if (backendSelection === 'none' && fleetServesHarness(harnessId, fleetCounts)) return 'list';
  return backendSelection || 'list';
}
