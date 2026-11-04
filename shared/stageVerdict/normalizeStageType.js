/***
 * MARK: normalizeStageType
 * @description Normalizes stage types to the authoritative types ('agent', 'human', 'ci', 'merge').
 * Legacy types are mapped: 'review' -> 'human', 'script' -> 'ci',
 * 'deploy' -> 'ci' (the deploy pipeline stage type was removed — a stage
 * whose command runs the deploy script is an ordinary ci stage with no
 * special runtime), 'custom'/other -> 'agent'.
 * Shared with the Runner (see shared/stageVerdict.js): the verdict guard
 * and the daemon's agent-path check must classify stage types identically
 * to the backend, so the normalizer lives at this bottom layer instead of
 * under api/.
 * @example normalizeStageType('review') => 'human'
 * @example normalizeStageType('deploy') => 'ci'
 * @param {string} [type]
 * @returns {'agent'|'human'|'ci'|'merge'}
 ***/
export function normalizeStageType(type) {
	if (!type || typeof type !== "string") return "agent";
	const lower = type.trim().toLowerCase();
	if (lower === "human" || lower === "review") return "human";
	if (lower === "ci" || lower === "script" || lower === "deploy") return "ci";
	if (lower === "merge") return "merge";
	if (lower === "agent") return "agent";
	return "agent";
}
