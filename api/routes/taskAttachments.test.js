/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
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
function multipartBody(filename, buffer, mimetype = "text/plain", field = "file") {
	const boundary = "----kainbain-test-boundary";
	const head = Buffer.from(
		[
			`--${boundary}`,
			`Content-Disposition: form-data; name="${field}"; filename="${filename}"`,
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
 * MARK: Task Attachments API tests
 * @description Upload (multipart), header-safe serving (inline vs download
 *   matrix), listing and deletion of generalized task attachments, with
 *   traversal / extension / size guards and ingest-time branch commits.
 ***/
describe("Task Attachments API", () => {
	let tempProjectDir;
	let testProjectId;
	const taskId = "task-attach-1";
	const LOG_BYTES = Buffer.from("first line\nsecond line\n");

	beforeAll(async () => {
		await app.ready();

		tempProjectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-taskattachments-test-"),
		);
		// An on-disk task (task.md) so the disk-fallback existence check holds.
		fs.mkdirSync(path.join(tempProjectDir, "docs", "tasks", taskId), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempProjectDir, "docs", "tasks", taskId, "task.md"),
			"---\nid: task-attach-1\n---\n# Goal\nHas attachments.",
			"utf8",
		);

		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Task Attachments Test Project", cwd: tempProjectDir, gitUrl: "https://git.example.com/team/fixture.git" },
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

	const upload = async (filename, buffer, mimetype, targetTaskId = taskId) => {
		const { payload, headers } = multipartBody(filename, buffer, mimetype);
		return app.inject({
			method: "POST",
			url: `/projects/${testProjectId}/tasks/${targetTaskId}/attachments`,
			payload,
			headers,
		});
	};
	const assetsDir = () =>
		path.join(tempProjectDir, "docs", "tasks", taskId, "assets");

	it("uploads a log into the task assets folder and returns the reference", async () => {
		const res = await upload("Run Output.LOG", LOG_BYTES);
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.name).toBe("run-output.log");
		expect(body.path).toBe("assets/run-output.log");
		expect(body.url).toBe(
			`/projects/${testProjectId}/tasks/${taskId}/attachments/run-output.log`,
		);
		expect(body.size).toBe(LOG_BYTES.length);
		expect(body.kind).toBe("file");
		expect(body.mediaType).toBe("text/plain");
		expect(
			fs.readFileSync(path.join(assetsDir(), "run-output.log")).equals(LOG_BYTES),
		).toBe(true);
	});

	it("serves text attachments inline and risky types as downloads", async () => {
		const inline = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/${taskId}/attachments/run-output.log`,
		});
		expect(inline.statusCode).toBe(200);
		expect(inline.headers["content-type"]).toBe("text/plain");
		expect(inline.headers["content-disposition"]).toContain("inline");
		expect(inline.headers["x-content-type-options"]).toBe("nosniff");
		expect(Buffer.from(inline.rawPayload).equals(LOG_BYTES)).toBe(true);

		await upload("page.html", Buffer.from("<h1>x</h1>"), "text/html");
		const download = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/${taskId}/attachments/page.html`,
		});
		expect(download.statusCode).toBe(200);
		expect(download.headers["content-type"]).toBe("text/html");
		expect(download.headers["content-disposition"]).toContain("attachment");
		expect(download.headers["x-content-type-options"]).toBe("nosniff");
	});

	it("dedupes a second upload with the same sanitized name", async () => {
		const res = await upload("run output.log", LOG_BYTES);
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).name).toBe("run-output-2.log");
	});

	it("lists every stored attachment with its kind", async () => {
		const res = await app.inject({
			method: "GET",
			url: `/projects/${testProjectId}/tasks/${taskId}/attachments`,
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.taskId).toBe(taskId);
		const names = body.attachments.map((entry) => entry.name);
		expect(names).toContain("run-output.log");
		expect(names).toContain("page.html");
		expect(
			body.attachments.find((entry) => entry.name === "page.html"),
		).toMatchObject({ kind: "file", mediaType: "text/html" });
	});

	it("accepts images through the same endpoint", async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const res = await upload("shot.png", png, "image/png");
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload)).toMatchObject({
			name: "shot.png",
			kind: "image",
			mediaType: "image/png",
		});
	});

	it("rejects disallowed extensions with a reason code", async () => {
		const res = await upload("evil.sh", Buffer.from("#!/bin/sh"), "text/x-sh");
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.payload);
		expect(body.reason).toBe("attachment-type-not-allowed");
		expect(body.error).toContain("evil.sh");
		const resNoExt = await upload("blob", LOG_BYTES);
		expect(resNoExt.statusCode).toBe(400);
	});

	it("collapses traversal filenames to a flat safe name (nothing escapes assets/)", async () => {
		const res = await upload("../../etc/evil.log", LOG_BYTES);
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).name).toBe("evil.log");
		const listing = fs.existsSync(assetsDir()) ? fs.readdirSync(assetsDir()) : [];
		expect(listing.every((n) => !n.includes("/") && !n.includes(".."))).toBe(true);
		expect(fs.existsSync(path.join(tempProjectDir, "etc"))).toBe(false);
	});

	it("rejects oversized uploads with 413 naming the file and the limit", async () => {
		const big = Buffer.alloc(11 * 1024 * 1024, 7); // 11 MB > 10 MB default
		const res = await upload("big.log", big);
		expect(res.statusCode).toBe(413);
		const body = JSON.parse(res.payload);
		expect(body.reason).toBe("attachment-too-large");
		expect(body.error).toContain("big.log");
	});

	it("deletes one attachment", async () => {
		await upload("doomed.log", LOG_BYTES);
		const res = await app.inject({
			method: "DELETE",
			url: `/projects/${testProjectId}/tasks/${taskId}/attachments/doomed.log`,
		});
		expect(res.statusCode).toBe(200);
		expect(fs.existsSync(path.join(assetsDir(), "doomed.log"))).toBe(false);
		const missing = await app.inject({
			method: "DELETE",
			url: `/projects/${testProjectId}/tasks/${taskId}/attachments/doomed.log`,
		});
		expect(missing.statusCode).toBe(404);
	});

	it("commits uploaded bytes to the task branch when the checkout is a repo on it", async () => {
		// A sibling task dir inside a fresh git checkout on kb/<taskId>: the
		// upload must leave the bytes committed (task.md stays uncommitted).
		const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-attach-commit-"));
		const gitTaskId = "task-attach-commit";
		try {
			const git = (args) =>
				execFileSync("git", args, {
					cwd: repoDir,
					stdio: "ignore",
					env: {
						...process.env,
						GIT_CONFIG_GLOBAL: os.devNull,
						GIT_CONFIG_SYSTEM: os.devNull,
					},
				});
			git(["init", "-q", "--initial-branch=main"]);
			git(["config", "user.email", "t@t.t"]);
			git(["config", "user.name", "t"]);
			git(["config", "commit.gpgsign", "false"]);
			fs.mkdirSync(path.join(repoDir, "docs", "tasks", gitTaskId), { recursive: true });
			fs.writeFileSync(
				path.join(repoDir, "docs", "tasks", gitTaskId, "task.md"),
				"seed",
			);
			git(["add", "."]);
			git(["commit", "-qm", "seed"]);
			git(["checkout", "-qb", `kb/${gitTaskId}`]);
			const created = await app.inject({
				method: "POST",
				url: "/projects",
				payload: {
					name: "Attachment Commit Project",
					cwd: repoDir,
					gitUrl: "https://git.example.com/team/fixture.git",
				},
			});
			const repoProjectId = JSON.parse(created.payload).id;
			// `.txt`: the scaffold `.gitignore` ignores `*.log`, and the
			// ingest commit respects gitignore like the finalize sweep.
			const { payload, headers } = multipartBody("commit-me.txt", LOG_BYTES);
			const res = await app.inject({
				method: "POST",
				url: `/projects/${repoProjectId}/tasks/${gitTaskId}/attachments`,
				payload,
				headers,
			});
			expect(res.statusCode).toBe(201);
			const files = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], {
				cwd: repoDir,
				encoding: "utf8",
			});
			expect(files).toContain(`docs/tasks/${gitTaskId}/assets/commit-me.txt`);
			expect(files).not.toContain("task.md");
		} finally {
			fs.rmSync(repoDir, { recursive: true, force: true });
		}
	});
});
