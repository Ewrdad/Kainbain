/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config/index.js";

/***
 * MARK: test-residue guard
 * @description Fails when test runs leave residue in the live projects root
 *   or the live SilverBullet notes space. Past suites POSTed throwaway
 *   projects (and tasks/sessions into project[0]) against the live roots,
 *   accumulating ~31 scaffold dirs in `~/projects` and ~35k fixture notes;
 *   DELETE /projects only drops the in-memory entry, so every leak is
 *   permanent until cleaned by hand (see task 99eef182 cleanup report).
 *   All producing suites now run under mkdtemp roots; this guard is the
 *   backstop. Skips (never fails) where the live layout is absent (CI).
 * @example npm run test --prefix api -- testResidue.guard
 */

// Names ever produced by test suites against the live roots (scaffold slugs
// in ~/projects plus engine-run scratch projects). KEEP projects
// (kainbain, Ewrdad.github.io, fantasy-forest-planner, simple-calculator,
// custom-skills) never match — locked by the unit tests below.
//
// Deliberately NOT matched: the product seed names `project-a..d` /
// `Project A..D`. `prepareProjects` (api/house/projectStartup.js) recreates
// them on every live boot by design — they are product-managed sample
// projects, not test residue (cleanup task 99eef182 finding). Flagging them
// would keep this guard permanently red.
//
// 2026-10-06: the live instances (dirs + paired notes) were deleted on
// review instruction for the same task. Deletion is not sticky across live
// boots: `prepareProjects` still re-seeds them, so this guard must keep
// ignoring the names. To make the removal sticky, `prepareProjects` would
// need a product change (seed removal/gating) — flagged as follow-up.
const TEST_NAME_PATTERN =
	/-app$|^to-be-deleted$|^aaaaa$|fixture|harness|retry|alias|cross-source|cross-target|validation-scratch|smoke|repro|dry-?run|sandbox|scratcher|custom-command|concurrency|provisioned|workflow-route|bogus|po[ck][ -]|deep-?review|debug-exec|alignment-probe|pill-review|task-images|files-test|^project$|^test|wp6probe/i;

// Real-content markers: a dir carrying any of these is a genuine project,
// never test scaffolding, regardless of git state.
const REAL_CONTENT_MARKERS = new Set([
	"package.json",
	"index.html",
	"server.mjs",
	"src",
	"frontend",
	"api",
	"node_modules",
	"README.md",
]);

/***
 * MARK: isFixtureNoteName
 * @description True for notes-dir entries produced by test suites.
 * @example isFixtureNoteName("Review Fixture 1790007694887-0") => true
 */
export function isFixtureNoteName(name) {
	return /^(Review|Advance) Fixture /.test(name);
}

/***
 * MARK: isTestScaffoldDir
 * @description True for a ~/projects child matching the test-scaffold
 *   fingerprint: a test-producer name, a `.kainbain/project.json` marker,
 *   no real-content files, and no git history (missing repo or zero commits).
 * @example isTestScaffoldDir("/home/server/projects/harness-patch-app") => true
 */
export function isTestScaffoldDir(dir) {
	let entries;
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return false;
	}
	if (!TEST_NAME_PATTERN.test(path.basename(dir))) return false;
	if (!entries.includes(".kainbain")) return false;
	try {
		fs.statSync(path.join(dir, ".kainbain", "project.json"));
	} catch {
		return false;
	}
	if (entries.some((entry) => REAL_CONTENT_MARKERS.has(entry))) return false;
	if (!entries.includes(".git")) return true;
	// Zero commits <=> no refs yet. `git show-ref` exits 1 with empty output
	// for an empty repo, 0 once anything (commit, tag) exists, and 128 on a
	// broken repo (never flagged — fail closed toward KEEP).
	const refs = spawnSync("git", ["show-ref"], {
		cwd: dir,
		encoding: "utf8",
	});
	if (refs.status === 0) return false;
	return refs.status === 1;
}

// Live roots come from a clean-env load, NOT the ambient config: the global
// test setup (`testSetup.isolation.js`) deliberately points the ambient
// config at throwaway temp roots, so reading them here would scan temp and
// this guard would go blind (2026-10-06).
const liveDefaults = loadConfig({}).config;
const liveProjectsRoot = liveDefaults.projectsRoot;
const liveNotesRoot = liveDefaults.notesSpaceRoot;
const liveLayoutAvailable =
	fs.existsSync(liveProjectsRoot) && fs.existsSync(liveNotesRoot);

describe("test-residue detectors (hermetic)", () => {
	const scratchDirs = [];
	function makeDir() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-residue-guard-"));
		scratchDirs.push(dir);
		return dir;
	}
	afterAll(() => {
		for (const dir of scratchDirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// ignore cleanup errors
			}
		}
	});

	it("flags fixture note names, nothing else", () => {
		expect(isFixtureNoteName("Review Fixture 1790007694887-0")).toBe(true);
		expect(isFixtureNoteName("Advance Fixture 1790007694887-0")).toBe(true);
		for (const keep of [
			"KainBain",
			"Simple Calculator",
			"Fantasy Forest Day Planner",
			"HowToSolveEverything",
			"SUMMARY.md",
			"TraingGame",
			"TraingGame.md",
			"Project A",
			"Project D",
		]) {
			expect(isFixtureNoteName(keep)).toBe(false);
		}
	});

	it("flags a git-less scaffold fingerprint", () => {
		const dir = path.join(makeDir(), "harness-patch-app");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
		fs.mkdirSync(path.join(dir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".kainbain", "project.json"),
			'{"id":"x"}',
		);
		expect(isTestScaffoldDir(dir)).toBe(true);
	});

	it("flags a zero-commit git scaffold", () => {
		const dir = path.join(makeDir(), "retry-patch-app");
		fs.mkdirSync(dir, { recursive: true });
		fs.mkdirSync(path.join(dir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".kainbain", "project.json"),
			'{"id":"x"}',
		);
		const init = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
		if (init.status !== 0) return;
		// Fresh `git init` with no commits is the scaffold state.
		expect(isTestScaffoldDir(dir)).toBe(true);
	});

	it("never flags real projects", () => {
		for (const name of [
			"kainbain",
			"Ewrdad.github.io",
			"fantasy-forest-planner",
			"simple-calculator",
			"custom-skills",
			// Product seed names: managed by prepareProjects, not residue.
			"project-a",
			"project-d",
		]) {
			const dir = path.join(makeDir(), name);
			fs.mkdirSync(dir, { recursive: true });
			fs.mkdirSync(path.join(dir, ".kainbain"), { recursive: true });
			fs.writeFileSync(
				path.join(dir, ".kainbain", "project.json"),
				'{"id":"x"}',
			);
			// Even with a bare scaffold shape, a non-test name is KEEP.
			expect(isTestScaffoldDir(dir)).toBe(false);
		}
		// Real-content markers defeat the fingerprint even on a test-like name.
		const dir = path.join(makeDir(), "provisioned-app");
		fs.mkdirSync(dir, { recursive: true });
		fs.mkdirSync(path.join(dir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".kainbain", "project.json"),
			'{"id":"x"}',
		);
		fs.writeFileSync(path.join(dir, "package.json"), "{}");
		expect(isTestScaffoldDir(dir)).toBe(false);
		// Git history defeats the fingerprint even on a test-like bare name.
		const committed = path.join(makeDir(), "harness-patch-app");
		fs.mkdirSync(committed, { recursive: true });
		fs.mkdirSync(path.join(committed, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(committed, ".kainbain", "project.json"),
			'{"id":"x"}',
		);
		if (
			spawnSync("git", ["init"], { cwd: committed, encoding: "utf8" })
				.status === 0
		) {
			spawnSync(
				"git",
				[
					"-c",
					"user.email=t@t",
					"-c",
					"user.name=t",
					"commit",
					"--allow-empty",
					"-m",
					"seed",
				],
				{ cwd: committed, encoding: "utf8" },
			);
			expect(isTestScaffoldDir(committed)).toBe(false);
		}
	});
});

describe.skipIf(!liveLayoutAvailable)("live roots residue guard", () => {
	it("~/projects holds no test scaffolds", () => {
		const found = fs
			.readdirSync(liveProjectsRoot)
			.filter((entry) => {
				try {
					return (
						fs.statSync(path.join(liveProjectsRoot, entry)).isDirectory() &&
						isTestScaffoldDir(path.join(liveProjectsRoot, entry))
					);
				} catch {
					return false;
				}
			});
		expect(found).toEqual([]);
	});

	it("notes space holds no fixture entries", () => {
		const found = fs
			.readdirSync(liveNotesRoot)
			.filter((entry) => isFixtureNoteName(entry));
		expect(found).toEqual([]);
	});
});

describe("app-booting suites isolate their roots (hermetic)", () => {
	/***
	 * MARK: app-boot isolation meta-guard
	 * @description Statically scans every api test file and fails when a file
	 *   imports the app (the module that boots `prepareProjects` at import
	 *   time) without first installing isolated roots, i.e. without importing
	 *   ./isolatedTestRoots.js or setting process.env.PROJECTS_ROOT — the
	 *   convention documented in api/docs/testing-with-temporary-roots.md.
	 *   This closes the blind spot of the scaffold detector above, which must
	 *   ignore the product seed names an unisolated boot would re-seed.
	 *   Reads only api sources: runs hermetically everywhere, including CI.
	 * @example npx vitest run testResidue.guard.test.js --prefix api
	 ***/
	it("every test file importing the app isolates its roots first", () => {
		const apiDir = path.dirname(fileURLToPath(import.meta.url));
		const appEntry = path.join(apiDir, "index.js");
		const violations = [];

		function importSpecAt(line) {
			const match = line.match(
				/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/,
			);
			return match ? match[1] : null;
		}

		function check(file) {
			const lines = fs.readFileSync(file, "utf8").split("\n");
			const dir = path.dirname(file);
			let appImportLine = null;
			let isolationLine = null;
			for (let index = 0; index < lines.length; index++) {
				const spec = importSpecAt(lines[index]);
				if (spec) {
					const isRelative = spec.startsWith("./") || spec.startsWith("../");
					if (isRelative) {
						const target = path.resolve(dir, spec);
						if (path.resolve(target) === appEntry && appImportLine === null) {
							appImportLine = index;
						}
						if (
							target.includes("isolatedTestRoots") &&
							isolationLine === null
						) {
							isolationLine = index;
						}
					}
				}
				if (
					/process\.env\.PROJECTS_ROOT\s*=/.test(lines[index]) &&
					isolationLine === null
				) {
					isolationLine = index;
				}
			}
			if (
				appImportLine !== null &&
				(isolationLine === null || isolationLine > appImportLine)
			) {
				violations.push(
					`${path.relative(apiDir, file)} imports the app (line ${appImportLine + 1}) without isolated roots installed first — import ./isolatedTestRoots.js first or set process.env.PROJECTS_ROOT/NOTES_SPACE_ROOT before the app import (see api/docs/testing-with-temporary-roots.md)`,
				);
			}
		}

		(function walk(dir) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.name === "node_modules") continue;
				const entryPath = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(entryPath);
				else if (entry.name.endsWith(".test.js")) check(entryPath);
			}
		})(apiDir);

		expect(violations).toEqual([]);
	});
});
