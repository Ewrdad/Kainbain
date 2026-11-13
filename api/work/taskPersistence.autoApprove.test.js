/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveTaskMarkdown, parseTaskMarkdown } from "./taskPersistence.js";

function stubStore({ cwd = null } = {}) {
	return {
		_resolveProjectCwd: () => cwd,
		_saveTaskMarkdown: () => {},
	};
}

/***
 * MARK: auto-approve stamp persistence tests
 * @description Proves the deadline stamp and reminder marker survive the
 *   task-markdown round-trip (the restart-recovery foundation: the sweeper
 *   rebuilds nothing, it reads the disk), and that legacy files without the
 *   keys load with null defaults.
 ***/
describe("auto-approve stamp frontmatter", () => {
	it("round-trips autoApproveAt + autoApproveRemindedAt through task.md", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-auto-approve-persist-"));
		try {
			const task = {
				id: "task-auto-1",
				projectId: "proj-1",
				title: "Auto-approve stamped task",
				status: "waiting_human",
				currentStageId: "review",
				enteredStageAt: "2026-11-01T00:00:00.000Z",
				autoApproveAt: "2026-11-11T00:00:00.000Z",
				autoApproveRemindedAt: "2026-11-10T00:00:00.000Z",
				createdAt: "2026-11-01T00:00:00.000Z",
				updatedAt: "2026-11-01T00:00:00.000Z",
				history: [],
			};
			saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-auto-1", "task.md"),
				"utf8",
			);
			expect(content).toContain('autoApproveAt: "2026-11-11T00:00:00.000Z"');
			expect(content).toContain('autoApproveRemindedAt: "2026-11-10T00:00:00.000Z"');
			const rehydrated = parseTaskMarkdown(stubStore(), content, "task-auto-1", "proj-1");
			expect(rehydrated.autoApproveAt).toBe("2026-11-11T00:00:00.000Z");
			expect(rehydrated.autoApproveRemindedAt).toBe("2026-11-10T00:00:00.000Z");
			expect(rehydrated.status).toBe("waiting_human");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("omits the keys when no wait is live and loads legacy files as null", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-auto-approve-legacy-"));
		try {
			const task = {
				id: "task-auto-legacy",
				projectId: "proj-1",
				title: "Legacy task",
				status: "in_stage",
				autoApproveAt: null,
				autoApproveRemindedAt: null,
				createdAt: "2026-11-01T00:00:00.000Z",
				updatedAt: "2026-11-01T00:00:00.000Z",
				history: [],
			};
			saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-auto-legacy", "task.md"),
				"utf8",
			);
			expect(content).not.toContain("autoApproveAt");
			expect(content).not.toContain("autoApproveRemindedAt");
			const rehydrated = parseTaskMarkdown(stubStore(), content, "task-auto-legacy", "proj-1");
			expect(rehydrated.autoApproveAt).toBeNull();
			expect(rehydrated.autoApproveRemindedAt).toBeNull();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
