import { describe, expect, it } from "vitest";
import { inferAliasRenames, warnLegacyNoneHarnessModel } from "./aliasRenames.js";

describe("inferAliasRenames", () => {
	it("renames an alias when target signature matches", () => {
		const old = [{ name: "s", harness: "pi", model: "m" }];
		const neu = [{ name: "m", harness: "pi", model: "m" }];
		expect(inferAliasRenames(old, neu)).toEqual([{ from: "s", to: "m" }]);
	});

	it("returns empty when nothing removed or added", () => {
		const list = [{ name: "a", harness: "pi", model: "m" }];
		expect(inferAliasRenames(list, list)).toEqual([]);
	});

	it("maps a lone leftover pair as rename-with-retarget", () => {
		const old = [{ name: "a", harness: "pi", model: "m1" }];
		const neu = [{ name: "b", harness: "other", model: "m2" }];
		expect(inferAliasRenames(old, neu)).toEqual([{ from: "a", to: "b" }]);
	});

	it("matches weighted aliases by canonical target signature", () => {
		const target = { harness: "pi", model: "m", split: 0.5 };
		const old = [{ name: "s", ...target }];
		const neu = [{ name: "m", ...target }];
		expect(inferAliasRenames(old, neu)).toEqual([{ from: "s", to: "m" }]);
	});

	it("pairs deterministically when two removed aliases share one added signature", () => {
		const mk = (name) => ({ name, harness: "pi", model: "m" });
		// Both removals match the single added entry; the first removed wins,
		// the second has no candidate left (never duplicated or dropped loudly).
		expect(inferAliasRenames([mk("a"), mk("b")], [mk("c")])).toEqual([
			{ from: "a", to: "c" },
		]);
	});

	it("tolerates missing lists", () => {
		expect(inferAliasRenames(undefined, undefined)).toEqual([]);
		expect(inferAliasRenames(null, [])).toEqual([]);
	});
});

describe("warnLegacyNoneHarnessModel", () => {
	it("reports the first occurrence per project + alias + harness", () => {
		const row = { alias: "x", harness: "none", model: "m" };
		expect(warnLegacyNoneHarnessModel("/proj-warn-once", row)).toBe(true);
		expect(warnLegacyNoneHarnessModel("/proj-warn-once", row)).toBe(false);
	});
});
