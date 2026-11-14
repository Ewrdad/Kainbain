/***
 * MARK: fleet model options entry point
 * @description Turns fleet catalogue availability (`fleetCountsById`: exact
 *   advertised model ids) into picker options for harnesses the backend
 *   catalogue leaves empty. The backend host can only list models ITS
 *   credentials unlock; the fleet serves more (e.g. a runner's
 *   auto-discovered `muse` menu). Options carry the EXACT advertised id as
 *   their key — dispatch matches requirements against advertised ids
 *   verbatim, so an exact id is a guaranteed matchable selection.
 *
 *   Attribution is strict: a harness-scoped id (`h::p::m`) only ever
 *   appears under `h`, so a `pi`-grammar id can never be picked for
 *   `muse`. Legacy `provider::id` and bare ids are quarantined (WP-C)
 *   and never appear under any section. Ids already present by value are
 *   never duplicated. Unknown or malformed ids are skipped.
 *
 *   Thin re-export over the one-function-per-file modules in
 *   `./fleetModelOptions/` — keep this entry point so existing callers
 *   (model pickers) need no import changes.
 * @example import { withFleetModels, effectiveModelSelection } from './fleetModelOptions';
 ***/
export { fleetModelsForHarness } from './fleetModelOptions/fleetModelsForHarness.js';
export { fleetServesHarness } from './fleetModelOptions/fleetServesHarness.js';
export { withFleetModels } from './fleetModelOptions/withFleetModels.js';
export { effectiveModelSelection } from './fleetModelOptions/effectiveModelSelection.js';
