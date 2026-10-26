import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AcpSessionRuntime } from "./AcpSessionRuntime.js";

/**
 * MARK: AcpSessionRuntime tests
 * @description Subprocess supervision against the mock ACP agent (no real
 *   install, no network): handshake + session establishment, prompt round
 *   trips, steer, crash/hang failure modes, and process-group cleanup (no
 *   orphan keeps running after abort/dispose).
 */

const MOCK_ACP_AGENT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"mock-acp-agent.mjs",
);

function makeRuntime({ mode, extraEnv = {}, ...overrides } = {}) {
	const notifications = [];
	const requests = [];
	const logs = [];
	const runtime = new AcpSessionRuntime({
		command: MOCK_ACP_AGENT,
		args: [],
		cwd: "/tmp",
		env: {
			PATH: process.env.PATH,
			AGY_ACP_MOCK_MODE: mode || "success",
			...extraEnv,
		},
		log: (message) => logs.push(message),
		onNotification: (method, params) => notifications.push({ method, params }),
		onRequest: async (method) => {
			requests.push(method);
			return { outcome: { outcome: "selected", optionId: "allow-once" } };
		},
		...overrides,
	});
	return { runtime, notifications, requests, logs };
}

const liveRuntimes = [];
afterEach(async () => {
	while (liveRuntimes.length > 0) {
		const runtime = liveRuntimes.pop();
		try {
			await runtime.dispose();
		} catch {
			// best-effort cleanup
		}
	}
});

describe("AcpSessionRuntime lifecycle (mock ACP agent)", () => {
	it("handshakes (protocol version 1) and opens a session", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		const desc = await runtime.start();
		expect(desc.protocolVersion).toBe(1);
		expect(desc.sessionId).toBe("mock-acp-session-1");
		expect(desc.agentCapabilities).toMatchObject({ prompt: true });
		expect(typeof desc.pid).toBe("number");
	});

	it("runs a prompt round trip with mid-turn permission interception", async () => {
		const { runtime, notifications, requests } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		const response = await runtime.prompt([{ type: "text", text: "Say hello" }]);
		expect(response).toEqual({ stopReason: "end_turn" });
		// The turn streamed chunk + tool notifications while prompt stayed open.
		const updates = notifications
			.filter((n) => n.method === "session/update")
			.map((n) => n.params.update.sessionUpdate);
		expect(updates).toContain("agent_message_chunk");
		expect(updates).toContain("tool_call");
		// The mock gated on permission mid-turn and the runtime answered.
		expect(requests).toContain("requestPermission");
	});

	it("steers the active session", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		await expect(runtime.steer("go faster")).resolves.toEqual({ status: "steered" });
	});

	it("exposes the session/new result (modes + config options) after start", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		expect(runtime.sessionResult).toMatchObject({
			sessionId: "mock-acp-session-1",
			modes: {
				currentModeId: "default",
				availableModes: [{ id: "default" }, { id: "hands-off" }],
			},
		});
		const modelOption = runtime.sessionResult.configOptions.find(
			(option) => option.category === "model",
		);
		expect(modelOption.options.map((entry) => entry.value)).toEqual([
			"mock-model-a",
			"mock-model-b",
		]);
	});

	it("applies session/set_mode and validates the mode id", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		await expect(
			runtime.invoke("session/set_mode", { sessionId: runtime.sessionId, modeId: "hands-off" }),
		).resolves.toEqual({});
		await expect(
			runtime.invoke("session/set_mode", { sessionId: runtime.sessionId, modeId: "nope" }),
		).rejects.toThrow(/Unknown session mode/);
	});

	it("applies session/set_config_option and validates id + value", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		const applied = await runtime.invoke("session/set_config_option", {
			sessionId: runtime.sessionId,
			configId: "model",
			value: "mock-model-b",
		});
		expect(Array.isArray(applied?.configOptions)).toBe(true);
		await expect(
			runtime.invoke("session/set_config_option", {
				sessionId: runtime.sessionId,
				configId: "model",
				value: "not-a-model",
			}),
		).rejects.toThrow(/Unsupported config option/);
	});

	it("accepts the bare ACP_MOCK_* spellings (canonical env alias)", async () => {
		const runtime = new AcpSessionRuntime({
			command: MOCK_ACP_AGENT,
			args: [],
			cwd: "/tmp",
			env: { PATH: process.env.PATH, ACP_MOCK_MODE: "hang_handshake" },
			startTimeoutMs: 300,
		});
		liveRuntimes.push(runtime);
		// The bare spelling drives the failure mode (never answers initialize).
		await expect(runtime.start()).rejects.toThrow(/timed out after 300ms/);
	});

	it("rejects prompt() before start()", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		await expect(runtime.prompt([{ type: "text", text: "hi" }])).rejects.toThrow(
			/has not started/,
		);
	});

	it("rejects the handshake when the agent speaks a foreign protocol version", async () => {
		const { runtime } = makeRuntime({ mode: "bad_handshake" });
		liveRuntimes.push(runtime);
		await expect(runtime.start()).rejects.toThrow(/Unsupported ACP protocol version/);
	});

	it("reports a crash as a prompt rejection with stderr context", async () => {
		const { runtime } = makeRuntime({ mode: "crash" });
		liveRuntimes.push(runtime);
		await runtime.start();
		await expect(runtime.prompt([{ type: "text", text: "hi" }])).rejects.toThrow();
		expect(runtime.stderrText()).toContain("simulated hard crash");
	});

	it("times out a hung handshake instead of pinning startup", async () => {
		const { runtime } = makeRuntime({ mode: "hang_handshake", startTimeoutMs: 300 });
		liveRuntimes.push(runtime);
		await expect(runtime.start()).rejects.toThrow(/timed out after 300ms/);
	});

	it("classifies a missing binary as a startup failure naming the command", async () => {
		const { runtime } = makeRuntime();
		liveRuntimes.push(runtime);
		runtime.command = "/nonexistent/acp-agent-xyz";
		await expect(runtime.start()).rejects.toThrow(/Failed to start ACP agent/);
	});

	it("abort() kills the process group: no orphan survives", async () => {
		const { runtime } = makeRuntime({ mode: "hang" });
		liveRuntimes.push(runtime);
		await runtime.start();
		const pid = runtime.pid;
		expect(typeof pid).toBe("number");
		expect(runtime.abort()).toEqual({ status: "aborted" });
		// The kill is SIGTERM-first: poll until the pid is gone.
		const deadline = Date.now() + 5000;
		let alive = true;
		while (Date.now() < deadline) {
			try {
				process.kill(pid, 0);
				await new Promise((resolve) => setTimeout(resolve, 50));
			} catch {
				alive = false;
				break;
			}
		}
		expect(alive).toBe(false);
	});

	it("dispose() is idempotent and safe before start", async () => {
		const { runtime } = makeRuntime();
		await runtime.dispose();
		await runtime.dispose();
	});

	it("swallows stdin errors gracefully without unhandled exceptions", async () => {
		const { runtime, logs } = makeRuntime();
		liveRuntimes.push(runtime);
		await runtime.start();
		const epipe = new Error("write EPIPE");
		epipe.code = "EPIPE";
		expect(() => runtime.child.stdin.emit("error", epipe)).not.toThrow();
		expect(logs.some((l) => l.includes("ACP agent stdin error: write EPIPE"))).toBe(true);
	});
});
