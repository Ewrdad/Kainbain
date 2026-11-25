/* eslint-disable security/detect-non-literal-fs-filename */
import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds.

const { default: app } = await import("../index.js");
const { routeStageError } = await import("../flow/execution/routeStageError.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Task Attachment Ingest tests
 * @description End-to-end attachment ingest across every text surface: task
 *   create/patch goals, rejection feedback, failure routing, and review
 *   comments. Out-of-task files land in the task's `assets/` folder and
 *   every reference rewrites to the stored `assets/<name>` path; texts
 *   without such refs pass through byte-identical.
 ***/
describe("Task Attachment Ingest", () => {
	let tempProjectDir;
	let testProjectId;
	let srcDir;

	beforeAll(async () => {
		await app.ready();
		tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ingest-test-"));
		srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ingest-src-"));
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Attachment Ingest Test Project",
				cwd: tempProjectDir,
				gitUrl: "https://git.example.com/team/fixture.git",
			},
		});
		testProjectId = JSON.parse(res.payload).id;
	});

	afterAll(() => {
		for (const dir of [tempProjectDir, srcDir]) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// ignore cleanup error
			}
		}
	});

	const makeSource = (name, content) => {
		const file = path.join(srcDir, name);
		fs.writeFileSync(file, content);
		return file;
	};
	const assetFile = (taskId, name) =>
		path.join(tempProjectDir, "docs", "tasks", taskId, "assets", name);

	const makeTask = async (goal) => {
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: testProjectId, title: "Ingest me", goal },
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload);
	};

	it("ingests goal refs on create and reports the mapping", async () => {
		const src = makeSource("create-input.log", "create-bytes");
		const task = await makeTask(`Investigate.\n\nSee [input](${src}).`);
		expect(task.goal).toBe("Investigate.\n\nSee [input](assets/create-input.log).");
		expect(task.ingestedAttachments).toEqual([
			{
				from: src,
				to: "assets/create-input.log",
				name: "create-input.log",
				size: 12,
			},
		]);
		expect(fs.readFileSync(assetFile(task.id, "create-input.log"), "utf8")).toBe(
			"create-bytes",
		);
	});

	it("leaves goals without out-of-task refs byte-identical on create", async () => {
		const goal = "Plain goal.\n\n![kept](assets/kept.png).";
		const task = await makeTask(goal);
		expect(task.goal).toBe(goal);
		expect(task.ingestedAttachments).toBeUndefined();
	});

	it("ingests goal refs on patch", async () => {
		const task = await makeTask("Patch me.");
		const src = makeSource("patch-input.txt", "patch-bytes");
		const res = await app.inject({
			method: "PATCH",
			url: `/tasks/${task.id}`,
			payload: { projectId: testProjectId, goal: `Updated.\n\nSee [f](${src}).` },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.goal).toBe("Updated.\n\nSee [f](assets/patch-input.txt).");
		expect(body.ingestedAttachments).toEqual([
			{ from: src, to: "assets/patch-input.txt", name: "patch-input.txt", size: 11 },
		]);
		expect(fs.readFileSync(assetFile(task.id, "patch-input.txt"), "utf8")).toBe(
			"patch-bytes",
		);
	});

	it("ingests rejection feedback refs into the failure context", async () => {
		const task = await makeTask("Reject me.");
		const src = makeSource("reject-shot.png", "png-bytes");
		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/reject`,
			payload: {
				projectId: testProjectId,
				feedback: `Wrong output.\n\n![shot](${src})`,
			},
		});
		expect(res.statusCode).toBe(200);
		const rejected = JSON.parse(res.payload);
		expect(rejected.failureReason).toBe("Wrong output.\n\n![shot](assets/reject-shot.png)");
		expect(rejected.goal).toContain("![shot](assets/reject-shot.png)");
		expect(fs.readFileSync(assetFile(task.id, "reject-shot.png"), "utf8")).toBe(
			"png-bytes",
		);
	});

	it("ingests failure text refs during error routing", async () => {
		const task = await makeTask("Fail me.");
		const src = makeSource("failure-output.log", "failure-bytes");
		const seen = {};
		const stubStore = {
			getTask: () => ({ id: task.id }),
			projectStore: { getProject: () => ({ id: testProjectId, cwd: tempProjectDir }) },
			handleStageFailure: (projectId, taskId, stage, error) => {
				seen.message = error.message;
				seen.stdout = error.stdout;
				return { routed: true };
			},
		};
		const err = new Error(`Stage blew up; see [out](${src})`);
		err.stdout = `traceback; full log at [out](${src})`;
		const outcome = await routeStageError(stubStore, testProjectId, task.id, { id: "s1" }, err, {
			stages: [],
			projectCwd: tempProjectDir,
		});
		expect(outcome).toEqual({ routed: true });
		expect(seen.message).toBe("Stage blew up; see [out](assets/failure-output.log)");
		expect(seen.stdout).toBe("traceback; full log at [out](assets/failure-output.log)");
		expect(fs.readFileSync(assetFile(task.id, "failure-output.log"), "utf8")).toBe(
			"failure-bytes",
		);
	});

	it("ingests review comment bodies", async () => {
		const task = await makeTask("Review me.");
		const src = makeSource("review-note.md", "note-bytes");
		const res = await app.inject({
			method: "POST",
			url: `/projects/${testProjectId}/tasks/${task.id}/review/comments?projectId=${testProjectId}`,
			payload: {
				scope: "file",
				filePath: "notes.md",
				body: `Please check [note](${src}).`,
			},
		});
		expect(res.statusCode).toBe(200);
		const comment = JSON.parse(res.payload);
		expect(comment.body).toBe("Please check [note](assets/review-note.md).");
		expect(comment.ingestedAttachments).toEqual([
			{ from: src, to: "assets/review-note.md", name: "review-note.md", size: 10 },
		]);
		expect(fs.readFileSync(assetFile(task.id, "review-note.md"), "utf8")).toBe(
			"note-bytes",
		);
	});
});
