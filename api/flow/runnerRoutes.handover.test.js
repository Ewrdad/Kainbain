import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The join token is set before the app (and its
// RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const FACTS = {
	harnesses: [{ id: "mock", version: "0.0.0" }],
	models: ["mock-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test", api: "1.0.0" },
};

describe("POST /runners/register credential handover", () => {
	it("collects the credential over HTTP with the join nonce, once", async () => {
		await app.ready();
		const join = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "local-pi",
				joinToken: "test-join-token",
				facts: FACTS,
				joinNonce: "boot-nonce-1",
			},
		});
		expect(join.statusCode).toBe(202);
		expect(join.json().credential).toBeNull();

		const approved = await app.inject({
			method: "POST",
			url: "/runners/local-pi/approve",
		});
		expect(approved.statusCode).toBe(200);
		const credential = approved.json().credential;
		expect(typeof credential).toBe("string");

		const collect = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "local-pi",
				joinToken: "test-join-token",
				facts: FACTS,
				joinNonce: "boot-nonce-1",
			},
		});
		expect(collect.statusCode).toBe(200);
		expect(collect.json().status).toBe("active");
		expect(collect.json().credential).toBe(credential);

		const replay = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "local-pi",
				joinToken: "test-join-token",
				facts: FACTS,
				joinNonce: "boot-nonce-1",
			},
		});
		expect(replay.json().credential).toBeNull();
	});

	it("withholds the credential from a poller with the wrong nonce", async () => {
		await app.ready();
		await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "impostor-target",
				joinToken: "test-join-token",
				facts: FACTS,
				joinNonce: "real-nonce",
			},
		});
		await app.inject({
			method: "POST",
			url: "/runners/impostor-target/approve",
		});
		const res = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "impostor-target",
				joinToken: "test-join-token",
				facts: FACTS,
				joinNonce: "wrong-nonce",
			},
		});
		expect(res.json().status).toBe("active");
		expect(res.json().credential).toBeNull();
	});
});
