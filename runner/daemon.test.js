import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deliverSteers, runDispatchLoop, runSingleAssignment } from "./daemon.js";

function localRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-d-"));
	execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "init"], { cwd: dir, stdio: "ignore" });
	return dir;
}

function fakeHarness(reply = "done") {
	return {
		async createSession() {
			return {
				isStreaming: false,
				messages: [],
				getLastAssistantText: () => reply,
				subscribe: (handler) => {
					handler({ type: "assistant_delta", delta: "working" });
					return () => {};
				},
				prompt: async () => reply,
				abort: () => {},
				dispose: async () => {},
			};
		},
	};
}

function stubClient(script) {
	const calls = [];
	const client = { calls, setCredential: () => {} };
	for (const [name, fn] of Object.entries(script)) {
		client[name] = async (...args) => {
			calls.push(name);
			return fn(...args);
		};
	}
	return client;
}

const baseConfig = (overrides = {}) => ({
	backendUrl: "http://x:3100",
	joinToken: "jt",
	credential: "cred-1",
	runnerId: "r1",
	harnessId: "mock",
	model: "",
	tiers: ["T0", "T1"],
	workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-w-")),
	projectId: "p1",
	taskId: "t1",
	heartbeatMs: 60000,
	approvalPollMs: 10,
	approvalTimeoutMs: 100,
	errors: [],
	...overrides,
});

describe("runSingleAssignment", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	it("runs claim/load/execute/report to completion on a local-only repo", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runSingleAssignment({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.accepted, true);
		assert.ok(!client.calls.includes("interrupt"));
		assert.ok(fs.existsSync(path.join(config.workRoot, "kb-t1")));
	});

	it("reports harness failure through the failed outcome, not interrupt", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const completed = [];
		const interrupted = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completed.push(args);
				return { accepted: true };
			},
			interrupt: async (args) => {
				interrupted.push(args);
				return { interrupted: true };
			},
		});
		const failing = {
			async createSession() {
				return {
					isStreaming: false,
					messages: [],
					getLastAssistantText: () => "",
					subscribe: () => () => {},
					prompt: async () => {
						throw new Error("harness blew up");
					},
					abort: () => {},
					dispose: async () => {},
				};
			},
		};
		await runSingleAssignment({
			config,
			client,
			loadHarness: async () => failing,
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(completed.length, 1);
		assert.equal(completed[0].outcome, "failed");
		assert.match(completed[0].failureReason, /harness blew up/);
		assert.equal(interrupted.length, 0);
	});

	it("asks for the pasted credential once the join is approved", async () => {
		const config = baseConfig({ credential: "" });
		dirs.push(config.workRoot);
		const client = stubClient({
			register: async () => ({ status: "active", runnerId: "r1" }),
		});
		await assert.rejects(
			runSingleAssignment({
				config,
				client,
				loadHarness: async () => fakeHarness(),
				logger: { log: () => {}, warn: () => {} },
			}),
			/KAINBAIN_RUNNER_CREDENTIAL/,
		);
	});

	it("times out visibly while the join stays pending", async () => {
		const config = baseConfig({ credential: "", approvalTimeoutMs: 30, approvalPollMs: 10 });
		dirs.push(config.workRoot);
		const client = stubClient({
			register: async () => ({ status: "pending", runnerId: "r1" }),
		});
		await assert.rejects(
			runSingleAssignment({
				config,
				client,
				loadHarness: async () => fakeHarness(),
				logger: { log: () => {}, warn: () => {} },
			}),
			/still pending/,
		);
	});
});

describe("deliverSteers", () => {
	const config = { runnerId: "r1" };
	const facts = {};
	const logger = { log: () => {}, warn: () => {} };
	const steerRow = (over = {}) => ({
		steerId: "s1",
		taskId: "t1",
		projectId: "p1",
		executionId: "e1",
		epoch: 1,
		text: "hold on",
		...over,
	});

	it("delivers the current execution's steers and acks each once", async () => {
		const steered = [];
		const acked = [];
		const client = {
			heartbeat: async () => ({ status: "active", pendingSteers: [steerRow()] }),
			steerAck: async (args) => {
				acked.push(args);
				return { steerId: args.steerId };
			},
		};
		const state = {
			executionId: "e1",
			epoch: 1,
			session: { steer: async (text) => steered.push(text) },
		};
		const delivered = await deliverSteers({ config, client, logger, facts, state });
		assert.equal(delivered, 1);
		assert.deepEqual(steered, ["hold on"]);
		assert.equal(acked.length, 1);
		assert.equal(acked[0].steerId, "s1");
		assert.equal(acked[0].ok, true);
	});

	it("ignores steers for other executions and NACKs unsupported harnesses", async () => {
		const acked = [];
		const client = {
			heartbeat: async () => ({
				status: "active",
				pendingSteers: [steerRow({ executionId: "old", steerId: "s-old" }), steerRow()],
			}),
			steerAck: async (args) => {
				acked.push(args);
				return { steerId: args.steerId };
			},
		};
		const state = { executionId: "e1", epoch: 1, session: {} };
		const delivered = await deliverSteers({ config, client, logger, facts, state });
		assert.equal(delivered, 1);
		assert.equal(acked.length, 1);
		assert.equal(acked[0].steerId, "s1");
		assert.equal(acked[0].ok, false);
		assert.equal(acked[0].detail, "UNSUPPORTED_HARNESS");
	});
});

describe("runDispatchLoop", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	const loopConfig = (overrides = {}) =>
		baseConfig({ dispatch: true, dispatchPollMs: 1, dispatchIdleLimit: 2, ...overrides });

	it("runs one dispatched assignment then idles out", async () => {
		const repo = localRepo();
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		const seen = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				seen.push(1);
				return seen.length === 1
					? { assigned: true, projectId: "p1", taskId: "t1", executionId: "e1", epoch: 1 }
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.equal(out.idle, true);
		assert.ok(!client.calls.includes("interrupt"));
		assert.ok(!client.calls.includes("claim"), "dispatch lease is consumed, never re-claimed");
		assert.ok(fs.existsSync(path.join(config.workRoot, "kb-t1")));
	});

	it("backs off on 429 without consuming idle budget or crashing", async () => {
		const repo = localRepo();
		const config = loopConfig({ dispatchIdleLimit: 1 });
		dirs.push(config.workRoot, repo);
		let dispatches = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				dispatches += 1;
				if (dispatches <= 2) {
					const err = new Error("fleet busy");
					err.statusCode = 429;
					err.code = "FLEET_CONCURRENCY_EXHAUSTED";
					throw err;
				}
				return { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.idle, true);
		assert.equal(out.assignments, 0);
		assert.equal(dispatches, 3);
	});

	it("re-heartbeats once on STALE_RUNNER then retries", async () => {
		const repo = localRepo();
		const config = loopConfig({ dispatchIdleLimit: 1 });
		dirs.push(config.workRoot, repo);
		let beats = 0;
		let dispatches = 0;
		const client = stubClient({
			heartbeat: async () => {
				beats += 1;
				return { status: "active" };
			},
			dispatchClaim: async () => {
				dispatches += 1;
				if (dispatches === 1) {
					const err = new Error("stale");
					err.code = "STALE_RUNNER";
					throw err;
				}
				return { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true }),
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.idle, true);
		assert.equal(dispatches, 2);
		assert.ok(beats >= 2);
	});
});
