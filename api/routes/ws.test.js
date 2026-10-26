import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect, beforeAll } from "vitest";
import app from "../index.js";
import { eventBridge } from "../eventBridge.js";

/**
 * MARK: WebSocket Event Bridge Integration
 * @description Verifies the /ws endpoint: a client receives the server
 *   CONNECTED ack on connect, and receives forwarded agent events (MSG_START,
 *   TOOL_END, AGENT_DONE) while subscribed to a project's session.
 */

// Connect via injectWS, attaching the message listener in onOpen (fires before
// the buffered CONNECTED ack is delivered to the client).
function connectWS(projectId) {
	const received = [];
	const promise = app.injectWS(
		`/ws?projectId=${projectId}`,
		{},
		{
			onOpen: (ws) => {
				ws.on("message", (d) => received.push(JSON.parse(d.toString())));
			},
		},
	);
	return promise.then((ws) => ({ ws, received }));
}

// Wait until received contains an item matching a predicate.
function waitFor(received, predicate, timeoutMs = 2000) {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		const tick = () => {
			const hit = received.find(predicate);
			if (hit) return resolve(hit);
			if (Date.now() - start > timeoutMs) return reject(new Error("Timed out waiting for message"));
			setTimeout(tick, 10);
		};
		tick();
	});
}

describe("WebSocket Event Bridge", () => {
	beforeAll(async () => {
		await app.ready();
	});

	async function activeProjectId() {
		const res = await app.inject({ method: "GET", url: "/projects" });
		const projects = JSON.parse(res.payload);
		if (projects.length > 0) return projects[0].id;
		const created = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "WS Test Project" },
		});
		return JSON.parse(created.payload).id;
	}

	it("sends a CONNECTED acknowledgement on connection", async () => {
		const projectId = await activeProjectId();
		const { ws, received } = await connectWS(projectId);
		const ack = await waitFor(received, (m) => m.type === "CONNECTED");
		expect(ack.projectId).toBe(projectId);
		ws.close();
	});

	it("forwards agent events to subscribed clients", async () => {
		const projectId = await activeProjectId();
		const { ws, received } = await connectWS(projectId);
		await waitFor(received, (m) => m.type === "CONNECTED");

		// Trigger agent events; the socket should receive the mapped UI actions.
		eventBridge.handleAgentEvent(projectId, "message_start", { id: "m-1" });
		eventBridge.handleAgentEvent(projectId, "tool_execution_end", { id: "t-1" });

		const start = await waitFor(received, (m) => m.type === "MSG_START");
		expect(start.sessionId).toBe(projectId);
		expect(start.payload.id).toBe("m-1");

		const end = await waitFor(received, (m) => m.type === "TOOL_END");
		expect(end.payload.id).toBe("t-1");
		ws.close();
	});

	it("forwards process streaming and stage transition events to subscribed clients", async () => {
		const projectId = await activeProjectId();
		const { ws, received } = await connectWS(projectId);
		await waitFor(received, (m) => m.type === "CONNECTED");

		// Trigger process and stage events
		eventBridge.emitProcessEvent(projectId, "stage:enter", {
			taskId: "task-100",
			stageName: "CI Verification",
		});
		eventBridge.emitProcessEvent(projectId, "process:stdout", {
			taskId: "task-100",
			chunk: "PASS 42 unit tests",
		});
		eventBridge.emitProcessEvent(projectId, "stage:checkpoint_wait", {
			taskId: "task-100",
			message: "Awaiting approval",
		});

		const stageEnter = await waitFor(received, (m) => m.type === "STAGE_ENTER");
		expect(stageEnter.payload.taskId).toBe("task-100");
		expect(stageEnter.payload.stageName).toBe("CI Verification");

		const stdout = await waitFor(received, (m) => m.type === "PROCESS_STDOUT");
		expect(stdout.payload.chunk).toBe("PASS 42 unit tests");

		const checkpoint = await waitFor(
			received,
			(m) => m.type === "STAGE_CHECKPOINT_WAIT",
		);
		expect(checkpoint.payload.message).toBe("Awaiting approval");

		ws.close();
	});

	it("stops forwarding after the client disconnects", async () => {
		const projectId = await activeProjectId();
		const { ws, received } = await connectWS(projectId);
		await waitFor(received, (m) => m.type === "CONNECTED");

		ws.close();
		await new Promise((r) => setTimeout(r, 50));
		eventBridge.handleAgentEvent(projectId, "agent_end", {});
		await new Promise((r) => setTimeout(r, 80));
		expect(received.some((m) => m.type === "AGENT_DONE")).toBe(false);
	});
});
