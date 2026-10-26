// Domain: The Flow — routing tables hold the declarative data; loop and
// orchestration code must never duplicate these values.
import { describe, it, expect } from "vitest";
import { failureLogExcerptLimit } from "./failureLogExcerptLimit.js";
import { transientRetryDefaults } from "./transientRetryDefaults.js";
import { harnessRetryableBlips } from "./harnessRetryableBlips.js";
import { PROJECT_BLOCKER_ALERT_MEMORY_LIMIT } from "./projectBlockerAlertLimits.js";
import { QUEUE_EMPTY_DEBOUNCE_MS } from "./queueEmptyDebounce.js";
import { RESUMED_PRIORITY_REASON } from "./resumedPriorityReason.js";
import { RESUMED_QUEUE_REASON } from "./resumedQueueReason.js";
import { RESUMED_PRIORITY_RANK } from "./resumedPriorityRank.js";
import { retryPromptLogBudget } from "./retryPromptLogBudget.js";

describe("routing tables", () => {
	it("failureLogExcerptLimit caps timeline excerpts", () => {
		expect(failureLogExcerptLimit).toBe(3072);
	});
	it("transientRetryDefaults carry exponential backoff knobs", () => {
		expect(transientRetryDefaults).toMatchObject({
			baseMs: 2000,
			capMs: 60000,
			jitterMs: 1000,
			strategy: "exponential",
			maxAttempts: 5,
		});
	});
	it("harnessRetryableBlips is a narrow signal-tagged allowlist", () => {
		expect(harnessRetryableBlips.length).toBe(3);
		for (const entry of harnessRetryableBlips) {
			expect(entry.re).toBeInstanceOf(RegExp);
			expect(typeof entry.signal).toBe("string");
		}
	});
	it("project-blocker alert memory stays bounded", () => {
		expect(PROJECT_BLOCKER_ALERT_MEMORY_LIMIT).toBe(200);
	});
	it("queue-empty debounce is a positive delay", () => {
		expect(QUEUE_EMPTY_DEBOUNCE_MS).toBe(5000);
	});
	it("resumed-priority rows keep Rule 0 ahead of follow-on work", () => {
		expect(RESUMED_PRIORITY_REASON).toBe("resumed_interrupted");
		expect(RESUMED_QUEUE_REASON).toBe("Resumed after interruption — prioritised");
		expect(RESUMED_PRIORITY_RANK).toBe(0.5);
	});
	it("retryPromptLogBudget bounds retry-prompt excerpts", () => {
		expect(retryPromptLogBudget).toBe(4000);
	});
});
