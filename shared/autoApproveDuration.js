/***
 * MARK: autoApproveDuration
 * @description Shared human-stage auto-approve duration grammar: parsing,
 *   validation, deadline stamps, and due predicates. One grammar for the API
 *   save boundary, stage normalization, the sweeper, and (later) the UI.
 *
 *   Canonical stored form is an integer millisecond count
 *   (`stage.autoApproveAfterMs`); absent/zero means the timer is off.
 *   Bare numbers mean MILLISECONDS (the `stage.timeout` bare-ms
 *   convention) — `"10000"` is ten seconds, never ten days. Human strings
 *   (`"10 days"`, `"36 hours"`, `"1 week"`, `"90m"`) parse at the config
 *   boundary and are never re-parsed at sweep time.
 *
 *   Never-early rule (legal holds): fractional input rounds UP to the next
 *   whole millisecond, the deadline is stamped once at stage entry, and the
 *   sweep predicate is strictly `now >= stamp` with no epsilon.
 ***/

/***
 * MARK: AUTO_APPROVE_MIN_MS
 * @description Shortest hold the stage-save boundary accepts (60s): a typo
 *   must not create a sub-minute "hold". Only the save boundary enforces
 *   this — normalization and the sweeper accept any positive duration so
 *   in-memory stages and tests can use short holds.
 * @example AUTO_APPROVE_MIN_MS => 60000
 ***/
export const AUTO_APPROVE_MIN_MS = 60000;

/***
 * MARK: AUTO_APPROVE_MAX_MS
 * @description Longest hold the stage-save boundary accepts (365 days):
 *   catches unit mistakes (`"10000"` meaning seconds vs ms) before they
 *   strand a task for years. Only the save boundary enforces this.
 * @example AUTO_APPROVE_MAX_MS => 31536000000
 ***/
export const AUTO_APPROVE_MAX_MS = 365 * 24 * 60 * 60 * 1000;

/***
 * MARK: AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS
 * @description Default reminder lead (24h) before the configured hold is
 *   halved into it: the effective lead is `min(this, half the hold)`, so a
 *   10-day hold reminds 24h out and a 60s hold reminds 30s out.
 * @example AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS => 86400000
 ***/
export const AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

// Millisecond multipliers per accepted unit suffix (lowercase). Long and
// plural forms map to the same multiplier; parsing lowercases first.
const AUTO_APPROVE_UNIT_MS = {
	ms: 1,
	millisecond: 1,
	milliseconds: 1,
	s: 1000,
	sec: 1000,
	secs: 1000,
	second: 1000,
	seconds: 1000,
	m: 60000,
	min: 60000,
	mins: 60000,
	minute: 60000,
	minutes: 60000,
	h: 3600000,
	hr: 3600000,
	hrs: 3600000,
	hour: 3600000,
	hours: 3600000,
	d: 86400000,
	day: 86400000,
	days: 86400000,
	w: 604800000,
	week: 604800000,
	weeks: 604800000,
};

// Duration labels are tiny; bound input before numeric regexes.
const AUTO_APPROVE_MAX_INPUT_CHARS = 128;

/***
 * MARK: parseAutoApproveDuration
 * @description Parses a configured hold into integer milliseconds, or `null`
 *   when the timer is off (absent/empty/zero) or unparseable. Numbers are
 *   bare milliseconds (rounded UP); strings accept unit parts like `"10
 *   days"` or `"1h 30m"` (case-insensitive, rounded UP); a bare numeric
 *   string is milliseconds. Garbage, negatives, NaN, and non-scalars all
 *   read as `null` — use `validateAutoApproveDuration` at the save boundary
 *   to tell "off" apart from "invalid".
 * @example parseAutoApproveDuration('10 days') => 864000000
 * @example parseAutoApproveDuration('36 hours') => 129600000
 * @example parseAutoApproveDuration(60000) => 60000
 * @example parseAutoApproveDuration(undefined) => null
 * @param {*} value - Raw configured value (string, number, or absent).
 * @returns {number|null} Positive integer ms, or null when off/unparseable.
 ***/
export const parseAutoApproveDuration = (value) => {
	if (value === undefined || value === null) return null;
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return null;
		return Math.ceil(value);
	}
	if (typeof value !== "string") return null;
	const text = value.trim().toLowerCase();
	if (!text) return null;
	if (text.length > AUTO_APPROVE_MAX_INPUT_CHARS) return null;
	// Bare numbers mean milliseconds (the stage.timeout convention).
	// eslint-disable-next-line security/detect-unsafe-regex -- bounded to 128 chars above, single optional fraction
	if (/^\d+(?:\.\d+)?$/.test(text)) {
		const ms = Number(text);
		if (!Number.isFinite(ms) || ms <= 0) return null;
		return Math.ceil(ms);
	}
	// Unit parts must consume the ENTIRE string: trailing garbage ("10 days
	// ish") is unparseable, never silently truncated. Longest-first order:
	// a short alternative must never match the prefix of a longer unit
	// ("m" eating the "m" of "ms", "s" eating the "s" of "sec").
	// eslint-disable-next-line security/detect-unsafe-regex -- bounded to 128 chars above, flat alternation
	const partPattern = /(\d+(?:\.\d+)?)\s*(milliseconds?|seconds?|minutes?|hours?|days?|weeks?|secs?|mins?|hrs?|ms|s|m|h|d|w)/g;
	let total = 0;
	let consumed = 0;
	let match = partPattern.exec(text);
	if (!match) return null;
	while (match) {
		const amount = Number(match[1]);
		/* eslint-disable-next-line security/detect-object-injection -- unit comes from the fixed alternation above */
		const unitMs = AUTO_APPROVE_UNIT_MS[match[2]];
		if (!Number.isFinite(amount) || !unitMs) return null;
		total += amount * unitMs;
		consumed = match.index + match[0].length;
		match = partPattern.exec(text);
	}
	const rest = text.slice(consumed).trim();
	if (rest !== "") return null;
	if (!Number.isFinite(total) || total <= 0) return null;
	return Math.ceil(total);
};

/***
 * MARK: formatAutoApproveDuration
 * @description Renders integer ms back into the largest exact unit for
 *   history/report text (`"10 days"`, `"36 hours"`, `"90 minutes"`).
 *   Returns `null` for non-positive input (callers fall back to generic
 *   wording) so a missing duration can never render as `"0 ms"`.
 * @example formatAutoApproveDuration(864000000) => '10 days'
 * @example formatAutoApproveDuration(129600000) => '36 hours'
 * @example formatAutoApproveDuration(0) => null
 * @param {number} ms - Duration in milliseconds.
 * @returns {string|null} Human duration, or null when not positive.
 ***/
export const formatAutoApproveDuration = (ms) => {
	if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
	const units = [
		[604800000, "week"],
		[86400000, "day"],
		[3600000, "hour"],
		[60000, "minute"],
		[1000, "second"],
		[1, "millisecond"],
	];
	for (const [unitMs, name] of units) {
		if (ms % unitMs === 0) {
			const count = ms / unitMs;
			return `${count} ${name}${count === 1 ? "" : "s"}`;
		}
	}
	return `${ms} milliseconds`;
};

/***
 * MARK: validateAutoApproveDuration
 * @description Save-boundary verdict for one raw hold value: `null` when the
 *   value saves cleanly (absent, off, or within min/max), otherwise a
 *   problem code. Off-values (`undefined`/`null`/`""`/`0`/`"0"`) are valid;
 *   garbage, negatives, and NaN are `UNPARSEABLE`; in-range grammar outside
 *   the bounds is `TOO_SHORT`/`TOO_LONG`.
 * @example validateAutoApproveDuration('10 days') => null
 * @example validateAutoApproveDuration('30s') => 'TOO_SHORT'
 * @example validateAutoApproveDuration('ten days') => 'UNPARSEABLE'
 * @param {*} value - Raw configured value.
 * @param {Object} [opts] - `{ minMs, maxMs }` bounds (default 60s/365d).
 * @returns {string|null} Problem code, or null when valid.
 ***/
export const validateAutoApproveDuration = (
	value,
	{ minMs = AUTO_APPROVE_MIN_MS, maxMs = AUTO_APPROVE_MAX_MS } = {},
) => {
	if (value === undefined || value === null) return null;
	if (typeof value === "string" && value.trim() === "") return null;
	if (typeof value === "number" && value === 0) return null;
	if (typeof value === "string" && Number(value.trim()) === 0) {
		// A bare numeric zero string ("0", "0.0") is off, like the number 0 —
		// but "0 days" parses to null below and reads as UNPARSEABLE, which
		// is deliberate: an explicit zero hold is a typo, not "off".
		// eslint-disable-next-line security/detect-unsafe-regex -- bounded numeric check on a trimmed string
		if (/^\d+(?:\.\d+)?$/.test(value.trim().toLowerCase())) return null;
	}
	const ms = parseAutoApproveDuration(value);
	if (ms === null) return "UNPARSEABLE";
	if (ms < minMs) return "TOO_SHORT";
	if (ms > maxMs) return "TOO_LONG";
	return null;
};

/***
 * MARK: collectInvalidStageAutoApproves
 * @description Save-time validation for stage hold shapes: one problem per
 *   stage whose `autoApproveAfterMs` is present but invalid (see
 *   `validateAutoApproveDuration`). Stage create/update routes refuse such
 *   saves with 400 so a typo can never silently save as unrestricted or as
 *   a surprise sub-minute hold. Absent/off values never flag.
 * @example collectInvalidStageAutoApproves([{ id: 's1', autoApproveAfterMs: 'ten days' }]) => [{ index: 0, stageId: 's1', problem: 'UNPARSEABLE' }]
 * @example collectInvalidStageAutoApproves([{ id: 's1' }]) => []
 * @param {Array|undefined} [stages] - Raw stages from a save payload.
 * @param {Object} [opts] - `{ minMs, maxMs }` bounds (default 60s/365d).
 * @returns {Array<Object>} Problems as `{ index, stageId, problem }`.
 ***/
export const collectInvalidStageAutoApproves = (stages, opts) => {
	if (!Array.isArray(stages)) return [];
	const problems = [];
	stages.forEach((stage, index) => {
		const raw =
			stage && typeof stage === "object"
				? stage.autoApproveAfterMs
				: undefined;
		if (raw === undefined || raw === null) return;
		const stageId =
			stage && typeof stage === "object" && stage.id !== undefined
				? stage.id
				: null;
		const problem = validateAutoApproveDuration(raw, opts);
		if (problem) problems.push({ index, stageId, problem });
	});
	return problems;
};

/***
 * MARK: assertValidStageAutoApproves
 * @description Save-boundary helper: returns a 400-shaped error payload when
 *   any stage carries an invalid `autoApproveAfterMs`, or null when every
 *   hold saves cleanly. Route handlers stay one line (`if (err) return
 *   reply.status(400).send(err)`).
 * @example assertValidStageAutoApproves([{ autoApproveAfterMs: '10 days' }]) => null
 * @example assertValidStageAutoApproves(undefined) => null
 * @param {Array|undefined} [stages] - Raw stages from a save payload.
 * @param {Object} [opts] - `{ minMs, maxMs }` bounds (default 60s/365d).
 * @returns {Object|null} `{ error, details }` for a 400, or null when clean.
 ***/
export const assertValidStageAutoApproves = (stages, opts) => {
	if (stages === undefined || stages === null) return null;
	const problems = collectInvalidStageAutoApproves(stages, opts);
	if (problems.length === 0) return null;
	return { error: "Invalid stage autoApproveAfterMs entries", details: problems };
};

/***
 * MARK: resolveAutoApproveAt
 * @description Computes the once-per-visit deadline stamp
 *   (`enteredStageAt + duration`) as an ISO string for `task.autoApproveAt`.
 *   The base is the task's stage-entry time, falling back to `now` when the
 *   entry timestamp is missing/unparseable (fail-safe direction: the hold
 *   runs from the parking moment, never shorter). Returns `null` for an
 *   off/invalid duration so callers stamp nothing.
 * @example resolveAutoApproveAt('2026-11-01T00:00:00.000Z', 86400000) => '2026-11-02T00:00:00.000Z'
 * @example resolveAutoApproveAt('2026-11-01T00:00:00.000Z', 0) => null
 * @param {string} [enteredStageAt] - ISO stage-entry timestamp.
 * @param {number} [durationMs] - Positive integer hold in ms.
 * @param {number} [now] - Clock injection (defaults to Date.now()).
 * @returns {string|null} ISO deadline, or null when no hold applies.
 ***/
export const resolveAutoApproveAt = (
	enteredStageAt,
	durationMs,
	now = Date.now(),
) => {
	if (
		typeof durationMs !== "number" ||
		!Number.isFinite(durationMs) ||
		durationMs <= 0
	) {
		return null;
	}
	const enteredMs = Date.parse(enteredStageAt ?? "");
	const baseMs = Number.isFinite(enteredMs) ? enteredMs : now;
	return new Date(baseMs + Math.ceil(durationMs)).toISOString();
};

/***
 * MARK: isAutoApproveStampDue
 * @description The never-early predicate (the legal property): true only
 *   when the stamped deadline has genuinely passed in wall-clock terms.
 *   Strict `now >= stamp`, no rounding, no epsilon — `stamp - 1ms` never
 *   fires. Missing/unparseable stamps never fire (fail closed).
 * @example isAutoApproveStampDue('2026-11-01T00:00:00.000Z', Date.parse('2026-11-01T00:00:00.000Z')) => true
 * @example isAutoApproveStampDue(null) => false
 * @param {string} [autoApproveAt] - ISO deadline stamp.
 * @param {number} [now] - Clock injection (defaults to Date.now()).
 * @returns {boolean} True only when the hold has fully elapsed.
 ***/
export const isAutoApproveStampDue = (autoApproveAt, now = Date.now()) => {
	const stampMs = Date.parse(autoApproveAt ?? "");
	if (!Number.isFinite(stampMs)) return false;
	return now >= stampMs;
};

/***
 * MARK: resolveAutoApproveReminderLeadMs
 * @description Effective reminder lead for one hold: `min(configured,
 *   half the hold)` so short holds remind proportionally (a 60s hold
 *   reminds 30s out) while long holds cap at the configured lead (24h
 *   default). A configured `0` disables reminders (`null`); an unparseable
 *   hold never reminds (fail closed).
 * @example resolveAutoApproveReminderLeadMs(864000000, 86400000) => 86400000
 * @example resolveAutoApproveReminderLeadMs(60000, 86400000) => 30000
 * @example resolveAutoApproveReminderLeadMs(60000, 0) => null
 * @param {number} [durationMs] - Positive hold in ms.
 * @param {number} [configuredLeadMs] - Configured lead (default 24h).
 * @returns {number|null} Lead ms, or null when reminders are off.
 ***/
export const resolveAutoApproveReminderLeadMs = (
	durationMs,
	configuredLeadMs = AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS,
) => {
	if (configuredLeadMs === 0) return null;
	if (
		typeof durationMs !== "number" ||
		!Number.isFinite(durationMs) ||
		durationMs <= 0
	) {
		return null;
	}
	const configured =
		typeof configuredLeadMs === "number" &&
		Number.isFinite(configuredLeadMs) &&
		configuredLeadMs > 0
			? configuredLeadMs
			: AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS;
	return Math.min(configured, Math.floor(durationMs / 2));
};

/***
 * MARK: isAutoApproveReminderDue
 * @description True only inside the pre-deadline lead window
 *   (`deadline - lead <= now < deadline`) for a task never reminded for
 *   this visit. Never before the window, never twice (the persisted
 *   `autoApproveRemindedAt` marker), and never for overdue tasks (those
 *   advance instead of reminding).
 * @example isAutoApproveReminderDue({ autoApproveAt: '2026-11-02T00:00:00.000Z' }, 86400000, Date.parse('2026-11-01T12:00:00.000Z')) => true
 * @example isAutoApproveReminderDue({ autoApproveAt: null }, 1000) => false
 * @param {Object} [task] - Task carrying the stamp + reminder marker.
 * @param {number} [leadMs] - Effective lead in ms (null/0 disables).
 * @param {number} [now] - Clock injection (defaults to Date.now()).
 * @returns {boolean} True when exactly one reminder should fire now.
 ***/
export const isAutoApproveReminderDue = (task, leadMs, now = Date.now()) => {
	if (!task || typeof task !== "object") return false;
	if (typeof leadMs !== "number" || !Number.isFinite(leadMs) || leadMs <= 0) {
		return false;
	}
	if (task.autoApproveRemindedAt) return false;
	const stampMs = Date.parse(task.autoApproveAt ?? "");
	if (!Number.isFinite(stampMs)) return false;
	return now >= stampMs - leadMs && now < stampMs;
};
