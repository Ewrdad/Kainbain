// Domain: Observability — WP1 engine containment must reach the outbound sink.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetEngine, tripEngine } from "../flow/circuitBreaker.js";
import {
	clearAlertSinks,
	registerAlertSink,
	validateAlertPayload,
} from "./alerts.js";

/**
 * MARK: engine alert hookup tests
 * @description Pins the WP1 -> WP7 seam: a real circuit trip/reset (not the
 * detached `notifyEngine*` helpers alone) must fan out to the alert sinks,
 * once per genuine state transition, with the correct severity. A dead or
 * unconfigured sink must not affect containment.
 */

let tmpDir;
let statePath;

function makeStore() {
	return {
		engineState: { status: "idle", activeTaskId: null },
		eventBridge: {
			broadcastGlobal: () => {},
			emitNotification: () => {},
			emitSystemLog: () => {},
		},
		schedulerStats: {},
		circuitStatePath: statePath,
	};
}

function captureSink() {
	const seen = [];
	const stop = registerAlertSink({
		name: "capture",
		send: async (payload) => {
			seen.push(payload);
			return { delivered: true, attempts: 1, lastError: null };
		},
	});
	return { seen, stop };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-engine-alert-"));
	statePath = path.join(tmpDir, "circuit.json");
	clearAlertSinks();
});

afterEach(() => {
	clearAlertSinks();
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

describe("engine trip/reset outbound alerts", () => {
	it("pages critical on a fresh trip and info on the lift", async () => {
		const { seen, stop } = captureSink();
		try {
			const store = makeStore();
			tripEngine(store, { reason: "3 infra failures", source: "auto:infra" });
			await flush();
			expect(seen).toHaveLength(1);
			expect(seen[0]).toMatchObject({
				event: "engine.trip",
				severity: "critical",
			});
			expect(validateAlertPayload(seen[0])).toEqual([]);

			resetEngine(store, { reason: "operator reset", source: "manual" });
			await flush();
			expect(seen).toHaveLength(2);
			expect(seen[1]).toMatchObject({
				event: "engine.reset",
				severity: "info",
			});
			expect(validateAlertPayload(seen[1])).toEqual([]);
		} finally {
			stop();
		}
	});

	it("does not spam an idempotent re-trip or a no-op reset", async () => {
		const { seen, stop } = captureSink();
		try {
			const store = makeStore();
			tripEngine(store, { reason: "trip", source: "auto:infra" });
			await flush();
			// Already tripped, no escalation: a repeat sensor reading, not news.
			tripEngine(store, { reason: "trip again", source: "auto:infra" });
			await flush();
			expect(seen.filter((payload) => payload.event === "engine.trip")).toHaveLength(1);

			resetEngine(store, { reason: "reset", source: "manual" });
			await flush();
			// Already closed: no genuine transition to announce.
			resetEngine(store, { reason: "reset again", source: "manual" });
			await flush();
			expect(seen.filter((payload) => payload.event === "engine.reset")).toHaveLength(1);
		} finally {
			stop();
		}
	});

	it("still trips containment when no sink is configured", () => {
		const store = makeStore();
		const snapshot = tripEngine(store, {
			reason: "sink down does not matter",
			source: "auto:disk",
		});
		expect(snapshot.tripped).toBe(true);
		expect(snapshot.reason).toBe("sink down does not matter");
	});
});
