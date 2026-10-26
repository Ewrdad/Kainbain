import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	normalizeRegistryData,
	readRegistry,
	writeRegistry,
	registerProjectPath,
	registerRootPath,
	resolveRegistryPath,
} from "./projectRegistry.js";

/**
 * MARK: projectRegistry unit tests
 * @description Registry file read/write tolerance: missing and corrupt files
 *   read as empty, writes are idempotent, garbage normalizes away.
 */
describe("projectRegistry", () => {
	let dir;
	let file;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-registry-"));
		file = path.join(dir, "projects.json");
	});

	afterEach(() => {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("reads a missing file as empty", () => {
		expect(readRegistry({ registryFile: file })).toEqual({
			roots: [],
			projects: [],
		});
	});

	it("reads a corrupt file as empty", () => {
		fs.writeFileSync(file, "{{{not json", "utf8");
		expect(readRegistry({ registryFile: file })).toEqual({
			roots: [],
			projects: [],
		});
	});

	it("normalizes garbage entries away", () => {
		expect(
			normalizeRegistryData({
				roots: ["/a", "/a", "", null, 42],
				projects: "nope",
			}),
		).toEqual({ roots: ["/a"], projects: [] });
		expect(normalizeRegistryData(null)).toEqual({ roots: [], projects: [] });
	});

	it("round-trips roots and projects", () => {
		expect(
			writeRegistry(
				{ roots: ["/mnt/nas"], projects: ["/repo"] },
				{ registryFile: file },
			),
		).toBe(true);
		expect(readRegistry({ registryFile: file })).toEqual({
			roots: ["/mnt/nas"],
			projects: ["/repo"],
		});
	});

	it("registerProjectPath and registerRootPath are idempotent", () => {
		expect(registerProjectPath("/repo", { registryFile: file })).toBe(true);
		expect(registerProjectPath("/repo", { registryFile: file })).toBe(true);
		expect(registerRootPath("/mnt/nas", { registryFile: file })).toBe(true);
		expect(registerRootPath("/mnt/nas", { registryFile: file })).toBe(true);
		expect(readRegistry({ registryFile: file })).toEqual({
			roots: ["/mnt/nas"],
			projects: ["/repo"],
		});
		expect(registerProjectPath("", { registryFile: file })).toBe(false);
	});

	it("rejects blank paths without registering the server cwd", () => {
		// Regression: path.resolve("") returns process.cwd(), so a
		// whitespace-only input once registered the server directory.
		expect(registerProjectPath("   ", { registryFile: file })).toBe(false);
		expect(registerRootPath("  ", { registryFile: file })).toBe(false);
		expect(registerProjectPath(null, { registryFile: file })).toBe(false);
		expect(readRegistry({ registryFile: file })).toEqual({
			roots: [],
			projects: [],
		});
	});

	it("resolveRegistryPath prefers the explicit override", () => {
		expect(resolveRegistryPath({ registryFile: file })).toBe(
			path.resolve(file),
		);
		expect(typeof resolveRegistryPath()).toBe("string");
	});
});
