// Domain: The Flow — engine containment route contract tests.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerTaskFlowRoutes } from "./taskFlowRoutes.js";
import { isTripped, loadCircuitState } from "./circuitBreaker.js";

function makeReply() {
	const reply = {
		statusCode: 200,
		payload: null,
		status: vi.fn((code) => {
			reply.statusCode = code;
			return reply;
		}),
		send: vi.fn((payload) => {
			reply.payload = payload;
			return payload;
		}),
	};
	return reply;
}

function setup() {
	const routes = new Map();
	const fakeApp = {
		post: (routePath, handler) => routes.set(`POST ${routePath}`, handler),
		get: (routePath, handler) => routes.set(`GET ${routePath}`, handler),
	};
	const taskStore = {
		engineState: { status: "idle", activeTaskId: null },
		schedulerStats: { deferredTripped: 2 },
		eventBridge: null,
		getEngineState: () => ({
			status: "idle",
			activeTaskId: null,
			circuit: null,
		}),
	};
	const projectStore = { getProject: () => null };
	registerTaskFlowRoutes(fakeApp, {
		resolveAndGuardProject: () => "proj-1",
		projectStore,
		taskStore,
		promptEngine: { curatePrompt: () => "" },
	});
	return { routes, fakeApp, taskStore };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /engine/trip", () => {
	it("400s when the reason is missing", async () => {
		const { routes } = setup();
		const handler = routes.get("POST /engine/trip");
		const reply = makeReply();
		await handler({ body: {} }, reply);
		expect(reply.statusCode).toBe(400);
		expect(reply.payload.error).toContain("reason");
	});

	it("trips with a reason and echoes the state", async () => {
		const { routes, taskStore } = setup();
		const handler = routes.get("POST /engine/trip");
		const reply = makeReply();
		const result = await handler(
			{ body: { reason: "host disk full", operator: "ops" } },
			reply,
		);
		expect(result.tripped).toBe(true);
		expect(result.circuit.reason).toBe("host disk full");
		expect(result.circuit.source).toBe("manual");
		expect(result.circuit.tripOperator).toBe("ops");
		expect(isTripped(taskStore)).toBe(true);
	});
});

describe("POST /engine/reset", () => {
	it("400s when the reason is missing", async () => {
		const { routes } = setup();
		const handler = routes.get("POST /engine/reset");
		const reply = makeReply();
		await handler({ body: {} }, reply);
		expect(reply.statusCode).toBe(400);
	});

	it("resets and records the operator reason", async () => {
		const { routes, taskStore } = setup();
		await routes.get("POST /engine/trip")(
			{ body: { reason: "disk full" } },
			makeReply(),
		);
		const result = await routes.get("POST /engine/reset")(
			{ body: { reason: "disk cleaned", operator: "ops" } },
			makeReply(),
		);
		expect(result.tripped).toBe(false);
		expect(result.circuit.resetReason).toBe("disk cleaned");
		expect(result.circuit.resetOperator).toBe("ops");
		expect(isTripped(taskStore)).toBe(false);
	});
});

describe("GET /engine/state", () => {
	it("reports containment plus scheduler stats", async () => {
		const { routes, taskStore } = setup();
		await routes.get("POST /engine/trip")(
			{ body: { reason: "outage" } },
			makeReply(),
		);
		const result = await routes.get("GET /engine/state")({}, makeReply());
		expect(result.circuit.tripped).toBe(true);
		expect(result.circuit.reason).toBe("outage");
		expect(result.schedulerStats.deferredTripped).toBe(2);
		expect(result.engine.status).toBe("idle");
		expect(isTripped(taskStore)).toBe(true);
	});

	it("survives a state reload", async () => {
		const { routes, taskStore } = setup();
		await routes.get("POST /engine/trip")(
			{ body: { reason: "outage" } },
			makeReply(),
		);
		const reloaded = { engineState: {}, schedulerStats: {}, eventBridge: null };
		loadCircuitState(reloaded);
		expect(isTripped(reloaded)).toBe(true);
		expect(isTripped(taskStore)).toBe(true);
	});
});
