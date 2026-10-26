// Domain: Observability — subject unit tests for the alert seam.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	ALERT_EVENTS,
	ALERT_SEVERITIES,
	buildAlertPayload,
	clearAlertSinks,
	emitAlert,
	maybeEmitFailbackWarning,
	notifyDeployRollback,
	notifyEngineReset,
	notifyEngineTrip,
	pickBoundedStrings,
	registerAlertSink,
	resetFailbackWarnings,
	resolveAlertConfig,
	sanitizeFailbackWarnings,
	resolveAlertSeverity,
	resolveErrorClassification,
	resolveErrorKind,
	toAlertText,
	validateAlertPayload,
} from "./alerts.js";

/**
 * MARK: alerts contract tests
 * @description Pins the WP7 alert contract: scheduled-vs-unscheduled
 * severities, envelope schema, sink fan-out that cannot fail the task,
 * and edge-triggered failback warnings.
 */
describe("alert severity disambiguation", () => {
	it("pages unscheduled parks and only notes scheduled checkpoints", () => {
		expect(resolveAlertSeverity("failed")).toBe("critical");
		expect(resolveAlertSeverity("waiting_human")).toBe("info");
	});

	it("suppresses operator aborts entirely", () => {
		expect(resolveAlertSeverity("failed", "operator-abort")).toBeNull();
		expect(resolveAlertSeverity("waiting_human", "operator-abort")).toBeNull();
	});

	it("pages nothing for unknown statuses", () => {
		expect(resolveAlertSeverity("in_stage")).toBeNull();
		expect(resolveAlertSeverity(undefined)).toBeNull();
	});
});

describe("error-kind classification (WP2 fallback)", () => {
	it("recognises transient, unrecoverable, and operator-abort signatures", () => {
		expect(resolveErrorKind("socket hang up")).toBe("transient");
		expect(resolveErrorKind("service unavailable (503)")).toBe("transient");
		expect(resolveErrorKind("rate limit exceeded")).toBe("unrecoverable");
		expect(resolveErrorKind("This operation was aborted")).toBe("operator-abort");
	});

	it("treats ordinary stage failures as logical", () => {
		expect(resolveErrorKind("tests failed: 3 assertions")).toBe("logical");
		expect(resolveErrorKind(undefined)).toBe("logical");
	});

	it("carries the precise WP2 signal alongside the kind", () => {
		expect(resolveErrorClassification("connect ECONNREFUSED 127.0.0.1:1")).toMatchObject({
			kind: "transient",
			signal: "connection-refused",
			retryable: true,
		});
		expect(resolveErrorClassification("maximum context length exceeded")).toMatchObject({
			kind: "unrecoverable",
			signal: "context-overflow",
			retryable: false,
		});
		const legacy = resolveErrorClassification(undefined);
		expect(legacy.kind).toBe("logical");
		expect(typeof legacy.signal).toBe("string");
	});
});

describe("alert envelope schema", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("builds a valid envelope with every event and severity", () => {
		for (const event of ALERT_EVENTS) {
			for (const severity of ALERT_SEVERITIES) {
				const payload = buildAlertPayload({ event, severity });
				expect(validateAlertPayload(payload)).toEqual([]);
			}
		}
	});

	it("rejects unknown events and severities", () => {
		expect(() => buildAlertPayload({ event: "nope", severity: "info" })).toThrow(TypeError);
		expect(() => buildAlertPayload({ event: "task.failed", severity: "page" })).toThrow(TypeError);
	});

	it("flags a malformed envelope field by field", () => {
		expect(validateAlertPayload(null)).toHaveLength(1);
		expect(validateAlertPayload({})).toContain("version must be 1");
		const payload = buildAlertPayload({ event: "task.failed", severity: "critical" });
		expect(validateAlertPayload({ ...payload, occurredAt: "not-a-date" })).toContain(
			"occurredAt must parse as a date",
		);
		expect(
			validateAlertPayload({ ...payload, error: { kind: "mystery" } }),
		).toContain("error.kind must be one of transient|unrecoverable|operator-abort|logical");
	});

	it("keeps scheduled and unscheduled payloads unambiguous", () => {
		const parked = buildAlertPayload({
			event: "task.failed",
			severity: resolveAlertSeverity("failed"),
			projectId: "p1",
			taskId: "t1",
		});
		const checkpoint = buildAlertPayload({
			event: "task.checkpoint_wait",
			severity: resolveAlertSeverity("waiting_human"),
			projectId: "p1",
			taskId: "t1",
		});
		expect(validateAlertPayload(parked)).toEqual([]);
		expect(validateAlertPayload(checkpoint)).toEqual([]);
		expect(parked.event).not.toBe(checkpoint.event);
		expect(parked.severity).toBe("critical");
		expect(checkpoint.severity).toBe("info");
	});

	it("round-trips through JSON stably", () => {
		const payload = buildAlertPayload({
			event: "task.failed",
			severity: "critical",
			projectId: "p1",
			taskId: "t1",
			stage: { id: "impl", name: "Implementation", type: "agent" },
			kind: "logical",
			message: "boom",
			excerpt: "head\n… [1 chars / 1 lines omitted] …\ntail",
			attemptCounts: { transient: 0, autoIteration: 9 },
		});
		const revived = JSON.parse(JSON.stringify(payload));
		expect(revived).toEqual(payload);
		expect(validateAlertPayload(revived)).toEqual([]);
	});

	it("drops undefined fields so partial reports stay valid", () => {
		const payload = buildAlertPayload({
			event: "engine.trip",
			severity: "critical",
			message: "5 failures in a row",
		});
		expect(payload).not.toHaveProperty("task");
		expect(payload).not.toHaveProperty("stage");
		expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("drops null fields instead of serialising them (no 'null' message)", () => {
		const payload = buildAlertPayload({
			event: "task.failed",
			severity: "critical",
			projectId: null,
			taskId: "t1",
			kind: "logical",
			message: null,
		});
		expect(payload).not.toHaveProperty("error.message");
		expect(payload.task).toEqual({ id: "t1" });
		expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("ignores deploy-cause and project-blocker params (no longer alert schema)", () => {
		const payload = buildAlertPayload({
			event: "task.failed",
			severity: "critical",
			taskId: "t1",
			message: "boom",
			deployGate: "canary-e2e",
			deployFailedCommand: "npm run test:canary",
			deployAttemptId: "deploy-t-1",
			projectBlocker: {
				gate: "canary-e2e",
				key: "canary-e2e@abc123",
			},
		});
		// Generic alert schema carries no deploy/shared-gate diagnostics:
		// the params are dropped, never surfaced.
		expect(payload).not.toHaveProperty("deployGate");
		expect(payload).not.toHaveProperty("deployFailedCommand");
		expect(payload).not.toHaveProperty("deployAttemptId");
		expect(payload).not.toHaveProperty("projectBlocker");
		expect(payload).toMatchObject({ event: "task.failed", error: { message: "boom" } });
		expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("pickBoundedStrings drops non-strings and is total on untrusted input", () => {
		expect(pickBoundedStrings({ a: " x ", b: 1, c: "", d: null }, ["a", "b", "c", "d"])).toEqual({
			a: "x",
		});
		expect(pickBoundedStrings({ a: "abcdef" }, ["a"], 3)).toEqual({ a: "abc" });
		expect(pickBoundedStrings(null, ["a"])).toEqual({});
		expect(pickBoundedStrings(["a"], ["a"])).toEqual({});
		expect(pickBoundedStrings({ a: "x" }, "not-an-array")).toEqual({});
	});

	it("rejects sinks without a send function at registration time", () => {
		expect(() => registerAlertSink(null)).toThrow(TypeError);
		expect(() => registerAlertSink({ name: "no-send" })).toThrow(TypeError);
		expect(() =>
			registerAlertSink({ name: "not-a-function", send: "yes" }),
		).toThrow(TypeError);
	});

	it("coerces garbage config numbers to defaults and honours explicit 0", () => {
		const coerced = resolveAlertConfig({ retries: "many", baseMs: NaN, timeoutMs: -5 });
		expect(coerced.retries).toBe(3);
		expect(coerced.baseMs).toBe(500);
		expect(coerced.timeoutMs).toBe(0);
		expect(resolveAlertConfig({ retries: 0 }).retries).toBe(0);
		expect(resolveAlertConfig(null).url).toBe("");
	});
});

describe("emitAlert fan-out", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("performs zero fetches and still relays UI when no sink is configured", async () => {
		let fetched = 0;
		const uiCalls = [];
		const bridge = {
			emitProcessEvent: async (sessionId, event, payload) => {
				uiCalls.push({ sessionId, event, payload });
			},
		};
		const outcome = await emitAlert(
			bridge,
			{
				event: "task.checkpoint_wait",
				severity: "info",
				projectId: "p1",
				taskId: "t1",
				ui: { event: "stage:checkpoint_wait", payload: { taskId: "t1" } },
			},
			{
				alertConfig: { url: "" },
				fetchImpl: async () => {
					fetched += 1;
					return { status: 200 };
				},
			},
		);
		expect(fetched).toBe(0);
		expect(outcome).toMatchObject({ delivered: false, attempted: 0 });
		expect(outcome.skipped).toBe("no sinks configured");
		expect(uiCalls).toEqual([
			{ sessionId: "p1", event: "stage:checkpoint_wait", payload: { taskId: "t1" } },
		]);
	});

	it("relays UI synchronously for synchronous callers", () => {
		const uiCalls = [];
		const bridge = {
			emitProcessEvent: (sessionId, event, payload) => {
				uiCalls.push({ sessionId, event, payload });
			},
		};
		void emitAlert(bridge, {
			event: "task.checkpoint_wait",
			severity: "info",
			projectId: "p1",
			ui: { event: "stage:checkpoint_wait", payload: { taskId: "t1" } },
		});
		expect(uiCalls).toHaveLength(1);
	});

	it("fans out to registered sinks and reports delivery", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const outcome = await emitAlert(null, {
			event: "task.failed",
			severity: "critical",
			projectId: "p1",
			taskId: "t1",
		});
		expect(outcome.delivered).toBe(true);
		expect(outcome.attempted).toBe(1);
		expect(seen).toHaveLength(1);
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});

	it("survives a throwing sink and still reports the healthy one", async () => {
		registerAlertSink({
			name: "broken",
			send: async () => {
				throw new Error("sink exploded");
			},
		});
		registerAlertSink({
			name: "healthy",
			send: async () => ({ delivered: true, attempts: 1, lastError: null }),
		});
		const outcome = await emitAlert(null, {
			event: "task.failed",
			severity: "critical",
		});
		expect(outcome.delivered).toBe(true);
		expect(outcome.attempted).toBe(2);
		expect(outcome.results[0]).toMatchObject({ sink: "broken", delivered: false });
	});

	it("posts to the webhook URL from overrides without touching other sinks", async () => {
		const calls = [];
		const outcome = await emitAlert(
			null,
			{ event: "deploy.rollback", severity: "critical" },
			{
				alertConfig: { url: "https://hooks.home/alerts", retries: 1, baseMs: 1 },
				fetchImpl: async (url, init) => {
					calls.push({ url, init });
					return { status: 200 };
				},
			},
		);
		expect(outcome.delivered).toBe(true);
		expect(calls).toHaveLength(1);
		expect(JSON.parse(calls[0].init.body).event).toBe("deploy.rollback");
	});

	it("reports a dead configured webhook without throwing or dropping other sinks", async () => {
		const seen = [];
		registerAlertSink({
			name: "healthy",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		// A dead outbound webhook is an operational blind spot: it must be
		// surfaced on stderr, not swallowed.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const outcome = await emitAlert(
				null,
				{ event: "task.failed", severity: "critical", taskId: "t1" },
				{
					alertConfig: { url: "https://hooks.home/dead", retries: 2, baseMs: 1 },
					fetchImpl: async () => {
						throw new Error("ECONNREFUSED");
					},
				},
			);
			// The task-facing contract: resolve, never reject; the healthy sink
			// still delivered, and the dead webhook is reported in the outcome.
			expect(outcome.delivered).toBe(true);
			expect(outcome.attempted).toBe(2);
			expect(seen).toHaveLength(1);
			const webhook = outcome.results.find((r) => r.sink === "webhook");
			expect(webhook).toMatchObject({ delivered: false, attempts: 2 });
			expect(webhook.lastError).toContain("ECONNREFUSED");
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(String(errorSpy.mock.calls[0][0])).toContain("webhook delivery failed");
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("never rejects on an invalid envelope", async () => {
		const outcome = await emitAlert(null, { event: "nope", severity: "info" });
		expect(outcome.delivered).toBe(false);
		expect(typeof outcome.skipped).toBe("string");
	});

	it("still relays the UI event when the envelope is invalid", async () => {
		const uiCalls = [];
		const bridge = {
			emitProcessEvent: (sessionId, event, payload) => {
				uiCalls.push({ sessionId, event, payload });
			},
		};
		const outcome = await emitAlert(bridge, {
			event: "nope",
			severity: "info",
			projectId: "p1",
			ui: { event: "stage:checkpoint_wait", payload: { taskId: "t1" } },
		});
		expect(outcome.delivered).toBe(false);
		expect(typeof outcome.skipped).toBe("string");
		expect(uiCalls).toEqual([
			{ sessionId: "p1", event: "stage:checkpoint_wait", payload: { taskId: "t1" } },
		]);
	});

	it("survives a throwing UI relay and still fans out to sinks", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const bridge = {
			emitProcessEvent: () => {
				throw new Error("socket dead");
			},
		};
		const outcome = await emitAlert(
			bridge,
			{
				event: "task.failed",
				severity: "critical",
				ui: { event: "stage:failed", payload: {} },
			},
		);
		expect(outcome.delivered).toBe(true);
		expect(seen).toHaveLength(1);
	});

	it("resolves the default config with the sink off", () => {
		const resolved = resolveAlertConfig({ url: "" });
		expect(resolved.url).toBe("");
		expect(resolved.retries).toBeGreaterThanOrEqual(0);
	});
});

describe("engine and deploy alert seams", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("raises trip as critical and reset as info", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		await notifyEngineTrip(null, { reason: "5 failures in a row" });
		await notifyEngineReset(null, { reason: "manual reset" });
		expect(seen.map((payload) => [payload.event, payload.severity])).toEqual([
			["engine.trip", "critical"],
			["engine.reset", "info"],
		]);
		for (const payload of seen) expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("raises rollback as critical with the rollback identity", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		await notifyDeployRollback(null, { pid: 1234 });
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({ event: "deploy.rollback", severity: "critical" });
		expect(seen[0].links).toMatchObject({ pid: 1234 });
		expect(validateAlertPayload(seen[0])).toEqual([]);
	});
});

describe("repeated-failback early warnings", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	function warnedTask() {
		return { id: "t1" };
	}

	it("warns once at 50% and once at 75% of the budget", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const task = warnedTask();
		for (let attempt = 1; attempt <= 8; attempt += 1) {
			const outcome = await maybeEmitFailbackWarning(null, {
				projectId: "p1",
				task,
				stage: { id: "impl", name: "Implementation" },
				attempt,
				maxAttempts: 8,
				error: "tests failed",
			});
			if (attempt === 4 || attempt === 6) {
				expect(outcome.warned).toBe(true);
			} else {
				expect(outcome.warned).toBe(false);
			}
		}
		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatchObject({
			event: "stage.failback_warning",
			severity: "warning",
			attemptCounts: { attempt: 4, maxAttempts: 8 },
		});
		expect(seen[1].attemptCounts).toMatchObject({ attempt: 6, maxAttempts: 8 });
		for (const payload of seen) expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("never warns twice for the same threshold or after a reset", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const task = warnedTask();
		await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task,
			attempt: 4,
			maxAttempts: 8,
		});
		const repeat = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task,
			attempt: 5,
			maxAttempts: 8,
		});
		expect(repeat.warned).toBe(false);
		expect(seen).toHaveLength(1);
		resetFailbackWarnings(task);
		const afterReset = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task,
			attempt: 4,
			maxAttempts: 8,
		});
		expect(afterReset.warned).toBe(true);
		expect(seen).toHaveLength(2);
	});

	it("stays quiet without a budget and for operator aborts", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const noBudget = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task: warnedTask(),
			attempt: 4,
			maxAttempts: 0,
		});
		const aborted = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task: warnedTask(),
			attempt: 8,
			maxAttempts: 8,
			error: "This operation was aborted",
		});
		expect(noBudget.warned).toBe(false);
		expect(aborted.warned).toBe(false);
		expect(seen).toHaveLength(0);
	});

	it("never throws on non-object task inputs", async () => {
		for (const bad of [null, undefined, "string", 42, []]) {
			const outcome = await maybeEmitFailbackWarning(null, {
				projectId: "p1",
				task: bad,
				attempt: 4,
				maxAttempts: 8,
			});
			expect(outcome.warned).toBe(false);
		}
		// resetFailbackWarnings must also tolerate non-objects.
		expect(() => resetFailbackWarnings(null)).not.toThrow();
		expect(() => resetFailbackWarnings("string")).not.toThrow();
		expect(() => resetFailbackWarnings(42)).not.toThrow();
		expect(() => resetFailbackWarnings([])).not.toThrow();
	});

	it("normalizes corrupt warning state instead of warning twice", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		// A task rehydrated from disk may carry the JSON-string form; a
		// hand-edited file may carry phantom thresholds or garbage.
		expect(sanitizeFailbackWarnings("[50]")).toEqual([50]);
		expect(sanitizeFailbackWarnings("[50, 50, 99]")).toEqual([50]);
		expect(sanitizeFailbackWarnings('["75"]')).toEqual([75]);
		expect(sanitizeFailbackWarnings("{not json}")).toEqual([]);
		expect(sanitizeFailbackWarnings("")).toEqual([]);
		expect(sanitizeFailbackWarnings(null)).toEqual([]);
		expect(sanitizeFailbackWarnings(undefined)).toEqual([]);
		expect(sanitizeFailbackWarnings(42)).toEqual([]);
		const task = { id: "t1", failbackWarningsSent: "[50]" };
		const repeat = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task,
			attempt: 4,
			maxAttempts: 8,
		});
		expect(repeat.warned).toBe(false);
		expect(task.failbackWarningsSent).toEqual([50]);
		expect(seen).toHaveLength(0);
		const phantom = { id: "t1", failbackWarningsSent: [99] };
		const warned = await maybeEmitFailbackWarning(null, {
			projectId: "p1",
			task: phantom,
			attempt: 4,
			maxAttempts: 8,
		});
		expect(warned.warned).toBe(true);
		expect(phantom.failbackWarningsSent).toEqual([50]);
		expect(seen).toHaveLength(1);
	});
});

describe("emitAlert hardening", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("still delivers to registered sinks when opts is null or junk", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		for (const badOpts of [null, "junk", 42]) {
			const outcome = await emitAlert(
				null,
				{ event: "task.failed", severity: "critical" },
				badOpts,
			);
			expect(outcome.delivered).toBe(true);
			expect(outcome.skipped).toBeNull();
		}
		expect(seen).toHaveLength(3);
	});

	it("ignores a non-object alertConfig override instead of spreading it", async () => {
		const seen = [];
		registerAlertSink({
			name: "stub",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		const outcome = await emitAlert(
			null,
			{ event: "task.failed", severity: "critical" },
			{ alertConfig: "https://hooks.home/alerts" },
		);
		expect(outcome.delivered).toBe(true);
		expect(seen).toHaveLength(1);
	});

	it("registers the same sink object only once", async () => {
		let calls = 0;
		const sink = {
			name: "dup",
			send: async () => {
				calls += 1;
				return { delivered: true, attempts: 1, lastError: null };
			},
		};
		const stopFirst = registerAlertSink(sink);
		registerAlertSink(sink);
		const outcome = await emitAlert(null, {
			event: "task.failed",
			severity: "critical",
		});
		expect(outcome.attempted).toBe(1);
		expect(calls).toBe(1);
		stopFirst();
		const after = await emitAlert(null, {
			event: "task.failed",
			severity: "critical",
		});
		expect(after.attempted).toBe(0);
		expect(calls).toBe(1);
	});
});

describe("alert field coercion (toAlertText)", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("passes strings through and reads Error messages", () => {
		expect(toAlertText("boom")).toBe("boom");
		expect(toAlertText(new Error("socket hang up"))).toBe("socket hang up");
		expect(toAlertText(42)).toBe("42");
	});

	it("JSON-encodes objects instead of emitting [object Object]", () => {
		expect(toAlertText({ code: 500 })).toBe('{"code":500}');
		const payload = buildAlertPayload({
			event: "task.failed",
			severity: "critical",
			message: { code: 500, fatal: true },
		});
		expect(payload.error.message).toBe('{"code":500,"fatal":true}');
		expect(payload.error.message).not.toContain("[object Object]");
		expect(validateAlertPayload(payload)).toEqual([]);
	});

	it("survives circular values without throwing", () => {
		const circular = { code: 1 };
		circular.self = circular;
		expect(() => toAlertText(circular)).not.toThrow();
		expect(() => buildAlertPayload({
			event: "task.failed",
			severity: "critical",
			message: circular,
		})).not.toThrow();
	});
});

describe("emitAlert config overrides", () => {
	beforeEach(() => {
		clearAlertSinks();
	});

	it("keeps defaults for keys a partial override omits", async () => {
		const calls = [];
		const outcome = await emitAlert(
			null,
			{ event: "task.failed", severity: "critical" },
			{
				alertConfig: { url: "https://hooks.home/alerts" },
				fetchImpl: async (url, init) => {
					calls.push({ url, init });
					return { status: 200 };
				},
			},
		);
		expect(outcome.delivered).toBe(true);
		expect(calls).toHaveLength(1);
		// A partial override must not silently disable retries: the default
		// budget (3) still applies when the override omits it.
		expect(resolveAlertConfig({ url: "https://hooks.home/alerts" })).toMatchObject({
			url: "https://hooks.home/alerts",
			retries: 3,
			baseMs: 500,
			timeoutMs: 5000,
		});
	});

	it("does not spread an undefined url over the configured default", () => {
		const withUrl = resolveAlertConfig({ url: "https://hooks.home/a", retries: 1 });
		expect(withUrl).toMatchObject({ url: "https://hooks.home/a", retries: 1 });
		const coerced = resolveAlertConfig({ retries: undefined, baseMs: undefined });
		expect(coerced.retries).toBe(3);
		expect(coerced.baseMs).toBe(500);
	});
});
