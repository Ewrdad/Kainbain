import { describe, it, expect } from "vitest";
import { FAST_GATE_MARKER, extractFastGateResult } from "./fastGateMarker.js";

describe("fastGateMarker", () => {
	it("shares the gate's marker spelling", () => {
		expect(FAST_GATE_MARKER).toBe("KAINBAIN_FAST_GATE_RESULT");
	});

	it("parses a failing verdict marker line", () => {
		const parsed = extractFastGateResult(
			`${FAST_GATE_MARKER} ok=false failedBranches="Unit Tests (frontend);Frontend Build" canary=skipped_due_to_fast_gate_failure verdict="/tmp/v/verdict.json"`,
		);
		expect(parsed).toMatchObject({
			ok: false,
			failedBranches: ["Unit Tests (frontend)", "Frontend Build"],
			canary: "skipped_due_to_fast_gate_failure",
			verdictPath: "/tmp/v/verdict.json",
		});
		expect(parsed.markerLine).toContain(FAST_GATE_MARKER);
	});

	it("parses a passing verdict marker line with no failures", () => {
		const parsed = extractFastGateResult(
			`${FAST_GATE_MARKER} ok=true failedBranches="" canary=ran verdict="/tmp/v/verdict.json"`,
		);
		expect(parsed).toMatchObject({
			ok: true,
			failedBranches: [],
			canary: "ran",
			verdictPath: "/tmp/v/verdict.json",
		});
	});

	it("finds the marker among surrounding log lines and wins on the first one", () => {
		const parsed = extractFastGateResult(
			[
				"Starting full project verification...",
				`${FAST_GATE_MARKER} ok=false failedBranches="Linting (api)" canary=pending verdict="unavailable"`,
				"Fast-gate verdict: FAILED — Linting (api)",
				`${FAST_GATE_MARKER} ok=false failedBranches="Linting (api)" canary=ran verdict="/tmp/v/verdict.json"`,
			].join("\n"),
		);
		expect(parsed.failedBranches).toEqual(["Linting (api)"]);
		expect(parsed.verdictPath).toBe("unavailable");
	});

	it("returns null when no marker line is present", () => {
		expect(extractFastGateResult("Running Unit Tests (api)... PASS (3s)\n")).toBeNull();
		expect(extractFastGateResult("")).toBeNull();
	});

	it("returns null (never throws) on malformed inputs", () => {
		expect(extractFastGateResult(null)).toBeNull();
		expect(extractFastGateResult(undefined)).toBeNull();
		expect(extractFastGateResult(42)).toBeNull();
		expect(extractFastGateResult({})).toBeNull();
		// Marker token with no parseable pairs degrades to safe defaults.
		expect(extractFastGateResult(`${FAST_GATE_MARKER} garbage`)).toMatchObject({
			ok: false,
			failedBranches: [],
			canary: "pending",
			verdictPath: null,
		});
	});

	it("never misreads key-like text inside a quoted branch name", () => {
		const parsed = extractFastGateResult(
			`${FAST_GATE_MARKER} ok=false failedBranches="Weird ok=true canary=ran suite" canary=ran verdict="/tmp/v/verdict.json"`,
		);
		expect(parsed.ok).toBe(false);
		expect(parsed.failedBranches).toEqual(["Weird ok=true canary=ran suite"]);
		expect(parsed.canary).toBe("ran");
	});

	it("unescapes quoted values the way the gate escapes them", () => {
		const parsed = extractFastGateResult(
			`${FAST_GATE_MARKER} ok=false failedBranches="Weird \\"Branch\\"" canary=ran verdict="C:\\\\v\\\\verdict.json"`,
		);
		expect(parsed.failedBranches).toEqual(['Weird "Branch"']);
		expect(parsed.verdictPath).toBe("C:\\v\\verdict.json");
	});
});
