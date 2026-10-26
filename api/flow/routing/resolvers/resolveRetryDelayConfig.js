import { config } from "../../../config.js";
import { transientRetryDefaults } from "../tables/transientRetryDefaults.js";

/***
 * MARK: resolveRetryDelayConfig
 * @description Reads the effective Tier-2 delay knobs: explicit per-call
 *   overrides win (WP10 fault-injection seam), otherwise the live global
 *   config, otherwise the WP3 defaults above. Non-finite/negative inputs
 *   fall through to the next layer; an unknown strategy falls back to
 *   exponential.
 * @example resolveRetryDelayConfig({ baseMs: 100 }) => { baseMs: 100, capMs: 60000, … }
 * @param {Object} [overrides] - Per-call delay overrides (`baseMs`, `capMs`, `jitterMs`, `strategy`).
 * @returns {{ baseMs: number, capMs: number, jitterMs: number, strategy: string }}
 ***/
export function resolveRetryDelayConfig(overrides = {}) {
	const pick = (value, fallback) =>
		typeof value === "number" && Number.isFinite(value) && value >= 0
			? value
			: fallback;
	const strategy =
		overrides?.strategy === "linear" || overrides?.strategy === "exponential"
			? overrides.strategy
			: config?.transientRetryStrategy === "linear" ||
				  config?.transientRetryStrategy === "exponential"
				? config.transientRetryStrategy
				: transientRetryDefaults.strategy;
	return {
		baseMs: pick(overrides?.baseMs, pick(config?.transientRetryBaseMs, transientRetryDefaults.baseMs)),
		capMs: pick(overrides?.capMs, pick(config?.transientRetryCapMs, transientRetryDefaults.capMs)),
		jitterMs: pick(overrides?.jitterMs, pick(config?.transientRetryJitterMs, transientRetryDefaults.jitterMs)),
		strategy,
	};
}
