import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	VERSION_UPDATE_GUIDES,
	buildVersionInfo,
	compareRelease,
	normalizeRelease,
	readAcceptsMap,
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

	it("pins the shared coercion edge cases (prerelease, build tag, padded)", () => {
		// semver coercion strips prerelease/build metadata: a `-beta` tag
		// compares as its base release, never as newer than the release.
		expect(normalizeRelease("1.2.3-beta")).toBe("1.2.3");
		expect(normalizeRelease("1.2.3+build.5")).toBe("1.2.3");
		expect(normalizeRelease("  v2.1  ")).toBe("2.1.0");
		expect(compareRelease("1.2.3-beta", "1.2.3")).toBe("up-to-date");
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

	it("degrades a malformed contract shape instead of crashing", () => {
		// Non-object accepts (string, array) become an empty map; a missing
		// apiVersion becomes null — the page then shows Unknown, not a 500.
		for (const accepts of ["frontend", ["frontend"], 42]) {
			expect(
				readApiContract({
					readFile: stubFile({
						"/none/version.json": JSON.stringify({ apiVersion: "1.0.0", accepts }),
					}),
					apiDir: "/none",
				}),
			).toEqual({ apiVersion: "1.0.0", accepts: {} });
		}
		expect(
			readApiContract({
				readFile: stubFile({
					"/none/version.json": JSON.stringify({ accepts: { frontend: ">=1.0.0" } }),
				}),
				apiDir: "/none",
			}),
		).toEqual({ apiVersion: null, accepts: { frontend: ">=1.0.0" } });
	});
});

describe("readAcceptsMap", () => {
	it("keeps a valid map and trims its ranges", () => {
		expect(readAcceptsMap({ frontend: "  >=1.0.0 <2.0.0 " })).toEqual({
			frontend: ">=1.0.0 <2.0.0",
		});
	});

	it("drops non-string ranges and off-contract maps", () => {
		expect(readAcceptsMap({ frontend: ">=1.0.0", runner: 42, empty: "  " })).toEqual({
			frontend: ">=1.0.0",
		});
		for (const accepts of [null, undefined, "frontend", 42, ["frontend"]]) {
			expect(readAcceptsMap(accepts)).toEqual({});
		}
	});

	it("screens prototype keys out of a hostile map", () => {
		const hostile = JSON.parse(
			'{"__proto__": "polluted", "constructor": "x", "prototype": "y", "frontend": ">=1.0.0"}',
		);
		const cleaned = readAcceptsMap(hostile);
		expect(cleaned).toEqual({ frontend: ">=1.0.0" });
		expect({}.polluted).toBeUndefined();
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
		for (const reportPath of ["", "   ", null, undefined, 42]) {
			expect(readSecurityReport({ reportPath }).status).toBe("unknown");
		}
		expect(readSecurityReport({ reportPath: "" })).toEqual({
			status: "unknown",
			checkedAt: null,
			summary: "",
			reportUrl: null,
		});
	});

	it("loads the warn state and degrades non-string fields", () => {
		const loaded = readSecurityReport({
			readFile: stubFile({
				"/r.json": JSON.stringify({
					status: "warn",
					checkedAt: 20261101,
					summary: ["not", "a", "string"],
					reportUrl: "  ",
				}),
			}),
			reportPath: "/r.json",
			reportUrl: "  https://sec.example/fallback  ",
		});
		expect(loaded).toEqual({
			status: "warn",
			checkedAt: null,
			summary: "",
			reportUrl: "https://sec.example/fallback",
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

	it("warns once per outdated component, naming each", () => {
		const payload = buildVersionInfo({
			uiVersion: "1.0.0",
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: {} },
			latest: { ui: "1.1.0", backend: "2.0.0", api: "1.0.1" },
			checkedAt: "2026-11-16T00:00:00.000Z",
		});
		expect(payload.warnings).toEqual([
			"UI update available: 1.0.0 → 1.1.0",
			"Backend update available: 1.0.0 → 2.0.0",
			"API update available: 1.0.0 → 1.0.1",
		]);
	});

	it("degrades off-contract inputs instead of crashing", () => {
		// Malformed latest knobs, contract, and security inputs all collapse
		// to unknown — the endpoint answers 200 with honest states, not 500.
		const payload = buildVersionInfo({
			uiVersion: "1.0.0",
			backendVersion: "1.0.0",
			apiContract: "not-a-contract",
			latest: "not-a-map",
			security: "not-a-report",
			checkedAt: "2026-11-16T00:00:00.000Z",
		});
		expect(payload.ui.status).toBe("unknown");
		expect(payload.backend.status).toBe("unknown");
		expect(payload.apis[0]).toMatchObject({
			installed: null,
			status: "unknown",
			accepts: {},
		});
		expect(payload.security.status).toBe("unknown");
		expect(payload.warnings).toEqual([]);
	});
});
