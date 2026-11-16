// Domain: Watching the Work — WP2 production signals (additive instrumentation).
// Counters observe, never gate: every helper below only records what the
// dispatch paths already decided, so dispatch outcomes are byte-identical
// with or without recording. All state lives on `store.productionSignals`
// (lazy-attached, so legacy test doubles without it keep working) except
// the two storeless process totals (worktree evictions, skill size-cap
// omissions), which are merged at exposition time.
const MAX_SIGNAL_SAMPLES = 2048;

/***
 * MARK: FENCING_REASONS
 * @description Claim-fencing rejection reasons with a dedicated breakdown
 *   counter (AUDIT H-5): scope refusals, stale fencing epochs, and lost
 *   claim races. Any other reason passed to `recordFencing` is ignored.
 * @example FENCING_REASONS => ["PROJECT_SCOPE", "STALE_EPOCH", "CLAIM_CONFLICT"]
 ***/
export const FENCING_REASONS = ["PROJECT_SCOPE", "STALE_EPOCH", "CLAIM_CONFLICT"];

/***
 * MARK: CLAIM_EXCLUDED_REASONS
 * @description Intentional skips excluded from the claim success rate, so a
 *   paused fleet or a version floor never reads as unhealthy dispatch.
 * @example CLAIM_EXCLUDED_REASONS => ["RUNNER_PAUSED", ...]
 ***/
export const CLAIM_EXCLUDED_REASONS = [
	"RUNNER_PAUSED",
	"CIRCUIT_TRIPPED",
	"BELOW_MINIMUM_VERSION",
	"FLEET_CONCURRENCY_EXHAUSTED",
];

/***
 * MARK: freshProductionSignals
 * @description Creates the zeroed WP2 signal store kept on the task store as
 *   `productionSignals` and surfaced through `computeObservabilityMetrics`.
 *   Latency/wait series are timestamped `{ t, ms }` samples (window-sliced
 *   at exposition); counters are cumulative since `startedAt`.
 * @example freshProductionSignals() => { claimAttempts: 0, … }
 ***/
export const freshProductionSignals = () => {
	const fencing = {};
	for (const reason of FENCING_REASONS) fencing[reason] = 0;
	const claimExcluded = {};
	for (const reason of CLAIM_EXCLUDED_REASONS) claimExcluded[reason] = 0;
	return {
		version: 1,
		startedAt: new Date().toISOString(),
		dispatchLatencyMs: [],
		claimAttempts: 0,
		claimSuccesses: 0,
		claimConflicts: 0,
		claimErrors: 0,
		claimExcluded,
		fencing,
		missTotals: {},
		fleetCapExhausted: 0,
		projectBusy: {},
		perProject: {},
	};
};

// Storeless process totals: `runner/project.js` (worktree evictions) and
// `api/skills/skillInjection.js` (size-cap omissions) have no task-store
// handle, so they record here; `summarizeProductionSignals` merges them.
// Per-file worker module registries (see `api/testSetup.isolation.js`)
// keep these isolated between test files; `resetProcessSignals` isolates
// within a file.
const processSignals = {
	worktreeEvictions: 0,
	skillSizeCapOmissions: 0,
};

/***
 * MARK: resetProcessSignals
 * @description Zeroes the storeless process totals (tests only).
 * @example resetProcessSignals() => { worktreeEvictions: 0, skillSizeCapOmissions: 0 }
 ***/
export const resetProcessSignals = () => {
	processSignals.worktreeEvictions = 0;
	processSignals.skillSizeCapOmissions = 0;
	return processSignals;
};

/***
 * MARK: processSignalTotals
 * @description Reads the storeless process totals without mutating them.
 * @example processSignalTotals() => { worktreeEvictions: 0, skillSizeCapOmissions: 0 }
 ***/
export const processSignalTotals = () => {
	return { ...processSignals };
};

const asSignals = (storeOrSignals) => {
	if (storeOrSignals && typeof storeOrSignals === "object") {
		if (typeof storeOrSignals.claimAttempts === "number" && storeOrSignals.fencing) {
			return storeOrSignals;
		}
		if (storeOrSignals.productionSignals && typeof storeOrSignals.productionSignals === "object") {
			return storeOrSignals.productionSignals;
		}
	}
	return null;
};

/***
 * MARK: signalsFor
 * @description Resolves the WP2 signal store for a task store (lazy-attaching
 *   a fresh one) or passes an already-resolved signals object through.
 *   Returns a detached zeroed store when given no usable object, so
 *   exposition on legacy doubles stays total.
 * @example signalsFor(taskStore) => taskStore.productionSignals
 ***/
export const signalsFor = (storeOrSignals) => {
	const direct = asSignals(storeOrSignals);
	if (direct) return direct;
	if (storeOrSignals && typeof storeOrSignals === "object") {
		storeOrSignals.productionSignals = freshProductionSignals();
		return storeOrSignals.productionSignals;
	}
	return freshProductionSignals();
};

const pushSample = (list, t, ms) => {
	if (!Number.isFinite(ms) || ms < 0) return;
	const tMs = Number.isFinite(t) ? t : Date.now();
	list.push({ t: tMs, ms });
	if (list.length > MAX_SIGNAL_SAMPLES) {
		list.splice(0, list.length - MAX_SIGNAL_SAMPLES);
	}
};

const projectEntry = (signals, projectId) => {
	const pid = typeof projectId === "string" && projectId ? projectId : "unknown";
	if (!signals.perProject[pid]) {
		signals.perProject[pid] = { claimed: 0, completed: 0, waitMs: [] };
	}
	return signals.perProject[pid];
};

/***
 * MARK: recordDispatchLatency
 * @description Records one scan-to-decision latency sample in milliseconds.
 *   Callers time their own scan (embedded tick wraps `findNextCandidateTask`,
 *   the fleet route wraps `scanClaimableTasks`); tests pass synthetic values.
 * @example recordDispatchLatency(store, 12, { now: 1000 }) => undefined
 ***/
export const recordDispatchLatency = (storeOrSignals, ms, opts = {}) => {
	const signals = signalsFor(storeOrSignals);
	pushSample(
		signals.dispatchLatencyMs,
		typeof opts.now === "number" ? opts.now : Date.now(),
		ms,
	);
};

/***
 * MARK: recordProjectClaim
 * @description Counts one task handed to an executor for a project, with an
 *   optional entered-stage → claim wait sample (the fairness signal: burst
 *   work must diverge per project without starving any of them).
 * @example recordProjectClaim(store, "proj-alpha", { waitMs: 50 }) => undefined
 ***/
export const recordProjectClaim = (storeOrSignals, projectId, opts = {}) => {
	const signals = signalsFor(storeOrSignals);
	const entry = projectEntry(signals, projectId);
	entry.claimed += 1;
	if (opts.waitMs !== undefined) {
		pushSample(
			entry.waitMs,
			typeof opts.now === "number" ? opts.now : Date.now(),
			opts.waitMs,
		);
	}
};

/***
 * MARK: recordProjectCompletion
 * @description Counts one completed execution for a project (throughput).
 * @example recordProjectCompletion(store, "proj-alpha") => undefined
 ***/
export const recordProjectCompletion = (storeOrSignals, projectId) => {
	const signals = signalsFor(storeOrSignals);
	projectEntry(signals, projectId).completed += 1;
};

/***
 * MARK: recordClaimAttempt
 * @description Counts one `claim()` try (denominator input for the success rate).
 * @example recordClaimAttempt(store) => undefined
 ***/
export const recordClaimAttempt = (storeOrSignals) => {
	signalsFor(storeOrSignals).claimAttempts += 1;
};

/***
 * MARK: recordClaimSuccess
 * @description Counts one non-conflict claim (numerator of the success rate).
 * @example recordClaimSuccess(store) => undefined
 ***/
export const recordClaimSuccess = (storeOrSignals) => {
	signalsFor(storeOrSignals).claimSuccesses += 1;
};

/***
 * MARK: recordClaimConflict
 * @description Counts one lost claim race (`CLAIM_CONFLICT`); also feeds the
 *   fencing breakdown so the two stay in agreement by construction.
 * @example recordClaimConflict(store) => undefined
 ***/
export const recordClaimConflict = (storeOrSignals) => {
	const signals = signalsFor(storeOrSignals);
	signals.claimConflicts += 1;
	signals.fencing.CLAIM_CONFLICT += 1;
};

/***
 * MARK: recordClaimError
 * @description Counts one non-conflict claim failure (unexpected `claim()`
 *   throw); lowers the success rate, unlike intentional exclusions.
 * @example recordClaimError(store) => undefined
 ***/
export const recordClaimError = (storeOrSignals) => {
	signalsFor(storeOrSignals).claimErrors += 1;
};

/***
 * MARK: recordClaimExcluded
 * @description Counts one intentional skip that must NOT touch the success
 *   rate: operator pauses, circuit trips, version-floor refusals, and fleet
 *   cap backoff. Unknown reasons are ignored so a typo can never pollute
 *   the exclusion ledger.
 * @example recordClaimExcluded(store, "RUNNER_PAUSED") => true
 ***/
export const recordClaimExcluded = (storeOrSignals, reason) => {
	if (!CLAIM_EXCLUDED_REASONS.includes(reason)) return false;
	const signals = signalsFor(storeOrSignals);
	signals.claimExcluded[reason] += 1;
	return true;
};

/***
 * MARK: recordFencing
 * @description Counts one scope/fencing rejection (`PROJECT_SCOPE`,
 *   `STALE_EPOCH`, `CLAIM_CONFLICT`). Anything else is ignored.
 * @example recordFencing(store, "PROJECT_SCOPE") => true
 ***/
export const recordFencing = (storeOrSignals, reason) => {
	if (!FENCING_REASONS.includes(reason)) return false;
	signalsFor(storeOrSignals).fencing[reason] += 1;
	return true;
};

/***
 * MARK: recordDispatchMiss
 * @description Aggregates one per-candidate dispatch miss by reason for
 *   window queryability (the route already returns per-poll `misses`; this
 *   is the cumulative mirror). Fencing reasons also feed the fencing
 *   breakdown; `PROJECT_BUSY` also feeds the per-project busy skip counter.
 * @example recordDispatchMiss(store, "PROJECT_SCOPE", { projectId: "p1" }) => undefined
 ***/
export const recordDispatchMiss = (storeOrSignals, reason, opts = {}) => {
	if (typeof reason !== "string" || !reason) return;
	const signals = signalsFor(storeOrSignals);
	signals.missTotals[reason] = (signals.missTotals[reason] || 0) + 1;
	if (FENCING_REASONS.includes(reason) && reason !== "CLAIM_CONFLICT") {
		signals.fencing[reason] += 1;
	}
	if (reason === "PROJECT_BUSY") {
		const pid = typeof opts.projectId === "string" && opts.projectId ? opts.projectId : "unknown";
		signals.projectBusy[pid] = (signals.projectBusy[pid] || 0) + 1;
	}
};

/***
 * MARK: recordFleetCapExhausted
 * @description Counts one fleet-cap (`429 FLEET_CONCURRENCY_EXHAUSTED`)
 *   backoff; also an intentional exclusion, never a success-rate debit.
 * @example recordFleetCapExhausted(store) => undefined
 ***/
export const recordFleetCapExhausted = (storeOrSignals) => {
	const signals = signalsFor(storeOrSignals);
	signals.fleetCapExhausted += 1;
	signals.claimExcluded.FLEET_CONCURRENCY_EXHAUSTED += 1;
};

/***
 * MARK: recordWorktreeEviction
 * @description Counts one worktree LRU eviction (FRAMEWORKS §3.8 minimum).
 *   Storeless by design: `runner/project.js` has no task-store handle, so
 *   the total lives on the process and merges at exposition. An explicit
 *   signals object may be passed by tests.
 * @example recordWorktreeEviction() => undefined
 ***/
export const recordWorktreeEviction = (storeOrSignals) => {
	if (storeOrSignals !== undefined) {
		const direct = asSignals(storeOrSignals);
		if (direct) {
			direct.worktreeEvictions = (direct.worktreeEvictions || 0) + 1;
			return;
		}
	}
	processSignals.worktreeEvictions += 1;
};

/***
 * MARK: recordSkillSizeCapOmission
 * @description Counts skills omitted by the injection size cap (§3.8
 *   minimum). Storeless like worktree evictions; `count` defaults to 1.
 * @example recordSkillSizeCapOmission(undefined, 2) => undefined
 ***/
export const recordSkillSizeCapOmission = (storeOrSignals, count = 1) => {
	const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
	if (n === 0) return;
	if (storeOrSignals !== undefined) {
		const direct = asSignals(storeOrSignals);
		if (direct) {
			direct.skillSizeCapOmissions = (direct.skillSizeCapOmissions || 0) + n;
			return;
		}
	}
	processSignals.skillSizeCapOmissions += n;
};

/***
 * MARK: percentile
 * @description Linear-interpolation percentile over a sample list; null when
 *   empty. Pure, so tests pin exact p50/p95/p99 behaviour.
 * @example percentile([1, 2, 3, 4], 50) => 2.5
 ***/
export const percentile = (samples, q) => {
	const values = (Array.isArray(samples) ? samples : [])
		.map((s) => (typeof s === "object" && s !== null ? s.ms : s))
		.filter((v) => Number.isFinite(v));
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (q / 100) * (sorted.length - 1);
	const lower = Math.floor(rank);
	const upper = Math.ceil(rank);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
};

/***
 * MARK: claimSuccessRate
 * @description Non-conflict claims over decided attempts, excluding
 *   intentional skips (operator pauses, version refusals): only real
 *   conflicts and errors lower the rate. Null rate until the first attempt.
 * @example claimSuccessRate(signals) => { attempts: 3, successes: 2, rate: 66.7, … }
 ***/
export const claimSuccessRate = (storeOrSignals) => {
	const signals = asSignals(storeOrSignals) || signalsFor(storeOrSignals);
	const attempts = signals.claimAttempts || 0;
	const successes = signals.claimSuccesses || 0;
	const conflicts = signals.claimConflicts || 0;
	const errors = signals.claimErrors || 0;
	const excluded = { ...signals.claimExcluded };
	const excludedTotal = Object.values(excluded).reduce(
		(sum, n) => sum + (Number.isFinite(n) ? n : 0),
		0,
	);
	const decided = successes + conflicts + errors;
	return {
		attempts,
		successes,
		conflicts,
		errors,
		excluded,
		excludedTotal,
		rate: decided > 0 ? (successes / decided) * 100 : null,
	};
};

const windowed = (samples, windowMs, now) => {
	if (!Number.isFinite(windowMs) || windowMs <= 0) return samples;
	const from = now - windowMs;
	return samples.filter((s) => s && Number.isFinite(s.t) && s.t >= from);
};

const summarizeWait = (samples, windowMs, now) => {
	const inWindow = windowed(samples, windowMs, now);
	return {
		count: inWindow.length,
		avgMs: inWindow.length > 0
			? inWindow.reduce((sum, s) => sum + s.ms, 0) / inWindow.length
			: null,
		p50Ms: percentile(inWindow, 50),
		p95Ms: percentile(inWindow, 95),
	};
};

/***
 * MARK: summarizeProductionSignals
 * @description Builds the exposition-ready WP2 snapshot: dispatch-latency
 *   p50/p95/p99, per-project claimed/completed plus wait-time summaries
 *   (fairness), the exclusion-aware claim success rate, the
 *   scope/fencing breakdown, and the §3.8 remainder. Sampled series honour
 *   `{ windowMs, now }`; counters are cumulative since `startedAt` (rates
 *   over a window are deltas of successive snapshots, Prometheus-style).
 * @param {Object} [opts] - `{ windowMs, now }` for the sampled series;
 *   `{ completedByProject }` overlays state-derived per-project completed
 *   counts (ground truth) over the event-counted fleet completions.
 * @example summarizeProductionSignals(store, { windowMs: 60000, now: 1000 }) => { dispatchLatency: {…}, … }
 ***/
export const summarizeProductionSignals = (storeOrSignals, opts = {}) => {
	const signals = asSignals(storeOrSignals) || signalsFor(storeOrSignals);
	const windowMs = typeof opts.windowMs === "number" ? opts.windowMs : 0;
	const now = typeof opts.now === "number" ? opts.now : Date.now();
	const latency = windowed(signals.dispatchLatencyMs || [], windowMs, now);
	const perProject = {};
	// State-derived completed counts (ground truth across embedded, fleet,
	// and manual finishes) override the event-counted fleet completions
	// when the caller supplies them; the events stay visible separately.
	const completedByProject =
		opts.completedByProject && typeof opts.completedByProject === "object"
			? opts.completedByProject
			: null;
	let fleetCompletedExecutions = 0;
	for (const [pid, entry] of Object.entries(signals.perProject || {})) {
		const completedEvents = entry.completed || 0;
		fleetCompletedExecutions += completedEvents;
		perProject[pid] = {
			claimed: entry.claimed || 0,
			completed:
				completedByProject && Number.isFinite(completedByProject[pid])
					? completedByProject[pid]
					: completedEvents,
			completedEvents,
			wait: summarizeWait(entry.waitMs || [], windowMs, now),
		};
	}
	if (completedByProject) {
		for (const [pid, count] of Object.entries(completedByProject)) {
			if (!perProject[pid]) {
				perProject[pid] = {
					claimed: 0,
					completed: count,
					completedEvents: 0,
					wait: summarizeWait([], windowMs, now),
				};
			}
		}
	}
	const process = processSignalTotals();
	return {
		since: signals.startedAt || null,
		windowMs: windowMs > 0 ? windowMs : null,
		dispatchLatency: {
			count: latency.length,
			unit: "ms",
			p50Ms: percentile(latency, 50),
			p95Ms: percentile(latency, 95),
			p99Ms: percentile(latency, 99),
		},
		claim: claimSuccessRate(signals),
		fleetCompletedExecutions,
		fencing: { ...signals.fencing },
		missTotals: { ...(signals.missTotals || {}) },
		fleetCapExhausted: signals.fleetCapExhausted || 0,
		projectBusy: { ...(signals.projectBusy || {}) },
		perProject,
		worktreeEvictions:
			(signals.worktreeEvictions || 0) + process.worktreeEvictions,
		skillSizeCapOmissions:
			(signals.skillSizeCapOmissions || 0) + process.skillSizeCapOmissions,
	};
};
