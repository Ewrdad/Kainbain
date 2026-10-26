import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	DEFAULT_CI_HEARTBEAT_INTERVAL_MS,
	resolveCommandHeartbeatIntervalMs,
	startStageHeartbeatTicker,
} from "./commandLiveness.js";
import { getStageHeartbeat } from "./stageHeartbeat.js";

/***
 * MARK: commandLiveness tests
 * @description Hermetic unit tests for the command-stage keep-alive: interval
 *   resolution (stage override > config > default, 0 disables) and the ticker
 *   itself (ticks at the interval, idempotent stop, never ticks after stop,
 *   swallows a throwing tick). All timing is injected — no wall-clock
 *   assertions anywhere.
 * @example run `npm run test:api -- commandLiveness`
 ***/

function fakeTimers() {
	const timers = [];
	const start = (fn, interval) => {
		const timer = { fn, interval, cleared: false, unref: 0 };
		timers.push(timer);
		return timer;
	};
	const clear = (timer) => {
		if (timer) timer.cleared = true;
	};
	const tick = (timer, times = 1) => {
		for (let i = 0; i < times; i += 1) {
			if (!timer.cleared) timer.fn();
		}
	};
	return { timers, start, clear, tick };
}

describe("resolveCommandHeartbeatIntervalMs", () => {
	it("defaults to the config value, then the 30s default", () => {
		expect(resolveCommandHeartbeatIntervalMs({}, {})).toBe(
			DEFAULT_CI_HEARTBEAT_INTERVAL_MS,
		);
		expect(resolveCommandHeartbeatIntervalMs({}, undefined)).toBe(
			DEFAULT_CI_HEARTBEAT_INTERVAL_MS,
		);
		expect(
			resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: 5000 }),
		).toBe(5000);
	});

	it("a positive stage override wins over config", () => {
		expect(
			resolveCommandHeartbeatIntervalMs(
				{ heartbeatIntervalMs: 250 },
				{ ciHeartbeatIntervalMs: 5000 },
			),
		).toBe(250);
	});

	it("an explicit stage override of 0 opts the stage out of the keep-alive", () => {
		expect(resolveCommandHeartbeatIntervalMs({ heartbeatIntervalMs: 0 }, {})).toBe(0);
	});

	it("missing, zero, or invalid config values disable the keep-alive (0)", () => {
		expect(resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: 0 })).toBe(0);
		expect(
			resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: -5 }),
		).toBe(0);
		expect(
			resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: "nope" }),
		).toBe(0);
		expect(
			resolveCommandHeartbeatIntervalMs({ heartbeatIntervalMs: "nope" }, {}),
		).toBe(DEFAULT_CI_HEARTBEAT_INTERVAL_MS);
	});
});

describe("startStageHeartbeatTicker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns an inert ticker when the interval disables the keep-alive", () => {
		const t = fakeTimers();
		const ticker = startStageHeartbeatTicker({}, "t-1", {
			intervalMs: 0,
			setIntervalFn: t.start,
			clearIntervalFn: t.clear,
		});
		expect(ticker.enabled).toBe(false);
		expect(t.timers.length).toBe(0);
		expect(() => ticker.stop()).not.toThrow();
	});

	it("records a stage heartbeat on every tick", () => {
		const store = {};
		const ticker = startStageHeartbeatTicker(store, "t-1", {
			stageId: "ci-1",
			kind: "ci",
			intervalMs: 30000,
		});
		vi.advanceTimersByTime(30000);
		const first = getStageHeartbeat(store, "t-1");
		expect(first).toMatchObject({ stageId: "ci-1", kind: "ci" });
		vi.advanceTimersByTime(30000);
		const second = getStageHeartbeat(store, "t-1");
		expect(second.lastBeatAt).toBeGreaterThan(first.lastBeatAt);
		ticker.stop();
	});

	it("ticks at the interval and stops exactly once (no tick after stop)", () => {
		const onTick = vi.fn();
		const t = fakeTimers();
		const ticker = startStageHeartbeatTicker({}, "t-1", {
			intervalMs: 1000,
			onTick,
			setIntervalFn: t.start,
			clearIntervalFn: t.clear,
		});
		expect(t.timers.length).toBe(1);
		t.tick(t.timers[0], 3);
		expect(onTick).toHaveBeenCalledTimes(3);

		ticker.stop();
		ticker.stop();
		expect(t.timers[0].cleared).toBe(true);
		t.tick(t.timers[0], 5);
		expect(onTick).toHaveBeenCalledTimes(3);
		expect(t.timers.length).toBe(1);
	});

	it("unrefs the timer so it never keeps the process alive", () => {
		const onTick = vi.fn();
		const t = fakeTimers();
		startStageHeartbeatTicker({}, "t-1", {
			intervalMs: 1000,
			onTick,
			setIntervalFn: (fn, interval) => {
				const timer = t.start(fn, interval);
				timer.unref = 0;
				return {
					unref: vi.fn(() => {
						timer.unref += 1;
					}),
				};
			},
			clearIntervalFn: t.clear,
		});
		expect(t.timers[0].unref).toBe(1);
	});

	it("swallows a throwing onTick", () => {
		const onTick = vi.fn(() => {
			throw new Error("boom");
		});
		const t = fakeTimers();
		startStageHeartbeatTicker({}, "t-1", {
			intervalMs: 1000,
			onTick,
			setIntervalFn: t.start,
			clearIntervalFn: t.clear,
		});
		expect(() => t.tick(t.timers[0], 2)).not.toThrow();
		expect(onTick).toHaveBeenCalledTimes(2);
	});
});
