import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ReviewStore } from "./reviewStore.js";

/**
 * MARK: Review Store Unit Tests
 * @description Verifies sidecar comment persistence for PR review: atomic
 *   writes, CRUD, replies, resolution, and per-task isolation.
 */
describe("ReviewStore", () => {
	let testRoot;
	let store;

	beforeEach(() => {
		testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-reviewstore-"));
		store = new ReviewStore(testRoot);
	});

	afterEach(() => {
		fs.rmSync(testRoot, { recursive: true, force: true });
	});

	function commentData(overrides = {}) {
		return {
			scope: "line",
			filePath: "src/app.js",
			line: 42,
			side: "right",
			headSha: "abc123",
			lineText: "const x = f(y);",
			body: "This ignores the null case.",
			...overrides,
		};
	}

	it("returns empty comments for a missing sidecar file", async () => {
		const data = await store.listComments("task-1");
		expect(data).toEqual({ comments: [] });
	});

	it("adds a comment with id, defaults and timestamps and persists it", async () => {
		const comment = await store.addComment("task-1", commentData());

		expect(comment.id).toMatch(/^rc-/);
		expect(comment.resolved).toBe(false);
		expect(comment.replies).toEqual([]);
		expect(comment.author).toBe("human");
		expect(comment.createdAt).toBeTruthy();
		expect(comment.updatedAt).toBeTruthy();

		// Persisted to <root>/docs/tasks/task-1/review-comments.json
		const raw = fs.readFileSync(
			path.join(testRoot, "docs", "tasks", "task-1", "review-comments.json"),
			"utf8",
		);
		const persisted = JSON.parse(raw);
		expect(persisted.comments).toHaveLength(1);
		expect(persisted.comments[0].id).toBe(comment.id);
		expect(persisted.comments[0].body).toBe("This ignores the null case.");
	});

	it("rejects comment bodies over config.reviewMaxCommentChars", async () => {
		const long = "x".repeat(4001);
		await expect(store.addComment("task-1", { ...commentData(), body: long })).rejects.toThrow(
			/maximum length/,
		);
	});

	it("updates an existing comment body and resolved flag", async () => {
		const created = await store.addComment("task-1", commentData());
		const updated = await store.updateComment("task-1", created.id, {
			body: "Updated note",
			resolved: true,
		});
		expect(updated.body).toBe("Updated note");
		expect(updated.resolved).toBe(true);

		const data = await store.listComments("task-1");
		expect(data.comments[0].body).toBe("Updated note");
		expect(data.comments[0].resolved).toBe(true);
	});

	it("throws when updating an unknown comment", async () => {
		await expect(
			store.updateComment("task-1", "rc-missing", { body: "x" }),
		).rejects.toThrow(/not found/);
	});

	it("adds a reply to a comment thread", async () => {
		const created = await store.addComment("task-1", commentData());
		const reply = await store.addReply("task-1", created.id, {
			body: "Good catch, fixing it",
		});
		expect(reply.id).toMatch(/^rep-/);
		expect(reply.author).toBe("human");

		const data = await store.listComments("task-1");
		expect(data.comments[0].replies).toHaveLength(1);
		expect(data.comments[0].replies[0].body).toBe("Good catch, fixing it");
	});

	it("throws when replying to an unknown comment", async () => {
		await expect(
			store.addReply("task-1", "rc-missing", { body: "x" }),
		).rejects.toThrow(/not found/);
	});

	it("deletes a comment", async () => {
		const a = await store.addComment("task-1", commentData());
		const b = await store.addComment("task-1", commentData({ body: "second" }));

		await store.deleteComment("task-1", a.id);
		const data = await store.listComments("task-1");
		expect(data.comments.map((c) => c.id)).toEqual([b.id]);
	});

	it("throws when deleting an unknown comment", async () => {
		await expect(store.deleteComment("task-1", "rc-missing")).rejects.toThrow(
			/not found/,
		);
	});

	it("keeps tasks isolated from each other", async () => {
		await store.addComment("task-1", commentData());
		await store.addComment("task-2", commentData({ body: "other task" }));

		const t1 = await store.listComments("task-1");
		const t2 = await store.listComments("task-2");
		expect(t1.comments).toHaveLength(1);
		expect(t2.comments).toHaveLength(1);
		expect(t1.comments[0].body).not.toBe(t2.comments[0].body);
	});

	it("treats a corrupt sidecar file as empty state", async () => {
		const dir = path.join(testRoot, "docs", "tasks", "task-bad");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "review-comments.json"), "{ not json");
		const data = await store.listComments("task-bad");
		expect(data).toEqual({ comments: [] });
	});
});