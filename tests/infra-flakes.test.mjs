/***
 * MARK: infra-flakes.test.mjs
 * @description Unit tests for the canary infra-flake signature classifier
 *   (`canary-e2e/tests/infra-flakes.mjs`, task 44125086) — the single source
 *   of truth shared by `helpers.js` and the runner-level quarantine lane.
 *   Positive fixtures are the EXACT error strings captured from the four
 *   2026-11-19 red-gate tails (task cf4b6847) and from a live Playwright 1.63
 *   dead-browser probe; negative fixtures pin that genuine app failures
 *   (dead backend, bad URL, assertion diffs, app-wait timeouts) NEVER
 *   classify as flakes, so they stay red (acceptance criterion 2). Also pins
 *   that helpers.js consumes the shared list (no inline regex drift) and that
 *   every signature id has a baseline entry.
 * @example run `node --test tests/infra-flakes.test.mjs`
 ***/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	INFRA_FLAKE_ERROR_CODE,
	INFRA_FLAKE_SIGNATURES,
	infraFlakeTag,
	isInfraFlake,
	markInfraFlakeError,
	matchInfraFlake,
} from "../canary-e2e/tests/infra-flakes.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("matchInfraFlake — positive fixtures (exact captured strings)", () => {
	const positives = [
		// The 2026-11-19 case-study signature, bare and with its report stack.
		["page.goto: Target page, context or browser has been closed", "browser-closed"],
		[
			"Error: page.goto: Target page, context or browser has been closed\n\n   at helpers.js:65:14\n        at waitForAppReady (…/canary-e2e/tests/helpers.js:65:14)",
			"browser-closed",
		],
		// Live Playwright 1.63 probe strings (browser/context/page death).
		["page.reload: Target page, context or browser has been closed", "browser-closed"],
		["browser.newContext: Target page, context or browser has been closed", "browser-closed"],
		// Sibling target-death families.
		["page.goto: Target closed", "target-closed"],
		["page.goto: Target crashed", "target-crashed"],
		["page.goto: Page crashed", "page-crashed"],
		["page.goto: net::ERR_INSUFFICIENT_RESOURCES", "insufficient-resources"],
		// A marked error's tag wins deterministically.
		["page.goto: Target closed\n[infra-flake:target-closed]", "target-closed"],
		// Unknown tag id falls through to the patterns.
		["boom\n[infra-flake:not-a-signature] Target closed", "target-closed"],
	];
	for (const [text, expected] of positives) {
		it(`classifies ${JSON.stringify(text.slice(0, 48))}… as ${expected}`, () => {
			assert.equal(matchInfraFlake(text), expected);
			assert.equal(isInfraFlake(text), true);
		});
	}
});

describe("matchInfraFlake — negative fixtures (genuine failures stay red)", () => {
	const negatives = [
		"page.goto: net::ERR_CONNECTION_REFUSED",
		"page.goto: net::ERR_NAME_NOT_RESOLVED",
		"page.goto: net::ERR_INVALID_URL",
		"page.goto: net::ERR_ABORTED",
		"page.goto: net::ERR_TIMED_OUT",
		"Timeout 60000ms exceeded waiting for expect(locator).toBeVisible()",
		'Test timeout of 60000ms exceeded while running "beforeEach" hook.',
		"Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 3\nReceived: 2",
		"expect(received).toHaveTitle(expected)\nExpected pattern: /Kainbain/\nReceived string: \"404\"",
		// Near-misses: contain 'closed' but not the browser-death signatures.
		"The page was closed gracefully by the application teardown",
		"Target was closed by a user gesture, not by a crash",
		"",
	];
	for (const text of negatives) {
		it(`does NOT classify ${JSON.stringify(text.slice(0, 48))}…`, () => {
			assert.equal(matchInfraFlake(text), null);
			assert.equal(isInfraFlake(text), false);
		});
	}
	it("handles null/undefined/non-string input", () => {
		assert.equal(matchInfraFlake(null), null);
		assert.equal(matchInfraFlake(undefined), null);
		assert.equal(matchInfraFlake(42), null);
	});
});

describe("markInfraFlakeError", () => {
	it("marks code/signature/tag while preserving the original message and cause", () => {
		const original = new Error("page.goto: Target page, context or browser has been closed");
		const marked = markInfraFlakeError(original, "browser-closed");
		assert.equal(marked.code, INFRA_FLAKE_ERROR_CODE);
		assert.equal(marked.code, "CANARY_INFRA_FLAKE");
		assert.equal(marked.signature, "browser-closed");
		assert.ok(marked.message.includes("Target page, context or browser has been closed"));
		assert.ok(marked.message.includes(infraFlakeTag("browser-closed")));
		assert.ok(marked.message.includes("[infra-flake:browser-closed]"));
		assert.equal(marked.cause, original);
		assert.ok(marked.stack.startsWith(marked.message));
		// The marked message still classifies via the raw signature.
		assert.equal(matchInfraFlake(marked.message), "browser-closed");
	});
	it("infraFlakeTag renders the deterministic tag", () => {
		assert.equal(infraFlakeTag("page-crashed"), "[infra-flake:page-crashed]");
	});
});

describe("helpers.js consumes the shared signature list (no drift)", () => {
	const helpersSource = fs.readFileSync(
		path.join(repoRoot, "canary-e2e", "tests", "helpers.js"),
		"utf8",
	);
	it("imports the classifier from ./infra-flakes.mjs", () => {
		assert.match(helpersSource, /import \{[^}]*\bisInfraFlake\b[^}]*\} from "\.\/infra-flakes\.mjs"/);
		assert.match(helpersSource, /import \{[^}]*\bmatchInfraFlake\b[^}]*\} from "\.\/infra-flakes\.mjs"/);
		assert.match(helpersSource, /import \{[^}]*\bmarkInfraFlakeError\b[^}]*\} from "\.\/infra-flakes\.mjs"/);
	});
	it("no longer carries the inline retry regex", () => {
		assert.ok(
			!/ERR_INSUFFICIENT_RESOURCES\|has been closed/.test(helpersSource),
			"the inline signature regex must be replaced by the shared infra-flakes.mjs list",
		);
	});
	it("marks a browser-closed retry failure instead of rethrowing raw", () => {
		assert.match(helpersSource, /markInfraFlakeError\(retryErr, signature\)/);
	});
	it("marks infra-flake errors on EVERY helper exit path, with a double-mark guard", () => {
		assert.match(
			helpersSource,
			/import \{[^}]*\bINFRA_FLAKE_ERROR_CODE\b[^}]*\} from "\.\/infra-flakes\.mjs"/,
		);
		assert.match(
			helpersSource,
			/if \(err\?\.code === INFRA_FLAKE_ERROR_CODE\) throw err;/,
			"already-marked errors must pass through without a second tag",
		);
		// The shell-wait phase skips its reload on browser death and lets the
		// outer catch mark it: the isInfraFlake guard appears in both the
		// first-load gate and the shell-wait skip.
		const guards = helpersSource.match(/isInfraFlake\(err\?\.message \|\| ""\)/g) || [];
		assert.ok(guards.length >= 2, `expected the flake guard in both phases, got ${guards.length}`);
	});
});

describe("baseline covers every signature id", () => {
	it("infra-flake-baseline.json has an entry per INFRA_FLAKE_SIGNATURES id (and no stale ids)", () => {
		const baseline = JSON.parse(
			fs.readFileSync(path.join(repoRoot, "canary-e2e", "infra-flake-baseline.json"), "utf8"),
		);
		const ids = INFRA_FLAKE_SIGNATURES.map((s) => s.id).sort();
		assert.deepEqual(Object.keys(baseline.signatures).sort(), ids);
		for (const id of ids) {
			assert.ok(baseline.signatures[id].firstSeen, `${id} needs firstSeen`);
			assert.ok(baseline.signatures[id].evidence, `${id} needs evidence`);
		}
	});
});
