import {
	hasHarness,
} from '../../agent/harnessRegistry.js';
import { harnessName } from './harnessName.js';
import { peekStageDisplayTarget } from './peekStageDisplayTarget.js';

/***
 * MARK: resolveRunHarnessFallback
 * @description Peeked harness attribution for runs whose session reported no
 *   harness id (pre-contract sessions): the stage/project resolution the run
 *   was dispatched from, peeked without consuming an alias rotation step.
 *   The runner's reported id always wins — this fills only the blank. Names
 *   outside the harness registry (test seams, stale values) are never
 *   recorded: unattributed runs stay excluded, never misclassified.
 * @example resolveRunHarnessFallback(store, { harness: "pi" }, { id: "1" }) => "pi"
 * @param {Object} store - TaskStore (reads `sessionStore.resolveDisplayTarget` when wired).
 * @param {Object|null} project - Project entity (`harness`, `defaultModel`, `modelAliases`).
 * @param {Object} stage - Stage entity (`harness` override, `model`).
 * @returns {string|undefined} The fallback harness id, or undefined when unresolvable.
 ***/
export function resolveRunHarnessFallback(store, project, stage) {
	try {
		const target = peekStageDisplayTarget(store, project, stage);
		const name =
			typeof target?.harnessName === "string" ? target.harnessName.trim() : "";
		if (!name || !hasHarness(name)) return undefined;
		return name;
	} catch {
		return undefined;
	}
}
