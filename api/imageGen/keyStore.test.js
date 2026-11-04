import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	IMAGE_GEN_KEYS_FILE_NAME,
	clearImageGenKey,
	describeImageGenKey,
	envKeyNameForProvider,
	getImageGenKey,
	isValidImageGenProviderId,
	resolveImageGenDir,
	setImageGenKey,
} from "./keyStore.js";

describe("api/imageGen/keyStore", () => {
	let tempDir;
	const savedEnv = {};

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-image-gen-keys-test-"));
		for (const name of ["KAINBAIN_IMAGE_GEN_DIR", "KAINBAIN_IMAGE_GEN_MUSE_API_KEY"]) {
			savedEnv[name] = process.env[name];
			delete process.env[name];
		}
	});

	afterEach(() => {
		for (const [name, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("validates provider ids (traversal-safe slugs only)", () => {
		expect(isValidImageGenProviderId("muse")).toBe(true);
		expect(isValidImageGenProviderId("mock")).toBe(true);
		expect(isValidImageGenProviderId("my-provider_2")).toBe(true);
		for (const bad of ["", "Muse", "../x", "a/b", "a b", ".", "..", "a".repeat(33), null, 42, {}]) {
			expect(isValidImageGenProviderId(bad)).toBe(false);
		}
	});

	it("names the env override per provider", () => {
		expect(envKeyNameForProvider("muse")).toBe("KAINBAIN_IMAGE_GEN_MUSE_API_KEY");
		expect(envKeyNameForProvider("../x")).toBeNull();
	});

	it("prefers KAINBAIN_IMAGE_GEN_DIR, else ~/.kainbain/image-gen", () => {
		process.env.KAINBAIN_IMAGE_GEN_DIR = "  /tmp/kb-custom  ";
		expect(resolveImageGenDir()).toBe("/tmp/kb-custom");
		delete process.env.KAINBAIN_IMAGE_GEN_DIR;
		expect(resolveImageGenDir()).toBe(path.join(os.homedir(), ".kainbain", "image-gen"));
	});

	it("reports unconfigured on a fresh dir", () => {
		expect(describeImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			configured: false,
			source: null,
		});
		expect(getImageGenKey({ providerId: "muse", dir: tempDir })).toBe("");
	});

	it("round-trips a key with 0600 file perms", () => {
		const stored = setImageGenKey({ providerId: "muse", key: "  sk-secret  ", dir: tempDir });
		expect(stored).toEqual({ providerId: "muse", configured: true });
		expect(getImageGenKey({ providerId: "muse", dir: tempDir })).toBe("sk-secret");
		expect(describeImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			configured: true,
			source: "stored",
		});
		const stat = fs.statSync(path.join(tempDir, IMAGE_GEN_KEYS_FILE_NAME));
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it("rejects invalid keys without touching the store", () => {
		for (const bad of ["", "   ", "has\nnewline", "x".repeat(4097), null, 42, {}]) {
			expect(() => setImageGenKey({ providerId: "muse", key: bad, dir: tempDir })).toThrow(
				expect.objectContaining({ statusCode: 400, code: "INVALID_IMAGE_GEN_KEY" }),
			);
		}
		expect(fs.existsSync(path.join(tempDir, IMAGE_GEN_KEYS_FILE_NAME))).toBe(false);
	});

	it("rejects invalid provider ids on write", () => {
		expect(() => setImageGenKey({ providerId: "../x", key: "k", dir: tempDir })).toThrow(
			expect.objectContaining({ statusCode: 400, code: "UNKNOWN_IMAGE_GEN_PROVIDER" }),
		);
		expect(() => clearImageGenKey({ providerId: "../x", dir: tempDir })).toThrow(
			expect.objectContaining({ statusCode: 400, code: "UNKNOWN_IMAGE_GEN_PROVIDER" }),
		);
	});

	it("clears a stored key and reports the new state", () => {
		setImageGenKey({ providerId: "muse", key: "sk-secret", dir: tempDir });
		expect(clearImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			providerId: "muse",
			configured: false,
		});
		expect(describeImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			configured: false,
			source: null,
		});
	});

	it("lets the env override win over the stored file", () => {
		setImageGenKey({ providerId: "muse", key: "sk-stored", dir: tempDir });
		process.env.KAINBAIN_IMAGE_GEN_MUSE_API_KEY = "sk-from-env";
		expect(getImageGenKey({ providerId: "muse", dir: tempDir })).toBe("sk-from-env");
		expect(describeImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			configured: true,
			source: "env",
		});
		// Clearing the stored key keeps the provider configured via env.
		expect(clearImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			providerId: "muse",
			configured: true,
		});
	});

	it("reads a corrupt store as unconfigured and heals on next write", () => {
		fs.writeFileSync(path.join(tempDir, IMAGE_GEN_KEYS_FILE_NAME), "not-json{{{");
		expect(describeImageGenKey({ providerId: "muse", dir: tempDir })).toEqual({
			configured: false,
			source: null,
		});
		setImageGenKey({ providerId: "muse", key: "sk-healed", dir: tempDir });
		expect(getImageGenKey({ providerId: "muse", dir: tempDir })).toBe("sk-healed");
	});

	it("keeps providers isolated from each other", () => {
		setImageGenKey({ providerId: "muse", key: "sk-muse", dir: tempDir });
		expect(describeImageGenKey({ providerId: "mock", dir: tempDir })).toEqual({
			configured: false,
			source: null,
		});
	});
});
