/***
 * MARK: harnessSupportTiers
 * @description The canonical harness support-tier vocabulary, mirroring
 *   `docs/EngineDetails/HarnessSupportTeirs.md`: Tier 1 = direct in-KainBain
 *   integration, Tier 2 = ACP / separate programmatic invocation, Tier 3 =
 *   exec / `-p` functionality, Tier 4 = separate invocation needed, plus the
 *   `"unsupported"` terminal state. This module is the ONE place the tier
 *   wording lives on the backend; the `/harnesses` API projects it so the UI
 *   never hard-codes a per-harness tier map.
 *
 *   Tiers describe integration DEPTH, not model quality — a Tier 3 harness is
 *   not "worse", it simply exposes only a one-way exec surface today.
 */

/** level -> { level, label, summary }. A Map (not an object) so lookups never
 *  walk the prototype chain on untrusted keys. */
const TIER_INFO = new Map([
	["1", { level: "1", label: "Tier 1", summary: "Direct integration in KainBain" }],
	["2", { level: "2", label: "Tier 2", summary: "ACP / programmatic invocation" }],
	["3", { level: "3", label: "Tier 3", summary: "Exec / -p functionality" }],
	["4", { level: "4", label: "Tier 4", summary: "Separate invocation needed" }],
	[
		"unsupported",
		{ level: "unsupported", label: "Not supported", summary: "No integration path" },
	],
]);

/***
 * MARK: DEFAULT_HARNESS_SUPPORT_TIER
 * @description The honest round-down applied when a harness registers without
 *   declaring a tier: an undeclared harness has no proven integration deeper
 *   than separate invocation, so it is labelled Tier 4 until it says otherwise.
 ***/
export const DEFAULT_HARNESS_SUPPORT_TIER = "4";

/***
 * MARK: normalizeHarnessSupportTier
 * @description Normalizes a declared tier to its canonical key. Blank/unset
 *   values round down to the conservative default (Tier 4); an explicit but
 *   unknown value throws so a typo fails at registration instead of silently
 *   mislabelling a harness.
 * @example normalizeHarnessSupportTier("2") => "2"
 * @example normalizeHarnessSupportTier(undefined) => "4"
 * @example normalizeHarnessSupportTier("0") // throws
 * @param {unknown} value - Declared tier (`1`..`4`, `"unsupported"`, or blank).
 * @returns {"1"|"2"|"3"|"4"|"unsupported"} The canonical tier key.
 ***/
export function normalizeHarnessSupportTier(value) {
	if (value === undefined || value === null || String(value).trim() === "") {
		return DEFAULT_HARNESS_SUPPORT_TIER;
	}
	const key = String(value).trim();
	if (TIER_INFO.has(key)) return key;
	throw new Error(
		`Unknown harness support tier "${value}" — expected 1, 2, 3, 4, or "unsupported"`,
	);
}

/***
 * MARK: harnessSupportTierInfo
 * @description Resolves any tier reference to its `{ level, label, summary }`
 *   projection, normalizing (and defaulting) first so callers never receive
 *   an undefined label. If an invalid or unrecognised tier is provided, it
 *   safely falls back to the conservative Tier 4 default so projections never
 *   crash an operational environment.
 * @example harnessSupportTierInfo("3").label => "Tier 3"
 * @example harnessSupportTierInfo("invalid").label => "Tier 4"
 * @param {unknown} value - Declared tier, or blank for the default.
 * @returns {{level: string, label: string, summary: string}}
 ***/
export function harnessSupportTierInfo(value) {
	try {
		return TIER_INFO.get(normalizeHarnessSupportTier(value));
	} catch {
		return TIER_INFO.get(DEFAULT_HARNESS_SUPPORT_TIER);
	}
}
