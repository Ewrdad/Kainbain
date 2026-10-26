import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. D8 caps are env-configured (ADR 0010) and read at
// app load, so they are set here before the app (and its ClaimStore
// wiring) loads. FLEET=2, PER_PROJECT=1 exercises both ceilings in one flow.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token-caps";
process.env.KAINBAIN_RUNNER_MAX_CONCURRENT_PER_PROJECT = "1";
process.env.KAINBAIN_RUNNER_MAX_CONCURRENT_FLEET = "2";

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
 * MARK: Dispatch D8 Caps Integration
 * @description Verifies ADR 0010 burn control at `POST /runners/dispatch`:
 *   a project at its concurrency cap is skipped loudly (`PROJECT_BUSY`)
 *   while other projects still dispatch, and a fleet at its cap answers
 *   429 so daemons back off instead of burning.
 ***/
describe("Dispatch D8 Caps Integration", () => {
	let projA;
	let projB;
	let taskAheld;
	let taskB;

	beforeAll(async () => {
		await app.ready();
		for (const [name, slot, taskCount] of [
			["Caps A", "A", 2],
			["Caps B", "B", 1],
		]) {
			const projRes = await app.inject({
				method: "POST",
				url: "/projects",
				payload: {
					name,
					gitUrl: "https://git.example.com/team/fixture.git",
					harness: "mock",
					defaultModel: "mock-model",
				},
			});
			expect(projRes.statusCode).toBe(201);
			const proj = JSON.parse(projRes.payload);
			for (let i = 0; i < taskCount; i += 1) {
				const taskRes = await app.inject({
					method: "POST",
					url: "/tasks",
					payload: { projectId: proj.id, goal: `Caps fixture ${slot}-${i}` },
				});
				expect(taskRes.statusCode).toBe(200);
				if (slot === "A" && i === 0) {
					projA = proj;
					taskAheld = JSON.parse(taskRes.payload).id;
				}
				if (slot === "B") {
					projB = proj;
					taskB = JSON.parse(taskRes.payload).id;
				}
			}
		}
	});

	async function onboard(runnerId) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token-caps", facts: FACTS },
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

	it("skips capped projects loudly, then 429s at the fleet cap", async () => {
		const credential = await onboard("caps-1");
		// One live hold on project A (direct claim carries the project).
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskAheld}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: projA.id },
		});
		expect(claim.statusCode).toBe(200);

		// Scoped to the capped project: no assignment, loud PROJECT_BUSY.
		const busy = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: "/runners/dispatch",
					headers: { "x-runner-credential": credential },
					payload: { projectIds: [projA.id] },
				})
			).payload,
		);
		expect(busy).toMatchObject({ assigned: false, code: "NO_CAPABLE_MATCH" });
		expect(busy.misses.PROJECT_BUSY).toBeGreaterThanOrEqual(1);

		// Unscoped: project A skipped, project B still dispatches.
		const assigned = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: "/runners/dispatch",
					headers: { "x-runner-credential": credential },
					payload: {},
				})
			).payload,
		);
		expect(assigned.assigned).toBe(true);
		expect(assigned.taskId).toBe(taskB);

		// Fleet now holds 2/2: the next poll backs off with 429.
		const capped = await app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: {},
		});
		expect(capped.statusCode).toBe(429);
		expect(JSON.parse(capped.payload).code).toBe("FLEET_CONCURRENCY_EXHAUSTED");
	});
});
