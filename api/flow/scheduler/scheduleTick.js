import {
	canaryAdmissionOpen,
	circuitSnapshot,
	isCanaryTask,
	isCircuitEnabled,
	isTripped,
	markCanary,
	recordCanaryFailure,
	recordCanarySuccess,
} from '../circuitBreaker.js';
import {
	evaluateResourceSensors,
	recordCircuitSuccess,
} from '../circuitSensors.js';
import {
	watchdogTick,
} from '../stageHeartbeat.js';
import {
	QUEUE_EMPTY_DEBOUNCE_MS,
} from '../routing/tables/index.js';
import { consumeResumedMarker } from './consumeResumedMarker.js';
import { findNextCandidateTask } from './findNextCandidateTask.js';
import { freshSchedulerStats } from './freshSchedulerStats.js';
import { cancelQueueEmptyTimer } from './cancelQueueEmptyTimer.js';
import { fireQueueEmptyPush } from './fireQueueEmptyPush.js';
import { describeQueueWedge } from './describeQueueWedge.js';
import { resolveIdleWedge } from './resolveIdleWedge.js';
import { resolveRunningWedge } from './resolveRunningWedge.js';
import { autoResumeTask } from './autoResumeTask.js';

/***
 * MARK: scheduleTick
 * @description Executes a single scheduler tick, dispatching the top candidate task if the engine is idle.
 *   Finding no candidate is a normal idle outcome (the scheduler keeps
 *   polling); it never stops the loop. Every outcome is counted on
 *   `store.schedulerStats` for idle-vs-stuck diagnosis.
 *   Queue-empty push latch: `store._schedulerWasActive` tracks whether the
 *   engine recently had runnable work. The push arms strictly on the
 *   active→idle transition (once per run), never on consecutive idle ticks,
 *   and fires only if the queue is still empty after QUEUE_EMPTY_DEBOUNCE_MS
 *   (stage-handover safety). Any resumption of work cancels the pending push.
 * @param {Object} [opts]
 * @param {number} [opts.queueEmptyDebounceMs] - Override the queue-empty debounce (tests).
  * @example await scheduleTick(store) => { dispatched: 1, … }
 ***/
export async function scheduleTick(store, opts = {}) {
	if (!store.schedulerStats) store.schedulerStats = freshSchedulerStats();
	const stats = store.schedulerStats;
	stats.ticks += 1;
	stats.lastTickAt = new Date().toISOString();

	// Tier-5 containment gate (checked FIRST — before busy and candidate
	// search). While tripped, dispatch stops entirely and queued work is
	// deferred without touching any budget. The only exception is the single
	// half-open canary probe admitted after the cooldown.
	const circuitEnabled = isCircuitEnabled();
	const tripped = isTripped(store);
	let canaryAdmitted = false;
	if (tripped) {
		canaryAdmitted = canaryAdmissionOpen(store);
		if (!canaryAdmitted) {
			stats.deferredTripped = (stats.deferredTripped || 0) + 1;
			stats.lastOutcome = "deferred-tripped";
			store.lastTripDeferral = {
				at: new Date().toISOString(),
				reason: circuitSnapshot(store).reason,
				source: circuitSnapshot(store).source,
			};
			return null;
		}
	}

	// Resource trip sensors run before candidate search (cheapest check
	// first). Probe failures fail open; a confirmed disk-floor breach or
	// sustained memory-critical reading trips and defers this tick.
	if (circuitEnabled && !tripped) {
		const probeTrip = evaluateResourceSensors(
			store,
			opts.circuitProbes ? { probes: opts.circuitProbes } : undefined,
		);
		if (probeTrip) {
			stats.deferredTripped = (stats.deferredTripped || 0) + 1;
			stats.lastOutcome = "tripped-resource";
			return null;
		}
	}

	// Stall watchdog (WP6): a hung child that never exits and never prints
	// would otherwise sit until the wall-clock timeout. Scan the ACTIVE task
	// here — before the busy gate, because a stalled task IS the busy owner.
	// A tripped engine has nothing running to stall (`watchdogTick` also
	// re-checks the trip itself). The watchdog never breaks the tick, and it
	// owns the `stallRecoveries` counter (incremented once per recovery).
	try {
		const stallOutcome = watchdogTick(store);
		if (stallOutcome) {
			stats.lastOutcome = "stall-recovered";
			store._schedulerWasActive = true;
			cancelQueueEmptyTimer(store);
			return stallOutcome;
		}
	} catch {
		// A watchdog fault must never stall the scheduler itself.
	}

	const queueRunning = !!store?.executionQueue?.isRunning;
	const engineBusy = store?.engineState?.status === "running";
	const engineIdleNoOwner =
		!engineBusy && !(store?.engineState?.activeTaskId ?? null);

	// Split-brain / wedged-queue handling: the queue still claims to be
	// running while the engine reads idle with no owner (or running with an
	// entry that outlived every guard). `describeQueueWedge` classifies the
	// shape; only a provably dead entry is force-settled — a live entry
	// (fresh heartbeat) is reconciled or left alone, never killed. Every
	// shape reports a distinct outcome instead of lumped `skipped-busy`.
	if (queueRunning && engineIdleNoOwner) {
		stats.skippedBusyWhileIdle = (stats.skippedBusyWhileIdle || 0) + 1;
		store._schedulerWasActive = true;
		cancelQueueEmptyTimer(store);
		try {
			resolveIdleWedge(store, stats);
		} catch {
			// Recovery must never throw out of the scheduler tick.
			stats.lastOutcome = "skipped-busy-while-idle";
		}
		return null;
	}

	if (queueRunning || engineBusy) {
		if (queueRunning && engineBusy) {
			// Age backstop for a hung occupant the heartbeat watchdog cannot
			// see (uninstrumented run, or guards the watchdog does not cover):
			// an entry older than its stuck budget with no fresh heartbeat is
			// rescued exactly like an idle wedge. A merely long but alive run
			// stays healthy-busy.
			try {
				if (resolveRunningWedge(store, stats)) return null;
			} catch {
				// A failed rescue degrades to plain skipped-busy below.
			}
		}
		stats.skippedBusy += 1;
		stats.lastOutcome = "skipped-busy";
		store._schedulerWasActive = true;
		cancelQueueEmptyTimer(store);
		return null;
	}

	const candidate = findNextCandidateTask(store, { ignoreTrip: canaryAdmitted });
	if (!candidate) {
		stats.idleNoCandidate += 1;
		stats.lastOutcome = "no-candidate-idle";
		if (store._schedulerWasActive === true) {
			store._schedulerWasActive = false;
			// Arm (don't fire): the debounce re-checks the queue at expiry,
			// so a stage handover in progress never pages the operator.
			const debounceMs = opts.queueEmptyDebounceMs ?? QUEUE_EMPTY_DEBOUNCE_MS;
			fireQueueEmptyPush(store, { debounceMs });
		}
		return null;
	}
	// Runnable work exists: latch the active state so the next idle tick
	// after this work drains arms exactly one queue-empty notification,
	// and cancel any notification armed during the handover to this work.
	store._schedulerWasActive = true;
	cancelQueueEmptyTimer(store);

	const { projectId, taskId, stages, projectCwd } = candidate;
	// A Rule-0 candidate still carries the `interrupted` label: flip it back
	// to runnable first (budget reset + history, mirroring manual resume) so
	// `executeStage` sees the same pre-dispatch state as any other dispatch.
	if (candidate.task?.status === "interrupted") {
		autoResumeTask(store, projectId, taskId, projectCwd);
	}
	// Priority is single-use: the dispatch below is the pickup the restart
	// promised, so the marker is consumed here and the task competes as
	// normal work from the next tick on. (The just-flipped task above had
	// its marker stamped by `autoResumeTask` and consumes it immediately —
	// selection already happened, so priority is unaffected.)
	if (candidate.task) {
		consumeResumedMarker(store, candidate.task, projectCwd);
	}
	// Claim the single half-open canary slot immediately before dispatch so
	// no second tick (or a restart) can admit a concurrent probe.
	if (canaryAdmitted) {
		markCanary(store, { projectId, taskId });
		stats.canaryDispatched = (stats.canaryDispatched || 0) + 1;
	}
	const result = await store.executeStage(projectId, taskId, {
		stages,
		projectCwd,
		agentRunner: opts.agentRunner || store.defaultAgentRunner,
		promptEngine: opts.promptEngine || store.defaultPromptEngine,
		priority: "normal",
	});
	if (result?.queueEntryTimeout === true) {
		// The entry outlived the settle guarantee mid-run: the timeout path
		// already routed the occupant to the transient ladder and counted
		// the stall recovery. This tick carried no fresh dispatch, so it
		// must not inflate `dispatched` or move `lastDispatchAt` — but the
		// wedge episode is over either way.
		store._wedgedStallNotified = false;
		stats.lastOutcome = "stall-recovered-entry-timeout";
	} else {
		stats.dispatched += 1;
		stats.lastDispatchAt = new Date().toISOString();
		stats.lastOutcome = "dispatched";
		// A real dispatch closes any wedge episode: the next rescue pages again.
		store._wedgedStallNotified = false;
	}

	// Circuit outcome: a passing stage proves the shared infrastructure works
	// (clears the failure window; a passing canary lifts the trip fully). A
	// failing canary is handled inside the failure routers, which re-trip with
	// backoff — but an inconclusive outcome (superseded/paused/blocked) must
	// still release the single canary slot so a later tick can probe again.
	if (circuitEnabled) {
		if (result?.status === "passed") {
			if (canaryAdmitted) recordCanarySuccess(store);
			else recordCircuitSuccess(store);
		} else if (canaryAdmitted && isCanaryTask(store, taskId)) {
			recordCanaryFailure(store, {
				reason: circuitSnapshot(store).reason,
				source: "auto:probe",
			});
		}
	}
	return result;
}
