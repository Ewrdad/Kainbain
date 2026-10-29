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
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
// Self-contained semver implementation. The publish/deploy path runs this
// script from a checkout that may not have api/node_modules installed (the
// primary checkout is dependency-free), so resolving the `semver` package
// would take down the whole compatibility gate. Keeping the logic here makes
// the gate runnable in any checkout.
const semver = (function buildSemver() {
	function parseVersion(input) {
		if (typeof input !== 'string') return null;
		const m = input.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/);
		if (!m) return null;
		return {
			major: Number(m[1]),
			minor: Number(m[2]),
			patch: Number(m[3]),
			prerelease: m[4] ? m[4].split('.') : [],
			build: m[5] ? m[5].split('.') : [],
		};
	}

	function comparePrerelease(a, b) {
		const len = Math.max(a.length, b.length);
		for (let i = 0; i < len; i += 1) {
			const x = a[i];
			const y = b[i];
			if (x === undefined) return y === undefined ? 0 : -1;
			if (y === undefined) return 1;
			const xn = /^\d+$/.test(x);
			const yn = /^\d+$/.test(y);
			if (xn !== yn) return xn ? -1 : 1;
			if (xn) {
				const nx = Number(x);
				const ny = Number(y);
				if (nx !== ny) return nx < ny ? -1 : 1;
			} else if (x !== y) {
				return x < y ? -1 : 1;
			}
		}
		return 0;
	}

	function compare(a, b) {
		if (a.major !== b.major) return a.major < b.major ? -1 : 1;
		if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
		if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
		const ap = a.prerelease;
		const bp = b.prerelease;
		if (ap.length === 0 && bp.length > 0) return 1;
		if (bp.length === 0 && ap.length > 0) return -1;
		return comparePrerelease(ap, bp);
	}

	function valid(input) {
		const v = parseVersion(input);
		if (!v) return false;
		let out = `${v.major}.${v.minor}.${v.patch}`;
		if (v.prerelease.length > 0) out += `-${v.prerelease.join('.')}`;
		return out;
	}

	function isWildcard(tok) {
		return tok === '*' || tok.toLowerCase() === 'x';
	}

	function toVersion(tok) {
		return parseVersion(tok.replace(/[xX*]/g, '0'));
	}

	function xSatisfies(spec, v) {
		const s = spec.toLowerCase();
		if (s === '*' || s === 'x') return true;
		const parts = spec.split('.');
		// Handle major-only / major.minor / major.minor.patch with x.
		if (parts.length === 1 && !isWildcard(parts[0])) {
			const maj = Number(parts[0]);
			return !Number.isNaN(maj) && v.major === maj;
		}
		if (parts.length >= 2 && isWildcard(parts[1])) {
			const maj = Number(parts[0]);
			return !Number.isNaN(maj) && v.major === maj;
		}
		if (parts.length >= 3 && isWildcard(parts[2])) {
			const maj = Number(parts[0]);
			const min = Number(parts[1]);
			return !Number.isNaN(maj) && !Number.isNaN(min) && v.major === maj && v.minor === min;
		}
		const rv = parseVersion(parts.join('.').replace(/[xX*]/g, '0'));
		if (!rv) return false;
		return compare(v, rv) === 0;
	}

	function satisfyPart(part, v) {
		const p = part.trim();
		if (!p) return true;
		if (p === '*' || p.toLowerCase() === 'x') return true;
		// Plain version or x-range without operator.
		const ops = ['>=', '<=', '>', '<', '^', '~', '===', '==', '='];
		let op = '';
		let rest = p;
		for (const candidate of ops) {
			if (p.startsWith(candidate)) {
				op = candidate;
				rest = p.slice(candidate.length);
				break;
			}
		}
		// x-range like "1.2.x" without operator.
		if (!op && /[xX*]/.test(rest)) return xSatisfies(rest, v);
		const rv = toVersion(rest);
		if (!rv) return false;
		if (!op) return compare(v, rv) === 0;

		if (op === '^') {
			if (compare(v, rv) < 0) return false;
			if (rv.major > 0) return v.major === rv.major;
			if (rv.minor > 0) return v.major === 0 && v.minor === rv.minor;
			return v.major === 0 && v.minor === 0 && v.patch === rv.patch;
		}
		if (op === '~') {
			if (compare(v, rv) < 0) return false;
			return v.major === rv.major && v.minor === rv.minor;
		}
		const c = compare(v, rv);
		if (op === '>') return c > 0;
		if (op === '>=') return c >= 0;
		if (op === '<') return c < 0;
		if (op === '<=') return c <= 0;
		if (op === '=' || op === '==' || op === '===') return c === 0;
		return false;
	}

	function satisfies(version, range) {
		const v = parseVersion(version);
		if (!v) return false;
		if (typeof range !== 'string') return false;
		const r = range.trim();
		if (!r) return false;
		return r.split('||').some((group) => {
			const parts = group.trim().split(/\s+/).filter(Boolean);
			if (parts.length === 0) return true;
			return parts.every((part) => satisfyPart(part, v));
		});
	}

	return { valid, satisfies };
})();

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
	for (const [pair, _label, range, providerVersion, providerName] of pairs) {
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
