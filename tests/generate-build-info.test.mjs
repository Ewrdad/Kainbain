import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "generate-build-info.mjs");
const mod = await import(pathToFileURL(SCRIPT).href);
const {
	resolveBuildNumber,
	historyLineCount,
	summarizeTrivyReport,
	buildInfo,
	parseArgs,
} = mod;

const manifest = (commit, extra = {}) => ({
	publishedAt: "2026-11-04T01:02:03.000Z",
	commit,
	components: {
		backend: {
			apiVersion: "1.2.3",
			image: `docker.io/ewrdad/kainbain-backend:1.2.3-${commit.slice(0, 7)}`,
			tag: `1.2.3-${commit.slice(0, 7)}`,
			digest: "sha256:" + "b".repeat(64),
		},
		frontend: {
			apiVersion: "1.2.3",
			image: `docker.io/ewrdad/kainbain-frontend:1.2.3-${commit.slice(0, 7)}`,
			tag: `1.2.3-${commit.slice(0, 7)}`,
			digest: "sha256:" + "f".repeat(64),
		},
		runner: { artifact: `kainbain-runner-${commit.slice(0, 7)}.tar.gz`, sha256: "a".repeat(64) },
		...extra,
	},
});

const setup = () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-buildinfo-"));
	const dist = path.join(dir, "dist");
	fs.mkdirSync(dist, { recursive: true });
	const commit = "0123456789abcdef0123456789abcdef01234567";
	fs.writeFileSync(path.join(dist, "release-manifest.json"), JSON.stringify(manifest(commit), null, 2) + "\n");
	fs.writeFileSync(
		path.join(dist, "release-history.jsonl"),
		['{"commit":"aaa"}', '{"commit":"bbb"}', `{"commit":"${commit}"}`].join("\n") + "\n",
	);
	return { dir, dist, commit, out: path.join(dist, "build-info.json") };
};

const runCli = (args, env = {}) =>
	spawnSync("node", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

describe("scripts/generate-build-info.mjs", () => {
	it("resolveBuildNumber prefers an explicit env number, falls back to history count", () => {
		assert.equal(resolveBuildNumber({ envValue: "42", historyCount: 3 }), 42);
		assert.equal(resolveBuildNumber({ envValue: "0", historyCount: 3 }), 3);
		assert.equal(resolveBuildNumber({ envValue: undefined, historyCount: 7 }), 7);
		assert.equal(resolveBuildNumber({ envValue: "", historyCount: 0 }), 1);
	});

	it("historyLineCount counts non-empty lines and tolerates a missing file", () => {
		const { dist } = setup();
		assert.equal(historyLineCount(path.join(dist, "release-history.jsonl")), 3);
		assert.equal(historyLineCount(path.join(dist, "nope.jsonl")), 0);
	});

	it("summarizeTrivyReport counts by severity and ranks top findings", () => {
		const report = {
			Results: [
				{
					Vulnerabilities: [
						{ VulnerabilityID: "CVE-1", Severity: "HIGH", PkgName: "pkg-a", InstalledVersion: "1.0", Title: "a", CVSS: { nvd: { V3Score: 8.1 } } },
						{ VulnerabilityID: "CVE-2", Severity: "CRITICAL", PkgName: "pkg-b", InstalledVersion: "2.0", Title: "b", CVSS: { nvd: { V3Score: 9.8 } } },
						{ VulnerabilityID: "CVE-3", Severity: "LOW", PkgName: "pkg-c", InstalledVersion: "3.0", Title: "c" },
					],
				},
				{ Vulnerabilities: [{ VulnerabilityID: "CVE-4", Severity: "high", PkgName: "pkg-d", InstalledVersion: "4.0", Title: "d" }] },
			],
		};
		const s = summarizeTrivyReport(report);
		assert.equal(s.total, 4);
		assert.equal(s.counts.CRITICAL, 1);
		assert.equal(s.counts.HIGH, 2);
		assert.equal(s.counts.LOW, 1);
		assert.equal(s.top[0].id, "CVE-2");
		assert.equal(s.top[1].id, "CVE-1");
	});

	it("buildInfo assembles digests, runner sha256 and commit from the manifest", () => {
		const commit = "0123456789abcdef0123456789abcdef01234567";
		const doc = buildInfo({ manifest: manifest(commit), buildNumber: 9, generatedAt: "2026-11-04T00:00:00.000Z" });
		assert.equal(doc.buildNumber, 9);
		assert.equal(doc.commit, commit);
		assert.equal(doc.shortCommit, "0123456");
		assert.equal(doc.images.backend.digest, "sha256:" + "b".repeat(64));
		assert.equal(doc.runner.sha256, "a".repeat(64));
		assert.ok(doc.images.frontend.image.includes("kainbain-frontend"));
	});

	it("parseArgs handles flags and rejects unknown ones", () => {
		const o = parseArgs(["--no-trivy", "--no-docker", "--out=/tmp/x.json"]);
		assert.equal(o.trivy, false);
		assert.equal(o.resolveDigests, false);
		assert.equal(o.out, "/tmp/x.json");
		assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
	});

	it("CLI writes build-info.json with the history-derived build number and manifest digests", () => {
		const { dist, out } = setup();
		const r = runCli([
			"--manifest", path.join(dist, "release-manifest.json"),
			"--history", path.join(dist, "release-history.jsonl"),
			"--out", out,
			"--no-trivy",
			"--no-docker",
		]);
		assert.equal(r.status, 0, r.stderr + r.stdout);
		const doc = JSON.parse(fs.readFileSync(out, "utf8"));
		assert.equal(doc.buildNumber, 3);
		assert.equal(doc.shortCommit, "0123456");
		assert.equal(doc.images.backend.digest, "sha256:" + "b".repeat(64));
		assert.equal(doc.runner.artifact, "kainbain-runner-0123456.tar.gz");
		assert.equal(doc.trivy.available, false);
	});

	it("CLI honours KAINBAIN_BUILD_NUMBER over the history count", () => {
		const { dist, out } = setup();
		const r = runCli(
			["--manifest", path.join(dist, "release-manifest.json"), "--history", path.join(dist, "release-history.jsonl"), "--out", out, "--no-trivy", "--no-docker"],
			{ KAINBAIN_BUILD_NUMBER: "1234" },
		);
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).buildNumber, 1234);
	});

	it("CLI summarizes trivy image scans via a fake trivy binary", () => {
		const { dir, dist, out } = setup();
		const bin = path.join(dir, "fake-trivy");
		fs.writeFileSync(
			bin,
			'#!/bin/sh\nif [ "$1" = "fs" ]; then\n  echo \'{"Results":[{"Vulnerabilities":[{"VulnerabilityID":"CVE-FS","Severity":"MEDIUM","PkgName":"p","InstalledVersion":"1","Title":"fs"}]}]}\'\nelse\n  echo \'{"Results":[{"Vulnerabilities":[{"VulnerabilityID":"CVE-IMG","Severity":"CRITICAL","PkgName":"q","InstalledVersion":"2","Title":"img"},{"VulnerabilityID":"CVE-IMG2","Severity":"LOW","PkgName":"r","InstalledVersion":"3","Title":"img2"}]}]}\'\nfi\n',
		);
		fs.chmodSync(bin, 0o755);
		const r = runCli([
			"--manifest", path.join(dist, "release-manifest.json"),
			"--history", path.join(dist, "release-history.jsonl"),
			"--out", out,
			"--trivy-bin", bin,
			"--no-docker",
		]);
		assert.equal(r.status, 0, r.stderr + r.stdout);
		const doc = JSON.parse(fs.readFileSync(out, "utf8"));
		assert.equal(doc.trivy.available, true);
		assert.equal(doc.trivy.images.backend.total, 2);
		assert.equal(doc.trivy.images.backend.counts.CRITICAL, 1);
		assert.equal(doc.trivy.images.backend.counts.LOW, 1);
		assert.equal(doc.trivy.images.backend.top[0].id, "CVE-IMG");
		assert.equal(doc.trivy.images.frontend.total, 2);
		assert.equal(doc.trivy.source, null);
	});

	it("CLI falls back to a source scan for a runner-only release", () => {
		const { dir, dist, out, commit } = setup();
		const m = manifest(commit);
		delete m.components.backend;
		delete m.components.frontend;
		fs.writeFileSync(path.join(dist, "release-manifest.json"), JSON.stringify(m, null, 2) + "\n");
		const bin = path.join(dir, "fake-trivy");
		fs.writeFileSync(
			bin,
			'#!/bin/sh\necho \'{"Results":[{"Vulnerabilities":[{"VulnerabilityID":"CVE-FS","Severity":"MEDIUM","PkgName":"p","InstalledVersion":"1","Title":"fs"}]}]}\'\n',
		);
		fs.chmodSync(bin, 0o755);
		const r = runCli([
			"--manifest", path.join(dist, "release-manifest.json"),
			"--history", path.join(dist, "release-history.jsonl"),
			"--out", out,
			"--trivy-bin", bin,
			"--no-docker",
		]);
		assert.equal(r.status, 0, r.stderr + r.stdout);
		const doc = JSON.parse(fs.readFileSync(out, "utf8"));
		assert.deepEqual(Object.keys(doc.images), []);
		assert.equal(doc.trivy.source.total, 1);
		assert.equal(doc.trivy.source.counts.MEDIUM, 1);
	});
});
