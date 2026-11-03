import { fleetModelsForHarness } from './fleetModelsForHarness.js';

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
