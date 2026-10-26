import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRunnerClient } from "./client.js";

function stubFetch(handler) {
	const calls = [];
	const fetchImpl = async (url, opts) => {
		calls.push({ url, opts });
		return handler(url, opts, calls);
	};
	return { fetchImpl, calls };
}

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status, data) => ({ ok: false, status, json: async () => data });

describe("createRunnerClient", () => {
	it("sends the credential header and parses success", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({ status: "active" }));
		const client = createRunnerClient({ backendUrl: "http://x:3100/", fetchImpl });
		client.setCredential("cred-1");
		const res = await client.heartbeat({ runnerId: "r1", facts: {} });
		assert.equal(res.status, "active");
		assert.equal(calls.length, 1);
		assert.equal(calls[0].opts.headers["x-runner-credential"], "cred-1");
		assert.equal(calls[0].url, "http://x:3100/runners/heartbeat");
	});

	it("throws the backend error shape with status and code", async () => {
		const { fetchImpl } = stubFetch(() => fail(409, { error: "Stale", code: "STALE_EPOCH" }));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await assert.rejects(
			client.claim({ taskId: "t1", projectId: "p1" }),
			(err) => err.statusCode === 409 && err.code === "STALE_EPOCH",
		);
	});

	it("omits empty optional claim fields", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({}));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await client.claim({ taskId: "t 1", projectId: "p1" });
		assert.equal(calls[0].url, "http://x:3100/tasks/t%201/claim");
		assert.deepEqual(JSON.parse(calls[0].opts.body), { projectId: "p1" });
	});
});
