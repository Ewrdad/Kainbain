import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	clearHarnessVersionCache,
	defaultLoadHarness,
	deliverSteers,
	diskHeadroomMbFor,
	probeHarnessVersions,
	runCiCommand,
	runDispatchLoop,
	runSingleAssignment,
	applyBackendPrompt,
	startClaimRenewal,
	RUNNER_API_VERSION,
	ciWorkdirFor,
} from "./daemon.js";

describe("ciWorkdirFor", () => {
	it("runs primary stages in the primary checkout, task stages in the worktree", () => {
		assert.equal(ciWorkdirFor({ runOnBranch: "primary", workdir: "/w/kb-t", projectCwd: "/repo" }), "/repo");
		assert.equal(ciWorkdirFor({ runOnBranch: "task", workdir: "/w/kb-t", projectCwd: "/repo" }), "/w/kb-t");
		assert.equal(ciWorkdirFor({ runOnBranch: "", workdir: "/w/kb-t", projectCwd: "/repo" }), "/w/kb-t");
		assert.equal(ciWorkdirFor({ runOnBranch: "primary", workdir: "/w/kb-t", projectCwd: "" }), "/w/kb-t");
	});
});

describe("RUNNER_API_VERSION", () => {
	it("equals runner/version.json apiVersion", () => {
		const parsed = JSON.parse(fs.readFileSync(new URL("./version.json", import.meta.url), "utf8"));
		assert.equal(RUNNER_API_VERSION, parsed.apiVersion);
	});
});

describe("defaultLoadHarness", () => {
	it("wires mock, pi, muse, antigravity, and vibe harnesses with createSession", async () => {
		for (const id of ["mock", "pi", "muse", "antigravity", "vibe"]) {
			const harness = await defaultLoadHarness(id);
			assert.equal(typeof harness.createSession, "function", id);
		}
	});

	it("fails fast naming supported harnesses", async () => {
		await assert.rejects(
			defaultLoadHarness("nope"),
			/supported: mock, pi, muse, antigravity, vibe/,
		);
	});
});

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

	it("runs the harness session in the prepared worktree, not the backend checkout", async () => {
		// Wire-proof 2026-10-27: the backend record's cwd is the backend's
		// own checkout, so passing it through lets the agent write into the
		// wrong repo while the worktree commit ships nothing.
		const repo = localRepo();
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-cwd-origin-"));
		execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
		execFileSync("git", ["-C", repo, "remote", "add", "origin", origin], { stdio: "ignore" });
		execFileSync("git", ["-C", repo, "push", "-q", "origin", "HEAD:main"], { stdio: "ignore" });
		execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
			stdio: "ignore",
		});
		const config = baseConfig();
		dirs.push(config.workRoot, repo, origin);
		let seenProject = null;
		let seenSessionDir = null;
		const capturing = () => ({
			async createSession(project, meta) {
				seenProject = project;
				seenSessionDir = meta.sessionDir;
				return {
					getLastAssistantText: () => "done",
					subscribe: () => () => {},
					prompt: async () => "done",
					dispose: async () => {},
				};
			},
		});
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: "/backend/projects/p1", gitUrl: origin }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1 }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		await runSingleAssignment({
			config,
			client,
			loadHarness: async () => capturing(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.ok(seenSessionDir.startsWith(config.workRoot));
		assert.equal(seenProject.cwd, seenSessionDir);
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

describe("startClaimRenewal", () => {
	it("renews on a cadence with the lease ids and stops on demand", async () => {
		const seen = [];
		const warnings = [];
		const client = {
			claimHeartbeat: async (args) => {
				seen.push(args);
				return { epoch: 1 };
			},
		};
		const logger = { log: () => {}, warn: (m) => warnings.push(m) };
		const stop = startClaimRenewal({
			client,
			logger,
			taskId: "t1",
			projectId: "p1",
			executionId: "e1",
			epoch: 1,
			intervalMs: 15,
		});
		await new Promise((r) => setTimeout(r, 60));
		stop();
		assert.ok(seen.length >= 2, `expected renewals, saw ${seen.length}`);
		assert.ok(
			seen.every((a) => a.taskId === "t1" && a.executionId === "e1" && a.epoch === 1),
		);
		const count = seen.length;
		await new Promise((r) => setTimeout(r, 40));
		assert.equal(seen.length, count);
		assert.equal(warnings.length, 0);
	});

	it("stops renewing after a STAGE_TIMEOUT so a timed-out run is not propped up", async () => {
		const seen = [];
		const warnings = [];
		const client = {
			claimHeartbeat: async (args) => {
				seen.push(args);
				throw Object.assign(new Error("Stage timed out after 10ms (budget 5ms)"), { code: "STAGE_TIMEOUT" });
			},
		};
		const logger = { log: () => {}, warn: (m) => warnings.push(m) };
		startClaimRenewal({
			client,
			logger,
			taskId: "t1",
			projectId: "p1",
			executionId: "e1",
			epoch: 1,
			intervalMs: 10,
		});
		await new Promise((r) => setTimeout(r, 50));
		assert.ok(seen.length >= 1);
		assert.ok(warnings.length >= 1);
		const count = seen.length;
		await new Promise((r) => setTimeout(r, 40));
		assert.equal(seen.length, count);
	});

	it("warns instead of throwing when a renewal fails", async () => {
		const warnings = [];
		const client = {
			claimHeartbeat: async () => {
				throw Object.assign(new Error("gone"), { code: "STALE_EPOCH" });
			},
		};
		const logger = { log: () => {}, warn: (m) => warnings.push(m) };
		const stop = startClaimRenewal({
			client,
			logger,
			taskId: "t1",
			projectId: "p1",
			executionId: "e1",
			epoch: 1,
			intervalMs: 10,
		});
		await new Promise((r) => setTimeout(r, 40));
		stop();
		assert.ok(warnings.length >= 1);
		assert.match(warnings[0], /Claim renewal failed/);
	});
});

describe("applyBackendPrompt", () => {
	it("retargets the backend cwd prefix into the runner worktree", () => {
		const out = applyBackendPrompt({ prompt: "Write into /repo/docs/tasks/t1 and read /repo/src", backendCwd: "/repo", workdir: "/w/kb-t1" });
		assert.equal(out, "Write into /w/kb-t1/docs/tasks/t1 and read /w/kb-t1/src");
	});
	it("leaves empty or same-cwd prompts untouched", () => {
		assert.equal(applyBackendPrompt({ prompt: "", backendCwd: "/repo", workdir: "/w" }), "");
		assert.equal(applyBackendPrompt({ prompt: "x /repo", backendCwd: "/repo", workdir: "/repo" }), "x /repo");
		assert.equal(applyBackendPrompt({ prompt: "x", backendCwd: "", workdir: "/w" }), "x");
	});
});

describe("runner facts (G4/G5)", () => {
	it("probes mock without spawning and unknown ids stay unknown", async () => {
		clearHarnessVersionCache();
		assert.deepEqual(await probeHarnessVersions("mock"), { mock: "mock" });
		assert.deepEqual(await probeHarnessVersions("definitely-not-a-harness"), {
			"definitely-not-a-harness": "unknown",
		});
	});

	it("caches the version probe per process", async () => {
		clearHarnessVersionCache();
		const first = await probeHarnessVersions("mock");
		const second = await probeHarnessVersions("mock");
		assert.equal(first, second);
	});

	it("measures disk headroom on an existing work root", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-disk-"));
		try {
			const mb = diskHeadroomMbFor(dir);
			assert.equal(typeof mb, "number");
			assert.ok(mb >= 0);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
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

	it("runs a leased integrate job: merge, CAS-push, verify, cleanup", async () => {
		// Step 4 E2E on the Runner side: bare origin with main + kb/t1,
		// dispatch hands a leased integrate assignment, the daemon merges
		// in an ephemeral worktree and CAS-pushes main.
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-origin-"));
		execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
		const seed = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-seed-"));
		execFileSync("git", ["clone", "-q", origin, seed], { stdio: "ignore" });
		execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "t"], { cwd: seed, stdio: "ignore" });
		fs.writeFileSync(path.join(seed, "base.txt"), "base");
		execFileSync("git", ["add", "."], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["commit", "-qm", "init"], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["branch", "-M", "main"], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["push", "-q", "origin", "main"], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["checkout", "-qb", "kb/t1"], { cwd: seed, stdio: "ignore" });
		fs.writeFileSync(path.join(seed, "task.txt"), "task work");
		execFileSync("git", ["add", "."], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["commit", "-qm", "task work"], { cwd: seed, stdio: "ignore" });
		execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: seed, stdio: "ignore" });
		const shaOf = (ref) => execFileSync("git", ["rev-parse", ref], { cwd: seed, encoding: "utf8" }).trim();
		const expectedTargetSha = shaOf("main");
		const expectedTaskSha = shaOf("kb/t1");
		const config = loopConfig({ dispatchIdleLimit: 1 });
		dirs.push(config.workRoot, origin, seed);
		const completed = [];
		const reports = [];
		let polls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? {
							assigned: true,
							projectId: "p1",
							taskId: "t1",
							executionId: "e1",
							epoch: 1,
							stageId: "merge-1",
							kind: "integrate",
							integration: {
								taskBranch: "kb/t1",
								expectedTaskSha,
								targetBranch: "main",
								expectedTargetSha,
								mergeAttemptId: "merge-t1-1",
								integrationExecutionId: "ie1",
								integrationEpoch: 1,
							},
							requirements: { kind: "merge", harness: null, model: "", tier: "T0" },
						}
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: seed, gitUrl: origin }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "merge-1" }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			integrationHeartbeat: async () => ({ executionId: "ie1", epoch: 1 }),
			integrationReport: async (args) => {
				reports.push(args);
				return { accepted: true };
			},
			verifySha: async () => ({ verified: true }),
			complete: async (args) => {
				completed.push(args);
				return { accepted: true };
			},
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.equal(reports.length, 1);
		assert.equal(reports[0].outcome, "landed");
		assert.equal(completed.length, 1);
		assert.equal(completed[0].outcome, "passed");
		assert.equal(completed[0].sha, reports[0].mergeSha);
		assert.equal(completed[0].integration.outcome, "landed");
		// The CAS push landed both files on origin/main.
		execFileSync("git", ["fetch", "-q", "origin"], { cwd: seed, stdio: "ignore" });
		const tipAfter = execFileSync("git", ["rev-parse", "origin/main"], { cwd: seed, encoding: "utf8" }).trim();
		assert.equal(tipAfter, completed[0].sha);
		const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", tipAfter], { cwd: seed, encoding: "utf8" });
		assert.ok(tree.split("\n").includes("base.txt"));
		assert.ok(tree.split("\n").includes("task.txt"));
		// The ephemeral worktree is gone.
		const leftovers = fs.readdirSync(config.workRoot).filter((n) => n.startsWith("kb-integrate-"));
		assert.equal(leftovers.length, 0);
		assert.ok(!client.calls.includes("interrupt"));
	});

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

	it("serves the dispatch answer's required model, never a substitution", async () => {
		const repo = localRepo();
		const config = loopConfig({ model: "m-pin", models: ["m-pin", "m-want"] });
		dirs.push(config.workRoot, repo);
		let seenMeta = null;
		const capturingHarness = () => ({
			async createSession(project, meta) {
				seenMeta = meta;
				return {
					getLastAssistantText: () => "done",
					subscribe: () => () => {},
					prompt: async () => "done",
					dispose: async () => {},
				};
			},
		});
		let polls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? {
							assigned: true,
							projectId: "p1",
							taskId: "t1",
							executionId: "e1",
							epoch: 1,
							requirements: { harness: "mock", model: "m-want" },
						}
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => capturingHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.equal(seenMeta?.model, "m-want");
	});

	it("forwards the dispatch answer env to the CI command", async () => {
		const repo = localRepo();
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		let polls = 0;
		let completed = null;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? {
							assigned: true,
							projectId: "p1",
							taskId: "t1",
							executionId: "e1",
							epoch: 1,
							kind: "ci",
							command: "echo \"probe=$CI_DISPATCH_PROBE\"",
							env: { CI_DISPATCH_PROBE: "hello-env" },
						}
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completed = args;
				return { accepted: true, shaState: "present" };
			},
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.match(String(completed?.output ?? ""), /probe=hello-env/);
	});

	it("serves the dispatch answer's required harness per assignment", async () => {
		const repo = localRepo();
		const config = loopConfig({ harnessId: "mock", harnessIds: ["mock", "pi"] });
		dirs.push(config.workRoot, repo);
		const servedBy = [];
		const namedHarness = (id) => ({
			async createSession() {
				servedBy.push(id);
				return {
					getLastAssistantText: () => "done",
					subscribe: () => () => {},
					prompt: async () => "done",
					dispose: async () => {},
				};
			},
		});
		let polls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? {
							assigned: true,
							projectId: "p1",
							taskId: "t1",
							executionId: "e1",
							epoch: 1,
							requirements: { harness: "pi", model: null },
						}
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			getWorkflow: async () => ({ workflow: { stages: [] } }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		const loaded = [];
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async (id) => {
				loaded.push(id);
				return namedHarness(id);
			},
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.deepEqual(loaded, ["mock", "pi"]);
		assert.deepEqual(servedBy, ["pi"]);
	});

	it("falls back to the primary harness when requirements name an unloaded one", async () => {
		const repo = localRepo();
		const config = loopConfig({ harnessId: "mock", harnessIds: ["mock"] });
		dirs.push(config.workRoot, repo);
		const servedBy = [];
		let polls = 0;
		const warnings = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? {
							assigned: true,
							projectId: "p1",
							taskId: "t1",
							executionId: "e1",
							epoch: 1,
							requirements: { harness: "nope", model: null },
						}
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			getWorkflow: async () => ({ workflow: { stages: [] } }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async () => ({ accepted: true, shaState: "present" }),
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async (id) => ({
				async createSession() {
					servedBy.push(id);
					return {
						getLastAssistantText: () => "done",
						subscribe: () => () => {},
						prompt: async () => "done",
						dispose: async () => {},
					};
				},
			}),
			logger: { log: () => {}, warn: (m) => warnings.push(m) },
		});
		assert.equal(out.assignments, 1);
		assert.deepEqual(servedBy, ["mock"]);
		assert.ok(warnings.some((w) => /primary/.test(w)));
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

	it("backs off on RUNNER_PAUSED without consuming idle budget or crashing", async () => {
		const repo = localRepo();
		const config = loopConfig({ dispatchIdleLimit: 1 });
		dirs.push(config.workRoot, repo);
		let dispatches = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				dispatches += 1;
				if (dispatches <= 2) {
					const err = new Error("Runner dispatch-pause is paused");
					err.statusCode = 409;
					err.code = "RUNNER_PAUSED";
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

	it("never idles out with dispatchIdleLimit 0 (persistent service mode)", async () => {
		const repo = localRepo();
		const config = loopConfig({ dispatchIdleLimit: 0 });
		dirs.push(config.workRoot, repo);
		let polls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				if (polls === 1) return { assigned: false, code: "NO_CLAIMABLE_TASKS" };
				throw new Error("persistent-loop-probe");
			},
		});
		await assert.rejects(
			runDispatchLoop({
				config,
				client,
				loadHarness: async () => fakeHarness(),
				logger: { log: () => {}, warn: () => {} },
			}),
			/persistent-loop-probe/,
		);
		assert.equal(polls, 2);
	});
});

describe("runCiCommand", () => {
	it("runs a command in the workdir and reports exit codes", async () => {
		const ok = await runCiCommand({ command: "echo hello-ci", workdir: "/tmp" });
		assert.equal(ok.exitCode, 0); assert.match(ok.output, /hello-ci/);
		const bad = await runCiCommand({ command: "exit 3", workdir: "/tmp" });
		assert.equal(bad.exitCode, 3);
	});
});
