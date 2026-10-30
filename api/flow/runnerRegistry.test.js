import { expect, test, describe, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunnerRegistry, RUNNER_PROTOCOL } from "./runnerRegistry.js";

const tmpRunnerState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-test-")), "runners.json");

/***
 * MARK: RunnerRegistry Unit Tests
 * @description Verifies the D4 identity contract at store level: join token
 *   gating, pending-by-default registration, human approve/deny/revoke,
 *   per-Runner credential auth (401/403), scope mismatch, and the v1/N-1
 *   protocol handshake on register and heartbeat.
 ***/

const FACTS = {
	harnesses: [{ id: "pi", version: "1.2.3" }],
	models: ["test-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 4096,
	versions: { protocol: RUNNER_PROTOCOL, runner: "0.1.0" },
};

function registry() {
	let n = 0;
	return new RunnerRegistry({
		joinToken: "join-secret",
		newCredential: () => `cred-${(n += 1)}`,
		stateFile: tmpRunnerState(),
	});
}

function approved() {
	const runners = registry();
	runners.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
	const { credential } = runners.approve("r1");
	return { runners, credential };
}

describe("RunnerRegistry", () => {
	let runners;
	beforeEach(() => {
		runners = registry();
	});

	test("accepts in-range versions.api, rejects out-of-range naming both versions, accepts absent api", () => {
		const inRange = { ...FACTS, versions: { ...FACTS.versions, api: "1.0.0" } };
		expect(() => runners.register({ runnerId: "ok", joinToken: "join-secret", facts: inRange })).not.toThrow();
		try {
			runners.register({ runnerId: "bad", joinToken: "join-secret", facts: { ...FACTS, versions: { ...FACTS.versions, api: "9.0.0" } } });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("PROTOCOL_VERSION_UNSUPPORTED");
			expect(err.message).toContain("9.0.0");
			expect(err.message).toContain(">=1.0.0 <2.0.0");
		}
		expect(() => runners.register({ runnerId: "old", joinToken: "join-secret", facts: FACTS })).not.toThrow();
	});

	test("refuses registration when no join token is configured", () => {
		const open = new RunnerRegistry({ stateFile: tmpRunnerState() });
		try {
			open.register({ runnerId: "r1", joinToken: "x", facts: FACTS });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(403);
			expect(err.code).toBe("REGISTRATION_DISABLED");
		}
	});

	test("rejects a wrong join token without revealing the expected one", () => {
		try {
			runners.register({ runnerId: "r1", joinToken: "nope", facts: FACTS });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(403);
			expect(err.code).toBe("INVALID_JOIN_TOKEN");
		}
		expect(runners.list()).toHaveLength(0);
	});

	test("registers as pending with no credential, idempotently", () => {
		const first = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
		});
		expect(first.status).toBe("pending");
		expect(first.credential).toBeNull();
		const second = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
		});
		expect(second.status).toBe("pending");
		expect(runners.list()).toHaveLength(1);
	});

	test("rejects an outside-window protocol at registration", () => {
		try {
			runners.register({
				runnerId: "r1",
				joinToken: "join-secret",
				facts: { versions: { protocol: "v9" } },
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("PROTOCOL_VERSION_UNSUPPORTED");
		}
	});

	test("approve issues exactly one credential per Runner", () => {
		const { credential } = runners.approve(
			runners.register({
				runnerId: "r1",
				joinToken: "join-secret",
				facts: FACTS,
			}).runnerId,
		);
		expect(credential).toBe("cred-1");
		const again = runners.approve("r1");
		expect(again.status).toBe("active");
		expect(again.credential).toBeNull();
	});

	test("approve of an unknown Runner is 404", () => {
		try {
			runners.approve("ghost");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(404);
			expect(err.code).toBe("UNKNOWN_RUNNER");
		}
	});

	test("deny works on pending only; active Runners need revoke", () => {
		runners.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		expect(runners.deny("r1").status).toBe("denied");
		runners.register({ runnerId: "r2", joinToken: "join-secret", facts: FACTS });
		runners.approve("r2");
		try {
			runners.deny("r2");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("DENY_INVALID_STATE");
		}
	});

	test("heartbeat refreshes facts and rejects unknown credentials", () => {
		const { runners: reg, credential } = approved();
		const beat = reg.heartbeat({
			runnerId: "r1",
			credential,
			facts: { ...FACTS, diskHeadroomMb: 1024 },
		});
		expect(beat.status).toBe("active");
		expect(beat.facts.diskHeadroomMb).toBe(1024);
		expect(typeof beat.lastSeenAt).toBe("string");
		try {
			reg.heartbeat({ runnerId: "r1", credential: "bogus", facts: FACTS });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(401);
			expect(err.code).toBe("INVALID_CREDENTIAL");
		}
	});

	test("heartbeat counts one identity arriving from multiple origins", () => {
		const { runners: reg, credential } = approved();
		const first = reg.heartbeat({
			runnerId: "r1",
			credential,
			facts: FACTS,
			origin: "10.0.0.1",
		});
		expect(first.originConflicts).toBe(0);
		const same = reg.heartbeat({
			runnerId: "r1",
			credential,
			facts: FACTS,
			origin: "10.0.0.1",
		});
		expect(same.originConflicts).toBe(0);
		const moved = reg.heartbeat({
			runnerId: "r1",
			credential,
			facts: FACTS,
			origin: "10.0.0.2",
		});
		expect(moved.originConflicts).toBe(1);
		// The count is list-visible so the monitor/UI can alert on it.
		expect(reg.list()[0].originConflicts).toBe(1);
	});

	test("heartbeat rejects a credential used for another Runner", () => {
		const { runners: reg, credential } = approved();
		reg.register({ runnerId: "r2", joinToken: "join-secret", facts: FACTS });
		reg.approve("r2");
		try {
			reg.heartbeat({ runnerId: "r2", credential, facts: FACTS });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(403);
			expect(err.code).toBe("SCOPE_MISMATCH");
		}
	});

	test("heartbeat rejects protocol skew with an explicit signal", () => {
		const { runners: reg, credential } = approved();
		try {
			reg.heartbeat({
				runnerId: "r1",
				credential,
				facts: { versions: { protocol: "v9" } },
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("PROTOCOL_VERSION_UNSUPPORTED");
		}
	});

	test("revoke invalidates the credential immediately", () => {
		const { runners: reg, credential } = approved();
		expect(reg.revoke("r1").status).toBe("revoked");
		try {
			reg.heartbeat({ runnerId: "r1", credential, facts: FACTS });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(401);
			expect(err.code).toBe("INVALID_CREDENTIAL");
		}
		expect(reg.list()[0].status).toBe("revoked");
	});

	test("stores normalized capabilities on register and heartbeat", () => {
		const reg = registry();
		const first = reg.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		expect(first.capabilities.tiers).toEqual(["T0", "T1"]);
		expect(first.capabilities.harnesses).toEqual([{ id: "pi", version: "1.2.3" }]);
		expect(first.capabilities.runnable).toBe(true);
		const { credential } = reg.approve("r1");
		const beat = reg.heartbeat({
			runnerId: "r1",
			credential,
			facts: { ...FACTS, tiers: ["T2"] },
		});
		expect(beat.capabilities.tiers).toEqual(["T2"]);
	});

	test("rejects malformed capability advertisements with 400", () => {
		const reg = registry();
		try {
			reg.register({
				runnerId: "r1",
				joinToken: "join-secret",
				facts: { harnesses: "pi", tiers: ["T9"] },
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("CAPABILITIES_INVALID");
		}
		expect(reg.list()).toHaveLength(0);
	});

	test("isFresh expires heartbeats past staleAfterMs", () => {
		const reg = registry();
		expect(reg.isFresh({ lastSeenAt: null }, 1_000_000)).toBe(false);
		const seen = new Date(1_000_000).toISOString();
		expect(reg.isFresh({ lastSeenAt: seen }, 1_000_000 + 59_000)).toBe(true);
		expect(reg.isFresh({ lastSeenAt: seen }, 1_000_000 + 61_000)).toBe(false);
		const custom = new RunnerRegistry({
			joinToken: "x",
			staleAfterMs: 10_000,
			stateFile: tmpRunnerState(),
		});
		expect(custom.isFresh({ lastSeenAt: seen }, 1_000_000 + 11_000)).toBe(false);
	});

	test("persists approvals and credentials across restarts, never liveness", () => {
		const file = tmpRunnerState();
		const first = new RunnerRegistry({
			joinToken: "join-secret",
			newCredential: () => "cred-1",
			stateFile: file,
		});
		first.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		const { credential } = first.approve("r1");
		expect(credential).toBe("cred-1");
		// Second boot from the same file: identity + approval + credential
		// survive, liveness does not (secure default: re-heartbeat).
		const second = new RunnerRegistry({ joinToken: "join-secret", stateFile: file });
		const revived = second.runners.get("r1");
		expect(revived.status).toBe("active");
		expect(revived.credential).toBe("cred-1");
		expect(revived.lastSeenAt).toBeNull();
		expect(second.authenticate("cred-1").runnerId).toBe("r1");
	});

	test("rotate issues a fresh credential and kills the old one", () => {
		const { runners, credential } = approved();
		const rotated = runners.rotate("r1");
		expect(rotated.credential).not.toBe(credential);
		expect(rotated.credentialIssuedAt).toEqual(expect.any(String));
		expect(() => runners.authenticate(credential)).toThrowError(/Unknown or missing/);
		expect(runners.authenticate(rotated.credential).runnerId).toBe("r1");
		expect(() => runners.rotate("missing")).toThrowError(/Unknown Runner/);
	});

	test("pause parks an active Runner without touching its credential", () => {
		const { runners, credential } = approved();
		expect(runners.list()[0].paused).toBe(false);
		const parked = runners.pause("r1");
		expect(parked.status).toBe("active");
		expect(parked.paused).toBe(true);
		// Credential, heartbeat, and liveness keep working while parked.
		expect(runners.authenticate(credential).runnerId).toBe("r1");
		// Idempotent: pausing a paused Runner is a no-op success.
		expect(runners.pause("r1").paused).toBe(true);
	});

	test("resume clears the pause flag", () => {
		const { runners } = approved();
		runners.pause("r1");
		const back = runners.resume("r1");
		expect(back.paused).toBe(false);
		// Idempotent: resuming an unpaused Runner is a no-op success.
		expect(runners.resume("r1").paused).toBe(false);
	});

	test("pause/resume require an active Runner", () => {
		runners.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		try {
			runners.pause("r1");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("PAUSE_INVALID_STATE");
		}
		try {
			runners.resume("r1");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("RESUME_INVALID_STATE");
		}
		try {
			runners.pause("ghost");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(404);
			expect(err.code).toBe("UNKNOWN_RUNNER");
		}
	});

	test("persists the pause flag across restarts", () => {
		const file = tmpRunnerState();
		const first = new RunnerRegistry({
			joinToken: "join-secret",
			newCredential: () => "cred-1",
			stateFile: file,
		});
		first.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		first.approve("r1");
		first.pause("r1");
		const second = new RunnerRegistry({ joinToken: "join-secret", stateFile: file });
		expect(second.list()[0].paused).toBe(true);
		expect(second.resume("r1").paused).toBe(false);
	});
});

describe("RunnerRegistry operator config", () => {
	test("registers with default operator config and exposes it in list", () => {
		const { runners } = approved();
		const [record] = runners.list();
		expect(record.operatorConfig).toEqual({
			displayName: null,
			availableTools: null,
			jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
			directories: { masterDir: "", worktreeDir: "" },
			projectScope: null,
		});
	});

	test("getConfig returns the public record with operatorConfig", () => {
		const { runners } = approved();
		const config = runners.getConfig("r1");
		expect(config.runnerId).toBe("r1");
		expect(config.operatorConfig.jobTypes.runsCi).toBe(true);
		expect(() => runners.getConfig("ghost")).toThrowError(/Unknown Runner/);
	});

	test("updateConfig persists directories and job toggles", () => {
		const { runners } = approved();
		const updated = runners.updateConfig("r1", {
			jobTypes: { runsCi: false, runsImpromptu: false },
			directories: { masterDir: "/srv/kainbain", worktreeDir: "/srv/kainbain-trees" },
		});
		expect(updated.operatorConfig.jobTypes).toEqual({
			runsCi: false,
			runsMerges: true,
			runsImpromptu: false,
		});
		expect(updated.operatorConfig.directories).toEqual({
			masterDir: "/srv/kainbain",
			worktreeDir: "/srv/kainbain-trees",
		});
		// Partial patches merge: untouched fields keep their values.
		const renamed = runners.updateConfig("r1", { displayName: "  Primary  " });
		expect(renamed.operatorConfig.displayName).toBe("Primary");
		expect(renamed.operatorConfig.jobTypes.runsCi).toBe(false);
	});

	test("updateConfig validates tool subset, directories, and unknown fields", () => {
		const { runners } = approved();
		// FACTS advertises only 'pi'.
		expect(
			runners.updateConfig("r1", { availableTools: ["pi"] }).operatorConfig.availableTools,
		).toEqual(["pi"]);
		// Tool ids trim like project ids so padded input matches exactly at match time.
		expect(
			runners.updateConfig("r1", { availableTools: ["  pi  "] }).operatorConfig.availableTools,
		).toEqual(["pi"]);
		expect(() => runners.updateConfig("r1", { availableTools: ["nope"] })).toThrowError(
			/does not advertise/,
		);
		try {
			runners.updateConfig("r1", { availableTools: ["nope"] });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("UNKNOWN_TOOL");
		}
		for (const bad of [
			{ directories: { masterDir: "   " } },
			{ directories: { bogus: "/x" } },
			{ jobTypes: { runsCi: "yes" } },
			{ jobTypes: { runsEverything: true } },
			{ projectScope: "p1" },
			{ displayName: "" },
			{ nope: true },
		]) {
			try {
				runners.updateConfig("r1", bad);
				expect.unreachable();
			} catch (err) {
				expect(err.statusCode).toBe(400);
			}
		}
	});

	test("pending Runners can be configured", () => {
		const runners = registry();
		runners.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		const updated = runners.updateConfig("r1", { displayName: "New joiner" });
		expect(updated.status).toBe("pending");
		expect(updated.operatorConfig.displayName).toBe("New joiner");
	});

	test("heartbeats never wipe operator choices", () => {
		const { runners, credential } = approved();
		runners.updateConfig("r1", {
			displayName: "Primary",
			jobTypes: { runsMerges: false },
			directories: { masterDir: "/srv/kb" },
		});
		runners.heartbeat({ runnerId: "r1", credential, facts: FACTS });
		const config = runners.getConfig("r1");
		expect(config.operatorConfig.displayName).toBe("Primary");
		expect(config.operatorConfig.jobTypes.runsMerges).toBe(false);
		expect(config.operatorConfig.directories.masterDir).toBe("/srv/kb");
	});

	test("persists operator config across restarts", () => {
		const file = tmpRunnerState();
		const first = new RunnerRegistry({
			joinToken: "join-secret",
			newCredential: () => "cred-1",
			stateFile: file,
		});
		first.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		first.approve("r1");
		first.updateConfig("r1", {
			displayName: "Primary",
			jobTypes: { runsCi: false },
			directories: { masterDir: "/srv/kb", worktreeDir: "/srv/kb-trees" },
			availableTools: ["pi"],
			projectScope: ["p1"],
		});
		const second = new RunnerRegistry({ joinToken: "join-secret", stateFile: file });
		expect(second.getConfig("r1").operatorConfig).toEqual({
			displayName: "Primary",
			availableTools: ["pi"],
			jobTypes: { runsCi: false, runsMerges: true, runsImpromptu: true },
			directories: { masterDir: "/srv/kb", worktreeDir: "/srv/kb-trees" },
			projectScope: ["p1"],
		});
	});
});
