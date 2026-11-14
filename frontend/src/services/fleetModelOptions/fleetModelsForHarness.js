import { parseModelKey } from '../modelKeys.js';

/***
 * MARK: fleetModelsForHarness
 * @description Synthesizes fleet-served model entries for one harness
 *   section: `{ key, id, provider, name, fleet: true }`. `key` is the exact
 *   advertised id (the stored selection value). Only canonical harness-scoped
 *   ids (`harness::provider::id[::reasoning]`) with `parsed.harness === hid`
 *   render — provider-form and bare ids are quarantined (WP-C) and never
 *   fan out into a section. The entry's `harnesses[]` list stays as defence
 *   in depth: a runner must actually advertise the section. Counts (not the
 *   persisted `available` verdict) drive badges downstream.
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
    // Only canonical harness-scoped ids render in a section. Provider-form
    // and bare ids never join a harness section (WIDE_NET cause 2 / WP-C).
    if (parsed.form !== 'harness' && parsed.form !== 'harnessReasoning') continue;
    if (parsed.harness !== hid) continue;
    // eslint-disable-next-line security/detect-object-injection -- exactId is a catalogue model id, not user input
    const entry = fleetCounts[exactId];
    const serving =
      entry && typeof entry === 'object' && Array.isArray(entry.harnesses) ? entry.harnesses : [];
    // Defence in depth: a runner must actually advertise this section.
    if (serving.length > 0 && !serving.includes(hid)) continue;
    out.push({
      key: id,
      id: parsed.form === 'harnessReasoning' ? `${parsed.id}::${parsed.reasoning}` : parsed.id,
      provider: parsed.provider,
      name: parsed.id,
      fleet: true,
    });
  }
  return out;
}
