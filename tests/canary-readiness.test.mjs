/***
 * MARK: canary-readiness.test.mjs
 * @description Pins the canary app-readiness budget: `waitForAppReady` must
 *   wait long enough for a loaded gate host (cold vite compile, a sibling
 *   suite on shared CPUs) yet stay within the suite's per-test timeout so a
 *   hung app still fails fast. A 15s budget reds the whole canary phase
 *   overnight on the 4-core homelab runners (see the 2026-11-03 canary
 *   outage: identical `helpers.js:34` Project-button timeouts across nine
 *   unrelated tasks, flapping pass/fail within a single run).
 * @example run `node --test tests/canary-readiness.test.mjs`
 ***/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const helpersPath = path.join(repoRoot, "canary-e2e", "tests", "helpers.js");
const helpersSource = fs.readFileSync(helpersPath, "utf8");

function readBudgetMs() {
	const match = helpersSource.match(/export const APP_READY_TIMEOUT_MS\s*=\s*(\d+);/);
	assert.ok(match, "helpers.js must export APP_READY_TIMEOUT_MS");
	return Number(match[1]);
}

test("readiness budget tolerates loaded gate hosts", () => {
	const budget = readBudgetMs();
	assert.ok(
		budget >= 30000,
		`APP_READY_TIMEOUT_MS must cover a loaded gate host (>= 30000, got ${budget})`,
	);
});

test("readiness budget fits the suite per-test timeout", () => {
	const budget = readBudgetMs();
	const configSource = fs.readFileSync(
		path.join(repoRoot, "canary-e2e", "playwright.config.js"),
		"utf8",
	);
	const configTimeout = Number(configSource.match(/^\s*timeout:\s*(\d+),/m)?.[1]);
	assert.ok(
		Number.isInteger(configTimeout) && configTimeout > 0,
		"playwright.config.js must declare a per-test timeout",
	);
	assert.ok(
		budget <= configTimeout,
		`APP_READY_TIMEOUT_MS (${budget}) must fit the per-test timeout (${configTimeout})`,
	);
});

test("waitForAppReady waits the full readiness budget", () => {
	assert.match(
		helpersSource,
		/toBeVisible\(\{\s*timeout:\s*APP_READY_TIMEOUT_MS,?\s*\}\)/,
		"waitForAppReady must pass APP_READY_TIMEOUT_MS to the Project-button wait",
	);
});
