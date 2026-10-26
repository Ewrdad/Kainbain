/**
 * Review Store handles the persistence of review comments for a task.
 * Comments are stored in a sidecar JSON file at <projectRoot>/docs/tasks/<taskId>/review-comments.json.
 * This directory is git-ignored in managed projects to avoid dirtying the worktree.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { resolveTaskDocsDir } from "./docsPath.js";

export class ReviewStore {
	constructor(projectCwd, docsProject) {
		this.projectCwd = projectCwd;
		this.docsProject =
			typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject || null;
	}

	/**
	 * Resolves the path to the review-comments.json file for a given task.
	 */
	_getCommentsPath(taskId) {
		const dir =
			resolveTaskDocsDir(this.projectCwd, this.docsProject, taskId) ||
			path.join(this.projectCwd, "docs", "tasks", taskId);
		return path.join(dir, "review-comments.json");
	}

	/**
	 * Reads comments from the sidecar file.
	 * @returns {Promise<{comments: Array}>}
	 */
	async listComments(taskId) {
		const filePath = this._getCommentsPath(taskId);
		try {
			const content = await fs.readFile(filePath, "utf8");
			return JSON.parse(content);
		} catch (error) {
			// If file doesn't exist or is invalid, return empty state
			return { comments: [] };
		}
	}

	/**
	 * Writes the comments array to the sidecar file atomically.
	 */
	async _saveComments(taskId, data) {
		const filePath = this._getCommentsPath(taskId);
		const dir = path.dirname(filePath);

		// Ensure directory exists
		await fs.mkdir(dir, { recursive: true });

		// Atomic write using a temp file
		const tempPath = `${filePath}.tmp`;
		await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
		await fs.rename(tempPath, filePath);
	}

	/**
	 * Adds a new comment.
	 */
	async addComment(taskId, commentData) {
		const data = await this.listComments(taskId);

		if (
			commentData.body &&
			commentData.body.length > config.reviewMaxCommentChars
		) {
			throw new Error(
				`Comment body exceeds maximum length of ${config.reviewMaxCommentChars} characters.`,
			);
		}

		const comment = {
			id: `rc-${uuidv4()}`,
			filePath: commentData.filePath,
			line: commentData.line || null,
			side: commentData.side || "right",
			scope: commentData.scope || "line",
			headSha: commentData.headSha,
			lineText: commentData.lineText || null,
			author: commentData.author || "human",
			body: commentData.body,
			resolved: false,
			replies: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		data.comments.push(comment);
		await this._saveComments(taskId, data);
		return comment;
	}

	/**
	 * Updates an existing comment (e.g., mark as resolved).
	 */
	async updateComment(taskId, commentId, updates) {
		const data = await this.listComments(taskId);
		const index = data.comments.findIndex((c) => c.id === commentId);

		if (index === -1) {
			throw new Error(`Comment ${commentId} not found.`);
		}

		if (updates.body && updates.body.length > config.reviewMaxCommentChars) {
			throw new Error(
				`Comment body exceeds maximum length of ${config.reviewMaxCommentChars} characters.`,
			);
		}

		data.comments[index] = {
			...data.comments[index],
			...updates,
			updatedAt: new Date().toISOString(),
		};

		await this._saveComments(taskId, data);
		return data.comments[index];
	}

	/**
	 * Adds a reply to a comment thread.
	 */
	async addReply(taskId, commentId, replyData) {
		const data = await this.listComments(taskId);
		const comment = data.comments.find((c) => c.id === commentId);

		if (!comment) {
			throw new Error(`Comment ${commentId} not found.`);
		}

		if (replyData.body && replyData.body.length > config.reviewMaxCommentChars) {
			throw new Error(
				`Reply body exceeds maximum length of ${config.reviewMaxCommentChars} characters.`,
			);
		}

		const reply = {
			id: `rep-${uuidv4()}`,
			body: replyData.body,
			author: replyData.author || "human",
			createdAt: new Date().toISOString(),
		};

		comment.replies.push(reply);
		comment.updatedAt = new Date().toISOString();

		await this._saveComments(taskId, data);
		return reply;
	}

	/**
	 * Deletes a comment.
	 */
	async deleteComment(taskId, commentId) {
		const data = await this.listComments(taskId);
		const initialLength = data.comments.length;
		data.comments = data.comments.filter((c) => c.id !== commentId);

		if (data.comments.length === initialLength) {
			throw new Error(`Comment ${commentId} not found.`);
		}

		await this._saveComments(taskId, data);
		return { success: true };
	}
}
