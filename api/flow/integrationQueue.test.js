import { describe, it, expect } from "vitest";
import { IntegrationQueue } from "./integrationQueue.js";

const entry = (over = {}) => ({
	projectId: "p1",
	targetBranch: "main",
	taskId: "t1",
	taskBranch: "kb/t1",
	expectedTaskSha: "a".repeat(40),
	expectedTargetSha: "b".repeat(40),
	mergeAttemptId: "m1",
	...over,
});

describe("IntegrationQueue", () => {
	it("enqueues idempotently on mergeAttemptId", () => {
		const q = new IntegrationQueue();
		expect(q.enqueue(entry())).toMatchObject({ queued: true, position: 0 });
		expect(q.enqueue(entry())).toMatchObject({ queued: false, duplicate: true });
		expect(q.describe({ projectId: "p1", targetBranch: "main" }).depth).toBe(1);
	});

	it("leases FIFO and refuses a second lease while one is live", () => {
		const q = new IntegrationQueue();
		q.enqueue(entry());
		q.enqueue(entry({ taskId: "t2", taskBranch: "kb/t2", mergeAttemptId: "m2" }));
		const first = q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r1" });
		expect(first.leased).toBe(true);
		expect(first.entry.taskId).toBe("t1");
		expect(() =>
			q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r2" }),
		).toThrowError(expect.objectContaining({ code: "INTEGRATION_BUSY" }));
		expect(q.describe({ projectId: "p1", targetBranch: "main" }).depth).toBe(1);
	});

	it("reports leased:false on an empty queue", () => {
		const q = new IntegrationQueue();
		expect(q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r1" })).toEqual({
			leased: false,
		});
	});

	it("records landed reports and treats re-reports as no-ops", () => {
		const q = new IntegrationQueue();
		q.enqueue(entry());
		const { executionId, epoch } = q.acquire({
			projectId: "p1",
			targetBranch: "main",
			runnerId: "r1",
		});
		const done = q.report({
			projectId: "p1",
			targetBranch: "main",
			executionId,
			epoch,
			outcome: "landed",
			mergeSha: "c".repeat(40),
		});
		expect(done).toMatchObject({ accepted: true, duplicate: false, outcome: "landed" });
		expect(
			q.report({ projectId: "p1", targetBranch: "main", executionId, epoch, outcome: "landed" }),
		).toMatchObject({ accepted: true, duplicate: true });
		expect(q.describe({ projectId: "p1", targetBranch: "main" }).lease).toBeNull();
	});

	it("rejects reports for superseded executions", () => {
		const q = new IntegrationQueue();
		q.enqueue(entry());
		const { executionId, epoch } = q.acquire({
			projectId: "p1",
			targetBranch: "main",
			runnerId: "r1",
		});
		expect(() =>
			q.report({ projectId: "p1", targetBranch: "main", executionId, epoch: epoch + 1, outcome: "landed" }),
		).toThrowError(expect.objectContaining({ code: "STALE_EPOCH" }));
		expect(() =>
			q.report({ projectId: "p1", targetBranch: "main", executionId: "nope", epoch, outcome: "landed" }),
		).toThrowError(expect.objectContaining({ code: "STALE_EPOCH" }));
		expect(executionId).toBeTruthy();
	});

	it("requeues an expired lease at the head with a higher epoch", () => {
		let now = 1000;
		const q = new IntegrationQueue({ ttlMs: 1000, now: () => now });
		q.enqueue(entry());
		q.enqueue(entry({ taskId: "t2", taskBranch: "kb/t2", mergeAttemptId: "m2" }));
		const first = q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r1" });
		now += 2000;
		const second = q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r2" });
		expect(second.leased).toBe(true);
		expect(second.entry.taskId).toBe("t1");
		expect(second.epoch).toBeGreaterThan(first.epoch);
		// The zombie's late report is stale by construction.
		expect(() =>
			q.report({
				projectId: "p1",
				targetBranch: "main",
				executionId: first.executionId,
				epoch: first.epoch,
				outcome: "landed",
			}),
		).toThrowError(expect.objectContaining({ code: "STALE_EPOCH" }));
		expect(q.snapshot()).toMatchObject({ expired: 1, staleRejected: 1 });
	});

	it("isolates scopes per project and target branch", () => {
		const q = new IntegrationQueue();
		q.enqueue(entry());
		const other = q.acquire({ projectId: "p1", targetBranch: "dev", runnerId: "r1" });
		expect(other.leased).toBe(false);
		expect(q.acquire({ projectId: "p1", targetBranch: "main", runnerId: "r1" }).leased).toBe(true);
	});
});
