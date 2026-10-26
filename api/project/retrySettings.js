/***
 * MARK: RETRY_SETTING_KEYS
 * @description The project-level retry/timeout overrides a project may carry.
 *   Absent means "follow the next layer" (stage override, else global default);
 *   nothing here is ever defaulted on read, so old project files keep working.
 * @example RETRY_SETTING_KEYS.includes('maxAutoIterations') => true
 ***/
export const RETRY_SETTING_KEYS = [
	"maxAutoIterations",
	"maxTransientRetries",
	"autoIterationEnabled",
	"agentTimeoutMs",
	"ciTimeoutMs",
	"mergeTimeoutMs",
];

/***
 * MARK: normalizeRetryCount
 * @description Normalizes a retry-budget count: a finite number floors
 *   (negatives clamp to 0 = disabled, mirroring stage semantics); anything
 *   else (null, "", text) means "follow the default" (undefined).
 * @example normalizeRetryCount(2.9) => 2
 * @example normalizeRetryCount(-4) => 0
 * @example normalizeRetryCount("many") => undefined
 * @param {*} value
 * @returns {number|undefined}
 ***/
export function normalizeRetryCount(value) {
	if (value === undefined || value === null || value === "") return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return undefined;
	return Math.max(0, Math.floor(parsed));
}

/***
 * MARK: normalizeTimeoutMs
 * @description Normalizes a project timeout override in milliseconds: only a
 *   positive finite number wins (floored); zero, negatives, and non-numbers
 *   mean "follow the default" (undefined) so invalid input can never
 *   shorten a stage to zero.
 * @example normalizeTimeoutMs(123.9) => 123
 * @example normalizeTimeoutMs(0) => undefined
 * @param {*} value
 * @returns {number|undefined}
 ***/
export function normalizeTimeoutMs(value) {
	if (value === undefined || value === null || value === "") return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.floor(parsed);
}

/***
 * MARK: normalizeRetryEnabled
 * @description Normalizes the project auto-iteration flag: only an explicit
 *   boolean wins; anything else means "follow the default" (undefined).
 * @example normalizeRetryEnabled(false) => false
 * @example normalizeRetryEnabled("no") => undefined
 * @param {*} value
 * @returns {boolean|undefined}
 ***/
export function normalizeRetryEnabled(value) {
	if (typeof value === "boolean") return value;
	return undefined;
}

/***
 * MARK: normalizeProjectRetrySettings
 * @description Normalizes the retry/timeout overrides found on a source
 *   object (create/update payload, loaded file, in-memory project). Only
 *   keys present on the source are returned, so spreading the result never
 *   invents keys; clearing is explicit (null/""/undefined in, undefined
 *   out). Idempotent: normalizing twice changes nothing.
 * @example normalizeProjectRetrySettings({ maxAutoIterations: 2.9, name: 'P' }) => { maxAutoIterations: 2 }
 * @param {Object} [source]
 * @returns {Object} Normalized retry settings for the keys the source carried.
 ***/
export function normalizeProjectRetrySettings(source) {
	const normalized = {};
	if (!source || typeof source !== "object") return normalized;
	if (source.maxAutoIterations !== undefined) {
		normalized.maxAutoIterations = normalizeRetryCount(source.maxAutoIterations);
	}
	if (source.maxTransientRetries !== undefined) {
		normalized.maxTransientRetries = normalizeRetryCount(source.maxTransientRetries);
	}
	if (source.autoIterationEnabled !== undefined) {
		normalized.autoIterationEnabled = normalizeRetryEnabled(source.autoIterationEnabled);
	}
	if (source.agentTimeoutMs !== undefined) {
		normalized.agentTimeoutMs = normalizeTimeoutMs(source.agentTimeoutMs);
	}
	if (source.ciTimeoutMs !== undefined) {
		normalized.ciTimeoutMs = normalizeTimeoutMs(source.ciTimeoutMs);
	}
	// Deprecated, ignored by timeout resolution (a deploy command is an
	// ordinary ci stage and follows `ciTimeoutMs`): still normalized when
	// a persisted project carries it so old files load and round-trip
	// without loss, never dropped on load.
	if (source.deployTimeoutMs !== undefined) {
		normalized.deployTimeoutMs = normalizeTimeoutMs(source.deployTimeoutMs);
	}
	if (source.mergeTimeoutMs !== undefined) {
		normalized.mergeTimeoutMs = normalizeTimeoutMs(source.mergeTimeoutMs);
	}
	return normalized;
}
