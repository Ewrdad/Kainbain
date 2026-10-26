import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectGitRemote, resolveDefaultGitRemote } from "./gitRemote.js";

const ENV_KEY = "KAINBAIN_GIT_REMOTE_TEMPLATE";
const savedTemplate = process.env[ENV_KEY];
const savedUser = process.env.USER;

afterEach(() => {
	if (savedTemplate === undefined) delete process.env[ENV_KEY];
	else process.env[ENV_KEY] = savedTemplate;
	if (savedUser === undefined) delete process.env.USER;
	else process.env.USER = savedUser;
});

describe("resolveDefaultGitRemote", () => {
	it("returns null when no template", () => {
		delete process.env[ENV_KEY];
		expect(resolveDefaultGitRemote("my-app")).toBeNull();
	});

	it("returns null for a blank template", () => {
		process.env[ENV_KEY] = "   ";
		expect(resolveDefaultGitRemote("my-app")).toBeNull();
	});

	it("expands SLUG, NAME, and USER placeholders", () => {
		process.env[ENV_KEY] = "git@host:${USER}/${SLUG}.git";
		process.env.USER = "ada";
		expect(resolveDefaultGitRemote("my-app")).toBe("git@host:ada/my-app.git");
		process.env[ENV_KEY] = "https://host/${NAME}";
		expect(resolveDefaultGitRemote("my-app", { name: "My App" })).toBe("https://host/My App");
	});

	it("falls back to the slug when no display name is given", () => {
		process.env[ENV_KEY] = "https://host/${NAME}";
		expect(resolveDefaultGitRemote("my-app")).toBe("https://host/my-app");
	});
});

describe("detectGitRemote", () => {
	it("detects remote for non-git dir as false", () => {
		expect(detectGitRemote("/tmp").hasUpstreamRepo).toBe(false);
	});

	it("returns false for a hermetic temp dir without git", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-gitremote-"));
		try {
			expect(detectGitRemote(dir)).toEqual({ hasUpstreamRepo: false, repoUrl: null });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns false for missing input", () => {
		expect(detectGitRemote()).toEqual({ hasUpstreamRepo: false, repoUrl: null });
		expect(detectGitRemote(42)).toEqual({ hasUpstreamRepo: false, repoUrl: null });
	});
});
