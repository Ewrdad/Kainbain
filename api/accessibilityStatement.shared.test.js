import { describe, it, expect } from "vitest";
import {
	ARTIFACT_SCHEMA_VERSION,
	AAA_STATUSES,
	AAA_STATUS_LABELS,
	FALLBACK_ARTIFACT,
	FALLBACK_KNOWN_ISSUES,
	FALLBACK_READINESS,
	FALLBACK_STATUSES,
	GROUP_AAA_LABELS,
	NEED_GROUPS,
	NEED_GROUP_IDS,
	READINESS_LABELS,
	READINESS_LEVELS,
	WCAG22_AAA_CRITERIA,
	WCAG30_OUTCOMES,
	groupStatementResults,
	isNeedGroupId,
	parseResultsArtifact,
} from "../shared/accessibilityStatement.js";

/***
 * MARK: accessibilityStatement shared contract tests
 * @description Pins the single source of truth behind the dynamic
 *   accessibility statement: catalogue shape (28 AAA criteria + 10 draft
 *   outcomes across exactly the five need groups), the lenient parser
 *   (missing/malformed/unknown inputs never crash, gaps render as
 *   `unknown`), the group aggregation rule, and the curated fallback
 *   artifact (zero parser warnings).
 ***/

describe("need-group catalogue", () => {
	it("defines exactly the five survey groups", () => {
		expect(NEED_GROUP_IDS).toEqual([
			"seeing",
			"hearing",
			"getting-around",
			"thinking",
			"helpful-tech",
		]);
		for (const group of NEED_GROUPS) {
			expect(group.label.trim().length).toBeGreaterThan(0);
			expect(group.blurb.trim().length).toBeGreaterThan(0);
		}
	});

	it("recognises only the five group ids", () => {
		expect(isNeedGroupId("seeing")).toBe(true);
		expect(isNeedGroupId("helpful-tech")).toBe(true);
		expect(isNeedGroupId("smell")).toBe(false);
		expect(isNeedGroupId("")).toBe(false);
		expect(isNeedGroupId(null)).toBe(false);
		expect(isNeedGroupId(undefined)).toBe(false);
	});
});

describe("WCAG 2.2 AAA catalogue", () => {
	it("holds the 28 AAA-level criteria, each in exactly one valid group", () => {
		expect(WCAG22_AAA_CRITERIA).toHaveLength(28);
		const ids = new Set();
		for (const criterion of WCAG22_AAA_CRITERIA) {
			expect(ids.has(criterion.id)).toBe(false);
			ids.add(criterion.id);
			expect(isNeedGroupId(criterion.group)).toBe(true);
			expect(criterion.title.trim().length).toBeGreaterThan(0);
			expect(criterion.plainWords.trim().length).toBeGreaterThan(0);
			expect(criterion.instrument.trim().length).toBeGreaterThan(0);
		}
	});

	it("covers every need group with at least one criterion", () => {
		for (const id of NEED_GROUP_IDS) {
			expect(WCAG22_AAA_CRITERIA.some((entry) => entry.group === id)).toBe(true);
		}
	});

	it("labels every status in plain words", () => {
		for (const status of AAA_STATUSES) {
			expect(typeof AAA_STATUS_LABELS[status]).toBe("string");
			expect(AAA_STATUS_LABELS[status].length).toBeGreaterThan(0);
		}
		for (const label of Object.values(GROUP_AAA_LABELS)) {
			expect(label.length).toBeGreaterThan(0);
		}
	});
});

describe("WCAG 3.0 outcome catalogue", () => {
	it("holds advisory-only draft outcomes, each in exactly one valid group", () => {
		expect(WCAG30_OUTCOMES.length).toBeGreaterThan(0);
		const ids = new Set();
		for (const outcome of WCAG30_OUTCOMES) {
			expect(ids.has(outcome.id)).toBe(false);
			ids.add(outcome.id);
			expect(isNeedGroupId(outcome.group)).toBe(true);
			expect(outcome.plainWords.trim().length).toBeGreaterThan(0);
			expect(outcome.approximatedBy.trim().length).toBeGreaterThan(0);
		}
	});

	it("covers every need group with at least one outcome", () => {
		for (const id of NEED_GROUP_IDS) {
			expect(WCAG30_OUTCOMES.some((entry) => entry.group === id)).toBe(true);
		}
	});

	it("uses readiness vocabulary, never conformance language", () => {
		expect(READINESS_LEVELS).toEqual(["supported", "partial", "unknown", "not-applicable"]);
		for (const level of READINESS_LEVELS) {
			expect(typeof READINESS_LABELS[level]).toBe("string");
		}
		// No pass/fail/conformant wording anywhere in the readiness labels.
		expect(Object.values(READINESS_LABELS).join(" ")).not.toMatch(/pass|fail|conform/i);
	});
});

describe("parseResultsArtifact", () => {
	it("parses the curated fallback with zero warnings", () => {
		const { artifact, warnings } = parseResultsArtifact(FALLBACK_ARTIFACT);
		expect(warnings).toEqual([]);
		expect(artifact.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
		expect(artifact.wcag22aaa).toHaveLength(28);
		expect(artifact.wcag30).toHaveLength(WCAG30_OUTCOMES.length);
		expect(artifact.knownIssues).toHaveLength(FALLBACK_KNOWN_ISSUES.length);
	});

	it("degrades a missing artifact to safe defaults with a warning", () => {
		for (const raw of [null, undefined]) {
			const { artifact, warnings } = parseResultsArtifact(raw);
			expect(warnings.length).toBeGreaterThan(0);
			expect(artifact.wcag22aaa).toHaveLength(28);
			expect(artifact.wcag22aaa.every((row) => row.status === "unknown")).toBe(true);
			expect(artifact.wcag30.every((row) => row.readiness === "unknown")).toBe(true);
			expect(artifact.knownIssues).toEqual([]);
			expect(artifact.generatedAt).toBeNull();
			expect(artifact.contactEmail).toBe("");
		}
	});

	it("degrades a non-object artifact without throwing", () => {
		for (const raw of ["nope", 42, ["x"]]) {
			const { artifact, warnings } = parseResultsArtifact(raw);
			expect(warnings.length).toBeGreaterThan(0);
			expect(artifact.wcag22aaa).toHaveLength(28);
		}
	});

	it("warns on a schema version mismatch but still reads known fields", () => {
		const { artifact, warnings } = parseResultsArtifact({
			...FALLBACK_ARTIFACT,
			schemaVersion: 999,
		});
		expect(warnings.some((w) => w.includes("999"))).toBe(true);
		expect(artifact.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
		expect(artifact.wcag22aaa).toHaveLength(28);
	});

	it("skips malformed entries and ignores unknown ids, never crashing render", () => {
		const { artifact, warnings } = parseResultsArtifact({
			schemaVersion: 1,
			wcag22aaa: [
				null,
				"nope",
				{ criterion: "9.9.9", status: "pass" },
				{ criterion: "1.4.6", status: "bogus" },
				{ criterion: "1.4.6", status: "pass", evidence: "ok" },
			],
			wcag30: [{ outcome: "nope", readiness: "supported" }, null],
			knownIssues: [{ id: "", summary: "", group: "seeing" }, null],
		});
		expect(warnings.length).toBeGreaterThan(0);
		// The catalogue still renders exactly once per row; gaps are unknown.
		expect(artifact.wcag22aaa).toHaveLength(28);
		expect(artifact.wcag22aaa.find((row) => row.criterion === "1.4.6")).toMatchObject({
			status: "pass",
			evidence: "ok",
		});
		expect(
			artifact.wcag22aaa.find((row) => row.criterion === "2.1.3").status,
		).toBe("unknown");
		expect(artifact.knownIssues).toEqual([]);
	});

	it("omits a malformed contact email with a warning", () => {
		const { artifact, warnings } = parseResultsArtifact({
			...FALLBACK_ARTIFACT,
			contactEmail: "not an email",
		});
		expect(artifact.contactEmail).toBe("");
		expect(warnings.some((w) => w.includes("contact email"))).toBe(true);
	});

	it("keeps a well-formed contact email", () => {
		const { artifact, warnings } = parseResultsArtifact({
			...FALLBACK_ARTIFACT,
			contactEmail: "team@example.com",
		});
		expect(warnings).toEqual([]);
		expect(artifact.contactEmail).toBe("team@example.com");
	});
});

describe("groupStatementResults", () => {
	it("returns one entry per need group with dual statuses", () => {
		const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
		const grouped = groupStatementResults(artifact);
		expect(grouped.map((entry) => entry.group.id)).toEqual(NEED_GROUP_IDS);
		for (const entry of grouped) {
			expect(typeof entry.aaaLabel).toBe("string");
			expect(typeof entry.w30Label).toBe("string");
			expect(entry.aaaRows.length).toBeGreaterThan(0);
			expect(entry.w30Rows.length).toBeGreaterThan(0);
		}
	});

	it("aggregates the fallback to the mapping doc's expected group statuses", () => {
		const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
		const byId = new Map(groupStatementResults(artifact).map((entry) => [entry.group.id, entry]));
		expect(byId.get("seeing").aaaStatus).toBe("partly-supported");
		expect(byId.get("seeing").w30Readiness).toBe("supported");
		expect(byId.get("hearing").aaaStatus).toBe("not-applicable");
		expect(byId.get("hearing").w30Readiness).toBe("supported");
		expect(byId.get("getting-around").aaaStatus).toBe("partly-supported");
		expect(byId.get("getting-around").w30Readiness).toBe("partial");
		expect(byId.get("thinking").aaaStatus).toBe("partly-supported");
		expect(byId.get("thinking").w30Readiness).toBe("partial");
		expect(byId.get("helpful-tech").aaaStatus).toBe("supported");
		expect(byId.get("helpful-tech").w30Readiness).toBe("supported");
	});

	it("marks groups unknown when the artifact omits their rows", () => {
		const { artifact } = parseResultsArtifact(null);
		for (const entry of groupStatementResults(artifact)) {
			expect(entry.aaaStatus).toBe("unknown");
			expect(entry.w30Readiness).toBe("unknown");
		}
	});

	it("attaches known issues to their groups", () => {
		const { artifact } = parseResultsArtifact(FALLBACK_ARTIFACT);
		const byId = new Map(groupStatementResults(artifact).map((entry) => [entry.group.id, entry]));
		expect(byId.get("getting-around").knownIssues).toHaveLength(2);
		expect(byId.get("seeing").knownIssues).toHaveLength(1);
		expect(byId.get("hearing").knownIssues).toHaveLength(0);
	});

	it("keeps every fallback status and readiness value inside the vocabularies", () => {
		for (const [id, status] of Object.entries(FALLBACK_STATUSES)) {
			expect(AAA_STATUSES).toContain(status);
			expect(WCAG22_AAA_CRITERIA.some((entry) => entry.id === id)).toBe(true);
		}
		expect(Object.keys(FALLBACK_STATUSES)).toHaveLength(28);
		for (const [id, readiness] of Object.entries(FALLBACK_READINESS)) {
			expect(READINESS_LEVELS).toContain(readiness);
			expect(WCAG30_OUTCOMES.some((entry) => entry.id === id)).toBe(true);
		}
	});
});
