import { describe, it, expect } from "vitest";
import { AcpClientConnection, ACP_TIMEOUT_CODE, ACP_CLOSED_CODE } from "./AcpClientConnection.js";

/**
 * MARK: AcpClientConnection tests
 * @description Protocol state-machine tests over an in-memory line pair (no
 *   child process): request/response matching, concurrent requests,
 *   notification fan-out, agent-initiated requests (permission gates), and
 *   timeout/close rejection semantics.
 */

/***
 * MARK: makeLoopbackPair
 * @description Two connections wired to each other in memory: client sends
 *   become agent receives and vice versa (async, like real stdio).
 ***/
function makeLoopbackPair({ agentHandler, clientOnNotification, clientOnRequest } = {}) {
	let client;
	let agent;
	const deliverToAgent = (line) => {
		queueMicrotask(() => {
			try {
				agent.handleLine(JSON.parse(line));
			} catch {
				// test harness: frames are well-formed
			}
		});
	};
	const deliverToClient = (line) => {
		queueMicrotask(() => {
			try {
				client.handleLine(JSON.parse(line));
			} catch {
				// test harness: frames are well-formed
			}
		});
	};
	client = new AcpClientConnection({
		sendLine: deliverToAgent,
		onNotification: clientOnNotification,
		onRequest: clientOnRequest,
	});
	agent = new AcpClientConnection({
		sendLine: deliverToClient,
		onRequest: agentHandler,
	});
	return { client, agent };
}

describe("AcpClientConnection protocol", () => {
	it("matches responses to concurrent requests by id", async () => {
		const { client } = makeLoopbackPair({
			agentHandler: async (method, params) => ({ echo: params, via: method }),
		});
		const [first, second] = await Promise.all([
			client.request("initialize", { protocolVersion: 1 }),
			client.request("session/new", { cwd: "/repo" }),
		]);
		expect(first).toEqual({ echo: { protocolVersion: 1 }, via: "initialize" });
		expect(second).toEqual({ echo: { cwd: "/repo" }, via: "session/new" });
		expect(client.pendingCount()).toBe(0);
	});

	it("rejects when the agent answers with an error arm", async () => {
		const { client } = makeLoopbackPair({
			agentHandler: async () => {
				throw Object.assign(new Error("Method not found: bogus/method"), { code: -32601 });
			},
		});
		await expect(client.request("bogus/method", {})).rejects.toThrow(/Method not found/);
	});

	it("fans agent notifications out to onNotification", async () => {
		const seen = [];
		const { client, agent } = makeLoopbackPair({
			clientOnNotification: (method, params) => seen.push({ method, params }),
		});
		agent.notify("session/update", { n: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(seen).toEqual([{ method: "session/update", params: { n: 1 } }]);
		expect(client.pendingCount()).toBe(0);
	});

	it("answers agent-initiated requests (permission gates) through onRequest", async () => {
		const { client, agent } = makeLoopbackPair({
			clientOnRequest: async (method, params) => {
				expect(method).toBe("requestPermission");
				expect(params.toolCall.toolCallId).toBe("tool-1");
				return { outcome: { outcome: "selected", optionId: "allow-once" } };
			},
		});
		const answer = await agent.request("requestPermission", {
			toolCall: { toolCallId: "tool-1" },
		});
		expect(answer).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
	});

	it("answers Method-not-found when no onRequest handler is wired", async () => {
		const { agent } = makeLoopbackPair();
		await expect(agent.request("requestPermission", {})).rejects.toThrow(
			/No handler for ACP method/,
		);
	});

	it("rejects a request that outlives its timeout", async () => {
		const { client } = makeLoopbackPair({
			agentHandler: async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return {};
			},
		});
		const failure = await client.request("session/prompt", {}, { timeoutMs: 10 }).catch((e) => e);
		expect(failure.code).toBe(ACP_TIMEOUT_CODE);
		expect(failure.message).toMatch(/timed out after 10ms/);
		expect(client.pendingCount()).toBe(0);
	});

	it("close() rejects every pending request and refuses new ones", async () => {
		const { client } = makeLoopbackPair({
			agentHandler: async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return {};
			},
		});
		const pending = client.request("session/prompt", {});
		const assertion = expect(pending).rejects.toMatchObject({ code: ACP_CLOSED_CODE });
		client.close("test teardown");
		await assertion;
		await expect(client.request("initialize", {})).rejects.toMatchObject({
			code: ACP_CLOSED_CODE,
		});
	});

	it("ignores malformed and foreign frames without dying", () => {
		const client = new AcpClientConnection({ sendLine: () => {} });
		expect(() => {
			client.handleLine(null);
			client.handleLine([1, 2]);
			client.handleLine("nope");
			client.handleLine({ jsonrpc: "2.0" });
			client.handleLine({ jsonrpc: "2.0", id: 999, result: { late: true } });
		}).not.toThrow();
		expect(client.pendingCount()).toBe(0);
	});

	it("requires a sendLine transport", () => {
		expect(() => new AcpClientConnection({})).toThrow(/sendLine/);
	});
});
