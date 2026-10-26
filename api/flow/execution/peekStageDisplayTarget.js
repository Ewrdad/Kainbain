/***
 * MARK: peekStageDisplayTarget
 * @description THE single peeked display-target read for stage dispatch
 *   observability: resolves the FULL alias pick for a project + stage pair
 *   without consuming a rotation step (null when no session store is wired
 *   or the read throws — callers degrade to the legacy fallback wording).
 *   `executeStage` reads this ONCE before the init line and reuses the same
 *   target for run attribution, so the init line and the recorded harness
 *   can never disagree.
 * @example peekStageDisplayTarget(store, project, { harness: "alias", model: "w" })?.harnessName => "antigravity"
 * @param {Object} store - TaskStore (reads `sessionStore.resolveDisplayTarget` when wired).
 * @param {Object|null} project - Project entity (`harness`, `defaultModel`, `modelAliases`).
 * @param {Object} stage - Stage entity (`harness` override, `model`).
 * @returns {Object|null} The peeked display target, or null when unavailable.
 ***/
export function peekStageDisplayTarget(store, project, stage) {
	try {
		const sessionStore = store?.sessionStore;
		if (typeof sessionStore?.resolveDisplayTarget !== "function")
			return null;
		return sessionStore.resolveDisplayTarget(project, stage, { peek: true });
	} catch {
		return null;
	}
}
