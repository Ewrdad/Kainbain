import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	AUTO_DETECTABLE_HARNESSES,
	clearDiscoveredModelsCache,
	clearHarnessVersionCache,
	defaultLoadHarness,
	detectAvailableHarnesses,
	deliverSteers,
	diskHeadroomMbFor,
	handlePendingCommands,
	joinAndHeartbeat,
	probeHarnessVersions,
	refreshDiscoveredModels,
	resolveHarnessConfig,
	runCiCommand,
	runDispatchLoop,
	runSingleAssignment,
	applyBackendPrompt,
	startClaimRenewal,
	RUNNER_API_VERSION,
	RUNNER_VERSION,
	ciWorkdirFor,
	integrationMergeSubject,
} from "./daemon.js";
import { isAdminCommitSubject } from "../shared/changelogHistory/isAdminCommitSubject.js";
import { servingModelFor } from "../shared/servingModelFor.js";
import { formatPosture } from "../shared/formatPosture.js";

describe("integrationMergeSubject", () => {
	it("carries the task title and survives the changelog admin filter", () => {
		const subject = integrationMergeSubject({
			taskBranch: "kb/a654a254-ba7c-4f38-bb5e-d767fc25b6ff",
			targetBranch: "main",
			task: { title: "fix horizontal scroll on bottom bar on mobile" },
		});
		assert.equal(subject, "Merge kb/a654a254-ba7c-4f38-bb5e-d767fc25b6ff into main: fix horizontal scroll on bottom bar on mobile");
		assert.equal(isAdminCommitSubject(subject), false);
	});
	it("collapses multiline titles and falls back to the branch pair", () => {
		assert.equal(
			integrationMergeSubject({ taskBranch: "kb/x", targetBranch: "main", task: { title: "a\n  b" } }),
			"Merge kb/x into main: a b",
		);
		assert.equal(integrationMergeSubject({ taskBranch: "kb/x", targetBranch: "main", task: {} }), "Merge kb/x into main");
	});
});

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

describe("RUNNER_VERSION", () => {
	it("equals runner/version.json runnerVersion (the update channel + fleet matrix compare this)", () => {
		const parsed = JSON.parse(fs.readFileSync(new URL("./version.json", import.meta.url), "utf8"));
		assert.equal(RUNNER_VERSION, parsed.runnerVersion);
	});

	it("is a semver product version independent of the api version", () => {
		assert.match(String(RUNNER_VERSION), /^\d+\.\d+\.\d+/);
		assert.equal(typeof RUNNER_VERSION, "string");
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

	it("reports a worktree-cap refusal as an interrupt instead of crashing", async () => {
		// e79b1d25 outage: the cap refusal killed the Runner process, and
		// systemd restart storms turned one refusal into a death loop. The
		// Runner must interrupt (task re-queues) and keep polling.
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		// Five freshly-used foreign workdirs: none stale enough to evict.
		for (let i = 0; i < 5; i++) fs.mkdirSync(path.join(config.workRoot, `kb-old-${i}`));
		const errors = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1", status: "in_stage" }),
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
			logger: { log: () => {}, warn: () => {}, error: (m) => errors.push(String(m)) },
		});
		assert.equal(out.interrupted, true);
		assert.ok(client.calls.includes("interrupt"), "task re-queues via interrupt");
		assert.ok(!client.calls.includes("complete"), "no completion reported for unrun work");
		assert.ok(errors.some((m) => /WORKTREE_CAP_REACHED|Worktree cap/.test(m)), "loud runner-side report");
		for (let i = 0; i < 5; i++) {
			assert.ok(fs.existsSync(path.join(config.workRoot, `kb-old-${i}`)), "fresh workdirs never deleted");
		}
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

	it("reports no model for a CI claim in single-assignment mode, even with a pinned default", async () => {
		const repo = localRepo();
		const config = baseConfig({ model: "m-pin" });
		dirs.push(config.workRoot, repo);
		const progressCalls = [];
		let completed = null;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "run tests", currentStageId: "ci-1" }),
			claim: async () => ({ executionId: "e1", epoch: 1, kind: "ci", command: "echo ci-single" }),
			progress: async (args) => {
				progressCalls.push(args);
				return { recorded: true };
			},
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completed = args;
				return { accepted: true, shaState: "present" };
			},
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runSingleAssignment({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.accepted, true);
		const prompted = progressCalls.find((c) => c.event === "prompted");
		assert.equal(prompted.model, null);
		assert.equal(completed.posture, "T0/T1:mock");
		assert.equal(completed.model, null);
		assert.ok(!completed.posture.includes("default"));
		assert.ok(!completed.posture.includes("m-pin"));
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

describe("runSingleAssignment agent verdict detection", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	const FAIL_BLOCK = "KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";

	function verdictHarness({ reply = "done", events = [], promptThrows = null } = {}) {
		return {
			async createSession() {
				return {
					getLastAssistantText: () => reply,
					subscribe: (handler) => {
						for (const event of events) handler(event);
						return () => {};
					},
					prompt: async () => {
						if (promptThrows) throw promptThrows;
						return reply;
					},
					dispose: async () => {},
				};
			},
		};
	}

	async function runVerdictAssignment({ reply, events, promptThrows = null, claimExtra = {} }) {
		const repo = localRepo();
		const config = baseConfig();
		dirs.push(config.workRoot, repo);
		const completed = [];
		const warnings = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			claim: async () => ({ executionId: "e1", epoch: 1, ...claimExtra }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completed.push(args);
				return { accepted: true, shaState: "present" };
			},
			interrupt: async () => ({ interrupted: true }),
		});
		await runSingleAssignment({
			config,
			client,
			loadHarness: async () => verdictHarness({ reply, events, promptThrows }),
			logger: { log: () => {}, warn: (m) => warnings.push(String(m)) },
		});
		assert.equal(completed.length, 1);
		return { completed: completed[0], warnings };
	}

	it("R1: a fail_stage tool call alone (no verdict block) fails with rejected", async () => {
		const { completed } = await runVerdictAssignment({
			reply: "all done, nothing to report",
			events: [{ type: "tool_started", toolName: "fail_stage", args: { reason: "tests red on main" } }],
		});
		assert.equal(completed.outcome, "failed");
		assert.equal(completed.failureKind, "rejected");
		assert.match(completed.failureReason, /\[Agent Review Rejection\] tests red on main/);
		// The failed report carries the same run context as a pass.
		assert.match(completed.posture, /mock/);
		assert.equal(typeof completed.durationMs, "number");
		assert.match(completed.output, /all done/);
	});

	it("R2: a FAIL block with reason and fix fails with the Fix guidance: reason", async () => {
		const { completed } = await runVerdictAssignment({
			reply: `Deep review complete.\n${FAIL_BLOCK}`,
		});
		assert.equal(completed.outcome, "failed");
		assert.equal(completed.failureKind, "rejected");
		assert.equal(
			completed.failureReason,
			"[Agent Review Rejection] canary test red Fix guidance: pause the stage in spec setup",
		);
	});

	it("R3: a reasonless FAIL still passes open with a warning", async () => {
		const { completed, warnings } = await runVerdictAssignment({
			reply: "Something is wrong.\nKAINBAIN_VERDICT: FAIL",
		});
		assert.equal(completed.outcome, "passed");
		assert.ok(!("failureKind" in completed), "no failureKind on a pass");
		assert.ok(warnings.some((w) => w.includes("Stage verdict FAIL ignored (fail-open)")));
	});

	it("R4: malformed blocks and prose verdicts pass silently", async () => {
		for (const reply of [
			"KAINBAIN_VERDICT: MAYBE",
			"Verdict: STAGE FAILED — rework required (prose, no block)",
			"```text\nKAINBAIN_VERDICT: FAIL\n```",
		]) {
			const { completed, warnings } = await runVerdictAssignment({ reply });
			assert.equal(completed.outcome, "passed", reply);
			assert.ok(
				!warnings.some((w) => w.includes("Stage verdict FAIL ignored")),
				`no fail-open warning for ${JSON.stringify(reply)}`,
			);
		}
	});

	it("R5: the CI branch never consults a verdict block in command output", async () => {
		const { completed } = await runVerdictAssignment({
			reply: "unused on the CI branch",
			claimExtra: {
				kind: "ci",
				command: "printf 'KAINBAIN_VERDICT: FAIL\\nKAINBAIN_REASON: x\\nKAINBAIN_FIX: y\\n'",
			},
		});
		assert.equal(completed.outcome, "passed");
		assert.match(completed.output, /KAINBAIN_VERDICT: FAIL/);
	});

	it("R6: a fail_stage call wins over a PASS text block (Skill name + message fallback)", async () => {
		const { completed } = await runVerdictAssignment({
			reply: "all good\nKAINBAIN_VERDICT: PASS",
			events: [{ type: "tool_started", toolName: "Fail_stage_skill", args: { message: "human review found a blocker" } }],
		});
		assert.equal(completed.outcome, "failed");
		assert.equal(completed.failureKind, "rejected");
		assert.equal(completed.failureReason, "[Agent Review Rejection] human review found a blocker");
	});

	it("R7: a latched fail_stage call wins over a later prompt exception", async () => {
		// Mirrors the embedded path (api/agentRunner.js prefers
		// stageFailureRequested over promptException): the agent's deliberate
		// rejection reports as rejected, not as the harness error.
		const { completed } = await runVerdictAssignment({
			reply: "unused — prompt throws",
			events: [{ type: "tool_started", toolName: "fail_stage", args: { reason: "tests red on main" } }],
			promptThrows: new Error("harness connection reset"),
		});
		assert.equal(completed.outcome, "failed");
		assert.equal(completed.failureKind, "rejected");
		assert.equal(completed.failureReason, "[Agent Review Rejection] tests red on main");
	});

	it("R8: the watcher reads the same event fallbacks as the embedded path", async () => {
		// Embedded parity (api/agentRunner.js): event.name and
		// event.arguments are read when toolName/args are absent.
		const { completed } = await runVerdictAssignment({
			reply: "all done, nothing to report",
			events: [{ type: "tool_started", name: "fail_stage", arguments: { reason: "fallback field shapes" } }],
		});
		assert.equal(completed.outcome, "failed");
		assert.equal(completed.failureKind, "rejected");
		assert.equal(completed.failureReason, "[Agent Review Rejection] fallback field shapes");
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

describe("model auto-discovery refresh", () => {
	const base = { harnessIds: ["muse"], models: [], model: "" };
	it("caches discovered ids when nothing is pinned", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: base,
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, ["muse::meta::m"]);
		assert.equal(calls, 1);
	});
	it("skips scanning when the operator pinned models (pin wins by default)", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: { ...base, models: ["pinned"] },
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, []);
		assert.equal(calls, 0);
	});
	it("skips scanning for a singular model pin too", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: { ...base, model: "pinned" },
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, []);
		assert.equal(calls, 0);
	});
	it("scans despite the pin with the discovery-wins opt-in (survey q4)", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: { ...base, models: ["pinned"], modelDiscoveryWins: true },
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, ["muse::meta::m"]);
		assert.equal(calls, 1);
	});
	it("skips scanning when discovery is disabled (interval 0), keeping the cache for the pin fallback", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: { ...base, models: ["pinned"], modelDiscoveryIntervalMs: 0 },
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, []);
		assert.equal(calls, 0);
	});
	it("skips harnesses without a discovery leg", async () => {
		clearDiscoveredModelsCache();
		let calls = 0;
		const out = await refreshDiscoveredModels({
			config: { ...base, harnessIds: ["mock"] },
			discoverFn: async () => {
				calls += 1;
				return ["muse::meta::m"];
			},
		});
		assert.deepEqual(out, []);
		assert.equal(calls, 0);
	});
	it("scans every configured harness leg and combines the ids", async () => {
		clearDiscoveredModelsCache();
		const out = await refreshDiscoveredModels({
			config: { harnessIds: ["muse", "pi"], models: [], model: "" },
			discoverFn: async () => ["muse::meta::m"],
			discoveryCtx: {
				createHarness: async () => ({
					listModels: async () => [{ key: "pi::mistral::x" }, { key: "pi::mistral::y" }],
				}),
			},
		});
		assert.deepEqual(out, ["muse::meta::m", "pi::mistral::x", "pi::mistral::y"]);
	});
	it("keeps the previous cache when a later round fails", async () => {
		clearDiscoveredModelsCache();
		const config = base;
		await refreshDiscoveredModels({ config, discoverFn: async () => ["muse::meta::m"] });
		const out = await refreshDiscoveredModels({
			config,
			discoverFn: async () => {
				throw new Error("serve down");
			},
		});
		assert.deepEqual(out, ["muse::meta::m"]);
	});
	it("validates overridden ids before advertisement (garbage never ships)", async () => {
		clearDiscoveredModelsCache();
		const warnings = [];
		const out = await refreshDiscoveredModels({
			config: base,
			logger: { log: () => {}, warn: (m) => warnings.push(m) },
			discoverFn: async () => ["garbage", "muse::meta::m", "muse::meta::m"],
		});
		assert.deepEqual(out, ["muse::meta::m"]);
	});
	it("warns with the leg error code when a leg fails, keeping the old list", async () => {
		clearDiscoveredModelsCache();
		const warnings = [];
		const logger = { log: () => {}, warn: (m) => warnings.push(m) };
		await refreshDiscoveredModels({ config: base, logger, discoverFn: async () => ["muse::meta::m"] });
		const out = await refreshDiscoveredModels({
			config: base,
			logger,
			discoverFn: async () => { throw new Error("serve down"); },
		});
		assert.deepEqual(out, ["muse::meta::m"]);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /MUSE_DISCOVERY_FAILED/);
	});
});

describe("harness auto-detect (default)", () => {
	it("advertises only loadable harnesses in stable order", () => {
		assert.deepEqual(AUTO_DETECTABLE_HARNESSES, ["pi", "muse", "antigravity", "vibe"]);
	});

	it("detects pi and antigravity via either binary name", () => {
		const present = new Set(["pi", "agy"]);
		const got = detectAvailableHarnesses({
			pathValue: "/usr/bin:/bin",
			pathDelimiter: ":",
			isExecutable: (bin) => present.has(bin),
		});
		assert.deepEqual(got, ["pi", "antigravity"]);
	});

	it("returns empty when no CLI is on PATH", () => {
		const got = detectAvailableHarnesses({
			pathValue: "/usr/bin:/bin",
			pathDelimiter: ":",
			isExecutable: () => false,
		});
		assert.deepEqual(got, []);
	});

	it("leaves manual configs untouched", () => {
		const config = { harnessIds: ["mock"], harnessId: "mock", harnessAuto: false };
		assert.equal(resolveHarnessConfig(config), config);
		assert.deepEqual(config.harnessIds, ["mock"]);
	});

	it("resolves auto configs from injected detection and drops the harness error", () => {
		const config = { harnessIds: [], harnessId: "", harnessAuto: true, errors: ["KAINBAIN_RUNNER_HARNESS is required"] };
		resolveHarnessConfig(config, { detected: ["muse", "pi"] });
		assert.deepEqual(config.harnessIds, ["muse", "pi"]);
		assert.equal(config.harnessId, "muse");
		assert.equal(config.harnessAuto, false);
		assert.deepEqual(config.errors, []);
	});

	it("fail-fasts when auto-detect finds nothing", () => {
		const config = { harnessIds: [], harnessId: "", harnessAuto: true, errors: [] };
		assert.throws(() => resolveHarnessConfig(config, { detected: [] }), /auto-detect found no harness/);
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

	it("serves one impromptu job on an idle iteration, then idles out", async () => {
		const repo = localRepo();
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		let impromptuPolls = 0;
		const completed = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => ({ assigned: false, code: "NO_CLAIMABLE_TASKS" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			impromptuPoll: async () => {
				impromptuPolls += 1;
				return impromptuPolls === 1
					? {
							assigned: true,
							job: {
								jobId: "imp-1",
								projectId: "p1",
								kind: "retrospective-chat",
								prompt: "why did t1 fail?",
								harness: "mock",
								model: null,
								timeoutMs: 60000,
								turnId: "t1",
							},
						}
					: { assigned: false, code: "NO_IMPROMPTU_WORK" };
			},
			impromptuProgress: async () => ({ ok: true }),
			impromptuComplete: async (args) => {
				completed.push(args);
				return { ok: true };
			},
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		// The idle iteration served impromptu work, never task dispatch.
		assert.equal(out.assignments, 0);
		assert.equal(out.idle, true);
		assert.equal(completed.length, 1);
		assert.equal(completed[0].outcome, "completed");
		assert.equal(completed[0].output, "done");
		assert.ok(!client.calls.includes("claim"), "impromptu work never claims a task");
		assert.ok(!client.calls.includes("interrupt"));
		// The per-job scratch dir is removed afterwards.
		assert.equal(fs.existsSync(path.join(config.workRoot, "impromptu-imp-1")), false);
	});

	it("keeps polling dispatch when impromptu polling is refused or fails", async () => {
		const repo = localRepo();
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		const warnings = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => ({ assigned: false, code: "NO_CLAIMABLE_TASKS" }),
			impromptuPoll: async () => {
				const err = new Error("boom");
				err.statusCode = 500;
				throw err;
			},
		});
		const out = await runDispatchLoop({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: { log: () => {}, warn: (message) => warnings.push(String(message)) },
		});
		assert.equal(out.idle, true);
		assert.ok(
			warnings.some((message) => message.includes("Impromptu poll failed")),
			"transport failures are logged, never thrown",
		);
	});

	it("logs a failed impromptu job and continues with dispatch", async () => {
		const repo = localRepo();
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		let impromptuPolls = 0;
		const warnings = [];
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => ({ assigned: false, code: "NO_CLAIMABLE_TASKS" }),
			getProject: async () => ({ id: "p1", cwd: repo }),
			impromptuPoll: async () => {
				impromptuPolls += 1;
				return impromptuPolls === 1
					? {
							assigned: true,
							job: {
								jobId: "imp-9",
								projectId: "p1",
								kind: "retrospective-chat",
								prompt: "hi",
								harness: "mock",
								model: null,
								timeoutMs: 60000,
								turnId: null,
							},
						}
					: { assigned: false, code: "NO_IMPROMPTU_WORK" };
			},
			impromptuProgress: async () => ({ ok: true }),
			impromptuComplete: async () => ({ ok: true }),
		});
		const out = await runDispatchLoop({
			config,
			client,
			// The harness fails every prompt: the job reports failed, the
			// loop logs it and keeps polling dispatch instead of crashing.
			loadHarness: async () => ({
				async createSession() {
					return {
						subscribe: () => () => {},
						prompt: async () => {
							throw new Error("Model exploded");
						},
						dispose: async () => {},
					};
				},
			}),
			logger: { log: () => {}, warn: (message) => warnings.push(String(message)) },
		});
		assert.equal(out.idle, true);
		assert.ok(
			warnings.some((message) => message.includes("imp-9") && message.includes("failed")),
			"job failure is logged with its job id",
		);
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

	it("runs the harness on the reported model when the dispatch model is the default sentinel", async () => {
		// The harness must receive the SAME model every observable
		// reports: the raw "default" sentinel would otherwise run
		// literally while the UI reports the Runner fallback.
		const repo = localRepo();
		const config = loopConfig({ model: "m-pin", models: ["m-pin"] });
		dirs.push(config.workRoot, repo);
		let seenMeta = null;
		let completed = null;
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
							requirements: { harness: "mock", model: "default" },
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
			loadHarness: async () => capturingHarness(),
			logger: { log: () => {}, warn: () => {} },
		});
		assert.equal(out.assignments, 1);
		assert.equal(seenMeta?.model, "m-pin");
		assert.equal(completed?.model, "m-pin");
	});

	it("reports the served model accurately: dispatch model on agent stages, none on CI stages", async () => {
		// The regression this pins: every observable path used to write the
		// Runner default (`config.model || "default"`), so the UI showed
		// "default" constantly and a model on CI stages that never used one.
		const repo = localRepo();
		const config = loopConfig({ model: "m-pin", models: ["m-pin", "m-want"] });
		dirs.push(config.workRoot, repo);
		const progressCalls = [];
		const completeCalls = [];
		let polls = 0;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				if (polls === 1) {
					return {
						assigned: true, projectId: "p1", taskId: "t1", executionId: "e-agent", epoch: 1,
						requirements: { harness: "mock", model: "m-want" },
					};
				}
				if (polls === 2) {
					return {
						assigned: true, projectId: "p1", taskId: "t1", executionId: "e-ci", epoch: 2,
						kind: "ci", command: "echo ci-ok", requirements: { harness: "mock", model: "" },
					};
				}
				return { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			progress: async (args) => {
				progressCalls.push(args);
				return { recorded: true };
			},
			logs: async () => ({ accepted: true }),
			complete: async (args) => {
				completeCalls.push(args);
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
		assert.equal(out.assignments, 2);
		// Agent assignment: the prompted report and the completion posture
		// carry the DISPATCHED model, never the Runner default.
		const agentPrompted = progressCalls.find((c) => c.executionId === "e-agent" && c.event === "prompted");
		assert.equal(agentPrompted.model, "m-want");
		assert.equal(agentPrompted.harness, "mock");
		const agentComplete = completeCalls.find((c) => c.executionId === "e-agent");
		assert.equal(agentComplete.posture, "T0/T1:mock:m-want");
		assert.equal(agentComplete.model, "m-want");
		assert.ok(!agentComplete.posture.includes("default"));
		assert.ok(!agentComplete.posture.includes("m-pin"));
		// CI assignment: no model anywhere — progress reports null (omitted on
		// the wire by client.progress) and the posture/complete carry no model.
		const ciPrompted = progressCalls.find((c) => c.executionId === "e-ci" && c.event === "prompted");
		assert.equal(ciPrompted.model, null);
		assert.equal(ciPrompted.harness, "mock");
		const ciComplete = completeCalls.find((c) => c.executionId === "e-ci");
		assert.equal(ciComplete.posture, "T0/T1:mock");
		assert.equal(ciComplete.model, null);
		assert.ok(!ciComplete.posture.includes("default"));
		assert.ok(!ciComplete.posture.includes("m-pin"));
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

describe("servingModelFor", () => {
	it("returns dispatch model for agent", () => {
		assert.equal(servingModelFor({ kind: "agent", model: "kimi-k3:cloud", fallbackModel: "x" }), "kimi-k3:cloud");
	});
	it("falls back for agent without dispatch model", () => {
		assert.equal(servingModelFor({ kind: "agent", model: "", fallbackModel: "fallback" }), "fallback");
	});
	it("returns null for agent with neither", () => {
		assert.equal(servingModelFor({ kind: "agent", model: "", fallbackModel: "" }), null);
	});
	it("returns null for ci even if model present", () => {
		assert.equal(servingModelFor({ kind: "ci", model: "anything", fallbackModel: "fb" }), null);
	});
	it("returns null for merge/integrate", () => {
		assert.equal(servingModelFor({ kind: "merge", model: "m", fallbackModel: "fb" }), null);
		assert.equal(servingModelFor({ kind: "integrate", model: "m", fallbackModel: "fb" }), null);
		assert.equal(servingModelFor({ kind: "integration", model: "m", fallbackModel: "fb" }), null);
	});
	it("returns null for every non-LLM stage kind, even with a model attached", () => {
		for (const kind of ["ci", "script", "deploy", "command", "human"]) {
			assert.equal(servingModelFor({ kind, model: "m", fallbackModel: "fb" }), null, kind);
		}
	});
	it("matches kind case-insensitively and trimmed", () => {
		assert.equal(servingModelFor({ kind: " CI ", model: "m", fallbackModel: "fb" }), null);
		assert.equal(servingModelFor({ kind: "Agent", model: "m", fallbackModel: "fb" }), "m");
	});
	it("treats non-string model/fallback as absent, never the literal \"default\"", () => {
		assert.equal(servingModelFor({ kind: "agent", model: 42, fallbackModel: null }), null);
		assert.equal(servingModelFor({ kind: "agent", model: undefined, fallbackModel: "fb" }), "fb");
		assert.equal(servingModelFor(), null);
		assert.equal(servingModelFor({ kind: "agent" }), null);
	});
	it("trims whitespace model", () => {
		assert.equal(servingModelFor({ kind: "agent", model: "  m  ", fallbackModel: "fb" }), "m");
		assert.equal(servingModelFor({ kind: "agent", model: "   ", fallbackModel: "   " }), null);
	});
});

describe("formatPosture", () => {
	it("includes model when real", () => {
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: "m" }), "T0:pi:m");
		assert.equal(formatPosture({ tiers: ["T0", "T1"], harness: "pi", model: "  m  " }), "T0/T1:pi:m");
	});
	it("omits model segment when null, blank, non-string, or the default sentinel", () => {
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: null }), "T0:pi");
		assert.equal(formatPosture({ tiers: ["T0", "T1"], harness: "pi", model: "" }), "T0/T1:pi");
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: "   " }), "T0:pi");
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: 42 }), "T0:pi");
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: "default" }), "T0:pi");
		assert.equal(formatPosture({ tiers: ["T0"], harness: "pi", model: "  Default " }), "T0:pi");
	});
	it("never emits stray segments for missing tiers or harness", () => {
		assert.equal(formatPosture({ tiers: ["T0"], harness: "", model: "m" }), "T0:m");
		assert.equal(formatPosture({ harness: "pi", model: "m" }), "pi:m");
		assert.equal(formatPosture({ model: "m" }), "m");
		assert.equal(formatPosture({}), "");
		assert.equal(formatPosture({ tiers: [], harness: "  ", model: null }), "");
	});
	it("accepts tiers as a plain string", () => {
		assert.equal(formatPosture({ tiers: "T0/T1", harness: "pi", model: null }), "T0/T1:pi");
	});
});

describe("handlePendingCommands", () => {
	const quiet = { log: () => {}, warn: () => {} };
	const claudeConfig = (overrides = {}) => baseConfig({ harnessIds: ["mock", "muse"], ...overrides });

	beforeEach(() => {
		clearDiscoveredModelsCache();
	});
	afterEach(() => {
		clearDiscoveredModelsCache();
	});

	it("re-runs discovery promptly and stages a success ack", async () => {
		let probes = 0;
		const state = {};
		await handlePendingCommands({
			config: claudeConfig(),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { probes += 1; return ["muse::test::m1", "muse::test::m2"]; },
		});
		assert.equal(probes, 1);
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 2 model(s) (muse:2)" },
		]);
	});

	it("acks pinned without scanning when models are pinned (pin wins by default)", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ models: ["pinned-model"] }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { throw new Error("must not probe when pinned"); },
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "models pinned; discovery skipped" },
		]);
	});

	it("re-detects despite the pin with the discovery-wins opt-in (survey q4)", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ models: ["pinned-model"], modelDiscoveryWins: true }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => ["muse::test::m1", "muse::test::m2"],
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 2 model(s) (muse:2)" },
		]);
	});

	it("acks re-detection across legs with per-harness counts", async () => {
		const state = {};
		await handlePendingCommands({
			config: baseConfig({ harnessIds: ["muse", "pi"], harnessId: "muse" }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => ["muse::meta::m"],
			discoveryCtx: {
				createHarness: async () => ({
					listModels: async () => [{ key: "pi::mistral::x" }],
				}),
			},
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 2 model(s) (muse:1, pi:1)" },
		]);
	});

	it("acks without scanning when discovery is disabled (interval 0)", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ models: ["pinned-model"], modelDiscoveryIntervalMs: 0 }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { throw new Error("must not probe when disabled"); },
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovery disabled (interval 0); advertising pinned list" },
		]);
	});

	it("acks plainly when no configured harness has a discovery leg", async () => {
		const state = {};
		await handlePendingCommands({
			config: baseConfig({ harnessIds: ["mock"], harnessId: "mock" }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { throw new Error("must not probe without a leg"); },
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 0 model(s) (no discovery legs configured)" },
		]);
	});

	it("acks with the first leg error code when a leg fails, cache kept", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig(),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { throw new Error("serve down"); },
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 0 model(s) (muse:0) (MUSE_DISCOVERY_FAILED)" },
		]);
	});

	it("parks requestUpdate while an execution is live (never interrupts)", async () => {
		const state = { executionId: "e1", epoch: 1 };
		await handlePendingCommands({
			config: claudeConfig({ autoUpdate: true }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestUpdate"],
			updateDeps: {
				checkForUpdate: async () => { throw new Error("must not check while busy"); },
			},
		});
		assert.equal(state.pendingUpdate, true);
		assert.deepEqual(state.commandAcks, [
			{ command: "requestUpdate", ok: true, detail: "queued: update at next idle" },
		]);
	});

	it("runs requestUpdate immediately when idle and acks the outcome", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ autoUpdate: true }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestUpdate"],
			updateDeps: {
				checkForUpdate: async () => ({ ok: true, update: null, reason: "up to date" }),
				applyUpdate: async () => { throw new Error("must not apply"); },
			},
		});
		assert.equal(state.pendingUpdate, undefined);
		assert.deepEqual(state.commandAcks, [
			{ command: "requestUpdate", ok: true, detail: "up to date" },
		]);
	});

	it("acks update failures without throwing", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ autoUpdate: true }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestUpdate"],
			updateDeps: {
				checkForUpdate: async () => { throw new Error("mirror down"); },
			},
		});
		assert.equal(state.commandAcks.length, 1);
		assert.equal(state.commandAcks[0].command, "requestUpdate");
		assert.equal(state.commandAcks[0].ok, false);
		assert.match(state.commandAcks[0].detail, /mirror down/);
	});

	it("confirms the ack over a final heartbeat before exiting into a staged update", async () => {
		const heartbeats = [];
		const state = {};
		const realExit = process.exit;
		let exitCode = null;
		process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
		try {
			await assert.rejects(
				handlePendingCommands({
					config: claudeConfig({ autoUpdate: true }),
					client: { heartbeat: async (args) => { heartbeats.push(args); return { status: "active" }; } },
					logger: quiet,
					state,
					pendingCommands: ["requestUpdate"],
					updateDeps: {
						checkForUpdate: async () => ({ ok: true, update: { version: "9.9.9" } }),
						applyUpdate: async () => ({ ok: true }),
					},
				}),
				/process\.exit\(0\)/,
			);
		} finally {
			process.exit = realExit;
		}
		assert.equal(exitCode, 0);
		assert.equal(heartbeats.length, 1);
		assert.deepEqual(heartbeats[0].facts.commandAck, {
			command: "requestUpdate",
			ok: true,
			detail: "updated to 9.9.9",
		});
	});

	it("ignores unknown commands", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig(),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestRestart", null, undefined],
		});
		assert.deepEqual(state.commandAcks, []);
	});

	it("skips repeats already staged or in flight (at-least-once redelivery)", async () => {
		let probes = 0;
		let release;
		const gate = new Promise((r) => { release = r; });
		const state = {};
		const opts = {
			config: claudeConfig(),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery"],
			discoverFn: async () => { probes += 1; await gate; return ["muse::test::m1"]; },
		};
		const first = handlePendingCommands(opts);
		// Second overlapping delivery while the first probe is in flight.
		const second = handlePendingCommands(opts);
		release();
		await Promise.all([first, second]);
		assert.equal(probes, 1);
		assert.equal(state.commandAcks.length, 1);
		// A later redelivery after the ack staged still acts only once.
		await handlePendingCommands({ ...opts, discoverFn: async () => { probes += 1; return ["muse::test::m1"]; } });
		assert.equal(probes, 1);
		assert.equal(state.commandAcks.length, 1);
	});

	it("stages both acks FIFO when two commands arrive together", async () => {
		const state = {};
		await handlePendingCommands({
			config: claudeConfig({ autoUpdate: true }),
			client: {},
			logger: quiet,
			state,
			pendingCommands: ["requestModelRediscovery", "requestUpdate"],
			discoverFn: async () => ["muse::test::m1"],
			updateDeps: {
				checkForUpdate: async () => ({ ok: true, update: null, reason: "up to date" }),
			},
		});
		assert.deepEqual(state.commandAcks, [
			{ command: "requestModelRediscovery", ok: true, detail: "discovered 1 model(s) (muse:1)" },
			{ command: "requestUpdate", ok: true, detail: "up to date" },
		]);
	});
});

describe("deliverSteers command channel", () => {
	const quiet = { log: () => {}, warn: () => {} };

	it("acts on delivered commands and sends the staged ack on the next heartbeat", async () => {
		clearDiscoveredModelsCache();
		const heartbeats = [];
		const client = {
			heartbeat: async (args) => {
				heartbeats.push(args);
				return heartbeats.length === 1
					? { status: "active", pendingCommands: ["requestModelRediscovery"] }
					: { status: "active" };
			},
		};
		const config = baseConfig({ harnessIds: ["mock", "muse"] });
		const state = {};
		try {
			await deliverSteers({
				config,
				client,
				logger: quiet,
				facts: {},
				state,
				discoverFn: async () => ["muse::test::m1"],
			});
			assert.equal(heartbeats[0].facts.commandAck, undefined);
			assert.equal(state.commandAcks.length, 1);
			await deliverSteers({ config, client, logger: quiet, facts: {}, state });
			assert.deepEqual(heartbeats[1].facts.commandAck, {
				command: "requestModelRediscovery",
				ok: true,
				detail: "discovered 1 model(s) (muse:1)",
			});
			assert.deepEqual(state.commandAcks, []);
		} finally {
			clearDiscoveredModelsCache();
			fs.rmSync(config.workRoot, { recursive: true, force: true });
		}
	});
});

describe("joinAndHeartbeat command channel", () => {
	const quiet = { log: () => {}, warn: () => {} };

	it("acts on commands queued while the runner was down (boot delivery)", async () => {
		const config = baseConfig({ harnessIds: ["mock"], autoUpdate: false });
		const client = {
			setCredential: () => {},
			heartbeat: async () => ({ status: "active", pendingCommands: ["requestUpdate"] }),
		};
		const state = {};
		const { stop } = await joinAndHeartbeat({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: quiet,
			state,
		});
		try {
			assert.equal(state.commandAcks.length, 1);
			assert.equal(state.commandAcks[0].command, "requestUpdate");
			assert.equal(state.commandAcks[0].ok, true);
		} finally {
			stop();
			fs.rmSync(config.workRoot, { recursive: true, force: true });
		}
	});
});

describe("collectTaskFiles docsDirName", () => {
	it("reads files from a custom docs folder", async () => {
		const fs = (await import("node:fs")).default;
		const os = (await import("node:os")).default;
		const path = (await import("node:path")).default;
		const { collectTaskFiles } = await import("./daemon.js");
		const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wt-"));
		try {
			fs.mkdirSync(path.join(workdir, "kdocs", "tasks", "t1"), { recursive: true });
			fs.writeFileSync(path.join(workdir, "kdocs", "tasks", "t1", "SURVEY.md"), "x");
			const files = collectTaskFiles({ workdir, taskId: "t1", docsDirName: "kdocs" });
			assert.deepEqual(files, [{ name: "SURVEY.md", content: "x" }]);
			const invalid = collectTaskFiles({ workdir, taskId: "t1", docsDirName: "../escape" });
			assert.deepEqual(invalid, []);
		} finally {
			fs.rmSync(workdir, { recursive: true, force: true });
		}
	});
});

describe("joinAndHeartbeat one-click credential handover", () => {
	const quiet = { log: () => {}, warn: () => {} };

	it("collects the handed-over credential, stores it, and keeps booting", async () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-join-"));
		const config = baseConfig({
			credential: "",
			joinToken: "jt",
			home,
			harnessIds: ["mock"],
			autoUpdate: false,
		});
		const registers = [];
		const client = {
			register: async (args) => {
				registers.push(args);
				return registers.length === 1
					? { status: "pending", credential: null }
					: { status: "active", credential: "cred-handed-over" };
			},
			setCredential: (next) => {
				client.credential = next;
			},
			heartbeat: async () => ({ status: "active" }),
		};
		const { stop } = await joinAndHeartbeat({
			config,
			client,
			loadHarness: async () => fakeHarness(),
			logger: quiet,
			state: {},
		});
		try {
			assert.equal(config.credential, "cred-handed-over");
			assert.equal(client.credential, "cred-handed-over");
			const stored = fs.readFileSync(
				path.join(home, ".kainbain", "runner-r1.credential"),
				"utf8",
			);
			assert.equal(stored.trim(), "cred-handed-over");
			assert.equal(registers.length, 2);
			assert.ok(registers[0].joinNonce);
			assert.equal(registers[0].joinNonce, registers[1].joinNonce);
		} finally {
			stop();
			fs.rmSync(config.workRoot, { recursive: true, force: true });
			fs.rmSync(home, { recursive: true, force: true });
		}
	});

	it("falls back to the paste instruction when no credential is handed over", async () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-join-"));
		const config = baseConfig({
			credential: "",
			joinToken: "jt",
			home,
			harnessIds: ["mock"],
			autoUpdate: false,
		});
		const client = {
			register: async () => ({ status: "active", credential: null }),
			setCredential: () => {},
			heartbeat: async () => ({ status: "active" }),
		};
		await assert.rejects(
			joinAndHeartbeat({
				config,
				client,
				loadHarness: async () => fakeHarness(),
				logger: quiet,
				state: {},
			}),
			/Paste the one-time credential/,
		);
		assert.ok(!fs.existsSync(path.join(home, ".kainbain")));
		fs.rmSync(config.workRoot, { recursive: true, force: true });
		fs.rmSync(home, { recursive: true, force: true });
	});

	it("never logs the join nonce", async () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "kb-join-"));
		const lines = [];
		const loud = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)) };
		const config = baseConfig({
			credential: "",
			joinToken: "jt",
			home,
			harnessIds: ["mock"],
			autoUpdate: false,
		});
		let seenNonce = "";
		const client = {
			register: async (args) => {
				seenNonce = args.joinNonce;
				return { status: "pending", credential: null };
			},
			setCredential: () => {},
			heartbeat: async () => ({ status: "active" }),
		};
		// approvalTimeoutMs is 100ms in baseConfig: the join times out while pending.
		await assert.rejects(
			joinAndHeartbeat({
				config: { ...config, approvalTimeoutMs: 30, approvalPollMs: 5 },
				client,
				loadHarness: async () => fakeHarness(),
				logger: loud,
				state: {},
			}),
			/still pending after timeout/,
		);
		assert.ok(seenNonce);
		assert.ok(!lines.some((line) => seenNonce && line.includes(seenNonce)));
		fs.rmSync(config.workRoot, { recursive: true, force: true });
		fs.rmSync(home, { recursive: true, force: true });
	});
});
