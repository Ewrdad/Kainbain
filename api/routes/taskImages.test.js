/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Isolation: throwaway roots BEFORE the app loads (mirrors files.test.js).
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

/***
 * MARK: multipartBody
 * @description Builds a raw multipart/form-data body for app.inject (light-my-request has no FormData helper):
 *   header block + raw bytes + terminating boundary, all byte-accurate.
 ***/
function multipartBody(filename, buffer, mimetype = "image/png") {
	const boundary = "----kainbain-test-boundary";
	const head = Buffer.from(
		[
			`--${boundary}`,
			`Content-Disposition: form-data; name="image"; filename="${filename}"`,
			`Content-Type: ${mimetype}`,
			"",
			"",
		].join("\r\n"),
		"latin1",
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "latin1");
	return {
		payload: Buffer.concat([head, buffer, tail]),
		headers: {
			"content-type": `multipart/form-data; boundary=${boundary}`,
		},
	};
}

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup error
	}
});

/***
 * MARK: Task Images API tests
 * @description Upload (multipart), binary serving (byte equality), listing and
 *   deletion of task image assets, with traversal / extension / size guards.
 ***/
describe("Task Images API", () => {
	let tempProjectDir;
	let testProjectId;
	let taskId;
	const PNG_BYTES = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
	]);

	beforeAll(async () => {
		await app.ready();

		tempProjectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-taskimages-test-"),
		);
		// An on-disk task (task.md) so the disk-fallback existence check holds.
		fs.mkdirSync(path.join(tempProjectDir, "docs", "tasks", "task-img-1"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempProjectDir, "docs", "tasks", "task-img-1", "task.md"),
			"---\nid: task-img-1\n---\n# Goal\nHas images.",
			"utf8",
		);

		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Task Images Test Project", cwd: tempProjectDir, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		testProjectId = JSON.parse(res.payload).id;
	});

	afterAll(() => {
		try {
			fs.rmSync(tempProjectDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	const upload = async (filename, buffer, mimetype) => {
		const { payload, headers } = multipartBody(filename, buffer, mimetype);
		return app.inject({
			method: "POST",
			url: `/projects/${testProjectId}/tasks/task-img-1/images`,
			payload,
			headers,
		});
	};

	it("uploads a PNG into the task assets folder and returns the relative reference", async () => {
		const res = await upload("shot one.PNG", PNG_BYTES);
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.name).toBe("shot-one.png");
		expect(body.path).toBe("assets/shot-one.png");
		expect(body.url).toBe(
			`/projects/${testProjectId}/tasks/task-img-1/images/shot-one.png`,
		);
		expect(body.size).toBe(PNG_BYTES.length);
		const stored = fs.readFileSync(
			path.join(
				tempProjectDir,
				"docs",
				"tasks",
				"task-img-1",
				"assets",
				"shot-one.png",
			),
		);
		expect(stored.equals(PNG_BYTES)).toBe(true);
	});

	it("serves the exact bytes back with the right headers (binary-safe)", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/shot-one.png`,
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("image/png");
		expect(res.headers["content-disposition"]).toContain("inline");
		expect(res.headers["x-content-type-options"]).toBe("nosniff");
		expect(Number(res.headers["content-length"])).toBe(PNG_BYTES.length);
		expect(Buffer.from(res.rawPayload).equals(PNG_BYTES)).toBe(true);
	});

	it("dedupes a second upload with the same sanitized name", async () => {
		const res = await upload("shot one.png", PNG_BYTES);
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).name).toBe("shot-one-2.png");
	});

	it("lists the stored images", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images`,
		});
		expect(res.statusCode).toBe(200);
		const names = JSON.parse(res.payload).images.map((i) => i.name);
		expect(names).toContain("shot-one.png");
		expect(names).toContain("shot-one-2.png");
	});

	it("rejects non-image extensions", async () => {
		const res = await upload("payload.svg", Buffer.from("<svg/>"), "image/svg+xml");
		expect(res.statusCode).toBe(400);
		const resScript = await upload("evil.sh", Buffer.from("#!/bin/sh"));
		expect(resScript.statusCode).toBe(400);
		const resNoExt = await upload("blob", PNG_BYTES);
		expect(resNoExt.statusCode).toBe(400);
	});

	it("rejects uploads with a non-image declared MIME type", async () => {
		const res = await upload("sneaky.png", PNG_BYTES, "text/html");
		expect(res.statusCode).toBe(400);
	});

	it("collapses traversal filenames to a flat safe name (nothing escapes assets/)", async () => {
		const res = await upload("../../etc/evil.png", PNG_BYTES);
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).name).toBe("evil.png");
		// The sanitized name must have landed flat inside assets/ — never outside it.
		const assetsDir = path.join(
			tempProjectDir,
			"docs",
			"tasks",
			"task-img-1",
			"assets",
		);
		const listing = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
		expect(listing.every((n) => !n.includes("/") && !n.includes(".."))).toBe(true);
		expect(fs.existsSync(path.join(tempProjectDir, "etc"))).toBe(false);
	});

	it("rejects oversized uploads with 413", async () => {
		const big = Buffer.alloc(11 * 1024 * 1024, 7); // 11 MB > 10 MB default
		const res = await upload("big.png", big);
		expect(res.statusCode).toBe(413);
	});

	it("rejects uploads past the per-task count cap with 413", async () => {
		// A fresh task so earlier uploads do not consume the cap budget.
		fs.mkdirSync(path.join(tempProjectDir, "docs", "tasks", "task-cap"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempProjectDir, "docs", "tasks", "task-cap", "task.md"),
			"---\nid: task-cap\n---\n# Goal\nCap test.",
			"utf8",
		);
		const { config } = await import("../config.js");
		const originalCap = config.taskImageMaxPerTask;
		config.taskImageMaxPerTask = 2;
		try {
			const { payload, headers } = multipartBody("cap-a.png", PNG_BYTES);
			const first = await app.inject({
				method: "POST",
				url: `/projects/${testProjectId}/tasks/task-cap/images`,
				payload,
				headers,
			});
			const { payload: p2, headers: h2 } = multipartBody("cap-b.png", PNG_BYTES);
			const second = await app.inject({
				method: "POST",
				url: `/projects/${testProjectId}/tasks/task-cap/images`,
				payload: p2,
				headers: h2,
			});
			const { payload: p3, headers: h3 } = multipartBody("cap-c.png", PNG_BYTES);
			const third = await app.inject({
				method: "POST",
				url: `/projects/${testProjectId}/tasks/task-cap/images`,
				payload: p3,
				headers: h3,
			});
			expect(first.statusCode).toBe(201);
			expect(second.statusCode).toBe(201);
			expect(third.statusCode).toBe(413);
		} finally {
			config.taskImageMaxPerTask = originalCap;
		}
	});

	it("rejects non-multipart uploads with 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: `/projects/${testProjectId}/tasks/task-img-1/images`,
			payload: { some: "json" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("returns 404 for unknown projects and unknown tasks", async () => {
		const { payload, headers } = multipartBody("x.png", PNG_BYTES);
		const noProject = await app.inject({
			method: "POST",
			url: "/projects/nope/tasks/task-img-1/images",
			payload,
			headers,
		});
		expect(noProject.statusCode).toBe(404);
		const noTask = await app.inject({
			method: "POST",
			url: `/projects/${testProjectId}/tasks/no-such-task/images`,
			payload,
			headers,
		});
		expect(noTask.statusCode).toBe(404);
	});

	it("returns 404 for a missing image and 403/400 for unsafe names", async () => {
		const missing = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/ghost.png`,
		});
		expect(missing.statusCode).toBe(404);
		const traversal = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/..%2F..%2Ftask.md`,
		});
		expect([403, 400]).toContain(traversal.statusCode);
		const badExt = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/task.md`,
		});
		expect(badExt.statusCode).toBe(400);
	});

	it("returns 404 for a task id that escapes the tasks root", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/..%2F..%2F/images`,
		});
		expect([400, 404]).toContain(res.statusCode);
	});

	it("deletes an image and then reports 404 on re-delete", async () => {
		const up = await upload("deleteme.png", PNG_BYTES);
		expect(up.statusCode).toBe(201);
		const name = JSON.parse(up.payload).name;
		const del = await app.inject({
			method: "DELETE",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/${name}`,
		});
		expect(del.statusCode).toBe(200);
		expect(JSON.parse(del.payload).name).toBe(name);
		const gone = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/${name}`,
		});
		expect(gone.statusCode).toBe(404);
		const reDel = await app.inject({
			method: "DELETE",
			url: `/projects/${testProjectId}/tasks/task-img-1/images/${name}`,
		});
		expect(reDel.statusCode).toBe(404);
	});

	it("keeps scanTasks / report sync blind to the assets binaries", async () => {
		const { taskStore } = await import("../taskStore.js");
		const { projectStore } = await import("../projectStore.js");
		taskStore.setProjectStore(projectStore);
		const tasks = taskStore.scanTasks(testProjectId, tempProjectDir);
		const task = tasks.find((t) => t.id === "task-img-1");
		expect(task).toBeTruthy();
		// Assets live in a subdirectory: never mistaken for reports (*.md glob is folder-root only).
		const reportNames = task.reports.map((r) => r.filename);
		expect(reportNames).not.toContain("shot-one.png");
	});

	it("removes the whole assets directory when the task is deleted", async () => {
		const assetsDir = path.join(
			tempProjectDir,
			"docs",
			"tasks",
			"task-del",
			"assets",
		);
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.writeFileSync(path.join(assetsDir, "doomed.png"), PNG_BYTES);
		fs.writeFileSync(
			path.join(tempProjectDir, "docs", "tasks", "task-del", "task.md"),
			"---\nid: task-del\n---\n# Goal\nDoomed.",
			"utf8",
		);
		const { taskStore } = await import("../taskStore.js");
		const { projectStore } = await import("../projectStore.js");
		taskStore.setProjectStore(projectStore);
		taskStore.scanTasks(testProjectId, tempProjectDir);
		const removed = taskStore.deleteTask(testProjectId, "task-del", tempProjectDir);
		expect(removed).toBe(true);
		expect(fs.existsSync(path.join(tempProjectDir, "docs", "tasks", "task-del"))).toBe(
			false,
		);
	});

	it("verifies the docs link before writing an uploaded image", async () => {
		const { TaskStore } = await import("../taskStore.js");
		const spy = vi.spyOn(TaskStore.prototype, "_repairDocsLinkAfterSwitch");
		try {
			const res = await upload("hookcheck.png", PNG_BYTES);
			expect(res.statusCode).toBe(201);
			expect(spy).toHaveBeenCalledWith(testProjectId, tempProjectDir);
		} finally {
			spy.mockRestore();
		}
	});
});