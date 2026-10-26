/***
 * MARK: reviewRoutes
 * @description MR-style review API for human review stages: serves the task
 *   branch diff (via buildTaskReview) plus CRUD for per-line/per-file review
 *   comments persisted in the task's git-ignored sidecar JSON. Comment
 *   filePaths are validated against the diff's changed-file list — never used
 *   as raw filesystem paths. Every comment mutation broadcasts REVIEW_UPDATED.
 * @example app.register(reviewRoutes, { deps })
 ***/

import { ReviewStore } from "../reviewStore.js";
import { buildTaskReview } from "../reviewAssembly.js";
import { config } from "../config.js";
import {
	normalizeReportPath,
	reportPathVariants,
} from "../reviewCommentFormatter.js";

/***
 * MARK: isSafeRepoPath
 * @description Validates a comment-supplied filePath is a plain repo-relative
 *   path: no traversal, not absolute, not a git ref/flag-shaped value. Never
 *   used as a filesystem path — only as an anchor key against the diff.
 * @example isSafeRepoPath('src/app.js') => true; isSafeRepoPath('../x') => false
 ***/
export function isSafeRepoPath(filePath) {
	if (typeof filePath !== "string" || !filePath.trim()) return false;
	if (filePath.length > 512) return false;
	if (filePath.startsWith("-") || filePath.includes("\\0")) return false;
	if (filePath.startsWith("/") || /^[A-Za-z]:/.test(filePath)) return false;
	if (filePath.includes("..")) return false;
	// Reject ref-like colon syntax (e.g. "main:file.txt") and flag injection.
	if (filePath.includes(":")) return false;
	return true;
}

const commentBodySchema = {
	type: "object",
	required: ["body", "scope"],
	properties: {
		scope: { enum: ["line", "file"] },
		filePath: { type: "string", maxLength: 512 },
		line: { type: ["integer", "null"], minimum: 0 },
		side: { enum: ["left", "right"] },
		headSha: { type: ["string", "null"], maxLength: 64 },
		lineText: { type: ["string", "null"], maxLength: 500 },
		author: { type: ["string", "null"], maxLength: 120 },
		body: {
			type: "string",
			maxLength: config.reviewMaxCommentChars,
			minLength: 1,
		},
	},
};

export default async function reviewRoutes(app, { deps }) {
	const { projectStore, taskStore, eventBridge, resolveAndGuardProject } =
		deps;

	/***
	 * MARK: safeGetTaskReports
	 * @description Report discovery for the review payload and comment
	 *   validation. Never throws: reports are auxiliary (centralised docs can
	 *   be unreachable), so a docs outage degrades to "no reports" instead of
	 *   breaking code review or commenting with a 500.
	 * @example safeGetTaskReports('p1', 't1', '/repo') => [{ path, filename, content }]
	 ***/
	function safeGetTaskReports(projectId, taskId, projectCwd) {
		try {
			if (typeof taskStore.getTaskReports !== "function") return [];
			const reports = taskStore.getTaskReports(projectId, taskId, projectCwd);
			return Array.isArray(reports) ? reports : [];
		} catch {
			return [];
		}
	}

	/***
	 * MARK: reportLineCounts
	 * @description Maps each known report (by canonical path) to its current
	 *   line count, so line-comment anchors can be range-checked. Reports
	 *   without string content are skipped (fail-open: unmeasurable anchors
	 *   stay allowed rather than blocking review).
	 * @example reportLineCounts([{ path: 'r.md', content: 'a\nb' }]) => Map { 'r.md' => 2 }
	 ***/
	function reportLineCounts(reports) {
		const counts = new Map();
		for (const report of reports || []) {
			if (!report || typeof report !== "object") continue;
			const key = normalizeReportPath(report.path);
			if (!key || typeof report.content !== "string") continue;
			if (!counts.has(key)) counts.set(key, report.content.split("\n").length);
		}
		return counts;
	}

	/***
	 * MARK: resolveReviewContext
	 * @description Guards project + task and returns the per-project ReviewStore
	 *   scoped to the managed project cwd (sidecar lives next to task.md).
	 * @example resolveReviewContext(request, reply) => { project, task, reviewStore }
	 ***/
	async function resolveReviewContext(request, reply) {
		const projectId = resolveAndGuardProject(
			request.params?.projectId ||
				request.body?.projectId ||
				request.query?.projectId,
			reply,
		);
		if (!projectId) return null;
		const project = projectStore.getProject(projectId);
		if (!project) {
			reply.status(404).send({ error: "Project not found" });
			return null;
		}
		const task = taskStore.getTask(projectId, request.params.taskId);
		if (!task) {
			reply.status(404).send({ error: "Task not found" });
			return null;
		}
		const reviewStore = new ReviewStore(project.cwd, project);
		return { projectId, project, task, reviewStore };
	}

	/***
	 * MARK: Get Task Review
	 * @description Full MR payload: branch metadata, diff, commits, comments.
	 * @example GET /projects/p1/tasks/t1/review?projectId=p1
	 ***/
	app.get(
		"/projects/:projectId/tasks/:taskId/review",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				response: { 200: { type: "object", additionalProperties: true } },
			},
		},
		async (request, reply) => {
			const ctx = await resolveReviewContext(request, reply);
			if (!ctx) return;
			const review = await buildTaskReview(
				deps,
				ctx.project.cwd,
				ctx.projectId,
				ctx.task.id,
			);
			const { comments } = await ctx.reviewStore.listComments(ctx.task.id);
			const reports = safeGetTaskReports(
				ctx.projectId,
				ctx.task.id,
				ctx.project.cwd,
			);
			return { ...review, comments, reports };
		},
	);

	/***
	 * MARK: Add Review Comment
	 * @description Creates a per-line or per-file comment anchored to headSha.
	 * @example POST /projects/p1/tasks/t1/review/comments?projectId=p1
	 ***/
	app.post(
		"/projects/:projectId/tasks/:taskId/review/comments",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				body: commentBodySchema,
				response: { 200: { type: "object", additionalProperties: true } },
			},
		},
		async (request, reply) => {
			const ctx = await resolveReviewContext(request, reply);
			if (!ctx) return;
			const payload = request.body;

			if (
				payload.scope === "line" &&
				(payload.line === undefined || payload.line === null)
			) {
				return reply
					.status(400)
					.send({ error: "Line comments require a line number" });
			}

			// Anchor validation:
			// • When a real diff exists, comments must reference a path the diff
			//   touches (or an existing thread's path, so stale threads stay
			//   resolvable/deletable after a fix changes the diff) or any report file.
			// • In an empty-state review (no diff computed, plan/document reviews —
			//   D7) file-scope comments on any repo-relative path are allowed so the
			//   human can still comment and then Pass/Fail the stage.
			// • A report-anchored line comment must point at a real report line:
			//   an out-of-range anchor would be accepted but never render, so it
			//   fails loudly instead. Diff anchors are untouched (no length
			//   information is available for them).
			const review = await buildTaskReview(
				deps,
				ctx.project.cwd,
				ctx.projectId,
				ctx.task.id,
			);
			const reports = safeGetTaskReports(
				ctx.projectId,
				ctx.task.id,
				ctx.project.cwd,
			);
			const knownReportLines = reportLineCounts(reports);
			if (review.branchSupported && review.files.length > 0) {
				// The preserved "New since merge" section is commentable too:
				// fix-up files would otherwise be rejected as unknown paths.
				const sectionFiles = (review.newSinceMerge?.files || []).flatMap(
					(f) => [f.path, f.oldPath].filter(Boolean),
				);
				const changed = new Set(
					review.files
						.map((f) => f.path)
						.concat(review.files.map((f) => f.oldPath).filter(Boolean))
						.concat(sectionFiles),
				);
				const sidecar = await ctx.reviewStore.listComments(ctx.task.id);
				for (const c of sidecar.comments) {
					if (c.filePath) {
						for (const variant of reportPathVariants(c.filePath)) {
							changed.add(variant);
						}
					}
				}
				for (const r of reports) {
					if (!r || typeof r !== "object") continue;
					for (const variant of reportPathVariants(r.path)) {
						changed.add(variant);
					}
					// A bare filename anchors only a pathless report: accepting
					// every bare filename would admit orphan anchors that match
					// no real report.
					if (!r.path && r.filename) {
						changed.add(r.filename);
					}
				}
				if (!payload.filePath || !changed.has(payload.filePath)) {
					return reply
						.status(400)
						.send({ error: "Unknown filePath: not part of this diff" });
				}
			} else if (payload.filePath && !isSafeRepoPath(payload.filePath)) {
				return reply
					.status(400)
					.send({ error: "filePath must be a repo-relative path" });
			}
			if (
				payload.scope === "line" &&
				Number.isInteger(payload.line) &&
				payload.filePath
			) {
				const reportKey = normalizeReportPath(payload.filePath);
				if (knownReportLines.has(reportKey)) {
					const lineCount = knownReportLines.get(reportKey);
					if (!(payload.line >= 1 && payload.line <= lineCount)) {
						return reply.status(400).send({
							error: `Line ${payload.line} is outside this report (${lineCount} lines)`,
						});
					}
				}
			}

			const comment = await ctx.reviewStore.addComment(ctx.task.id, payload);
			eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
				projectId: ctx.projectId,
				taskId: ctx.task.id,
				type: "comment_added",
				comment,
			});
			return comment;
		},
	);

	/***
	 * MARK: Update Review Comment
	 * @description Edits body and/or resolved state of a comment thread root.
	 ***/
	app.patch(
		"/projects/:projectId/tasks/:taskId/review/comments/:commentId",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				body: {
					type: "object",
					properties: {
						body: {
							type: "string",
							maxLength: config.reviewMaxCommentChars,
							minLength: 1,
						},
						resolved: { type: "boolean" },
					},
					additionalProperties: false,
				},
				response: { 200: { type: "object", additionalProperties: true } },
			},
		},
		async (request, reply) => {
			const ctx = await resolveReviewContext(request, reply);
			if (!ctx) return;
			try {
				const comment = await ctx.reviewStore.updateComment(
					ctx.task.id,
					request.params.commentId,
					request.body,
				);
				eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
					projectId: ctx.projectId,
					taskId: ctx.task.id,
					type: "comment_updated",
					comment,
				});
				return comment;
			} catch {
				return reply.status(404).send({ error: "Comment not found" });
			}
		},
	);

	/***
	 * MARK: Add Reply
	 * @description Appends a reply to a comment thread.
	 ***/
	app.post(
		"/projects/:projectId/tasks/:taskId/review/comments/:commentId/replies",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				body: {
					type: "object",
					required: ["body"],
					properties: {
						body: {
							type: "string",
							maxLength: config.reviewMaxCommentChars,
							minLength: 1,
						},
						author: { type: ["string", "null"], maxLength: 120 },
					},
				},
				response: { 200: { type: "object", additionalProperties: true } },
			},
		},
		async (request, reply) => {
			const ctx = await resolveReviewContext(request, reply);
			if (!ctx) return;
			try {
				const replyData = await ctx.reviewStore.addReply(
					ctx.task.id,
					request.params.commentId,
					request.body,
				);
				eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
					projectId: ctx.projectId,
					taskId: ctx.task.id,
					type: "reply_added",
					commentId: request.params.commentId,
					reply: replyData,
				});
				return replyData;
			} catch {
				return reply.status(404).send({ error: "Comment not found" });
			}
		},
	);

	/***
	 * MARK: Delete Review Comment
	 ***/
	app.delete(
		"/projects/:projectId/tasks/:taskId/review/comments/:commentId",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				response: { 200: { type: "object", additionalProperties: true } },
			},
		},
		async (request, reply) => {
			const ctx = await resolveReviewContext(request, reply);
			if (!ctx) return;
			try {
				await ctx.reviewStore.deleteComment(ctx.task.id, request.params.commentId);
				eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
					projectId: ctx.projectId,
					taskId: ctx.task.id,
					type: "comment_deleted",
					commentId: request.params.commentId,
				});
				return { success: true };
			} catch {
				return reply.status(404).send({ error: "Comment not found" });
			}
		},
	);
}
