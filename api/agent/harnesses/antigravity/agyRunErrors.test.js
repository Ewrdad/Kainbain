import { describe, it, expect } from "vitest";
import {
	classifyAgyCrashExit,
	classifyAgyRunTimeout,
	classifyAgySpawnError,
	formatAgyRunError,
} from "./agyRunErrors.js";

/**
 * MARK: agyRunErrors tests
 * @description Unit tests for the exec-transport run-failure taxonomy
 *   (Phase 1 of the Antigravity reliability plan): every headless `agy` run
 *   that fails OUTSIDE the stream protocol (spawn failure, engine/CLI
 *   timeout, crash without a result line) reports a stable
 *   `{ code, message, hint }` instead of an ad hoc string, so the process
 *   log and the reliability buckets can name the cause + fix. Pure functions
 *   only — no spawns, no network.
 */

describe("classifyAgySpawnError", () => {
	it("maps ENOENT to AGY_BIN_MISSING with the install fix", () => {
		const classified = classifyAgySpawnError(new Error("spawn agy ENOENT"), {
			bin: "/missing/agy",
		});
		expect(classified.code).toBe("AGY_BIN_MISSING");
		expect(classified.message).toContain("/missing/agy");
		expect(classified.hint).toContain("KAINBAIN_AGY_BIN");
	});

	it("maps error with code ENOENT to AGY_BIN_MISSING even if message omits ENOENT", () => {
		const err = new Error("File not found");
		err.code = "ENOENT";
		const classified = classifyAgySpawnError(err, { bin: "agy" });
		expect(classified.code).toBe("AGY_BIN_MISSING");
		expect(classified.hint).toContain("KAINBAIN_AGY_BIN");
	});

	it("maps non-ENOENT spawn failures to AGY_SPAWN_FAILED without misreporting install", () => {
		const classified = classifyAgySpawnError(new Error("spawn EACCES permission denied"), {
			bin: "/locked/agy",
		});
		expect(classified.code).toBe("AGY_SPAWN_FAILED");
		expect(classified.message).toContain("/locked/agy");
		expect(classified.hint).not.toContain("Install the Antigravity CLI");
	});
});

describe("classifyAgyRunTimeout", () => {
	it("names the engine watchdog ceiling that tripped, not just the CLI flag", () => {
		const classified = classifyAgyRunTimeout({ printTimeout: "10m", watchdogMs: 600000 });
		expect(classified.code).toBe("AGY_RUN_TIMEOUT");
		expect(classified.message).toMatch(/timed out after/);
		expect(classified.message).toContain("10m");
		expect(classified.message).toContain("600000");
		expect(classified.hint).toContain("KAINBAIN_AGY_PRINT_TIMEOUT");
	});
});

describe("classifyAgyCrashExit", () => {
	it("keeps the exit-code + stderr-tail message shape callers already match on", () => {
		const classified = classifyAgyCrashExit({ code: 1, stderrTail: "mock-agy: simulated hard crash" });
		expect(classified.code).toBe("AGY_CRASHED");
		expect(classified.message).toMatch(/exited with code 1 without a result/);
		expect(classified.message).toContain("simulated hard crash");
	});

	it("reports the signal name when the process is killed by signal", () => {
		const classified = classifyAgyCrashExit({ code: null, signal: "SIGKILL", stderrTail: "" });
		expect(classified.code).toBe("AGY_CRASHED");
		expect(classified.message).toMatch(/exited with signal SIGKILL without a result/);
	});

	it("classifies an auth-shaped stderr tail as AGY_AUTH_REQUIRED, never a plain crash", () => {
		const classified = classifyAgyCrashExit({
			code: 1,
			stderrTail: "error: authentication required. Run `agy auth login` first.",
		});
		expect(classified.code).toBe("AGY_AUTH_REQUIRED");
		expect(classified.message).toContain("authentication required");
		expect(classified.hint).toContain("agy auth login");
	});

	it("classifies missing or invalid API key as AGY_AUTH_REQUIRED", () => {
		const classified = classifyAgyCrashExit({
			code: 1,
			stderrTail: "Error: GEMINI_API_KEY is not set or invalid API key",
		});
		expect(classified.code).toBe("AGY_AUTH_REQUIRED");
		expect(classified.hint).toContain("agy auth login");
	});

	it("stays AGY_CRASHED when there is no stderr tail at all", () => {
		const classified = classifyAgyCrashExit({ code: null, stderrTail: "" });
		expect(classified.code).toBe("AGY_CRASHED");
		expect(classified.message).toMatch(/without a result/);
	});
});

describe("formatAgyRunError", () => {
	it("renders one string carrying the code, message, and hint", () => {
		const text = formatAgyRunError({
			code: "AGY_BIN_MISSING",
			message: "The agy CLI was not found ('agy' is not on PATH).",
			hint: "Install the Antigravity CLI.",
		});
		expect(text).toContain("[AGY_BIN_MISSING]");
		expect(text).toContain("not on PATH");
		expect(text).toContain("Install the Antigravity CLI.");
	});

	it("handles string input safely without losing the error text", () => {
		const text = formatAgyRunError("unexpected failure");
		expect(text).toBe("unexpected failure [AGY_RUN_FAILED]");
	});

	it("handles undefined or null safely", () => {
		const text = formatAgyRunError(null);
		expect(text).toBe("agy run failed [AGY_RUN_FAILED]");
	});
});
