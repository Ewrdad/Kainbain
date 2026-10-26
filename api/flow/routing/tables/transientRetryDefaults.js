/***
 * MARK: transientRetryDefaults
 * @description Default Tier-2 (WP3) retry-policy knobs: exponential backoff
 *   `min(cap, base * 2^(attempt-1))` with symmetric jitter, all overridable
 *   via `api/config/schema.js` (`transientRetryBaseMs/CapMs/JitterMs/
 *   Strategy`). With base 2000 / cap 60000 / jitter 1000 / budget 5 the
 *   worst-case spacing is ~2+4+8+16+32s ≈ 62s plus execution time, absorbing
 *   a 45s gateway flap (Bowtie Scenario 1) inside budget. Legacy linear
 *   timing is reproducible exactly with strategy `linear`, base 2000,
 *   cap 30000, jitter 0.
 * @example transientRetryDefaults.baseMs => 2000
 ***/
export const transientRetryDefaults = {
	baseMs: 2000,
	capMs: 60000,
	jitterMs: 1000,
	strategy: "exponential",
	maxAttempts: 5,
};
