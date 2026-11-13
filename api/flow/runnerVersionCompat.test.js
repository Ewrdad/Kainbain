import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
	BACKEND_API_VERSION,
	belowMinimumRunnerVersion,
	buildBelowMinimumRefusal,
	coerceRunnerVersion,
	loadBackendApiVersion,
	RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS,
	runnerVersionAtLeast,
	shouldAutoRequestUpdate,
	updateAvailableForRunner,
	updateInfoForRunner,
} from "./runnerVersionCompat.js";

describe("runnerVersionCompat", () => {
	it("compares product versions with semver ordering", () => {
		assert.equal(runnerVersionAtLeast("0.2.0", "0.1.0"), true);
		assert.equal(runnerVersionAtLeast("0.1.0", "0.1.0"), true);
		assert.equal(runnerVersionAtLeast("0.0.9", "0.1.0"), false);
		assert.equal(runnerVersionAtLeast("0.10.0", "0.9.0"), true);
	});

	it("is permissive for missing or malformed versions (no fleet lockout)", () => {
		assert.equal(runnerVersionAtLeast(null, "0.1.0"), true);
		assert.equal(runnerVersionAtLeast(undefined, "0.1.0"), true);
		assert.equal(runnerVersionAtLeast("", "0.1.0"), true);
		assert.equal(runnerVersionAtLeast("not-a-version", "0.1.0"), true);
		assert.equal(runnerVersionAtLeast("0.0.1", "bogus"), true);
		assert.equal(belowMinimumRunnerVersion(null, "9.9.9"), false);
		assert.equal(updateAvailableForRunner(null, "9.9.9"), false);
		assert.equal(updateAvailableForRunner("0.1.0", null), false);
	});

	it("flags below-minimum only for known versions under the floor", () => {
		assert.equal(belowMinimumRunnerVersion("0.0.9", "0.1.0"), true);
		assert.equal(belowMinimumRunnerVersion("0.1.0", "0.1.0"), false);
		assert.equal(belowMinimumRunnerVersion("0.2.0", "0.1.0"), false);
	});

	it("badges update-available below recommended, not at or above", () => {
		assert.equal(updateAvailableForRunner("0.1.0", "0.2.0"), true);
		assert.equal(updateAvailableForRunner("0.2.0", "0.2.0"), false);
		assert.equal(updateAvailableForRunner("0.3.0", "0.2.0"), false);
	});

	it("builds the fleet-matrix info record from heartbeat facts", () => {
		const info = updateInfoForRunner(
			{ versions: { runner: "0.1.0" }, updateStatus: { state: "failed", reason: "boom" } },
			{ minVersion: "0.1.0", recommendedVersion: "0.2.0" },
		);
		assert.equal(info.runnerVersion, "0.1.0");
		assert.equal(info.updateAvailable, true);
		assert.equal(info.belowMinimum, false);
		assert.equal(info.minimumVersion, "0.1.0");
		assert.equal(info.recommendedVersion, "0.2.0");
		assert.deepEqual(info.updateStatus, { state: "failed", reason: "boom" });
	});

	it("coerces v-prefixed versions", () => {
		assert.equal(coerceRunnerVersion("v1.2.3"), "1.2.3");
		assert.equal(runnerVersionAtLeast("v0.2.0", "0.1.0"), true);
	});

	it("builds one shared 409 refusal for every below-minimum runner", () => {
		const refused = buildBelowMinimumRefusal({
			runner: { runnerId: "r1", facts: { versions: { runner: "0.0.1" } } },
			minVersion: "0.1.0",
		});
		assert.equal(refused?.code, "RUNNER_VERSION_BELOW_MINIMUM");
		assert.equal(refused?.minimumVersion, "0.1.0");
		assert.equal(refused?.runnerVersion, "0.0.1");
		assert.match(refused?.error || "", /r1/);
	});

	it("refuses nothing at/above the floor or for unknown versions", () => {
		const atFloor = { runnerId: "r2", facts: { versions: { runner: "0.1.0" } } };
		assert.equal(buildBelowMinimumRefusal({ runner: atFloor, minVersion: "0.1.0" }), null);
		const noVersion = { runnerId: "r3", facts: {} };
		assert.equal(buildBelowMinimumRefusal({ runner: noVersion, minVersion: "9.9.9" }), null);
		assert.equal(buildBelowMinimumRefusal({ runner: null, minVersion: "0.1.0" }), null);
	});

	it("advertises the desired version and backend API version", () => {
		const info = updateInfoForRunner(
			{ versions: { runner: "0.1.0" } },
			{ minVersion: "0.1.0", recommendedVersion: "0.2.0", backendApiVersion: "1.0.0" },
		);
		assert.equal(info.desiredRunnerVersion, "0.2.0");
		assert.equal(info.backendApiVersion, "1.0.0");
		const silent = updateInfoForRunner({ versions: { runner: "0.1.0" } }, { minVersion: "0.1.0", recommendedVersion: "0.1.0" });
		assert.equal(silent.desiredRunnerVersion, "0.1.0");
		assert.equal(silent.backendApiVersion, null);
	});

	it("loads the backend API version from api/version.json", () => {
		assert.equal(loadBackendApiVersion(), "1.0.0");
		assert.equal(BACKEND_API_VERSION, "1.0.0");
		assert.equal(RUNNER_AUTO_UPDATE_COMMAND_COOLDOWN_MS, 24 * 60 * 60 * 1000);
	});

	it("nudges outdated command-capable runners, at most daily", () => {
		const base = {
			facts: { versions: { runner: "0.1.0" }, commands: ["requestModelRediscovery", "requestUpdate"] },
			pendingCommands: [],
			commandResults: {},
			recommendedVersion: "0.2.0",
		};
		assert.equal(shouldAutoRequestUpdate(base), true);
		// Current runners, old runners, queued runners, and recently
		// nudged runners are left alone.
		assert.equal(shouldAutoRequestUpdate({ ...base, facts: { versions: { runner: "0.2.0" }, commands: base.facts.commands } }), false);
		assert.equal(shouldAutoRequestUpdate({ ...base, facts: { versions: { runner: "0.1.0" } } }), false);
		assert.equal(shouldAutoRequestUpdate({ ...base, facts: { versions: {} }, recommendedVersion: "9.9.9" }), false);
		assert.equal(
			shouldAutoRequestUpdate({ ...base, pendingCommands: [{ command: "requestUpdate", requestedAt: new Date().toISOString() }] }),
			false,
		);
		assert.equal(
			shouldAutoRequestUpdate({ ...base, commandResults: { requestUpdate: { ok: true, detail: "done", at: new Date().toISOString() } } }),
			false,
		);
		assert.equal(
			shouldAutoRequestUpdate({
				...base,
				commandResults: { requestUpdate: { ok: false, detail: "failed", at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() } },
				now: Date.now(),
			}),
			true,
		);
	});
});
