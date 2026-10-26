import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSingleAssignment } from "./daemon.js";

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

	it("interrupts the lease when the harness fails", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const interrupted = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true }),
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
		await assert.rejects(
			runSingleAssignment({
				config,
				client,
				loadHarness: async () => failing,
				logger: { log: () => {}, warn: () => {} },
			}),
			/harness blew up/,
		);
		assert.equal(interrupted.length, 1);
		assert.equal(interrupted[0].executionId, "e1");
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
