import { fleetModelsForHarness } from './fleetModelsForHarness.js';

/**
 * MARK: fleetServesHarness
 * @description Whether the loaded fleet serves any model attributable to
 *   one harness section.
 * @param {string} harnessId
 * @param {Object} [fleetCounts]
 * @returns {boolean}
 */
export function fleetServesHarness(harnessId, fleetCounts) {
  return fleetModelsForHarness(harnessId, fleetCounts).length > 0;
}
