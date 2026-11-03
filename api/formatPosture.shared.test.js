import { describe, it, expect } from "vitest";
import { formatPosture } from "../shared/formatPosture.js";

// The posture string is `tiers:harness:model` with the model segment
// OPTIONAL — nothing may parse it by fixed segment count, and the fake
// "default" segment must never appear (CI stages used to leak it).

describe("formatPosture — segment joining", () => {
	it("joins tiers/harness/model with colons, tiers array joining with slashes", () => {
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "m" })).toBe("T0:pi:m");
		expect(formatPosture({ tiers: ["T0", "T1"], harness: "pi", model: "m" })).toBe("T0/T1:pi:m");
		expect(formatPosture({ tiers: "T0/T1", harness: "pi", model: "m" })).toBe("T0/T1:pi:m");
	});
	it("trims segments and drops blank tier entries", () => {
		expect(formatPosture({ tiers: ["T0", "  ", null, "T1"], harness: " pi ", model: "  m  " })).toBe("T0/T1:pi:m");
	});
	it("omits absent segments without leaving stray separators", () => {
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: null })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "", model: "m" })).toBe("T0:m");
		expect(formatPosture({ harness: "pi", model: "m" })).toBe("pi:m");
		expect(formatPosture({ model: "m" })).toBe("m");
		expect(formatPosture({})).toBe("");
		expect(formatPosture()).toBe("");
		expect(formatPosture({ tiers: [], harness: "  ", model: "   " })).toBe("");
	});
});

describe("formatPosture — the model segment appears only when real", () => {
	it("omits null, blank, and non-string models", () => {
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: null })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "" })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "   " })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: 42 })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: undefined })).toBe("T0:pi");
	});
	it("never emits the default sentinel, even when handed directly", () => {
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "default" })).toBe("T0:pi");
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "  Default  " })).toBe("T0:pi");
	});
	it("keeps model ids that contain single colons intact", () => {
		// Model ids may contain `:` (e.g. `kimi-k3:cloud`) — the posture keeps
		// the segment verbatim; consumers must use the explicit model field
		// rather than parsing this segment.
		expect(formatPosture({ tiers: ["T0"], harness: "pi", model: "kimi-k3:cloud" })).toBe("T0:pi:kimi-k3:cloud");
	});
});
