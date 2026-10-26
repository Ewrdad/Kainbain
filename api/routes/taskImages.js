/***
 * MARK: taskImagesRoutes
 * @description Task image asset endpoints: multipart upload into the task folder's
 *   `assets/` directory, listing, binary-safe serving, and per-image removal.
 *   Images are stored at `<projectCwd>/docs/tasks/<taskId>/assets/<name>` and
 *   referenced from task markdown with relative paths (`![alt](assets/<name>)`).
 *   Guards: extension allowlist, per-file size cap, per-task count cap, sanitized
 *   filenames (traversal payloads collapse to the bare name), and a taskId check
 *   that keeps the resolved folder inside `docs/tasks/`.
 * @example app.register(taskImagesRoutes, { deps })
 ***/

import fs from "node:fs";
import path from "node:path";
import {
	isAllowedImageExt,
	imageMediaType,
	sanitizeImageName,
	dedupeImageName,
	taskAssetDir,
	resolveTaskAssetFile,
	listTaskImages,
	writeTaskImage,
	deleteTaskImage,
} from "../work/taskAssets.js";
import { config as appConfig } from "../config.js";

/***
 * MARK: resolveTaskContext
 * @description Guards + resolves the on-disk task folder for a task-scoped image
 *   request: the project must exist, the taskId must resolve inside `docs/tasks/`,
 *   and the task must exist (in the store, or as task.md on disk for tasks the
 *   store has not hydrated yet). Sends the error response and returns null when
 *   any guard fails.
 * @example const ctx = resolveTaskContext(deps, request, reply); if (!ctx) return;
 * @param {Object} deps - Injected route dependencies (projectStore, taskStore).
 * @param {Object} request - Fastify request (params.id, params.taskId).
 * @param {Object} reply - Fastify reply.
 * @returns {{project: Object, taskId: string, projectCwd: string}|null}
 ***/
function resolveTaskContext(deps, request, reply) {
	const { resolveAndGuardProject, projectStore, taskStore } = deps;
	const projectId = resolveAndGuardProject(
		request.params?.id || request.query?.projectId,
		reply,
	);
	if (!projectId) return null;
	const project = projectStore.getProject(projectId);
	const taskId = String(request.params?.taskId || "").trim();
	const assetsDir = taskAssetDir(project.cwd, taskId, project);
	if (!assetsDir) {
		reply.status(400).send({ error: "Invalid task id" });
		return null;
	}
	// Server-authoritative task existence: the store is primary; task.md on
	// disk is the fallback (covers tasks not yet rehydrated into the cache).
	const taskFolder = path.dirname(assetsDir);
	const taskExists =
		Boolean(taskStore?.getTask?.(projectId, taskId)) ||
		fs.existsSync(path.join(taskFolder, "task.md"));
	if (!taskExists) {
		reply.status(404).send({ error: "Task not found" });
		return null;
	}
	return { project, taskId, projectCwd: project.cwd };
}

/***
 * MARK: taskImagesRoutes
 * @description Registers the task image endpoints on the Fastify app.
 * @param {Object} app - Fastify application instance.
 * @param {Object} opts - Options including injected deps.
 ***/
export default async function taskImagesRoutes(app, { deps }) {
	const { projectStore, taskStore } = deps;

	/***
	 * MARK: Upload Task Image
	 * @description Stores one multipart `image` file in the task's assets folder.
	 *   Rejects non-multipart requests (400), disallowed extensions / non-image
	 *   declared MIME (400), files over the size cap (413) and uploads past the
	 *   per-task count cap (413). The stored name is sanitized + deduped, so a
	 *   second `foo.png` upload becomes `foo-2.png` instead of overwriting.
	 ***/
	app.post(
		"/projects/:id/tasks/:taskId/images",
		{
			schema: {
				params: {
					type: "object",
					properties: { id: { type: "string" }, taskId: { type: "string" } },
				},
				response: {
					201: {
						type: "object",
						properties: {
							name: { type: "string" },
							path: { type: "string" },
							url: { type: "string" },
							size: { type: "number" },
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
					413: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(
				{ resolveAndGuardProject: deps.resolveAndGuardProject, projectStore, taskStore },
				request,
				reply,
			);
			if (!ctx) return;

			if (!request.isMultipart()) {
				return reply.status(400).send({
					error: "multipart/form-data request with an 'image' file is required",
				});
			}

			let file;
			try {
				file = await request.file();
			} catch (err) {
				const tooLarge = err?.statusCode === 413 || err?.code === "FST_REQ_FILE_TOO_LARGE";
				return reply.status(tooLarge ? 413 : 400).send({
					error: tooLarge
						? `Image exceeds the ${appConfig.taskImageMaxBytes} byte limit`
						: `Invalid multipart payload: ${err?.message || "unknown error"}`,
				});
			}
			if (!file || file.type !== "file") {
				return reply
					.status(400)
					.send({ error: "An 'image' file field is required" });
			}

			const declaredType = String(file.mimetype || "").toLowerCase();
			if (declaredType && !declaredType.startsWith("image/")) {
				return reply
					.status(400)
					.send({ error: `Unsupported upload type: ${declaredType}` });
			}

			const safeName = sanitizeImageName(file.filename);
			if (!safeName || !isAllowedImageExt(safeName)) {
				return reply.status(400).send({
					error:
						"Only png, jpg, jpeg, gif and webp images are supported (filename was sanitized to nothing usable)",
				});
			}

			let buffer;
			try {
				buffer = await file.toBuffer();
			} catch (err) {
				const tooLarge =
					err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413;
				return reply.status(tooLarge ? 413 : 400).send({
					error: tooLarge
						? `Image exceeds the ${appConfig.taskImageMaxBytes} byte limit`
						: `Upload could not be read: ${err?.message || "unknown error"}`,
				});
			}

			// Repair-after-switch (see TaskStore._saveTaskMarkdown): asset
			// writes mkdir the task dir directly and would cement a shadow
			// directory when the docs link is missing.
			taskStore._repairDocsLinkAfterSwitch?.(
				request.params.id,
				ctx.projectCwd,
			);
			const existing = listTaskImages(ctx.projectCwd, ctx.taskId, ctx.project);
			if (existing.length >= appConfig.taskImageMaxPerTask) {
				return reply.status(413).send({
					error: `Task image limit reached (${appConfig.taskImageMaxPerTask} per task)`,
				});
			}

			const finalName = dedupeImageName(
				existing.map((image) => image.name),
				safeName,
			);
			const relPath = writeTaskImage(ctx.projectCwd, ctx.taskId, finalName, buffer, ctx.project);
			return reply.status(201).send({
				name: finalName,
				path: relPath,
				url: taskImageUrl(request.params.id, ctx.taskId, finalName),
				size: buffer.length,
			});
		},
	);

	/***
	 * MARK: List Task Images
	 * @description Lists the image assets stored for one task.
	 ***/
	app.get(
		"/projects/:id/tasks/:taskId/images",
		{
			schema: {
				params: {
					type: "object",
					properties: { id: { type: "string" }, taskId: { type: "string" } },
				},
				response: {
					200: {
						type: "object",
						properties: {
							taskId: { type: "string" },
							images: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										path: { type: "string" },
										size: { type: "number" },
										mtime: { type: "string" },
										mediaType: { type: ["string", "null"] },
									},
								},
							},
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(
				{ resolveAndGuardProject: deps.resolveAndGuardProject, projectStore, taskStore },
				request,
				reply,
			);
			if (!ctx) return;
			return {
				taskId: ctx.taskId,
				images: listTaskImages(ctx.projectCwd, ctx.taskId, ctx.project),
			};
		},
	);

	/***
	 * MARK: Serve Task Image
	 * @description Binary-safe image serving: exact stored bytes with the correct
	 *   Content-Type, inline disposition and nosniff — never the UTF-8 text
	 *   endpoint (`/files/content`), which corrupts binaries.
	 ***/
	app.get(
		"/projects/:id/tasks/:taskId/images/:name",
		{
			schema: {
				params: {
					type: "object",
					properties: {
						id: { type: "string" },
						taskId: { type: "string" },
						name: { type: "string" },
					},
				},
				response: {
					400: { type: "object", properties: { error: { type: "string" } } },
					403: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(
				{ resolveAndGuardProject: deps.resolveAndGuardProject, projectStore, taskStore },
				request,
				reply,
			);
			if (!ctx) return;

			const requestedName = String(request.params?.name || "");
			if (requestedName.includes("/") || requestedName.includes("\\")) {
				return reply
					.status(403)
					.send({ error: "Forbidden: Path traversal detected" });
			}
			const safeName = sanitizeImageName(requestedName);
			if (!safeName || !isAllowedImageExt(safeName)) {
				return reply.status(400).send({ error: "Invalid image name" });
			}
			const targetFile = resolveTaskAssetFile(ctx.projectCwd, ctx.taskId, safeName, ctx.project);
			/* eslint-disable security/detect-non-literal-fs-filename */
			if (!targetFile || !fs.existsSync(targetFile)) {
				return reply.status(404).send({ error: "Image not found" });
			}
			try {
				const buffer = fs.readFileSync(targetFile);
				const mediaType = imageMediaType(safeName) || "application/octet-stream";
				reply
					.header("content-type", mediaType)
					.header("content-length", buffer.length)
					.header("content-disposition", `inline; filename="${safeName}"`)
					.header("x-content-type-options", "nosniff")
					.header("cache-control", "private, max-age=60");
				return reply.send(buffer);
			} catch (err) {
				return reply
					.status(500)
					.send({ error: `Failed to read image: ${err.message}` });
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	);

	/***
	 * MARK: Delete Task Image
	 * @description Removes one image asset from the task's assets folder.
	 ***/
	app.delete(
		"/projects/:id/tasks/:taskId/images/:name",
		{
			schema: {
				params: {
					type: "object",
					properties: {
						id: { type: "string" },
						taskId: { type: "string" },
						name: { type: "string" },
					},
				},
				response: {
					200: {
						type: "object",
						properties: { status: { type: "string" }, name: { type: "string" } },
					},
					400: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(
				{ resolveAndGuardProject: deps.resolveAndGuardProject, projectStore, taskStore },
				request,
				reply,
			);
			if (!ctx) return;
			const safeName = sanitizeImageName(String(request.params?.name || ""));
			if (!safeName) {
				return reply.status(400).send({ error: "Invalid image name" });
			}
			const removed = deleteTaskImage(ctx.projectCwd, ctx.taskId, safeName, ctx.project);
			if (!removed) {
				return reply.status(404).send({ error: "Image not found" });
			}
			return { status: "deleted", name: safeName };
		},
	);
}

/***
 * MARK: taskImageUrl
 * @description The API-relative URL for one stored task image (what the frontend embeds in `src`).
 * @example taskImageUrl('p1', 't1', 'a.png') => '/projects/p1/tasks/t1/images/a.png'
 * @param {string} projectId
 * @param {string} taskId
 * @param {string} name
 * @returns {string}
 ***/
export function taskImageUrl(projectId, taskId, name) {
	return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(name)}`;
}