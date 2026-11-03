import { parseModelKey } from './modelKeys.js';

/**
 * MARK: fleetModelsForHarness
 * @description Synthesizes fleet-served model entries for one harness
 *   section: `{ key, id, provider, name, fleet: true }`.
 * @param {string} harnessId
 * @param {Object} [fleetCounts]
 * @returns {Array<Object>}
 */
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
    const entry = fleetCounts[exactId];
    const serving =
      entry && typeof entry === 'object' && Array.isArray(entry.harnesses) ? entry.harnesses : [];
    if (serving.length > 0 && !serving.includes(hid)) continue;
    if (parsed.form === 'harness' || parsed.form === 'harnessReasoning') {
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
