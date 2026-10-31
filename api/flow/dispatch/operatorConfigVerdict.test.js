import { expect, test, describe } from "vitest";
import { operatorConfigVerdict } from "./operatorConfigVerdict.js";

/***
 * MARK: operatorConfigVerdict Tests
 * @description Verifies the shared operator-settings enforcement used by
 *   every claim path: project scope, job-type switches, and the tool
 *   subset refuse loudly, while unset/malformed config fails open so
 *   legacy Runners keep working.
 ***/
describe("operatorConfigVerdict", () => {
	test("allows everything when no operator config exists", () => {
		expect(operatorConfigVerdict({}, { kind: "ci", harness: "pi" }, { projectId: "p1" })).toEqual({
			ok: true,
			reason: "MATCH",
		});
		expect(operatorConfigVerdict(null, null, null)).toEqual({ ok: true, reason: "MATCH" });
	});

	test("fails open on malformed config shapes instead of throwing", () => {
		const record = { operatorConfig: { projectScope: "p1", jobTypes: "no", availableTools: 7 } };
		expect(operatorConfigVerdict(record, { kind: "ci", harness: "pi" }, {})).toEqual({
			ok: true,
			reason: "MATCH",
		});
	});

	test("refuses out-of-scope projects and a missing project id loudly", () => {
		const record = { operatorConfig: { projectScope: ["p1"] } };
		expect(operatorConfigVerdict(record, {}, { projectId: "p1" }).ok).toBe(true);
		expect(operatorConfigVerdict(record, {}, { projectId: "p2" }).reason).toBe("PROJECT_SCOPE");
		expect(operatorConfigVerdict(record, {}, {}).reason).toBe("PROJECT_SCOPE");
		expect(operatorConfigVerdict(record, { projectId: "p1" }, {}).ok).toBe(true);
	});

	test("refuses disabled job kinds but never impromptu work", () => {
		const record = {
			operatorConfig: { jobTypes: { runsCi: false, runsMerges: false, runsImpromptu: false } },
		};
		expect(operatorConfigVerdict(record, { kind: "ci" }, {}).reason).toBe("JOB_TYPE_DISABLED");
		expect(operatorConfigVerdict(record, { kind: "merge" }, {}).reason).toBe("JOB_TYPE_DISABLED");
		// Runs Impromptu stays a recorded preference: steers ride the owning
		// Runner's heartbeat, so this verdict must not strand them.
		expect(operatorConfigVerdict(record, { kind: "impromptu" }, {}).ok).toBe(true);
		expect(operatorConfigVerdict(record, { kind: "agent" }, {}).ok).toBe(true);
	});

	test("refuses tools outside the operator subset only when a harness is required", () => {
		const record = { operatorConfig: { availableTools: ["pi"] } };
		expect(operatorConfigVerdict(record, { harness: "pi" }, {}).ok).toBe(true);
		expect(operatorConfigVerdict(record, { harness: "vibe" }, {}).reason).toBe("TOOL_DISABLED");
		expect(operatorConfigVerdict(record, { kind: "ci" }, {}).ok).toBe(true);
	});
});
