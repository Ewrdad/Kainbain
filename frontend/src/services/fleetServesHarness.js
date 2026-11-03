import { fleetModelsForHarness } from './fleetModelsForHarness.js';
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
 * MARK: default fleetServesHarness
 * @description Default-export alias for `fleetServesHarness` so it can be imported either way.
 * @example fleetServesHarness('muse', { 'muse::meta::m': {} }) => true
 ***/
export default fleetServesHarness;
