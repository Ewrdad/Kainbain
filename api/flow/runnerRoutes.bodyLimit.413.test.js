import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { COMPLETE_EXECUTION_BODY_LIMIT_BYTES } from "../../shared/completionLimits.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
// runnerRoutes.js is imported dynamically AFTER that (never a static
// import): its module chain reads the join token at load time, and a
// hoisted static import would capture the unset value and 403 every
// registration below.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";

const { default: app } = await import("../index.js");
const { logOversizeCompletionAndRethrow } = await import("./runnerRoutes.js");

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
 * MARK: complete-execution body limit (10 MiB, task d164fb3f)
 * @description FLIPPED pin for the 413 completion-payload loop (task
 *   d164fb3f, RESPONSE.md S2): the runner `complete-execution` route
 *   accepts reports up to the shared 10 MiB limit (bodies over the old
 *   1 MiB default now land), while bodies over 10 MiB are still refused
 *   with 413 `FST_ERR_CTP_BODY_TOO_LARGE`, record nothing, and emit ONE
 *   structured warn line carrying task id + refused byte size. Companion
 *   unit tests pin the route error handler's extraction + rethrow
 *   contract directly.
 ***/
describe("complete-execution body limit (10 MiB)", () => {
	let project;

	beforeAll(async () => {
		await app.ready();
		const projRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "413 BodyLimit Fixture",
				gitUrl: "https://git.example.com/team/413-fixture.git",
			},
		});
		expect(projRes.statusCode).toBe(201);
		project = JSON.parse(projRes.payload);
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

	async function claimFresh(credential, goal) {
		const taskRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal },
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
		const { executionId, epoch } = JSON.parse(claim.payload);
		return { target, executionId, epoch };
	}

	async function completionsRecorded() {
		const monitor = await app.inject({ method: "GET", url: "/runners/monitor" });
		return JSON.parse(monitor.payload).completions;
	}

	it("accepts a complete-execution body just under 1 MiB (control)", async () => {
		const credential = await onboard("bodylimit-control-1");
		const { target, executionId, epoch } = await claimFresh(credential, "Control fixture");
		const before = await completionsRecorded();
		const done = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId,
				epoch,
				outcome: "passed",
				output: "x".repeat(1024 * 1024 - 20480),
			},
		});
		expect(done.statusCode).toBe(200);
		expect(JSON.parse(done.payload)).toMatchObject({ accepted: true });
		expect(await completionsRecorded()).toBe(before + 1);
	});

	it("accepts a ~2 MiB body that the old 1 MiB default refused", async () => {
		const credential = await onboard("bodylimit-raised-1");
		const { target, executionId, epoch } = await claimFresh(credential, "Raised-limit fixture");
		const before = await completionsRecorded();
		const done = await app.inject({
			method: "POST",
			url: `/tasks/${target}/complete-execution`,
			headers: { "x-runner-credential": credential },
			payload: {
				projectId: project.id,
				executionId,
				epoch,
				outcome: "passed",
				output: "z".repeat(2 * 1024 * 1024),
			},
		});
		expect(done.statusCode).toBe(200);
		expect(JSON.parse(done.payload)).toMatchObject({ accepted: true });
		expect(await completionsRecorded()).toBe(before + 1);
	});

	it("still refuses a >10 MiB body with 413, records nothing, and logs task id + size", async () => {
		const credential = await onboard("bodylimit-oversize-1");
		const { target, executionId, epoch } = await claimFresh(credential, "Oversize fixture");
		const before = await completionsRecorded();
		const payload = {
			projectId: project.id,
			executionId,
			epoch,
			outcome: "passed",
			output: "y".repeat(10 * 1024 * 1024 + 1024),
		};
		const expectedBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
		expect(expectedBytes).toBeGreaterThan(COMPLETE_EXECUTION_BODY_LIMIT_BYTES);
		// Request loggers are per-request pino children: wrapping
		// app.log.child around this one inject captures the route error
		// handler's warn line synchronously. Restored in `finally` so no
		// other test observes the wrapper.
		const warnings = [];
		const originalChild = app.log.child;
		app.log.child = (...args) => {
			const child = originalChild.call(app.log, ...args);
			const originalWarn = child.warn.bind(child);
			child.warn = (...warnArgs) => {
				warnings.push(warnArgs);
				return originalWarn(...warnArgs);
			};
			return child;
		};
		try {
			const done = await app.inject({
				method: "POST",
				url: `/tasks/${target}/complete-execution`,
				headers: { "x-runner-credential": credential },
				payload,
			});
			expect(done.statusCode).toBe(413);
			expect(JSON.parse(done.payload)).toMatchObject({
				code: "FST_ERR_CTP_BODY_TOO_LARGE",
			});
			// The handler never ran: no completion recorded.
			expect(await completionsRecorded()).toBe(before);
		} finally {
			app.log.child = originalChild;
		}
		const oversizeLines = warnings.filter((args) => args[0]?.route === "complete-execution");
		expect(oversizeLines.length).toBe(1);
		expect(oversizeLines[0][0]).toMatchObject({
			taskId: target,
			byteSize: expectedBytes,
			limit: COMPLETE_EXECUTION_BODY_LIMIT_BYTES,
		});
		expect(String(oversizeLines[0][1])).toMatch(/refused|over the limit/i);
	});
});

describe("logOversizeCompletionAndRethrow", () => {
	function oversizeError(extra = {}) {
		return Object.assign(new Error("Request body is too large"), {
			code: "FST_ERR_CTP_BODY_TOO_LARGE",
			statusCode: 413,
			...extra,
		});
	}

	function stubRequest(overrides = {}) {
		const warnings = [];
		return {
			warnings,
			request: {
				params: { id: "task-1" },
				headers: { "content-length": "12345" },
				url: "/tasks/task-1/complete-execution",
				log: { warn: (...args) => warnings.push(args) },
				...overrides,
			},
		};
	}

	it("logs task id + size, then rethrows the SAME error object", () => {
		const err = oversizeError();
		const { warnings, request } = stubRequest();
		expect(() => logOversizeCompletionAndRethrow(err, request)).toThrow(err);
		expect(warnings.length).toBe(1);
		expect(warnings[0][0]).toMatchObject({
			taskId: "task-1",
			byteSize: 12345,
			limit: COMPLETE_EXECUTION_BODY_LIMIT_BYTES,
			route: "complete-execution",
		});
	});

	it("treats a bare 413 status (no Fastify code) as oversize too", () => {
		const err = Object.assign(new Error("too large"), { statusCode: 413, code: null });
		const { warnings, request } = stubRequest();
		expect(() => logOversizeCompletionAndRethrow(err, request)).toThrow(err);
		expect(warnings.length).toBe(1);
		expect(warnings[0][0]).toMatchObject({ taskId: "task-1", byteSize: 12345 });
	});

	it("logs nothing for non-413 errors and still rethrows them unchanged", () => {
		const err = Object.assign(new Error("kaboom"), { statusCode: 500 });
		const { warnings, request } = stubRequest();
		expect(() => logOversizeCompletionAndRethrow(err, request)).toThrow(err);
		expect(warnings).toEqual([]);
	});

	it("falls back to the URL for the task id and null for a missing size", () => {
		const err = oversizeError();
		const { warnings, request } = stubRequest({ params: {}, headers: {} });
		expect(() => logOversizeCompletionAndRethrow(err, request)).toThrow(err);
		expect(warnings.length).toBe(1);
		expect(warnings[0][0]).toMatchObject({ taskId: "task-1", byteSize: null });
	});

	it("never throws its own error: a broken logger still propagates the refusal", () => {
		const err = oversizeError();
		const throwingLog = {
			warn: () => {
				throw new Error("logger down");
			},
		};
		const { request } = stubRequest({ log: throwingLog });
		expect(() => logOversizeCompletionAndRethrow(err, request)).toThrow(err);
		expect(() => logOversizeCompletionAndRethrow(err, null)).toThrow(err);
		expect(() => logOversizeCompletionAndRethrow(err, undefined)).toThrow(err);
	});
});
