import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { taskStore } from "../taskStore.js";
import { clearAlertSinks, registerAlertSink } from "../observability/alerts.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots the stores against
// whichever roots the config snapshot holds.

const { default: app } = await import("../index.js");

afterAll(() => {
	clearAlertSinks();
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

let projectCounter = 0;

async function seedProject(name) {
	projectCounter += 1;
	const res = await app.inject({
		method: "POST",
		url: "/projects",
		payload: { name: `${name} ${projectCounter}`, gitUrl: "https://git.example.com/team/fixture.git" },
	});
	expect(res.statusCode).toBe(201);
	return JSON.parse(res.payload);
}

function pipelineWithHold(hold) {
	return [
		{ id: "build", name: "Build", type: "agent", paused: false, failback: "previous" },
		{ id: "review", name: "Review", type: "human", paused: false, failback: "previous", autoApproveAfterMs: hold },
		{ id: "done", name: "Done", type: "agent", paused: false, failback: "previous" },
	];
}

async function putStages(projectId, stages) {
	return app.inject({
		method: "PUT",
		url: `/projects/${projectId}/workflow`,
		payload: { stages },
	});
}

async function createTaskAt(projectId, stageId, goal) {
	const res = await app.inject({
		method: "POST",
		url: "/tasks",
		payload: { projectId, goal, stageId },
	});
	expect(res.statusCode).toBe(200);
	return JSON.parse(res.payload);
}

async function getTask(projectId, taskId) {
	const res = await app.inject({
		method: "GET",
		url: `/tasks/${taskId}?projectId=${projectId}`,
	});
	expect(res.statusCode).toBe(200);
	return JSON.parse(res.payload);
}

const flushAlerts = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
};

/***
 * MARK: human-stage auto-approve API tests
 * @description End-to-end coverage through HTTP plus the real singleton
 *   stores: stage-save validation, deadline stamping on entry, sweeper
 *   auto-advance with attribution, early-manual-wins, and the reminder.
 *   Time travels via the sweeper's injected clock — no real waiting.
 ***/
describe("human-stage auto-approve API", () => {
	beforeAll(async () => {
		await app.ready();
		clearAlertSinks();
	});

	it("round-trips autoApproveAfterMs through PUT workflow (string coerced to ms)", async () => {
		const project = await seedProject("Hold Round Trip");
		const putRes = await putStages(project.id, pipelineWithHold("10 days"));
		expect(putRes.statusCode).toBe(200);
		const saved = JSON.parse(putRes.payload).stages;
		expect(saved.find((s) => s.id === "review").autoApproveAfterMs).toBe(864000000);

		const getRes = await app.inject({ method: "GET", url: `/projects/${project.id}/workflow` });
		expect(getRes.statusCode).toBe(200);
		expect(JSON.parse(getRes.payload).stages.find((s) => s.id === "review").autoApproveAfterMs).toBe(
			864000000,
		);
	});

	it("refuses invalid holds at the stage-save boundary (400, never silently off)", async () => {
		const project = await seedProject("Hold Validation");
		for (const [label, hold] of [
			["garbage", "ten days"],
			["unknown unit", "10 lightyears"],
			["too short", "30s"],
			["too long", "400 days"],
			["negative", -5],
		]) {
			const res = await putStages(project.id, pipelineWithHold(hold));
			expect([label, res.statusCode]).toEqual([label, 400]);
			expect(JSON.parse(res.payload).details[0].problem).toMatch(/UNPARSEABLE|TOO_SHORT|TOO_LONG/);
		}
		// Off-values still save cleanly.
		for (const off of [0, ""]) {
			const stages = pipelineWithHold("10 days").map((s) =>
				s.id === "review" ? { ...s, autoApproveAfterMs: off } : s,
			);
			const res = await putStages(project.id, stages);
			expect(res.statusCode).toBe(200);
		}
	});

	it("refuses invalid holds on project create and workflow create", async () => {
		const bad = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Bad Hold Project",
				gitUrl: "https://git.example.com/team/fixture.git",
				stages: pipelineWithHold("soon"),
			},
		});
		expect(bad.statusCode).toBe(400);

		const project = await seedProject("Hold Workflow Validation");
		const wf = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/workflows`,
			payload: { name: "Bad Hold Flow", stages: pipelineWithHold("30s") },
		});
		expect(wf.statusCode).toBe(400);
	});

	it("refuses invalid holds sent as stages on PATCH project (no save-boundary bypass)", async () => {
		const project = await seedProject("Hold Patch Guard");
		for (const [label, hold, problem] of [
			["garbage", "soon", "UNPARSEABLE"],
			["too short", "30s", "TOO_SHORT"],
		]) {
			const res = await app.inject({
				method: "PATCH",
				url: `/projects/${project.id}`,
				payload: { stages: pipelineWithHold(hold) },
			});
			expect([label, res.statusCode]).toEqual([label, 400]);
			expect(JSON.parse(res.payload).details[0].problem).toBe(problem);
		}
		// The paired Runner-policy guard rides along on the same path.
		const policyRes = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: {
				stages: [
					{ id: "build", name: "Build", type: "agent", runnerPolicy: { mode: "sometimes", runners: [] } },
				],
			},
		});
		expect(policyRes.statusCode).toBe(400);
		// Valid stages still pass through untouched.
		const ok = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { stages: pipelineWithHold(61000) },
		});
		expect(ok.statusCode).toBe(200);
	});

	it("stamps a pipeline-flip park from the flip moment, not the stale entry time", async () => {
		const project = await seedProject("Hold Flip Stamp");
		// The task sits in_stage at an agent stage with an old entry clock…
		const agentPipeline = [
			{ id: "build", name: "Build", type: "agent", paused: false, failback: "previous" },
			{ id: "done", name: "Done", type: "agent", paused: false, failback: "previous" },
		];
		expect((await putStages(project.id, agentPipeline)).statusCode).toBe(200);
		const created = await createTaskAt(project.id, "build", "Flip me");
		expect(created.status).toBe("in_stage");
		taskStore.getTask(project.id, created.id).enteredStageAt = new Date(
			Date.now() - 12 * 3600000,
		).toISOString();

		// …then a pipeline edit turns its stage into a human checkpoint.
		const before = Date.now();
		const flip = await putStages(project.id, [
			{ id: "build", name: "Build", type: "human", paused: false, failback: "previous", autoApproveAfterMs: 61000 },
			{ id: "done", name: "Done", type: "agent", paused: false, failback: "previous" },
		]);
		expect(flip.statusCode).toBe(200);

		const fetched = await getTask(project.id, created.id);
		expect(fetched.status).toBe("waiting_human");
		const deadlineMs = Date.parse(fetched.autoApproveAt);
		// Full 61s hold from the flip (generous 60s test tolerance); the old
		// stale base would land ~12h in the past instead.
		expect(deadlineMs - before).toBeGreaterThan(61000 - 60000);
		expect(deadlineMs - before).toBeLessThan(61000 + 60000);
	});

	it("stamps autoApproveAt on entry to a configured human stage", async () => {
		const project = await seedProject("Hold Entry Stamp");
		expect((await putStages(project.id, pipelineWithHold(61000))).statusCode).toBe(200);
		const created = await createTaskAt(project.id, "review", "Stamp me");
		expect(created.status).toBe("waiting_human");
		expect(typeof created.autoApproveAt).toBe("string");
		expect(Date.parse(created.autoApproveAt) - Date.parse(created.enteredStageAt)).toBe(61000);

		const fetched = await getTask(project.id, created.id);
		expect(fetched.autoApproveAt).toBe(created.autoApproveAt);
	});

	it("auto-advances past the deadline with full automatic attribution", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (p) => { sent.push(p); return { delivered: true }; } });
		try {
			const project = await seedProject("Hold Auto Fire");
			expect((await putStages(project.id, pipelineWithHold(61000))).statusCode).toBe(200);
			const created = await createTaskAt(project.id, "review", "Fire me");
			const enteredMs = Date.parse(created.enteredStageAt);

			// The sweep is global across the shared test store, so earlier
			// tests' waits may fire here too — assert on our task, not the count.
			const summary = taskStore.autoApproveSweep({
				now: enteredMs + 62000,
				batch: 10,
				configuredLeadMs: 0,
			});
			expect(summary.advanced).toBeGreaterThanOrEqual(1);
			await flushAlerts();

			const fetched = await getTask(project.id, created.id);
			expect(fetched.status).toBe("in_stage");
			expect(fetched.currentStageId).toBe("done");
			expect(fetched.autoApproveAt).toBeNull();
			const audit = fetched.history.find((h) => h.action.includes("Auto-approved after"));
			expect(audit).toBeDefined();
			expect(audit.action).toContain("(automatic)");
			expect(audit.action).toContain(`deadline ${created.autoApproveAt}`);

			const reportsRes = await app.inject({
				method: "GET",
				url: `/tasks/${created.id}/reports?projectId=${project.id}`,
			});
			expect(reportsRes.statusCode).toBe(200);
			const reports = JSON.parse(reportsRes.payload);
			const approval = reports.find((r) => (r.content || "").includes("# Human approval"));
			expect(approval.content).toContain("# Human approval (automatic): Review");
			expect(approval.content).toContain("auto-approve timer after 61 seconds");

			const fired = sent.filter(
				(p) => p.event === "task.auto_approve" && p.task?.id === created.id,
			);
			expect(fired).toHaveLength(1);
			expect(fired[0].severity).toBe("info");
		} finally {
			clearAlertSinks();
		}
	});

	it("early manual approve wins: the sweeper later does nothing", async () => {
		const project = await seedProject("Hold Manual Wins");
		expect((await putStages(project.id, pipelineWithHold(61000))).statusCode).toBe(200);
		const created = await createTaskAt(project.id, "review", "Approve me early");
		const enteredMs = Date.parse(created.enteredStageAt);

		const advanceRes = await app.inject({
			method: "POST",
			url: `/tasks/${created.id}/advance`,
			payload: { projectId: project.id },
		});
		expect(advanceRes.statusCode).toBe(200);

		const summary = taskStore.autoApproveSweep({
			now: enteredMs + 3600000,
			batch: 10,
			configuredLeadMs: 0,
		});
		expect(summary.advanced).toBe(0);

		const fetched = await getTask(project.id, created.id);
		expect(fetched.currentStageId).toBe("done");
		expect(fetched.history.some((h) => h.action.includes("Auto-approved"))).toBe(false);
	});

	it("early manual reject wins: the sweeper later does nothing", async () => {
		const project = await seedProject("Hold Reject Wins");
		expect((await putStages(project.id, pipelineWithHold(61000))).statusCode).toBe(200);
		const created = await createTaskAt(project.id, "review", "Reject me early");
		const enteredMs = Date.parse(created.enteredStageAt);

		const rejectRes = await app.inject({
			method: "POST",
			url: `/tasks/${created.id}/reject`,
			payload: { projectId: project.id, feedback: "Not yet" },
		});
		expect(rejectRes.statusCode).toBe(200);

		const summary = taskStore.autoApproveSweep({
			now: enteredMs + 3600000,
			batch: 10,
			configuredLeadMs: 0,
		});
		expect(summary.advanced).toBe(0);

		const fetched = await getTask(project.id, created.id);
		expect(fetched.autoApproveAt).toBeNull();
		expect(fetched.history.some((h) => h.action.includes("Auto-approved"))).toBe(false);
	});

	it("sends the pre-deadline reminder once and persists the marker", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (p) => { sent.push(p); return { delivered: true }; } });
		try {
			const project = await seedProject("Hold Reminder");
			expect((await putStages(project.id, pipelineWithHold("10 days"))).statusCode).toBe(200);
			const created = await createTaskAt(project.id, "review", "Remind me");
			const enteredMs = Date.parse(created.enteredStageAt);
			const deadlineMs = Date.parse(created.autoApproveAt);

			// 12h before the deadline with the 24h default lead: inside the window.
			const summary = taskStore.autoApproveSweep({
				now: deadlineMs - 12 * 3600000,
				batch: 10,
			});
			expect(summary).toMatchObject({ reminded: 1, advanced: 0 });
			await flushAlerts();

			const fetched = await getTask(project.id, created.id);
			expect(fetched.status).toBe("waiting_human");
			expect(typeof fetched.autoApproveRemindedAt).toBe("string");

			const reminders = sent.filter(
				(p) => p.event === "task.auto_approve_soon" && p.task?.id === created.id,
			);
			expect(reminders).toHaveLength(1);
			expect(reminders[0].error.message).toContain("silence approves automatically after 10 days");

			// Still waiting an hour later: no second reminder.
			const again = taskStore.autoApproveSweep({
				now: deadlineMs - 11 * 3600000,
				batch: 10,
			});
			await flushAlerts();
			expect(again.reminded).toBe(0);
			expect(
				sent.filter((p) => p.event === "task.auto_approve_soon" && p.task?.id === created.id),
			).toHaveLength(1);
			expect(enteredMs).toBeLessThan(deadlineMs);
		} finally {
			clearAlertSinks();
		}
	});
});
