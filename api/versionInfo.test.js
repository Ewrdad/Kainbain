import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	VERSION_UPDATE_GUIDES,
	buildVersionInfo,
	compareRelease,
	normalizeRelease,
	readApiContract,
	readBackendVersion,
	readSecurityReport,
} from "./versionInfo.js";

/***
 * MARK: versionInfo unit tests
 * @description Pins the Settings About page backend half: installed-version
 *   sources, latest-release comparison with honest unknown states, the
 *   security-report file contract, and the aggregated payload shape.
 * @example run `npm run test --prefix api -- versionInfo`
 ***/

const here = path.dirname(fileURLToPath(import.meta.url));
const stubFile = (files) => (filePath) => {
	/* eslint-disable-next-line security/detect-object-injection -- test indexes the stubbed file map by the requested path */
	if (!Object.hasOwn(files, filePath)) throw new Error(`ENOENT: ${filePath}`);
	/* eslint-disable-next-line security/detect-object-injection -- test indexes the stubbed file map by the requested path */
	return files[filePath];
};

describe("normalizeRelease", () => {
	it("normalizes plain, v-prefixed, and partial versions", () => {
		expect(normalizeRelease("1.0.0")).toBe("1.0.0");
		expect(normalizeRelease("v1.2.3")).toBe("1.2.3");
		expect(normalizeRelease(" 2.0 ")).toBe("2.0.0");
	});

	it("returns null for missing or unparseable input", () => {
		expect(normalizeRelease(null)).toBeNull();
		expect(normalizeRelease("")).toBeNull();
		expect(normalizeRelease("not-a-version")).toBeNull();
		expect(normalizeRelease(42)).toBeNull();
	});
});

describe("compareRelease", () => {
	it("flags a newer latest release", () => {
		expect(compareRelease("1.0.0", "1.1.0")).toBe("update-available");
		expect(compareRelease("1.0.0", "v2.0.0")).toBe("update-available");
	});

	it("reports up-to-date for equal or newer installs", () => {
		expect(compareRelease("1.1.0", "1.1.0")).toBe("up-to-date");
		expect(compareRelease("1.2.0", "1.1.0")).toBe("up-to-date");
	});

	it("answers unknown instead of a fake up-to-date", () => {
		expect(compareRelease("1.0.0", null)).toBe("unknown");
		expect(compareRelease("1.0.0", "")).toBe("unknown");
		expect(compareRelease(null, "1.1.0")).toBe("unknown");
		expect(compareRelease("bogus", "1.1.0")).toBe("unknown");
		expect(compareRelease("1.0.0", "bogus")).toBe("unknown");
	});
});

describe("readBackendVersion", () => {
	it("matches api/package.json on the real disk", () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(here, "package.json"), "utf8"),
		);
		expect(readBackendVersion()).toBe(pkg.version);
	});

	it("returns null for a missing or invalid file", () => {
		expect(
			readBackendVersion({ readFile: stubFile({}), apiDir: "/none" }),
		).toBeNull();
		expect(
			readBackendVersion({
				readFile: stubFile({ "/none/package.json": JSON.stringify({ version: "bogus" }) }),
				apiDir: "/none",
			}),
		).toBeNull();
	});
});

describe("readApiContract", () => {
	it("matches api/version.json on the real disk", () => {
		const record = JSON.parse(
			fs.readFileSync(path.join(here, "version.json"), "utf8"),
		);
		expect(readApiContract()).toEqual({
			apiVersion: record.apiVersion,
			accepts: record.accepts,
		});
	});

	it("yields nulls for a missing or invalid file", () => {
		expect(readApiContract({ readFile: stubFile({}), apiDir: "/none" })).toEqual({
			apiVersion: null,
			accepts: {},
		});
		expect(
			readApiContract({
				readFile: stubFile({ "/none/version.json": "not json" }),
				apiDir: "/none",
			}),
		).toEqual({ apiVersion: null, accepts: {} });
	});
});

describe("readSecurityReport", () => {
	const valid = JSON.stringify({
		status: "pass",
		checkedAt: "2026-11-01T00:00:00.000Z",
		summary: "Trivy + Semgrep clean.",
		reportUrl: "https://sec.example/build/1",
	});

	it("returns unknown when no report is configured", () => {
		expect(readSecurityReport({ reportPath: "" })).toEqual({
			status: "unknown",
			checkedAt: null,
			summary: "",
			reportUrl: null,
		});
	});

	it("returns unknown for a missing, unparseable, or off-contract file", () => {
		for (const files of [
			{},
			{ "/r.json": "not json" },
			{ "/r.json": JSON.stringify({ status: "scanned" }) },
			{ "/r.json": JSON.stringify(["pass"]) },
		]) {
			expect(
				readSecurityReport({ readFile: stubFile(files), reportPath: "/r.json" }).status,
			).toBe("unknown");
		}
	});

	it("loads a valid report including fail states with a fallback URL", () => {
		const loaded = readSecurityReport({
			readFile: stubFile({ "/r.json": valid }),
			reportPath: "/r.json",
		});
		expect(loaded).toEqual({
			status: "pass",
			checkedAt: "2026-11-01T00:00:00.000Z",
			summary: "Trivy + Semgrep clean.",
			reportUrl: "https://sec.example/build/1",
		});
		const failed = readSecurityReport({
			readFile: stubFile({
				"/r.json": JSON.stringify({ status: "fail", summary: "2 critical" }),
			}),
			reportPath: "/r.json",
			reportUrl: "https://sec.example/fallback",
		});
		expect(failed.status).toBe("fail");
		expect(failed.checkedAt).toBeNull();
		expect(failed.reportUrl).toBe("https://sec.example/fallback");
	});
});

describe("buildVersionInfo", () => {
	it("aggregates installed, latest, and security with warnings", () => {
		const payload = buildVersionInfo({
			uiVersion: "1.0.0",
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
			latest: { ui: "1.1.0", backend: "1.0.0", api: "" },
			security: { status: "pass", checkedAt: "2026-11-01", summary: "ok", reportUrl: null },
			checkedAt: "2026-11-16T00:00:00.000Z",
		});
		expect(payload.ui).toEqual({
			installed: "1.0.0",
			latest: "1.1.0",
			status: "update-available",
			updateUrl: VERSION_UPDATE_GUIDES.ui,
		});
		expect(payload.backend.status).toBe("up-to-date");
		expect(payload.apis).toHaveLength(1);
		expect(payload.apis[0]).toMatchObject({
			name: "screen-to-server",
			installed: "1.0.0",
			status: "unknown",
			accepts: { frontend: ">=1.0.0 <2.0.0" },
		});
		expect(payload.security.status).toBe("pass");
		expect(payload.checkedAt).toBe("2026-11-16T00:00:00.000Z");
		expect(payload.warnings).toEqual(["UI update available: 1.0.0 → 1.1.0"]);
	});

	it("stays honest when nothing is known", () => {
		const payload = buildVersionInfo({});
		expect(payload.ui.status).toBe("unknown");
		expect(payload.backend.status).toBe("unknown");
		expect(payload.apis[0].status).toBe("unknown");
		expect(payload.security.status).toBe("unknown");
		expect(payload.warnings).toEqual([]);
		expect(typeof payload.checkedAt).toBe("string");
	});
});
