// Domain: Web Push — atomic persistence primitive tests.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writePushJsonFile } from "./atomicWrite.js";

let dirs = [];

function makeDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-atomic-test-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
	dirs = [];
});

/***
 * MARK: atomic write tests
 * @description Round-trip fidelity, the 0600 secrecy invariant, tmp-file
 *   hygiene, and fail-fast argument validation for the shared push-state
 *   writer every push store builds on.
 ***/
describe("writePushJsonFile", () => {
	it("round-trips JSON through the target path", () => {
		const dir = makeDir();
		const target = writePushJsonFile(dir, "state.json", { a: 1, b: [true] });
		expect(target).toBe(path.join(dir, "state.json"));
		expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ a: 1, b: [true] });
	});

	it("overwrites atomically with no tmp residue", () => {
		const dir = makeDir();
		writePushJsonFile(dir, "state.json", { v: 1 });
		writePushJsonFile(dir, "state.json", { v: 2 });
		expect(JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))).toEqual({ v: 2 });
		expect(fs.readdirSync(dir)).toEqual(["state.json"]);
	});

	it("creates a missing dir and restricts the file to owner-only", () => {
		const dir = path.join(makeDir(), "nested", "push");
		const target = writePushJsonFile(dir, "secret.json", { k: "v" });
		if (process.platform !== "win32") {
			expect(fs.statSync(target).mode & 0o777).toBe(0o600);
		}
		expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ k: "v" });
	});

	it("rejects a missing dir and a non-bare fileName", () => {
		const dir = makeDir();
		expect(() => writePushJsonFile("", "a.json", {})).toThrow();
		expect(() => writePushJsonFile(dir, "../escape.json", {})).toThrow();
		expect(() => writePushJsonFile(dir, "sub/file.json", {})).toThrow();
		expect(() => writePushJsonFile(dir, "..", {})).toThrow();
		expect(() => writePushJsonFile(dir, ".", {})).toThrow();
		expect(() => writePushJsonFile(dir, "", {})).toThrow();
	});
});
