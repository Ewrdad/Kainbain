import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
	belowMinimumRunnerVersion,
	coerceRunnerVersion,
	runnerVersionAtLeast,
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
});
