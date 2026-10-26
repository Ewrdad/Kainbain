/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { TaskStore } from "../taskStore.js";
import { registerTaskFlowRoutes } from "./taskFlowRoutes.js";
import {
	installGitArgvAudit,
	auditGitArgv,
	realGit,
} from "./humanGitSafety.audit.js";

/***
 * MARK: Human review git-safety contract tests
 * @description Proves the human-review git contract against real repositories
 *   in throwaway temp directories: human stage entry, human approval
 *   (advance route), and human rejection must not change `git status`, the
 *   checked-out branch, working-tree file contents, or any commit — while
 *   still creating the task-branch ref when it is missing. Every cell also
 *   audits the spawned git argv: only reads plus `git branch <name>
 *   [<start-point>]` may appear.
 ***/

const STAGES = [
	{ id: "build", name: "Build", type: "agent" },
	{ id: "review", name: "Review", type: "human" },
	{ id: "integrate", name: "Integrate", type: "merge" },
];

const tempDirs = [];
let audit;

beforeAll(() => {
	audit = installGitArgvAudit();
});

afterAll(async () => {
	try {
		await audit.settle();
	} catch {
		// teardown best-effort
	}
	audit.uninstall();
});

afterEach(async () => {
	await audit.settle();
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function track(dir) {
	tempDirs.push(dir);
	return dir;
}

function initRepo({ born = true, branch = "master", withOrigin = false } = {}) {
	const root = track(fs.mkdtempSync(path.join(os.tmpdir(), "kb-human-git-")));
	let originDir = null;
	if (withOrigin) {
		originDir = path.join(root, "origin.git");
		fs.mkdirSync(originDir, { recursive: true });
		realGit(originDir, "init", "--bare", "-q");
	}
	const dir = path.join(root, "repo");
	fs.mkdirSync(dir, { recursive: true });
	realGit(dir, "init", "-b", branch, "-q");
	realGit(dir, "config", "user.email", "kainbain-test@example.com");
	realGit(dir, "config", "user.name", "KainBain Test");
	if (withOrigin) {
		realGit(dir, "remote", "add", "origin", originDir);
	}
	if (born) {
		fs.writeFileSync(path.join(dir, "README.md"), "# base\n");
		fs.writeFileSync(path.join(dir, "data.txt"), "v1\n");
		realGit(dir, "add", "-A");
		realGit(dir, "commit", "-qm", "init");
		if (withOrigin) {
			realGit(dir, "push", "-q", "-u", "origin", branch);
		}
	}
	return { root, dir, originDir };
}

function sha(file) {
	try {
		return crypto
			.createHash("sha256")
			.update(fs.readFileSync(file))
			.digest("hex");
	} catch {
		return "<missing>";
	}
}

function snapshot(dir, { originDir = null } = {}) {
	let logAll;
	try {
		logAll = realGit(dir, "log", "--all", "--oneline");
	} catch {
		logAll = "<no-commits>";
	}
	const snap = {
		symref: realGit(dir, "symbolic-ref", "HEAD").trim(),
		status: realGit(dir, "status", "--porcelain"),
		refs: realGit(dir, "for-each-ref", "--format=%(refname) %(objectname)"),
		logAll,
		readme: sha(path.join(dir, "README.md")),
		data: sha(path.join(dir, "data.txt")),
		live: sha(path.join(dir, "live-work.txt")),
	};
	if (originDir) {
		snap.originRefs = realGit(
			dir,
			"--git-dir",
			originDir,
			"for-each-ref",
			"--format=%(refname) %(objectname)",
		);
	}
	return snap;
}

function makeStore(dir) {
	const project = {
		id: "p1",
		name: "P1",
		cwd: dir,
		stages: STAGES,
		useBranches: false,
	};
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, project };
}

function taskBranchOf(task) {
	return task.branch || `kb/${task.id}`;
}

function refExists(dir, ref) {
	try {
		realGit(dir, "rev-parse", "--verify", `refs/heads/${ref}`);
		return true;
	} catch {
		return false;
	}
}

async function runAudited(op) {
	audit.clear();
	const result = await op();
	await audit.settle();
	const lines = audit.argvLines();
	return { result, lines, ...auditGitArgv(lines) };
}

async function approveViaRoute(store, projectStore, taskId) {
	const routes = new Map();
	await registerTaskFlowRoutes(
		{ post: (routePath, handler) => routes.set(routePath, handler), get: (routePath, handler) => routes.set(routePath, handler) },
		{
			resolveAndGuardProject: () => "p1",
			projectStore,
			taskStore: store,
			promptEngine: { curatePrompt: () => "curated" },
		},
	);
	const handler = routes.get("/tasks/:id/advance");
	const reply = { status: () => ({ send: (value) => value }) };
	return handler(
		{ body: { projectId: "p1" }, params: { id: taskId } },
		reply,
	);
}

function expectGitStateUnchanged(before, after, { allowRefCreated = null } = {}) {
	expect(after.symref, "checked-out branch (HEAD symref)").toBe(before.symref);
	expect(after.status, "git status --porcelain").toBe(before.status);
	// --all traversal order shifts when a new ref appears: compare the
	// reachable commit SET (no commits added or removed).
	expect(
		after.logAll.split("\n").filter(Boolean).sort(),
		"reachable commits (git log --all)",
	).toEqual(before.logAll.split("\n").filter(Boolean).sort());
	expect(after.readme, "README.md bytes").toBe(before.readme);
	expect(after.data, "data.txt bytes").toBe(before.data);
	expect(after.live, "live-work.txt bytes").toBe(before.live);
	if (allowRefCreated) {
		// for-each-ref sorts by refname: compare as sets, order-insensitive.
		const beforeLines = before.refs.split("\n").filter(Boolean).sort();
		const afterLines = after.refs.split("\n").filter(Boolean).sort();
		expect(afterLines, "refs gain exactly the created task-branch ref").toEqual(
			[...beforeLines, `refs/heads/${allowRefCreated} ${after._createdSha}`].sort(),
		);
	} else {
		expect(after.refs, "local refs").toBe(before.refs);
	}
	if (before.originRefs !== undefined) {
		expect(after.originRefs, "origin refs (no push)").toBe(before.originRefs);
	}
}

function refTarget(dir, ref) {
	return realGit(dir, "rev-parse", ref).trim();
}

describe("human entry leaves git state untouched", () => {
	it("dirty tree on the default branch: no switch, no commit, ref created", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "entry probe",
			stageId: "review",
			projectCwd: dir,
		});
		project.useBranches = true;
		const branch = taskBranchOf(task);
		fs.writeFileSync(path.join(dir, "live-work.txt"), "operator live work\n");
		fs.appendFileSync(path.join(dir, "README.md"), "operator edit\n");

		const before = snapshot(dir);
		const masterTip = refTarget(dir, "master");
		expect(refExists(dir, branch)).toBe(false);

		const { result, violations, refCreates } = await runAudited(() =>
			store.executeStage("p1", task.id, {
				stages: STAGES,
				projectCwd: dir,
				agentRunner: async () => "unused",
			}),
		);

		expect(result.status).toBe("waiting_human");
		expect(store.getTask("p1", task.id).status).toBe("waiting_human");
		expect(violations, "mutating git argv on human entry").toEqual([]);
		expect(refCreates.length).toBeGreaterThanOrEqual(1);
		expect(refExists(dir, branch)).toBe(true);
		expect(refTarget(dir, branch)).toBe(masterTip);

		const after = snapshot(dir);
		after._createdSha = refTarget(dir, branch);
		expectGitStateUnchanged(before, after, { allowRefCreated: branch });
	});

	it("dirty tree with the task branch already existing: refs byte-identical", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "entry probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		realGit(dir, "branch", branch, "master");
		project.useBranches = true;
		fs.writeFileSync(path.join(dir, "live-work.txt"), "operator live work\n");

		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			store.executeStage("p1", task.id, {
				stages: STAGES,
				projectCwd: dir,
				agentRunner: async () => "unused",
			}),
		);

		expect(result.status).toBe("waiting_human");
		expect(violations, "mutating git argv on human entry").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});

	it("dirty tree while sitting on another task branch: stays put", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "entry probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		realGit(dir, "branch", "kb/other", "master");
		realGit(dir, "checkout", "-q", "kb/other");
		fs.writeFileSync(path.join(dir, "other.txt"), "other work\n");
		// Stage only the operator file: the engine's docs/ must stay untracked
		// so task-markdown writes cannot move `git status` under the test.
		realGit(dir, "add", "other.txt");
		realGit(dir, "commit", "-qm", "other work");
		project.useBranches = true;
		fs.appendFileSync(path.join(dir, "data.txt"), "operator edit on other\n");

		const before = snapshot(dir);
		expect(before.symref).toBe("refs/heads/kb/other");
		const { result, violations } = await runAudited(() =>
			store.executeStage("p1", task.id, {
				stages: STAGES,
				projectCwd: dir,
				agentRunner: async () => "unused",
			}),
		);

		expect(result.status).toBe("waiting_human");
		expect(violations, "mutating git argv on human entry").toEqual([]);
		expect(refExists(dir, branch)).toBe(true);
		const after = snapshot(dir);
		after._createdSha = refTarget(dir, branch);
		expectGitStateUnchanged(before, after, { allowRefCreated: branch });
	});

	it("clean tree: parks without touching anything but the missing ref", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "entry probe",
			stageId: "review",
			projectCwd: dir,
		});
		project.useBranches = true;
		const branch = taskBranchOf(task);

		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			store.executeStage("p1", task.id, {
				stages: STAGES,
				projectCwd: dir,
				agentRunner: async () => "unused",
			}),
		);

		expect(result.status).toBe("waiting_human");
		expect(violations, "mutating git argv on human entry").toEqual([]);
		const after = snapshot(dir);
		after._createdSha = refTarget(dir, branch);
		expectGitStateUnchanged(before, after, { allowRefCreated: branch });
	});

	it("unborn repo: parks in waiting_human without throwing", async () => {
		const { dir } = initRepo({ born: false });
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "entry probe",
			stageId: "review",
			projectCwd: dir,
		});
		project.useBranches = true;

		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			store.executeStage("p1", task.id, {
				stages: STAGES,
				projectCwd: dir,
				agentRunner: async () => "unused",
			}),
		);

		expect(result.status).toBe("waiting_human");
		expect(violations, "mutating git argv on human entry").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});
});

describe("human approval leaves git state untouched", () => {
	function setupApproval({ born = true, withOrigin = false, precreateBranch = false } = {}) {
		const { dir, originDir } = initRepo({ born, withOrigin });
		const { store, project } = makeStore(dir);
		const projectStore = store.projectStore;
		const task = store.createTask("p1", {
			goal: "approve probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		if (precreateBranch && born) {
			realGit(dir, "branch", branch, "master");
		}
		project.useBranches = true;
		store.updateTask("p1", task.id, { status: "waiting_human" }, dir);
		return { dir, originDir, store, projectStore, task, branch };
	}

	it("dirty tree: advances without commit, push, or checkout", async () => {
		const { dir, originDir, store, projectStore, task } = setupApproval({
			withOrigin: true,
			precreateBranch: true,
		});
		fs.appendFileSync(path.join(dir, "data.txt"), "reviewer edit\n");
		fs.writeFileSync(path.join(dir, "live-work.txt"), "reviewer notes\n");

		const before = snapshot(dir, { originDir });
		const { result, violations } = await runAudited(() =>
			approveViaRoute(store, projectStore, task.id),
		);

		expect(result.currentStageId).toBe("integrate");
		expect(violations, "mutating git argv on human approval").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir, { originDir }));
	});

	it("missing task branch: ref created from the default tip, still no checkout", async () => {
		const { dir, store, projectStore, task, branch } = setupApproval();
		fs.appendFileSync(path.join(dir, "data.txt"), "reviewer edit\n");

		const before = snapshot(dir);
		const masterTip = refTarget(dir, "master");
		expect(refExists(dir, branch)).toBe(false);

		const { result, violations, refCreates } = await runAudited(() =>
			approveViaRoute(store, projectStore, task.id),
		);

		expect(result.currentStageId).toBe("integrate");
		expect(violations, "mutating git argv on human approval").toEqual([]);
		expect(refCreates.length).toBeGreaterThanOrEqual(1);
		expect(refTarget(dir, branch)).toBe(masterTip);
		const after = snapshot(dir);
		after._createdSha = refTarget(dir, branch);
		expectGitStateUnchanged(before, after, { allowRefCreated: branch });
	});

	it("clean tree: advances with zero git writes", async () => {
		const { dir, store, projectStore, task } = setupApproval({
			precreateBranch: true,
		});
		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			approveViaRoute(store, projectStore, task.id),
		);

		expect(result.currentStageId).toBe("integrate");
		expect(violations, "mutating git argv on human approval").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});

	it("unborn repo: advances without throwing", async () => {
		const { dir, store, projectStore, task } = setupApproval({ born: false });
		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			approveViaRoute(store, projectStore, task.id),
		);

		expect(result.currentStageId).toBe("integrate");
		expect(violations, "mutating git argv on human approval").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});

	it("operator on another task branch: stays put, advances, ref from default tip", async () => {
		const { dir, store, projectStore, task, branch } = setupApproval();
		realGit(dir, "branch", "kb/other", "master");
		realGit(dir, "checkout", "-q", "kb/other");
		fs.writeFileSync(path.join(dir, "other.txt"), "other work\n");
		realGit(dir, "add", "other.txt");
		realGit(dir, "commit", "-qm", "other work");
		fs.appendFileSync(path.join(dir, "data.txt"), "reviewer edit on other\n");

		const before = snapshot(dir);
		expect(before.symref).toBe("refs/heads/kb/other");
		const masterTip = refTarget(dir, "master");

		const { result, violations } = await runAudited(() =>
			approveViaRoute(store, projectStore, task.id),
		);

		expect(result.currentStageId).toBe("integrate");
		expect(violations, "mutating git argv on human approval").toEqual([]);
		expect(refTarget(dir, branch)).toBe(masterTip);
		const after = snapshot(dir);
		after._createdSha = refTarget(dir, branch);
		expectGitStateUnchanged(before, after, { allowRefCreated: branch });
	});
});

describe("human rejection performs no git writes", () => {
	it("dirty tree: rejects with zero git mutations", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "reject probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		realGit(dir, "branch", branch, "master");
		project.useBranches = true;
		store.updateTask("p1", task.id, { status: "waiting_human" }, dir);
		fs.appendFileSync(path.join(dir, "data.txt"), "operator work\n");

		const before = snapshot(dir);
		const { result, violations } = await runAudited(() =>
			store.rejectTask("p1", task.id, STAGES, "needs fixes", {}, dir),
		);

		expect(result).not.toBeNull();
		expect(violations, "mutating git argv on human rejection").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});

	it("missing task branch: rejection creates no ref", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "reject probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		project.useBranches = true;
		store.updateTask("p1", task.id, { status: "waiting_human" }, dir);

		const before = snapshot(dir);
		const { violations, refCreates } = await runAudited(() =>
			store.rejectTask("p1", task.id, STAGES, "needs fixes", {}, dir),
		);

		expect(violations, "mutating git argv on human rejection").toEqual([]);
		expect(refCreates, "ref creations on human rejection").toEqual([]);
		expect(refExists(dir, branch)).toBe(false);
		expectGitStateUnchanged(before, snapshot(dir));
	});

	it("dirty tree on another branch: rejects with zero git mutations", async () => {
		const { dir } = initRepo();
		const { store, project } = makeStore(dir);
		const task = store.createTask("p1", {
			goal: "reject probe",
			stageId: "review",
			projectCwd: dir,
		});
		const branch = taskBranchOf(task);
		realGit(dir, "branch", branch, "master");
		realGit(dir, "branch", "kb/other", "master");
		realGit(dir, "checkout", "-q", "kb/other");
		project.useBranches = true;
		store.updateTask("p1", task.id, { status: "waiting_human" }, dir);
		fs.appendFileSync(path.join(dir, "data.txt"), "operator work on other\n");

		const before = snapshot(dir);
		expect(before.symref).toBe("refs/heads/kb/other");
		const { result, violations } = await runAudited(() =>
			store.rejectTask("p1", task.id, STAGES, "needs fixes", {}, dir),
		);

		expect(result).not.toBeNull();
		expect(violations, "mutating git argv on human rejection").toEqual([]);
		expectGitStateUnchanged(before, snapshot(dir));
	});
});
