import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	CIRCUIT_FAILURE_WINDOW_MS_FALLBACK,
	distinctTaskCount,
	evaluateResourceSensors,
	freshCircuitSensors,
	getCircuitSensors,
	isAuthFailure,
	isInfraLikeFailure,
	pruneWindow,
	probeDiskFreeBytes,
	probeMemoryUsagePct,
	recordCircuitFailure,
	recordCircuitSuccess,
	resolveFailureWindowMs,
} from "./circuitSensors.js";
import { isTripped, markCanary, tripEngine } from "./circuitBreaker.js";
import { config } from "../config.js";

function makeStore(overrides = {}) {
	return {
		engineState: { status: "idle", activeTaskId: null },
		eventBridge: {
			broadcastGlobal: () => {},
			emitNotification: () => {},
			emitSystemLog: () => {},
		},
		schedulerStats: {},
		...overrides,
	};
}

let prevMemSensorEnabled;
let prevMemCriticalPct;

beforeEach(() => {
	// Sensors live on the store, so there is no global trip state to reset.
	// The suite-wide host-memory probe is pinned OFF (`testSetup.isolation.js`)
	// because the live `os.freemem()` reading trips under test load. This suite
	// owns the sensor's logic, so re-enable it locally and pin the threshold it
	// asserts against — independent of the ambient env.
	prevMemSensorEnabled = config.circuitMemSensorEnabled;
	prevMemCriticalPct = config.healthMemCriticalPct;
	config.circuitMemSensorEnabled = true;
	config.healthMemCriticalPct = 95;
});

afterEach(() => {
	config.circuitMemSensorEnabled = prevMemSensorEnabled;
	config.healthMemCriticalPct = prevMemCriticalPct;
});

describe("classifiers", () => {
	it("recognizes auth signatures", () => {
		expect(isAuthFailure("HTTP 401 Unauthorized")).toBe(true);
		expect(isAuthFailure("[Authentication Error] invalid api key")).toBe(true);
		expect(isAuthFailure("403 Forbidden")).toBe(true);
		expect(isAuthFailure("ECONNREFUSED 127.0.0.1:4000")).toBe(false);
	});

	it("never treats an operator abort as auth or infra", () => {
		expect(isAuthFailure("This operation was aborted")).toBe(false);
		expect(isInfraLikeFailure("This operation was aborted")).toBe(false);
	});

	it("treats connection failures as infrastructure but excludes auth", () => {
		expect(isInfraLikeFailure("ECONNREFUSED")).toBe(true);
		expect(isInfraLikeFailure("fetch failed")).toBe(true);
		expect(isInfraLikeFailure("503 Service Unavailable")).toBe(true);
		expect(isInfraLikeFailure("HTTP 401 unauthorized")).toBe(false);
		expect(isInfraLikeFailure("review found a bug", { failureKind: "rejected" })).toBe(
			false,
		);
	});
});

describe("window helpers", () => {
	it("prunes entries older than the window", () => {
		const entries = [
			{ taskId: "a", at: 0 },
			{ taskId: "b", at: 900 },
		];
		expect(pruneWindow(entries, 1000, 200)).toEqual([{ taskId: "b", at: 900 }]);
	});

	it("counts distinct tasks, not attempts", () => {
		expect(
			distinctTaskCount([
				{ taskId: "a" },
				{ taskId: "a" },
				{ taskId: "b" },
			]),
		).toBe(2);
	});
});

describe("recordCircuitFailure (infra window)", () => {
	it("does not trip below the distinct-task threshold", () => {
		const store = makeStore();
		expect(
			recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 0 }),
		).toBeNull();
		expect(
			recordCircuitFailure(store, { taskId: "t2", error: "ECONNREFUSED", now: 10 }),
		).toBeNull();
		expect(isTripped(store)).toBe(false);
	});

	it("trips at N distinct tasks with source auto:infra", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 0 });
		recordCircuitFailure(store, { taskId: "t2", error: "fetch failed", now: 10 });
		const snapshot = recordCircuitFailure(store, {
			taskId: "t3",
			error: "503 Service Unavailable",
			now: 20,
		});
		expect(snapshot?.tripped).toBe(true);
		expect(snapshot.source).toBe("auto:infra");
		expect(isTripped(store)).toBe(true);
	});

	it("one task's consecutive infrastructure streak trips at the threshold", () => {
		// The single-active scheduler retries the SAME stage in place, so a
		// provider outage surfaces as a streak on one task; a distinct-task-only
		// rule would let a one-task queue walk every retry to `failed`.
		const store = makeStore();
		expect(
			recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 0 }),
		).toBeNull();
		expect(
			recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 1 }),
		).toBeNull();
		const snapshot = recordCircuitFailure(store, {
			taskId: "t1",
			error: "ECONNREFUSED",
			now: 2,
		});
		expect(snapshot?.tripped).toBe(true);
		expect(snapshot.reason).toContain("1 distinct task");
	});

	it("a logical failure streak never trips", () => {
		const store = makeStore();
		for (let i = 0; i < 6; i += 1) {
			recordCircuitFailure(store, { taskId: "t1", error: "tests failed", now: i });
		}
		expect(isTripped(store)).toBe(false);
	});

	it("failures outside the window do not count", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 0 });
		recordCircuitFailure(store, { taskId: "t2", error: "ECONNREFUSED", now: 1 });
		// ~11 minutes later (window default 10 min) the earlier entries expired.
		const snapshot = recordCircuitFailure(store, {
			taskId: "t3",
			error: "ECONNREFUSED",
			now: 700_000,
		});
		expect(snapshot).toBeNull();
		expect(isTripped(store)).toBe(false);
	});

	it("a success clears the failure window", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "ECONNREFUSED", now: 0 });
		recordCircuitFailure(store, { taskId: "t2", error: "ECONNREFUSED", now: 1 });
		recordCircuitSuccess(store);
		expect(getCircuitSensors(store).infra).toHaveLength(0);
		const snapshot = recordCircuitFailure(store, {
			taskId: "t3",
			error: "ECONNREFUSED",
			now: 2,
		});
		expect(snapshot).toBeNull();
	});

	it("ignores logical and operator-abort failures", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "tests failed", now: 0 });
		recordCircuitFailure(store, {
			taskId: "t2",
			error: "This operation was aborted",
			now: 0,
		});
		expect(getCircuitSensors(store).infra).toHaveLength(0);
	});
});

describe("recordCircuitFailure (auth sensor)", () => {
	it("trips fast at N distinct tasks with source auto:auth", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "HTTP 401", now: 0 });
		recordCircuitFailure(store, { taskId: "t2", error: "invalid api key", now: 1 });
		const snapshot = recordCircuitFailure(store, {
			taskId: "t3",
			error: "[Authentication Error]",
			now: 2,
		});
		expect(snapshot?.source).toBe("auto:auth");
		expect(snapshot.reason).toContain("authentication");
	});

	it("sustained 401s on ONE task still trip (single-task queue)", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "401 unauthorized", now: 0 });
		recordCircuitFailure(store, { taskId: "t1", error: "401 unauthorized", now: 1 });
		const snapshot = recordCircuitFailure(store, {
			taskId: "t1",
			error: "401 unauthorized",
			now: 2,
		});
		expect(snapshot?.source).toBe("auto:auth");
	});

	it("auth failures do not pollute the infra window", () => {
		const store = makeStore();
		recordCircuitFailure(store, { taskId: "t1", error: "HTTP 401", now: 0 });
		expect(getCircuitSensors(store).infra).toHaveLength(0);
		expect(getCircuitSensors(store).auth).toHaveLength(1);
	});
});

describe("evaluateResourceSensors", () => {
	// The trip sensors are environment-driven and the production host may
	// turn them off (e.g. KAINBAIN_CIRCUIT_MEM_ENABLED=false while the
	// memory-pressure fix is pending). Pin the sensor switches and
	// thresholds so these cases assert the sensor logic itself, never the
	// host's env, and restore them so no later suite inherits the override.
	let saved;
	beforeEach(() => {
		saved = {
			circuitEnabled: config.circuitBreakerEnabled,
			memEnabled: config.circuitMemSensorEnabled,
			diskEnabled: config.circuitDiskSensorEnabled,
			memCriticalPct: config.healthMemCriticalPct,
			memSustainedTicks: config.circuitMemSustainedTicks,
			diskFreeFloorBytes: config.circuitDiskFreeFloorBytes,
		};
		config.circuitBreakerEnabled = true;
		config.circuitMemSensorEnabled = true;
		config.circuitDiskSensorEnabled = true;
		config.healthMemCriticalPct = 95;
		config.circuitMemSustainedTicks = 3;
		config.circuitDiskFreeFloorBytes = 1073741824;
	});
	afterEach(() => {
		config.circuitBreakerEnabled = saved.circuitEnabled;
		config.circuitMemSensorEnabled = saved.memEnabled;
		config.circuitDiskSensorEnabled = saved.diskEnabled;
		config.healthMemCriticalPct = saved.memCriticalPct;
		config.circuitMemSustainedTicks = saved.memSustainedTicks;
		config.circuitDiskFreeFloorBytes = saved.diskFreeFloorBytes;
	});

	it("trips immediately when disk free is below the floor", () => {
		const store = makeStore();
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: 10, diskFreeBytes: 1024 },
			now: 0,
		});
		expect(snapshot?.source).toBe("auto:disk");
	});

	it("does not trip when disk free is above the floor", () => {
		const store = makeStore();
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: 10, diskFreeBytes: 1e12 },
			now: 0,
		});
		expect(snapshot).toBeNull();
	});

	it("requires memory-critical to persist for M ticks", () => {
		const store = makeStore();
		expect(
			evaluateResourceSensors(store, { probes: { memPct: 99, diskFreeBytes: 1e12 }, now: 0 }),
		).toBeNull();
		expect(
			evaluateResourceSensors(store, { probes: { memPct: 99, diskFreeBytes: 1e12 }, now: 1 }),
		).toBeNull();
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: 99, diskFreeBytes: 1e12 },
			now: 2,
		});
		expect(snapshot?.source).toBe("auto:memory");
	});

	it("a non-critical reading resets the memory debouncer", () => {
		const store = makeStore();
		evaluateResourceSensors(store, { probes: { memPct: 99, diskFreeBytes: 1e12 }, now: 0 });
		evaluateResourceSensors(store, { probes: { memPct: 99, diskFreeBytes: 1e12 }, now: 1 });
		evaluateResourceSensors(store, { probes: { memPct: 10, diskFreeBytes: 1e12 }, now: 2 });
		expect(getCircuitSensors(store).memCriticalTicks).toBe(0);
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: 99, diskFreeBytes: 1e12 },
			now: 3,
		});
		expect(snapshot).toBeNull();
	});

	it("probe failure (null signals) fails open", () => {
		const store = makeStore();
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: null, diskFreeBytes: null },
			now: 0,
		});
		expect(snapshot).toBeNull();
		expect(isTripped(store)).toBe(false);
	});

	it("never re-trips an already-tripped engine (original cause preserved)", () => {
		const store = makeStore();
		tripEngine(store, { reason: "provider outage", source: "auto:infra", now: 0 });
		markCanary(store, { projectId: "p1", taskId: "t-canary", now: 1 });
		const snapshot = evaluateResourceSensors(store, {
			probes: { memPct: 10, diskFreeBytes: 1 },
			now: 2,
		});
		expect(snapshot).toBeNull();
		expect(isTripped(store)).toBe(true);
		expect(store.circuitState.reason).toBe("provider outage");
		expect(store.circuitState.source).toBe("auto:infra");
		expect(store.circuitState.canaryTaskId).toBe("t-canary");
	});
});

describe("resolveFailureWindowMs", () => {
	it("falls back instead of collapsing the window to zero", () => {
		expect(resolveFailureWindowMs(undefined)).toBe(
			CIRCUIT_FAILURE_WINDOW_MS_FALLBACK,
		);
		expect(resolveFailureWindowMs(Number.NaN)).toBe(
			CIRCUIT_FAILURE_WINDOW_MS_FALLBACK,
		);
		expect(resolveFailureWindowMs(600000)).toBe(600000);
		expect(resolveFailureWindowMs(0)).toBe(0);
	});
});

describe("probes", () => {
	it("probeDiskFreeBytes reads a real filesystem", () => {
		const free = probeDiskFreeBytes(process.cwd());
		expect(free === null || free > 0).toBe(true);
	});

	it("probeDiskFreeBytes returns null for an unreadable path", () => {
		expect(probeDiskFreeBytes("/definitely/not/a/real/path-xyz")).toBeNull();
	});

	it("probeMemoryUsagePct returns a bounded percentage", () => {
		const pct = probeMemoryUsagePct();
		expect(pct).toBeGreaterThanOrEqual(0);
		expect(pct).toBeLessThanOrEqual(100);
	});
});

describe("freshCircuitSensors", () => {
	it("starts empty with a zero debouncer", () => {
		expect(freshCircuitSensors()).toEqual({
			infra: [],
			auth: [],
			memCriticalTicks: 0,
			lastProbe: null,
		});
	});
});
