import { parseModelKey } from './modelKeys.js';

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
