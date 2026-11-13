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

// Paths served on the public ad-site (https://kainbain.ewrdad.uk) rather than
// baked into backend/frontend/runner images. Changing one never requires an
// image republish — it only needs `bash scripts/sync-adsite.sh` (the ad-site
// sync stages these files into the site's public/ folder and S3). They are
// carved out of componentsForPath below (which would otherwise flag them via
// the deploy/ prefix or the fail-safe catch-all) so an ad-site-only change
// publishes nothing and the site sync handles it on its own.
const ADSITE_ONLY = new Set([
	"deploy/install.sh",
	"deploy/install-runner.sh",
	"deploy/update.sh",
	"deploy/redeploy.sh",
	"scripts/sync-adsite.sh",
]);

/***
 * MARK: adsiteForPath
 * @description Whether a repo-relative path is served on the public ad-site
 *   and therefore needs `bash scripts/sync-adsite.sh` (S3 upload) rather
 *   than a backend/frontend/runner republish.
 * @param {string} p - Repo-relative changed path.
 * @returns {boolean} True when the path feeds the ad-site sync.
 ***/
export function adsiteForPath(p) {
	const file = String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
	if (!file) return false;
	if (file === "kainbain-addsite/Kainbain-adsite" || file.startsWith("kainbain-addsite/")) return true;
	if (ADSITE_ONLY.has(file)) return true;
	return false;
}

/***
 * MARK: detectAdsiteSync
 * @description Pure detection for the ad-site sync over a path list.
 * @param {Array<string>} files - Changed paths.
 * @returns {Object} `{ sync, reasons }` (reasons is the matching path list).
 ***/
export function detectAdsiteSync(files) {
	const reasons = [];
	for (const file of files) {
		const clean = String(file || "").trim();
		if (!clean) continue;
		if (adsiteForPath(clean)) reasons.push(clean);
	}
	return { sync: reasons.length > 0, reasons };
}

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
	// Ad-site-only paths (site bundle + install scripts served on S3) never
	// need an image republish — the ad-site sync ships them on its own.
	if (ADSITE_ONLY.has(file)) return [];
	if (file === "kainbain-addsite/Kainbain-adsite" || file.startsWith("kainbain-addsite/")) return [];
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
		file === "scripts/package-runner.mjs" ||
		file === "scripts/generate-runner-manifest.mjs" ||
		file === "scripts/migrate-runner-to-wrapper.sh" ||
		file === "scripts/install-local-runner.sh" ||
		file === "scripts/lib/runner-install-root.sh"
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
