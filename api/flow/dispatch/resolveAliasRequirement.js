import { selectAliasTarget } from "../../aliasSelector.js";

/***
 * MARK: resolveAliasRequirement
 * @description Resolves an alias-harness task requirement to the concrete
 *   `{ harness, model }` target serving this dispatch, reusing the
 *   embedded path's smooth weighted round-robin (`selectAliasTarget`, D3).
 *   Counters are backend-central by construction: dispatch and the engine
 *   advance the SAME per-`projectId:aliasName` rotation, so proportions
 *   stay exact and attributable across N Runners instead of drifting per
 *   process. A lost claim race after the advance only shifts the phase —
 *   the periodic sequence keeps exact long-run proportions. Unknown,
 *   blank, or currently unservable aliases return null so the route fails
 *   loud (`ALIAS_UNRESOLVED`), never silently substituting another model.
 * @example resolveAliasRequirement({ project: p, aliasName: 'fast', isHarnessKnown: () => true }) => { harness: 'mock', model: 'm', aliasName: 'fast', targetIndex: 0 }
 * @param {Object} [opts] - Options.
 * @param {Object} [opts.project] - Project entity (`modelAliases`, `id` for counter scoping).
 * @param {string} [opts.aliasName] - Alias name from the task requirement.
 * @param {Function} [opts.isHarnessKnown] - `(harness) => boolean`; targets on harnesses no Runner serves are skipped for this resolution (defaults to all-known).
 * @returns {{ harness: string, model: string, aliasName: string, targetIndex: number }|null} Concrete target, or null when unresolvable.
 ***/
export function resolveAliasRequirement({ project, aliasName, isHarnessKnown } = {}) {
	if (typeof aliasName !== "string" || !aliasName.trim()) return null;
	return selectAliasTarget(project, aliasName, {
		...(typeof isHarnessKnown === "function" ? { isHarnessKnown } : {}),
	});
}
