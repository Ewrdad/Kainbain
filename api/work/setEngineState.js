/***
 * MARK: setEngineState
 * @description Updates the global engine state merge, stamps `updatedAt`,
 *   and broadcasts an `ENGINE_STATE` event across all connected sockets via
 *   the event bridge. A throwing or missing event bridge is swallowed so a
 *   notification problem can never strand the engine in a stale state or
 *   turn a state write into a thrown error mid-dispatch. Returns the updated
 *   (projected) engine state snapshot.
 * @example taskStore.setEngineState({ status: 'running', activeTaskId: 't1', activeProjectId: 'p1' })
 * @param {Object} [store] - The TaskStore.
 * @param {Object} [updates={}] - Partial engine state patch.
 * @returns {Object} The updated engine state snapshot.
 ***/
export function setEngineState(store, updates = {}) {
	if (store) {
		store.engineState = {
			...(store.engineState || {}),
			...(updates || {}),
			updatedAt: new Date().toISOString(),
		};
	}
	let snapshot;
	try {
		const bridge = store && store.eventBridge;
		snapshot = typeof store?.getEngineState === "function"
			? store.getEngineState()
			: null;
		try {
			bridge?.broadcastGlobal?.("ENGINE_STATE", snapshot);
		} catch {
			// Observability must never break execution.
		}
	} catch {
		// Never strand the engine mid-dispatch.
	}
	if (!snapshot) {
		try {
			snapshot = store ? store.engineState : updates;
		} catch {
			snapshot = updates;
		}
	}
	return snapshot;
}
