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

describe("GET /runners/bootstrap", () => {
	it("reports an empty fleet with an install-runner next action", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/runners/bootstrap" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.total).toBe(0);
		expect(body.hasFreshRunner).toBe(false);
		expect(body.nextAction).toBe("install-runner");
		expect(typeof body.nextActionDetail).toBe("string");
	});

	it("asks for approval once a runner registers pending", async () => {
		await app.ready();
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "local-pi", joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const res = await app.inject({ method: "GET", url: "/runners/bootstrap" });
		const body = res.json();
		expect(body.total).toBe(1);
		expect(body.pending).toBe(1);
		expect(body.nextAction).toBe("approve-runner");
	});

	it("leaves the existing GET /runners list shape untouched", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/runners" });
		expect(res.statusCode).toBe(200);
		expect(Array.isArray(res.json())).toBe(true);
	});
});
