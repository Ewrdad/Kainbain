import { fleetServesHarness } from './fleetServesHarness.js';

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
