import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import {
	recordStageHeartbeat,
	getStageHeartbeat,
	clearStageHeartbeat,
	resolveStallThresholdMs,
	watchdogTick,
	markStallHandled,
	consumeStallHandled,
	clearStallHandled,
	noteStallKill,
	consumeStallKill,
	STALL_HANDLED_TTL_MS,
	STALLED_STATUS_NOTE,
} from "./stageHeartbeat.js";

describe("stageHeartbeat", () => {
	describe("registry accessors", () => {
		it("records, retrieves, and clears heartbeats", () => {
			const store = {};
			expect(getStageHeartbeat(store, "task-1")).toBeNull();

			recordStageHeartbeat(store, "task-1", {
				stageId: "stg-1",
				kind: "agent",
				timestamp: 1000,
			});
			const hb = getStageHeartbeat(store, "task-1");
			expect(hb).toEqual({
				lastBeatAt: 1000,
				stageId: "stg-1",
				kind: "agent",
			});

			clearStageHeartbeat(store, "task-1");
			expect(getStageHeartbeat(store, "task-1")).toBeNull();
		});

		it("handles missing store or taskId gracefully", () => {
			expect(() => recordStageHeartbeat(null, "t-1")).not.toThrow();
			expect(() => recordStageHeartbeat({}, null)).not.toThrow();
			expect(getStageHeartbeat(null, "t-1")).toBeNull();
			expect(getStageHeartbeat({}, null)).toBeNull();
			expect(() => clearStageHeartbeat(null, "t-1")).not.toThrow();
			expect(() => clearStageHeartbeat({}, null)).not.toThrow();
		});
	});

	describe("resolveStallThresholdMs", () => {
		it("resolves default thresholds per stage type", () => {
			expect(resolveStallThresholdMs("agent")).toBe(600000);
			expect(resolveStallThresholdMs("review")).toBe(600000);
			expect(resolveStallThresholdMs("ci")).toBe(300000);
			expect(resolveStallThresholdMs("script")).toBe(300000);
			// Legacy deploy reads as ci: same stall budget, no separate deploy budget.
			expect(resolveStallThresholdMs("deploy")).toBe(300000);
			expect(resolveStallThresholdMs("merge")).toBe(900000);
			expect(resolveStallThresholdMs("unknown")).toBe(0);
		});

		it("resolves the ci budget for a deploy-command ci stage object", () => {
			// A deploy command is an ordinary ci stage: same stall threshold.
			expect(
				resolveStallThresholdMs({ type: "ci", command: "./deploy.sh --prod" }),
			).toBe(300000);
			expect(resolveStallThresholdMs({ type: "ci", command: "npm test" })).toBe(
				300000,
			);
			// merge wins over a stray deploy command (git-only budget).
			expect(
				resolveStallThresholdMs({ type: "merge", command: "./deploy.sh --prod" }),
			).toBe(900000);
			expect(resolveStallThresholdMs(null)).toBe(0);
		});

		it("respects custom config and 0 disables", () => {
			const customCfg = {
				agentStallTimeoutMs: 120000,
				ciStallTimeoutMs: 0,
			};
			expect(resolveStallThresholdMs("agent", customCfg)).toBe(120000);
			expect(resolveStallThresholdMs("ci", customCfg)).toBe(0);
			expect(resolveStallThresholdMs("deploy", customCfg)).toBe(0);
		});
	});

	describe("watchdogTick", () => {
		let store;
		let project;
		let task;
		let stage;

		beforeEach(() => {
			stage = { id: "ci-stage", name: "CI", type: "ci" };
			task = {
				id: "t-1",
				currentStageId: "ci-stage",
				status: "running_ci",
				history: [],
				timeline: [],
				logEntries: [],
			};
			project = {
				id: "p-1",
				cwd: "/repo",
				stages: [stage],
			};
			store = {
				engineState: {
					status: "running",
					activeTaskId: "t-1",
					activeProjectId: "p-1",
				},
				schedulerStats: { stallRecoveries: 0 },
				projectStore: {
					getProject: vi.fn(() => project),
					listProjects: vi.fn(() => [project]),
				},
				getTask: vi.fn(() => task),
				killTaskProcess: vi.fn(),
				handleTransientFailure: vi.fn((pId, tId, stg, err) => ({
					status: "in_stage",
					error: err.message,
				})),
				_recordHistory: vi.fn((t, action, ts) => {
					t.history.push({ action, timestamp: ts });
				}),
				_recordTimeline: vi.fn((t, entry) => {
					t.timeline.push(entry);
				}),
				_saveTaskMarkdown: vi.fn(),
				setEngineState: vi.fn((st) => {
					Object.assign(store.engineState, st);
				}),
			};
		});

		it("does nothing when engine is not running", () => {
			store.engineState.status = "idle";
			const res = watchdogTick(store);
			expect(res).toBeNull();
			expect(store.killTaskProcess).not.toHaveBeenCalled();
		});

		it("does nothing when engine circuit breaker is tripped", () => {
			store.circuitState = { tripped: true, reason: "error cascade" };
			const res = watchdogTick(store);
			expect(res).toBeNull();
			expect(store.killTaskProcess).not.toHaveBeenCalled();
		});

		it("does nothing when no heartbeat was ever recorded (uninstrumented)", () => {
			task.enteredStageAt = "2020-01-01T00:00:00.000Z";
			const res = watchdogTick(store, { now: 2000000 });
			expect(res).toBeNull();
			expect(store.killTaskProcess).not.toHaveBeenCalled();
			expect(task.stallCount).toBeUndefined();
		});

		it("does nothing when heartbeat is fresh", () => {
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 50000, // 50s ago < 300s threshold
			});
			const res = watchdogTick(store, { now });
			expect(res).toBeNull();
			expect(store.killTaskProcess).not.toHaveBeenCalled();
		});

		it("does nothing when threshold is disabled (0)", () => {
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 500000,
			});
			const res = watchdogTick(store, {
				now,
				cfg: { ciStallTimeoutMs: 0 },
			});
			expect(res).toBeNull();
			expect(store.killTaskProcess).not.toHaveBeenCalled();
		});

		describe("stall kill context (report truth)", () => {
			const freshContext = (stageId = "ci-stage") => ({
				at: new Date(Date.now()).toISOString(),
				stageId,
				stageName: "CI",
				stageType: "ci",
				silenceMs: 302546,
				thresholdMs: 300000,
				stageTimeoutMs: 1800000,
			});

			it("consumes a fresh, matching context exactly once", () => {
				const task = {};
				noteStallKill(task, freshContext());
				const first = consumeStallKill(task, { stageId: "ci-stage" });
				expect(first).toMatchObject({ silenceMs: 302546 });
				expect(task.stallKill).toBeUndefined();
				expect(consumeStallKill(task, { stageId: "ci-stage" })).toBeNull();
			});

			it("leaves a different stage's context for that stage's report", () => {
				const task = {};
				noteStallKill(task, freshContext("other-stage"));
				expect(consumeStallKill(task, { stageId: "ci-stage" })).toBeNull();
				expect(task.stallKill).toBeDefined();
				expect(consumeStallKill(task, { stageId: "other-stage" })).toMatchObject({
					stageId: "other-stage",
				});
			});

			it("forgets a stale context instead of decorating a new report", () => {
				const task = {};
				noteStallKill(task, {
					...freshContext(),
					at: new Date(Date.now() - (STALL_HANDLED_TTL_MS + 1000)).toISOString(),
				});
				expect(consumeStallKill(task, { stageId: "ci-stage" })).toBeNull();
				expect(task.stallKill).toBeUndefined();
			});

			it("is a no-op on missing task or context", () => {
				expect(() => noteStallKill(null, {})).not.toThrow();
				expect(consumeStallKill(null, {})).toBeNull();
				expect(consumeStallKill({}, {})).toBeNull();
			});
		});

		describe("stall-handled marker", () => {
			it("marks, consumes once, and clears", () => {
				const store = {};
				expect(consumeStallHandled(store, "t-1")).toBe(false);
				markStallHandled(store, "t-1");
				expect(consumeStallHandled(store, "t-1")).toBe(true);
				// Single-use: the second consume never suppresses again.
				expect(consumeStallHandled(store, "t-1")).toBe(false);

				markStallHandled(store, "t-2");
				clearStallHandled(store, "t-2");
				expect(consumeStallHandled(store, "t-2")).toBe(false);
			});

			it("treats a marker older than the TTL as stale", () => {
				const store = {};
				markStallHandled(store, "t-1", { timestamp: 1000 });
				expect(
					consumeStallHandled(store, "t-1", {
						now: 1000 + STALL_HANDLED_TTL_MS + 1,
					}),
				).toBe(false);
				markStallHandled(store, "t-2", { timestamp: 1000 });
				expect(
					consumeStallHandled(store, "t-2", { now: 1000 + 10 }),
				).toBe(true);
			});

			it("is a no-op on missing store/task", () => {
				expect(() => markStallHandled(null, "t")).not.toThrow();
				expect(() => clearStallHandled({}, null)).not.toThrow();
				expect(consumeStallHandled(null, "t")).toBe(false);
			});
		});

		it("marks the stall handled after routing, and aborts an agent session", () => {
			const abort = vi.fn(async () => {});
			store.sessionStore = { get: vi.fn(() => ({ abort })) };
			stage.type = "agent";
			task.status = "running_agent";
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "agent",
				timestamp: now - 700000, // > agent threshold (600000)
			});

			const res = watchdogTick(store, { now });
			expect(res).toBeDefined();
			// Agent sessions are aborted too (child kill is a no-op for them).
			expect(store.sessionStore.get).toHaveBeenCalledWith("p-1");
			expect(abort).toHaveBeenCalledTimes(1);
			// The terminated in-flight run's duplicate routing is suppressed.
			expect(consumeStallHandled(store, "t-1")).toBe(true);
		});

		it("clears a stale stall marker before its own routing, then re-marks", () => {
			markStallHandled(store, "t-1"); // fresh stale marker from a prior stall
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 350000,
			});
			let markerSeenDuringRouting = null;
			store.handleTransientFailure = vi.fn(() => {
				markerSeenDuringRouting = consumeStallHandled(store, "t-1");
				return { status: "in_stage" };
			});

			expect(watchdogTick(store, { now })).toEqual({ status: "in_stage" });
			// The stale marker was cleared before routing, so it could not
			// suppress this stall's own transient routing...
			expect(markerSeenDuringRouting).toBe(false);
			// ...and a fresh marker is stamped after routing for the terminated run.
			expect(consumeStallHandled(store, "t-1")).toBe(true);
		});

		it("never aborts the project session for command stages", () => {
			const abort = vi.fn(async () => {});
			store.sessionStore = { get: vi.fn(() => ({ abort })) };
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 350000,
			});

			expect(watchdogTick(store, { now })).toBeDefined();
			expect(abort).not.toHaveBeenCalled();
		});

		it("fires on silence breach: kills process, updates task, and routes to transient retry", () => {
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 350000, // 350s ago > 300s threshold
			});

			const res = watchdogTick(store, { now });
			expect(res).toBeDefined();
			expect(task.stallCount).toBe(1);
			expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
			expect(getStageHeartbeat(store, "t-1")).toBeNull();
			expect(store.schedulerStats.stallRecoveries).toBe(1);
			expect(store.engineState.status).toBe("idle");
			expect(store.engineState.activeTaskId).toBeNull();

			// History recorded — and it names the stage so the next incident
			// cannot be misread as "tests are failing".
			expect(store._recordHistory).toHaveBeenCalledWith(
				task,
				expect.stringContaining("Stage marked stalled — no heartbeat for 350000ms"),
				expect.any(String),
			);
			expect(store._recordHistory).toHaveBeenCalledWith(
				task,
				expect.stringContaining("on stage 'CI'"),
				expect.any(String),
			);

			// The stall-kill context is stamped on the task for the stage's
			// report writer (RC-4: a watchdog kill must not masquerade as an
			// ordinary command failure).
			expect(task.stallKill).toMatchObject({
				stageId: "ci-stage",
				stageName: "CI",
				stageType: "ci",
				silenceMs: 350000,
				thresholdMs: 300000,
			});
			expect(Number.isFinite(Date.parse(task.stallKill.at))).toBe(true);

			// The canonical stall note is what lands in the process log, so the
			// operator-facing surface and the classifier signal can't drift.
			expect(JSON.stringify(task.logEntries || [])).toContain(STALLED_STATUS_NOTE);

			// Timeline recorded
			expect(store._recordTimeline).toHaveBeenCalledWith(
				task,
				expect.objectContaining({
					stage: "CI",
					status: "Stalled",
					reason: expect.stringContaining("no heartbeat for 350000ms"),
				}),
			);

			// handleTransientFailure called with stall: true
			expect(store.handleTransientFailure).toHaveBeenCalledWith(
				"p-1",
				"t-1",
				stage,
				expect.objectContaining({
					message: expect.stringContaining("Stage marked stalled"),
					code: "ESTALL",
					stall: true,
				}),
				expect.objectContaining({
					stall: true,
				}),
			);
		});

		it("records the Stalled timeline duration in seconds (never minutes)", () => {
			const now = 1000000;
			task.enteredStageAt = new Date(now - 42000).toISOString();
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 350000,
			});
			watchdogTick(store, { now });
			expect(store._recordTimeline).toHaveBeenCalledWith(
				task,
				expect.objectContaining({ status: "Stalled", duration: "42s" }),
			);
		});

		it("falls back to 0s (not 0m) when stage entry time is unknown", () => {
			const now = 1000000;
			delete task.enteredStageAt;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "ci",
				timestamp: now - 350000,
			});
			watchdogTick(store, { now });
			expect(store._recordTimeline).toHaveBeenCalledWith(
				task,
				expect.objectContaining({ status: "Stalled", duration: "0s" }),
			);
		});

		it("stalls a legacy deploy-typed stage on silence like ordinary CI", () => {
			// Legacy deploy reads as ci: the watchdog never consults the
			// deploy log — silence past the CI budget is a stall.
			stage.type = "deploy";
			task.status = "running_ci";
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "ci-stage",
				kind: "deploy",
				timestamp: now - 700000, // > 300s ci budget
			});

			const res = watchdogTick(store, { now });
			expect(res).toBeDefined();
			expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
		});

		describe("deploy-command stages stall like ordinary CI", () => {
			beforeEach(() => {
				stage.id = "command-stage";
				stage.name = "Deploy";
				stage.type = "ci";
				stage.command = "./deploy.sh --prod";
				task.currentStageId = "command-stage";
				task.status = "running_ci";
				task.deployAttemptId = "deploy-t-1-9";
			});

			it("stalls a deploy-command stage whose heartbeat is silent past the ci budget", () => {
				// The watchdog never consults deploy checkpoints: silence
				// past the CI budget is a stall even when a detached deploy
				// run is alive elsewhere.
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "command-stage",
					kind: "ci",
					timestamp: now - 301000, // past the 300s ci threshold
				});
				store.deployManager = {
					readJson: vi.fn(() => ({ status: "running", pid: 424242 })),
					isPidAlive: vi.fn(() => true),
				};

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
			});

			it("does not stall a deploy-command stage with a fresh heartbeat", () => {
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "command-stage",
					kind: "ci",
					timestamp: now - 100000,
				});
				store.deployManager = {
					readJson: vi.fn(() => ({ status: "running", pid: 777 })),
					isPidAlive: vi.fn(() => true),
				};

				expect(watchdogTick(store, { now })).toBeNull();
				expect(store.killTaskProcess).not.toHaveBeenCalled();
			});

			it("stalls a command stage when the detached run is dead", () => {
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "command-stage",
					kind: "ci",
					timestamp: now - 301000,
				});
				store.deployManager = {
					readJson: vi.fn(() => ({ status: "running", pid: 424242 })),
					isPidAlive: vi.fn(() => false),
				};

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
			});

			it("stalls a command stage when there is no detached result", () => {
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "command-stage",
					kind: "ci",
					timestamp: now - 301000,
				});
				store.deployManager = {
					readJson: vi.fn(() => null),
					isPidAlive: vi.fn(() => false),
				};

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

				vi.restoreAllMocks();
			});

			it("ignores deploy.log mtime: a silent merge stage stalls like any other", () => {
				// The watchdog never reads the deploy log: silence past the
				// merge budget is a stall even when the log is fresh.
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "merge-stage",
					kind: "merge",
					timestamp: now - 901000,
				});
				store.deployManager = {
					readJson: vi.fn(() => null),
					isPidAlive: vi.fn(() => false),
					stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
				};

				const res = watchdogTick(store, { now });
				expect(res).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
			});

			it("stalls on silence even when a detached checkpoint reads running", () => {
				// Checkpoint freshness is continuity-owned: the generic
				// watchdog measures only the stage heartbeat.
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "merge-stage",
					kind: "merge",
					timestamp: now - 901000, // past the 900s merge threshold
				});
				store.deployManager = {
					readJson: vi.fn(() => ({
						status: "running",
						pid: 424242,
						updatedAt: new Date(now - 60000).toISOString(),
					})),
					isPidAlive: vi.fn(() => false),
				};

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");
			});

			it("still stalls when the checkpoint refresh is stale, even with a running status", () => {
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "merge-stage",
					kind: "merge",
					timestamp: now - 901000,
				});
				store.deployManager = {
					readJson: vi.fn(() => ({
						status: "running",
						pid: 424242,
						updatedAt: new Date(now - 600000).toISOString(),
					})),
					isPidAlive: vi.fn(() => false),
					stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
				};
				vi.spyOn(fs, "existsSync").mockReturnValue(false);

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

				vi.restoreAllMocks();
			});

			it("stalls on a stale checkpoint even when a deploy lock is held (lock may be foreign)", () => {
			// Regression guard (reviewer): a held deploy lock is NOT liveness
			// for this stage. The lock is host-wide, so an unrelated task's
			// deploy holding it must never keep a hung merge stage alive (a
			// masked stall burns no retry budget and parks silently). Liveness
			// is proven only by this attempt's checkpoint pid or a freshly
			// refreshed checkpoint.
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "merge-stage",
				kind: "merge",
				timestamp: now - 901000, // past the 900s merge threshold
			});
			store.deployManager = {
				// Stale refresh + dead pid: OUR deploy is gone, whatever the lock
				// holder is.
				readJson: vi.fn(() => ({
					status: "running",
					pid: 424242,
					updatedAt: new Date(now - 600000).toISOString(),
				})),
				isPidAlive: vi.fn(() => false),
				isDeployLocked: vi.fn(() => true),
				stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
			};
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			expect(watchdogTick(store, { now })).toBeDefined();
			expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

			vi.restoreAllMocks();
		});

		it("still stalls when a foreign deploy holds the lock but this attempt has no running checkpoint", () => {
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "merge-stage",
				kind: "merge",
				timestamp: now - 901000, // past the 900s merge threshold
			});
			store.deployManager = {
				// No checkpoint for this attempt (never wrote one): the
				// held lock belongs to an UNRELATED deploy and must not
				// mask this stage's real stall.
				readJson: vi.fn(() => null),
				isPidAlive: vi.fn(() => false),
				isDeployLocked: vi.fn(() => true),
				stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
			};
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			expect(watchdogTick(store, { now })).toBeDefined();
			expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

			vi.restoreAllMocks();
		});

		it("still stalls when a foreign deploy holds the lock but this attempt already resolved", () => {
			const now = 1000000;
			recordStageHeartbeat(store, "t-1", {
				stageId: "merge-stage",
				kind: "merge",
				timestamp: now - 901000, // past the 900s merge threshold
			});
			store.deployManager = {
				// Terminal checkpoint: nothing of ours can be queued, so a
				// held lock is foreign by definition.
				readJson: vi.fn(() => ({
					status: "success",
					pid: 424242,
					updatedAt: new Date(now - 10000).toISOString(),
				})),
				isPidAlive: vi.fn(() => false),
				isDeployLocked: vi.fn(() => true),
				stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
			};
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			expect(watchdogTick(store, { now })).toBeDefined();
			expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

			vi.restoreAllMocks();
		});

		it("ignores deploy.log mtime for a merge stage with no deploy attempt", () => {
				delete task.deployAttemptId;
				const now = 1000000;
				recordStageHeartbeat(store, "t-1", {
					stageId: "merge-stage",
					kind: "merge",
					timestamp: now - 901000,
				});
				store.deployManager = {
					readJson: vi.fn(() => null),
					isPidAlive: vi.fn(() => false),
					stateFilePath: vi.fn(() => "/tmp/test-deploy.log"),
				};
				vi.spyOn(fs, "existsSync").mockReturnValue(true);
				vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: now - 100000 });

				expect(watchdogTick(store, { now })).toBeDefined();
				expect(store.killTaskProcess).toHaveBeenCalledWith("t-1");

				vi.restoreAllMocks();
			});
		});
	});
});
