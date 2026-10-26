// Domain: The Flow — unit tests for the deploy failure reason resolver.
import { describe, it, expect } from "vitest";
import {
	DEPLOY_FAILURE_TAIL_LINES,
	extractGateName,
	resolveDeployStageFailure,
	usableLastResultFailure,
	tailLines,
} from "./deployFailureReason.js";

const DEPLOY_STAGE = { type: "merge", command: "./deploy.sh --prod" };

function storeWith(result, checkpoint = null) {
	return {
		deployManager: {
			readJson: (name) => {
				if (name === "last-result.json") return result;
				if (checkpoint && name.startsWith("attempt-")) return checkpoint;
				return null;
			},
		},
	};
}

describe("The Flow: deploy failure reason", () => {
	it("returns null for non-deploy stages", () => {
		const store = storeWith(null);
		expect(
			resolveDeployStageFailure(store, {
				stage: { type: "agent" },
				command: "echo hi",
				exitCode: 1,
			}),
		).toBe(null);
		expect(
			resolveDeployStageFailure(store, {
				stage: null,
				command: "",
				exitCode: 1,
			}),
		).toBe(null);
	});

	it("resolves the gate, command, and tail from last-result.json", () => {
		const store = storeWith({
			status: "failed",
			message: "Gate 'canary-e2e' failed (exit 1)",
			failedCommand: "npm run test:canary",
			details: "line1\nline2\nline3",
			deployAttemptId: "deploy-967e81c3-1",
		});
		const resolved = resolveDeployStageFailure(store, {
			task: { deployAttemptId: "deploy-967e81c3-1" },
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved.gate).toBe("canary-e2e");
		expect(resolved.failedCommand).toBe("npm run test:canary");
		expect(resolved.attemptId).toBe("deploy-967e81c3-1");
		expect(resolved.tail).toContain("line3");
		expect(resolved.reason).toContain("canary-e2e");
		expect(resolved.reason).toContain("npm run test:canary");
		expect(resolved.reason).toContain("last-result.json");
	});

	it("prefers a terminal per-attempt checkpoint over a stale last-result", () => {
		const store = storeWith(
			{
				status: "failed",
				message: "Gate 'final-test-suite' failed (exit 1)",
				failedCommand: "./run-tests.sh",
			},
			{
				status: "failed",
				message: "Gate 'canary-e2e' failed (exit 1)",
				failedCommand: "npm run test:canary",
				details: "canary tail",
			},
		);
		const resolved = resolveDeployStageFailure(store, {
			task: { deployAttemptId: "deploy-abc-1" },
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved.gate).toBe("canary-e2e");
		expect(resolved.tail).toContain("canary tail");
	});

	it("never lets another attempt's last-result impersonate this failure", () => {
		// Host-wide last-result.json from ANOTHER task's failed deploy.
		const store = storeWith({
			status: "failed",
			message: "Gate 'canary-e2e' failed (exit 1)",
			failedCommand: "npm run test:canary",
			deployAttemptId: "deploy-other-task-7",
		});
		const resolved = resolveDeployStageFailure(store, {
			task: { deployAttemptId: "deploy-this-task-1" },
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved.gate).toBe(null);
		expect(resolved.reason).not.toContain("canary-e2e");
		expect(resolved.attemptId).toBe("deploy-this-task-1");
	});

	it("never reports the cause of a successful or in-flight deploy", () => {
		for (const status of ["success", "deploying"]) {
			const store = storeWith({
				status,
				message: "Deployment complete and healthy",
				deployAttemptId: "deploy-this-task-1",
			});
			const resolved = resolveDeployStageFailure(store, {
				task: { deployAttemptId: "deploy-this-task-1" },
				stage: DEPLOY_STAGE,
				exitCode: 1,
				command: "./deploy.sh --prod",
			});
			expect(resolved.gate).toBe(null);
			expect(resolved.reason).toContain("exit 1");
		}
	});

	it("accepts a failed last-result without attempt ids (manual/legacy runs)", () => {
		const store = storeWith({
			status: "failed",
			message: "Gate 'final-test-suite' failed (exit 1)",
			failedCommand: "./run-tests.sh",
		});
		const resolved = resolveDeployStageFailure(store, {
			task: {},
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved.gate).toBe("final-test-suite");
	});

	it("usableLastResultFailure is total on untrusted input", () => {
		expect(usableLastResultFailure(null)).toBe(null);
		expect(usableLastResultFailure("nope")).toBe(null);
		expect(usableLastResultFailure([])).toBe(null);
		expect(usableLastResultFailure({ status: "success" }, "a")).toBe(null);
		expect(usableLastResultFailure({ status: "failed" }, "a")).toMatchObject({ status: "failed" });
		expect(usableLastResultFailure({ status: "failed", deployAttemptId: "b" }, "a")).toBe(null);
		expect(usableLastResultFailure({ status: "rolled-back" }, "a")).toMatchObject({ status: "rolled-back" });
	});

	it("degrades to a generic reason when no durable record exists", () => {
		const store = storeWith(null);
		const resolved = resolveDeployStageFailure(store, {
			task: {},
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved.gate).toBe(null);
		expect(resolved.reason).toContain("exit 1");
		expect(resolved.reason).toContain("last-result.json");
	});

	it("never throws on malformed records", () => {
		const throwing = { deployManager: { readJson: () => { throw new Error("io"); } } };
		const resolved = resolveDeployStageFailure(throwing, {
			task: null,
			stage: DEPLOY_STAGE,
			exitCode: 1,
			command: "./deploy.sh --prod",
		});
		expect(resolved).not.toBe(null);
		expect(typeof resolved.reason).toBe("string");
		expect(resolveDeployStageFailure(null, { stage: DEPLOY_STAGE })).not.toBe(null);
		expect(resolveDeployStageFailure(undefined, {})).toBe(null);
		// A null args object must not throw (the totality contract).
		expect(resolveDeployStageFailure(storeWith(null), null)).toBe(null);
	});

	it("extracts gate names honestly", () => {
		expect(extractGateName("Gate 'canary-e2e' failed (exit 1)")).toBe("canary-e2e");
		expect(extractGateName("Gate 'final-test-suite' failed (exit 2)")).toBe(
			"final-test-suite",
		);
		expect(extractGateName("boom")).toBe(null);
		expect(extractGateName(null)).toBe(null);
		expect(extractGateName(42)).toBe(null);
	});

	it("bounds the tail", () => {
		const blob = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n");
		const tail = tailLines(blob);
		expect(tail.split("\n").length).toBeLessThanOrEqual(DEPLOY_FAILURE_TAIL_LINES);
		expect(tail).toContain("line99");
		expect(tail).not.toContain("line0\n");
		expect(tailLines("", 5)).toBe("");
		expect(tailLines(null)).toBe("");
	});
});
