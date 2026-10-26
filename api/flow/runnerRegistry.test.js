import { expect, test, describe, beforeEach } from "vitest";
import { RunnerRegistry, RUNNER_PROTOCOL } from "./runnerRegistry.js";

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

	test("refuses registration when no join token is configured", () => {
		const open = new RunnerRegistry();
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
		const custom = new RunnerRegistry({ joinToken: "x", staleAfterMs: 10_000 });
		expect(custom.isFresh({ lastSeenAt: seen }, 1_000_000 + 11_000)).toBe(false);
	});
});
