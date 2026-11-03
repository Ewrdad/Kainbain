import { fleetServesHarness } from './fleetServesHarness.js';

/**
 * MARK: effectiveModelSelection
 * @description The model-selection mode one picker section actually offers.
 * @param {string} backendSelection
 * @param {string} harnessId
 * @param {Object} [fleetCounts]
 * @returns {string}
 */
export function effectiveModelSelection(backendSelection, harnessId, fleetCounts) {
  if (backendSelection === 'list') return 'list';
  if (backendSelection === 'none' && fleetServesHarness(harnessId, fleetCounts)) return 'list';
  return backendSelection || 'list';
}
