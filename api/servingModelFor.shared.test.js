import { describe, it, expect } from "vitest";
import { servingModelFor } from "../shared/servingModelFor.js";

// The single source of truth for "which model does this assignment serve",
// shared verbatim by the Runner (progress + posture + complete model field)
// and the backend (ledger ingest, complete-execution normalization, dispatch
// attribution). These tests pin the fail-safe contract: the "default"
// sentinel and non-LLM kinds NEVER produce a model, so the UI can never
// render a fake or unused model pill.

describe("servingModelFor — non-LLM kinds always report null", () => {
	it("returns null for every scripted kind, even with a model string present", () => {
		for (const kind of ["ci", "script", "deploy", "command", "merge", "integrate", "integration", "human"]) {
			expect(servingModelFor({ kind, model: "kimi-k3:cloud", fallbackModel: "fb" })).toBeNull();
		}
	});
	it("matches kind case-insensitively and trims whitespace", () => {
		expect(servingModelFor({ kind: " CI ", model: "m", fallbackModel: "fb" })).toBeNull();
		expect(servingModelFor({ kind: "Merge", model: "m", fallbackModel: "fb" })).toBeNull();
		expect(servingModelFor({ kind: "Agent", model: "m", fallbackModel: "fb" })).toBe("m");
	});
	it("treats a missing/blank kind as LLM-capable only via explicit values", () => {
		expect(servingModelFor({ model: "m" })).toBe("m");
		expect(servingModelFor({ fallbackModel: "fb" })).toBe("fb");
		expect(servingModelFor({})).toBeNull();
		expect(servingModelFor()).toBeNull();
		expect(servingModelFor(null)).toBeNull();
		expect(servingModelFor("agent")).toBeNull();
	});
});

describe("servingModelFor — model precedence", () => {
	it("the dispatched requirement wins over the runner default", () => {
		expect(servingModelFor({ kind: "agent", model: "kimi-k3:cloud", fallbackModel: "runner-default" })).toBe("kimi-k3:cloud");
	});
	it("falls back to the runner default when the requirement is absent", () => {
		expect(servingModelFor({ kind: "agent", model: "", fallbackModel: "runner-default" })).toBe("runner-default");
		expect(servingModelFor({ kind: "agent", model: null, fallbackModel: "runner-default" })).toBe("runner-default");
		expect(servingModelFor({ kind: "agent", model: undefined, fallbackModel: "runner-default" })).toBe("runner-default");
	});
	it("returns null when neither requirement nor fallback names a model", () => {
		expect(servingModelFor({ kind: "agent", model: "", fallbackModel: "" })).toBeNull();
		expect(servingModelFor({ kind: "agent", model: "   ", fallbackModel: "   " })).toBeNull();
		expect(servingModelFor({ kind: "agent" })).toBeNull();
	});
	it("trims the winning value", () => {
		expect(servingModelFor({ kind: "agent", model: "  m  ", fallbackModel: "fb" })).toBe("m");
		expect(servingModelFor({ kind: "agent", model: "", fallbackModel: "  fb  " })).toBe("fb");
	});
});

describe("servingModelFor — the default sentinel and non-strings never leak", () => {
	it("never returns the literal default sentinel", () => {
		expect(servingModelFor({ kind: "agent", model: "default", fallbackModel: "x" })).toBe("x");
		expect(servingModelFor({ kind: "agent", model: "default", fallbackModel: "default" })).toBeNull();
		expect(servingModelFor({ kind: "agent", model: "Default", fallbackModel: "default" })).toBeNull();
		expect(servingModelFor({ kind: "agent", model: "  DEFAULT  ", fallbackModel: "  default " })).toBeNull();
		expect(servingModelFor({ kind: "agent", fallbackModel: "default" })).toBeNull();
	});
	it("non-string values count as absent", () => {
		expect(servingModelFor({ kind: "agent", model: 42, fallbackModel: null })).toBeNull();
		expect(servingModelFor({ kind: "agent", model: 42, fallbackModel: "fb" })).toBe("fb");
		expect(servingModelFor({ kind: "agent", model: { toString: () => "x" }, fallbackModel: "fb" })).toBe("fb");
		expect(servingModelFor({ kind: "agent", model: ["m"], fallbackModel: "fb" })).toBe("fb");
	});
});
