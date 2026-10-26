import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PromptCurationEngine } from "./promptCuration.js";
import { updatePromptLayout, getPromptLayoutState } from "./promptLayout/layoutStore.js";

describe("PromptCurationEngine layout integration", () => {
	let tempDir;
	let loggedEvents;
	let testLogger;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-prompt-curation-layout-test-"));
		loggedEvents = [];
		testLogger = {
			info: (data, msg) => loggedEvents.push({ level: "info", data, msg }),
			warn: (data, msg) => loggedEvents.push({ level: "warn", data, msg }),
		};
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const TASK = {
		id: "task-100",
		goal: "Build widget for {{project}}",
		project: "Acme",
	};

	const STAGE = {
		id: "stage-1",
		name: "Code",
		type: "agent",
		prompt: "Write code for {{taskGoal}}.",
	};

	it("renders custom layout omitting optional chaff", () => {
		const customLayout = "# My Stage\n{{stage}}\n\n# Goal\n{{task}}\n\n{{failureGuidance}}";
		updatePromptLayout({ dir: tempDir, layout: customLayout });

		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			logger: testLogger,
			loadSkill: () => null,
		});

		const prompt = engine.curatePrompt(TASK, STAGE, {
			previousReports: ["./docs/tasks/task-100/idea.md"],
			taskImages: ["assets/test.png"],
		});

		// Custom order: Stage first, then Task, then failureGuidance
		expect(prompt).toContain(
			"# My Stage\n# Stage\nWrite code for Build widget for {{project}}.",
		);
		expect(prompt).toContain("# Goal\n# Task\nBuild widget for Acme");
		expect(prompt).toContain("# Stage Failure Guidance");

		// Chaff omitted
		expect(prompt).not.toContain("# Previous Reports");
		expect(prompt).not.toContain("# Task Images");

		expect(loggedEvents.some((e) => e.level === "info" && e.msg.includes("Custom prompt layout active"))).toBe(true);
	});

	it("auto-reinjects omitted failureDetails when failure context exists", () => {
		const customLayout = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		updatePromptLayout({ dir: tempDir, layout: customLayout });

		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			logger: testLogger,
			loadSkill: () => null,
		});

		const prompt = engine.curatePrompt(TASK, STAGE, {
			failureDetails: "SyntaxError in index.js",
		});

		// failureDetails was omitted from customLayout, but auto-reinjected at bottom
		expect(prompt).toContain("# Failure Details\nSyntaxError in index.js");
		expect(
			loggedEvents.some(
				(e) =>
					e.level === "warn" &&
					e.data?.autoReinjected?.includes("failureDetails"),
			),
		).toBe(true);
	});

	it("auto-reinjects testingGuidance when stage expects verdict and token is omitted", () => {
		const customLayout = "{{task}}\n\n{{stage}}\n\n{{failureGuidance}}";
		updatePromptLayout({ dir: tempDir, layout: customLayout });

		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			logger: testLogger,
			loadSkill: () => null,
		});

		// STAGE is type: "agent" which expects verdict
		const prompt = engine.curatePrompt(TASK, STAGE);
		expect(prompt).toContain("# Testing & Verification Guidance");
		expect(
			loggedEvents.some(
				(e) =>
					e.level === "warn" &&
					e.data?.autoReinjected?.includes("testingGuidance"),
			),
		).toBe(true);
	});

	it("falls back to default layout when mandatory token is missing at render time", () => {
		// Directly pass an invalid layout bypassing store validation
		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			logger: testLogger,
			loadSkill: () => null,
		});

		const prompt = engine.curatePrompt(TASK, STAGE, {
			promptLayout: "{{task}}\n\n{{stage}}", // missing failureGuidance
		});

		// Must fall back to default layout (which has failureGuidance)
		expect(prompt).toContain("# Stage Failure Guidance");
		expect(
			loggedEvents.some(
				(e) =>
					e.level === "warn" &&
					e.msg.includes("fallback to default") &&
					e.data?.missingTokens?.includes("failureGuidance"),
			),
		).toBe(true);

		const state = getPromptLayoutState({ dir: tempDir });
		expect(state.consecutiveFallbacks).toBe(1);
	});

	it("survives an unwritable layout state dir without breaking dispatch", () => {
		// A regular file where the state dir should be makes every health
		// counter write fail — dispatch must still serve the default
		// contract prompt instead of throwing (operational fail-safe).
		const filePath = path.join(tempDir, "not-a-dir");
		fs.writeFileSync(filePath, "x");
		const engine = new PromptCurationEngine({
			promptLayoutDir: filePath,
			logger: testLogger,
			loadSkill: () => null,
		});

		let prompt;
		expect(() => {
			prompt = engine.curatePrompt(TASK, STAGE, {
				promptLayout: "{{task}}\n\n{{stage}}", // missing failureGuidance
			});
		}).not.toThrow();
		expect(prompt).toContain("# Task");
		expect(prompt).toContain("# Stage Failure Guidance");
	});

	it("per-task safe-mode (useDefaultLayout: true) bypasses custom layout", () => {
		const customLayout = "# Custom\n{{stage}}\n\n{{task}}\n\n{{failureGuidance}}";
		updatePromptLayout({ dir: tempDir, layout: customLayout });

		const engine = new PromptCurationEngine({
			promptLayoutDir: tempDir,
			logger: testLogger,
			loadSkill: () => null,
		});

		const prompt = engine.curatePrompt(TASK, STAGE, {
			useDefaultLayout: true,
		});

		// Default layout has Task first, not # Custom
		expect(prompt).not.toContain("# Custom");
		expect(prompt.startsWith("# Task")).toBe(true);
	});
});
