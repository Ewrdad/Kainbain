// Domain: The Flow — unit tests for shared deploy-stage markers.
import { describe, it, expect } from "vitest";
import {
	DEPLOY_CHECKPOINT_FRESH_MS,
	DEPLOY_COMMAND_PATTERN,
	findDeployCheckpointByOperationKey,
	hashDeployCommand,
	isDeployCheckpointFresh,
	isDeployCommand,
	isDeployStageLike,
	isDeployResultNewerThanEntry,
	readDeployEntryBuild,
	resolveDeployOperationKey,
	resolveDeployBaseSha,
	deployFailureSkipsFailback,
	resolveMergeDeployOperationKey,
} from "./deployMarkers.js";

describe("The Flow: deploy markers", () => {
	it("detects deploy commands honestly, including edge input", () => {
		expect(isDeployCommand("./deploy.sh --prod")).toBe(true);
		expect(isDeployCommand("bash ./deploy.sh --prod --fast")).toBe(true);
		expect(isDeployCommand("echo merged")).toBe(false);
		expect(isDeployCommand("")).toBe(false);
		expect(isDeployCommand(null)).toBe(false);
		expect(isDeployCommand(undefined)).toBe(false);
		expect(isDeployCommand(42)).toBe(false);
		expect(DEPLOY_COMMAND_PATTERN.test("./deploy.sh")).toBe(true);
	});

	it("matches deploy stages by legacy type, command, or composite merge command", () => {
		// Generic pipeline no longer derives deploy semantics from a command.
		expect(
			isDeployStageLike({ type: "ci", command: "./deploy.sh --prod" }),
		).toBe(false);
		expect(
			isDeployStageLike({ type: "ci", script: "./deploy.sh --prod" }),
		).toBe(false);
		expect(isDeployStageLike({ type: "ci", command: "npm test" })).toBe(false);
		// Legacy raw `deploy`-typed stage objects still match.
		expect(isDeployStageLike({ type: "deploy" })).toBe(true);
		expect(isDeployStageLike({ type: "Deploy" })).toBe(true);
		expect(
			isDeployStageLike({
				type: "merge",
				command: "./deploy.sh --prod",
			}),
		).toBe(false);
		expect(
			isDeployStageLike({ type: "merge", script: "./deploy.sh --prod" }),
		).toBe(false);
		expect(
			isDeployStageLike({ type: "merge", command: "echo merged" }),
		).toBe(false);
		expect(isDeployStageLike({ type: "agent" })).toBe(false);
		expect(isDeployStageLike(null)).toBe(false);
		expect(isDeployStageLike(undefined)).toBe(false);
		expect(isDeployStageLike("deploy")).toBe(false);
	});

	it("reads the entry build honestly, degrading to null", () => {
		expect(readDeployEntryBuild({ deployManager: { readBuild: () => ({ buildNumber: 41 }) } })).toBe(41);
		expect(readDeployEntryBuild({ deployManager: { readBuild: () => ({ buildNumber: 0 }) } })).toBe(0);
		// Degraded shapes never throw and never leak undefined.
		expect(readDeployEntryBuild(null)).toBe(null);
		expect(readDeployEntryBuild({})).toBe(null);
		expect(readDeployEntryBuild({ deployManager: null })).toBe(null);
		expect(readDeployEntryBuild({ deployManager: { readBuild: () => null } })).toBe(null);
		expect(readDeployEntryBuild({ deployManager: { readBuild: () => ({}) } })).toBe(null);
		expect(
			readDeployEntryBuild({ deployManager: { readBuild: () => ({ buildNumber: "41" }) } }),
		).toBe(null);
		expect(
			readDeployEntryBuild({ deployManager: { readBuild: () => ({ buildNumber: 4.5 }) } }),
		).toBe(null);
		expect(
			readDeployEntryBuild({ deployManager: { readBuild: () => ({ buildNumber: -1 }) } }),
		).toBe(null);
		expect(
			readDeployEntryBuild({
				deployManager: {
					readBuild: () => {
						throw new Error("unreadable");
					},
				},
			}),
		).toBe(null);
	});

	it("treats a result started after entry as fresh for this attempt", () => {
		const task = {
			enteredStageAt: "2026-09-24T09:00:00.000Z",
			deployBuildAtEntry: 7,
		};
		const lastResult = {
			startedAt: "2026-09-24T10:00:00.000Z",
			buildNumber: 7,
		};
		expect(isDeployResultNewerThanEntry({ task, lastResult })).toBe(true);
	});

	it("treats an advanced build as fresh even with a stale timestamp", () => {
		const task = {
			enteredStageAt: "2026-09-24T10:00:00.000Z",
			deployBuildAtEntry: 7,
		};
		const lastResult = {
			startedAt: "2026-09-24T09:00:00.000Z",
			buildNumber: 8,
		};
		expect(isDeployResultNewerThanEntry({ task, lastResult })).toBe(true);
	});

	it("treats matching deployAttemptId as fresh even with stale timestamp", () => {
		const task = {
			enteredStageAt: "2026-09-24T10:00:00.000Z",
			deployAttemptId: "deploy-attempt-42",
		};
		const lastResult = {
			startedAt: "2026-09-24T09:00:00.000Z",
			deployAttemptId: "deploy-attempt-42",
		};
		expect(isDeployResultNewerThanEntry({ task, lastResult })).toBe(true);
	});

	it("rejects mismatched deployAttemptId even if timestamp is newer", () => {
		const task = {
			enteredStageAt: "2026-09-24T09:00:00.000Z",
			deployAttemptId: "deploy-attempt-42",
		};
		const lastResult = {
			startedAt: "2026-09-24T10:00:00.000Z",
			deployAttemptId: "deploy-attempt-other",
		};
		expect(isDeployResultNewerThanEntry({ task, lastResult })).toBe(false);
	});

	it("derives a stable operation key per merge inputs, unknown-base without a SHA", () => {
		const key = resolveMergeDeployOperationKey({
			taskId: "task-1",
			mainBranch: "main",
			preMergeMainSha: "abc123",
			command: "./deploy.sh --prod",
		});
		expect(key).toMatch(/^merge-deploy:task-1:main:abc123:[0-9a-f]{8}$/);
		// Same inputs, same key (re-dispatch adopts); new base, new key.
		expect(
			resolveMergeDeployOperationKey({
				taskId: "task-1",
				mainBranch: "main",
				preMergeMainSha: "abc123",
				command: "./deploy.sh --prod",
			}),
		).toBe(key);
		expect(
			resolveMergeDeployOperationKey({
				taskId: "task-1",
				mainBranch: "main",
				preMergeMainSha: "def456",
				command: "./deploy.sh --prod",
			}),
		).not.toBe(key);
		expect(
			resolveMergeDeployOperationKey({ taskId: "task-1", command: "./deploy.sh --prod" }),
		).toContain("unknown-base");
		expect(resolveDeployOperationKey({ deployOperationKey: "kept" }, {})).toBe("kept");
		expect(resolveDeployOperationKey({}, { taskId: "t" })).toContain("merge-deploy:");
		expect(hashDeployCommand("./deploy.sh --prod")).toMatch(/^[0-9a-f]{8}$/);
		expect(hashDeployCommand(null)).toMatch(/^[0-9a-f]{8}$/);
		expect(hashDeployCommand(null)).toBe(hashDeployCommand(""));
	});

	it("resolves the deploy base SHA from the live marker, then the frozen baseline", () => {
		// Live merge in flight: the pre-merge marker wins.
		expect(
			resolveDeployBaseSha({
				preMergeMainSha: "  live-sha  ",
				reviewBaseline: { mainSha: "baseline-sha" },
			}),
		).toBe("live-sha");
		// Post-merge: the merge stage consumed `preMergeMainSha`; the frozen
		// review baseline carries the same base, so the standalone deploy
		// stage still binds a real SHA instead of `unknown-base`.
		expect(resolveDeployBaseSha({ reviewBaseline: { mainSha: " baseline-sha " } })).toBe(
			"baseline-sha",
		);
		// Degraded shapes never throw and never leak undefined.
		expect(resolveDeployBaseSha({})).toBe(null);
		expect(resolveDeployBaseSha(null)).toBe(null);
		expect(resolveDeployBaseSha({ preMergeMainSha: "   " })).toBe(null);
		expect(resolveDeployBaseSha({ reviewBaseline: null })).toBe(null);
		expect(resolveDeployBaseSha({ reviewBaseline: { mainSha: 42 } })).toBe(null);
	});

	it("parks deploy failures only after a merge has landed", () => {
		const deploy = { type: "ci", command: "./deploy.sh --prod" };
		// Deploy failures now fall back like any other CI failure, even after
		// a merge has landed.
		expect(
			deployFailureSkipsFailback(
				{ reviewBaseline: { mergedAt: "2026-10-14T00:00:00.000Z" } },
				deploy,
			),
		).toBe(false);
		expect(deployFailureSkipsFailback({}, deploy)).toBe(false);
		expect(deployFailureSkipsFailback(null, deploy)).toBe(false);
		expect(
			deployFailureSkipsFailback({ reviewBaseline: { mergedAt: "   " } }, deploy),
		).toBe(false);
		expect(deployFailureSkipsFailback({ reviewBaseline: null }, deploy)).toBe(false);
	});

	it("finds the newest checkpoint for an operation key and nothing else", () => {
		const running = { attemptId: "a1", status: "running", operationKey: "op-1" };
		const stale = { attemptId: "a2", status: "success", operationKey: "op-2" };
		const store = { deployManager: { listAttemptCheckpoints: () => [stale, running] } };
		expect(findDeployCheckpointByOperationKey(store, "op-1")).toBe(running);
		expect(findDeployCheckpointByOperationKey(store, "op-2")).toBe(stale);
		expect(findDeployCheckpointByOperationKey(store, "op-9")).toBe(null);
		expect(findDeployCheckpointByOperationKey(store, "")).toBe(null);
		expect(findDeployCheckpointByOperationKey({}, "op-1")).toBe(null);
		expect(findDeployCheckpointByOperationKey(null, "op-1")).toBe(null);
		expect(
			findDeployCheckpointByOperationKey(
				{ deployManager: { listAttemptCheckpoints: () => { throw new Error("io"); } } },
				"op-1",
			),
		).toBe(null);
	});

	it("rejects stale results and malformed markers fail-safe", () => {
		const task = {
			enteredStageAt: "2026-09-24T10:00:00.000Z",
			deployBuildAtEntry: 8,
		};
		// Same build, older timestamp: a previous attempt's result.
		expect(
			isDeployResultNewerThanEntry({
				task,
				lastResult: { startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 8 },
			}),
		).toBe(false);
		// Missing or unparseable start: never fresh.
		expect(isDeployResultNewerThanEntry({ task, lastResult: null })).toBe(false);
		expect(isDeployResultNewerThanEntry({ task, lastResult: {} })).toBe(false);
		expect(
			isDeployResultNewerThanEntry({
				task,
				lastResult: { startedAt: "not-a-date", buildNumber: 9 },
			}),
		).toBe(false);
		expect(isDeployResultNewerThanEntry({ task: null, lastResult: {} })).toBe(false);
		expect(isDeployResultNewerThanEntry()).toBe(false);
	});
});

describe("The Flow: deploy checkpoint freshness (heartbeat-ticker liveness)", () => {
	const NOW = Date.parse("2026-10-12T09:00:00.000Z");
	const freshAt = new Date(NOW - 60_000).toISOString();

	it("treats a recently refreshed running checkpoint as live without a pid", () => {
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: freshAt }, { now: NOW })).toBe(true);
		// Case-insensitive status, like every other marker predicate.
		expect(isDeployCheckpointFresh({ status: "Running", updatedAt: freshAt }, { now: NOW })).toBe(true);
	});

	it("falls back to startedAt when updatedAt is absent", () => {
		expect(isDeployCheckpointFresh({ status: "running", startedAt: freshAt }, { now: NOW })).toBe(true);
	});

	it("expires minutes after the last refresh (dead deploy still stalls loudly)", () => {
		const stale = new Date(NOW - DEPLOY_CHECKPOINT_FRESH_MS - 1000).toISOString();
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: stale }, { now: NOW })).toBe(false);
	});

	it("never treats terminal, missing, or malformed checkpoints as fresh", () => {
		expect(isDeployCheckpointFresh({ status: "success", updatedAt: freshAt }, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh({ status: "deploying", updatedAt: freshAt }, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh({ status: "running" }, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: "not-a-date" }, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: 12345 }, { now: NOW })).toBe(false);
		// A refresh timestamp in the future is clock skew, not liveness.
		expect(
			isDeployCheckpointFresh(
				{ status: "running", updatedAt: new Date(NOW + 60_000).toISOString() },
				{ now: NOW },
			),
		).toBe(false);
		expect(isDeployCheckpointFresh(null, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh(undefined, { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh("running", { now: NOW })).toBe(false);
		expect(isDeployCheckpointFresh([], { now: NOW })).toBe(false);
	});

	it("honours a custom window and exposes a sane default", () => {
		expect(DEPLOY_CHECKPOINT_FRESH_MS).toBe(180000);
		const at = new Date(NOW - 60_000).toISOString();
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: at }, { now: NOW, maxAgeMs: 30_000 })).toBe(false);
		expect(isDeployCheckpointFresh({ status: "running", updatedAt: at }, { now: NOW, maxAgeMs: 300_000 })).toBe(true);
	});
});
