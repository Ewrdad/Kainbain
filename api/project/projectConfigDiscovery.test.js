import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { _findProjectConfigFile, _isKainbainConfig } from "./projectConfigDiscovery.js";

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kb-projdiscovery-"));
}

describe("_isKainbainConfig", () => {
	it("detects a cwd match", () => {
		expect(_isKainbainConfig({ cwd: "/tmp/repo" }, "/tmp/repo")).toBe(true);
	});

	it("detects id + stages/workflows shapes without a cwd", () => {
		expect(_isKainbainConfig({ id: "p1", stages: [] }, "/elsewhere")).toBe(true);
		expect(_isKainbainConfig({ id: "p1", workflows: [] }, "/elsewhere")).toBe(true);
		expect(_isKainbainConfig({ id: "p1", kainbainDirName: ".kainbain" }, "/elsewhere")).toBe(
			true,
		);
	});

	it("ignores coincidental project.json files from other tooling", () => {
		expect(_isKainbainConfig({ name: "app", targets: {} }, "/tmp/repo")).toBe(false);
		expect(_isKainbainConfig({ id: "p1" }, "/tmp/repo")).toBe(false);
		expect(_isKainbainConfig(null, "/tmp/repo")).toBe(false);
		expect(_isKainbainConfig([], "/tmp/repo")).toBe(false);
	});
});

describe("_findProjectConfigFile", () => {
	it("returns null for missing dir", () => {
		expect(_findProjectConfigFile("/no/such/dir")).toBeNull();
	});

	it("returns null for non-string input", () => {
		expect(_findProjectConfigFile(undefined)).toBeNull();
	});

	it("returns null for a hermetic empty dir", () => {
		const dir = makeTempDir();
		try {
			expect(_findProjectConfigFile(dir)).toBeNull();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("finds the default .kainbain/project.json", () => {
		const dir = makeTempDir();
		try {
			const expected = path.join(dir, ".kainbain", "project.json");
			fs.mkdirSync(path.dirname(expected), { recursive: true });
			fs.writeFileSync(expected, JSON.stringify({ cwd: dir }));
			expect(_findProjectConfigFile(dir)).toBe(expected);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("ignores non-KainBain project.json files in subdirectories", () => {
		const dir = makeTempDir();
		try {
			const decoy = path.join(dir, "sub", "project.json");
			fs.mkdirSync(path.dirname(decoy), { recursive: true });
			fs.writeFileSync(decoy, JSON.stringify({ name: "nx-app", targets: {} }));
			expect(_findProjectConfigFile(dir)).toBeNull();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
