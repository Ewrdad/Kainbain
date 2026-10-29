#!/usr/bin/env node
/***
 * MARK: check-component-compat
 * @description Publish/deploy-time compatibility gate for the three
 *   independently versioned components (AsymmetricUpdatesPlan WP-A2, DA3).
 *   Loads api/version.json, frontend/version.json and runner/version.json
 *   (or a recorded release manifest with --manifest) and fails when any
 *   consumer range does not satisfy the provider apiVersion.
 * @example node scripts/check-component-compat.mjs
 * @example node scripts/check-component-compat.mjs --manifest dist/release-manifest.json
 ***/

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const requireFromApi = createRequire(path.join(REPO_ROOT, "api", "package.json"));
const semver = requireFromApi("semver");

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		throw new Error(`cannot read ${file}: ${err.message}`);
	}
}

/***
 * MARK: versionsFromManifest
 * @description Rebuilds the three component version records from a recorded
 *   release manifest (WP-A5 shape). Consumer ranges come from the recorded
 *   `requiresBackendApi`; backend `accepts` is not recorded in a manifest, so
 *   manifest mode checks consumer->backend pairs only.
 * @param {Object} manifest - Parsed release-manifest.json.
 * @returns {Object} `{ backend, frontend, runner }` version records.
 ***/
export function versionsFromManifest(manifest) {
	const c = manifest?.components || {};
	return {
		backend: { component: "backend", apiVersion: c.backend?.apiVersion },
		frontend: {
			component: "frontend",
			apiVersion: c.frontend?.apiVersion,
			requires: { backendApi: c.frontend?.requiresBackendApi },
		},
		runner: {
			component: "runner",
			apiVersion: c.runner?.apiVersion,
			requires: { backendApi: c.runner?.requiresBackendApi },
		},
	};
}

/***
 * MARK: checkCompatibility
 * @description Pure compatibility check over three version records.
 * @param {Object} versions - `{ backend, frontend, runner }` records.
 * @param {Object} [opts] - `{ manifestMode }`: skip backend accepts pairs.
 * @returns {Object} `{ ok, lines, failures }` output lines per pair.
 ***/
export function checkCompatibility(versions, { manifestMode = false } = {}) {
	const lines = [];
	const failures = [];
	const entries = [
		["backend", versions.backend],
		["frontend", versions.frontend],
		["runner", versions.runner],
	];
	for (const [name, rec] of entries) {
		if (!rec || !semver.valid(rec.apiVersion)) {
			failures.push(
				`INVALID ${name}: apiVersion ${JSON.stringify(rec?.apiVersion)} in ${name}/version.json is not strict major.minor.patch`,
			);
		}
	}
	if (failures.length > 0) return { ok: false, lines, failures };

	const pairs = [
		["frontend->backend", "frontend", versions.frontend.requires?.backendApi, versions.backend.apiVersion],
		["runner->backend", "runner", versions.runner.requires?.backendApi, versions.backend.apiVersion],
	];
	if (!manifestMode) {
		pairs.push(
			["backend-accepts-frontend", "backend accepts frontend", versions.backend.accepts?.frontend, versions.frontend.apiVersion, "frontend"],
			["backend-accepts-runner", "backend accepts runner", versions.backend.accepts?.runner, versions.runner.apiVersion, "runner"],
		);
	}
	for (const [pair, label, range, providerVersion, providerName] of pairs) {
		if (typeof range !== "string" || !range) {
			if (manifestMode) continue;
			failures.push(`INCOMPATIBLE ${pair}: missing range`);
			continue;
		}
		const provider = providerName || "backend";
		if (semver.satisfies(providerVersion, range)) {
			lines.push(`OK ${pair}: ${provider} ${providerVersion} satisfies ${range}`);
		} else {
			failures.push(`INCOMPATIBLE ${pair}: ${provider} ${providerVersion} does not satisfy ${range}`);
		}
	}
	return { ok: failures.length === 0, lines, failures };
}

/***
 * MARK: loadVersions
 * @description Loads the three version.json files from a versions root:
 *   `<dir>/api/version.json`, `<dir>/frontend/version.json`,
 *   `<dir>/runner/version.json`. With --versions-dir pointing directly at a
 *   fixture directory that itself holds api/frontend/runner subdirs, the
 *   same layout applies.
 * @param {string} dir - Repo root (or fixture root) containing the three dirs.
 * @returns {Object} `{ backend, frontend, runner }` records.
 ***/
export function loadVersions(dir) {
	return {
		backend: readJson(path.join(dir, "api", "version.json")),
		frontend: readJson(path.join(dir, "frontend", "version.json")),
		runner: readJson(path.join(dir, "runner", "version.json")),
	};
}

function parseArgs(argv) {
	const args = { versionsDir: REPO_ROOT, manifest: null };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--versions-dir") args.versionsDir = path.resolve(argv[++i]);
		else if (argv[i] === "--manifest") args.manifest = path.resolve(argv[++i]);
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	return args;
}

const isMain =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	try {
		const args = parseArgs(process.argv.slice(2));
		const result = args.manifest
			? checkCompatibility(versionsFromManifest(readJson(args.manifest)), { manifestMode: true })
			: checkCompatibility(loadVersions(args.versionsDir));
		for (const line of result.lines) console.log(line);
		for (const line of result.failures) console.error(line);
		process.exit(result.ok ? 0 : 1);
	} catch (err) {
		console.error(`check-component-compat: ${err.message}`);
		process.exit(1);
	}
}
