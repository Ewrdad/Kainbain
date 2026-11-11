import { describe, it, expect } from "vitest";

import { resolveTaskWorkingLocation } from "./taskWorkingLocation.js";

/***
 * MARK: taskWorkingLocation unit tests
 * @description Direct tests for `resolveTaskWorkingLocation` (the read-only
 *   helper behind the additive `workingLocation` field on `GET /tasks/:id`):
 *   branch defaulting, per-task-branch opt-out, isolation-mode defaulting,
 *   and worktree-path resolution. Pure function — no mocks needed.
 ***/

describe("resolveTaskWorkingLocation", () => {
	it("derives kb/<id> with quarantine defaults when nothing is known", () => {
		expect(resolveTaskWorkingLocation({ id: "t-1" }, {})).toEqual({
			branch: "kb/t-1",
			workspaceIsolation: "quarantine",
			worktreePath: null,
		});
	});

	it("prefers the persisted task branch", () => {
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1", branch: "kb/custom" },
			{ project: { useBranches: true } },
		);
		expect(loc.branch).toBe("kb/custom");
	});

	it("reports a null branch when the project opts out of per-task branches", () => {
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1" },
			{ project: { useBranches: false } },
		);
		expect(loc.branch).toBeNull();
		expect(loc.workspaceIsolation).toBe("quarantine");
		expect(loc.worktreePath).toBeNull();
	});

	it("keeps a persisted branch even when the project opts out", () => {
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1", branch: "kb/kept" },
			{ project: { useBranches: false } },
		);
		expect(loc.branch).toBe("kb/kept");
	});

	it("resolves the worktree path only in worktree mode with a cwd", () => {
		const project = { workspaceIsolation: "worktree", useBranches: true };
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1" },
			{ project, projectCwd: "/repo" },
		);
		expect(loc.branch).toBe("kb/t-1");
		expect(loc.workspaceIsolation).toBe("worktree");
		expect(loc.worktreePath).toBe("/repo/.kainbain/worktrees/t-1");
	});

	it("honours a custom state folder for the worktree path", () => {
		const project = {
			workspaceIsolation: "worktree",
			useBranches: true,
			kainbainDirName: ".kb",
		};
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1" },
			{ project, projectCwd: "/repo" },
		);
		expect(loc.worktreePath).toBe("/repo/.kb/worktrees/t-1");
	});

	it("reports null worktree path in worktree mode without a cwd", () => {
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1" },
			{ project: { workspaceIsolation: "worktree", useBranches: true } },
		);
		expect(loc.workspaceIsolation).toBe("worktree");
		expect(loc.worktreePath).toBeNull();
	});

	it("passes off mode through with no worktree path", () => {
		const loc = resolveTaskWorkingLocation(
			{ id: "t-1" },
			{ project: { workspaceIsolation: "off" } },
		);
		expect(loc).toEqual({
			branch: null,
			workspaceIsolation: "off",
			worktreePath: null,
		});
	});

	it("returns nulls when the task is missing", () => {
		expect(resolveTaskWorkingLocation(null, {})).toEqual({
			branch: null,
			workspaceIsolation: "quarantine",
			worktreePath: null,
		});
	});
});
