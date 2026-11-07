import { v4 as uuidv4 } from "uuid";
import { selectRunnerForImpromptu } from "./dispatch/selectRunnerForImpromptu.js";

/***
 * MARK: CHAT_OUTPUT_TAIL_MAX_CHARS
 * @description Character ceiling for one impromptu job's captured
 *   assistant-output tail (progress broadcasts, partial output on failure).
 * @example CHAT_OUTPUT_TAIL_MAX_CHARS => 2000
 ***/
export const CHAT_OUTPUT_TAIL_MAX_CHARS = 2000;

/***
 * MARK: CHAT_OUTPUT_TRUNCATED_MARKER
 * @description Front-truncation marker for the output tail (same idiom as
 *   task-context truncation).
 * @example CHAT_OUTPUT_TRUNCATED_MARKER => '[…truncated…]'
 ***/
export const CHAT_OUTPUT_TRUNCATED_MARKER = "[…truncated…]";

/***
 * MARK: CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS
 * @description Minimum gap between CHAT_PROGRESS broadcasts for one turn
 *   (WebSocket chatter guard).
 * @example CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS => 500
 ***/
export const CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS = 500;

/***
 * MARK: IMPROMPTU_SETTLED_KEPT
 * @description How many settled job outcomes the store remembers so retried
 *   completions answer idempotent instead of stale (a Runner that completed
 *   and then lost the response retries instead of failing loudly).
 * @example IMPROMPTU_SETTLED_KEPT => 500
 ***/
export const IMPROMPTU_SETTLED_KEPT = 500;

/***
 * MARK: normalizeTimeoutMs
 * @description Reduces any `timeoutMs` input to an armable ceiling or `0`
 *   (disabled): only a finite number `> 0` arms the server timer. Every
 *   other input — `0`/nullish (the documented opt-out), `NaN`, negative,
 *   `Infinity`, or a non-number — degrades to disabled so a malformed
 *   ceiling can never false-fire an instant `chat_prompt_timeout`; the turn
 *   runs until the Runner settles it instead (fail-safe). Mirrors
 *   `normalizeTimeoutMs` in `frontend/src/services/client/request.js` — the
 *   two packages cannot import each other, so the timeout tests on both
 *   sides pin the shared rule.
 * @example normalizeTimeoutMs(1000) => 1000
 * @example normalizeTimeoutMs(0) => 0
 * @example normalizeTimeoutMs(NaN) => 0
 * @param {unknown} timeoutMs - The raw ceiling input.
 * @returns {number} The armable ceiling, or `0` for disabled.
 ***/
export const normalizeTimeoutMs = (timeoutMs) => {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return 0;
	if (timeoutMs <= 0) return 0;
	return timeoutMs;
};

/***
 * MARK: truncateOutputTail
 * @description Bounds captured assistant output to a readable tail: text at
 *   or under the cap passes through; longer text keeps its most recent
 *   `maxChars` worth behind the front-truncation marker.
 * @example truncateOutputTail("short") => "short"
 * @example truncateOutputTail("a".repeat(100), 20) => "[…truncated…]\naaaaaa" (marker + tail)
 * @param {string} text - The captured output.
 * @param {number} [maxChars=CHAT_OUTPUT_TAIL_MAX_CHARS] - Total ceiling incl. marker.
 * @returns {string} The bounded tail ("" for non-string input; never longer
 *   than maxChars — when the cap leaves no room for the marker, the raw tail
 *   wins over the marker).
 ***/
export const truncateOutputTail = (text, maxChars = CHAT_OUTPUT_TAIL_MAX_CHARS) => {
	if (typeof text !== "string" || !text) return "";
	if (text.length <= maxChars) return text;
	const tailLen = maxChars - CHAT_OUTPUT_TRUNCATED_MARKER.length - 1;
	if (tailLen <= 0) return text.slice(-maxChars);
	return `${CHAT_OUTPUT_TRUNCATED_MARKER}\n${text.slice(-tailLen)}`;
};

/***
 * MARK: createChatProgressForwarder
 * @description Builds the store's progress sink: one call per Runner delta,
 *   fanned out as the existing `CHAT_PROGRESS { turnId, tail }` WebSocket
 *   frames the chat working card already renders, throttled per turn so a
 *   chatty model never floods the socket. Turns without a turnId (old
 *   clients) and a missing bridge skip silently; a throwing bridge never
 *   fails the job (the unary settle stays truthful).
 * @example const forward = createChatProgressForwarder({ eventBridge }); forward({ projectId: 'p', turnId: 't', tail: 'hi' })
 * @param {Object} [opts]
 * @param {Object} [opts.eventBridge] - Bridge with `broadcast(projectId, type, payload)`.
 * @param {number} [opts.minIntervalMs=CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS] - Per-turn throttle floor.
 * @param {Function} [opts.now] - Clock injection (tests control the throttle).
 * @returns {Function} `({ projectId, turnId, tail }) => void`.
 ***/
export const createChatProgressForwarder = ({
	eventBridge = null,
	minIntervalMs = CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS,
	now = () => Date.now(),
} = {}) => {
	const lastBroadcastAtByTurn = new Map();
	const floor =
		typeof minIntervalMs === "number" && minIntervalMs > 0 ? minIntervalMs : 0;
	return ({ projectId, turnId, tail } = {}) => {
		try {
			if (!turnId || !eventBridge || typeof eventBridge.broadcast !== "function") return;
			const at = now();
			// Lazy prune: turn entries older than a minute can never throttle
			// a live turn again, so the map cannot grow with history.
			for (const [key, seenAt] of lastBroadcastAtByTurn) {
				if (at - seenAt > 60000) lastBroadcastAtByTurn.delete(key);
			}
			const lastAt = lastBroadcastAtByTurn.get(turnId) || 0;
			if (at - lastAt < floor) return;
			lastBroadcastAtByTurn.set(turnId, at);
			eventBridge.broadcast(projectId, "CHAT_PROGRESS", { turnId, tail, projectId });
		} catch {
			// Broadcast is best-effort; the unary settle stays truthful.
		}
	};
};

/***
 * MARK: ImpromptuStore
 * @description Backend-held impromptu T0 job queue (ADR 0014): read-only
 *   Runner jobs off the main task queue (retrospective chat turns). One job
 *   is one waiting HTTP turn: `enqueue` parks it, an idle Runner
 *   `pollForRunner`s it into a claim (jobId + runnerId + claim TTL fenced),
 *   streams `progress` deltas, and `complete`s it — which settles the
 *   waiter `waitFor` parked. A stale claim (dead Runner) requeues for
 *   another idle Runner; a job past its TTL fails its waiter loudly, so a
 *   turn never hangs forever. Expiry is lazy like `ClaimStore` (checked on
 *   access, plus armed waiter timers that guarantee the bound even with no
 *   polls). In-memory like `SteerStore` — a backend restart drops the queue
 *   and waiting turns fail (persistence is a later phase, out of scope).
 * @example const jobs = new ImpromptuStore(); jobs.enqueue({ projectId: 'p', prompt: 'hi', harness: 'pi' })
 ***/
export class ImpromptuStore {
	constructor({
		queueMax = 50,
		jobTtlMs = 600000,
		claimTtlMs = 300000,
		now = () => Date.now(),
		newJobId = () => uuidv4(),
		onProgress = null,
	} = {}) {
		this.queueMax = queueMax;
		this.jobTtlMs = jobTtlMs;
		this.claimTtlMs = claimTtlMs;
		this.now = now;
		this.newJobId = newJobId;
		this.onProgress = typeof onProgress === "function" ? onProgress : null;
		this.jobs = new Map();
		this.settled = new Map();
		this.completedTotal = 0;
		this.failedTotal = 0;
	}

	static _coded(statusCode, code, message) {
		const err = new Error(message);
		err.statusCode = statusCode;
		err.code = code;
		return err;
	}

	_liveJobs() {
		return [...this.jobs.values()].filter(
			(job) => job.status === "queued" || job.status === "claimed",
		);
	}

	_rememberSettled(jobId, outcome) {
		this.settled.set(jobId, { outcome, at: new Date(this.now()).toISOString() });
		while (this.settled.size > IMPROMPTU_SETTLED_KEPT) {
			const oldest = this.settled.keys().next().value;
			this.settled.delete(oldest);
		}
	}

	_failWaiter(job, err) {
		const waiter = job.waiter;
		job.waiter = null;
		if (waiter?.ceilingTimer) clearTimeout(waiter.ceilingTimer);
		if (waiter?.ttlTimer) clearTimeout(waiter.ttlTimer);
		if (waiter && typeof waiter.reject === "function") waiter.reject(err);
	}

	_settleWaiter(job, value) {
		const waiter = job.waiter;
		job.waiter = null;
		if (waiter?.ceilingTimer) clearTimeout(waiter.ceilingTimer);
		if (waiter?.ttlTimer) clearTimeout(waiter.ttlTimer);
		if (waiter && typeof waiter.resolve === "function") waiter.resolve(value);
	}

	_jobTail(job) {
		const bounded = truncateOutputTail(job.outputSoFar);
		if (job.outputOverflowed && bounded && !bounded.startsWith(CHAT_OUTPUT_TRUNCATED_MARKER)) {
			const tailLen = Math.max(
				0,
				CHAT_OUTPUT_TAIL_MAX_CHARS - CHAT_OUTPUT_TRUNCATED_MARKER.length - 1,
			);
			return `${CHAT_OUTPUT_TRUNCATED_MARKER}\n${bounded.slice(-tailLen)}`;
		}
		return bounded;
	}

	/***
	 * MARK: enqueue
	 * @description Parks one impromptu job at the back of the queue. Past the
	 *   cap the turn fails fast (429 `impromptu_queue_full`) instead of
	 *   queueing behind a wedged fleet.
	 * @example jobs.enqueue({ projectId: 'p', prompt: 'hi', harness: 'pi' }) => { jobId: '…', … }
	 * @param {Object} job - `{ projectId, kind?, prompt, harness?, model?, turnId?, pinnedRunnerId?, timeoutMs? }`.
	 * @returns {Object} The queued job record.
	 ***/
	enqueue(job = {}) {
		this.expireStale();
		if (typeof job?.prompt !== "string" || !job.prompt) {
			throw ImpromptuStore._coded(400, "INVALID_IMPROMPTU_ARGS", "impromptu job requires a prompt.");
		}
		if (this._liveJobs().length >= this.queueMax) {
			throw ImpromptuStore._coded(
				429,
				"impromptu_queue_full",
				`Impromptu queue is full (${this.queueMax} jobs); retry the turn in a moment.`,
			);
		}
		const at = this.now();
		const record = {
			jobId: this.newJobId(),
			projectId: typeof job.projectId === "string" ? job.projectId : null,
			kind: typeof job.kind === "string" && job.kind ? job.kind : "retrospective-chat",
			prompt: job.prompt,
			harness: typeof job.harness === "string" && job.harness ? job.harness : null,
			model: typeof job.model === "string" && job.model ? job.model : null,
			turnId: typeof job.turnId === "string" && job.turnId ? job.turnId : null,
			pinnedRunnerId:
				typeof job.pinnedRunnerId === "string" && job.pinnedRunnerId ? job.pinnedRunnerId : null,
			status: "queued",
			enqueuedAt: new Date(at).toISOString(),
			expiresAt: at + this.jobTtlMs,
			claim: null,
			outputSoFar: "",
			outputOverflowed: false,
			lastSeq: -1,
			waiter: null,
		};
		this.jobs.set(record.jobId, record);
		return record;
	}

	/***
	 * MARK: waitFor
	 * @description Parks the HTTP turn on one job: resolves `{ output }` when
	 *   the Runner completes, rejects `chat_prompt_failed` when it reports
	 *   failure or the job TTL lapses, and rejects `chat_prompt_timeout`
	 *   only under the opt-in ceiling. Both rejections carry `partialOutput`
	 *   (bounded tail, "" when nothing streamed). The TTL timer guarantees
	 *   the bound even when no Runner ever polls.
	 * @example await jobs.waitFor(jobId, { timeoutMs: 0 }) => { output: '…' }
	 * @param {string} jobId - Job id from `enqueue`.
	 * @param {Object} [opts]
	 * @param {number} [opts.timeoutMs=0] - Opt-in ceiling in ms (`0` disables).
	 * @returns {Promise<{output: string}>} The Runner's final text.
	 ***/
	waitFor(jobId, { timeoutMs = 0 } = {}) {
		const job = this.jobs.get(jobId);
		if (!job || (job.status !== "queued" && job.status !== "claimed")) {
			return Promise.reject(
				ImpromptuStore._coded(409, "STALE_IMPROMPTU", `Unknown impromptu job ${jobId}.`),
			);
		}
		if (job.waiter) {
			return Promise.reject(
				ImpromptuStore._coded(409, "STALE_IMPROMPTU", `Impromptu job ${jobId} is already awaited.`),
			);
		}
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, ceilingTimer: null, ttlTimer: null };
			job.waiter = waiter;
			const ceilingMs = normalizeTimeoutMs(timeoutMs);
			if (ceilingMs > 0) {
				waiter.ceilingTimer = setTimeout(() => {
					const err = new Error(`Chat prompt timed out after ${ceilingMs}ms`);
					err.code = "chat_prompt_timeout";
					err.statusCode = 504;
					err.partialOutput = this._jobTail(job);
					this.jobs.delete(job.jobId);
					this._rememberSettled(job.jobId, "timeout");
					this.failedTotal += 1;
					this._failWaiter(job, err);
				}, ceilingMs);
				if (typeof waiter.ceilingTimer.unref === "function") waiter.ceilingTimer.unref();
			}
			const ttlMs = Math.max(0, job.expiresAt - this.now());
			waiter.ttlTimer = setTimeout(() => {
				const err = new Error(
					`Impromptu job ${job.jobId} expired without a Runner answer; retry the turn.`,
				);
				err.code = "chat_prompt_failed";
				err.statusCode = 502;
				err.partialOutput = this._jobTail(job);
				this.jobs.delete(job.jobId);
				this._rememberSettled(job.jobId, "expired");
				this.failedTotal += 1;
				this._failWaiter(job, err);
			}, ttlMs);
			if (typeof waiter.ttlTimer.unref === "function") waiter.ttlTimer.unref();
		});
	}

	/***
	 * MARK: pollForRunner
	 * @description Assigns the oldest queued job one Runner matches: the pin
	 *   is enforced here (a pinned job goes only to its Runner), capability
	 *   matching stays with the caller's `matchJob`, and the winner is
	 *   claim-fenced (jobId + runnerId + claim TTL) so two polling Runners
	 *   can never serve one job.
	 * @example jobs.pollForRunner({ runnerId: 'r1', matchJob: () => true }) => { assigned… } | null
	 * @param {Object} opts
	 * @param {string} opts.runnerId - Polling Runner id.
	 * @param {Function} opts.matchJob - `(job) => boolean` capability match.
	 * @returns {Object|null} The wire-shaped job, or null when nothing matches.
	 ***/
	pollForRunner({ runnerId, matchJob } = {}) {
		this.expireStale();
		if (!runnerId || typeof matchJob !== "function") return null;
		const at = this.now();
		const queued = [...this.jobs.values()].filter((job) => job.status === "queued");
		for (const job of queued) {
			if (job.pinnedRunnerId && job.pinnedRunnerId !== runnerId) continue;
			let matches = false;
			try {
				matches = matchJob(job) === true;
			} catch {
				matches = false;
			}
			if (!matches) continue;
			job.status = "claimed";
			job.claim = { runnerId, claimedAt: new Date(at).toISOString(), expiresAt: at + this.claimTtlMs };
			return {
				jobId: job.jobId,
				projectId: job.projectId,
				kind: job.kind,
				prompt: job.prompt,
				harness: job.harness,
				model: job.model,
				timeoutMs: Math.max(0, job.expiresAt - at),
				turnId: job.turnId,
			};
		}
		return null;
	}

	/***
	 * MARK: progress
	 * @description Records one Runner delta: appends it to the job tail
	 *   (live-capped, overflow marker preserved), refreshes the claim (a
	 *   streaming Runner is alive — progress is its liveness signal), and
	 *   forwards the tail to the store's `onProgress` sink. Stale or
	 *   duplicate seqs answer idempotent without appending; a claim held by
	 *   another Runner (re-picked after this one went quiet) rejects stale
	 *   so two writers can never interleave one tail.
	 * @example jobs.progress({ jobId, runnerId: 'r1', seq: 0, delta: 'hi' }) => { tail: 'hi' }
	 * @param {Object} opts - `{ jobId, runnerId, seq, delta }`.
	 * @returns {Object} `{ tail }`, or `{ duplicate: true, tail }`.
	 ***/
	progress({ jobId, runnerId, seq, delta } = {}) {
		const job = this.jobs.get(jobId);
		if (!job || (job.status !== "queued" && job.status !== "claimed")) {
			throw ImpromptuStore._coded(
				409,
				"STALE_IMPROMPTU",
				`Stale impromptu progress for job ${jobId}: unknown or settled.`,
			);
		}
		if (job.status !== "claimed" || job.claim?.runnerId !== runnerId) {
			throw ImpromptuStore._coded(
				409,
				"STALE_IMPROMPTU",
				`Stale impromptu progress for job ${jobId}: the claim belongs to another Runner.`,
			);
		}
		if (!Number.isInteger(seq) || seq < 0) {
			throw ImpromptuStore._coded(
				400,
				"INVALID_IMPROMPTU_ARGS",
				"impromptu progress requires a seq integer >= 0.",
			);
		}
		if (typeof delta !== "string") {
			throw ImpromptuStore._coded(400, "INVALID_IMPROMPTU_ARGS", "impromptu progress requires a delta string.");
		}
		if (seq <= job.lastSeq) {
			return { duplicate: true, tail: this._jobTail(job) };
		}
		job.lastSeq = seq;
		if (delta) {
			const combined = `${job.outputSoFar}${delta}`;
			if (combined.length > CHAT_OUTPUT_TAIL_MAX_CHARS) job.outputOverflowed = true;
			job.outputSoFar = combined.slice(-CHAT_OUTPUT_TAIL_MAX_CHARS);
		}
		job.claim.expiresAt = this.now() + this.claimTtlMs;
		const tail = this._jobTail(job);
		if (this.onProgress) {
			try {
				this.onProgress({ jobId: job.jobId, projectId: job.projectId, turnId: job.turnId, tail });
			} catch {
				// A progress sink must never fail the job.
			}
		}
		return { tail };
	}

	/***
	 * MARK: complete
	 * @description Settles one job: `completed` resolves the waiter with the
	 *   Runner's final text, `failed` rejects it `chat_prompt_failed` with
	 *   the streamed tail as partial output. First writer wins (a re-picked
	 *   job's second completion lands stale); a retried completion for an
	 *   already-settled job is a no-op success.
	 * @example jobs.complete({ jobId, runnerId: 'r1', outcome: 'completed', output: 'hi' }) => { duplicate: false }
	 * @param {Object} opts - `{ jobId, runnerId, outcome, output?, error? }`.
	 * @returns {Object} `{ duplicate: false }`, or `{ duplicate: true }` on retry.
	 ***/
	complete({ jobId, runnerId, outcome, output = "", error = "" } = {}) {
		if (outcome !== "completed" && outcome !== "failed") {
			throw ImpromptuStore._coded(
				400,
				"INVALID_IMPROMPTU_ARGS",
				"impromptu complete requires outcome completed or failed.",
			);
		}
		const job = this.jobs.get(jobId);
		if (!job || (job.status !== "queued" && job.status !== "claimed")) {
			if (this.settled.has(jobId)) return { duplicate: true };
			throw ImpromptuStore._coded(
				409,
				"STALE_IMPROMPTU",
				`Stale impromptu completion for job ${jobId}: unknown or settled.`,
			);
		}
		if (job.status !== "claimed" || job.claim?.runnerId !== runnerId) {
			throw ImpromptuStore._coded(
				409,
				"STALE_IMPROMPTU",
				`Stale impromptu completion for job ${jobId}: the claim belongs to another Runner.`,
			);
		}
		this.jobs.delete(jobId);
		this._rememberSettled(jobId, outcome);
		if (outcome === "completed") {
			this.completedTotal += 1;
			this._settleWaiter(job, { output: typeof output === "string" ? output : "" });
		} else {
			this.failedTotal += 1;
			const err = new Error(
				`Chat prompt failed: ${typeof error === "string" && error ? error : "the Runner reported failure"}`,
			);
			err.code = "chat_prompt_failed";
			err.statusCode = 502;
			err.partialOutput = this._jobTail(job);
			this._failWaiter(job, err);
		}
		return { duplicate: false };
	}

	/***
	 * MARK: expireStale
	 * @description Lazy sweep (same idiom as `ClaimStore`): stale claims
	 *   requeue for another idle Runner (the waiter stays parked), jobs past
	 *   their TTL fail their waiter loudly. Runs at the top of every
	 *   queue-mutating call; the waiter TTL timer guarantees the bound even
	 *   with no polls.
	 * @example jobs.expireStale() => { requeued: 1, expired: 0 }
	 * @param {number} [at] - Clock override (defaults to the store clock).
	 * @returns {Object} `{ requeued, expired }` counts.
	 ***/
	expireStale(at = this.now()) {
		let requeued = 0;
		let expired = 0;
		for (const job of [...this.jobs.values()]) {
			if (job.status !== "queued" && job.status !== "claimed") continue;
			if (at > job.expiresAt) {
				this.jobs.delete(job.jobId);
				this._rememberSettled(job.jobId, "expired");
				this.failedTotal += 1;
				expired += 1;
				const err = new Error(
					`Impromptu job ${job.jobId} expired without a Runner answer; retry the turn.`,
				);
				err.code = "chat_prompt_failed";
				err.statusCode = 502;
				err.partialOutput = this._jobTail(job);
				this._failWaiter(job, err);
				continue;
			}
			if (job.status === "claimed" && job.claim && at > job.claim.expiresAt) {
				job.status = "queued";
				job.claim = null;
				requeued += 1;
			}
		}
		return { requeued, expired };
	}

	/***
	 * MARK: get
	 * @description Reads one live job by id (routes, monitor, tests).
	 * @example jobs.get(jobId) => { jobId, status: 'claimed', … } | null
	 * @param {string} jobId - Job id.
	 * @returns {Object|null} The job record, or null when unknown/settled.
	 ***/
	get(jobId) {
		return this.jobs.get(jobId) || null;
	}

	/***
	 * MARK: snapshot
	 * @description Queue counters for `GET /runners/monitor` (the channel is
	 *   observable without task rows): live queued/claimed plus lifetime
	 *   completed/failed (timeouts and expiries count as failed).
	 * @example jobs.snapshot() => { queued: 1, claimed: 0, completed: 4, failed: 1 }
	 * @returns {Object} `{ queued, claimed, completed, failed }`.
	 ***/
	snapshot() {
		let queued = 0;
		let claimed = 0;
		for (const job of this.jobs.values()) {
			if (job.status === "queued") queued += 1;
			else if (job.status === "claimed") claimed += 1;
		}
		return { queued, claimed, completed: this.completedTotal, failed: this.failedTotal };
	}
}

/***
 * MARK: createImpromptuDispatcher
 * @description The chat route's single seam onto the impromptu channel (ADR
 *   0014): fail-fast capability selection (any capable Runner, or the pinned
 *   override), then enqueue + await the Runner's answer. Throws coded errors
 *   the route maps onto its contract: `no_runner_available` / `runner_unavailable`
 *   (503), `impromptu_disabled` (503), `impromptu_queue_full` (429),
 *   `chat_prompt_failed` (502, with partial output), `chat_prompt_timeout`
 *   (504, opt-in ceiling only, with partial output).
 * @example const dispatch = createImpromptuDispatcher({ impromptuStore, runnerRegistry, claimStore }); await dispatch({ projectId: 'p', prompt: 'hi', harness: 'pi' })
 * @param {Object} opts
 * @param {Object} opts.impromptuStore - The job queue.
 * @param {Object} opts.runnerRegistry - Fleet registry (`records()`).
 * @param {Object} opts.claimStore - Task leases (`liveHolds()`).
 * @param {boolean} [opts.enabled=true] - Channel master switch.
 * @param {number} [opts.staleAfterMs=60000] - Heartbeat freshness horizon.
 * @param {Function} [opts.now] - Clock injection.
 * @returns {Function} `dispatch({ projectId, prompt, harness?, model?, turnId?, runnerId?, timeoutMs? }) => Promise<{ reply, output, harness, model }>`.
 ***/
export const createImpromptuDispatcher = ({
	impromptuStore,
	runnerRegistry,
	claimStore,
	enabled = true,
	staleAfterMs = 60000,
	now = () => Date.now(),
} = {}) => {
	if (!impromptuStore || !runnerRegistry || !claimStore) {
		throw new Error("createImpromptuDispatcher needs impromptuStore, runnerRegistry, and claimStore.");
	}
	return async ({ projectId, prompt, harness, model, turnId, runnerId, timeoutMs = 0 } = {}) => {
		if (enabled !== true) {
			const err = new Error("Impromptu chat is disabled on this backend (KAINBAIN_IMPROMPTU_ENABLED=0).");
			err.code = "impromptu_disabled";
			err.statusCode = 503;
			throw err;
		}
		const pinnedRunnerId =
			typeof runnerId === "string" && runnerId.trim() ? runnerId.trim() : null;
		const busyRunnerIds = (claimStore.liveHolds() || [])
			.map((hold) => hold?.runnerId)
			.filter((id) => typeof id === "string");
		const selection = selectRunnerForImpromptu(
			runnerRegistry.records(),
			{
				...(harness ? { harness } : {}),
				...(model ? { model } : {}),
				...(projectId ? { projectId } : {}),
				...(pinnedRunnerId ? { pinnedRunnerId } : {}),
			},
			{ staleAfterMs, busyRunnerIds, now: now() },
		);
		if (!selection.record) {
			if (pinnedRunnerId) {
				const err = new Error(
					`Runner ${pinnedRunnerId} is unavailable for this chat turn (missing, stale, or incapable); retry without the runner override.`,
				);
				err.code = "runner_unavailable";
				err.statusCode = 503;
				throw err;
			}
			const misses = Object.entries(selection.misses || {})
				.slice(0, 5)
				.map(([id, reason]) => `${id}=${reason}`)
				.join(", ");
			const err = new Error(
				`No runner available for this chat turn${harness ? ` (harness=${harness}, tier=T0)` : ""}${misses ? `: ${misses}` : " — no runners registered"}.`,
			);
			err.code = "no_runner_available";
			err.statusCode = 503;
			throw err;
		}
		const job = impromptuStore.enqueue({
			projectId,
			prompt,
			harness,
			model,
			turnId,
			pinnedRunnerId,
		});
		const { output } = await impromptuStore.waitFor(job.jobId, { timeoutMs });
		const reply = typeof output === "string" ? output : "";
		return {
			reply,
			output: truncateOutputTail(reply),
			harness: job.harness,
			model: job.model,
		};
	};
};
