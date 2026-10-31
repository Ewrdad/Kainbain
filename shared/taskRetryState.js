/***
 * MARK: taskRetryState (shared)
 * @description THE single source of truth for a task's retry state, shared by
 *   the backend (`api/work/taskRetryState.js`) and the frontend (shim in
 *   `frontend/src/components/tasks/taskRetryState.js`) so the two can never
 *   drift. Plain ESM, zero dependencies.
 *
 *   The scheduler keeps using `in_stage` as its identity; `retryState` is the
 *   annotation that says WHY it is in_stage. Writes happen through the shared
 *   setters so no dispatcher can leave a stale flag behind.
 *
 *   States:
 *     - `none`        — no retry in flight or scheduled.
 *     - `scheduled`   — a retry is armed/scheduled but has not started.
 *     - `running`     — a retry attempt is currently running.
 *     - `exhausted`   — the retry budget is exhausted and the task parked.
 *   
 *   Backward compat: when `task.retryState` is absent, derive it from the
 *   legacy `task.autoRetrying` flag (true → `scheduled`), except when the
 *   task's status is terminal/paused/interrupted/blocked, which forces
 *   `none` (or `exhausted` for a parked failed task).
 * @example retryStateOf(null) => { state: "none", attempt: 0, maxAttempts: 0, nextRetryAt: null, hasRetryableSchedule: false }
 * @example retryStateOf({ autoRetrying: true, status: "in_stage" }) => { state: "scheduled", attempt: 0, maxAttempts: 0, nextRetryAt: null, hasRetryableSchedule: true }
 * @example isRetryingTask({ retryState: "running", status: "in_stage" }) => true
 * @example isRetryingTask({ status: "failed", autoRetrying: true }) => false
 ***/
export const TASK_RETRY_STATES = Object.freeze({
	NONE: "none",
	SCHEDULED: "scheduled",
	RUNNING: "running",
	EXHAUSTED: "exhausted",
});

const RETRYING_STATES = new Set([TASK_RETRY_STATES.SCHEDULED, TASK_RETRY_STATES.RUNNING]);

const TERMINAL_OR_PAUSED_STATUSES = new Set([
	"failed",
	"passed",
	"completed",
	"done",
	"paused",
	"interrupted",
	"blocked",
]);


const isObject = (value) => {
	return value && typeof value === "object" && !Array.isArray(value);
}


const normaliseStatus = (task) => {
	return String(task?.status ?? "").trim().toLowerCase();
}


const rawStateOf = (task) => {
	if (!isObject(task)) return TASK_RETRY_STATES.NONE;
	const state = task.retryState;
	if (
		state === TASK_RETRY_STATES.NONE ||
		state === TASK_RETRY_STATES.SCHEDULED ||
		state === TASK_RETRY_STATES.RUNNING ||
		state === TASK_RETRY_STATES.EXHAUSTED
	) {
		return state;
	}
	if (task.autoRetrying === true) {
		const status = normaliseStatus(task);
		if (TERMINAL_OR_PAUSED_STATUSES.has(status)) {
			return status === "failed" ? TASK_RETRY_STATES.EXHAUSTED : TASK_RETRY_STATES.NONE;
		}
		return TASK_RETRY_STATES.SCHEDULED;
	}
	return TASK_RETRY_STATES.NONE;
}


const clampNumber = (value, fallback = 0) => {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return fallback;
	return n;
}


const hasTerminalStatus = (status) => {
	return TERMINAL_OR_PAUSED_STATUSES.has(status);
}

/***
 * @example retryStateOf({ autoRetrying: true, status: "in_stage" }) => { state: "scheduled", attempt: 0, maxAttempts: 0, nextRetryAt: null, hasRetryableSchedule: true }
 ***/
export const retryStateOf = (task) => {
	if (!isObject(task)) {
		return {
			state: TASK_RETRY_STATES.NONE,
			attempt: 0,
			maxAttempts: 0,
			nextRetryAt: null,
			hasRetryableSchedule: false,
		};
	}
	const status = normaliseStatus(task);
	let state = rawStateOf(task);

	// Terminal/paused/interrupted tasks can never be actively retrying:
	// convert a lingering scheduled/running flag into a non-retrying state.
	if (hasTerminalStatus(status) && (state === TASK_RETRY_STATES.SCHEDULED || state === TASK_RETRY_STATES.RUNNING)) {
		state = status === "failed" ? TASK_RETRY_STATES.EXHAUSTED : TASK_RETRY_STATES.NONE;
	}
	// A retry only makes sense while the task is in_stage or running.
	if (
		state !== TASK_RETRY_STATES.EXHAUSTED &&
		status &&
		status !== "in_stage" &&
		!String(status).startsWith("running_") &&
		status !== "advancing"
	) {
		if (state === TASK_RETRY_STATES.SCHEDULED || state === TASK_RETRY_STATES.RUNNING) {
			state = TASK_RETRY_STATES.NONE;
		}
	}

	const attempt = clampNumber(task.retryAttempt ?? task.retryAttemptCount ?? task.autoIterationCount ?? task.infraRetryCount);
	const maxAttempts = clampNumber(task.retryMaxAttempts ?? task.retryMaxAttempt ?? task.maxRetryAttempts ?? task.maxAttempts);
	const nextRetryAt = task.nextRetryAt ? String(task.nextRetryAt) : null;
	const hasRetryableSchedule =
		state === TASK_RETRY_STATES.SCHEDULED && Boolean(nextRetryAt);

	return {
		state,
		attempt,
		maxAttempts,
		nextRetryAt,
		hasRetryableSchedule,
	};
}

/***
 * @example isRetryingTask({ retryState: "running", status: "in_stage" }) => true
 ***/
export const isRetryingTask = (task) => {
	const { state } = retryStateOf(task);
	return RETRYING_STATES.has(state);
}

/***
 * @example retryProgressLabel({ retryState: "scheduled", autoRetrying: true, status: "in_stage" }) => "RETRYING (scheduled)"
 ***/
export const retryProgressLabel = (task) => {
	const info = retryStateOf(task);
	if (!RETRYING_STATES.has(info.state)) {
		// Manual retry badge when not actively retrying but flagged manual?
		if (task?.lastRetrySource === "operator" && info.state === TASK_RETRY_STATES.EXHAUSTED) {
			return "RETRYING (manual)";
		}
		return "";
	}
	const manual = task?.lastRetrySource === "operator";
	const scheduled = info.state === TASK_RETRY_STATES.SCHEDULED;
	const suffix = manual ? " (manual)" : scheduled ? " (scheduled)" : "";
	const progress =
		info.attempt > 0 || info.maxAttempts > 0
			? ` ${info.attempt}/${info.maxAttempts || info.attempt || 0}`
			: "";
	// For a plain running retry show "RETRYING"; counts appended without parentheses.
	if (info.state === TASK_RETRY_STATES.RUNNING && !scheduled) {
		if (manual) return `RETRYING (manual)${progress}`.trim();
		return `RETRYING${progress}`.trim();
	}
	if (manual && scheduled) return `RETRYING (manual)${progress}`.trim();
	if (scheduled) return `RETRYING (scheduled)${progress}`.trim();
	return `RETRYING${progress}`.trim();
}

/***
 * @example clearRetryState({ status: "in_stage", autoRetrying: true }) => { autoRetrying: false, retryState: "none" }
 ***/
export const clearRetryState = (task, opts = {}) => {
	if (!isObject(task)) return task;
	task.autoRetrying = false;
	task.retryState = TASK_RETRY_STATES.NONE;
	task.nextRetryAt = null;
	task.retryAttempt = 0;
	task.retryMaxAttempts = 0;
	task.retryScheduledInStandby = false;
	if (opts && (opts.clearFailureReason === true)) {
		delete task.failureReason;
		delete task.lastError;
	}
	if (opts && opts.keepFailureReason !== true && opts.preserveFailureReason === false) {
		// backwards-friendly: only clear if explicitly requested
	}
	return task;
}

/***
 * @example setRetryScheduled({ status: "in_stage" }, { attempt: 2, maxAttempts: 5, nextRetryAt: "2020-01-01T00:00:00.000Z" }) => { retryState: "scheduled" }
 ***/
export const setRetryScheduled = (task, meta = {}) => {
	if (!isObject(task)) return task;
	task.retryState = TASK_RETRY_STATES.SCHEDULED;
	task.autoRetrying = true;
	if (meta.attempt !== undefined) task.retryAttempt = Number(meta.attempt) || task.retryAttempt || 0;
	if (meta.maxAttempts !== undefined) task.retryMaxAttempts = Number(meta.maxAttempts) || task.retryMaxAttempts || 0;
	if (meta.nextRetryAt !== undefined) task.nextRetryAt = meta.nextRetryAt === null ? null : String(meta.nextRetryAt);
	task.retryScheduledInStandby = false;
	return task;
}

/***
 * @example isRetryStuck({ retryState: "scheduled", nextRetryAt: "2020-01-01T00:00:00.000Z", status: "in_stage" }, 1e13) => true
 ***/
export const isRetryStuck = (task, nowMs = Date.now()) => {
	const info = retryStateOf(task);
	if (info.state !== TASK_RETRY_STATES.SCHEDULED) return false;
	if (!info.nextRetryAt) return false;
	const deadline = Date.parse(info.nextRetryAt);
	if (!Number.isFinite(deadline)) return false;
	const grace = 30 * 1000; // base handled by caller? plan: 2*delay+30s needs delay unknown
	const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
	return now - deadline > grace; // older than grace
}