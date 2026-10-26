import { describe, it, expect } from "vitest";

import {
	classifyStageError,
	isUnrecoverableError,
	isOperatorAbortError,
	isTransientInfrastructureError,
	isGitLockError,
} from "./taskErrors.js";

describe("isUnrecoverableError", () => {
	it.each([
		"[Authentication Error] bad credentials",
		"[Model Quota/Context Error] context exhausted",
		"rate limit exceeded, retry later",
		"429 Too Many Requests",
		"quota exceeded for this month",
		"session usage limit reached",
		"unauthorized access",
		"401 Unauthorized",
		"403 Forbidden",
		"invalid api key provided",
		"Agent is already processing a request",
	])("returns true for %j", (message) => {
		expect(isUnrecoverableError(message)).toBe(true);
		expect(isUnrecoverableError(new Error(message))).toBe(true);
	});

	it.each([
		"socket hang up",
		"502 Bad Gateway",
		"Task completed successfully",
		"",
		// WP2: network errors are transient ONLY — the old overlap that also
		// claimed them as unrecoverable parked retryable blips (Tier 4
		// instead of Tier 2). They must never match here.
		"connect ECONNREFUSED 127.0.0.1:80",
		"getaddrinfo ENOTFOUND example.com",
		"fetch failed",
		"[Model Connection Error] refused",
	])("returns false for %j", (message) => {
		expect(isUnrecoverableError(message)).toBe(false);
	});

	it("reads Error.message for Error inputs", () => {
		expect(isUnrecoverableError(new Error("429 quota hit"))).toBe(true);
		expect(isUnrecoverableError(new Error("all good"))).toBe(false);
	});

	it("handles nullish and non-string inputs without throwing", () => {
		expect(isUnrecoverableError(null)).toBe(false);
		expect(isUnrecoverableError(undefined)).toBe(false);
		expect(isUnrecoverableError(0)).toBe(false);
		expect(isUnrecoverableError({})).toBe(false);
	});
});

describe("isOperatorAbortError", () => {
	it.each([
		"This operation was aborted",
		"the Operation Was Aborted by the user",
	])("returns true for %j", (message) => {
		expect(isOperatorAbortError(message)).toBe(true);
		expect(isOperatorAbortError(new Error(message))).toBe(true);
	});

	it("returns true for AbortError-named errors", () => {
		const err = new Error("something");
		err.name = "AbortError";
		expect(isOperatorAbortError(err)).toBe(true);
	});

	it("reads failureReason on agent result objects", () => {
		expect(
			isOperatorAbortError({ failureReason: "This operation was aborted" }),
		).toBe(true);
		expect(isOperatorAbortError({ failureReason: "socket hang up" })).toBe(
			false,
		);
	});

	it.each([
		"socket hang up",
		"connection aborted by peer",
		"read ECONNABORTED",
		"Task completed successfully",
		"",
	])("returns false for %j", (message) => {
		expect(isOperatorAbortError(message)).toBe(false);
	});

	it("never mistakes connection aborts for operator aborts", () => {
		expect(isOperatorAbortError("connection aborted")).toBe(false);
		expect(isOperatorAbortError(new Error("ECONNABORTED"))).toBe(false);
	});

	it.each([[null], [undefined], [""], [0]])(
		"returns false for falsy input %j",
		(input) => {
			expect(isOperatorAbortError(input)).toBe(false);
		},
	);

	// Incident 2026-10-15: a CI gate failure whose captured stderr held
	// passing-test fetch-abort noise ("The operation was aborted" from the
	// frontend's own request handling) classified as operator-abort and
	// settled quietly with zero budget — which the scheduler re-dispatched
	// forever (13 identical 8-minute gate runs). Abort noise inside
	// captured log blobs must never read as an abort of the run itself.
	it("ignores abort noise inside captured stdout/stderr blobs", () => {
		const noise = [
			"✓ src/components/layout/Header.test.jsx (31 tests) 687ms",
			"DOMException [AbortError]: The operation was aborted.",
			'[kainbain] Failed to fetch projects DOMException [NetworkError]: The operation was aborted.',
			"Test Files 1 failed | 254 passed (255)",
		].join("\n");
		const err = new Error("CI command `npm run test` failed with exit code 1");
		err.stderr = noise;
		err.stdout = noise;
		expect(isOperatorAbortError(err)).toBe(false);
		expect(classifyStageError(err).action).toBe("failback");
	});

	it("still detects a genuine abort beside log blobs", () => {
		const err = new Error("This operation was aborted");
		err.stderr = "Test Files 254 passed (255)";
		err.stdout = "✓ all suites green";
		expect(isOperatorAbortError(err)).toBe(true);
		expect(classifyStageError(err).kind).toBe("operator-abort");
	});
});

describe("isTransientInfrastructureError", () => {
	it.each([
		"[Model Connection Error] dropped",
		"[Timeout Error] exceeded",
		"502 Bad Gateway",
		"503 Service Unavailable",
		"504 Gateway Timeout",
		"bad gateway",
		"service unavailable",
		"gateway timeout",
		"internal server error",
		"connect ECONNREFUSED 127.0.0.1:80",
		"getaddrinfo ENOTFOUND example.com",
		"read ECONNRESET",
		"write EPIPE",
		"connect ENETUNREACH",
		"query EAI_AGAIN",
		"connect ETIMEDOUT",
		"fetch failed",
		"socket hang up",
		"connection reset by peer",
		"connection refused",
		"connection timed out",
		"connection closed unexpectedly",
		"network unreachable",
		"network timeout",
		"temporarily unavailable",
		"server overloaded, try again",
	])("returns true for %j", (message) => {
		expect(isTransientInfrastructureError(message)).toBe(true);
		expect(isTransientInfrastructureError(new Error(message))).toBe(true);
	});

	it("returns true for infrastructure failureKind result objects", () => {
		expect(
			isTransientInfrastructureError({
				failureKind: "infrastructure",
				failureReason: "anything",
			}),
		).toBe(true);
	});

	it("returns false for operator aborts even with transient wording nearby", () => {
		expect(
			isTransientInfrastructureError("This operation was aborted"),
		).toBe(false);
		const err = new Error("503 Service Unavailable");
		err.name = "AbortError";
		expect(isTransientInfrastructureError(err)).toBe(false);
	});

	it.each([["Task completed"], [""], [null], [undefined]])(
		"returns false for %j",
		(input) => {
			expect(isTransientInfrastructureError(input)).toBe(false);
		},
	);

	it("does not treat plain Error objects as failureKind carriers", () => {
		const err = new Error("boom");
		err.failureKind = "infrastructure";
		// Error instances fall through to message matching, not the object path.
		expect(isTransientInfrastructureError(err)).toBe(false);
	});

	// Git index-lock contention is transient infrastructure (a crashed git
	// process or a concurrent branch op), never actionable review feedback:
	// the same stage must retry in place instead of failing back.
	it.each([
		"git checkout master failed (exit 128): fatal: Unable to create '/repo/.git/index.lock': File exists.",
		"Another git process seems to be running in this repository, e.g. an editor opened by 'git commit'.",
		"fatal: Unable to create '/repo/.git/index.lock': File exists.",
	])("treats git-lock contention as transient: %j", (message) => {
		expect(isTransientInfrastructureError(message)).toBe(true);
		expect(isTransientInfrastructureError(new Error(message))).toBe(true);
	});
});

describe("isGitLockError", () => {
	it.each([
		"git checkout master failed (exit 128): fatal: Unable to create '/repo/.git/index.lock': File exists.",
		"Another git process seems to be running in this repository",
	])("returns true for %j", (message) => {
		expect(isGitLockError(message)).toBe(true);
		expect(isGitLockError(new Error(message))).toBe(true);
	});

	it("reads GitError stdout/stderr carriers", () => {
		const err = new Error("git checkout other failed (exit 128)");
		err.stdout = "";
		err.stderr =
			"fatal: Unable to create '/repo/.git/index.lock': File exists.";
		expect(isGitLockError(err)).toBe(true);
	});

	it.each([["Task completed"], [""], [null], [undefined], ["merge conflict"]])(
		"returns false for %j",
		(input) => {
			expect(isGitLockError(input)).toBe(false);
		},
	);
});
