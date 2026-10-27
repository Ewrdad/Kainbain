import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";
// Short lease so the R01 partition test can outlive a TTL without waiting
// out the 5-minute production default (same unit, same lazy expiry).
process.env.KAINBAIN_CLAIM_TTL_MS = "1000";

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
 * MARK: Runner Routes Integration
 * @description Verifies the D4/R04 contract over HTTP: join-token gating,
 *   pending-by-default registration, operator approve/deny/revoke, the
 *   credential-scoped claim route (200 + lease or 409 + holder), and the
 *   R04 auth matrix — unauthenticated, wrong-scope, and revoked Runners
 *   rejected on every Runner endpoint.
 ***/
describe("Runner Routes Integration", () => {
	let project;
	let taskId;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Runner Claim Fixture",
				gitUrl: "https://git.example.com/team/fixture.git",
			},
		});
		expect(projRes.statusCode).toBe(201);
		project = JSON.parse(projRes.payload);
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Claimable fixture task" },
		});
		expect(taskRes.statusCode).toBe(200);
		taskId = JSON.parse(taskRes.payload).id;
	});

	async function onboard(runnerId) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const approval = await app.inject({
			method: "POST",
			url: `/runners/${runnerId}/approve`,
		});
		expect(approval.statusCode).toBe(200);
		return JSON.parse(approval.payload).credential;
	}

	it("rejects registration with a wrong join token", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "intruder", joinToken: "wrong", facts: FACTS },
		});
		expect(res.statusCode).toBe(403);
		expect(JSON.parse(res.payload).code).toBe("INVALID_JOIN_TOKEN");
	});

	it("lists pending Runners for the approval UI without credentials", async () => {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "awaiting-approval", joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const list = await app.inject({ method: "GET", url: "/runners" });
		const runners = JSON.parse(list.payload);
		const pending = runners.find((r) => r.runnerId === "awaiting-approval");
		expect(pending.status).toBe("pending");
		expect(pending.credential ?? null).toBeNull();
	});

	it("runs heartbeat then claim: 200 + lease, double claim 409 + holder", async () => {
		const credential = await onboard("claimer-1");
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "claimer-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(200);

		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(200);
		const lease = JSON.parse(claim.payload);
		expect(lease.epoch).toBe(1);
		expect(typeof lease.executionId).toBe("string");

		const credential2 = await onboard("claimer-2");
		const conflict = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential2 },
			payload: { projectId: project.id },
		});
		expect(conflict.statusCode).toBe(409);
		expect(JSON.parse(conflict.payload).holder).toMatchObject({
			runnerId: "claimer-1",
			epoch: 1,
		});
	});

	it("renews a live hold via claim-heartbeat: 200, still fenced past TTL", async () => {
		const credential = await onboard("heartbeat-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Heartbeat renewal target" },
		});
		expect(taskRes.statusCode).toBe(200);
		const target = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(200);
		const lease = JSON.parse(claim.payload);
		// Renew midway through the 1000ms test TTL, then prove the hold
		// outlives its original expiry (a second Runner still conflicts).
		await new Promise((r) => setTimeout(r, 600));
		const beat = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim-heartbeat`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId: lease.executionId,
				epoch: lease.epoch,
			},
		});
		expect(beat.statusCode).toBe(200);
		expect(JSON.parse(beat.payload)).toMatchObject({ epoch: lease.epoch });
		await new Promise((r) => setTimeout(r, 700));
		const credential2 = await onboard("heartbeat-2");
		const conflict = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential2 },
			payload: { projectId: project.id },
		});
		expect(conflict.statusCode).toBe(409);
	});

	it("rejects claim-heartbeat for a superseded execution", async () => {
		const credential = await onboard("heartbeat-stale");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Heartbeat stale target" },
		});
		const target = JSON.parse(taskRes.payload).id;
		const beat = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim-heartbeat`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id, executionId: "nope", epoch: 1 },
		});
		expect(beat.statusCode).toBe(409);
		expect(JSON.parse(beat.payload).code).toBe("STALE_EPOCH");
	});

	it("R04: rejects unauthenticated callers on every Runner endpoint", async () => {
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			payload: { runnerId: "claimer-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(401);

		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Unauthenticated claim target" },
		});
		const freshTask = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${freshTask}/claim`,
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(401);
		expect(JSON.parse(claim.payload).code).toBe("INVALID_CREDENTIAL");
	});

	it("R04: rejects a credential used for a different Runner id", async () => {
		const credential = await onboard("scoped-1");
		await onboard("scoped-2");
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id, runnerId: "scoped-2" },
		});
		expect(claim.statusCode).toBe(403);
		expect(JSON.parse(claim.payload).code).toBe("SCOPE_MISMATCH");
	});

	it("R04: rejects revoked Runners everywhere", async () => {
		const credential = await onboard("doomed-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Revoked claim target" },
		});
		const freshTask = JSON.parse(taskRes.payload).id;
		const revoke = await app.inject({
			method: "POST",
			url: "/runners/doomed-1/revoke",
		});
		expect(revoke.statusCode).toBe(200);
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "doomed-1", facts: FACTS },
		});
		expect(beat.statusCode).toBe(401);
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${freshTask}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(401);
	});

	it("progress and logs are idempotent; gaps are marked, never hidden", async () => {
		const credential = await onboard("reporter-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Reporting fixture" },
		});
		const target = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		const { executionId, epoch } = JSON.parse(claim.payload);

		const progress = { projectId: project.id, executionId, epoch, stageId: "Development", event: "started" };
		const p1 = await app.inject({
			method: "POST",
			url: `/tasks/${target}/progress`,
			headers: { "x-runner-credential": credential },
			payload: progress,
		});
		expect(JSON.parse(p1.payload)).toEqual({ recorded: true, duplicate: false });
		const p2 = await app.inject({
			method: "POST",
			url: `/tasks/${target}/progress`,
			headers: { "x-runner-credential": credential },
			payload: progress,
		});
		expect(JSON.parse(p2.payload)).toEqual({ recorded: true, duplicate: true });

		const logs = { projectId: project.id, executionId, epoch, bytes: "hi" };
		const l1 = await app.inject({
			method: "POST",
			url: `/tasks/${target}/logs`,
			headers: { "x-runner-credential": credential },
			payload: { ...logs, seq: 0 },
		});
		expect(JSON.parse(l1.payload)).toMatchObject({ accepted: true, duplicate: false });
		const lGap = await app.inject({
			method: "POST",
			url: `/tasks/${target}/logs`,
			headers: { "x-runner-credential": credential },
			payload: { ...logs, seq: 2, bytes: "after gap" },
		});
		expect(JSON.parse(lGap.payload)).toMatchObject({ accepted: true, duplicate: false });

		const monitor = JSON.parse(
			(await app.inject({ method: "GET", url: "/runners/monitor" })).payload,
		);
		expect(monitor.progressRecorded).toBeGreaterThanOrEqual(1);
		expect(monitor.progressDuplicates).toBeGreaterThanOrEqual(1);
		expect(monitor.logGaps).toBeGreaterThanOrEqual(1);
		expect(monitor.scheduler).toMatchObject({
			ticks: expect.any(Number),
			dispatched: expect.any(Number),
			deferredDispatch: expect.any(Number),
		});
	});

	it("R01 wire: partitioned Runner's late completion is stale, exactly one wins", async () => {
		const credA = await onboard("partition-a");
		const credB = await onboard("partition-b");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Partition fixture" },
		});
		const target = JSON.parse(taskRes.payload).id;

		// A claims then partitions (goes silent mid-stage; its credential
		// stays valid, which is exactly what makes the late completion
		// dangerous — and what the epoch fence must reject).
		const claimA = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credA },
			payload: { projectId: project.id },
		});
		const leaseA = JSON.parse(claimA.payload);

		// The partition outlives A's lease (lazy TTL expiry — no sweeper).
		await new Promise((r) => setTimeout(r, 1100));

		// A peer interrupts A's orphaned execution; the task parks as
		// interrupted, never failed/complete.
		const interrupt = await app.inject({
			method: "POST",
			url: `/tasks/${target}/interrupt`,
			headers: { "x-runner-credential": credB },
			payload: { projectId: project.id, executionId: leaseA.executionId },
		});
		expect(interrupt.statusCode).toBe(200);
		const parked = JSON.parse(
			(await app.inject({ method: "GET", url: `/tasks/${target}?projectId=${project.id}` })).payload,
		);
		expect(parked.status).toBe("interrupted");

		// B claims fresh (higher epoch) and completes.
		const claimB = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credB },
			payload: { projectId: project.id },
		});
		const leaseB = JSON.parse(claimB.payload);
		expect(leaseB.epoch).toBeGreaterThan(leaseA.epoch);
		const doneB = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credB },
			payload: { projectId: project.id, executionId: leaseB.executionId, epoch: leaseB.epoch },
		});
		expect(JSON.parse(doneB.payload)).toMatchObject({ accepted: true, duplicate: false });

		// A's late completion carries a valid credential but a superseded
		// epoch: stale by construction, rejected before any state changes.
		const doneA = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credA },
			payload: { projectId: project.id, executionId: leaseA.executionId, epoch: leaseA.epoch },
		});
		expect(doneA.statusCode).toBe(409);
		expect(JSON.parse(doneA.payload).code).toBe("STALE_EPOCH");

		const monitor = JSON.parse(
			(await app.inject({ method: "GET", url: "/runners/monitor" })).payload,
		);
		expect(monitor.completions).toBeGreaterThanOrEqual(1);
		expect(monitor.interrupts).toBeGreaterThanOrEqual(1);
	});

	it("failed outcome routes through the engine instead of advancing", async () => {
		const credential = await onboard("failing-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Failing fixture" },
		});
		const target = JSON.parse(taskRes.payload).id;
		const before = JSON.parse(
			(await app.inject({ method: "GET", url: `/tasks/${target}?projectId=${project.id}` })).payload,
		);
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		const { executionId, epoch } = JSON.parse(claim.payload);
		const done = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId,
				epoch,
				outcome: "failed",
				failureKind: "error",
				failureReason: "synthetic stage failure",
			},
		});
		expect(done.statusCode).toBe(200);
		expect(JSON.parse(done.payload).accepted).toBe(true);
		const after = JSON.parse(
			(await app.inject({ method: "GET", url: `/tasks/${target}?projectId=${project.id}` })).payload,
		);
		expect(after.currentStageId).toBe(before.currentStageId);
		const actions = after.history.map((h) => h.action).join("\n");
		expect(actions).toMatch(/completed execution/);
	});

	it("embedded execute refuses Runner-held tasks (no double dispatch)", async () => {
		const credential = await onboard("guard-exec-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Guarded execute fixture" },
		});
		const target = JSON.parse(taskRes.payload).id;
		await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		const exec = await app.inject({
			method: "POST",
			url: `/tasks/${target}/execute`,
			payload: { projectId: project.id },
		});
		expect(exec.statusCode).toBe(409);
		expect(JSON.parse(exec.payload).code).toBe("CLAIM_CONFLICT");
	});

	it("R04: unauthenticated callers rejected on progress/logs/complete/interrupt", async () => {
		const credential = await onboard("guarded-1");
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Guarded fixture" },
		});
		const target = JSON.parse(taskRes.payload).id;
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${target}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		const { executionId, epoch } = JSON.parse(claim.payload);
		for (const [url, payload] of [
			[`/tasks/${target}/progress`, { projectId: project.id, executionId, epoch, stageId: "s", event: "e" }],
			[`/tasks/${target}/logs`, { projectId: project.id, executionId, epoch, seq: 0, bytes: "x" }],
			[`/tasks/${target}/complete-execution`, { projectId: project.id, executionId, epoch }],
			[`/tasks/${target}/interrupt`, { projectId: project.id, executionId }],
		]) {
			const res = await app.inject({ method: "POST", url, payload });
			expect(res.statusCode).toBe(401);
		}
	});

	async function mockProject(name = "Dispatch Fixture") {
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
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: proj.id, goal: "Dispatchable fixture task" },
		});
		expect(taskRes.statusCode).toBe(200);
		return { project: proj, taskId: JSON.parse(taskRes.payload).id };
	}

	async function dispatchAs(credential, body = {}) {
		return app.inject({
			method: "POST",
			url: "/runners/dispatch",
			headers: { "x-runner-credential": credential },
			payload: body,
		});
	}

	it("dispatch assigns a matching task and fences it with a lease", async () => {
		const { project, taskId } = await mockProject("Dispatch Assign");
		const credential = await onboard("dispatch-1");
		await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "dispatch-1", facts: FACTS },
		});
		const res = await dispatchAs(credential);
		expect(res.statusCode).toBe(200);
		const out = JSON.parse(res.payload);
		expect(out.assigned).toBe(true);
		expect(out.projectId).toBe(project.id);
		expect(out.taskId).toBe(taskId);
		expect(typeof out.executionId).toBe("string");
		expect(out.requirements).toMatchObject({ harness: "mock", tier: "T1" });
		// Leased now: a second dispatch finds no work for this runner.
		const again = JSON.parse((await dispatchAs(credential)).payload);
		expect(again.assigned).toBe(false);
	});

	it("dispatch rejects stale runners loudly", async () => {
		const credential = await onboard("dispatch-stale");
		const res = await dispatchAs(credential);
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.payload).code).toBe("STALE_RUNNER");
	});

	it("dispatch enforces the tier ceiling with loud misses", async () => {
		await mockProject("Dispatch Ceiling");
		const credential = await onboard("dispatch-t0");
		await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: {
				runnerId: "dispatch-t0",
				facts: { ...FACTS, tiers: ["T0"] },
			},
		});
		const res = await dispatchAs(credential);
		const out = JSON.parse(res.payload);
		expect(out.assigned).toBe(false);
		expect(out.code).toBe("NO_CAPABLE_MATCH");
		expect(out.misses.TIER_CEILING).toBeGreaterThanOrEqual(1);
	});

	it("dispatch honors the Runner-enforced project allowlist", async () => {
		const { project } = await mockProject("Dispatch Allowlist");
		const credential = await onboard("dispatch-allow");
		await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "dispatch-allow", facts: FACTS },
		});
		const res = await dispatchAs(credential, { projectIds: ["no-such-project"] });
		expect(JSON.parse(res.payload)).toMatchObject({
			assigned: false,
			code: "NO_CLAIMABLE_TASKS",
		});
		const ok = await dispatchAs(credential, { projectIds: [project.id] });
		expect(JSON.parse(ok.payload).assigned).toBe(true);
	});

	it("dispatch requires Runner auth", async () => {
		const res = await app.inject({ method: "POST", url: "/runners/dispatch", payload: {} });
		expect(res.statusCode).toBe(401);
	});

	it("records the runner-enforced project scope for the settings UI", async () => {
		const { project } = await mockProject("Scope Fixture");
		const credential = await onboard("dispatch-scope");
		await heartbeatAs(credential, "dispatch-scope");
		await dispatchAs(credential, { projectIds: [project.id] });
		const list = JSON.parse((await app.inject({ method: "GET", url: "/runners" })).payload);
		const scoped = list.find((r) => r.runnerId === "dispatch-scope");
		expect(scoped.projectScope).toEqual([project.id]);

		const credential2 = await onboard("dispatch-scope-all");
		await heartbeatAs(credential2, "dispatch-scope-all");
		await dispatchAs(credential2);
		const list2 = JSON.parse((await app.inject({ method: "GET", url: "/runners" })).payload);
		expect(list2.find((r) => r.runnerId === "dispatch-scope-all").projectScope).toBeNull();
	});

	async function aliasProject(name, { targets, aliasName = "fast", withAliases = true }) {
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name,
				gitUrl: "https://git.example.com/team/fixture.git",
				harness: "mock",
				defaultModel: "mock-model",
				...(withAliases ? { modelAliases: [{ name: aliasName, targets }] } : {}),
				stages: [{ id: "s1", type: "agent", harness: "alias", model: aliasName }],
			},
		});
		expect(projRes.statusCode).toBe(201);
		const proj = JSON.parse(projRes.payload);
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: proj.id, goal: "Alias fixture task" },
		});
		expect(taskRes.statusCode).toBe(200);
		return { projectId: proj.id, taskId: JSON.parse(taskRes.payload).id };
	}

	async function heartbeatAs(credential, runnerId, facts = FACTS) {
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId, facts },
		});
		expect(beat.statusCode).toBe(200);
	}

	it("dispatch resolves alias stages to the concrete target with attribution", async () => {
		const { projectId, taskId } = await aliasProject("Dispatch Alias", {
			targets: [{ harness: "mock", model: "mock-model", percent: 100 }],
		});
		const credential = await onboard("dispatch-alias");
		await heartbeatAs(credential, "dispatch-alias");
		const out = JSON.parse(
			(await dispatchAs(credential, { projectIds: [projectId] })).payload,
		);
		expect(out.assigned).toBe(true);
		expect(out.taskId).toBe(taskId);
		expect(out.requirements).toMatchObject({
			harness: "mock",
			model: "mock-model",
			alias: { name: "fast", targetIndex: 0 },
		});
	});

	it("steers a live execution, pulls it on heartbeat, and acks exactly once", async () => {
		const { project, taskId } = await mockProject("Steer Fixture");
		const credential = await onboard("steer-1");
		await heartbeatAs(credential, "steer-1");
		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		const { executionId, epoch } = JSON.parse(claim.payload);

		const steer = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/steer`,
			payload: { projectId: project.id, guidance: "hold on, checking" },
		});
		expect(steer.statusCode).toBe(200);
		const steered = JSON.parse(steer.payload);
		expect(steered).toMatchObject({ executionId, accepted: true, via: "runner" });
		const { steerId } = steered;
		expect(typeof steerId).toBe("string");

		// The steer rides the next heartbeat for the owning Runner.
		const beat = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: "/runners/heartbeat",
					headers: { "x-runner-credential": credential },
					payload: { runnerId: "steer-1", facts: FACTS },
				})
			).payload,
		);
		expect(beat.pendingSteers).toHaveLength(1);
		expect(beat.pendingSteers[0]).toMatchObject({ steerId, executionId, text: "hold on, checking" });

		// Ack with the wrong epoch is stale; the right one lands once.
		const badAck = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/steer-ack`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id, executionId, epoch: epoch + 1, steerId, ok: true },
		});
		expect(badAck.statusCode).toBe(409);
		const ack = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/steer-ack`,
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id, executionId, epoch, steerId, ok: true, detail: "delivered" },
		});
		expect(JSON.parse(ack.payload)).toMatchObject({ steerId, ok: true });

		// Read-back: pending drained, receipt visible.
		const read = JSON.parse(
			(
				await app.inject({
					method: "GET",
					url: `/tasks/${taskId}/steers?projectId=${project.id}&executionId=${executionId}`,
				})
			).payload,
		);
		expect(read.pending).toHaveLength(0);
		expect(read.receipts).toHaveLength(1);
		expect(read.receipts[0]).toMatchObject({ steerId, ok: true });

		// Multi-Runner UI read: the live lease shows who runs what.
		const monitor = JSON.parse(
			(await app.inject({ method: "GET", url: "/runners/monitor" })).payload,
		);
		expect(monitor.liveAssignments).toContainEqual({
			runnerId: "steer-1",
			projectId: project.id,
			taskId,
			epoch,
		});
	});

	it("rotates a Runner credential with zero stage failures on idle", async () => {
		const credential = await onboard("rotate-1");
		await heartbeatAs(credential, "rotate-1");
		const rotated = await app.inject({
			method: "POST",
			url: "/runners/rotate-1/rotate",
		});
		expect(rotated.statusCode).toBe(200);
		const next = JSON.parse(rotated.payload);
		expect(typeof next.credential).toBe("string");
		expect(next.credential).not.toBe(credential);
		// Old credential 401s everywhere immediately.
		const stale = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId: "rotate-1", facts: FACTS },
		});
		expect(stale.statusCode).toBe(401);
		// New credential works first try — no re-approval round trip.
		const fresh = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": next.credential },
			payload: { runnerId: "rotate-1", facts: FACTS },
		});
		expect(fresh.statusCode).toBe(200);
		// Pending Runners have nothing to rotate (registered, never approved).
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId: "rotate-pending", joinToken: "test-join-token", facts: FACTS },
		});
		expect(reg.statusCode).toBe(202);
		const bad = await app.inject({ method: "POST", url: "/runners/rotate-pending/rotate" });
		expect(bad.statusCode).toBe(409);
		expect(JSON.parse(bad.payload).code).toBe("ROTATE_INVALID_STATE");
	});

	it("steer on an unheld task takes the embedded path, never the queue", async () => {
		const { project, taskId } = await mockProject("Steer Idle");
		const res = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/steer`,
			payload: { projectId: project.id, guidance: "hello?" },
		});
		// No live Runner lease: embedded steerTask answers with the task
		// (no steerId, no via-runner marker), nothing queued anywhere.
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).via).toBeUndefined();
		const read = JSON.parse(
			(
				await app.inject({
					method: "GET",
					url: `/tasks/${taskId}/steers?projectId=${project.id}&executionId=gone`,
				})
			).payload,
		);
		expect(read.pending).toHaveLength(0);
		expect(read.receipts).toHaveLength(0);
	});

	it("dispatch reports ALIAS_UNRESOLVED loudly for deleted aliases", async () => {
		const { projectId } = await aliasProject(
			"Dispatch Alias Gone",
			{ targets: [], withAliases: false },
		);
		const credential = await onboard("dispatch-alias-gone");
		await heartbeatAs(credential, "dispatch-alias-gone");
		const out = JSON.parse(
			(await dispatchAs(credential, { projectIds: [projectId] })).payload,
		);
		expect(out).toMatchObject({ assigned: false, code: "NO_CAPABLE_MATCH" });
		expect(out.misses.ALIAS_UNRESOLVED).toBeGreaterThanOrEqual(1);
	});

	it("claim on an unknown task is 404, approve on unknown Runner is 404", async () => {
		const credential = await onboard("notfound-1");
		const claim = await app.inject({
			method: "POST",
			url: "/tasks/does-not-exist/claim",
			headers: { "x-runner-credential": credential },
			payload: { projectId: project.id },
		});
		expect(claim.statusCode).toBe(404);
		const approval = await app.inject({
			method: "POST",
			url: "/runners/ghost-runner/approve",
		});
		expect(approval.statusCode).toBe(404);
	});
});
