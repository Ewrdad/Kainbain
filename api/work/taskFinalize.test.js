/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for the post-stage finalisation helper: commit → push
// (remote-only) → return to default. Everything happens inside throwaway temp
// directories — never the KainBain repo itself.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

import {
	hashStageConfig,
	parseAttestationToken,
	parseAttestationTrailers,
	verifyAttestationLink,
} from "../../shared/stageAttestation.js";

const { currentBranch, ensureBranchCheckedOut } = await import("../git.js");
const { ensureTaskBranch, resolveTaskBranch } = await import("./taskBranches.js");
const {
	finalizeTaskBranch,
	commitFailedStageWork,
	buildStageCommitMessage,
	STAGE_COMMIT_BODY_MAX_CHARS,
} = await import("./taskFinalize.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo(cwd) {
	fs.mkdirSync(cwd, { recursive: true });
	run(cwd, "init", "-b", "main");
	run(cwd, "config", "user.email", "kainbain-test@example.com");
	run(cwd, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(cwd, "README.md"), "# init\n");
	run(cwd, "add", "-A");
	run(cwd, "commit", "-m", "init");
}

// Minimal store double: finalize only needs cwd resolution, markdown
// persistence, and an (optional) event bridge.
function fakeStore() {
	return {
		_resolveProjectCwd: (_projectId, explicitCwd) => explicitCwd,
		_saveTaskMarkdown: () => {},
		eventBridge: null,
	};
}

function fakeTask(id = "task-1") {
	return {
		id,
		projectId: "proj-1",
		history: [],
		logEntries: [],
	};
}

/** Text view over the task's structured entries (the only log storage). */
const logText = (task) => (task.logEntries || []).map((e) => e.text).join("\n");

describe("buildStageCommitMessage (pure, no git needed)", () => {
	it("returns subject + whole prompt body when a curated prompt exists", () => {
		const prompt = "# Task\nDo the thing.\n\n# Stage\nDo it now.\n";
		const { subject, body } = buildStageCommitMessage(
			{ id: "t1", goal: "Fix the login redirect", prompt },
			"Plan",
		);
		expect(subject).toBe(
			"KainBain (task t1): auto-commit work after stage 'Plan' — Fix the login redirect",
		);
		expect(body).toBe(prompt);
	});

	it("falls back to the legacy subject-only message without a prompt", () => {
		for (const task of [
			{ id: "t1" },
			{ id: "t1", prompt: "" },
			{ id: "t1", prompt: "   \n  " },
			{ id: "t1", prompt: 42 },
			{ id: "t1", prompt: null },
		]) {
			const { subject, body } = buildStageCommitMessage(task, "Plan");
			expect(subject).toBe(
				"KainBain (task t1): auto-commit work after stage 'Plan'",
			);
			expect(body).toBeNull();
		}
	});

	it("falls back to 'stage' for a missing or blank stage label", () => {
		for (const label of [undefined, null, "", "   "]) {
			const { subject } = buildStageCommitMessage({ id: "t1" }, label);
			expect(subject).toContain("after stage 'stage'");
		}
	});

	it("uses the first non-empty goal line and truncates a long goal", () => {
		const { subject } = buildStageCommitMessage(
			{ id: "t1", goal: "\n  \nFirst line\nSecond line" },
			"Plan",
		);
		expect(subject).toContain("— First line");
		expect(subject).not.toContain("Second line");

		const longGoal = `goal:${"x".repeat(200)}`;
		const clipped = buildStageCommitMessage(
			{ id: "t1", goal: longGoal },
			"Plan",
		).subject;
		expect(clipped).toContain("...");
		expect(clipped.length).toBeLessThan(
			"KainBain (task t1): auto-commit work after stage 'Plan' — ".length +
				103 +
				1,
		);
	});

	it("truncates an oversized prompt with a marker instead of dropping it", () => {
		const prompt = `head-${"y".repeat(STAGE_COMMIT_BODY_MAX_CHARS + 100)}-tail`;
		const { subject, body } = buildStageCommitMessage(
			{ id: "t1", prompt },
			"Plan",
		);
		expect(subject).toContain("after stage 'Plan'");
		expect(body).toContain("head-");
		expect(body).toContain("[truncated:");
		expect(body).not.toContain("-tail");
	});

	it("truncates on code-point boundaries (no split surrogate pairs)", () => {
		const prompt = `🎉`.repeat(STAGE_COMMIT_BODY_MAX_CHARS + 5);
		const { body } = buildStageCommitMessage({ id: "t1", prompt }, "Plan");
		const [kept] = body.split("\n\n[truncated:");
		expect([...kept].length).toBe(STAGE_COMMIT_BODY_MAX_CHARS);
		expect(kept).toBe(`🎉`.repeat(STAGE_COMMIT_BODY_MAX_CHARS));
	});
});

describe.skipIf(!gitAvailable)("finalizeTaskBranch against a real repository", () => {
	let base;

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-finalize-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("commits work and returns to default on a pure-local repo without pushing", async () => {
		const repo = path.join(base, "local-only");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("local-1");

		await ensureTaskBranch(store, task, repo);
		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(true);
		expect(summary.hash).toBeTruthy();
		expect(summary.commitError).toBeNull();
		expect(summary.pushed).toBe(false);
		expect(summary.pushSkipped).toBe("no-remote");
		expect(summary.pushError).toBeNull();
		expect(summary.defaultBranch).toBe("main");
		expect(summary.switched).toBe(true);
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		// The commit landed on the task branch.
		expect(run(repo, "log", "--oneline", resolveTaskBranch(task))).toContain(
			"auto-commit work after stage 'Plan'",
		);
		// Auditable trail in history and process logs.
		expect(
			task.history.some((h) => h.action.includes("Auto-committed task work")),
		).toBe(true);
		expect(
			task.history.some((h) => h.action.includes("Returned to default branch")),
		).toBe(true);
		expect(logText(task)).toContain("[GIT]");
	});

	it("round-trips the curated prompt body through git log --format=%B", async () => {
		// Characterization for stage attestation: the commit body read back
		// from git must equal the curated prompt verbatim, so trailers
		// appended after it stay machine-parseable.
		const repo = path.join(base, "body-roundtrip");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("roundtrip-1");
		task.prompt = "# Task\nDo the thing.\n\n# Stage\nDo it now.\n";
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");
		await finalizeTaskBranch(store, task, repo, { stageName: "Plan" });
		const full = run(repo, "log", "--format=%B", "-n", "1", resolveTaskBranch(task));
		expect(full).toContain("# Task\nDo the thing.\n\n# Stage\nDo it now.\n");
	});

	it("pushes the task branch to a file remote and ends on the default branch", async () => {
		const repo = path.join(base, "with-remote");
		initRepo(repo);
		const remoteDir = path.join(base, "with-remote-origin.git");
		run(base, "init", "--bare", "with-remote-origin.git");
		run(repo, "remote", "add", "origin", remoteDir);

		const store = fakeStore();
		const task = fakeTask("remote-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "feature.txt"), "feature\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(true);
		expect(summary.pushed).toBe(true);
		expect(summary.pushSkipped).toBeNull();
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		expect(
			run(remoteDir, "log", "--oneline", `refs/heads/${resolveTaskBranch(task)}`),
		).toContain("auto-commit work");
	});

	it("treats push failure as a warning: the tree still returns to default", async () => {
		const repo = path.join(base, "unreachable-remote");
		initRepo(repo);
		run(repo, "remote", "add", "origin", "/nonexistent/kainbain-remote.git");

		const store = fakeStore();
		const task = fakeTask("unreachable-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		// The stage outcome this summary drives must still pass.
		expect(summary.committed).toBe(true);
		expect(summary.pushed).toBe(false);
		expect(summary.pushError).toBeTruthy();
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
		expect(logText(task)).toContain("stage still passes");
	});

	it("still attempts the return when the commit is blocked, reporting loudly", async () => {
		const repo = path.join(base, "blocked-commit");
		initRepo(repo);
		// A failing pre-commit hook blocks the auto-commit and leaves the tree dirty.
		const hookPath = path.join(repo, ".git", "hooks", "pre-commit");
		fs.writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
		fs.chmodSync(hookPath, 0o755);

		const store = fakeStore();
		const task = fakeTask("blocked-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(false);
		expect(summary.commitError).toBeTruthy();
		// The tree is dirty, so the return is refused loudly instead of
		// stranding the branch silently.
		expect(summary.returnError).toBeTruthy();
		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		expect(logText(task)).toContain("[ERROR]");
	});

	it("is a no-op success when there is nothing to commit", async () => {
		const repo = path.join(base, "clean-tree");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("clean-1");
		await ensureTaskBranch(store, task, repo);

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});

		expect(summary.committed).toBe(false);
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(repo)).toBe("main");
	});

	it("returns null when the task or cwd cannot be resolved", async () => {
		const store = fakeStore();
		expect(await finalizeTaskBranch(store, null, "/repo")).toBeNull();
		const unresolvable = {
			_resolveProjectCwd: () => null,
			_saveTaskMarkdown: () => {},
			eventBridge: null,
		};
		expect(
			await finalizeTaskBranch(unresolvable, fakeTask("x"), undefined),
		).toBeNull();
	});

	it("never throws outside a git repository", async () => {
		const plain = path.join(base, "not-a-repo");
		fs.mkdirSync(plain, { recursive: true });
		const summary = await finalizeTaskBranch(fakeStore(), fakeTask("plain-1"), plain, {
			stageName: "Plan",
		});
		expect(summary?.skipped).toBe("no-git");
		expect(summary?.returnError).toBeNull();
	});

	it("accepts a commit message override", async () => {
		const repo = path.join(base, "custom-message");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("custom-1");
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		await finalizeTaskBranch(store, task, repo, {
			message: "Custom subject line",
		});
		expect(run(repo, "log", "--format=%s", "-1", resolveTaskBranch(task))).toContain(
			"Custom subject line",
		);
	});

	it("commits the whole curated prompt verbatim in the body", async () => {
		const repo = path.join(base, "prompt-body");
		initRepo(repo);
		const store = fakeStore();
		const task = {
			...fakeTask("prompt-1"),
			goal: "Fix the login redirect",
			prompt: [
				"# Task",
				"Fix the login redirect.",
				"",
				"# Stage",
				"Please execute the plan.",
				`Quotes: "double" 'single` + " `backtick`",
				"Unicode: héllo wörld ✓ emoji 🎉",
				"padded line:   ",
				"",
			].join("\n"),
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});
		expect(summary.committed).toBe(true);

		const branch = resolveTaskBranch(task);
		const expectedSubject =
			"KainBain (task prompt-1): auto-commit work after stage 'Plan' — Fix the login redirect";
		expect(run(repo, "log", "--format=%s", "-1", branch)).toContain(
			expectedSubject,
		);
		expect(run(repo, "log", "--oneline", branch)).toContain(expectedSubject);
		const full = run(repo, "log", "--format=%B", "-1", branch);
		// The full prompt survives round-trip, including `#` headings,
		// quotes, unicode, and even trailing whitespace (verbatim cleanup).
		expect(full).toContain(task.prompt);
		expect(full).toContain("# Task");
		expect(full).toContain("padded line:   ");
	});

	it("lets an explicit message override win over the curated prompt", async () => {
		const repo = path.join(base, "override-wins");
		initRepo(repo);
		const store = fakeStore();
		const task = {
			...fakeTask("override-1"),
			goal: "Some goal",
			prompt: "# Task\nSome curated prompt body.\n",
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		await finalizeTaskBranch(store, task, repo, {
			message: "Custom subject line",
		});
		const branch = resolveTaskBranch(task);
		expect(run(repo, "log", "--format=%s", "-1", branch)).toContain(
			"Custom subject line",
		);
		expect(run(repo, "log", "--format=%B", "-1", branch)).not.toContain(
			"Some curated prompt body.",
		);
	});

	it("truncates an oversized prompt with a marker and still commits", async () => {
		const repo = path.join(base, "prompt-truncated");
		initRepo(repo);
		const store = fakeStore();
		const tail = "tail-unique-xyz-123";
		const task = {
			...fakeTask("trunc-1"),
			prompt: `head-${"y".repeat(STAGE_COMMIT_BODY_MAX_CHARS + 100)}${tail}`,
		};
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});
		expect(summary.committed).toBe(true);
		expect(summary.commitError).toBeNull();
		const full = run(
			repo,
			"log",
			"--format=%B",
			"-1",
			resolveTaskBranch(task),
		);
		expect(full).toContain("head-");
		expect(full).toContain("[truncated:");
		expect(full).not.toContain(tail);
	});

	it("keeps pickup order default-first (existing branch via the default branch)", async () => {
		const repo = path.join(base, "pickup-order");
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask("pickup-1");
		await ensureTaskBranch(store, task, repo);
		// Strand the tree on an unrelated branch, then pick the task back up.
		await ensureBranchCheckedOut(repo, "kb/other-task", { baseBranch: "main" });
		expect(await currentBranch(repo)).toBe("kb/other-task");

		task.history = [];
		await ensureTaskBranch(store, task, repo);

		expect(await currentBranch(repo)).toBe(resolveTaskBranch(task));
		const actions = task.history.map((h) => h.action);
		const viaDefault = actions.findIndex((a) =>
			a.includes("Returned to default branch 'main'"),
		);
		const pickedUp = actions.findIndex((a) =>
			a.includes(`Checked out task branch '${resolveTaskBranch(task)}'`),
		);
		expect(viaDefault).toBeGreaterThanOrEqual(0);
		expect(pickedUp).toBeGreaterThan(viaDefault);
	});
});

describe.skipIf(!gitAvailable)("finalizeTaskBranch stage attestation", () => {
	let base;

	const attestedStage = () => ({
		id: "stage-plan",
		name: "Plan",
		type: "agent",
		prompt: "Create a detailed plan.",
		failback: "previous",
	});

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-attest-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("links the wrap-up commit, the history entry, and the stage config", async () => {
		const repo = path.join(base, "linked");
		initRepo(repo);
		const store = fakeStore();
		const task = {
			...fakeTask("attest-1"),
			goal: "Prove the stage ran",
			prompt: "# Task\nDo the thing.\n",
		};
		const stage = attestedStage();
		const configHash = hashStageConfig({ task, stage });
		expect(configHash).toMatch(/^sha256:[0-9a-f]{64}$/);
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
			stage,
		});
		expect(summary.committed).toBe(true);

		// The commit carries machine-parseable trailers; the subject is untouched.
		const branch = resolveTaskBranch(task);
		const full = run(repo, "log", "--format=%B", "-n", "1", branch);
		const subject = run(repo, "log", "--format=%s", "-n", "1", branch).trim();
		expect(subject).toContain("auto-commit work after stage 'Plan'");
		expect(subject).not.toContain("KainBain-");
		const trailers = parseAttestationTrailers(full);
		expect(trailers).toEqual({ taskId: "attest-1", stageId: "stage-plan", configHash });

		// The history entry carries the same config hash plus the commit SHA.
		const tip = run(repo, "rev-parse", branch).trim();
		expect(tip).toMatch(/^[0-9a-f]{40}$/);
		const entry = task.history.find((h) => h.action.includes("Auto-committed task work"));
		expect(entry).toBeTruthy();
		expect(entry.configHash).toBe(configHash);
		expect(entry.commitSha).toBe(tip);
		expect(parseAttestationToken(entry.action)).toEqual({
			taskId: "attest-1",
			stageId: "stage-plan",
			configHash,
			commitSha: tip,
		});

		// The compliance loop closes: history ↔ commit ↔ config agree.
		expect(
			verifyAttestationLink({ historyAction: entry.action, commitBody: full, commitSha: tip }),
		).toMatchObject({ linked: true, problems: [] });
	});

	it("attests prompt-less stages with a trailer-only body", async () => {
		const repo = path.join(base, "no-prompt");
		initRepo(repo);
		const store = fakeStore();
		const task = { ...fakeTask("attest-2"), goal: "No prompt stored" };
		const stage = attestedStage();
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
			stage,
		});
		expect(summary.committed).toBe(true);
		const full = run(repo, "log", "--format=%B", "-n", "1", resolveTaskBranch(task));
		expect(parseAttestationTrailers(full).configHash).toBe(
			hashStageConfig({ task, stage }),
		);
		const entry = task.history.find((h) => h.action.includes("Auto-committed task work"));
		expect(entry?.configHash).toBe(hashStageConfig({ task, stage }));
		expect(entry?.commitSha).toMatch(/^[0-9a-f]{40}$/);
	});

	it("appends trailers after truncation, never truncated away", async () => {
		const repo = path.join(base, "truncated-attested");
		initRepo(repo);
		const store = fakeStore();
		const tail = "tail-unique-xyz-789";
		const task = {
			...fakeTask("attest-3"),
			prompt: `head-${"y".repeat(STAGE_COMMIT_BODY_MAX_CHARS + 100)}${tail}`,
		};
		const stage = attestedStage();
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		await finalizeTaskBranch(store, task, repo, { stageName: "Plan", stage });
		const full = run(repo, "log", "--format=%B", "-n", "1", resolveTaskBranch(task));
		expect(full).toContain("[truncated:");
		expect(full).not.toContain(tail);
		const trailers = parseAttestationTrailers(full);
		expect(trailers.configHash).toBe(hashStageConfig({ task, stage }));
		// Trailers sit after the truncated prompt, not inside it.
		expect(full.lastIndexOf("KainBain-Config-Hash:")).toBeGreaterThan(
			full.indexOf("[truncated:"),
		);
	});

	it("records a clean-tree attestation with an explicit null commit", async () => {
		const repo = path.join(base, "clean-attested");
		initRepo(repo);
		const store = fakeStore();
		const task = { ...fakeTask("attest-4"), goal: "Nothing to commit" };
		const stage = attestedStage();
		await ensureTaskBranch(store, task, repo);

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
			stage,
		});
		expect(summary.committed).toBe(false);
		expect(summary.returnError).toBeNull();
		const entry = task.history.find((h) => typeof h.configHash === "string");
		expect(entry).toBeTruthy();
		expect(entry.configHash).toBe(hashStageConfig({ task, stage }));
		expect("commitSha" in entry).toBe(true);
		expect(entry.commitSha).toBeNull();
		expect(entry.action).toMatch(/clean tree/i);
		expect(parseAttestationToken(entry.action)).toMatchObject({
			configHash: hashStageConfig({ task, stage }),
			commitSha: null,
		});
	});

	it("records the config hash without a SHA when the commit fails", async () => {
		const repo = path.join(base, "failed-attested");
		initRepo(repo);
		const hookPath = path.join(repo, ".git", "hooks", "pre-commit");
		fs.writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
		fs.chmodSync(hookPath, 0o755);
		const store = fakeStore();
		const task = { ...fakeTask("attest-5"), goal: "Commit blocked" };
		const stage = attestedStage();
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
			stage,
		});
		expect(summary.committed).toBe(false);
		expect(summary.commitError).toBeTruthy();
		const entry = task.history.find((h) => h.action.includes("auto-commit after stage 'Plan' failed"));
		expect(entry).toBeTruthy();
		expect(entry.configHash).toBe(hashStageConfig({ task, stage }));
		expect(entry.commitSha).toBeNull();
	});

	it("leaves history unattested when the stage cannot be resolved", async () => {
		const repo = path.join(base, "unresolved");
		initRepo(repo);
		const store = fakeStore();
		const task = { ...fakeTask("attest-6"), goal: "No stage anywhere" };
		await ensureTaskBranch(store, task, repo);
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");

		// No opts.stage and no projectStore on the double: the pre-feature
		// posture — a plain commit and plain history, never a fake hash.
		const summary = await finalizeTaskBranch(store, task, repo, {
			stageName: "Plan",
		});
		expect(summary.committed).toBe(true);
		const full = run(repo, "log", "--format=%B", "-n", "1", resolveTaskBranch(task));
		expect(parseAttestationTrailers(full).configHash).toBeNull();
		expect(task.history.some((h) => typeof h.configHash === "string")).toBe(false);
		expect(task.history.some((h) => h.action.includes("[attestation "))).toBe(false);
	});
});

describe.skipIf(!gitAvailable)("commitFailedStageWork against a real repository", () => {
	function setupRepo(name) {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), `kainbain-failed-${name}-`));
		initRepo(repo);
		return { repo, store: fakeStore(), task: fakeTask(`failed-${name}`) };
	}

	function teardown(repo) {
		try {
			fs.rmSync(repo, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	it("commits dirty partial work with a '... (failed)' message and bounds the range", async () => {
		const { repo, store, task } = setupRepo("commit");
		try {
			await ensureTaskBranch(store, task, repo);
			task.branch = resolveTaskBranch(task);
			const branch = task.branch;
			expect(await currentBranch(repo)).toBe(branch);
			fs.writeFileSync(path.join(repo, "partial.txt"), "partial\n");

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res?.committed).toBe(true);
			expect(res?.hash).toBeTruthy();
			expect(run(repo, "log", "-1", "--format=%s", branch)).toContain(
				"... (failed)",
			);
			// The failed attempt's end boundary is recorded so a retry
			// starts after this commit instead of absorbing it.
			expect(task.currentStageEndSha).toBeTruthy();
			expect(
				task.history.some((h) => h.action.includes("partial work")),
			).toBe(true);
			expect(logText(task)).toContain("[GIT]");
		} finally {
			teardown(repo);
		}
	});

	it("pushes the failed attempt's commit so the retry merges the latest", async () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-failed-pushbase-"));
		const repo = path.join(base, "repo");
		initRepo(repo);
		run(base, "init", "--bare", "origin.git");
		const remoteDir = path.join(base, "origin.git");
		run(repo, "remote", "add", "origin", remoteDir);
		const store = fakeStore();
		const task = fakeTask("failed-push");
		try {
			await ensureTaskBranch(store, task, repo);
			task.branch = resolveTaskBranch(task);
			fs.writeFileSync(path.join(repo, "partial.txt"), "partial\n");

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res?.committed).toBe(true);
			const localHead = run(repo, "rev-parse", task.branch).trim();
			const remoteHead = run(repo, "ls-remote", "origin", task.branch)
				.trim()
				.split(/\s+/)[0];
			expect(remoteHead).toBe(localHead);
			expect(
				task.history.some((h) => h.action.includes(`Pushed '${task.branch}'`)),
			).toBe(true);
		} finally {
			teardown(base);
		}
	});

	it("is a clean-tree no-op that still resolves an end boundary", async () => {
		const { repo, store, task } = setupRepo("clean");
		try {
			await ensureTaskBranch(store, task, repo);
			task.branch = resolveTaskBranch(task);

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res).toMatchObject({ committed: false });
			expect(
				task.history.some((h) => h.action.includes("partial work")),
			).toBe(false);
		} finally {
			teardown(repo);
		}
	});

	it("leaves tasks without a branch alone (single-branch mode)", async () => {
		const { repo, store, task } = setupRepo("nobranch");
		try {
			const before = run(repo, "rev-list", "--count", "HEAD");
			fs.writeFileSync(path.join(repo, "stray.txt"), "stray\n");

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "Dev",
			});

			expect(res).toBeNull();
			expect(run(repo, "rev-list", "--count", "HEAD")).toBe(before);
		} finally {
			teardown(repo);
		}
	});

	it("never throws outside a repository", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-failed-norepo-"));
		try {
			const store = fakeStore();
			const task = { ...fakeTask("failed-norepo"), branch: "kb/failed-norepo" };
			await expect(
				commitFailedStageWork(store, task, dir, { stageName: "Dev" }),
			).resolves.toBeNull();
		} finally {
			teardown(dir);
		}
	});
});

// Step-5 contention harness: a two-branch repo where the task branch is
// checked out (the "stage running") and HEAD is then moved to a sibling
// branch, deterministically reproducing the shared-checkout race of the
// cf4b6847 case study (2026-11-20). Real git, throwaway temp dirs only.
describe.skipIf(!gitAvailable)("commitFailedStageWork under HEAD contention (shared checkout)", () => {
	function setupContentionRepo(name) {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), `kainbain-head-${name}-`));
		initRepo(repo);
		const store = fakeStore();
		const task = fakeTask(`failed-${name}`);
		const siblingBranch = `kb/sibling-${name}`;
		return { repo, store, task, siblingBranch };
	}

	// Creates the task branch and the sibling branch, then leaves the tree
	// checked out on the task branch (the stage's own checkout).
	async function prepareHeadContention({ repo, store, task, siblingBranch }) {
		await ensureTaskBranch(store, task, repo);
		task.branch = resolveTaskBranch(task);
		await ensureBranchCheckedOut(repo, siblingBranch, { baseBranch: "main" });
		await ensureBranchCheckedOut(repo, task.branch, { baseBranch: "main" });
		return task.branch;
	}

	// Simulates the concurrent task moving HEAD mid-stage.
	const moveHeadToSibling = (repo, siblingBranch) => run(repo, "checkout", siblingBranch);

	// Writes a failed-stage report under the task's own docs folder — the
	// dirt the recovery is allowed to carry across the re-checkout.
	function writeFailedStageReport(repo, task, name = "stage-failure-20261124.md") {
		const dir = path.join(repo, "docs", "tasks", task.id);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, name), `# Failed stage report\n\n${task.id}\n`);
		return `docs/tasks/${task.id}/${name}`;
	}

	function teardown(repo) {
		try {
			run(repo, "worktree", "prune");
		} catch {
			// ignore — plain repos have no worktrees
		}
		try {
			fs.rmSync(repo, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}

	it("T1: re-establishes the owning branch and commits the failed-stage report when only own report dirt exists", async () => {
		const ctx = setupContentionRepo("t1");
		const { repo, store, task, siblingBranch } = ctx;
		try {
			const branch = await prepareHeadContention(ctx);
			const reportPath = writeFailedStageReport(repo, task);
			moveHeadToSibling(repo, siblingBranch);
			expect(await currentBranch(repo)).toBe(siblingBranch);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();

			const res = await commitFailedStageWork(store, task, repo, {
				stageName: "automated test 2",
			});

			// Acceptance 1 (happy path): the report landed on the OWNING branch.
			expect(res?.committed).toBe(true);
			expect(res?.hash).toBeTruthy();
			expect(await currentBranch(repo)).toBe(branch);
			expect(run(repo, "log", "-1", "--format=%s", branch)).toContain("... (failed)");
			expect(run(repo, "ls-tree", "-r", "--name-only", branch)).toContain(reportPath);
			// Acceptance 2: the sibling branch tip never moved and carries no report.
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
			expect(run(repo, "ls-tree", "-r", "--name-only", siblingBranch)).not.toContain(reportPath);
			// History: success entry plus the short recovery note (survey q8).
			const actions = task.history.map((h) => h.action);
			expect(
				actions.some((a) => a.includes("Auto-committed partial work") && a.includes(branch)),
			).toBe(true);
			expect(
				actions.some(
					(a) =>
						a.includes("HEAD had moved to") &&
						a.includes(siblingBranch) &&
						a.includes("re-established") &&
						a.includes(branch),
				),
			).toBe(true);
			expect(actions.some((a) => a.startsWith("Error:"))).toBe(false);
			expect(logText(task)).toContain("HEAD had moved to");
		} finally {
			teardown(repo);
		}
	});

	it("T2: fails closed with an actionable error entry when the tree holds foreign dirt", async () => {
		const ctx = setupContentionRepo("t2");
		const { repo, store, task, siblingBranch } = ctx;
		try {
			const branch = await prepareHeadContention(ctx);
			const reportPath = writeFailedStageReport(repo, task);
			// A sibling task's uncommitted work in the shared tree.
			fs.writeFileSync(path.join(repo, "sibling-work.txt"), "sibling in-flight\n");
			moveHeadToSibling(repo, siblingBranch);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();
			const ownTipBefore = run(repo, "rev-parse", branch).trim();
			const mainTipBefore = run(repo, "rev-parse", "main").trim();

			const res = await commitFailedStageWork(store, task, repo, { stageName: "Dev" });

			expect(res).toBeNull();
			// No checkout happened: HEAD is still on the sibling branch.
			expect(await currentBranch(repo)).toBe(siblingBranch);
			const errEntry = task.history.find((h) =>
				h.action.startsWith("Error: failed-stage report"),
			);
			expect(errEntry).toBeTruthy();
			// Names both branches, the foreign path, the uncommitted report
			// path, the remediation, and the explicit nothing-was-committed.
			expect(errEntry.action).toContain(branch);
			expect(errEntry.action).toContain(siblingBranch);
			expect(errEntry.action).toContain("sibling-work.txt");
			expect(errEntry.action).toContain(reportPath);
			expect(errEntry.action).toContain("git status");
			expect(errEntry.action).toContain("No commit was made on any branch");
			expect(logText(task)).toContain("[ERROR]");
			// The old warn-only skip must be gone on the failed-stage path.
			expect(task.history.some((h) => h.action.includes("skipped"))).toBe(false);
			// Acceptance 2: no commit landed anywhere.
			expect(run(repo, "rev-parse", branch).trim()).toBe(ownTipBefore);
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
			expect(run(repo, "rev-parse", "main").trim()).toBe(mainTipBefore);
		} finally {
			teardown(repo);
		}
	});

	it("T2b: a sibling task's own report dirt under docs/tasks/<sibling>/ also fails closed", async () => {
		const ctx = setupContentionRepo("t2b");
		const { repo, store, task, siblingBranch } = ctx;
		try {
			const branch = await prepareHeadContention(ctx);
			const reportPath = writeFailedStageReport(repo, task);
			// The sibling's in-flight report lives under ITS OWN docs folder —
			// engine-owned for the sibling, foreign for this task.
			const siblingTaskId = siblingBranch.replace(/^kb\//, "");
			const siblingReportDir = path.join(repo, "docs", "tasks", siblingTaskId);
			fs.mkdirSync(siblingReportDir, { recursive: true });
			fs.writeFileSync(
				path.join(siblingReportDir, "report-failure.md"),
				"# sibling in-flight report\n",
			);
			const siblingReportPath = `docs/tasks/${siblingTaskId}/report-failure.md`;
			moveHeadToSibling(repo, siblingBranch);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();
			const ownTipBefore = run(repo, "rev-parse", branch).trim();

			const res = await commitFailedStageWork(store, task, repo, { stageName: "Dev" });

			expect(res).toBeNull();
			expect(await currentBranch(repo)).toBe(siblingBranch);
			const errEntry = task.history.find((h) =>
				h.action.startsWith("Error: failed-stage report"),
			);
			expect(errEntry).toBeTruthy();
			expect(errEntry.action).toContain(siblingReportPath);
			expect(errEntry.action).toContain(reportPath);
			expect(errEntry.action).toContain("No commit was made on any branch");
			// Acceptance 2: no commit landed on any branch.
			expect(run(repo, "rev-parse", branch).trim()).toBe(ownTipBefore);
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
		} finally {
			teardown(repo);
		}
	});

	it("T3: fails closed when the owning branch was deleted mid-flight", async () => {
		const ctx = setupContentionRepo("t3");
		const { repo, store, task, siblingBranch } = ctx;
		try {
			const branch = await prepareHeadContention(ctx);
			moveHeadToSibling(repo, siblingBranch);
			// The owning branch disappears while HEAD is on the sibling.
			run(repo, "branch", "-D", branch);
			writeFailedStageReport(repo, task);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();
			const mainTipBefore = run(repo, "rev-parse", "main").trim();

			const res = await commitFailedStageWork(store, task, repo, { stageName: "Dev" });

			expect(res).toBeNull();
			expect(await currentBranch(repo)).toBe(siblingBranch);
			const errEntry = task.history.find((h) =>
				h.action.startsWith("Error: failed-stage report"),
			);
			expect(errEntry).toBeTruthy();
			expect(errEntry.action).toContain("no longer exists");
			expect(errEntry.action).toContain(branch);
			expect(errEntry.action).toContain("No commit was made on any branch");
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
			expect(run(repo, "rev-parse", "main").trim()).toBe(mainTipBefore);
		} finally {
			teardown(repo);
		}
	});

	it("T6: worktree isolation mode is unaffected — the commit lands in the task worktree", async () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-head-wt-"));
		initRepo(repo);
		const store = {
			...fakeStore(),
			projectStore: {
				getProject: () => ({ id: "proj-1", workspaceIsolation: "worktree" }),
			},
		};
		const task = fakeTask("failed-wt");
		try {
			const branch = resolveTaskBranch(task);
			task.branch = branch;
			run(repo, "branch", branch);
			const wtDir = path.join(repo, ".kainbain", "worktrees", task.id);
			run(repo, "worktree", "add", wtDir, branch);
			// A concurrent task moves HEAD on the PRIMARY checkout only.
			const siblingBranch = "kb/sibling-wt";
			run(repo, "branch", siblingBranch);
			run(repo, "checkout", siblingBranch);
			expect(await currentBranch(repo)).toBe(siblingBranch);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();
			// The failed stage's report dirt lives inside the worktree.
			const reportDir = path.join(wtDir, "docs", "tasks", task.id);
			fs.mkdirSync(reportDir, { recursive: true });
			fs.writeFileSync(path.join(reportDir, "report-failure.md"), "# report\n");

			const res = await commitFailedStageWork(store, task, repo, { stageName: "Dev" });

			expect(res?.committed).toBe(true);
			// Committed on the owning branch, from inside the worktree.
			expect(run(wtDir, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe(branch);
			expect(run(repo, "log", "-1", "--format=%s", branch)).toContain("... (failed)");
			expect(run(repo, "ls-tree", "-r", "--name-only", branch)).toContain(
				`docs/tasks/${task.id}/report-failure.md`,
			);
			// The primary checkout was never touched by the recovery.
			expect(await currentBranch(repo)).toBe(siblingBranch);
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
			// No mismatch happened, so no recovery note was recorded.
			expect(task.history.some((h) => h.action.includes("HEAD had moved"))).toBe(false);
			expect(task.history.some((h) => h.action.startsWith("Error:"))).toBe(false);
		} finally {
			teardown(repo);
		}
	});

	it("T7: the success-path auto-commit stays a warn-only skip under HEAD contention (scope guard)", async () => {
		const ctx = setupContentionRepo("t7");
		const { repo, store, task, siblingBranch } = ctx;
		try {
			const branch = await prepareHeadContention(ctx);
			fs.writeFileSync(path.join(repo, "work.txt"), "work\n");
			moveHeadToSibling(repo, siblingBranch);
			const siblingTipBefore = run(repo, "rev-parse", siblingBranch).trim();
			const ownTipBefore = run(repo, "rev-parse", branch).trim();

			const summary = await finalizeTaskBranch(store, task, repo, { stageName: "Plan" });

			// The success path did NOT gain a recovery: warn-only skip, as before.
			expect(summary.committed).toBe(false);
			expect(summary.commitError).toContain("Refusing to commit on the wrong branch");
			const actions = task.history.map((h) => h.action);
			expect(
				actions.some((a) => a.includes("Warning: auto-commit after stage 'Plan' failed")),
			).toBe(true);
			expect(actions.some((a) => a.startsWith("Error: failed-stage report"))).toBe(false);
			expect(actions.some((a) => a.includes("HEAD had moved"))).toBe(false);
			// No commit landed on any branch.
			expect(run(repo, "rev-parse", branch).trim()).toBe(ownTipBefore);
			expect(run(repo, "rev-parse", siblingBranch).trim()).toBe(siblingTipBefore);
		} finally {
			teardown(repo);
		}
	});
});
