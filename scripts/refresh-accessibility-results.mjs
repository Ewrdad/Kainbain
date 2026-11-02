#!/usr/bin/env node
/***
 * MARK: refresh-accessibility-results.mjs
 * @description Manual refresh for the accessibility statement's results
 *   artifact (`api/accessibility-results.json`): validates the file against
 *   the shared schema (any warning fails the run, so drift breaks here and
 *   not on the statement page) and re-stamps `generatedAt` + `appVersion`.
 *   Run after each re-audit or minor release (see the review cadence in
 *   `docs/tasks/4bda7321-3aef-4ca9-b746-42b8c6969630/a11y-mapping.md`).
 *   Automating the producer (emitting the artifact from the gate run) is
 *   recorded follow-up work.
 * @example node scripts/refresh-accessibility-results.mjs
 * @example node scripts/refresh-accessibility-results.mjs --check
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseResultsArtifact } from "../shared/accessibilityStatement.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "api", "accessibility-results.json");
const API_VERSION_PATH = path.join(REPO_ROOT, "api", "version.json");

const checkOnly = process.argv.includes("--check");

function fail(message) {
	console.error(`refresh-accessibility-results: ${message}`);
	process.exit(1);
}

let raw;
try {
	raw = fs.readFileSync(ARTIFACT_PATH, "utf8");
} catch (err) {
	fail(`cannot read ${ARTIFACT_PATH}: ${err.message}`);
}

let parsed;
try {
	parsed = JSON.parse(raw);
} catch (err) {
	fail(`artifact is not valid JSON: ${err.message}`);
}

const { warnings } = parseResultsArtifact(parsed);
if (warnings.length > 0) {
	fail(`artifact failed validation:\n- ${warnings.join("\n- ")}`);
}

if (checkOnly) {
	console.log("accessibility-results.json is valid.");
	process.exit(0);
}

let appVersion = "1.0.0";
try {
	const versionFile = JSON.parse(fs.readFileSync(API_VERSION_PATH, "utf8"));
	if (typeof versionFile?.apiVersion === "string" && versionFile.apiVersion.trim() !== "") {
		appVersion = versionFile.apiVersion.trim();
	}
} catch {
	// Keep the default: a missing version file must not block a re-stamp.
}

parsed.generatedAt = new Date().toISOString();
parsed.appVersion = appVersion;
fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Stamped ${ARTIFACT_PATH} at ${parsed.generatedAt} (app ${appVersion}).`);
