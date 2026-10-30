import { describe, it, expect } from "vitest";
import { formatPosture, servingModelFor } from "./runnerPosture.js";
import { formatPosture as fromLedger, servingModelFor as fromLedgerModel } from "./executionLedger.js";

describe("runnerPosture", () => {
  it("formatPosture includes model only when real", () => {
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "m" })).toBe("T0:pi:m");
    expect(formatPosture({ tiers: ["T0"], harness: "pi", model: null })).toBe("T0:pi");
    expect(formatPosture({ tiers: ["T0", "T1"], harness: "pi", model: "" })).toBe("T0/T1:pi");
  });
  it("servingModelFor blanks non-LLM kinds", () => {
    expect(servingModelFor({ kind: "ci", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "merge", model: "x" })).toBeNull();
    expect(servingModelFor({ kind: "agent", model: "m", fallbackModel: "f" })).toBe("m");
    expect(servingModelFor({ kind: "agent", model: "  ", fallbackModel: "  " })).toBeNull();
  });
  it("re-exports from executionLedger", () => {
    expect(typeof fromLedger).toBe("function");
    expect(typeof fromLedgerModel).toBe("function");
  });
});
