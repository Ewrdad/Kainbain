import path from "node:path";
import fs from "node:fs";
import {
	extToKind,
	extToMime,
	isImageExtension,
	looksBinary,
	RAW_PREVIEW_MAX_BYTES,
} from "./fileTypes.js";

/***
 * MARK: previewUrlFor
 * @description Builds the relative raw-bytes URL the explorer image preview
 *   loads directly in an `<img>` tag (same origin, no auth headers needed).
 * @example previewUrlFor('proj-1', 'docs/logo.png') => '/projects/proj-1/files/raw?path=docs%2Flogo.png'
 * @param {string} projectId
 * @param {string} relPath
 * @returns {string}
 ***/
export function previewUrlFor(projectId, relPath) {
	return `/projects/${projectId}/files/raw?path=${encodeURIComponent(relPath)}`;
}

/***
 * MARK: isPathSafe
 * @description Checks if a target path stays safely within the project root directory.
 * Prevents directory traversal attacks by verifying relative path does not escape the project root.
 * @example isPathSafe('~/projects/kainbain', '~/projects/kainbain/docs') => true
 * @param {string} projectCwd
 * @param {string} targetPath
 * @returns {boolean}
 ***/
export function isPathSafe(projectCwd, targetPath, allowedRoots = []) {
	try {
		const resolvedRoot = path.resolve(projectCwd);
		const resolvedTarget = path.resolve(targetPath);
		const rel = path.relative(resolvedRoot, resolvedTarget);
		if (rel.startsWith("..") || path.isAbsolute(rel)) {
			const inAllowed = allowedRoots.some((allowed) => {
				if (!allowed) return false;
				const resolvedAllowed = path.resolve(allowed);
				const relAllowed = path.relative(resolvedAllowed, resolvedTarget);
				return !relAllowed.startsWith("..") && !path.isAbsolute(relAllowed);
			});
			if (!inAllowed) return false;
		}

		/* eslint-disable security/detect-non-literal-fs-filename */
		if (fs.existsSync(resolvedTarget)) {
			const realTarget = fs.realpathSync(resolvedTarget);
			const realRoot = fs.existsSync(resolvedRoot)
				? fs.realpathSync(resolvedRoot)
				: resolvedRoot;
			const realRel = path.relative(realRoot, realTarget);
			const isInsideRealRoot =
				!realRel.startsWith("..") && !path.isAbsolute(realRel);
			if (!isInsideRealRoot) {
				const inAllowedReal = allowedRoots.some((allowed) => {
					if (!allowed || !fs.existsSync(allowed)) return false;
					const realAllowed = fs.realpathSync(allowed);
					const relAllowed = path.relative(realAllowed, realTarget);
					return !relAllowed.startsWith("..") && !path.isAbsolute(relAllowed);
				});
				if (!inAllowedReal) return false;
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: filesRoutes
 * @description In-app project file and document explorer endpoints.
 * Provides secure directory entry listing and file content reading with strict path traversal guards.
 * @example app.register(filesRoutes, { deps })
 * @param {Object} app - Fastify application instance.
 * @param {Object} opts - Options including injected deps.
 * @param {Object} opts.deps - Injected dependencies (projectStore, etc.).
 ***/
export default async function filesRoutes(app, { deps }) {
	const { projectStore } = deps;

	/***
	 * MARK: List Project Files / Directory Entries
	 * @description Lists directory entries within a project, optionally scoped to a subpath.
	 ***/
	app.get(
		"/projects/:id/files",
		{
			schema: {
				params: { type: "object", properties: { id: { type: "string" } } },
				querystring: {
					type: "object",
					properties: { path: { type: "string" } },
				},
				response: {
					200: {
						type: "object",
						properties: {
							cwd: { type: "string" },
							currentPath: { type: "string" },
							entries: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										path: { type: "string" },
										isDirectory: { type: "boolean" },
										size: { type: "number" },
										mtime: { type: ["string", "null"] },
										extension: { type: ["string", "null"] },
										kind: { type: "string" },
										mime: { type: ["string", "null"] },
									},
								},
							},
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
					403: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) {
				return reply.status(404).send({ error: "Project not found" });
			}

			const requestedSubpath = (request.query?.path || "").trim();
			const targetDir = path.resolve(project.cwd, requestedSubpath);

			const allowedRoots = [project.notesPath, project.notesDir].filter(
				Boolean,
			);
			// Security guard: verify path is within project root or allowed notes space
			if (!isPathSafe(project.cwd, targetDir, allowedRoots)) {
				return reply
					.status(403)
					.send({ error: "Forbidden: Path traversal detected" });
			}

			/* eslint-disable security/detect-non-literal-fs-filename */
			if (!fs.existsSync(targetDir)) {
				return reply.status(404).send({ error: "Directory not found" });
			}

			try {
				const stat = fs.statSync(targetDir);
				if (!stat.isDirectory()) {
					return reply
						.status(400)
						.send({ error: "Target path is not a directory" });
				}

				const rawEntries = fs.readdirSync(targetDir, { withFileTypes: true });
				const entries = [];

				for (const entry of rawEntries) {
					// Skip internal .git metadata directory
					if (entry.name === ".git") continue;

					const entryFullPath = path.join(targetDir, entry.name);
					const entryRelPath = path.relative(project.cwd, entryFullPath);

					let isDir = entry.isDirectory();
					let size = 0;
					let mtime = null;

					try {
						const entryStat = fs.statSync(entryFullPath);
						if (entryStat.isDirectory()) {
							isDir = true;
						}
						size = entryStat.size;
						mtime = entryStat.mtime.toISOString();
					} catch (e) {
						// Ignored for inaccessible entries
					}

					entries.push({
						name: entry.name,
						path: entryRelPath,
						isDirectory: isDir,
						size,
						mtime,
						extension: isDir ? null : path.extname(entry.name).toLowerCase(),
						kind: isDir ? "directory" : extToKind(entry.name),
						mime: isDir ? null : extToMime(entry.name),
					});
				}

				// Sort directories first, then alphabetical
				entries.sort((a, b) => {
					if (a.isDirectory && !b.isDirectory) return -1;
					if (!a.isDirectory && b.isDirectory) return 1;
					return a.name.localeCompare(b.name);
				});

				const relCurrent = path.relative(project.cwd, targetDir);

				return reply.send({
					cwd: project.cwd,
					currentPath: relCurrent === "" ? "" : relCurrent,
					entries,
				});
			} catch (err) {
				return reply
					.status(500)
					.send({ error: `Failed to read directory: ${err.message}` });
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	);

	/***
	 * MARK: Read Project File Content
	 * @description Reads UTF-8 file content (text, markdown, code) with path traversal guards.
	 ***/
	app.get(
		"/projects/:id/files/content",
		{
			schema: {
				params: { type: "object", properties: { id: { type: "string" } } },
				querystring: {
					type: "object",
					required: ["path"],
					properties: { path: { type: "string" } },
				},
				response: {
					200: {
						type: "object",
						properties: {
							name: { type: "string" },
							path: { type: "string" },
							content: { type: "string" },
							size: { type: "number" },
							extension: { type: ["string", "null"] },
							kind: { type: "string" },
							mime: { type: "string" },
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
					403: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
					415: {
						type: "object",
						properties: {
							error: { type: "string" },
							kind: { type: "string" },
							mime: { type: "string" },
							size: { type: "number" },
							previewUrl: { type: "string" },
						},
					},
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) {
				return reply.status(404).send({ error: "Project not found" });
			}

			const requestedFilePath = (request.query?.path || "").trim();
			if (!requestedFilePath) {
				return reply
					.status(400)
					.send({ error: "path query parameter is required" });
			}

			const targetFile = path.resolve(project.cwd, requestedFilePath);

			const allowedRoots = [project.notesPath, project.notesDir].filter(
				Boolean,
			);
			// Security guard: verify path stays inside project root or allowed notes space
			if (!isPathSafe(project.cwd, targetFile, allowedRoots)) {
				return reply
					.status(403)
					.send({ error: "Forbidden: Path traversal detected" });
			}

			/* eslint-disable security/detect-non-literal-fs-filename */
			if (!fs.existsSync(targetFile)) {
				return reply.status(404).send({ error: "File not found" });
			}

			try {
				const stat = fs.statSync(targetFile);
				if (stat.isDirectory()) {
					return reply
						.status(400)
						.send({ error: "Target path is a directory, not a file" });
				}

				const extension = path.extname(targetFile).toLowerCase();
				const relPath = path.relative(project.cwd, targetFile);

				// Binary files are never decoded as UTF-8 text: image and
				// known-binary extensions refuse fast, and a null-byte sniff
				// catches binaries hiding behind unknown or missing extensions.
				if (isImageExtension(extension) || extToKind(extension) === "unsupported-binary") {
					return reply.status(415).send({
						error: "Preview as text is not supported for this file. Use the raw file endpoint to view it.",
						kind: extToKind(extension),
						mime: extToMime(extension),
						size: stat.size,
						previewUrl: previewUrlFor(request.params.id, relPath),
					});
				}

				const buffer = fs.readFileSync(targetFile);
				if (looksBinary(buffer)) {
					return reply.status(415).send({
						error: "Preview as text is not supported for this file. Use the raw file endpoint to view it.",
						kind: "unsupported-binary",
						mime: "application/octet-stream",
						size: stat.size,
						previewUrl: previewUrlFor(request.params.id, relPath),
					});
				}

				const content = buffer.toString("utf8");

				return reply.send({
					name: path.basename(targetFile),
					path: relPath,
					content,
					size: Buffer.byteLength(content, "utf8"),
					extension,
					kind: extToKind(extension),
					mime: extToMime(extension),
				});
			} catch (err) {
				return reply
					.status(500)
					.send({ error: `Failed to read file: ${err.message}` });
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	);

	/***
	 * MARK: Serve Raw Project File Bytes
	 * @description Serves exact stored bytes with the correct Content-Type
	 *   and inline disposition so the explorer renders image previews in an
	 *   `<img>` tag (same origin, browser-decoded and cached). Never UTF-8
	 *   decodes: bytes go straight from disk to the response. SVG serves
	 *   with a sandbox Content-Security-Policy (no scripts run from images),
	 *   and files over the preview cap answer 413 with a JSON error.
	 ***/
	app.get(
		"/projects/:id/files/raw",
		{
			schema: {
				params: { type: "object", properties: { id: { type: "string" } } },
				querystring: {
					type: "object",
					required: ["path"],
					properties: { path: { type: "string" } },
				},
				response: {
					400: { type: "object", properties: { error: { type: "string" } } },
					403: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
					413: {
						type: "object",
						properties: {
							error: { type: "string" },
							kind: { type: "string" },
							mime: { type: "string" },
							size: { type: "number" },
						},
					},
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) {
				return reply.status(404).send({ error: "Project not found" });
			}

			const requestedFilePath = (request.query?.path || "").trim();
			if (!requestedFilePath) {
				return reply
					.status(400)
					.send({ error: "path query parameter is required" });
			}

			const targetFile = path.resolve(project.cwd, requestedFilePath);

			const allowedRoots = [project.notesPath, project.notesDir].filter(
				Boolean,
			);
			// Security guard: same traversal and symlink checks as the text endpoint.
			if (!isPathSafe(project.cwd, targetFile, allowedRoots)) {
				return reply
					.status(403)
					.send({ error: "Forbidden: Path traversal detected" });
			}

			/* eslint-disable security/detect-non-literal-fs-filename */
			if (!fs.existsSync(targetFile)) {
				return reply.status(404).send({ error: "File not found" });
			}

			try {
				const stat = fs.statSync(targetFile);
				if (stat.isDirectory()) {
					return reply
						.status(400)
						.send({ error: "Target path is a directory, not a file" });
				}

				const extension = path.extname(targetFile).toLowerCase();
				const mime = extToMime(extension);

				if (stat.size > RAW_PREVIEW_MAX_BYTES) {
					return reply.status(413).send({
						error: `File is too large to preview inline (limit is ${RAW_PREVIEW_MAX_BYTES} bytes). Download it instead.`,
						kind: extToKind(extension),
						mime,
						size: stat.size,
					});
				}

				const buffer = fs.readFileSync(targetFile);
				const safeName = path.basename(targetFile).replace(/"/g, "");
				reply
					.header("content-type", mime)
					.header("content-length", buffer.length)
					.header("content-disposition", `inline; filename="${safeName}"`)
					.header("x-content-type-options", "nosniff")
					.header("cache-control", "private, max-age=300");
				if (extension === ".svg") {
					reply.header("content-security-policy", "sandbox");
				}
				return reply.send(buffer);
			} catch (err) {
				return reply
					.status(500)
					.send({ error: `Failed to read file: ${err.message}` });
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	);
}
