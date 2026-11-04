import { expect, test, describe } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunnerRegistry, RUNNER_PROTOCOL } from "./runnerRegistry.js";

const tmpRunnerState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-test-")), "runners.json");

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

/***
 * MARK: RunnerRegistry credential-handover tests
 * @description One-click approval contract (D2): a Runner that polls
 *   register with the join nonce it presented at join time collects its
 *   credential by itself after human approval — exactly once. Any other
 *   poller (wrong/missing nonce) still gets `credential: null`, so the
 *   shared join token alone never impersonates an approved Runner.
 ***/
describe("RunnerRegistry credential handover", () => {
	test("hands the credential to the matching-nonce poller exactly once", () => {
		const runners = registry();
		const first = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(first.status).toBe("pending");
		expect(first.credential).toBeNull();

		const { credential } = runners.approve("r1");
		expect(credential).toBe("cred-1");

		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.status).toBe("active");
		expect(collect.credential).toBe("cred-1");

		const again = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(again.credential).toBeNull();
	});

	test("refuses the handover to a wrong or missing nonce", () => {
		const runners = registry();
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		runners.approve("r1");

		for (const joinNonce of [undefined, null, "", "nonce-2"]) {
			const res = runners.register({
				runnerId: "r1",
				joinToken: "join-secret",
				facts: FACTS,
				joinNonce,
			});
			expect(res.status).toBe("active");
			expect(res.credential).toBeNull();
		}
		// The legitimate poller can still collect afterwards.
		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.credential).toBe("cred-1");
	});

	test("adopts a nonce while no credential exists, never once issued", () => {
		const runners = registry();
		// Pre-feature record: joined with no nonce.
		runners.register({ runnerId: "r1", joinToken: "join-secret", facts: FACTS });
		// Still pending (no credential): the next poll adopts its nonce.
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "late-nonce",
		});
		runners.approve("r1");
		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "late-nonce",
		});
		expect(collect.credential).toBe("cred-1");
	});

	test("a fresh credential after rotate is collectible by the same nonce", () => {
		const runners = registry();
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		runners.approve("r1");
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		const { credential } = runners.rotate("r1");
		expect(credential).toBe("cred-2");
		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.credential).toBe("cred-2");
	});

	test("a re-issued credential after revoke+approve is collectible by the same boot nonce", () => {
		const runners = registry();
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		runners.approve("r1");
		runners.revoke("r1");
		// Re-approval issues a fresh credential; the nonce is immutable
		// once set, so the still-running boot collects the new one.
		const { credential } = runners.approve("r1");
		expect(credential).toBe("cred-2");
		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.credential).toBe("cred-2");
		// A restarted boot (different nonce) still gets nothing.
		const restarted = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-2",
		});
		expect(restarted.credential).toBeNull();
	});

	test("public payloads never expose the credential, nonce, or exposure flag", () => {
		const runners = registry();
		runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		runners.approve("r1");
		// The one-time handover response carries the credential; nothing else does.
		const collect = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.credential).toBe("cred-1");
		for (const key of ["joinNonce", "credentialExposed"]) {
			expect(collect).not.toHaveProperty(key);
		}
		for (const row of runners.list()) {
			expect(row).not.toHaveProperty("credential");
			expect(row).not.toHaveProperty("joinNonce");
			expect(row).not.toHaveProperty("credentialExposed");
		}
		// Repeated polls after the handover carry no credential either.
		const again = runners.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(again.credential).toBeNull();
		expect(again).not.toHaveProperty("joinNonce");
	});

	test("the handover flag survives a restart (no double issue)", () => {
		const stateFile = tmpRunnerState();
		let n = 0;
		const first = new RunnerRegistry({
			joinToken: "join-secret",
			newCredential: () => `cred-${(n += 1)}`,
			stateFile,
		});
		first.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		first.approve("r1");
		const collect = first.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(collect.credential).toBe("cred-1");

		const second = new RunnerRegistry({
			joinToken: "join-secret",
			newCredential: () => `cred-${(n += 1)}`,
			stateFile,
		});
		const again = second.register({
			runnerId: "r1",
			joinToken: "join-secret",
			facts: FACTS,
			joinNonce: "nonce-1",
		});
		expect(again.credential).toBeNull();
	});
});
