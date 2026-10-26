import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { MspSessionRuntime } from "./MspSessionRuntime.js";

/**
 * MARK: MspSessionRuntime tests
 * @description Unit coverage for the shared-host multiplexing seam: listener
 *   registration/fan-out, the request answer ladder, the start re-entry
 *   guard, and dispose hygiene. No real host is spawned — `spawnFn` is
 *   injected with a fake child so the handshake paths run hermetically.
 */

function makeRuntime(overrides = {}) {
	return new MspSessionRuntime({
		command: "muse",
		args: ["serve", "--provider", "echo"],
		cwd: "/tmp",
		...overrides,
	});
}

/** A fake child process: EventEmitter plumbing plus pid/exitCode/kill. */
function makeFakeChild({ answerInitialize = false } = {}) {
	const child = new EventEmitter();
	child.stdin = new EventEmitter();
	child.stdin.write = (line) => {
		if (!answerInitialize) return true;
		try {
			const frame = JSON.parse(line);
			if (frame?.method === "initialize" && frame.id !== undefined) {
				const reply = JSON.stringify({
					jsonrpc: "2.0",
					id: frame.id,
					result: { serverInfo: { name: "muse", version: "fake" } },
				});
				queueMicrotask(() => child.stdout.emit("data", Buffer.from(`${reply}\n`)));
			}
		} catch {
			// ignore malformed writes in the fake
		}
		return true;
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.pid = 424242;
	child.exitCode = null;
	child.kill = () => true;
	return child;
}

describe("MspSessionRuntime — notification multiplexing", () => {
	it("fans notifications out to every listener and isolates listener failures", () => {
		const runtime = makeRuntime();
		const seenA = [];
		const seenC = [];
		const listenerA = (method, params) => seenA.push({ method, params });
		const listenerB = () => {
			throw new Error("buggy listener");
		};
		const listenerC = (method, params) => seenC.push({ method, params });
		runtime.addNotificationListener(listenerA);
		runtime.addNotificationListener(listenerB);
		runtime.addNotificationListener(listenerC);

		runtime.dispatchNotification("item/delta", { delta: "x" });
		expect(seenA).toEqual([{ method: "item/delta", params: { delta: "x" } }]);
		expect(seenC).toEqual([{ method: "item/delta", params: { delta: "x" } }]);

		// Removal stops delivery; non-functions are ignored.
		runtime.removeNotificationListener(listenerA);
		runtime.removeNotificationListener("not a function");
		runtime.dispatchNotification("turn/started", {});
		expect(seenA).toHaveLength(1);
		expect(seenC).toHaveLength(2);
	});

	it("seeds listeners from the constructor opts", () => {
		const seen = [];
		const runtime = makeRuntime({
			onNotification: (method) => seen.push(method),
		});
		runtime.dispatchNotification("session/started", {});
		expect(seen).toEqual(["session/started"]);
	});
});

describe("MspSessionRuntime — request answer ladder", () => {
	it("answers with the FIRST claiming listener; abstentions fall through", async () => {
		const runtime = makeRuntime();
		const calls = [];
		runtime.addRequestListener(() => {
			calls.push("abstainer");
			return undefined;
		});
		runtime.addRequestListener((method) => {
			calls.push("claimer");
			return { result: { method } };
		});
		const answer = await runtime.dispatchRequest("approval/request", { approvalId: "a1" });
		expect(answer).toEqual({ result: { method: "approval/request" } });
		expect(calls).toEqual(["abstainer", "claimer"]);
	});

	it("surfaces the first listener FAILURE when nobody claims (fail closed)", async () => {
		const runtime = makeRuntime();
		runtime.addRequestListener(() => {
			throw new Error("default-deny: unusable approval shape");
		});
		runtime.addRequestListener(() => undefined);
		await expect(runtime.dispatchRequest("approval/request", {})).rejects.toThrow(
			/default-deny: unusable approval shape/,
		);
	});

	it("prefers a later claim over an earlier failure (ownership by claim)", async () => {
		const runtime = makeRuntime();
		runtime.addRequestListener(() => {
			throw new Error("sibling session: not mine");
		});
		runtime.addRequestListener(() => ({ result: "owned" }));
		await expect(runtime.dispatchRequest("approval/request", {})).resolves.toEqual({
			result: "owned",
		});
	});

	it("answers method-not-found (-32601) when nobody claims and nobody fails", async () => {
		const runtime = makeRuntime();
		runtime.addRequestListener(() => undefined);
		await expect(runtime.dispatchRequest("mystery/method", {})).rejects.toMatchObject({
			code: -32601,
		});
	});

	it("seeds the request listener from the constructor and removes on demand", async () => {
		const seen = [];
		const listener = (method) => {
			seen.push(method);
			return { result: {} };
		};
		const runtime = makeRuntime({ onRequest: listener });
		await runtime.dispatchRequest("userInput/request", {});
		expect(seen).toEqual(["userInput/request"]);
		runtime.removeRequestListener(listener);
		await expect(runtime.dispatchRequest("userInput/request", {})).rejects.toMatchObject({
			code: -32601,
		});
	});
});

describe("MspSessionRuntime — start lifecycle", () => {
	it("completes the handshake once and reuses the result on re-entry", async () => {
		let spawns = 0;
		const runtime = makeRuntime({
			spawnFn: () => {
				spawns += 1;
				return makeFakeChild({ answerInitialize: true });
			},
			startTimeoutMs: 1000,
		});
		const first = await runtime.start();
		expect(first.serverInfo.name).toBe("muse");
		const second = await runtime.start();
		expect(second).toBe(first);
		expect(spawns).toBe(1);
		await runtime.dispose();
	});

	it("refuses re-entry after a failed start (no double-spawn)", async () => {
		let spawns = 0;
		const runtime = makeRuntime({
			spawnFn: () => {
				spawns += 1;
				return makeFakeChild({ answerInitialize: false });
			},
			startTimeoutMs: 30,
		});
		await expect(runtime.start()).rejects.toThrow(/timed out after 30ms/);
		await expect(runtime.start()).rejects.toThrow(/already failed to start/);
		expect(spawns).toBe(1);
		await runtime.dispose();
	});

	it("dispose clears the listener sets and is idempotent", async () => {
		const runtime = makeRuntime({
			spawnFn: () => makeFakeChild({ answerInitialize: true }),
			startTimeoutMs: 1000,
		});
		await runtime.start();
		runtime.addNotificationListener(() => {});
		runtime.addRequestListener(() => undefined);
		expect(runtime.notificationListeners.size).toBe(1);
		expect(runtime.requestListeners.size).toBe(1);
		await runtime.dispose();
		expect(runtime.notificationListeners.size).toBe(0);
		expect(runtime.requestListeners.size).toBe(0);
		await runtime.dispose();
		expect(runtime.disposed).toBe(true);
	});

	it("rejects requests on a runtime whose host was never started", async () => {
		const runtime = makeRuntime();
		await expect(runtime.request("model/list", {})).rejects.toThrow(/not started/);
	});
});
