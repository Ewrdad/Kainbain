// Global setup: start every suite run with a closed (un-tripped) breaker on
// the scratch stack. The scratch containment file persists across runs by
// design (fixed roots, see playwright.config.js), so a trip from an aborted
// or flaky run would otherwise 409 every /execute of all later runs and
// fail the engine-driven specs without any product change. A trip that
// happens DURING a run is still real signal and fails loudly.
//
// NOTE: scratch-port reclamation is NOT done here. Playwright provisions its
// `webServer` entries BEFORE `globalSetup` runs, so a drain in this file is
// too late to prevent the "port already used" failure — it lives at config
// load time in playwright.config.js instead (see `drainScratchPorts`).
const fs = require("node:fs");
const path = require("node:path");

async function globalSetup() {
	// Same run-tag derivation as playwright.config.js (base +
	// "engine/circuit.json"): the trip reset must land in THIS run's
	// containment file, never a sibling run's or prod's.
	const tag = /[A-Za-z0-9][A-Za-z0-9_.-]{0,63}/.test(
		String(process.env.KB_CANARY_RUN_TAG || ""),
	)
		? String(process.env.KB_CANARY_RUN_TAG)
		: "default";
	const file = path.join("/tmp", "kb-canary-e2e", tag, "engine", "circuit.json");
	try {
		fs.rmSync(file, { force: true });
	} catch {
		// Best effort: a missing file is already the desired state.
	}
	const dir = path.dirname(file);
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch {
		// Best effort: the engine creates what it needs.
	}
}

module.exports = globalSetup;
