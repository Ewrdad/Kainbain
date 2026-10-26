/***
 * MARK: resolveEngineState
 * @description Assembles the global engine state snapshot for consumers
 *   (metrics, `/engine/state`, `ENGINE_STATE` broadcasts, the Now Playing
 *   bar). Combines the raw `engineState`, the project-independent owner
 *   snapshot, an optional stage projection reconciliation, the global open
 *   queue depth, the execution queue stats, the `busyWhileIdle` wedge
 *   signal, and the Tier 5 circuit breaker snapshot. Every optional
 *   derivation is best-effort: a failure degrades that one field instead
 *   of breaking a state read, so the snapshot is never the reason a request
 *   fails.
 * @example taskStore.getEngineState() => { status: 'running', activeTaskId: 't1', activeTask: {...}, openQueueDepth: 2, circuit: {...} }
 * @param {Object} [store] - The TaskStore.
 * @returns {Object} The engine state snapshot.
 ***/
import { resolveEngineOwnerSnapshot } from './resolveEngineOwnerSnapshot.js';
import { countOpenTasksGlobal } from './countOpenTasksGlobal.js';
import { resolveStagesForTask } from '../flow/stageResolution.js';
import { resolveEngineStageProjection } from '../activeTaskDisplay.js';
import { circuitSnapshot } from '../flow/circuitBreaker.js';

export function resolveEngineState(store) {
	const snapshot = { ...((store && store.engineState) || {}) };
	let owner = null;
	try {
		owner = resolveEngineOwnerSnapshot(store);
	} catch {
		owner = null;
	}
	snapshot.activeTask = owner;
	if (snapshot.activeTaskId != null && owner) {
		try {
			const ownerProject =
				store &&
				store.projectStore &&
				typeof store.projectStore.getProject === "function"
					? store.projectStore.getProject(owner.projectId)
					: null;
			const stages = resolveStagesForTask(ownerProject, owner);
			const projected = resolveEngineStageProjection({
				engineState: snapshot,
				ownerTask: owner,
				stages,
			});
			if (projected && projected.reconciled) {
				snapshot.activeStageId = projected.activeStageId;
				snapshot.activeStageName = projected.activeStageName;
				snapshot.activeStageType = projected.activeStageType;
				snapshot.stageReconciled = true;
			}
		} catch {
			// A projection failure keeps the raw snapshot.
		}
	}
	try {
		const depth = countOpenTasksGlobal(store);
		if (typeof depth === "number") snapshot.openQueueDepth = depth;
	} catch {
		// Absent depth: the bar falls back to its loaded-list count.
	}
	try {
		const eq = store && store.executionQueue;
		snapshot.executionQueue = {
			isRunning: !!(eq && eq.isRunning),
			size: typeof (eq && eq.size) === "number" ? eq.size : 0,
			activeStartedAt: (eq && eq.activeStartedAt) ?? null,
		};
	} catch {
		// Execution-queue exposure is best-effort.
	}
	try {
		snapshot.busyWhileIdle =
			!!(store && store.executionQueue && store.executionQueue.isRunning) &&
			store.engineState && store.engineState.status !== "running" &&
			(store.engineState.activeTaskId ?? null) == null;
	} catch {
		snapshot.busyWhileIdle = false;
	}
	try {
		const circuit = circuitSnapshot(store);
		snapshot.circuit = circuit;
		snapshot.tripped = circuit && circuit.tripped;
		snapshot.tripReason = circuit && circuit.reason;
	} catch {
		// A circuit read failure degrades to "not tripped" for display.
	}
	return snapshot;
}
