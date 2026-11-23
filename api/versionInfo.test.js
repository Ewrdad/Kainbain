import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	VERSION_UPDATE_GUIDES,
	buildVersionInfo,
	checkApiCompatibility,
	compareRelease,
	normalizeFrontendContract,
	normalizeRelease,
	normalizeSecuritySummary,
	readAcceptsMap,
	readApiContract,
	readBackendVersion,
	readSecurityReport,
	resolveLatestRelease,
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

describe("resolveLatestRelease", () => {
	it("treats an unadvertised latest as the installed release (up-to-date)", () => {
		// No KAINBAIN_LATEST_* knob set (the default install) means no newer
		// release is known — the page shows Up to date, never Unknown.
		for (const knob of [null, undefined, "", "   "]) {
			expect(resolveLatestRelease("1.0.0", knob)).toEqual({
				latest: "1.0.0",
				status: "up-to-date",
			});
		}
	});

	it("stays unknown when the installed version itself is missing", () => {
		for (const installed of [null, undefined, "", "bogus"]) {
			expect(resolveLatestRelease(installed, "")).toEqual({
				latest: null,
				status: "unknown",
			});
		}
	});

	it("compares an explicitly advertised latest release", () => {
		expect(resolveLatestRelease("1.0.0", "1.1.0")).toEqual({
			latest: "1.1.0",
			status: "update-available",
		});
		expect(resolveLatestRelease("1.1.0", "1.1.0")).toEqual({
			latest: "1.1.0",
			status: "up-to-date",
		});
		expect(resolveLatestRelease("1.2.0", "1.1.0")).toEqual({
			latest: "1.1.0",
			status: "up-to-date",
		});
	});

	it("answers unknown for a malformed advertised knob (operator typo)", () => {
		// A non-empty knob that does not parse is a misconfiguration, not a
		// release: Unknown signals the typo instead of a fake Up to date.
		expect(resolveLatestRelease("1.0.0", "bogus")).toEqual({
			latest: null,
			status: "unknown",
		});
	});

	it("answers unknown for a non-string knob smuggled through the seam", () => {
		// Env knobs are always strings; a number/boolean/object means a
		// programming error upstream — Unknown surfaces it instead of a
		// fake Up to date, while absent (null/undefined) stays unadvertised.
		for (const knob of [42, 0, false, true, {}, ["1.0.0"]]) {
			expect(resolveLatestRelease("1.0.0", knob)).toEqual({
				latest: null,
				status: "unknown",
			});
		}
	});
});

describe("normalizeFrontendContract", () => {
	it("normalizes the UI-reported API version and requirement range", () => {
		expect(
			normalizeFrontendContract({
				apiVersion: "v1.0.0",
				requiresBackendApi: "  >=1.0.0 <2.0.0 ",
			}),
		).toEqual({ apiVersion: "1.0.0", requiresBackendApi: ">=1.0.0 <2.0.0" });
	});

	it("collapses missing or malformed contract input to nulls", () => {
		expect(normalizeFrontendContract(null)).toEqual({
			apiVersion: null,
			requiresBackendApi: null,
		});
		expect(normalizeFrontendContract({})).toEqual({
			apiVersion: null,
			requiresBackendApi: null,
		});
		expect(
			normalizeFrontendContract({ apiVersion: "bogus", requiresBackendApi: "   " }),
		).toEqual({ apiVersion: null, requiresBackendApi: null });
		expect(
			normalizeFrontendContract({ apiVersion: 42, requiresBackendApi: 42 }),
		).toEqual({ apiVersion: null, requiresBackendApi: null });
	});
});

describe("checkApiCompatibility", () => {
	const both = {
		frontendApiVersion: "1.0.0",
		requiresBackendApi: ">=1.0.0 <2.0.0",
		backendApiVersion: "1.2.0",
		acceptsFrontend: ">=1.0.0 <2.0.0",
	};

	it("verifies both range directions for an asymmetric pair", () => {
		// UI 1.0.0 against backend 1.2.0: different releases, same API major
		// — the partial redeploy this versioning exists to allow.
		const verdict = checkApiCompatibility(both);
		expect(verdict.status).toBe("compatible");
		expect(verdict.detail).toContain("major 1");
	});

	it("fails the frontend->backend direction with both versions named", () => {
		const verdict = checkApiCompatibility({
			...both,
			backendApiVersion: "2.0.0",
		});
		expect(verdict.status).toBe("incompatible");
		expect(verdict.detail).toContain("2.0.0");
		expect(verdict.detail).toContain(">=1.0.0 <2.0.0");
	});

	it("fails the backend-accepts-frontend direction with both versions named", () => {
		const verdict = checkApiCompatibility({
			...both,
			frontendApiVersion: "2.0.0",
		});
		expect(verdict.status).toBe("incompatible");
		expect(verdict.detail).toContain("2.0.0");
		expect(verdict.detail).toContain(">=1.0.0 <2.0.0");
	});

	it("passes on one satisfied direction when the other range is missing", () => {
		expect(
			checkApiCompatibility({ ...both, acceptsFrontend: null }).status,
		).toBe("compatible");
		expect(
			checkApiCompatibility({ ...both, requiresBackendApi: "" }).status,
		).toBe("compatible");
	});

	it("falls back to the same-major rule when no range is declared", () => {
		expect(
			checkApiCompatibility({
				frontendApiVersion: "1.0.0",
				requiresBackendApi: null,
				backendApiVersion: "1.9.9",
				acceptsFrontend: null,
			}),
		).toMatchObject({ status: "compatible" });
		const split = checkApiCompatibility({
			frontendApiVersion: "1.0.0",
			requiresBackendApi: null,
			backendApiVersion: "2.0.0",
			acceptsFrontend: null,
		});
		expect(split.status).toBe("incompatible");
		expect(split.detail).toContain("1.0.0");
		expect(split.detail).toContain("2.0.0");
	});

	it("ignores a corrupt range and decides on what is verifiable", () => {
		// A garbage range cannot condemn the pair: the other direction plus
		// the major rule still speak.
		expect(
			checkApiCompatibility({ ...both, requiresBackendApi: "not a range !!!" })
				.status,
		).toBe("compatible");
		expect(
			checkApiCompatibility({
				frontendApiVersion: "1.0.0",
				requiresBackendApi: "not a range !!!",
				backendApiVersion: "2.0.0",
				acceptsFrontend: "also garbage !!!",
			}).status,
		).toBe("incompatible");
	});

	it("answers unknown when either API version is missing", () => {
		expect(
			checkApiCompatibility({ ...both, frontendApiVersion: null }).status,
		).toBe("unknown");
		expect(
			checkApiCompatibility({ ...both, backendApiVersion: "bogus" }).status,
		).toBe("unknown");
		expect(checkApiCompatibility({}).status).toBe("unknown");
		expect(checkApiCompatibility().status).toBe("unknown");
	});

	it("tolerates v-prefixed API versions on the asymmetric pair", () => {
		// Releases are tagged `v1.2.0` while contracts store `1.2.0` — the
		// verdict must not split on the prefix.
		const verdict = checkApiCompatibility({
			...both,
			frontendApiVersion: "v1.0.0",
			backendApiVersion: "v1.2.0",
		});
		expect(verdict.status).toBe("compatible");
		expect(verdict.detail).toContain("major 1");
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

describe("normalizeSecuritySummary", () => {
	it("keeps a valid verdict and trims its report link", () => {
		expect(
			normalizeSecuritySummary({
				status: "pass",
				checkedAt: "2026-11-01T00:00:00.000Z",
				summary: "Clean.",
				reportUrl: "  https://sec.example/build/1  ",
			}),
		).toEqual({
			status: "pass",
			checkedAt: "2026-11-01T00:00:00.000Z",
			summary: "Clean.",
			reportUrl: "https://sec.example/build/1",
		});
	});

	it("collapses bogus verdicts and mistyped fields to honest unknown", () => {
		// A corrupt injected report must show the empty state — never a
		// bogus "Status: scanned" line and never a 500 from the response
		// validation tripping on a mistyped field.
		expect(normalizeSecuritySummary({ status: "scanned" })).toEqual({
			status: "unknown",
			checkedAt: null,
			summary: "",
			reportUrl: null,
		});
		expect(
			normalizeSecuritySummary({
				status: "pass",
				checkedAt: 20261101,
				summary: ["not", "a", "string"],
				reportUrl: { href: "https://sec.example" },
			}),
		).toEqual({ status: "pass", checkedAt: null, summary: "", reportUrl: null });
		for (const input of [null, undefined, "pass", 42, ["pass"], []]) {
			expect(normalizeSecuritySummary(input)).toEqual({
				status: "unknown",
				checkedAt: null,
				summary: "",
				reportUrl: null,
			});
		}
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
			// The API knob is unadvertised ("") while 1.0.0 is installed:
			// no newer release is known, so the row is Up to date.
			latest: "1.0.0",
			status: "up-to-date",
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
		// A malformed latest map degrades to "nothing advertised" (installed
		// rows report Up to date); a malformed contract or security input
		// still collapses to unknown — the endpoint answers 200 with honest
		// states, not 500.
		const payload = buildVersionInfo({
			uiVersion: "1.0.0",
			backendVersion: "1.0.0",
			apiContract: "not-a-contract",
			latest: "not-a-map",
			security: "not-a-report",
			checkedAt: "2026-11-16T00:00:00.000Z",
		});
		expect(payload.ui).toMatchObject({
			installed: "1.0.0",
			latest: "1.0.0",
			status: "up-to-date",
		});
		expect(payload.backend).toMatchObject({
			installed: "1.0.0",
			latest: "1.0.0",
			status: "up-to-date",
		});
		expect(payload.apis[0]).toMatchObject({
			installed: null,
			status: "unknown",
			accepts: {},
		});
		expect(payload.security.status).toBe("unknown");
		expect(payload.warnings).toEqual([]);
	});

	it("normalizes a bogus security verdict and a mistyped timestamp", () => {
		// A corrupt injected report shows the empty state (never "Status:
		// scanned"), and a non-string checkedAt regenerates — both keep
		// the endpoint's response validation green.
		const payload = buildVersionInfo({
			uiVersion: "1.0.0",
			backendVersion: "1.0.0",
			apiContract: { apiVersion: "1.0.0", accepts: {} },
			security: { status: "scanned", summary: "bogus" },
			checkedAt: 42,
		});
		expect(payload.security).toEqual({
			status: "unknown",
			checkedAt: null,
			summary: "",
			reportUrl: null,
		});
		expect(typeof payload.checkedAt).toBe("string");
		expect(payload.checkedAt).not.toBe("");
	});
});

describe("buildVersionInfo API tie-in", () => {
	const contract = (overrides = {}) => ({
		uiVersion: "1.0.0",
		backendVersion: "1.0.0",
		apiContract: { apiVersion: "1.0.0", accepts: { frontend: ">=1.0.0 <2.0.0" } },
		frontendApi: { apiVersion: "1.0.0", requiresBackendApi: ">=1.0.0 <2.0.0" },
		latest: {},
		checkedAt: "2026-11-16T00:00:00.000Z",
		...overrides,
	});

	it("reports up-to-date (not unknown) when no latest release is advertised", () => {
		// The default install advertises no latest knobs: every row shows
		// the installed release as the newest known — never Unknown.
		const payload = buildVersionInfo(contract());
		expect(payload.ui).toMatchObject({
			installed: "1.0.0",
			latest: "1.0.0",
			status: "up-to-date",
		});
		expect(payload.backend).toMatchObject({
			installed: "1.0.0",
			latest: "1.0.0",
			status: "up-to-date",
		});
		expect(payload.apis[0]).toMatchObject({
			installed: "1.0.0",
			latest: "1.0.0",
			status: "up-to-date",
		});
		expect(payload.warnings).toEqual([]);
	});

	it("ties the frontend API version to the backend contract with a verdict", () => {
		const payload = buildVersionInfo(contract());
		expect(payload.apis[0]).toMatchObject({
			installed: "1.0.0",
			frontendApiVersion: "1.0.0",
			requiresBackendApi: ">=1.0.0 <2.0.0",
			compatibility: { status: "compatible", detail: expect.any(String) },
		});
		expect(payload.apis[0].compatibility.detail).toContain("major 1");
	});

	it("reports incompatible when the UI and backend API contracts diverge", () => {
		// The verdict (with both versions named) lives on the API row; the
		// page renders its own incompatibility alert from it, so `warnings`
		// stays purely the newer-release list.
		const payload = buildVersionInfo(
			contract({
				frontendApi: { apiVersion: "2.0.0", requiresBackendApi: ">=2.0.0 <3.0.0" },
			}),
		);
		expect(payload.apis[0].compatibility.status).toBe("incompatible");
		expect(payload.apis[0].compatibility.detail).toContain("2.0.0");
		expect(payload.apis[0].compatibility.detail).toContain("1.0.0");
		expect(payload.warnings).toEqual([]);
	});

	it("reports unknown compatibility when the UI sends no contract", () => {
		const payload = buildVersionInfo(contract({ frontendApi: null }));
		expect(payload.apis[0]).toMatchObject({
			frontendApiVersion: null,
			requiresBackendApi: null,
			compatibility: { status: "unknown", detail: expect.any(String) },
		});
		expect(payload.warnings).toEqual([]);
	});
});
