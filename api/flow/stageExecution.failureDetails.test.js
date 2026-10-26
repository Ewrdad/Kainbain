// Domain: The Flow — subject unit tests for the retry-prompt failure details.
import { describe, it, expect } from "vitest";
import {
	buildRetryFailureDetails,
	retryPromptLogBudget,
} from "./stageExecution.js";

/**
 * MARK: retry failure-details tests
 * @description Pins the WP7 head+tail behaviour where it matters most: the
 *   re-run prompt. A tail-only cut discards the stack-trace root the next
 *   attempt must fix; these tests prove the head survives.
 */
describe("buildRetryFailureDetails", () => {
	it("returns null when there is nothing to report", () => {
		expect(buildRetryFailureDetails()).toBeNull();
		expect(buildRetryFailureDetails({})).toBeNull();
		expect(
			buildRetryFailureDetails({ priorStdout: "   ", priorStderr: "" }),
		).toBeNull();
	});

	it("never throws on malformed inputs", () => {
		expect(() => buildRetryFailureDetails(null)).not.toThrow();
		expect(() => buildRetryFailureDetails({ priorStdout: 42 })).not.toThrow();
		expect(buildRetryFailureDetails({ priorStdout: 42 })).toBeNull();
	});

	it("passes short logs through unchanged", () => {
		const details = buildRetryFailureDetails({
			priorFailure: "tests failed",
			priorStdout: "ok 1\nok 2",
			priorStderr: "warning: slow",
		});
		expect(details).toContain("Error / Failure Reason:\ntests failed");
		expect(details).toContain("ok 1\nok 2");
		expect(details).toContain("warning: slow");
		expect(details).toContain("MUST resolve these failures");
	});

	it("names the failed stage when known", () => {
		const named = buildRetryFailureDetails({
			priorFailure: "boom",
			priorFailedStage: "Implementation",
			priorFailedStageType: "agent",
		});
		expect(named).toContain('The previous stage "Implementation" (agent) failed');
		const unnamed = buildRetryFailureDetails({ priorFailure: "boom" });
		expect(unnamed).toContain("The previous stage failed");
	});

	it("keeps the stack-trace head in long prior output", () => {
		const head = [
			"TypeError: Cannot read properties of undefined (reading 'id')",
			"    at buildTask (/app/src/tasks.js:42:15)",
		].join("\n");
		const middle = Array.from(
			{ length: 500 },
			(_, i) => `    at noisyFrame (/app/node_modules/dep/index.js:${1000 + i}:7)`,
		).join("\n");
		const tail = "[ERROR] Stage failed after 3 attempts";
		const priorStderr = `${head}\n${middle}\n${tail}`;
		expect(priorStderr.length).toBeGreaterThan(retryPromptLogBudget);
		const details = buildRetryFailureDetails({ priorStderr });
		expect(details).toContain("TypeError: Cannot read properties of undefined");
		expect(details).toContain("at buildTask (/app/src/tasks.js:42:15)");
		expect(details).toContain(tail);
		expect(details).toMatch(/lines omitted/);
	});

	it("caps each stream at the retry-prompt budget", () => {
		const big = `Error: root\n${"middle\n".repeat(3000)}final diagnostic`;
		const details = buildRetryFailureDetails({
			priorStdout: big,
			priorStderr: big,
		});
		for (const section of details.split("Diagnostic Output")) {
			expect(section.length).toBeLessThan(retryPromptLogBudget + 500);
		}
		expect(details).toContain("Error: root");
		expect(details).toContain("final diagnostic");
	});
});
