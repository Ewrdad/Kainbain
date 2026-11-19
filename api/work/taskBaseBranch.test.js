import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ensureBaseBranchExists,
	ensureTaskBaseBranch,
	normalizeBaseBranchName,
	resolveTaskBaseBranch,
} from "./taskBaseBranch.js";

function localRepo({ remote = false } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-basebranch-"));
	execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "-qm", "init"], { cwd: dir, stdio: "ignore" });
	let remoteDir = null;
	if (remote) {
		remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-basebranch-remote-"));
		execFileSync("git", ["init", "-q", "--bare"], { cwd: remoteDir, stdio: "ignore" });
		execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd: dir, stdio: "ignore" });
	}
	return { dir, remoteDir };
}

describe("normalizeBaseBranchName", () => {
	it("trims surrounding whitespace", () => {
		expect(normalizeBaseBranchName("  feature/x  ")).toBe("feature/x");
	});

	it("returns null for blank and non-string values", () => {
		expect(normalizeBaseBranchName("")).toBeNull();
		expect(normalizeBaseBranchName("   ")).toBeNull();
		expect(normalizeBaseBranchName(null)).toBeNull();
		expect(normalizeBaseBranchName(undefined)).toBeNull();
		expect(normalizeBaseBranchName(42)).toBeNull();
	});
});

describe("resolveTaskBaseBranch", () => {
	it("prefers the task's pinned base branch", async () => {
		const out = await resolveTaskBaseBranch({
			task: { baseBranch: "feature/pinned", workflowId: "wf-1" },
			workflow: { baseBranch: "feature/live" },
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "feature/pinned", source: "task" });
	});

	it("falls back to the workflow's live base branch", async () => {
		const out = await resolveTaskBaseBranch({
			task: { workflowId: "wf-1" },
			workflow: { baseBranch: "feature/live" },
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "feature/live", source: "workflow" });
	});

	it("looks the workflow up from the project store when not passed directly", async () => {
		const projectStore = {
			getWorkflow: (projectId, workflowId) => {
				expect(projectId).toBe("proj-1");
				expect(workflowId).toBe("wf-1");
				return { id: "wf-1", baseBranch: "feature/stored" };
			},
		};
		const out = await resolveTaskBaseBranch({
			task: { workflowId: "wf-1" },
			projectStore,
			projectId: "proj-1",
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "feature/stored", source: "workflow" });
	});

	it("falls back to the repo default when nothing is configured", async () => {
		const out = await resolveTaskBaseBranch({
			task: { workflowId: "wf-1" },
			workflow: {},
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "main", source: "repo" });
	});

	it("resolves the repo default from the checkout when no override is given", async () => {
		const { dir } = localRepo();
		try {
			const out = await resolveTaskBaseBranch({
				task: { workflowId: "wf-1" },
				workflow: {},
				cwd: dir,
			});
			expect(out).toEqual({ branch: "main", source: "repo" });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("ignores invalid pinned and live names and falls through the chain", async () => {
		const out = await resolveTaskBaseBranch({
			task: { baseBranch: "--evil" },
			workflow: { baseBranch: "has space" },
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "main", source: "repo" });
	});

	it("returns a null branch when even the repo default is unavailable", async () => {
		const out = await resolveTaskBaseBranch({ task: {} });
		expect(out).toEqual({ branch: null, source: "repo" });
	});

	it("tolerates missing task and store doubles", async () => {
		const out = await resolveTaskBaseBranch({});
		expect(out).toEqual({ branch: null, source: "repo" });
	});

	it("tolerates a throwing store lookup and falls through to the repo default", async () => {
		const projectStore = {
			getWorkflow: () => {
				throw new Error("store exploded");
			},
		};
		const out = await resolveTaskBaseBranch({
			task: { workflowId: "wf-1" },
			projectStore,
			projectId: "proj-1",
			repoDefault: "main",
		});
		expect(out).toEqual({ branch: "main", source: "repo" });
	});

	// Note: when git itself is unavailable, `defaultBranch` fails safe to the
	// repo's own documented fallback ('main') rather than throwing — that
	// policy lives in api/git/branch.js and is intentionally unchanged here.
});

describe("ensureBaseBranchExists", () => {
	let dirs = [];
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
		dirs = [];
	});

	it("creates a missing base branch from the repo default tip", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		const mainTip = execFileSync("git", ["rev-parse", "main"], { cwd: dir })
			.toString()
			.trim();
		const out = await ensureBaseBranchExists(dir, "feature/auto");
		expect(out.created).toBe(true);
		expect(out.branch).toBe("feature/auto");
		const baseTip = execFileSync("git", ["rev-parse", "feature/auto"], { cwd: dir })
			.toString()
			.trim();
		expect(baseTip).toBe(mainTip);
	});

	it("is a no-op when the base branch already exists", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		execFileSync("git", ["branch", "feature/there"], { cwd: dir, stdio: "ignore" });
		const out = await ensureBaseBranchExists(dir, "feature/there");
		expect(out).toEqual(
			expect.objectContaining({ branch: "feature/there", created: false }),
		);
	});

	it("is a no-op when the base is the repo default itself", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		const out = await ensureBaseBranchExists(dir, "main");
		expect(out.created).toBe(false);
	});

	it("pushes a newly created base so remote runners see origin/<base>", async () => {
		const { dir, remoteDir } = localRepo({ remote: true });
		dirs.push(dir, remoteDir);
		const out = await ensureBaseBranchExists(dir, "feature/pushed");
		expect(out.created).toBe(true);
		expect(out.pushed).toBe(true);
		const remoteTip = execFileSync("git", ["rev-parse", "--verify", "refs/heads/feature/pushed"], {
			cwd: remoteDir,
		})
			.toString()
			.trim();
		expect(remoteTip).toMatch(/^[0-9a-f]{40}$/);
	});

	it("never throws: invalid names and non-repos resolve to skipped results", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		await expect(ensureBaseBranchExists(dir, "--evil")).resolves.toMatchObject({
			created: false,
		});
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), "kb-basebranch-plain-"));
		dirs.push(plain);
		await expect(ensureBaseBranchExists(plain, "feature/x")).resolves.toMatchObject({
			created: false,
			skipped: "no-git",
		});
	});

	it("never throws: an unborn repo resolves to a skipped result", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-basebranch-unborn-"));
		dirs.push(dir);
		execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
		const out = await ensureBaseBranchExists(dir, "feature/x");
		expect(out.created).toBe(false);
		expect(out.branch).toBe("feature/x");
	});

	it("reports the start point a created base was taken from", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		const out = await ensureBaseBranchExists(dir, "feature/from");
		expect(out.created).toBe(true);
		expect(out.from).toBe("main");
	});

	it("adopts origin/<base> when the remote already has the base", async () => {
		const { dir, remoteDir } = localRepo({ remote: true });
		dirs.push(dir, remoteDir);
		// A teammate's pushed feature branch with commits past main.
		execFileSync("git", ["checkout", "-qb", "feature/teammate"], { cwd: dir, stdio: "ignore" });
		fs.writeFileSync(path.join(dir, "team.txt"), "team");
		execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["commit", "-qm", "team work"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["push", "-q", "-u", "origin", "feature/teammate"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, stdio: "ignore" });
		execFileSync("git", ["branch", "-D", "feature/teammate"], { cwd: dir, stdio: "ignore" });
		const remoteTip = execFileSync("git", ["rev-parse", "refs/heads/feature/teammate"], { cwd: remoteDir })
			.toString()
			.trim();

		const out = await ensureBaseBranchExists(dir, "feature/teammate");
		expect(out.created).toBe(true);
		expect(out.from).toBe("origin/feature/teammate");
		expect(out.pushed).toBe(false);
		const localTip = execFileSync("git", ["rev-parse", "feature/teammate"], { cwd: dir })
			.toString()
			.trim();
		expect(localTip).toBe(remoteTip);
	});
});

describe("ensureTaskBaseBranch", () => {
	let dirs = [];
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
		dirs = [];
	});

	it("resolves the repo default without creating anything", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		let createdCalled = false;
		const out = await ensureTaskBaseBranch(
			{ projectStore: { getWorkflow: () => null } },
			{ projectId: "p", workflowId: "wf-1" },
			dir,
			{ onCreated: () => { createdCalled = true; } },
		);
		expect(out).toEqual({ branch: "main", source: "repo", created: false, from: null });
		expect(createdCalled).toBe(false);
	});

	it("auto-creates a missing pinned base and reports it", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		const notes = [];
		const out = await ensureTaskBaseBranch(
			{ projectStore: { getWorkflow: () => null } },
			{ projectId: "p", workflowId: "wf-1", baseBranch: "feature/made" },
			dir,
			{ onCreated: (detail) => notes.push(detail) },
		);
		expect(out.branch).toBe("feature/made");
		expect(out.source).toBe("task");
		expect(out.created).toBe(true);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toContain("feature/made");
		const tip = execFileSync("git", ["rev-parse", "feature/made"], { cwd: dir })
			.toString()
			.trim();
		expect(tip).toMatch(/^[0-9a-f]{40}$/);
	});

	it("auto-creates a missing live workflow base (no task snapshot)", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		const notes = [];
		const out = await ensureTaskBaseBranch(
			{
				projectStore: {
					getWorkflow: () => ({ id: "wf-1", baseBranch: "feature/live-made" }),
				},
			},
			{ projectId: "p", workflowId: "wf-1" },
			dir,
			{ onCreated: (detail) => notes.push(detail) },
		);
		expect(out).toEqual({
			branch: "feature/live-made",
			source: "workflow",
			created: true,
			from: "main",
		});
		expect(notes).toHaveLength(1);
		const tip = execFileSync("git", ["rev-parse", "feature/live-made"], { cwd: dir })
			.toString()
			.trim();
		expect(tip).toMatch(/^[0-9a-f]{40}$/);
	});

	it("keeps the resolved branch when the ensure itself cannot create (never throws)", async () => {
		const { dir } = localRepo();
		dirs.push(dir);
		// Point the pipeline at the repo default's own name via the live
		// workflow: ensure skips creation, the branch still resolves.
		const out = await ensureTaskBaseBranch(
			{
				projectStore: {
					getWorkflow: () => ({ id: "wf-1", baseBranch: "main" }),
				},
			},
			{ projectId: "p", workflowId: "wf-1" },
			dir,
		);
		expect(out).toEqual({
			branch: "main",
			source: "workflow",
			created: false,
			from: null,
		});
	});
});
