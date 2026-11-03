import { fleetModelsForHarness } from './fleetModelsForHarness.js';

/**
 * MARK: withFleetModels
 * @description Merges synthesized fleet entries into one harness section's
 *   backend model list.
 * @param {Array<Object>} modelsForHarness
 * @param {string} harnessId
 * @param {Object} [fleetCounts]
 * @returns {Array<Object>}
 */
export function withFleetModels(modelsForHarness, harnessId, fleetCounts) {
  const base = Array.isArray(modelsForHarness) ? modelsForHarness : [];
  if (!fleetCounts || typeof fleetCounts !== 'object') return base;
  const seen = new Set(
    base.map((m) => m?.key || (m?.provider ? `${m.provider}::${m.id}` : m?.id)),
  );
  const extra = fleetModelsForHarness(harnessId, fleetCounts).filter((m) => !seen.has(m.key));
  return extra.length > 0 ? [...base, ...extra] : base;
}
