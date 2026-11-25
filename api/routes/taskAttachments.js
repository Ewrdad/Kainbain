/***
 * MARK: taskAttachmentsRoutes
 * @description Task attachment endpoints: multipart upload of any allowed file
 *   type into the task folder's `assets/` directory, listing, header-safe
 *   serving, and per-file removal. Attachments are stored at
 *   `<projectCwd>/docs/tasks/<taskId>/assets/<name>` and referenced from
 *   task markdown with relative paths (`[name](assets/<name>)` for files,
 *   `![alt](assets/<name>)` for images). Guards mirror the image endpoints:
 *   extension allowlist, per-file size cap, per-task count cap, sanitized
 *   filenames (traversal payloads collapse to the bare name), and a taskId
 *   check that keeps the resolved folder inside `docs/tasks/`. Serving
 *   follows the attachment header matrix (images/text/pdf `inline`,
 *   everything else — always html/svg — as an `attachment` download).
 * @example app.register(taskAttachmentsRoutes, { deps })
 ***/

import fs from "node:fs";
import path from "node:path";
import {
	AttachmentIngestError,
	attachmentKind,
	attachmentServeHeaders,
	deleteTaskAttachment,
	ingestAttachment,
	isAllowedAttachmentExt,
	listTaskAttachments,
	resolveTaskAssetFile,
	sanitizeAttachmentName,
	taskAssetDir,
} from "../work/taskAssets.js";
import { commitTaskAssets } from "../work/commitTaskAssets.js";
import { sendImageError, resolveTaskContext } from "./taskImages.js";
import { config as appConfig } from "../config.js";

/***
 * MARK: taskAttachmentUrl
 * @description The API-relative URL for one stored task attachment (what the frontend embeds in download links and image `src`).
 * @example taskAttachmentUrl('p1', 't1', 'out.log') => '/projects/p1/tasks/t1/attachments/out.log'
 * @param {string} projectId
 * @param {string} taskId
 * @param {string} name
 * @returns {string}
 ***/
export const taskAttachmentUrl = (projectId, taskId, name) =>
	`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(name)}`;

/***
 * MARK: attachmentErrorBody
 * @description Builds the structured error body for an `AttachmentIngestError`: the operator-facing message names the file and the limit, and the reason code stays machine-readable.
 * @example attachmentErrorBody(new AttachmentIngestError('attachment-too-large', 'big.zip', 10)) => { error: '…', reason: 'attachment-too-large' }
 * @param {AttachmentIngestError} err
 * @returns {{error: string, reason: string}}
 ***/
const attachmentErrorBody = (err) => {
	const fileName = err?.fileName || "attachment";
	switch (err?.code) {
		case "attachment-too-large":
			return {
				error: `${fileName} exceeds the ${err.limit} byte attachment limit`,
				reason: err.code,
			};
		case "attachment-limit-reached":
			return {
				error: `Task attachment limit reached (${err.limit} per task)`,
				reason: err.code,
			};
		case "attachment-type-not-allowed":
			return {
				error: `Unsupported attachment type: ${fileName} (only the allowed file extensions can be attached)`,
				reason: err.code,
			};
		default:
			return {
				error: `Attachment filename was sanitized to nothing usable: ${fileName}`,
				reason: "attachment-invalid-name",
			};
	}
};

/***
 * MARK: taskAttachmentsRoutes
 * @description Registers the task attachment endpoints on the Fastify app.
 * @param {Object} app - Fastify application instance.
 * @param {Object} opts - Options including injected deps.
 ***/
export default async function taskAttachmentsRoutes(app, { deps }) {
	const { projectStore, taskStore } = deps;
	const taskDeps = {
		resolveAndGuardProject: deps.resolveAndGuardProject,
		projectStore,
		taskStore,
	};

	/***
	 * MARK: Upload Task Attachment
	 * @description Stores one multipart `file` in the task's assets folder.
	 *   Rejects non-multipart requests (400), disallowed extensions (400),
	 *   files over the size cap (413) and uploads past the per-task count
	 *   cap (413) — every rejection names the file and carries a structured
	 *   `reason`. The stored name is sanitized + deduped, so a second
	 *   `out.log` upload becomes `out-2.log` instead of overwriting. The
	 *   declared MIME type is advisory only; the extension allowlist and
	 *   the serving matrix decide how bytes are stored and served.
	 ***/
	app.post(
		"/projects/:id/tasks/:taskId/attachments",
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
							kind: { type: "string" },
							mediaType: { type: ["string", "null"] },
						},
					},
					400: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
					404: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
					413: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(taskDeps, request, reply);
			if (!ctx) return;

			if (!request.isMultipart()) {
				return sendImageError(reply, 400, {
					error: "multipart/form-data request with a 'file' field is required",
					reason: "attachment-not-multipart",
				});
			}

			let file;
			try {
				file = await request.file();
			} catch (err) {
				const tooLarge = err?.statusCode === 413 || err?.code === "FST_REQ_FILE_TOO_LARGE";
				return sendImageError(reply, tooLarge ? 413 : 400, {
					error: tooLarge
						? `Attachment exceeds the ${appConfig.taskAttachmentMaxBytes} byte limit`
						: `Invalid multipart payload: ${err?.message || "unknown error"}`,
					reason: tooLarge ? "attachment-too-large" : "attachment-invalid-payload",
				});
			}
			if (!file || file.type !== "file") {
				return sendImageError(reply, 400, {
					error: "A 'file' field is required",
					reason: "attachment-missing-file",
				});
			}

			let buffer;
			try {
				buffer = await file.toBuffer();
			} catch (err) {
				const tooLarge =
					err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413;
				return sendImageError(reply, tooLarge ? 413 : 400, {
					error: tooLarge
						? `${file.filename || "attachment"} exceeds the ${appConfig.taskAttachmentMaxBytes} byte limit`
						: `Upload could not be read: ${err?.message || "unknown error"}`,
					reason: tooLarge ? "attachment-too-large" : "attachment-unreadable",
				});
			}

			// Repair-after-switch (see TaskStore._saveTaskMarkdown): asset
			// writes mkdir the task dir directly and would cement a shadow
			// directory when the docs link is missing.
			taskStore._repairDocsLinkAfterSwitch?.(
				request.params.id,
				ctx.projectCwd,
			);
			let stored;
			try {
				stored = ingestAttachment({
					projectCwd: ctx.projectCwd,
					taskId: ctx.taskId,
					sourceBytes: buffer,
					originalName: file.filename,
					docsProject: ctx.project,
					maxFileBytes: appConfig.taskAttachmentMaxBytes,
					maxPerTask: appConfig.taskAttachmentMaxPerTask,
				});
			} catch (err) {
				if (err instanceof AttachmentIngestError) {
					const body = attachmentErrorBody(err);
					const status =
						err.code === "attachment-too-large" || err.code === "attachment-limit-reached"
							? 413
							: 400;
					return sendImageError(reply, status, body);
				}
				throw err;
			}
			// Ingest-time commit assurance (see the image upload route): the
			// bytes become branch content promptly. Best-effort, never a gate.
			await commitTaskAssets({
				projectCwd: ctx.projectCwd,
				taskId: ctx.taskId,
				branch: taskStore.getTask?.(request.params.id, ctx.taskId)?.branch,
				docsProject: ctx.project,
				names: [stored.name],
				logger: request.log,
			});
			return reply.status(201).send({
				name: stored.name,
				path: stored.relPath,
				url: taskAttachmentUrl(request.params.id, ctx.taskId, stored.name),
				size: stored.size,
				kind: attachmentKind(stored.name),
				mediaType: attachmentServeHeaders(stored.name)?.mediaType || null,
			});
		},
	);

	/***
	 * MARK: List Task Attachments
	 * @description Lists every attachment stored for one task (images plus all other allowed types; each entry carries a `kind` for thumbnail-vs-download rendering).
	 ***/
	app.get(
		"/projects/:id/tasks/:taskId/attachments",
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
							attachments: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										path: { type: "string" },
										size: { type: "number" },
										mtime: { type: "string" },
										mediaType: { type: ["string", "null"] },
										kind: { type: "string" },
									},
								},
							},
						},
					},
					404: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(taskDeps, request, reply);
			if (!ctx) return;
			return {
				taskId: ctx.taskId,
				attachments: listTaskAttachments(ctx.projectCwd, ctx.taskId, ctx.project),
			};
		},
	);

	/***
	 * MARK: Serve Task Attachment
	 * @description Header-safe attachment serving: exact stored bytes with the
	 *   allowlist's Content-Type, the serving-matrix disposition (`inline`
	 *   for images/text/pdf, `attachment` download for everything else —
	 *   never the UTF-8 text endpoint (`/files/content`), which corrupts
	 *   binaries, and never an inline render of user html/svg).
	 ***/
	app.get(
		"/projects/:id/tasks/:taskId/attachments/:name",
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
					400: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
					403: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
					404: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(taskDeps, request, reply);
			if (!ctx) return;

			const requestedName = String(request.params?.name || "");
			if (requestedName.includes("/") || requestedName.includes("\\")) {
				request.log?.warn?.(
					{ projectId: ctx.project?.id, taskId: ctx.taskId, reason: "path-traversal" },
					"task attachment request with a path separator in the name",
				);
				return sendImageError(reply, 403, {
					error: "Forbidden: Path traversal detected",
					reason: "path-traversal",
				});
			}
			const safeName = sanitizeAttachmentName(requestedName);
			if (!safeName || !isAllowedAttachmentExt(safeName)) {
				request.log?.warn?.(
					{ taskId: ctx.taskId, name: requestedName, reason: "invalid-attachment-name" },
					"task attachment request with an invalid attachment name",
				);
				return sendImageError(reply, 400, {
					error: "Invalid attachment name",
					reason: "invalid-attachment-name",
				});
			}
			let targetFile = resolveTaskAssetFile(ctx.projectCwd, ctx.taskId, safeName, ctx.project);
			// Serve-side canonicalization for stale/unsanitized refs: a stored
			// ref may carry a non-canonical name (wrong case, spaces, trailing
			// title residue) that the backend flattened on upload. Resolve to
			// an existing asset whose sanitized name matches instead of 404ing
			// a file that is actually present under a nearby canonical name.
			if (!targetFile || !fs.existsSync(targetFile)) {
				const assetsDir = taskAssetDir(ctx.projectCwd, ctx.taskId, ctx.project);
				if (assetsDir) {
					try {
						const match = fs
							.readdirSync(assetsDir, { withFileTypes: true })
							.find(
								(entry) =>
									entry.isFile() &&
									isAllowedAttachmentExt(entry.name) &&
									sanitizeAttachmentName(entry.name) === safeName,
							);
						if (match) {
							targetFile = path.join(assetsDir, match.name);
						}
					} catch {
						// Missing/unreadable directory: fall through to 404 below.
					}
				}
			}
			/* eslint-disable security/detect-non-literal-fs-filename */
			if (!targetFile || !fs.existsSync(targetFile)) {
				request.log?.warn?.(
					{ taskId: ctx.taskId, name: safeName, reason: "attachment-not-found" },
					"task attachment request for a missing asset file",
				);
				return sendImageError(reply, 404, { error: "Attachment not found", reason: "attachment-not-found" });
			}
			const servedName = path.basename(targetFile);
			try {
				const buffer = fs.readFileSync(targetFile);
				const served = attachmentServeHeaders(servedName) || {
					mediaType: "application/octet-stream",
					disposition: "attachment",
				};
				reply
					.header("content-type", served.mediaType)
					.header("content-length", buffer.length)
					.header("content-disposition", `${served.disposition}; filename="${servedName}"`)
					.header("x-content-type-options", "nosniff")
					// Stored names are write-once (uploads dedupe instead of
					// overwriting, deletes are explicit), so bytes are
					// immutable: refreshes must not revalidate into a
					// transient miss the way `max-age=60` did.
					.header("cache-control", "private, max-age=31536000, immutable");
				return reply.send(buffer);
			} catch (err) {
				return sendImageError(reply, 500, { error: `Failed to read attachment: ${err.message}` });
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	);

	/***
	 * MARK: Delete Task Attachment
	 * @description Removes one attachment from the task's assets folder.
	 ***/
	app.delete(
		"/projects/:id/tasks/:taskId/attachments/:name",
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
					400: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
					404: {
						type: "object",
						properties: { error: { type: "string" }, reason: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const ctx = resolveTaskContext(taskDeps, request, reply);
			if (!ctx) return;
			const safeName = sanitizeAttachmentName(String(request.params?.name || ""));
			if (!safeName) {
				return sendImageError(reply, 400, {
					error: "Invalid attachment name",
					reason: "invalid-attachment-name",
				});
			}
			const removed = deleteTaskAttachment(ctx.projectCwd, ctx.taskId, safeName, ctx.project);
			if (!removed) {
				return sendImageError(reply, 404, { error: "Attachment not found", reason: "attachment-not-found" });
			}
			return { status: "deleted", name: safeName };
		},
	);
}
