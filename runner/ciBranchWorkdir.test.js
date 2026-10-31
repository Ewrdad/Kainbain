import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCiWorkdir, runDispatchLoop } from "./daemon.js";

// Branch-toggle contract for dispatched CI stages (runOnBranch):
// 'task' runs in the task worktree, 'primary' in the primary checkout, and
// 'custom' in an ephemeral worktree at the named branch — a misconfigured
// custom mode must fail loudly, never silently fall back to the task
// worktree (that is what made publish stages run in a kb/* worktree and
// deploy.sh refuse with exit 78).

function localRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cibranch-repo-"));
	execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "init"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["branch", "-M", "main"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["branch", "release/next"], { cwd: dir, stdio: "ignore" });
	return dir;
}

function fakeHarness() {
	return {
		async createSession() {
			return {
				getLastAssistantText: () => "done",
				subscribe: () => () => {},
				prompt: async () => "done",
				dispose: async () => {},
			};
		},
	};
}

function stubClient(script) {
	const client = { setCredential: () => {} };
	for (const [name, fn] of Object.entries(script)) client[name] = async (...args) => fn(...args);
	return client;
}

function loopConfig(overrides = {}) {
	return {
		backendUrl: "http://x:3100",
		joinToken: "jt",
		credential: "cred-1",
		runnerId: "r1",
		harnessId: "mock",
		model: "",
		tiers: ["T0", "T1"],
		workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-cibranch-w-")),
		projectId: "p1",
		taskId: "t1",
		heartbeatMs: 60000,
		approvalPollMs: 10,
		approvalTimeoutMs: 100,
		errors: [],
		dispatch: true,
		dispatchPollMs: 1,
		dispatchIdleLimit: 2,
		...overrides,
	};
}

describe("resolveCiWorkdir", () => {
	let dirs;
	beforeEach(() => { dirs = []; });
	afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

	it("maps task mode to the worktree and primary mode to the primary checkout", async () => {
		const repo = localRepo();
		dirs.push(repo);
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cibranch-w-"));
		dirs.push(workRoot);
		const task = await resolveCiWorkdir({ runOnBranch: "task", workdir: "/w/kb-t1", projectCwd: repo, workRoot, taskId: "t1" });
		assert.equal(task.workdir, "/w/kb-t1");
		assert.equal(task.cleanup, null);
		const primary = await resolveCiWorkdir({ runOnBranch: "primary", workdir: "/w/kb-t1", projectCwd: repo, workRoot, taskId: "t1" });
		assert.equal(primary.workdir, repo);
		assert.equal(primary.cleanup, null);
	});

	it("custom mode prepares a detached worktree at the named branch and cleans it up", async () => {
		const repo = localRepo();
		dirs.push(repo);
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cibranch-w-"));
		dirs.push(workRoot);
		const { workdir, cleanup } = await resolveCiWorkdir({
			runOnBranch: "custom", customBranch: "release/next",
			workdir: "/w/kb-t1", projectCwd: repo, repoUrl: null, workRoot, taskId: "t1",
		});
		assert.equal(workdir, path.join(workRoot, "kb-ci-t1"));
		const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workdir, encoding: "utf8" }).trim();
		const expected = execFileSync("git", ["rev-parse", "release/next"], { cwd: repo, encoding: "utf8" }).trim();
		assert.equal(sha, expected);
		await cleanup();
		assert.ok(!fs.existsSync(workdir), "ephemeral worktree removed by cleanup");
	});

	it("custom mode fails loudly on a blank or missing branch", async () => {
		const repo = localRepo();
		dirs.push(repo);
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cibranch-w-"));
		dirs.push(workRoot);
		await assert.rejects(
			() => resolveCiWorkdir({ runOnBranch: "custom", customBranch: "  ", workdir: "/w/kb-t1", projectCwd: repo, workRoot, taskId: "t1" }),
			/customBranch/,
		);
		await assert.rejects(
			() => resolveCiWorkdir({ runOnBranch: "custom", customBranch: "ghost/branch", workdir: "/w/kb-t1", projectCwd: repo, workRoot, taskId: "t1" }),
			/ghost\/branch|rev-parse/,
		);
	});
});

describe("dispatch loop honours runOnBranch for ci stages", () => {
	let dirs;
	beforeEach(() => { dirs = []; });
	afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

	async function runOneCiAnswer(repo, answerExtra, command = "pwd") {
		const config = loopConfig();
		dirs.push(config.workRoot, repo);
		let polls = 0;
		let completed = null;
		const client = stubClient({
			heartbeat: async () => ({ status: "active" }),
			dispatchClaim: async () => {
				polls += 1;
				return polls === 1
					? { assigned: true, projectId: "p1", taskId: "t1", executionId: "e1", epoch: 1, kind: "ci", command, ...answerExtra }
					: { assigned: false, code: "NO_CLAIMABLE_TASKS" };
			},
			getProject: async () => ({ id: "p1", cwd: repo }),
			getTask: async () => ({ id: "t1", goal: "do it", currentStageId: "s1" }),
			progress: async () => ({ recorded: true }),
			logs: async () => ({ accepted: true }),
			complete: async (args) => { completed = args; return { accepted: true }; },
			interrupt: async () => ({ interrupted: true }),
		});
		const out = await runDispatchLoop({ config, client, loadHarness: async () => fakeHarness(), logger: { log: () => {}, warn: () => {} } });
		assert.equal(out.assignments, 1);
		return { completed, config };
	}

	it("primary runs in the primary checkout", async () => {
		const repo = localRepo();
		const { completed } = await runOneCiAnswer(repo, { runOnBranch: "primary" });
		const cwdLine = String(completed?.output ?? "").trim().split("\n").pop();
		assert.equal(cwdLine, repo);
	});

	it("task (default) runs in the task worktree", async () => {
		const repo = localRepo();
		const { completed, config } = await runOneCiAnswer(repo, { runOnBranch: "task" });
		const cwdLine = String(completed?.output ?? "").trim().split("\n").pop();
		assert.ok(cwdLine.startsWith(config.workRoot), `expected worktree under ${config.workRoot}, got ${cwdLine}`);
	});

	it("custom runs at the custom branch tip in an ephemeral worktree that is cleaned up", async () => {
		const repo = localRepo();
		const { completed, config } = await runOneCiAnswer(
			repo,
			{ runOnBranch: "custom", customBranch: "release/next" },
			"pwd && git rev-parse HEAD",
		);
		const lines = String(completed?.output ?? "").trim().split("\n");
		const cwdLine = lines[0];
		const shaLine = lines[1];
		const expectedSha = execFileSync("git", ["rev-parse", "release/next"], { cwd: repo, encoding: "utf8" }).trim();
		assert.ok(cwdLine.startsWith(path.join(config.workRoot, "kb-ci-")), `custom mode must not run in the task worktree or primary checkout (got ${cwdLine})`);
		assert.equal(shaLine, expectedSha);
		assert.ok(!fs.existsSync(cwdLine), "ephemeral custom worktree removed after the run");
	});

	it("custom with a missing branch fails the stage loudly", async () => {
		const repo = localRepo();
		const { completed } = await runOneCiAnswer(repo, { runOnBranch: "custom", customBranch: "ghost/branch" });
		assert.equal(completed?.outcome, "failed");
		assert.match(String(completed?.failureReason), /branch setup failed/i);
	});
});
