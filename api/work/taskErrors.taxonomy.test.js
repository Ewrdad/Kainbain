// Domain: The Work — WP2 single error taxonomy: overlap matrix, abort
// semantics, context-overflow compaction routing, decision logging.
// Regression suite for AUDIT.md §3.1/§3.2 (OCTAVE Vulnerability 1, PFMEA
// F-05/F-06/F-07): ECONNREFUSED, ENOTFOUND, fetch failed, and
// [Model Connection Error] used to match BOTH the transient and the
// unrecoverable matchers, so routing depended on call-site check order.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	classifyStageError,
	isUnrecoverableError,
	isOperatorAbortError,
	isTransientInfrastructureError,
	isGitLockError,
} from "./taskErrors.js";
import { TaskStore } from "../taskStore.js";
import { resolveStageErrorPushReason } from "../flow/stageFailureRouting.js";

const transientCases = [
	["connect ECONNREFUSED 127.0.0.1:11434", "connection-refused"],
	["getaddrinfo ENOTFOUND example.com", "dns-not-found"],
	["fetch failed", "network-blip"],
	["read ECONNRESET", "connection-reset"],
	["503 Service Unavailable", "server-error-5xx"],
	["[Model Connection Error] fetch failed", "model-connection-error"],
	["[Model Connection Error] ECONNREFUSED", "model-connection-error"],
	["[Timeout Error] Stage execution timed out", "timeout"],
	["socket hang up", "network-blip"],
	[
		"fatal: Unable to create '/repo/.git/index.lock': File exists.",
		"git-lock",
	],
];

const abortCases = [
	"This operation was aborted",
	"[Agent Execution Error] This operation was aborted",
];

const unrecoverableCases = [
	["maximum context length exceeded: 32768 tokens", "context-overflow"],
	["context length exceeded", "context-overflow"],
	["max tokens exceeded", "context-overflow"],
	["prompt is too long", "context-overflow"],
	["[Model Quota/Context Error] context exhausted", "context-overflow"],
	["[Model Quota/Context Error] 429 rate limit", "quota-exhaustion"],
	["429 Too Many Requests", "quota-exhaustion"],
	["401 Unauthorized - invalid api key", "auth-rejection"],
	["Agent is already processing a request", "agent-already-processing"],
	["session usage limit reached", "quota-exhaustion"],
];

const logicalCases = [
	["CI failed with exit code 1", "command-error"],
	["[Agent Review Rejection] coverage too low", "agent-rejection"],
	["CI test failed: 2 tests broken", "test-failure"],
	["all good", "unknown"],
];

const allMatrixCases = [
	...transientCases.map(([input, signal]) => ({ input, kind: "transient", signal })),
	...abortCases.map((input) => ({ input, kind: "operator-abort", signal: "operator-abort" })),
	...unrecoverableCases.map(([input, signal]) => ({
		input,
		kind: "unrecoverable",
		signal,
	})),
	...logicalCases.map(([input, signal]) => ({ input, kind: "logical", signal })),
];

describe("WP2: overlap matrix — every error classifies exactly once", () => {
	it.each(allMatrixCases.map((c) => [c.input, c.kind, c.signal]))(
		"classifyStageError(%j) => kind=%j signal=%j",
		(input, kind, signal) => {
			const classification = classifyStageError(input);
			expect(classification.kind).toBe(kind);
			expect(classification.signal).toBe(signal);
			expect(classification.retryable).toBe(kind === "transient");
			// String and Error inputs agree.
			expect(classifyStageError(new Error(input))).toMatchObject({
				kind,
				signal,
			});
		},
	);

	it("never claims one input as both transient and unrecoverable", () => {
		for (const { input } of allMatrixCases) {
			const claims = [
				isTransientInfrastructureError(input),
				isUnrecoverableError(input),
				isOperatorAbortError(input),
			].filter(Boolean);
			expect(claims.length <= 1).toBe(true);
		}
	});

	it("legacy matchers delegate to the single taxonomy", () => {
		for (const { input, kind } of allMatrixCases) {
			expect(isTransientInfrastructureError(input)).toBe(kind === "transient");
			expect(isUnrecoverableError(input)).toBe(kind === "unrecoverable");
			expect(isOperatorAbortError(input)).toBe(kind === "operator-abort");
		}
	});

	it("network errors classify as transient exactly once (OCTAVE V1)", () => {
		for (const input of [
			"connect ECONNREFUSED 127.0.0.1:80",
			"getaddrinfo ENOTFOUND example.com",
			"fetch failed",
			"[Model Connection Error] refused",
		]) {
			expect(classifyStageError(input).kind).toBe("transient");
			expect(isTransientInfrastructureError(input)).toBe(true);
			expect(isUnrecoverableError(input)).toBe(false);
			expect(isOperatorAbortError(input)).toBe(false);
		}
	});

	it("AbortError-named errors are operator aborts, never transient", () => {
		const err = new Error("503 Service Unavailable");
		err.name = "AbortError";
		expect(classifyStageError(err).kind).toBe("operator-abort");
		expect(isOperatorAbortError(err)).toBe(true);
		expect(isTransientInfrastructureError(err)).toBe(false);
		expect(isUnrecoverableError(err)).toBe(false);
	});

	it("genuine connection aborts stay transient, never operator aborts", () => {
		expect(classifyStageError("read ECONNABORTED").kind).toBe("transient");
		expect(isOperatorAbortError("connection aborted by peer")).toBe(false);
	});

	it("infrastructure-tagged quota errors are unrecoverable, not transient", () => {
		const carrier = {
			failureKind: "infrastructure",
			failureReason: "[Model Quota/Context Error] 429 rate limit",
		};
		expect(classifyStageError(carrier).kind).toBe("unrecoverable");
		expect(isTransientInfrastructureError(carrier)).toBe(false);
		expect(isUnrecoverableError(carrier)).toBe(true);
	});
});

describe("WP2: operator abort consumes no budget and raises no alert", () => {
	const quietBridge = () => ({
		emitProcessEvent: () => {},
		emitSystemLog: () => {},
		emitNotification: () => {},
		broadcastGlobal: () => {},
	});
	const wf = [
		{ id: "1", name: "Idea", type: "human", failback: "start" },
		{ id: "3", name: "Plan", type: "agent", failback: "previous" },
	];

	it("an aborted run records no failure and spends no budget", async () => {
		const store = new TaskStore({ eventBridge: quietBridge() });
		const task = store.createTask("p1", {
			title: "Abort budget task",
			goal: "Write a plan",
			stageId: "3",
		});
		await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => ({
				output: "[Agent Execution Error] This operation was aborted",
				failed: true,
				failureReason: "[Agent Execution Error] This operation was aborted",
				failureKind: "infrastructure",
			}),
		});
		const updated = store.getTask("p1", task.id);
		expect(updated.infraRetryCount || 0).toBe(0);
		expect(updated.autoIterationCount || 0).toBe(0);
		expect(updated.autoRetrying).toBeFalsy();
		expect(updated.failureReason).toBeNull();
		expect(updated.lastError).toBeNull();
	});

	it("operator aborts never count as unscheduled interventions", () => {
		expect(
			resolveStageErrorPushReason({
				task: { autoIterationCount: 99 },
				stage: { id: "3" },
				error: "This operation was aborted",
				skipFailback: true,
			}),
		).toBeNull();
	});
});

describe("WP2: context-overflow routes to failback with compaction hints", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-taxonomy-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const stages = [
		{ id: "design", name: "Design", type: "human" },
		{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "design" },
	];

	function makeStore() {
		return new TaskStore({
			eventBridge: {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
			},
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
	}

	it("fails back (never instant-parks) with compaction guidance", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("maximum context length exceeded: 32768 tokens"),
			{ stages, projectCwd: tempCwd, skipFailback: true, compactionHint: true },
		);
		// Failed back to the earlier stage instead of parking where it failed.
		expect(task.currentStageId).toBe("design");
		expect(task.lastError).toMatchObject({
			classification: {
				kind: "unrecoverable",
				signal: "context-overflow",
				retryable: false,
			},
			compactionHint: true,
		});
		const failedEntry = [...task.timeline]
			.reverse()
			.find((e) => e.status === "Failed");
		expect(failedEntry).toMatchObject({
			status: "Failed",
			classification: {
				kind: "unrecoverable",
				signal: "context-overflow",
				retryable: false,
			},
			compactionHint: true,
		});
	});

	it("marks context-overflow on lastError even without the explicit hint opt", () => {
		const store = makeStore();
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		store.handleStageFailure(
			"p1",
			task.id,
			stages[1],
			new Error("This model's maximum context length is 32768 tokens"),
			{ stages, projectCwd: tempCwd, skipFailback: true },
		);
		expect(task.lastError.classification).toMatchObject({
			kind: "unrecoverable",
			signal: "context-overflow",
		});
	});

	it("an overflowing agent run fails back carrying the compaction hint", async () => {
		const store = new TaskStore({
			eventBridge: {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
				broadcastGlobal: () => {},
			},
		});
		const wf = [
			{ id: "1", name: "Idea", type: "agent", failback: "start" },
			{ id: "2", name: "Plan", type: "agent", failback: "previous" },
		];
		const task = store.createTask("p1", {
			title: "Overflow task",
			goal: "Do work",
			stageId: "2",
		});
		const result = await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => ({
				output: "context length exceeded",
				failed: true,
				failureReason: "[Model Quota/Context Error] context length exceeded",
			}),
		});
		const updated = store.getTask("p1", task.id);
		// Tier 3 failback, not a Tier 4 instant park on the failing stage.
		expect(updated.currentStageId).toBe("1");
		expect(updated.failureReason).toContain("[Compaction Hint]");
		expect(updated.lastError.classification).toMatchObject({
			kind: "unrecoverable",
			signal: "context-overflow",
		});
		expect(result.status).not.toBe("retrying");
	});
});

describe("WP2: classifier is fail-safe and reads carrier surfaces", () => {
	it.each([[null], [undefined], [0], [false], [{}], [""]])(
		"classifyStageError(%j) never throws and lands logical/unknown",
		(input) => {
			const classification = classifyStageError(input);
			expect(classification).toEqual({
				kind: "logical",
				signal: "unknown",
				retryable: false,
				action: "failback",
			});
			expect(isTransientInfrastructureError(input)).toBe(false);
			expect(isUnrecoverableError(input)).toBe(false);
			expect(isOperatorAbortError(input)).toBe(false);
		},
	);

	it("survives throwing getters and revoked proxies", () => {
		const hostile = {};
		Object.defineProperty(hostile, "message", {
			get() {
				throw new Error("getter boom");
			},
		});
		expect(classifyStageError(hostile).kind).toBe("logical");
		expect(isGitLockError(hostile)).toBe(false);
		const { proxy, revoke } = Proxy.revocable(
			{ message: "fetch failed" },
			{},
		);
		revoke();
		expect(classifyStageError(proxy).kind).toBe("logical");
		expect(() => classifyStageError(proxy)).not.toThrow();
	});

	it("survives circular cause chains without hanging", () => {
		const err = new Error("boom");
		err.cause = err;
		expect(classifyStageError(err).kind).toBe("logical");
		const wrapped = new Error("wrap");
		wrapped.cause = err;
		expect(classifyStageError(wrapped).kind).toBe("logical");
	});

	it("reads Node code and numeric status surfaces", () => {
		expect(
			classifyStageError({ code: "ECONNREFUSED", message: "request failed" }),
		).toMatchObject({ kind: "transient", signal: "connection-refused" });
		expect(
			classifyStageError(Object.assign(new Error("denied"), { code: 401 })),
		).toMatchObject({ kind: "unrecoverable", signal: "auth-rejection" });
		expect(classifyStageError({ statusCode: 503 }).kind).toBe("transient");
		expect(
			classifyStageError({ status: 429, message: "slow down" }),
		).toMatchObject({ kind: "unrecoverable", signal: "quota-exhaustion" });
	});

	it("follows the cause chain and AggregateError entries", () => {
		const wrapped = new Error("wrap");
		wrapped.cause = new Error("fetch failed");
		expect(classifyStageError(wrapped).kind).toBe("transient");
		const aborted = new Error("outer");
		aborted.cause = new Error("This operation was aborted");
		expect(classifyStageError(aborted).kind).toBe("operator-abort");
		const aggregate = new AggregateError(
			[new Error("all good"), new Error("connect ECONNREFUSED 127.0.0.1:80")],
			"many failed",
		);
		expect(classifyStageError(aggregate).kind).toBe("transient");
	});

	it("routes extended raw provider overflow phrasing to compaction", () => {
		for (const input of [
			"input is too long for requested model",
			"conversation too long: please start a new one",
			"The context is too long to process",
		]) {
			expect(classifyStageError(input)).toMatchObject({
				kind: "unrecoverable",
				signal: "context-overflow",
				retryable: false,
				action: "failback-compact",
			});
			expect(isUnrecoverableError(input)).toBe(true);
			expect(isTransientInfrastructureError(input)).toBe(false);
		}
	});
});

describe("WP2: structured decision logging", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-taxonomy-log-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const stages = [
		{ id: "design", name: "Design", type: "human" },
		{ id: "impl", name: "Implementation", type: "agent", fallbackStageId: "design" },
	];

	it("records kind and signal on the timeline entry and lastError", () => {
		const store = new TaskStore({
			eventBridge: {
				emitProcessEvent: () => {},
				emitSystemLog: () => {},
				emitNotification: () => {},
			},
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		const task = store.createTask("p1", { stageId: "impl", projectCwd: tempCwd });
		store.handleStageFailure("p1", task.id, stages[1], new Error("401 Unauthorized"), {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		expect(task.lastError.classification).toEqual({
			kind: "unrecoverable",
			signal: "auth-rejection",
			retryable: false,
		});
		expect(task.timeline.at(-1).classification).toEqual({
			kind: "unrecoverable",
			signal: "auth-rejection",
			retryable: false,
		});
	});

	it("emits a [CLASSIFY] decision log for each routed error", async () => {
		const systemLogs = [];
		const store = new TaskStore({
			eventBridge: {
				emitProcessEvent: () => {},
				emitSystemLog: (_pid, message, meta) => {
					systemLogs.push({ message, meta });
				},
				emitNotification: () => {},
				broadcastGlobal: () => {},
			},
		});
		const wf = [
			{ id: "1", name: "Idea", type: "agent", failback: "start" },
			{ id: "2", name: "Plan", type: "agent", failback: "previous" },
		];
		const task = store.createTask("p1", {
			title: "Classify log task",
			goal: "Do work",
			stageId: "2",
		});
		await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: async () => {
				throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
			},
		});
		const classifyLogs = systemLogs.filter((l) =>
			String(l.message || "").includes("[CLASSIFY]"),
		);
		expect(classifyLogs.length).toBe(1);
		expect(classifyLogs[0].message).toContain("kind=transient");
		expect(classifyLogs[0].message).toContain("signal=connection-refused");
		expect(classifyLogs[0].meta.classification).toEqual({
			kind: "transient",
			signal: "connection-refused",
			retryable: true,
		});
	});
});
