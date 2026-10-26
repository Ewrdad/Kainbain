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

	test("explicit path wins over configured and fallback", () => {
		expect(resolveStatePath("/x.json", "/y.json", "s.json")).toBe("/x.json");
		expect(resolveStatePath(null, "/y.json", "s.json")).toBe("/y.json");
		expect(resolveStatePath(null, null, "s.json")).toBe(
			path.join(os.homedir(), ".kainbain", "engine", "s.json"),
		);
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
