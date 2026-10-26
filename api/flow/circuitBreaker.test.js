import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	circuitSnapshot,
	canaryAdmissionOpen,
	escalateProbeBackoff,
	freshCircuitState,
	getCircuitState,
	isCanaryTask,
	isTripped,
	loadCircuitState,
	markCanary,
	normalizeCircuitState,
	recordCanaryFailure,
	recordCanarySuccess,
	resetEngine,
	saveCircuitState,
	tripEngine,
} from "./circuitBreaker.js";

let tmpDir;
let statePath;

function makeStore(overrides = {}) {
	const events = [];
	const store = {
		engineState: { status: "idle", activeTaskId: null },
		events,
		eventBridge: {
			broadcastGlobal: (type, payload) => events.push({ type, payload }),
			emitNotification: (projectId, notif) =>
				events.push({ type: "NOTIFICATION", projectId, notif }),
			emitSystemLog: (projectId, message) =>
				events.push({ type: "LOG", projectId, message }),
		},
		schedulerStats: {},
		circuitStatePath: statePath,
		...overrides,
	};
	return store;
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-circuit-test-"));
	statePath = path.join(tmpDir, "circuit.json");
});

afterEach(() => {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// ignore
	}
});

describe("freshCircuitState / normalizeCircuitState", () => {
	it("starts healthy and un-tripped", () => {
		const state = freshCircuitState();
		expect(state.tripped).toBe(false);
		expect(state.reason).toBeNull();
		expect(state.canaryTaskId).toBeNull();
	});

	it("normalizes unknown fields away and coerces tripped", () => {
		const normalized = normalizeCircuitState({
			version: 1,
			tripped: true,
			reason: "x",
			junk: true,
		});
		expect(normalized.tripped).toBe(true);
		expect(normalized.reason).toBe("x");
		expect(normalized.junk).toBeUndefined();
	});

	it("resets on a version mismatch instead of guessing", () => {
		const normalized = normalizeCircuitState({ version: 99, tripped: true });
		expect(normalized.tripped).toBe(false);
	});
});

describe("tripEngine / resetEngine", () => {
	it("trips with reason, source and timestamp and broadcasts ENGINE_STATE", () => {
		const store = makeStore();
		const snapshot = tripEngine(store, {
			reason: "LiteLLM gateway down",
			source: "auto:infra",
			now: 1_000_000,
		});
		expect(snapshot.tripped).toBe(true);
		expect(snapshot.reason).toBe("LiteLLM gateway down");
		expect(snapshot.source).toBe("auto:infra");
		expect(snapshot.trippedAt).toBe(new Date(1_000_000).toISOString());
		expect(isTripped(store)).toBe(true);
		const engineFrames = store.events.filter((e) => e.type === "ENGINE_STATE");
		expect(engineFrames).toHaveLength(1);
		expect(engineFrames[0].payload.tripped).toBe(true);
		expect(engineFrames[0].payload.circuit.tripped).toBe(true);
		expect(store.events.some((e) => e.type === "NOTIFICATION")).toBe(true);
	});

	it("is idempotent and keeps the original trip moment", () => {
		const store = makeStore();
		tripEngine(store, { reason: "first", source: "auto:infra", now: 1000 });
		const second = tripEngine(store, { reason: "second", source: "manual", now: 2000 });
		expect(second.trippedAt).toBe(new Date(1000).toISOString());
		expect(second.reason).toBe("second");
		expect(second.tripCount).toBe(1);
	});

	it("reset requires nothing but records reason and lifts containment", () => {
		const store = makeStore();
		tripEngine(store, { reason: "disk", source: "auto:disk", now: 1000 });
		const snapshot = resetEngine(store, {
			reason: "disk cleaned",
			source: "manual",
			now: 2000,
		});
		expect(snapshot.tripped).toBe(false);
		expect(snapshot.resetReason).toBe("disk cleaned");
		expect(snapshot.resetAt).toBe(new Date(2000).toISOString());
		expect(snapshot.lastTrip.reason).toBe("disk");
		expect(isTripped(store)).toBe(false);
	});

	it("records the trip operator and exposes it on the snapshot", () => {
		const store = makeStore();
		const snapshot = tripEngine(store, {
			reason: "disk full",
			source: "manual",
			operator: "ops",
			now: 1000,
		});
		expect(snapshot.tripOperator).toBe("ops");
		expect(store.circuitState.tripOperator).toBe("ops");
	});

	it("records the reset operator and exposes it on the snapshot", () => {
		const store = makeStore();
		tripEngine(store, { reason: "disk", source: "auto:disk", now: 1000 });
		const snapshot = resetEngine(store, {
			reason: "cleaned",
			source: "manual",
			operator: "ops",
			now: 2000,
		});
		expect(snapshot.resetOperator).toBe("ops");
	});

	it("a new trip clears stale reset attribution", () => {
		const store = makeStore();
		tripEngine(store, { reason: "first", source: "auto:disk", now: 1000 });
		resetEngine(store, {
			reason: "cleaned",
			source: "manual",
			operator: "ops",
			now: 2000,
		});
		const snapshot = tripEngine(store, {
			reason: "second",
			source: "auto:infra",
			now: 3000,
		});
		expect(snapshot.tripped).toBe(true);
		expect(snapshot.resetReason).toBeNull();
		expect(snapshot.resetOperator).toBeNull();
		expect(snapshot.resetSource).toBeNull();
	});
});

describe("persistence round-trip", () => {
	it("survives a reload and keeps the trip", () => {
		const store = makeStore();
		tripEngine(store, {
			reason: "provider revoked credentials",
			source: "auto:auth",
			now: 1234,
		});
		expect(fs.existsSync(statePath)).toBe(true);

		const reloaded = makeStore();
		loadCircuitState(reloaded, { statePath });
		expect(isTripped(reloaded)).toBe(true);
		expect(reloaded.circuitState.reason).toBe("provider revoked credentials");
		expect(reloaded.circuitState.source).toBe("auto:auth");
		expect(reloaded.circuitState.trippedAt).toBe(new Date(1234).toISOString());
	});

	it("a reset survives a reload too", () => {
		const store = makeStore();
		tripEngine(store, { reason: "disk", source: "auto:disk" });
		resetEngine(store, { reason: "cleaned", source: "manual" });
		const reloaded = makeStore();
		loadCircuitState(reloaded, { statePath });
		expect(isTripped(reloaded)).toBe(false);
		expect(reloaded.circuitState.resetReason).toBe("cleaned");
	});

	it("operator attribution survives a reload", () => {
		const store = makeStore();
		tripEngine(store, {
			reason: "disk",
			source: "manual",
			operator: "trip-ops",
			now: 1000,
		});
		resetEngine(store, {
			reason: "cleaned",
			source: "manual",
			operator: "reset-ops",
			now: 2000,
		});
		const reloaded = makeStore();
		loadCircuitState(reloaded, { statePath });
		expect(reloaded.circuitState.tripOperator).toBe("trip-ops");
		expect(reloaded.circuitState.resetOperator).toBe("reset-ops");
		expect(circuitSnapshot(reloaded).resetOperator).toBe("reset-ops");
	});

	it("a corrupt state file loads as healthy instead of bricking boot", () => {
		fs.writeFileSync(statePath, "{not json", "utf8");
		const store = makeStore();
		const errors = [];
		loadCircuitState(store, { statePath, onError: (e) => errors.push(e) });
		expect(isTripped(store)).toBe(false);
		expect(errors).toHaveLength(1);
	});

	it("saveCircuitState reports write failures without throwing", () => {
		const store = makeStore();
		getCircuitState(store);
		const errors = [];
		const ok = saveCircuitState(store, {
			statePath: path.join(tmpDir, "missing-dir-not-created", "\0bad", "x.json"),
			onError: (e) => errors.push(e),
		});
		expect(ok).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("circuitSnapshot", () => {
	it("exposes a banner while tripped and null while healthy", () => {
		const store = makeStore();
		expect(circuitSnapshot(store).banner).toBeNull();
		tripEngine(store, { reason: "disk full", source: "auto:disk" });
		const snapshot = circuitSnapshot(store);
		expect(snapshot.isTripped).toBe(true);
		expect(snapshot.banner).toContain("disk full");
		expect(snapshot.banner).toContain("auto:disk");
	});
});

describe("half-open canary admission", () => {
	it("is closed until the cooldown elapses and opens for exactly one canary", () => {
		const store = makeStore();
		// Default cooldown is 60s; trip at t=0.
		tripEngine(store, { reason: "gateway down", source: "auto:infra", now: 0 });
		expect(canaryAdmissionOpen(store, 1000)).toBe(false);
		expect(canaryAdmissionOpen(store, 61_000)).toBe(true);
		markCanary(store, { projectId: "p1", taskId: "t1", now: 61_000 });
		expect(isCanaryTask(store, "t1")).toBe(true);
		// One canary in flight: no second admission.
		expect(canaryAdmissionOpen(store, 200_000)).toBe(false);
	});

	it("a failed canary re-trips and doubles the cooldown (capped)", () => {
		const store = makeStore();
		tripEngine(store, { reason: "gateway down", source: "auto:infra", now: 0 });
		markCanary(store, { projectId: "p1", taskId: "t1", now: 0 });
		const snapshot = recordCanaryFailure(store, {
			reason: "still 401",
			now: 100,
		});
		expect(snapshot.tripped).toBe(true);
		expect(snapshot.canaryTaskId).toBeNull();
		expect(snapshot.probeBackoffMs).toBe(120000);
		expect(snapshot.canaryFailureCount).toBe(1);
		expect(canaryAdmissionOpen(store, 100 + 119_999)).toBe(false);
		expect(canaryAdmissionOpen(store, 100 + 120_001)).toBe(true);
	});

	it("escalateProbeBackoff never exceeds the configured cap", () => {
		const store = makeStore();
		tripEngine(store, { reason: "x", source: "auto:infra", now: 0 });
		getCircuitState(store).probeBackoffMs = 600000;
		const next = escalateProbeBackoff(store, 0);
		expect(next).toBe(600000);
	});

	it("a passing canary lifts containment via auto:probe", () => {
		const store = makeStore();
		tripEngine(store, { reason: "x", source: "auto:infra", now: 0 });
		markCanary(store, { projectId: "p1", taskId: "t1", now: 0 });
		const snapshot = recordCanarySuccess(store, { now: 10 });
		expect(snapshot.tripped).toBe(false);
		expect(snapshot.resetSource).toBe("auto:probe");
		expect(snapshot.resetReason).toContain("canary");
		expect(snapshot.canarySuccessCount).toBe(1);
	});
});
