import { describe, it, expect } from "vitest";
import { formatPosture, servingModelFor } from "./runnerPosture.js";
import { formatPosture as fromLedger, servingModelFor as fromLedgerModel } from "./executionLedger.js";
import { servingModelFor as sharedServingModelFor } from "../../shared/servingModelFor.js";
import { formatPosture as sharedFormatPosture } from "../../shared/formatPosture.js";

describe("runnerPosture barrel parity", () => {
  it("re-exports the exact shared/ implementations through runnerPosture and executionLedger", () => {
    expect(formatPosture).toBe(sharedFormatPosture);
    expect(servingModelFor).toBe(sharedServingModelFor);
    expect(fromLedger).toBe(sharedFormatPosture);
    expect(fromLedgerModel).toBe(sharedServingModelFor);
  });
});

describe("runnerPosture", () => {
  it("formatPosture includes model only when real", () => {
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "m" })).toBe("T0:pi:m");
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: null })).toBe("T0:pi");
    expect(formatPosture({ tiers: ["T0", "T1"], harness: "pi", model: "" })).toBe("T0/T1:pi");
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "  m  " })).toBe("T0:pi:m");
  });
  it("formatPosture never emits stray segments or the literal default", () => {
    expect(formatPosture({ tiers: ["T0"], harness: "", model: "m" })).toBe("T0:m");
    expect(formatPosture({ harness: "pi", model: "m" })).toBe("pi:m");
    expect(formatPosture({ model: "m" })).toBe("m");
    expect(formatPosture({})).toBe("");
    expect(formatPosture({ tiers: [], harness: "  ", model: "   " })).toBe("");
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "default" })).toBe("T0:pi:default"); // only if a model is literally named that
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: 42 })).toBe("T0:pi");
  });
  it("servingModelFor blanks non-LLM kinds", () => {
    expect(servingModelFor({ kind: "ci", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "merge", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "integrate", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "integration", model: "x" })).toBeNull();
    for (const kind of ["script", "deploy", "command", "human"]) {
      expect(servingModelFor({ kind, model: "x", fallbackModel: "f" })).toBeNull();
    }
    expect(servingModelFor({ kind: " CI ", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "agent", model: "m", fallbackModel: "f" })).toBe("m");
    expect(servingModelFor({ kind: "agent", model: "", fallbackModel: "f" })).toBe("f");
    expect(servingModelFor({ kind: "agent", model: "  ", fallbackModel: "  " })).toBeNull();
    expect(servingModelFor({ kind: "agent", model: 42, fallbackModel: null })).toBeNull();
    expect(servingModelFor()).toBeNull();
    expect(servingModelFor({ kind: "agent", model: "m" })).toBe("m");
  });
  it("re-exports from executionLedger", () => {
    expect(typeof fromLedger).toBe("function");
    expect(typeof fromLedgerModel).toBe("function");
  });
});
