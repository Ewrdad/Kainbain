/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { loadConfig } from "./config/index.js";
import { resolvePromptLayoutDir } from "./promptLayout/layoutStore.js";

/***
 * MARK: test-isolation guard
 * @description Fails when the api suite is pointed at the live projects root
 *   or notes space instead of throwaway roots. `api/vitest.config.js`
 *   installs `testSetup.isolation.js` as a setup file so every worker mints
 *   per-file temp roots before any test import evaluates; these assertions
 *   prove that wiring held (ordering included: the config snapshot must see
 *   the setup env, not ambient live paths).
 *
 *   Regression coverage for the 2026-10-06 incident, where suites without
 *   per-file isolation POSTed ~44 fixture tasks into the live
 *   Ewrdad.github.io project (first in `~/projects` directory order) even
 *   though the operator never used that project.
 * @example npm run test --prefix api -- testIsolation.guard
 */
describe("test isolation guard (never touch live systems)", () => {
	const projectsRoot = process.env.PROJECTS_ROOT;
	const notesSpaceRoot = process.env.NOTES_SPACE_ROOT;
	const liveDefaults = loadConfig({}).config;

	it("points PROJECTS_ROOT at a temp dir that exists", () => {
		expect(projectsRoot).toBeTruthy();
		expect(projectsRoot.startsWith(os.tmpdir())).toBe(true);
		expect(fs.existsSync(projectsRoot)).toBe(true);
		expect(fs.statSync(projectsRoot).isDirectory()).toBe(true);
	});

	it("points NOTES_SPACE_ROOT at a temp dir that exists", () => {
		expect(notesSpaceRoot).toBeTruthy();
		expect(notesSpaceRoot.startsWith(os.tmpdir())).toBe(true);
		expect(fs.existsSync(notesSpaceRoot)).toBe(true);
		expect(fs.statSync(notesSpaceRoot).isDirectory()).toBe(true);
	});

	it("snapshotted the setup roots, not ambient live paths", () => {
		expect(config.projectsRoot).toBe(projectsRoot);
		expect(config.notesSpaceRoot).toBe(notesSpaceRoot);
	});

	it("is nowhere near the live default layout", () => {
		expect(projectsRoot).not.toBe(liveDefaults.projectsRoot);
		expect(notesSpaceRoot).not.toBe(liveDefaults.notesSpaceRoot);
	});

	// Regression coverage for the 2026-10-12 ambient-env leak (task
	// 2e6a3521): the LIVE `~/.kainbain/prompt-layout/prompt-layout.json`
	// omitted `{{reporting}}`, so any suite that read the machine-global
	// layout dropped the reporting section and failed while CI stayed green.
	it("points KAINBAIN_PROMPT_LAYOUT_DIR at a temp dir that exists", () => {
		const layoutDir = process.env.KAINBAIN_PROMPT_LAYOUT_DIR;
		expect(layoutDir).toBeTruthy();
		expect(layoutDir.startsWith(os.tmpdir())).toBe(true);
		expect(fs.existsSync(layoutDir)).toBe(true);
		expect(fs.statSync(layoutDir).isDirectory()).toBe(true);
	});

	it("resolves the prompt layout from the temp dir, never the live ~/.kainbain one", () => {
		const liveLayoutDir = path.join(os.homedir(), ".kainbain", "prompt-layout");
		expect(resolvePromptLayoutDir()).toBe(
			process.env.KAINBAIN_PROMPT_LAYOUT_DIR,
		);
		expect(resolvePromptLayoutDir()).not.toBe(liveLayoutDir);
		expect(resolvePromptLayoutDir().startsWith(os.tmpdir())).toBe(true);
	});

	// Regression coverage for the 2026-11 inbox leak (residual D9 of
	// 99ccc12f, task b3dec9b0): the accessibility-feedback inbox is
	// machine-global by default
	// (`~/.kainbain/accessibility-feedback.jsonl`, outside
	// `~/.kainbain/engine/`, so the engine guard is a no-op for it), and
	// any suite booting the full app without a `feedbackFile` opt
	// appended test reports to the LIVE user inbox. The setup backstop
	// pins it at a per-file temp file before config loads.
	it("points KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE at a temp inbox file", () => {
		const inboxFile = process.env.KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE;
		expect(inboxFile).toBeTruthy();
		expect(inboxFile.startsWith(os.tmpdir())).toBe(true);
		expect(path.basename(inboxFile)).toBe("accessibility-feedback.jsonl");
		expect(fs.existsSync(path.dirname(inboxFile))).toBe(true);
		expect(fs.statSync(path.dirname(inboxFile)).isDirectory()).toBe(true);
		expect(inboxFile).not.toBe(
			path.join(os.homedir(), ".kainbain", "accessibility-feedback.jsonl"),
		);
	});

	it("snapshotted the setup inbox pin, not the live default", () => {
		expect(config.accessibilityFeedbackFile).toBe(
			process.env.KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE,
		);
		expect(config.accessibilityFeedbackFile).not.toBe(
			liveDefaults.accessibilityFeedbackFile,
		);
	});
});
