import { expect, test, describe } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadStateFile } from "./loadStateFile.js";
import { resolveStatePath } from "./resolveStatePath.js";
import { saveStateFile } from "./saveStateFile.js";

/***
 * MARK: durableState Tests
 * @description Verifies the shared durable-IO contract: explicit path
 *   wins, saves are atomic + 0600, loads are fail-open (missing or
 *   rotted files read as fresh), and persistence failures never throw.
 ***/
describe("durableState", () => {
	const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-durable-test-")), "s.json");

	test("explicit path wins over configured and temp-configured", () => {
		expect(resolveStatePath("/x.json", "/y.json", "s.json")).toBe("/x.json");
		expect(resolveStatePath(null, "/y.json", "s.json")).toBe("/y.json");
		const temp = tmp();
		expect(resolveStatePath(null, temp, "s.json")).toBe(temp);
	});

	test("live engine paths throw under VITEST (never silently pollute production)", () => {
		// The guard gates on VITEST: without it this test would assert
		// nothing about the production fallback below.
		expect(process.env.VITEST).toBeTruthy();
		const live = path.join(os.homedir(), ".kainbain", "engine", "s.json");
		// The fallback is the incident path (cause N5: unset env vars fell
		// through to live `~/.kainbain/engine/*.json` on every suite run).
		expect(() => resolveStatePath(null, null, "s.json")).toThrow(
			/live engine path under test/,
		);
		// Defence in depth: an explicit or configured live path throws too.
		expect(() => resolveStatePath(live, null, "s.json")).toThrow(
			/live engine path under test/,
		);
		expect(() => resolveStatePath(null, live, "s.json")).toThrow(
			/live engine path under test/,
		);
		// A similarly-prefixed dir is NOT the engine dir (no false positive).
		const engine2 = path.join(os.homedir(), ".kainbain", "engine2", "s.json");
		expect(resolveStatePath(engine2, null, "s.json")).toBe(engine2);
	});

	test("live engine fallback still resolves outside VITEST (production)", () => {
		const saved = process.env.VITEST;
		delete process.env.VITEST;
		try {
			expect(resolveStatePath(null, null, "s.json")).toBe(
				path.join(os.homedir(), ".kainbain", "engine", "s.json"),
			);
		} finally {
			if (saved === undefined) delete process.env.VITEST;
			else process.env.VITEST = saved;
		}
	});

	test("save/load round-trips and hardens to 0600", () => {
		const file = tmp();
		expect(saveStateFile(file, { v: 1 })).toBe(true);
		expect(loadStateFile(file, (v) => v)).toEqual({ v: 1 });
		expect(fs.statSync(file).mode & 0o777).toBe(0o600);
	});

	test("missing and rotted files read as fresh, never throw", () => {
		expect(loadStateFile(tmp(), () => "fresh")).toBe("fresh");
		const file = tmp();
		fs.writeFileSync(file, "{rotted", "utf8");
		let reported = null;
		expect(loadStateFile(file, () => "fresh", (err) => (reported = err))).toBe("fresh");
		expect(reported).not.toBeNull();
	});
});
