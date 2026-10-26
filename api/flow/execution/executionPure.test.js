// Domain: The Flow — execution-loop pure helpers (display peeks, compaction
// hint, retry-prompt details) pinned without running stages.
import { describe, it, expect } from "vitest";
import { harnessName } from "./harnessName.js";
import { peekStageDisplayTarget } from "./peekStageDisplayTarget.js";
import { displayModelForInit } from "./displayModelForInit.js";
import { withCompactionHint } from "./withCompactionHint.js";
import { buildRetryFailureDetails } from "./buildRetryFailureDetails.js";
import { resolveRunHarnessFallback } from "./resolveRunHarnessFallback.js";

describe("harnessName", () => {
	it("falls back to agent without a session store", () => {
		expect(harnessName({})).toBe("agent");
		expect(harnessName(null)).toBe("agent");
	});
});

describe("peekStageDisplayTarget", () => {
	it("returns null when no session store is wired or the read throws", () => {
		expect(peekStageDisplayTarget({}, null, {})).toBeNull();
		expect(
			peekStageDisplayTarget(
				{
					sessionStore: {
						resolveDisplayTarget() {
							throw new Error("boom");
						},
					},
				},
				null,
				{},
			),
		).toBeNull();
	});
	it("peeks without consuming", () => {
		const target = { harnessName: "pi" };
		const store = {
			sessionStore: {
				resolveDisplayTarget: (project, stage, opts) => {
					expect(opts).toMatchObject({ peek: true });
					return target;
				},
			},
		};
		expect(peekStageDisplayTarget(store, null, {})).toBe(target);
	});
});

describe("displayModelForInit", () => {
	it("keeps the legacy wording for null targets", () => {
		expect(displayModelForInit(null, { model: "w" })).toBe("w");
		expect(displayModelForInit(null, {})).toBe("default");
	});
	it("shows the pick model for resolved aliases, never the alias name", () => {
		expect(displayModelForInit({ modelRef: "gemini-x", aliasName: "w" }, { model: "w" })).toBe("gemini-x");
		expect(displayModelForInit({ aliasName: "w" }, { model: "w" })).toBe("default");
	});
});

describe("withCompactionHint", () => {
	it("appends the hint to string errors", () => {
		const out = withCompactionHint("context overflow");
		expect(out).toBeInstanceOf(Error);
		expect(out.message).toContain("[Compaction Hint]");
	});
	it("keeps carrier fields on Error inputs", () => {
		const err = new Error("context overflow");
		err.code = 1;
		const out = withCompactionHint(err);
		expect(out.code).toBe(1);
		expect(out.message).toContain("[Compaction Hint]");
	});
});

describe("buildRetryFailureDetails", () => {
	it("returns null when there is nothing to report", () => {
		expect(buildRetryFailureDetails({})).toBeNull();
	});
	it("includes the failure reason when present", () => {
		const details = buildRetryFailureDetails({ priorFailure: "tests failed" });
		expect(details).toContain("tests failed");
	});
});

describe("resolveRunHarnessFallback", () => {
	const piStore = {
		sessionStore: {
			resolveDisplayTarget: () => ({ harnessName: "pi" }),
		},
	};
	it("fills the blank from the peeked display target", () => {
		expect(resolveRunHarnessFallback(piStore, null, {})).toBe("pi");
	});
	it("returns undefined when the peek is blank, unknown, or throws", () => {
		expect(resolveRunHarnessFallback({}, null, {})).toBeUndefined();
		expect(
			resolveRunHarnessFallback(
				{ sessionStore: { resolveDisplayTarget: () => ({ harnessName: "nope-not-a-harness" }) } },
				null,
				{},
			),
		).toBeUndefined();
		expect(
			resolveRunHarnessFallback(
				{
					sessionStore: {
						resolveDisplayTarget: () => {
							throw new Error("peek must never break attribution");
						},
					},
				},
				null,
				{},
			),
		).toBeUndefined();
	});
});
