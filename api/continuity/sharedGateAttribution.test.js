// Domain: The Flow — unit tests for shared deploy-gate attribution.
import { describe, it, expect } from "vitest";
import {
	SHARED_DEPLOY_GATES,
	attributeSharedGateFailure,
	findSharedGateFailureInHistory,
	formatProjectBlockerReason,
	isSharedDeployGate,
	projectBlockerKey,
	readSharedGateProbe,
	recordSharedGateProbe,
	resolveSharedGateProbe,
} from "./sharedGateAttribution.js";

function historyStore(records) {
	return { deployManager: { readHistory: () => records } };
}

describe("The Flow: shared deploy-gate attribution", () => {
	it("recognises the shared gates and nothing else", () => {
		expect(SHARED_DEPLOY_GATES).toContain("canary-e2e");
		expect(SHARED_DEPLOY_GATES).toContain("final-test-suite");
		expect(isSharedDeployGate("canary-e2e")).toBe(true);
		expect(isSharedDeployGate("Canary-E2E")).toBe(true);
		expect(isSharedDeployGate("final-test-suite")).toBe(true);
		expect(isSharedDeployGate("unit")).toBe(false);
		expect(isSharedDeployGate("")).toBe(false);
		expect(isSharedDeployGate(null)).toBe(false);
		expect(isSharedDeployGate(42)).toBe(false);
	});

	it("classifies main-red as a project blocker with budget preserved", () => {
		const verdict = attributeSharedGateFailure({
			gate: "canary-e2e",
			taskGateFailed: true,
			mainGateFailed: true,
			mainBranch: "main",
			mainSha: "abc123",
		});
		expect(verdict.kind).toBe("project-blocker");
		expect(verdict.shared).toBe(true);
		expect(verdict.preserveBudget).toBe(true);
		expect(verdict.key).toBe("canary-e2e@abc123");
		expect(verdict.reason).toContain("canary-e2e");
		expect(verdict.reason).toContain("main");
		expect(verdict.reason).toContain("no task change will pass");
	});

	it("keeps task-broken gates as task failures (even shared ones)", () => {
		const mainGreen = attributeSharedGateFailure({
			gate: "canary-e2e",
			taskGateFailed: true,
			mainGateFailed: false,
			mainSha: "abc123",
		});
		expect(mainGreen.kind).toBe("task-failure");
		expect(mainGreen.shared).toBe(true);
		expect(mainGreen.preserveBudget).toBe(false);

		const nonShared = attributeSharedGateFailure({
			gate: "security-scan",
			taskGateFailed: true,
			mainGateFailed: true,
			mainSha: "abc123",
		});
		expect(nonShared.kind).toBe("task-failure");
		expect(nonShared.shared).toBe(false);

		const noFailure = attributeSharedGateFailure({
			gate: "canary-e2e",
			taskGateFailed: false,
			mainGateFailed: true,
			mainSha: "abc123",
		});
		expect(noFailure.kind).toBe("task-failure");
	});

	it("records and reads pristine-main probes keyed by gate@sha", () => {
		const store = {};
		expect(recordSharedGateProbe(store, { gate: "canary-e2e", mainSha: "abc", passed: false })).toBe(true);
		expect(readSharedGateProbe(store, { gate: "canary-e2e", mainSha: "abc" })).toMatchObject({
			gate: "canary-e2e",
			mainSha: "abc",
			passed: false,
		});
		expect(readSharedGateProbe(store, { gate: "canary-e2e", mainSha: "other" })).toBe(null);
		expect(recordSharedGateProbe(store, { gate: "unit", mainSha: "abc", passed: false })).toBe(false);
		expect(recordSharedGateProbe(null, { gate: "canary-e2e", mainSha: "abc" })).toBe(false);
		expect(readSharedGateProbe(null, { gate: "canary-e2e", mainSha: "abc" })).toBe(null);
	});

	it("builds stable dedupe keys and readable reasons", () => {
		expect(projectBlockerKey({ gate: "canary-e2e", mainSha: "abc" })).toBe("canary-e2e@abc");
		expect(projectBlockerKey({ gate: "", mainSha: "abc" })).toBe(null);
		expect(projectBlockerKey({})).toBe(null);
		expect(
			formatProjectBlockerReason({ gate: "canary-e2e", mainBranch: "main", mainSha: "abc123" }),
		).toContain("red-shared-gate");
		expect(formatProjectBlockerReason()).toContain("shared");
	});

	it("is total when called with a null args object", () => {
		expect(projectBlockerKey(null)).toBe(null);
		expect(formatProjectBlockerReason(null)).toContain("shared");
		expect(attributeSharedGateFailure(null)).toMatchObject({ kind: "task-failure" });
		expect(recordSharedGateProbe({}, null)).toBe(false);
		expect(readSharedGateProbe({}, null)).toBe(null);
		expect(resolveSharedGateProbe(null, null)).toBe(null);
	});

	describe("deploy-history derived probe", () => {
		const failedRecord = {
			status: "failed",
			message: "Gate 'canary-e2e' failed (exit 1)",
			headSha: "ABC123",
			finishedAt: "2026-10-12T10:14:00Z",
		};

		it("proves a gate red on the exact SHA it already failed on", () => {
			const probe = findSharedGateFailureInHistory(historyStore([failedRecord]), {
				gate: "canary-e2e",
				mainSha: "abc123",
			});
			expect(probe).toMatchObject({
				gate: "canary-e2e",
				mainSha: "abc123",
				passed: false,
				source: "history",
			});
		});

		it("ignores a different SHA, a different gate, and non-failed records", () => {
			expect(
				findSharedGateFailureInHistory(historyStore([failedRecord]), {
					gate: "canary-e2e",
					mainSha: "other",
				}),
			).toBe(null);
			expect(
				findSharedGateFailureInHistory(historyStore([failedRecord]), {
					gate: "final-test-suite",
					mainSha: "abc123",
				}),
			).toBe(null);
			expect(
				findSharedGateFailureInHistory(
					historyStore([{ ...failedRecord, status: "success" }]),
					{ gate: "canary-e2e", mainSha: "abc123" },
				),
			).toBe(null);
		});

		it("never invents evidence from malformed or missing history", () => {
			expect(findSharedGateFailureInHistory(historyStore([]), { gate: "canary-e2e", mainSha: "a" })).toBe(null);
			expect(findSharedGateFailureInHistory({}, { gate: "canary-e2e", mainSha: "a" })).toBe(null);
			expect(findSharedGateFailureInHistory(null, { gate: "canary-e2e", mainSha: "a" })).toBe(null);
			expect(findSharedGateFailureInHistory(historyStore([{ headSha: "a" }]), { gate: "canary-e2e", mainSha: "a" })).toBe(null);
			expect(findSharedGateFailureInHistory(historyStore([failedRecord]), { gate: "unit", mainSha: "abc123" })).toBe(null);
			expect(findSharedGateFailureInHistory(historyStore([failedRecord]), { gate: "canary-e2e", mainSha: "" })).toBe(null);
			expect(findSharedGateFailureInHistory(null, null)).toBe(null);
		});

		it("scans only the trailing window when a limit is given", () => {
			const old = { ...failedRecord };
			const recent = { ...failedRecord, headSha: "zzz" };
			expect(
				findSharedGateFailureInHistory(historyStore([old, recent]), {
					gate: "canary-e2e",
					mainSha: "abc123",
					limit: 1,
				}),
			).toBe(null);
		});

		it("prefers an explicit cached probe over the history", () => {
			const store = historyStore([{ ...failedRecord, status: "success" }]);
			recordSharedGateProbe(store, { gate: "canary-e2e", mainSha: "abc123", passed: false });
			const probe = resolveSharedGateProbe(store, { gate: "canary-e2e", mainSha: "abc123" });
			expect(probe).toMatchObject({ passed: false, source: "probe" });
		});

		it("falls back to the history when no probe is cached and returns null otherwise", () => {
			expect(
				resolveSharedGateProbe(historyStore([failedRecord]), {
					gate: "canary-e2e",
					mainSha: "abc123",
				}),
			).toMatchObject({ passed: false, source: "history" });
			expect(resolveSharedGateProbe(historyStore([]), { gate: "canary-e2e", mainSha: "abc123" })).toBe(null);
			expect(resolveSharedGateProbe(null, { gate: "canary-e2e", mainSha: "abc123" })).toBe(null);
		});
	});
});
