import { resolveRetryDelayConfig } from "./resolveRetryDelayConfig.js";

/***
 * MARK: computeRetryDelay
 * @description Pure Tier-2 backoff (WP3): `linear` yields the legacy
 *   `min(cap, base * attempt)` sequence; `exponential` yields
 *   `min(cap, base * 2^(attempt-1))`. Jitter is symmetric:
 *   `actual = clamp(nominal +/- uniform(0, jitterMs), 0, capMs)`, so
 *   jitter 0 reproduces the nominal sequence exactly. The random source is
 *   injectable (`rand`, default `Math.random`) for deterministic tests and
 *   WP10 fault injection.
 * @example computeRetryDelay(1, { baseMs: 2000, capMs: 30000, jitterMs: 0, strategy: "linear" }) => 2000
 * @example computeRetryDelay(3, { baseMs: 2000, capMs: 60000, jitterMs: 0, strategy: "exponential" }) => 8000
 * @param {number} attempt - 1-based retry attempt (clamped to >= 1).
 * @param {Object} [cfg] - `{ baseMs, capMs, jitterMs, strategy }`.
 * @param {Function} [rand] - Uniform [0,1) source (default `Math.random`).
 * @returns {number} Delay in ms, integer, within [0, capMs].
 ***/
export function computeRetryDelay(attempt, cfg = {}, rand = Math.random) {
	const { baseMs, capMs, jitterMs, strategy } = resolveRetryDelayConfig(cfg);
	const n = Math.max(1, Math.floor(Number(attempt) || 1));
	const nominal =
		strategy === "linear"
			? Math.min(capMs, baseMs * n)
			: Math.min(capMs, baseMs * 2 ** (n - 1));
	if (!(jitterMs > 0)) return Math.round(nominal);
	const source = typeof rand === "function" ? rand : Math.random;
	let draw = Number(source());
	if (!Number.isFinite(draw)) draw = 0.5;
	draw = Math.min(1, Math.max(0, draw));
	const signed = draw * 2 - 1;
	const actual = nominal + signed * jitterMs;
	return Math.round(Math.min(capMs, Math.max(0, actual)));
}
