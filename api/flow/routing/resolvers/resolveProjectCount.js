/***
 * MARK: resolveProjectCount
 * @description Reads a numeric project budget (retry counts only): a finite
 *   number wins (floored, negatives clamp to 0 = disabled, mirroring stage
 *   semantics), anything else falls through (undefined) to the next layer.
 * @example resolveProjectCount({ maxAutoIterations: 3 }, 'maxAutoIterations') => 3
 * @example resolveProjectCount({ maxAutoIterations: 'many' }, 'maxAutoIterations') => undefined
 * @param {Object} [project]
 * @param {string} key
 * @returns {number|undefined}
 ***/
export function resolveProjectCount(project, key) {
	if (!project || typeof project !== "object") return undefined;
	/* eslint-disable-next-line security/detect-object-injection -- key is a compile-time constant at every call site */
	const raw = project[key];
	if (raw === undefined || raw === null || raw === "") return undefined;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return undefined;
	return Math.max(0, Math.floor(parsed));
}
