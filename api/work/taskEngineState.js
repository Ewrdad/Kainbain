/***
 * MARK: taskEngineState
 * @description Project-independent derivations over the global engine state
 *   for the Now Playing bar. This module is now a thin barrel over the
 *   single-purpose modules `resolveEngineOwnerSnapshot.js` and
 *   `countOpenTasksGlobal.js` so existing import paths keep working while
 *   each derivation lives in its own file per the one-function-per-file rule.
 * @example
 *   import { resolveEngineOwnerSnapshot, countOpenTasksGlobal } from './taskEngineState.js';
 *   resolveEngineOwnerSnapshot(store) => { id: 't1', status: 'running_agent', ... } | null
 *   countOpenTasksGlobal(store) => 3
 ***/

export { resolveEngineOwnerSnapshot } from './resolveEngineOwnerSnapshot.js';
export { countOpenTasksGlobal } from './countOpenTasksGlobal.js';
