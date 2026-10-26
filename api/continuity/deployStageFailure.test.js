// Domain: The Flow — unit tests for the shared deploy-stage failure context.
import { describe, it, expect } from "vitest";
import {
	attachDeployFailureFields,
	deployFailureReasonText,
	resolveDeployFailureContext,
} from "./deployStageFailure.js";

const DEPLOY_STAGE = { type: "merge", command: "./deploy.sh --prod" };

function storeWith({ lastResult = null, history = null } = {}) {
	return {
		deployManager: {
			readJson: (name) => (name === "last-result.json" ? lastResult : null),
			readHistory: () => history,
		},
	};
}

describe("The Flow: deploy stage failure context", () => {
	it("returns null for non-deploy stages and is total on untrusted input", async () => {
		expect(
			await resolveDeployFailureContext(storeWith(), {
				stage: { type: "agent" },
				command: "echo hi",
			}),
		).toBe(null);
		expect(await resolveDeployFailureContext(null, {})).toBe(null);
		expect(await resolveDeployFailureContext(storeWith(), null)).toBe(null);
	});

	it("resolves the durable cause and exposes the structured fields", async () => {
		const context = await resolveDeployFailureContext(
			storeWith({
				lastResult: {
					status: "failed",
					message: "Gate 'canary-e2e' failed (exit 1)",
					failedCommand: "npm run test:canary",
					details: "line1\nline2",
					deployAttemptId: "deploy-t-1",
				},
			}),
			{
				task: { deployAttemptId: "deploy-t-1" },
				stage: DEPLOY_STAGE,
				exitCode: 1,
				command: "./deploy.sh --prod",
			},
		);
		expect(context.failure.gate).toBe("canary-e2e");
		expect(context.projectBlocker).toBe(null);
		// No pristine-main evidence: guidance, never a "main is red" claim.
		expect(context.sharedGateGuidance).toContain("canary-e2e");
		expect(deployFailureReasonText(context)).toContain("canary-e2e");
	});

	it("classifies a project blocker from history evidence on the PRE-merge base", async () => {
		const context = await resolveDeployFailureContext(
			storeWith({
				lastResult: {
					status: "failed",
					message: "Gate 'canary-e2e' failed (exit 1)",
					failedCommand: "npm run test:canary",
					deployAttemptId: "deploy-t-1",
				},
				history: [
					{ status: "failed", message: "Gate 'canary-e2e' failed (exit 1)", headSha: "abc123" },
				],
			}),
			{
				task: { deployAttemptId: "deploy-t-1", preMergeMainSha: "abc123" },
				stage: DEPLOY_STAGE,
				exitCode: 1,
				command: "./deploy.sh --prod",
			},
		);
		expect(context.projectBlocker).toEqual({
			gate: "canary-e2e",
			mainBranch: "main",
			mainSha: "abc123",
			key: "canary-e2e@abc123",
			reason: expect.stringContaining("no task change will pass"),
		});
		expect(context.sharedGateGuidance).toBe("");
		expect(deployFailureReasonText(context)).toContain("no task change will pass");
	});

	it("attributes the shared gate to the frozen review baseline after the merge split", async () => {
		// The merge stage consumed `preMergeMainSha` on pass; a standalone
		// deploy stage must still attribute against the pre-merge base (the
		// baseline's mainSha), not the post-merge HEAD that contains this
		// task's own merge.
		const context = await resolveDeployFailureContext(
			storeWith({
				lastResult: {
					status: "failed",
					message: "Gate 'canary-e2e' failed (exit 1)",
					failedCommand: "npm run test:canary",
					deployAttemptId: "deploy-t-1",
				},
				history: [
					{ status: "failed", message: "Gate 'canary-e2e' failed (exit 1)", headSha: "base-9" },
				],
			}),
			{
				task: {
					deployAttemptId: "deploy-t-1",
					reviewBaseline: { mainSha: "base-9", mergedAt: "2026-10-14T00:00:00.000Z" },
				},
				stage: DEPLOY_STAGE,
				exitCode: 1,
				command: "./deploy.sh --prod",
			},
		);
		expect(context.projectBlocker).toEqual({
			gate: "canary-e2e",
			mainBranch: "main",
			mainSha: "base-9",
			key: "canary-e2e@base-9",
			reason: expect.stringContaining("no task change will pass"),
		});
	});

	it("does not probe the current HEAD when the pre-merge base is unknown and cwd is empty", async () => {
		// No cwd → no branch/SHA fallback, no history match → task failure.
		const context = await resolveDeployFailureContext(
			storeWith({
				lastResult: {
					status: "failed",
					message: "Gate 'final-test-suite' failed (exit 1)",
				},
				history: [{ status: "failed", message: "Gate 'final-test-suite' failed (exit 1)", headSha: "head" }],
			}),
			{ task: {}, stage: DEPLOY_STAGE, exitCode: 1, command: "./deploy.sh --prod" },
		);
		expect(context.projectBlocker).toBe(null);
		expect(context.sharedGateGuidance).toContain("final-test-suite");
	});

	it("ignores non-shared gates entirely", async () => {
		const context = await resolveDeployFailureContext(
			storeWith({
				lastResult: {
					status: "failed",
					message: "Gate 'staged-verify' failed (exit 1)",
					deployAttemptId: "deploy-t-1",
				},
			}),
			{
				task: { deployAttemptId: "deploy-t-1", preMergeMainSha: "abc" },
				stage: DEPLOY_STAGE,
				exitCode: 1,
				command: "./deploy.sh --prod",
			},
		);
		expect(context.projectBlocker).toBe(null);
		expect(context.sharedGateGuidance).toBe("");
	});

	it("renders and attaches total, empty-safe output", () => {
		expect(deployFailureReasonText(null)).toBe("");
		expect(deployFailureReasonText({})).toBe("");
		const error = new Error("base");
		expect(attachDeployFailureFields(error, null)).toBe(error);
		expect(error.deployGate).toBeUndefined();
		expect(attachDeployFailureFields(null, {})).toBe(null);
		const enriched = attachDeployFailureFields(new Error("x"), {
			failure: { gate: "canary-e2e", failedCommand: "npm run test:canary", attemptId: "a1" },
			projectBlocker: { gate: "canary-e2e", key: "k" },
		});
		expect(enriched).toMatchObject({
			deployGate: "canary-e2e",
			deployFailedCommand: "npm run test:canary",
			deployAttemptId: "a1",
			projectBlocker: { gate: "canary-e2e", key: "k" },
		});
	});
});
