#!/usr/bin/env node
/***
 * MARK: generate-build-info
 * @description Builds dist/build-info.json — the "latest build" block the
 *   ad-site serves at /build-info.json and renders in place of the old
 *   about-me section. Regenerated on every publish (publish.sh calls this
 *   right after writing dist/release-manifest.json, and sync-adsite.sh
 *   stages the file into the site's public/ so the section updates on every
 *   publish without a vite rebuild).
 *
 *   Contents: build number, latest commit, publishedAt, per-component image
 *   references WITH registry digests (image hashes) and the runner artifact
 *   sha256, plus best-effort Trivy scan summaries for the published images
 *   (falls back to a `trivy fs` source scan when the release has no images;
 *   marked unavailable when trivy is not installed — never fails the
 *   publish).
 *
 *   Digest sources, in order: the manifest's own `digest` field (publish.sh
 *   records it at push time), then live `docker` lookup of the pushed image.
 * @example node scripts/generate-build-info.mjs
 * @example node scripts/generate-build-info.mjs --manifest dist/release-manifest.json --out dist/build-info.json --no-trivy
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

/***
 * MARK: parseArgs
 * @description Parses CLI flags into an options object.
 * @example parseArgs(["--no-trivy"]) => { ..., trivy: false }
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {object} Options: manifest, history, out, trivy, trivyBin, trivyTimeoutSec, resolveDigests.
 ***/
export function parseArgs(argv) {
	const opts = {
		manifest: path.join(REPO_ROOT, "dist", "release-manifest.json"),
		history: path.join(REPO_ROOT, "dist", "release-history.jsonl"),
		out: path.join(REPO_ROOT, "dist", "build-info.json"),
		trivy: true,
		trivyBin: "",
		trivyTimeoutSec: 300,
		resolveDigests: true,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => {
			if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
			return argv[++i];
		};
		if (a === "--manifest") opts.manifest = next();
		else if (a.startsWith("--manifest=")) opts.manifest = a.slice("--manifest=".length);
		else if (a === "--history") opts.history = next();
		else if (a.startsWith("--history=")) opts.history = a.slice("--history=".length);
		else if (a === "--out") opts.out = next();
		else if (a.startsWith("--out=")) opts.out = a.slice("--out=".length);
		else if (a === "--no-trivy") opts.trivy = false;
		else if (a === "--trivy-bin") opts.trivyBin = next();
		else if (a.startsWith("--trivy-bin=")) opts.trivyBin = a.slice("--trivy-bin=".length);
		else if (a === "--trivy-timeout") opts.trivyTimeoutSec = Number(next());
		else if (a.startsWith("--trivy-timeout=")) opts.trivyTimeoutSec = Number(a.slice("--trivy-timeout=".length));
		else if (a === "--no-docker") opts.resolveDigests = false;
		else if (a === "-h" || a === "--help") {
			console.log("usage: node scripts/generate-build-info.mjs [--manifest F] [--history F] [--out F] [--no-trivy] [--trivy-bin BIN] [--trivy-timeout SEC] [--no-docker]");
			process.exit(0);
		} else throw new Error(`unknown argument: ${a}`);
	}
	return opts;
}

/***
 * MARK: historyLineCount
 * @description Counts non-empty lines of the release history — the number of
 *   publishes recorded so far, used as the default build number.
 * @example historyLineCount("dist/release-history.jsonl") => 42
 * @param {string} file - Path to release-history.jsonl.
 * @returns {number} Non-empty line count (0 when unreadable).
 ***/
export function historyLineCount(file) {
	try {
		return fs
			.readFileSync(file, "utf8")
			.split("\n")
			.filter((l) => l.trim()).length;
	} catch {
		return 0;
	}
}

/***
 * MARK: resolveBuildNumber
 * @description Picks the build number: an explicit KAINBAIN_BUILD_NUMBER wins
 *   (unless "0"/unset), otherwise the count of recorded publishes, floor 1.
 * @example resolveBuildNumber({ envValue: "", historyCount: 41 }) => 41
 * @param {object} o - { envValue: string|undefined, historyCount: number }.
 * @returns {number} The build number to stamp.
 ***/
export function resolveBuildNumber({ envValue, historyCount }) {
	const n = Number(envValue);
	if (Number.isFinite(n) && envValue !== undefined && String(envValue).trim() !== "" && n > 0) {
		return Math.floor(n);
	}
	return Math.max(historyCount, 1);
}

/***
 * MARK: findTrivy
 * @description Locates the trivy binary: explicit path, PATH, then the
 *   TRIVY_FALLBACK_DIR (default /snap/bin) convention from Security_scans.sh.
 * @example findTrivy("") => "/snap/bin/trivy" or ""
 * @param {string} explicit - Explicit --trivy-bin value (checked first).
 * @returns {string} Absolute binary path, or "" when not found.
 ***/
export function findTrivy(explicit) {
	if (explicit) return fs.existsSync(explicit) ? explicit : "";
	const onPath = spawnSync("sh", ["-c", "command -v trivy"], { encoding: "utf8" });
	if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
	const fallbackDir = process.env.TRIVY_FALLBACK_DIR || "/snap/bin";
	const candidate = path.join(fallbackDir, "trivy");
	return fs.existsSync(candidate) ? candidate : "";
}

/***
 * MARK: resolveImageDigest
 * @description Resolves the registry digest (sha256 of the image manifest) of
 *   a pushed image via docker: `buildx imagetools inspect` first, then the
 *   image's RepoDigests. Empty string when docker or the digest is
 *   unavailable.
 * @example resolveImageDigest("docker.io/ns/kainbain-backend:1.0.0-abc1234") => "sha256:..."
 * @param {string} image - Fully-qualified image reference.
 * @param {object} [o] - { dockerBin: string } override for tests.
 * @returns {string} "sha256:..." digest or "".
 ***/
export function resolveImageDigest(image, o = {}) {
	const docker = o.dockerBin || "docker";
	const probe = spawnSync(
		docker,
		["buildx", "imagetools", "inspect", image, "--format", "{{.Digest}}"],
		{ encoding: "utf8", timeout: 30_000 },
	);
	if (probe.status === 0) {
		const d = probe.stdout.trim();
		if (d.startsWith("sha256:")) return d;
	}
	const inspect = spawnSync(
		docker,
		["inspect", "--format", "{{json .RepoDigests}}", image],
		{ encoding: "utf8", timeout: 30_000 },
	);
	if (inspect.status === 0) {
		try {
			for (const entry of JSON.parse(inspect.stdout.trim() || "[]")) {
				const at = entry.indexOf("@");
				if (at > 0 && entry.slice(at + 1).startsWith("sha256:")) {
					return entry.slice(at + 1);
				}
			}
		} catch {
			/* fall through */
		}
	}
	return "";
}

/***
 * MARK: summarizeTrivyReport
 * @description Reduces a trivy JSON report to per-severity counts, a total,
 *   and the top findings (severity rank, then CVSS) worth showing on the
 *   ad-site.
 * @example summarizeTrivyReport({Results:[{Vulnerabilities:[...]}]}) => { counts: {...}, total: n, top: [...] }
 * @param {object} report - Parsed trivy --format json output.
 * @param {number} [topN] - How many top findings to keep (default 5).
 * @returns {object} { counts, total, top }.
 ***/
export function summarizeTrivyReport(report, topN = 5) {
	const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
	const findings = [];
	for (const result of report?.Results || []) {
		for (const v of result?.Vulnerabilities || []) {
			const sev = typeof v?.Severity === "string" ? v.Severity.toUpperCase() : "UNKNOWN";
			if (!(sev in counts)) counts[sev] = 0;
			counts[sev] += 1;
			findings.push(v);
		}
	}
	findings.sort((a, b) => {
		const ra = SEVERITY_RANK[a?.Severity?.toUpperCase()] ?? 99;
		const rb = SEVERITY_RANK[b?.Severity?.toUpperCase()] ?? 99;
		if (ra !== rb) return ra - rb;
		const ca = a?.CVSS?.nvd?.V3Score ?? a?.CVSS?.ghsa?.V3Score ?? a?.CVSS?.redhat?.V3Score ?? 0;
		const cb = b?.CVSS?.nvd?.V3Score ?? b?.CVSS?.ghsa?.V3Score ?? b?.CVSS?.redhat?.V3Score ?? 0;
		return cb - ca;
	});
	return {
		counts,
		total: findings.length,
		top: findings.slice(0, topN).map((v) => ({
			id: v?.VulnerabilityID || "",
			severity: (v?.Severity || "UNKNOWN").toUpperCase(),
			pkg: v?.PkgName || "",
			installed: v?.InstalledVersion || "",
			title: v?.Title || "",
		})),
	};
}

/***
 * MARK: scanWithTrivy
 * @description Runs one trivy scan (image or fs) and summarizes it. Never
 *   throws: failures come back as { scanned: false, reason }.
 * @example scanWithTrivy("/snap/bin/trivy", ["image", "img:tag"], 300) => { scanned: true, summary: {...} }
 * @param {string} trivyBin - trivy binary path.
 * @param {string[]} targetArgs - e.g. ["image", "docker.io/ns/img:tag"] or ["fs", "."].
 * @param {number} timeoutSec - Scan timeout in seconds.
 * @param {string} [cwd] - Working directory for fs scans.
 * @returns {object} { scanned: true, summary } | { scanned: false, reason }.
 ***/
export function scanWithTrivy(trivyBin, targetArgs, timeoutSec, cwd = REPO_ROOT) {
	const r = spawnSync(
		trivyBin,
		[...targetArgs, "--format", "json", "--quiet", "--severity", "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL", "--timeout", `${timeoutSec}s`],
		{ encoding: "utf8", timeout: (timeoutSec + 30) * 1000, cwd, maxBuffer: 64 * 1024 * 1024 },
	);
	if (r.status !== 0 && !r.stdout?.trim()) {
		return { scanned: false, reason: `trivy exited ${r.status}: ${(r.stderr || "").trim().slice(0, 200)}` };
	}
	try {
		return { scanned: true, summary: summarizeTrivyReport(JSON.parse(r.stdout)) };
	} catch (err) {
		return { scanned: false, reason: `unparseable trivy output: ${err?.message || err}` };
	}
}

/***
 * MARK: buildInfo
 * @description Assembles the build-info.json payload from the release
 *   manifest plus the digest/trivy lookups. Pure — no I/O.
 * @example buildInfo({ manifest, buildNumber, digests: {...}, trivy: {...} }) => {...}
 * @param {object} o - { manifest, buildNumber, digests, trivy, generatedAt }.
 * @returns {object} The build-info document.
 ***/
export function buildInfo({ manifest, buildNumber, digests = {}, trivy = {}, generatedAt }) {
	const components = manifest?.components || {};
	const images = {};
	for (const name of ["backend", "frontend"]) {
		const c = components[name];
		if (!c) continue;
		images[name] = {
			image: c.image || "",
			tag: c.tag || "",
			digest: c.digest || digests[name] || null,
		};
	}
	const runner = components.runner
		? { artifact: components.runner.artifact || "", sha256: components.runner.sha256 || "" }
		: undefined;
	const commit = typeof manifest?.commit === "string" ? manifest.commit : "";
	return {
		schemaVersion: 1,
		buildNumber,
		commit,
		shortCommit: commit.slice(0, 7),
		publishedAt: manifest?.publishedAt || null,
		generatedAt: generatedAt || new Date().toISOString(),
		images,
		...(runner ? { runner } : {}),
		trivy,
	};
}

/***
 * MARK: main
 * @description CLI entry: read the manifest, resolve digests, run trivy
 *   (best effort), write --out. Exit 0 even when trivy/docker are missing —
 *   the ad-site degrades to "scan unavailable".
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {number} Process exit code.
 ***/
export function main(argv) {
	const opts = parseArgs(argv);
	const manifest = JSON.parse(fs.readFileSync(opts.manifest, "utf8"));
	const buildNumber = resolveBuildNumber({
		envValue: process.env.KAINBAIN_BUILD_NUMBER,
		historyCount: historyLineCount(opts.history),
	});

	const digests = {};
	if (opts.resolveDigests) {
		for (const name of ["backend", "frontend"]) {
			const c = manifest?.components?.[name];
			if (c?.image && !c?.digest) digests[name] = resolveImageDigest(c.image);
		}
	}

	let trivy = { available: false, scannedAt: null, images: {}, source: null };
	if (opts.trivy) {
		const trivyBin = findTrivy(opts.trivyBin);
		if (trivyBin) {
			trivy = { available: true, scannedAt: new Date().toISOString(), images: {}, source: null };
			const imageNames = Object.keys(manifest?.components || {}).filter(
				(n) => n === "backend" || n === "frontend",
			);
			for (const name of imageNames) {
				const image = manifest.components[name]?.image;
				if (!image) continue;
				const res = scanWithTrivy(trivyBin, ["image", image], opts.trivyTimeoutSec);
				trivy.images[name] = res.scanned
					? { image, ...res.summary, scannedAt: trivy.scannedAt }
					: { image, scanned: false, reason: res.reason };
			}
			if (imageNames.length === 0) {
				// Runner-only release: scan the source tree instead.
				const res = scanWithTrivy(trivyBin, ["fs", "."], opts.trivyTimeoutSec);
				trivy.source = res.scanned
					? { ...res.summary, scannedAt: trivy.scannedAt }
					: { scanned: false, reason: res.reason };
			}
		} else {
			trivy = { available: false, scannedAt: null, reason: "trivy binary not found (PATH or TRIVY_FALLBACK_DIR)", images: {}, source: null };
		}
	}

	const doc = buildInfo({
		manifest,
		buildNumber,
		digests,
		trivy,
		generatedAt: new Date().toISOString(),
	});
	fs.mkdirSync(path.dirname(opts.out), { recursive: true });
	fs.writeFileSync(opts.out, JSON.stringify(doc, null, 2) + "\n");
	console.log(
		`generate-build-info: wrote ${path.relative(REPO_ROOT, opts.out)} (build #${buildNumber}, commit ${doc.shortCommit || "unknown"}, images: ${Object.keys(doc.images).join(", ") || "none"}, trivy: ${trivy.available ? "scanned" : "unavailable"})`,
	);
	return 0;
}

const invokedAsScript =
	typeof process.argv[1] === "string" && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedAsScript) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (err) {
		console.error(`generate-build-info: ${err?.message || err}`);
		process.exit(1);
	}
}
