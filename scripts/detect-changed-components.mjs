#!/usr/bin/env node
/***
 * MARK: detect-changed-components
 * @description Path-table change detection over `git diff` (AsymmetricUpdatesPlan
 *   WP-A3, DA4): maps changed paths to the backend/frontend/runner components
 *   that must be republished. Unknown code paths flag all three (fail safe).
 * @example node scripts/detect-changed-components.mjs --base HEAD~1 --json
 * @example node scripts/detect-changed-components.mjs --files changed.txt
 ***/

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const ALL = ["backend", "frontend", "runner"];
const RELEASE_MACHINERY = new Set([
	"docker-compose.yml",
	"docker-compose.prod.yml",
	"publish.sh",
	"deploy.sh",
	"scripts/detect-changed-components.mjs",
	"scripts/check-component-compat.mjs",
]);

/***
 * MARK: componentsForPath
 * @description First matching row wins (paths are repo-relative, forward
 *   slashes). Rule stated exactly as: matched doc/test-only paths flag
 *   nothing; unmatched non-doc paths flag all three.
 * @param {string} p - Repo-relative changed path.
 * @returns {Array<string>} Components flagged by this path.
 ***/
export function componentsForPath(p) {
	const file = String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
	if (!file) return [];
	if (file.startsWith("shared/")) return [...ALL];
	if (file.startsWith("api/agent/")) return ["backend", "runner"];
	if (file === "api/version.json") return ["backend"];
	if (file.startsWith("api/")) return ["backend"];
	if (file === "frontend/version.json") return ["frontend"];
	if (file === "frontend/Dockerfile" || file === "frontend/nginx.conf") return ["frontend"];
	if (file.startsWith("frontend/")) return ["frontend"];
	if (file === "runner/version.json") return ["runner"];
	if (
		file.startsWith("runner/") ||
		file === "startRunner.sh" ||
		file === "scripts/package-runner.sh" ||
		file === "scripts/install-local-runner.sh"
	)
		return ["runner"];
	if (file === "Dockerfile" || file === "docker-entrypoint.sh") return ["backend"];
	if (
		RELEASE_MACHINERY.has(file) ||
		file.startsWith("deploy/") ||
		file.startsWith("scripts/publish")
	)
		return [...ALL];
	// Matched doc/test-only paths flag nothing.
	if (file.endsWith(".md") || file.startsWith("docs/") || file.startsWith("canary-e2e/")) return [];
	if (/(^|\/)(tests?|__tests__)\//.test(file) || /\.test\.[^.]+$/.test(file) || /\.spec\.[^.]+$/.test(file)) return [];
	// Unmatched non-doc paths flag all three.
	return [...ALL];
}

/***
 * MARK: detectFromFiles
 * @description Pure detection over a newline-separated path list.
 * @param {Array<string>} files - Changed paths.
 * @returns {Object} `{ components, reasons }` (components sorted backend, frontend, runner order).
 ***/
export function detectFromFiles(files) {
	const reasons = { backend: [], frontend: [], runner: [] };
	for (const file of files) {
		const clean = String(file || "").trim();
		if (!clean) continue;
		for (const c of componentsForPath(clean)) reasons[c].push(clean);
	}
	return { components: ALL.filter((c) => reasons[c].length > 0), reasons };
}

/***
 * MARK: parseOverride
 * @description Parses KAINBAIN_PUBLISH_COMPONENTS (`all`/`none`/csv).
 * @param {string} value - Raw env value.
 * @returns {Array<string>|null} Component list, or null when unset.
 ***/
export function parseOverride(value) {
	if (typeof value !== "string" || !value.trim()) return null;
	const v = value.trim().toLowerCase();
	if (v === "all") return [...ALL];
	if (v === "none") return [];
	return v.split(",").map((s) => s.trim()).filter((s) => ALL.includes(s));
}

function defaultBase() {
	try {
		const raw = fs.readFileSync(path.join(REPO_ROOT, "dist", "release-manifest.json"), "utf8");
		const commit = JSON.parse(raw)?.commit;
		if (typeof commit === "string" && commit) return commit;
	} catch { /* fall through */ }
	return "HEAD~1";
}

function gitChangedFiles(base, head) {
	const out = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});
	return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function parseArgs(argv) {
	const args = { base: null, head: "HEAD", files: null, json: false };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--base") args.base = argv[++i];
		else if (argv[i] === "--head") args.head = argv[++i];
		else if (argv[i] === "--files") args.files = argv[++i];
		else if (argv[i] === "--json") args.json = true;
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	return args;
}

const isMain =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	try {
		const args = parseArgs(process.argv.slice(2));
		const override = parseOverride(process.env.KAINBAIN_PUBLISH_COMPONENTS);
		let result;
		if (override) {
			console.error(`override: KAINBAIN_PUBLISH_COMPONENTS=${process.env.KAINBAIN_PUBLISH_COMPONENTS}`);
			result = {
				components: override,
				reasons: Object.fromEntries(override.map((c) => [c, ["(override)"]])),
			};
		} else {
			const files = args.files
				? fs.readFileSync(path.resolve(args.files), "utf8").split("\n")
				: gitChangedFiles(args.base || defaultBase(), args.head);
			result = detectFromFiles(files);
		}
		if (args.json) {
			console.log(JSON.stringify(result));
		} else if (result.components.length === 0) {
			console.log("no components changed");
		} else {
			for (const c of result.components) {
				console.log(`${c}: changed (${result.reasons[c].join(", ")})`);
			}
		}
		process.exit(0);
	} catch (err) {
		console.error(`detect-changed-components: ${err.message}`);
		process.exit(0);
	}
}
