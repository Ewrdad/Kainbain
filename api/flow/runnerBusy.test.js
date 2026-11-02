import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. No fleet/project caps here (defaults disable them),
// so any 429 in this file can only be the per-Runner fence, never D8 burn
// control. Join token is set before the app (and its config) loads.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token-busy";

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
	versions: { protocol: "v1", runner: "test" },
};

/***
 * MARK: One Task Per Runner Fence Integration
 * @description Verifies the per-Runner mutual-exclusion fence: a Runner that
 *   holds a live lease is refused any second assignment loudly (`RUNNER_BUSY`
 *   on both the dispatch and direct-claim paths), while the refused task
 *   stays claimable so a free Runner (or the same Runner once free) picks
 *   it up — queue + reroute, never silent double-execution on a small box.
 ***/
describe("One Task Per Runner Fence Integration", () => {
	let proj;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Busy Fence",
				gitUrl: "https://git.example.com/team/fixture.git",
				harness: "mock",
				defaultModel: "mock-model",
			},
		});
		expect(projRes.statusCode).toBe(201);
		proj = JSON.parse(projRes.payload);
	});

	async function onboard(runnerId) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token-busy", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const approval = await app.inject({
			method: "POST",
			url: `/runners/${runnerId}/approve`,
		});
		expect(approval.statusCode).toBe(200);
		const credential = JSON.parse(approval.payload).credential;
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId, facts: FACTS },
		});
		expect(beat.statusCode).toBe(200);
		return credential;
	}

	async function freshTask(goal) {
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: proj.id, goal },
		});
		expect(taskRes.statusCode).toBe(200);
		return JSON.parse(taskRes.payload).id;
	}

	async function claimAs(credential, taskId) {
		return app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: proj.id },
		});
	}

	it("refuses dispatch for a Runner holding a live lease with 429 RUNNER_BUSY", async () => {
		const credential = await onboard("busy-dispatch-1");
		const held = await freshTask("Busy dispatch held task");
		const waiting = await freshTask("Busy dispatch waiting task");
		expect((await claimAs(credential, held)).statusCode).toBe(200);

		// The waiting task is claimable and matching — but this Runner is
		// busy, so the dispatch is refused loudly instead of handing it a
		// second lease.
		const busy = await app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: {},
		});
		expect(busy.statusCode).toBe(429);
		const body = JSON.parse(busy.payload);
		expect(body.code).toBe("RUNNER_BUSY");
		expect(body.holder).toMatchObject({ runnerId: "busy-dispatch-1", taskId: held });
		expect(waiting).toBeTruthy();
	});

	it("refuses a direct second claim with 409 RUNNER_BUSY", async () => {
		const credential = await onboard("busy-claim-1");
		const first = await freshTask("Busy direct-claim first task");
		const second = await freshTask("Busy direct-claim second task");
		expect((await claimAs(credential, first)).statusCode).toBe(200);

		const refused = await claimAs(credential, second);
		expect(refused.statusCode).toBe(409);
		const body = JSON.parse(refused.payload);
		expect(body.code).toBe("RUNNER_BUSY");
		expect(body.holder).toMatchObject({ runnerId: "busy-claim-1", taskId: first });
	});

	it("keeps the refused task claimable so a free Runner picks it up", async () => {
		const busyCred = await onboard("busy-reroute-1");
		const freeCred = await onboard("busy-reroute-2");
		const held = await freshTask("Busy reroute held task");
		const other = await freshTask("Busy reroute other task");
		expect((await claimAs(busyCred, held)).statusCode).toBe(200);

		// The busy Runner cannot take the second task, but the free Runner
		// can: the refusal never parks work on the busy Runner.
		expect((await claimAs(busyCred, other)).statusCode).toBe(409);
		expect((await claimAs(freeCred, other)).statusCode).toBe(200);
	});

	it("exposes one runnerLoad row per busy Runner in the monitor", async () => {
		const credential = await onboard("busy-monitor-1");
		const target = await freshTask("Busy monitor target");
		expect((await claimAs(credential, target)).statusCode).toBe(200);

		const monitor = JSON.parse(
			(await app.inject({ method: "GET", url: "/runners/monitor" })).payload,
		);
		expect(Array.isArray(monitor.runnerLoad)).toBe(true);
		const row = monitor.runnerLoad.find((r) => r.runnerId === "busy-monitor-1");
		expect(row).toMatchObject({
			runnerId: "busy-monitor-1",
			liveHoldCount: 1,
			currentTaskId: target,
		});
		expect(typeof row.currentExecutionId).toBe("string");
	});
});
