import { expect, test, describe } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadStateFile } from "./loadStateFile.js";
import {
	isLiveEnginePath,
	resolveStatePath,
	throwIfLiveEnginePathUnderTest,
} from "./resolveStatePath.js";
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
		// A padded live path is still live (no whitespace bypass).
		expect(() => resolveStatePath(`  ${live}  `, null, "s.json")).toThrow(
			/live engine path under test/,
		);
		// A similarly-prefixed dir is NOT the engine dir (no false positive).
		const engine2 = path.join(os.homedir(), ".kainbain", "engine2", "s.json");
		expect(resolveStatePath(engine2, null, "s.json")).toBe(engine2);
	});

	test("isLiveEnginePath marks exactly the live engine dir", () => {
		const liveFile = path.join(os.homedir(), ".kainbain", "engine", "s.json");
		const liveDir = path.join(os.homedir(), ".kainbain", "engine", "auth");
		const engineDirItself = path.join(os.homedir(), ".kainbain", "engine");
		expect(isLiveEnginePath(liveFile)).toBe(true);
		expect(isLiveEnginePath(liveDir)).toBe(true);
		// The dir itself counts: a state dir pointed AT it writes live files.
		expect(isLiveEnginePath(engineDirItself)).toBe(true);
		expect(isLiveEnginePath(`${engineDirItself}${path.sep}`)).toBe(true);
		// Surrounding whitespace never hides a live path (or a temp one).
		expect(isLiveEnginePath(`  ${liveFile}  `)).toBe(true);
		expect(isLiveEnginePath(`  ${tmp()}  `)).toBe(false);
		expect(isLiveEnginePath(tmp())).toBe(false);
		// A similarly-prefixed dir is NOT the engine dir.
		expect(
			isLiveEnginePath(path.join(os.homedir(), ".kainbain", "engine2", "s.json")),
		).toBe(false);
		// Non-paths never match (fail closed toward "not live").
		expect(isLiveEnginePath("")).toBe(false);
		expect(isLiveEnginePath("   ")).toBe(false);
		expect(isLiveEnginePath(null)).toBe(false);
		expect(isLiveEnginePath(undefined)).toBe(false);
	});

	test("throwIfLiveEnginePathUnderTest names the caller and stays quiet otherwise", () => {
		expect(process.env.VITEST).toBeTruthy();
		const live = path.join(os.homedir(), ".kainbain", "engine", "s.json");
		// The caller name lands in the message so the fix location is obvious.
		expect(() =>
			throwIfLiveEnginePathUnderTest({
				candidatePath: live,
				callerName: "resolveExamplePath",
			}),
		).toThrow(/resolveExamplePath refused live engine path under test/);
		// A missing caller name degrades to the generic guard name, never crashes.
		expect(() => throwIfLiveEnginePathUnderTest({ candidatePath: live })).toThrow(
			/engine-state guard refused live engine path under test/,
		);
		// Temp paths and non-paths are a silent no-op under VITEST.
		expect(
			throwIfLiveEnginePathUnderTest({
				candidatePath: tmp(),
				callerName: "resolveExamplePath",
			}),
		).toBeUndefined();
		expect(
			throwIfLiveEnginePathUnderTest({ candidatePath: null }),
		).toBeUndefined();
		// Outside VITEST (production) even a live path resolves quietly.
		const saved = process.env.VITEST;
		delete process.env.VITEST;
		try {
			expect(
				throwIfLiveEnginePathUnderTest({
					candidatePath: live,
					callerName: "resolveExamplePath",
				}),
			).toBeUndefined();
		} finally {
			if (saved === undefined) delete process.env.VITEST;
			else process.env.VITEST = saved;
		}
	});

	test("fallback names that escape the engine dir throw in every environment", () => {
		for (const bad of ["", "   ", ".", "..", "../x.json", "sub/s.json", "/abs.json"]) {
			expect(
				() => resolveStatePath(null, null, bad),
				`fallback ${JSON.stringify(bad)} must throw`,
			).toThrow(/bare fallback file name/);
		}
		// A dotted but bare name is still a valid file name.
		const saved = process.env.VITEST;
		delete process.env.VITEST;
		try {
			expect(resolveStatePath(null, null, "my.stuff.json")).toBe(
				path.join(os.homedir(), ".kainbain", "engine", "my.stuff.json"),
			);
		} finally {
			if (saved === undefined) delete process.env.VITEST;
			else process.env.VITEST = saved;
		}
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
