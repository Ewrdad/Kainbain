import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { browserInstallTargets, installSteps, npxExecutable, playwrightAttempts } = await import("../scripts/setup.mjs");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: setup tests
 * @description Hermetic tests for the setup plan (scripts/setup.mjs): the
 *   install order and the per-OS Playwright flags. The installs themselves
 *   are exercised by the real `npm run setup`, not here.
 * @example run `node --test tests/setup.test.mjs`
 ***/

describe("installSteps", () => {
	it("installs root, api, frontend, then canary-e2e in order", () => {
		const steps = installSteps();
		assert.deepEqual(
			steps.map((step) => step.name),
			["root dependencies", "api dependencies", "frontend dependencies", "canary-e2e dependencies"],
		);
		for (const step of steps) {
			assert.equal(typeof step.dir, "string");
		}
	});
});

describe("installSteps npmrc", () => {
	it("every install dir resolves legacy-peer-deps the way npm actually reads it", () => {
		// npm reads the flag from <install-dir>/.npmrc only — the root
		// .npmrc does NOT apply to `npm install` runs in frontend/ or api/
		// (proven by the 2026-10-21 gate failure: ERESOLVE on
		// eslint-plugin-jsx-a11y vs eslint 10 left frontend/node_modules
		// without vitest/eslint/vite, failing four gate branches). Each
		// install dir therefore needs its own .npmrc carrying the flag,
		// mirroring what the Dockerfile COPYs into the image build.
		const steps = installSteps();
		assert.ok(steps.length > 0);
		for (const step of steps) {
			const npmrcPath = path.join(step.dir, ".npmrc");
			assert.ok(
				fs.existsSync(npmrcPath),
				`${step.name}: missing ${npmrcPath} (npm ignores the root .npmrc here)`,
			);
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from installSteps() in this repo
			const content = fs.readFileSync(npmrcPath, "utf8");
			assert.match(
				content,
				/^\s*legacy-peer-deps\s*=\s*true\s*$/m,
				`${step.name}: ${npmrcPath} must set legacy-peer-deps=true`,
			);
		}
	});

	it("root .npmrc documents the per-dir mirrors", () => {
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed repo path
		const content = fs.readFileSync(path.join(REPO_ROOT, ".npmrc"), "utf8");
		assert.match(content, /legacy-peer-deps\s*=\s*true/);
		assert.match(content, /frontend\/\.npmrc/);
	});
});

describe("playwrightAttempts", () => {
	it("tries system deps first on linux, then the browser alone", () => {
		const attempts = playwrightAttempts("linux");
		assert.equal(attempts.length, 2);
		assert.deepEqual(attempts[0], ["playwright", "install", "--with-deps", "chromium"]);
		assert.deepEqual(attempts[1], ["playwright", "install", "chromium"]);
	});

	it("installs the browser alone on macOS and Windows", () => {
		for (const platform of ["darwin", "win32"]) {
			assert.deepEqual(playwrightAttempts(platform), [["playwright", "install", "chromium"]]);
		}
	});
});

describe("npxExecutable", () => {
	it("uses npx.cmd on Windows, npx elsewhere", () => {
		assert.equal(npxExecutable("win32"), "npx.cmd");
		assert.equal(npxExecutable("linux"), "npx");
		assert.equal(npxExecutable("darwin"), "npx");
	});
});

describe("browserInstallTargets", () => {
	it("installs the root browser first, then the canary-e2e browser", () => {
		// `npm test` runs the canary suite by default and its pinned
		// @playwright/test needs a different Chromium build than the root
		// tooling, so a fresh clone must install both (the #KB-0417 parity fix).
		const targets = browserInstallTargets("linux");
		assert.deepEqual(
			targets.map((target) => target.name),
			["Playwright Chromium", "canary-e2e Playwright Chromium"],
		);
		assert.equal(typeof targets[0].dir, "string");
		assert.match(targets[1].dir, /canary-e2e$/);
	});

	it("keeps Linux --with-deps on the root target and browser-only on canary", () => {
		const [root, canary] = browserInstallTargets("linux");
		assert.deepEqual(root.attempts, playwrightAttempts("linux"));
		assert.deepEqual(canary.attempts, [["playwright", "install", "chromium"]]);
	});

	it("installs the browser alone for every target on macOS and Windows", () => {
		for (const platform of ["darwin", "win32"]) {
			for (const target of browserInstallTargets(platform)) {
				assert.deepEqual(target.attempts, [["playwright", "install", "chromium"]]);
			}
		}
	});
});
