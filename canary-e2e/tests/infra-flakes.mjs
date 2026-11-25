/***
 * MARK: infra-flakes.mjs
 * @description Single source of truth for the canary suite's "known
 *   infrastructure flake" error signatures — error texts that mean the
 *   BROWSER/RENDERER died under gate-host load, never that the app is broken.
 *   Consumed by three places, all reading this one list:
 *   - `canary-e2e/tests/helpers.js` (`waitForAppReady`) — decides which first
 *     `page.goto` failures get the one bounded re-issue, and marks ANY
 *     browser-death error leaving the helper (the retry re-issue or the
 *     later shell-wait phase) via `markInfraFlakeError`, so every flake exit
 *     carries the `[infra-flake:<id>]` tag.
 *   - `scripts/lib/canary-quarantine.mjs` — classifies every failed test in the
 *     Playwright JSON report so the runner-level quarantine lane
 *     (`scripts/canary-with-quarantine.mjs`) can forgive signature-only
 *     failures visibly instead of red-ing the whole gate.
 *   - `canary-e2e/infra-flake-baseline.json` — the recorded baseline (firstSeen
 *     per signature); see "Adding an infra-flake signature" in
 *     `canary-e2e/README.md` before editing this list.
 *
 *   Patterns are deliberately narrow substrings/regexes: genuine app failures
 *   (dead backend `net::ERR_CONNECTION_REFUSED`, bad URL, a broken shell that
 *   fails twice, assertion diffs, app-wait timeouts) must NEVER match — the
 *   negative fixtures in `tests/infra-flakes.test.mjs` pin that.
 * @example import { isInfraFlake, matchInfraFlake, markInfraFlakeError } from "./infra-flakes.mjs";
 ***/

/***
 * MARK: INFRA_FLAKE_ERROR_CODE
 * @description `err.code` set on errors marked by `markInfraFlakeError`, so
 *   programmatic consumers never have to re-parse the message tag.
 * @example INFRA_FLAKE_ERROR_CODE => "CANARY_INFRA_FLAKE"
 ***/
export const INFRA_FLAKE_ERROR_CODE = "CANARY_INFRA_FLAKE";

/***
 * MARK: INFRA_FLAKE_TAG_PATTERN
 * @description Matches the `[infra-flake:<id>]` tag `markInfraFlakeError`
 *   appends to a marked error's message, capturing the signature id.
 * @example INFRA_FLAKE_TAG_PATTERN.exec("boom\n[infra-flake:browser-closed]") => ["[infra-flake:browser-closed]", "browser-closed"]
 ***/
export const INFRA_FLAKE_TAG_PATTERN = /\[infra-flake:([a-z0-9-]+)\]/;

/***
 * MARK: INFRA_FLAKE_SIGNATURES
 * @description The known infra-flake signature families, checked in order
 *   (first match wins). Seeded from the union of the task's four families and
 *   the pre-existing `helpers.js` retry regex:
 *   - `browser-closed` — "Target page, context or browser has been closed"
 *     (the exact signature of the four 2026-11-19 red gates, task
 *     cf4b6847-11eb-4d59-b39e-e31b31df1150, all thrown at the helpers.js
 *     retry line when the whole browser/context died under gate-host load).
 *   - `target-closed` / `target-crashed` / `page-crashed` — the sibling
 *     Playwright target-death messages.
 *   - `insufficient-resources` — `net::ERR_INSUFFICIENT_RESOURCES` (the
 *     browser ran out of resources during the vite module burst).
 *   To add one: append an entry here, add positive + near-miss negative
 *   fixtures in `tests/infra-flakes.test.mjs`, add the id to
 *   `canary-e2e/infra-flake-baseline.json`, run the unit gate — see
 *   canary-e2e/README.md "Adding an infra-flake signature".
 * @example INFRA_FLAKE_SIGNATURES.map((s) => s.id) => ["browser-closed", "target-closed", "target-crashed", "page-crashed", "insufficient-resources"]
 ***/
export const INFRA_FLAKE_SIGNATURES = [
	{
		id: "browser-closed",
		pattern: /has been closed/,
		description:
			"Target page, context or browser has been closed — the browser/context/page died under gate-host load (2026-11-19 case study, helpers.js:65).",
	},
	{
		id: "target-closed",
		pattern: /Target closed/,
		description: "Playwright target closed mid-operation.",
	},
	{
		id: "target-crashed",
		pattern: /Target crashed/,
		description: "Playwright target crashed mid-operation.",
	},
	{
		id: "page-crashed",
		pattern: /Page crashed/,
		description: "Renderer process crashed (page.goto: Page crashed).",
	},
	{
		id: "insufficient-resources",
		pattern: /ERR_INSUFFICIENT_RESOURCES/,
		description: "net::ERR_INSUFFICIENT_RESOURCES — browser out of resources during the module burst.",
	},
];

/***
 * MARK: infraFlakeTag
 * @description Renders the deterministic `[infra-flake:<id>]` tag appended to
 *   marked error messages, so log greps and the runner lane match without
 *   re-running the patterns.
 * @example infraFlakeTag("browser-closed") => "[infra-flake:browser-closed]"
 * @param {string} signatureId - A signature id from INFRA_FLAKE_SIGNATURES.
 * @returns {string} The tag string.
 ***/
export function infraFlakeTag(signatureId) {
	return `[infra-flake:${String(signatureId ?? "")}]`;
}

/***
 * MARK: matchInfraFlake
 * @description Classifies an error text against INFRA_FLAKE_SIGNATURES.
 *   A `[infra-flake:<id>]` tag (written by `markInfraFlakeError`) wins when it
 *   names a known signature; otherwise the patterns are checked in order.
 *   Returns the matched signature id, or null when the text is NOT a known
 *   infra flake (genuine app failures must classify as null so they stay red).
 * @example matchInfraFlake("page.goto: Target page, context or browser has been closed") => "browser-closed"
 * @example matchInfraFlake("net::ERR_CONNECTION_REFUSED") => null
 * @param {string} [message] - Error text (message, stack, or a mix).
 * @returns {string|null} Matched signature id, or null.
 ***/
export function matchInfraFlake(message) {
	const text = String(message ?? "");
	if (!text) return null;
	const tag = INFRA_FLAKE_TAG_PATTERN.exec(text);
	if (tag && INFRA_FLAKE_SIGNATURES.some((sig) => sig.id === tag[1])) return tag[1];
	for (const sig of INFRA_FLAKE_SIGNATURES) {
		if (sig.pattern.test(text)) return sig.id;
	}
	return null;
}

/***
 * MARK: isInfraFlake
 * @description Boolean form of `matchInfraFlake`: true when the error text
 *   matches a known infra-flake signature.
 * @example isInfraFlake("page.goto: Page crashed") => true
 * @example isInfraFlake("Timeout 60000ms exceeded") => false
 * @param {string} [message] - Error text.
 * @returns {boolean} True when the text is a known infra flake.
 ***/
export function isInfraFlake(message) {
	return matchInfraFlake(message) !== null;
}

/***
 * MARK: markInfraFlakeError
 * @description Wraps an error that already classified as an infra flake into a
 *   MARKED error: same message plus the `[infra-flake:<id>]` tag, `code` set
 *   to INFRA_FLAKE_ERROR_CODE, `signature` set to the id, and the original
 *   error kept as `cause`. The tag is what makes the failure greppable in the
 *   gate log and deterministically classifiable by the runner-level
 *   quarantine lane; the original text stays in the message so the raw
 *   signature still matches too. Never marks a non-flake error — callers only
 *   invoke this after `matchInfraFlake` hit.
 * @example const marked = markInfraFlakeError(new Error("page.goto: Target closed"), "target-closed"); marked.code === "CANARY_INFRA_FLAKE"
 * @param {Error} err - The original (already classified) error.
 * @param {string} signatureId - The matched signature id.
 * @returns {Error} The marked error (message carries the tag).
 ***/
export function markInfraFlakeError(err, signatureId) {
	const original = err?.message ?? String(err ?? "");
	const marked = new Error(`${original}\n${infraFlakeTag(signatureId)}`);
	marked.code = INFRA_FLAKE_ERROR_CODE;
	marked.signature = String(signatureId ?? "");
	if (err) marked.cause = err;
	if (typeof err?.stack === "string" && err.stack) {
		const frames = err.stack.split("\n").slice(1).join("\n");
		marked.stack = `${marked.message}${frames ? `\n${frames}` : ""}`;
	}
	return marked;
}
