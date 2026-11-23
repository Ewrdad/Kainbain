import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
	BACKEND_API_VERSION,
	belowMinimumRunnerVersion,
	buildBelowMinimumRefusal,
	coerceRunnerVersion,
	DESIRED_VERSION_LATEST,
	fleetKnownVersions,
	isPinnedDesiredVersion,
	loadBackendApiVersion,
	normalizeDesiredVersion,
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

	it("never coerces a commit sha into a phantom version", () => {
		// semver.coerce would mangle these into bogus versions (8044.0.0);
		// a bare 7+ hex run is a hash, not a product version.
		assert.equal(coerceRunnerVersion("f8044e37"), null);
		assert.equal(coerceRunnerVersion("fbcf8442ee031e2edbc9f0b30195afa410296cf3"), null);
		assert.equal(coerceRunnerVersion("28aac94"), null);
		// Version-tagged builds keep their dotted core.
		assert.equal(coerceRunnerVersion("1.0.0-28aac94"), "1.0.0");
		assert.equal(coerceRunnerVersion("0.1.0"), "0.1.0");
		// Sha-like input is permissive everywhere, never a fleet lockout.
		assert.equal(runnerVersionAtLeast("f8044e37", "9.9.9"), true);
		assert.equal(belowMinimumRunnerVersion("f8044e37", "9.9.9"), false);
		assert.equal(updateAvailableForRunner("f8044e37", "9.9.9"), false);
		assert.equal(normalizeDesiredVersion("f8044e37"), DESIRED_VERSION_LATEST);
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

	it("normalizes the per-runner version setting to latest-or-canonical", () => {
		assert.equal(normalizeDesiredVersion(null), "latest");
		assert.equal(normalizeDesiredVersion(undefined), "latest");
		assert.equal(normalizeDesiredVersion(""), "latest");
		assert.equal(normalizeDesiredVersion("latest"), "latest");
		assert.equal(normalizeDesiredVersion("Latest"), "latest");
		assert.equal(normalizeDesiredVersion("v1.2.3"), "1.2.3");
		assert.equal(normalizeDesiredVersion("1.2.3"), "1.2.3");
		assert.equal(normalizeDesiredVersion("not-a-version"), "latest");
		assert.equal(normalizeDesiredVersion({}), "latest");
		assert.equal(DESIRED_VERSION_LATEST, "latest");
	});

	it("treats only exact versions as pinned", () => {
		assert.equal(isPinnedDesiredVersion("1.2.3"), true);
		assert.equal(isPinnedDesiredVersion("latest"), false);
		assert.equal(isPinnedDesiredVersion(null), false);
		assert.equal(isPinnedDesiredVersion(undefined), false);
		assert.equal(isPinnedDesiredVersion("bogus"), false);
	});

	it("never auto-nudges pinned runners, only latest-tracked trailers", () => {
		const base = {
			facts: { versions: { runner: "0.1.0" }, commands: ["requestModelRediscovery", "requestUpdate"] },
			pendingCommands: [],
			commandResults: {},
			recommendedVersion: "0.2.0",
		};
		assert.equal(shouldAutoRequestUpdate(base), true);
		assert.equal(shouldAutoRequestUpdate({ ...base, desiredVersion: "latest" }), true);
		assert.equal(shouldAutoRequestUpdate({ ...base, desiredVersion: null }), true);
		assert.equal(shouldAutoRequestUpdate({ ...base, desiredVersion: "0.2.0" }), false);
		assert.equal(shouldAutoRequestUpdate({ ...base, desiredVersion: "0.1.0" }), false);
	});

	it("lists fleet-known versions newest-first for the version dropdown", () => {
		const runners = [
			{ facts: { versions: { runner: "0.1.0" } } },
			{ facts: { versions: { runner: "0.3.0" } } },
			{ facts: { versions: { runner: "0.3.0" } } },
			{ facts: { versions: {} } },
			{},
		];
		assert.deepEqual(
			fleetKnownVersions({ runners, recommendedVersion: "0.2.0", minimumVersion: "0.1.0" }),
			["0.3.0", "0.2.0", "0.1.0"],
		);
		assert.deepEqual(fleetKnownVersions({ runners: [] }), []);
		assert.deepEqual(fleetKnownVersions({}), []);
	});

	it("keeps sha-like runner reports out of the fleet version list", () => {
		const runners = [
			{ facts: { versions: { runner: "0.1.0" } } },
			{ facts: { versions: { runner: "f8044e37" } } },
			{ runnerVersion: "fbcf8442ee031e2edbc9f0b30195afa410296cf3" },
		];
		assert.deepEqual(
			fleetKnownVersions({ runners, recommendedVersion: "0.2.0" }),
			["0.2.0", "0.1.0"],
		);
	});
});
