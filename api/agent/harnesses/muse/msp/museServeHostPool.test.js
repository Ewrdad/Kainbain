import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { createMuseServeHostPool } from "./museServeHostPool.js";

function fakeRuntime(label) {
	const child = new EventEmitter();
	const runtime = {
		label,
		child,
		disposed: false,
		async dispose() {
			runtime.disposed = true;
			child.emit("close", 0, null);
		},
	};
	return runtime;
}

describe("createMuseServeHostPool", () => {
	it("shares one host per key across concurrent leases", async () => {
		let spawns = 0;
		const runtime = fakeRuntime("r1");
		const pool = createMuseServeHostPool({
			startHost: async () => {
				spawns += 1;
				return runtime;
			},
			idleTtlMs: 60000,
		});
		const a = await pool.acquire("/repo");
		const b = await pool.acquire("/repo");
		expect(spawns).toBe(1);
		expect(a.runtime).toBe(b.runtime);
		a.release();
		b.release();
		await pool.disposeAll();
	});

	it("spawns a distinct host per key", async () => {
		let spawns = 0;
		const pool = createMuseServeHostPool({
			startHost: async (key) => {
				spawns += 1;
				return fakeRuntime(key);
			},
			idleTtlMs: 0,
		});
		const a = await pool.acquire("/a");
		const b = await pool.acquire("/b");
		expect(spawns).toBe(2);
		a.release();
		b.release();
	});

	it("disposes an unused host immediately when the TTL is 0", async () => {
		const runtime = fakeRuntime("r");
		const pool = createMuseServeHostPool({ startHost: async () => runtime, idleTtlMs: 0 });
		const lease = await pool.acquire("/repo");
		lease.release();
		expect(runtime.disposed).toBe(true);
		expect(pool.size()).toBe(0);
	});

	it("notifies holders and evicts the entry when a shared host dies", async () => {
		const runtime = fakeRuntime("r");
		const pool = createMuseServeHostPool({ startHost: async () => runtime, idleTtlMs: 60000 });
		const deaths = [];
		const lease = await pool.acquire("/repo", { onHostDeath: () => deaths.push("died") });
		runtime.child.emit("close", 1, null);
		expect(deaths).toEqual(["died"]);
		expect(pool.size()).toBe(0);
		lease.release();
	});

	it("rejects when the host cannot start", async () => {
		const pool = createMuseServeHostPool({
			startHost: async () => {
				throw new Error("spawn failed");
			},
			idleTtlMs: 0,
		});
		await expect(pool.acquire("/repo")).rejects.toThrow(/spawn failed/);
		expect(pool.size()).toBe(0);
	});

	it("disposeAll clears pending idle timers before disposing the hosts", async () => {
		const timers = new Map();
		let nextId = 1;
		const setTimer = (fn) => {
			const id = nextId++;
			timers.set(id, fn);
			return id;
		};
		const clearTimer = (id) => {
			timers.delete(id);
		};
		const runtime = fakeRuntime("r");
		const pool = createMuseServeHostPool({
			startHost: async () => runtime,
			idleTtlMs: 60000,
			setTimer,
			clearTimer,
		});
		const lease = await pool.acquire("/repo");
		lease.release();
		expect(timers.size).toBe(1);
		await pool.disposeAll();
		// The TTL sweep can never fire late or double-dispose.
		expect(timers.size).toBe(0);
		expect(runtime.disposed).toBe(true);
		expect(pool.size()).toBe(0);
	});

	it("invalidate evicts the entry; the idle TTL reaps the host once unused", async () => {
		const timers = new Map();
		let nextId = 1;
		const setTimer = (fn) => {
			const id = nextId++;
			timers.set(id, fn);
			return id;
		};
		const clearTimer = (id) => {
			timers.delete(id);
		};
		const runtime = fakeRuntime("r");
		const pool = createMuseServeHostPool({
			startHost: async () => runtime,
			idleTtlMs: 60000,
			setTimer,
			clearTimer,
		});
		const lease = await pool.acquire("/repo");
		pool.invalidate("/repo");
		expect(pool.size()).toBe(0);
		// An evicted-but-alive host is never killed under its holders.
		expect(runtime.disposed).toBe(false);
		lease.release();
		expect(runtime.disposed).toBe(false);
		expect(timers.size).toBe(1);
		// The idle TTL sweep reaps the now-unused evicted host.
		const [sweep] = [...timers.values()];
		sweep();
		expect(runtime.disposed).toBe(true);
	});
});
