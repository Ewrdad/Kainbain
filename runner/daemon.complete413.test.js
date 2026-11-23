import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSingleAssignment } from "./daemon.js";

/***
 * MARK: complete-execution 413 is non-retryable (RED phase)
 * @description RED-phase tests for the 413 completion-payload loop (task
 *   d164fb3f, RESPONSE.md S2): an HTTP 413 from `complete-execution`
 *   is deterministic — resending the same report fails the same way —
 *   so the runner must report ONCE as failed (small body, no
 *   `taskFiles`, byte size in the reason) and RETURN, never
 *   interrupt-loop, never rethrow. FAILS today (today it interrupts +
 *   rethrows); goes green unmodified with the Phase 5 fix. The
 *   non-complete 413 case pins the preserved interrupt+rethrow path.
 ***/

function localRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-413-"));
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
				subscribe: () => () => {},
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
	workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-413-w-")),
	projectId: "p1",
	taskId: "t1",
	heartbeatMs: 60000,
	approvalPollMs: 10,
	approvalTimeoutMs: 100,
	errors: [],
	...overrides,
});

const quiet = { log: () => {}, warn: () => {}, error: () => {} };

function rejection413() {
	const err = new Error("Backend 413 on /tasks/t1/complete-execution");
	err.statusCode = 413;
	err.code = "FST_ERR_CTP_BODY_TOO_LARGE";
	return err;
}

describe("complete-execution 413 is non-retryable", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	it("reports once as failed with size details — no interrupt, no rethrow", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const completed = [];
		const interrupts = [];
		let firstReportBytes = 0;
		let completeCalls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completeCalls += 1;
				if (completeCalls === 1) {
					firstReportBytes = Buffer.byteLength(JSON.stringify(args), "utf8");
					throw rejection413();
				}
				completed.push(args);
				return { accepted: true };
			},
			interrupt: async (args) => {
				interrupts.push(args || {});
				return { interrupted: true };
			},
		});
		const out = await runSingleAssignment({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: quiet,
		});
		assert.equal(completeCalls, 2, "big report once, small failed report once");
		assert.equal(completed.length, 1);
		assert.equal(completed[0].outcome, "failed");
		assert.equal(completed[0].failureKind, "report-too-large");
		assert.equal(completed[0].taskFiles, undefined, "small report carries no task files");
		assert.match(completed[0].failureReason, new RegExp(String(firstReportBytes)), "exact byte size in the reason");
		assert.match(completed[0].failureReason, /10485760/, "backend limit in the reason");
		assert.match(completed[0].failureReason, /passed/, "original outcome in the reason");
		assert.equal(interrupts.length, 0, "no interrupt for a deterministic 413");
		assert.equal(out.reportTooLarge, true);
	});

	it("small-report failure still returns: interrupt with reason, never throw", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const interrupts = [];
		let completeCalls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completeCalls += 1;
				if (completeCalls === 1) throw rejection413();
				throw new Error("lease gone");
			},
			interrupt: async (args) => {
				interrupts.push(args || {});
				return { interrupted: true };
			},
		});
		const out = await runSingleAssignment({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: quiet,
		});
		assert.equal(completeCalls, 2, "no third attempt of the big report");
		assert.equal(interrupts.length, 1, "one best-effort interrupt");
		assert.match(String(interrupts[0].reason || ""), /byte/i, "interrupt reason names the size cause");
		assert.equal(out.reportFailed, true);
		assert.equal(out.reportTooLarge, true);
	});

	it("pins the preserved path: 413 from a NON-complete call still interrupts + rethrows", async () => {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const interrupts = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => {
				throw rejection413();
			},
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true }),
			interrupt: async (args) => {
				interrupts.push(args || {});
				return { interrupted: true };
			},
		});
		await assert.rejects(
			runSingleAssignment({
				config,
				client,
				loadHarness: async () => fakeHarness(),
				logger: quiet,
			}),
			/Backend 413/,
		);
		assert.equal(interrupts.length, 1, "generic path still interrupts");
	});
});
