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

	it("forwards the execution outcome and output on complete", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({ accepted: true }));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await client.complete({
			taskId: "t1",
			projectId: "p1",
			executionId: "e1",
			epoch: 1,
			outcome: "passed",
			output: "did the thing",
			durationMs: 1500,
		});
		const body = JSON.parse(calls[0].opts.body);
		assert.equal(body.outcome, "passed");
		assert.equal(body.output, "did the thing");
		assert.equal(body.durationMs, 1500);
		assert.ok(!("sha" in body));
	});

	it("posts the dispatch poll with and without an allowlist", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({ assigned: false }));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await client.dispatchClaim({ projectIds: ["p1", "p2"] });
		assert.equal(calls[0].url, "http://x:3100/runners/dispatch");
		assert.deepEqual(JSON.parse(calls[0].opts.body), { projectIds: ["p1", "p2"] });
		await client.dispatchClaim({});
		assert.deepEqual(JSON.parse(calls[1].opts.body), {});
	});

	it("omits empty optional claim fields", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({}));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await client.claim({ taskId: "t 1", projectId: "p1" });
		assert.equal(calls[0].url, "http://x:3100/tasks/t%201/claim");
		assert.deepEqual(JSON.parse(calls[0].opts.body), { projectId: "p1" });
	});

	it("progress sends harness/model when real and omits model when null or blank (CI contract)", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({}));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		const base = { taskId: "t1", projectId: "p1", executionId: "e1", epoch: 1, stageId: "s1", event: "prompted" };
		// Agent stage with a real served model: both fields sent, trimmed.
		await client.progress({ ...base, prompt: "do it", harness: " pi ", model: " kimi-k3:cloud " });
		let body = JSON.parse(calls[0].opts.body);
		assert.equal(body.harness, "pi");
		assert.equal(body.model, "kimi-k3:cloud");
		assert.equal(body.prompt, "do it");
		// CI stage: model null must be OMITTED from the wire body entirely —
		// never sent as null/""/"default", or old UIs would render a fake model.
		await client.progress({ ...base, harness: "pi", model: null });
		body = JSON.parse(calls[1].opts.body);
		assert.equal(body.harness, "pi");
		assert.ok(!("model" in body));
		// Blank/whitespace model is also omitted; non-string model never crashes.
		await client.progress({ ...base, harness: "pi", model: "   " });
		assert.ok(!("model" in JSON.parse(calls[2].opts.body)));
		await client.progress({ ...base, harness: "pi", model: 42 });
		assert.ok(!("model" in JSON.parse(calls[3].opts.body)));
		// No harness and no model: both omitted (no serving entry backend-side).
		await client.progress({ ...base, event: "started" });
		body = JSON.parse(calls[4].opts.body);
		assert.ok(!("model" in body) && !("harness" in body) && !("prompt" in body));
		assert.equal(calls[4].url, "http://x:3100/tasks/t1/progress");
	});

	it("complete forwards posture verbatim, including model-less CI postures", async () => {
		const { fetchImpl, calls } = stubFetch(() => ok({ accepted: true }));
		const client = createRunnerClient({ backendUrl: "http://x:3100", fetchImpl });
		await client.complete({ taskId: "t1", projectId: "p1", executionId: "e1", epoch: 1, outcome: "passed", posture: "T0:pi" });
		assert.equal(JSON.parse(calls[0].opts.body).posture, "T0:pi");
		await client.complete({ taskId: "t1", projectId: "p1", executionId: "e1", epoch: 1, outcome: "passed", posture: "T0:pi:kimi-k3:cloud" });
		assert.equal(JSON.parse(calls[1].opts.body).posture, "T0:pi:kimi-k3:cloud");
	});
});
