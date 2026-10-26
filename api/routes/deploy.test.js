import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import deployRoutes from "./deploy.js";

/***
 * MARK: Deploy Routes Unit Tests
 * @description Verifies the self-deployment HTTP endpoints. The DeployManager is
 *   mocked so no real deploy is ever triggered.
 ***/
describe("Deploy Routes", () => {
	let app;
	let manager;

	beforeEach(async () => {
		manager = {
			getStatus: vi.fn(() => ({
				running: false,
				build: { buildNumber: 7, deployedAt: '2026-01-01', commit: 'abc1234' },
				lastResult: null,
				history: [],
			})),
			triggerDeploy: vi.fn(async ({ fast }) => ({ ok: true, pid: 99, fast })),
			triggerRollback: vi.fn(async () => ({ ok: true, pid: 100 })),
			readLog: vi.fn(() => "deploy log line"),
			readChangelog: vi.fn(() => null),
		};
		app = Fastify();
		await app.register(deployRoutes, { deps: { deployManager: manager } });
		await app.ready();
	});

	/***
	 * MARK: GET /deploy/status
	 * @description Returns the manager's status.
	 ***/
	it("GET /deploy/status returns deploy status", async () => {
		const res = await app.inject({ method: "GET", url: "/deploy/status" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({
			running: false,
			build: { buildNumber: 7, deployedAt: '2026-01-01', commit: 'abc1234' },
			lastResult: null,
			history: [],
		});
		expect(manager.getStatus).toHaveBeenCalled();
	});

	/***
	 * MARK: POST /deploy
	 * @description Triggers a full deploy by default.
	 ***/
	it("POST /deploy triggers a full deploy", async () => {
		const res = await app.inject({ method: "POST", url: "/deploy" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ ok: true, pid: 99, fast: false });
		expect(manager.triggerDeploy).toHaveBeenCalledWith({ fast: false });
	});

	/***
	 * MARK: POST /deploy fast
	 * @description Triggers a fast deploy when requested.
	 ***/
	it("POST /deploy with fast:true triggers a fast deploy", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/deploy",
			payload: { fast: true },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).fast).toBe(true);
		expect(manager.triggerDeploy).toHaveBeenCalledWith({ fast: true });
	});

	/***
	 * MARK: POST /deploy 409
	 * @description Returns 409 when a deploy is already running.
	 ***/
	it("POST /deploy returns 409 when a deploy is already running", async () => {
		manager.triggerDeploy.mockResolvedValue({
			ok: false,
			error: "A deployment is already in progress",
		});
		const res = await app.inject({ method: "POST", url: "/deploy" });
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.payload).error).toContain("already in progress");
	});

	/***
	 * MARK: POST /deploy/rollback
	 * @description Triggers a rollback.
	 ***/
	it("POST /deploy/rollback triggers a rollback", async () => {
		const res = await app.inject({ method: "POST", url: "/deploy/rollback" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ ok: true, pid: 100 });
		expect(manager.triggerRollback).toHaveBeenCalled();
	});

	/***
	 * MARK: GET /deploy/log
	 * @description Returns the deploy log tail.
	 ***/
	it("GET /deploy/log returns the log tail", async () => {
		const res = await app.inject({ method: "GET", url: "/deploy/log?maxLines=50" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).log).toBe("deploy log line");
		expect(manager.readLog).toHaveBeenCalledWith(50);
	});

	/***
	 * MARK: GET /deploy/changelog fixtures
	 * @description Baked-artifact fixture shared by the changelog route tests.
	 ***/
	const bakedArtifact = () => ({
		generatedAt: "2026-09-30T08:00:00Z",
		branch: "master",
		commit: "abc1234",
		totalCount: 537,
		truncated: true,
		limit: 200,
		entries: [
			{ sha: "aaa", shortSha: "aaa", subject: "Newest", body: "", bodyTruncated: false, author: "A", authorEmail: "a@e.c", date: "2026-09-30" },
			{ sha: "bbb", shortSha: "bbb", subject: "Middle", body: "Details", bodyTruncated: false, author: "B", authorEmail: "b@e.c", date: "2026-09-29" },
			{ sha: "ccc", shortSha: "ccc", subject: "Oldest", body: "", bodyTruncated: false, author: "C", authorEmail: "c@e.c", date: "2026-09-28" },
		],
	});

	/***
	 * MARK: GET /deploy/changelog list
	 * @description Returns baked entries newest-first with metadata.
	 ***/
	it("GET /deploy/changelog returns baked entries newest-first", async () => {
		manager.readChangelog.mockReturnValue(bakedArtifact());
		const res = await app.inject({ method: "GET", url: "/deploy/changelog" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.reason).toBeNull();
		expect(payload.changelog.branch).toBe("master");
		expect(payload.changelog.totalCount).toBe(537);
		expect(payload.changelog.entries.map((e) => e.subject)).toEqual([
			"Newest",
			"Middle",
			"Oldest",
		]);
	});

	/***
	 * MARK: GET /deploy/changelog limit clamp
	 * @description ?limit= clamps to [1, baked entries]; invalid values default.
	 ***/
	it.each([
		["/deploy/changelog?limit=2", 2],
		["/deploy/changelog?limit=999", 3],
		["/deploy/changelog?limit=0", 3],
		["/deploy/changelog?limit=-5", 3],
		["/deploy/changelog?limit=bogus", 3],
		["/deploy/changelog", 3],
	])("GET %s returns %i entries", async (url, count) => {
		manager.readChangelog.mockReturnValue(bakedArtifact());
		const res = await app.inject({ method: "GET", url });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).changelog.entries).toHaveLength(count);
	});

	/***
	 * MARK: GET /deploy/changelog null artifact
	 * @description Unbaked/missing changelog returns reason not-baked, never fake data.
	 ***/
	it("GET /deploy/changelog returns not-baked when no changelog was baked", async () => {
		manager.readChangelog.mockReturnValue(null);
		const res = await app.inject({ method: "GET", url: "/deploy/changelog" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ changelog: null, reason: "not-baked" });
	});

	/***
	 * MARK: GET /deploy/changelog wrong shape
	 * @description A baked object without entries is reported as not-baked.
	 ***/
	it("GET /deploy/changelog returns not-baked for a wrong-shaped artifact", async () => {
		manager.readChangelog.mockReturnValue({ branch: "master" });
		const res = await app.inject({ method: "GET", url: "/deploy/changelog" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ changelog: null, reason: "not-baked" });
	});

	/***
	 * MARK: GET /deploy/changelog generation-failed
	 * @description The deploy-time failure marker surfaces distinctly with detail.
	 ***/
	it("GET /deploy/changelog returns generation-failed for the marker object", async () => {
		manager.readChangelog.mockReturnValue({ entries: [], error: "git log failed: boom" });
		const res = await app.inject({ method: "GET", url: "/deploy/changelog" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({
			changelog: null,
			reason: "generation-failed",
			detail: "git log failed: boom",
		});
	});
});
