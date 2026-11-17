// Domain: Watching the Work — WP2 production signals (additive instrumentation).
// Counters observe, never gate: every helper below only records what the
// dispatch paths already decided, so dispatch outcomes are byte-identical
// with or without recording. Recording is also fail-safe: a frozen/locked
// store or a malformed argument drops the sample instead of throwing into
// the dispatch path (`mutateSignals` swallows recording faults on purpose —
// a lost counter is recoverable, a broken dispatch is not).
// All state lives on `store.productionSignals` (lazy-attached, so legacy
// test doubles without it keep working) except the storeless process totals
// (worktree evictions, skill size-cap omissions), which are merged at
// exposition time. Worktree evictions happen in the Runner process, so the
// Runner reports its process total on every heartbeat (`facts.signals`) and
// the backend merges the monotonic per-Runner delta via
// `recordRunnerSignalReport` — that keeps the exposition truthful across
// Runner restarts (a restarted Runner's counter resets; the delta merge
// never goes negative).
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
		// Storeless-signal totals that arrived via Runner heartbeat reports
		// (see `recordRunnerSignalReport`); `runnerReported` keeps the
		// last-seen per-Runner baselines so restarts merge correctly.
		worktreeEvictions: 0,
		skillSizeCapOmissions: 0,
		runnerReported: {},
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
		try {
			storeOrSignals.productionSignals = freshProductionSignals();
			return storeOrSignals.productionSignals;
		} catch {
			// Frozen/non-extensible store: observe nowhere rather than
			// throw into the caller (dispatch paths must never break).
			return freshProductionSignals();
		}
	}
	return freshProductionSignals();
};

// Runs one recording mutation against the resolved signal store, never
// throwing: instrumentation must not gate dispatch. A dropped sample is a
// lost observation; a throw here would be a broken dispatch.
const mutateSignals = (storeOrSignals, mutate) => {
	try {
		mutate(signalsFor(storeOrSignals));
	} catch {
		// Deliberately silent: see the header note — observe, never gate.
	}
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
	if (!signals.perProject || typeof signals.perProject !== "object") signals.perProject = {};
	if (!signals.perProject[pid] || typeof signals.perProject[pid] !== "object") {
		signals.perProject[pid] = { claimed: 0, completed: 0, waitMs: [] };
	}
	if (!Array.isArray(signals.perProject[pid].waitMs)) signals.perProject[pid].waitMs = [];
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
	const { now } = opts || {};
	mutateSignals(storeOrSignals, (signals) => {
		pushSample(
			signals.dispatchLatencyMs,
			typeof now === "number" && Number.isFinite(now) ? now : Date.now(),
			ms,
		);
	});
};

/***
 * MARK: recordProjectClaim
 * @description Counts one task handed to an executor for a project, with an
 *   optional entered-stage → claim wait sample (the fairness signal: burst
 *   work must diverge per project without starving any of them).
 * @example recordProjectClaim(store, "proj-alpha", { waitMs: 50 }) => undefined
 ***/
export const recordProjectClaim = (storeOrSignals, projectId, opts = {}) => {
	const { waitMs, now } = opts || {};
	mutateSignals(storeOrSignals, (signals) => {
		const entry = projectEntry(signals, projectId);
		entry.claimed += 1;
		if (waitMs !== undefined) {
			pushSample(
				entry.waitMs,
				typeof now === "number" && Number.isFinite(now) ? now : Date.now(),
				waitMs,
			);
		}
	});
};

/***
 * MARK: recordProjectCompletion
 * @description Counts one completed execution for a project (throughput).
 * @example recordProjectCompletion(store, "proj-alpha") => undefined
 ***/
export const recordProjectCompletion = (storeOrSignals, projectId) => {
	mutateSignals(storeOrSignals, (signals) => {
		projectEntry(signals, projectId).completed += 1;
	});
};

/***
 * MARK: recordClaimAttempt
 * @description Counts one `claim()` try (denominator input for the success rate).
 * @example recordClaimAttempt(store) => undefined
 ***/
export const recordClaimAttempt = (storeOrSignals) => {
	mutateSignals(storeOrSignals, (signals) => {
		signals.claimAttempts += 1;
	});
};

/***
 * MARK: recordClaimSuccess
 * @description Counts one non-conflict claim (numerator of the success rate).
 * @example recordClaimSuccess(store) => undefined
 ***/
export const recordClaimSuccess = (storeOrSignals) => {
	mutateSignals(storeOrSignals, (signals) => {
		signals.claimSuccesses += 1;
	});
};

/***
 * MARK: recordClaimConflict
 * @description Counts one lost claim race (`CLAIM_CONFLICT`); also feeds the
 *   fencing breakdown so the two stay in agreement by construction.
 * @example recordClaimConflict(store) => undefined
 ***/
export const recordClaimConflict = (storeOrSignals) => {
	mutateSignals(storeOrSignals, (signals) => {
		signals.claimConflicts += 1;
		if (signals.fencing) signals.fencing.CLAIM_CONFLICT += 1;
	});
};

/***
 * MARK: recordClaimError
 * @description Counts one non-conflict claim failure (unexpected `claim()`
 *   throw); lowers the success rate, unlike intentional exclusions.
 * @example recordClaimError(store) => undefined
 ***/
export const recordClaimError = (storeOrSignals) => {
	mutateSignals(storeOrSignals, (signals) => {
		signals.claimErrors += 1;
	});
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
	mutateSignals(storeOrSignals, (signals) => {
		if (!signals.claimExcluded) signals.claimExcluded = {};
		signals.claimExcluded[reason] = (signals.claimExcluded[reason] || 0) + 1;
	});
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
	mutateSignals(storeOrSignals, (signals) => {
		if (!signals.fencing) signals.fencing = {};
		signals.fencing[reason] = (signals.fencing[reason] || 0) + 1;
	});
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
	const { projectId } = opts || {};
	mutateSignals(storeOrSignals, (signals) => {
		if (!signals.missTotals) signals.missTotals = {};
		signals.missTotals[reason] = (signals.missTotals[reason] || 0) + 1;
		if (FENCING_REASONS.includes(reason) && reason !== "CLAIM_CONFLICT") {
			if (!signals.fencing) signals.fencing = {};
			signals.fencing[reason] = (signals.fencing[reason] || 0) + 1;
		}
		if (reason === "PROJECT_BUSY") {
			const pid = typeof projectId === "string" && projectId ? projectId : "unknown";
			if (!signals.projectBusy) signals.projectBusy = {};
			signals.projectBusy[pid] = (signals.projectBusy[pid] || 0) + 1;
		}
	});
};

/***
 * MARK: recordFleetCapExhausted
 * @description Counts one fleet-cap (`429 FLEET_CONCURRENCY_EXHAUSTED`)
 *   backoff; also an intentional exclusion, never a success-rate debit.
 * @example recordFleetCapExhausted(store) => undefined
 ***/
export const recordFleetCapExhausted = (storeOrSignals) => {
	mutateSignals(storeOrSignals, (signals) => {
		signals.fleetCapExhausted = (signals.fleetCapExhausted || 0) + 1;
		if (!signals.claimExcluded) signals.claimExcluded = {};
		signals.claimExcluded.FLEET_CONCURRENCY_EXHAUSTED =
			(signals.claimExcluded.FLEET_CONCURRENCY_EXHAUSTED || 0) + 1;
	});
};

/***
 * MARK: recordWorktreeEviction
 * @description Counts one worktree LRU eviction (FRAMEWORKS §3.8 minimum).
 *   Storeless by design: `runner/project.js` has no task-store handle, so
 *   the total lives on the Runner process and merges at exposition; the
 *   Runner reports it on every heartbeat and the backend merges the delta
 *   via `recordRunnerSignalReport`. An explicit signals object may be
 *   passed by tests.
 * @example recordWorktreeEviction() => undefined
 ***/
export const recordWorktreeEviction = (storeOrSignals) => {
	// Only an already-resolved signals object records at signal level; a
	// plain store (or nothing) records on the storeless process total —
	// checked BEFORE mutating so the lazy attach in `signalsFor` cannot
	// reroute a process total onto a store.
	if (storeOrSignals !== undefined && asSignals(storeOrSignals)) {
		mutateSignals(storeOrSignals, (signals) => {
			signals.worktreeEvictions = (signals.worktreeEvictions || 0) + 1;
		});
		return;
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
	// Same routing as `recordWorktreeEviction`: only an already-resolved
	// signals object records at signal level, everything else is storeless.
	if (storeOrSignals !== undefined && asSignals(storeOrSignals)) {
		mutateSignals(storeOrSignals, (signals) => {
			signals.skillSizeCapOmissions = (signals.skillSizeCapOmissions || 0) + n;
		});
		return;
	}
	processSignals.skillSizeCapOmissions += n;
};

/***
 * MARK: recordRunnerSignalReport
 * @description Merges one Runner's heartbeat-reported process totals
 *   (`facts.signals`, e.g. `{ worktreeEvictions: n }`) into the backend
 *   signal store. The Runner is a separate process, so without this bridge
 *   its evictions would never reach the exposition. The merge is monotonic
 *   per Runner: a reported total below the last-seen baseline means the
 *   Runner process restarted and its counter reset, so the whole new value
 *   counts as delta — the fleet total can never go backwards across a
 *   restart or a re-ordered heartbeat. Returns false (touching nothing)
 *   when the report carries no finite `worktreeEvictions`.
 * @example recordRunnerSignalReport(store, "runner-1", { worktreeEvictions: 3 }) => true
 ***/
export const recordRunnerSignalReport = (storeOrSignals, runnerId, reported) => {
	const id = typeof runnerId === "string" && runnerId ? runnerId : "unknown";
	const report = reported && typeof reported === "object" ? reported : {};
	const evictions = Number.isFinite(report.worktreeEvictions)
		? Math.max(0, Math.floor(report.worktreeEvictions))
		: null;
	if (evictions === null) return false;
	mutateSignals(storeOrSignals, (signals) => {
		if (!signals.runnerReported) signals.runnerReported = {};
		const prev = signals.runnerReported[id];
		const prevN = prev && Number.isFinite(prev.worktreeEvictions) ? prev.worktreeEvictions : null;
		const delta = prevN === null || evictions >= prevN ? evictions - (prevN ?? 0) : evictions;
		signals.worktreeEvictions = (signals.worktreeEvictions || 0) + delta;
		signals.runnerReported[id] = { worktreeEvictions: evictions };
	});
	return true;
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
	if (values.length === 0 || !Number.isFinite(q)) return null;
	// Clamp into [0, 100] so an out-of-range q can never index past the
	// sorted list and return NaN.
	const clamped = Math.min(100, Math.max(0, q));
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (clamped / 100) * (sorted.length - 1);
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
	const excluded =
		signals.claimExcluded && typeof signals.claimExcluded === "object"
			? { ...signals.claimExcluded }
			: {};
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
	const { windowMs: rawWindowMs, now: rawNow, completedByProject: rawCompleted } = opts || {};
	const windowMs = Number.isFinite(rawWindowMs) && rawWindowMs > 0 ? rawWindowMs : 0;
	const now = Number.isFinite(rawNow) ? rawNow : Date.now();
	// Read path must never throw either: a legacy/partial signals object
	// with non-array series still yields a total (empty) summary.
	const latencySamples = Array.isArray(signals.dispatchLatencyMs) ? signals.dispatchLatencyMs : [];
	const latency = windowed(latencySamples, windowMs, now);
	const perProject = {};
	// State-derived completed counts (ground truth across embedded, fleet,
	// and manual finishes) override the event-counted fleet completions
	// when the caller supplies them; the events stay visible separately.
	const completedByProject =
		rawCompleted && typeof rawCompleted === "object" ? rawCompleted : null;
	let fleetCompletedExecutions = 0;
	const storedPerProject =
		signals.perProject && typeof signals.perProject === "object" ? signals.perProject : {};
	for (const [pid, rawEntry] of Object.entries(storedPerProject)) {
		const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
		const completedEvents = Number.isFinite(entry.completed) ? entry.completed : 0;
		fleetCompletedExecutions += completedEvents;
		perProject[pid] = {
			claimed: Number.isFinite(entry.claimed) ? entry.claimed : 0,
			completed:
				completedByProject && Number.isFinite(completedByProject[pid])
					? completedByProject[pid]
					: completedEvents,
			completedEvents,
			wait: summarizeWait(Array.isArray(entry.waitMs) ? entry.waitMs : [], windowMs, now),
		};
	}
	if (completedByProject) {
		for (const [pid, count] of Object.entries(completedByProject)) {
			if (!perProject[pid] && Number.isFinite(count)) {
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
		fencing:
			signals.fencing && typeof signals.fencing === "object" ? { ...signals.fencing } : {},
		missTotals:
			signals.missTotals && typeof signals.missTotals === "object"
				? { ...signals.missTotals }
				: {},
		fleetCapExhausted: signals.fleetCapExhausted || 0,
		projectBusy:
			signals.projectBusy && typeof signals.projectBusy === "object"
				? { ...signals.projectBusy }
				: {},
		perProject,
		worktreeEvictions:
			(signals.worktreeEvictions || 0) + process.worktreeEvictions,
		skillSizeCapOmissions:
			(signals.skillSizeCapOmissions || 0) + process.skillSizeCapOmissions,
	};
};
