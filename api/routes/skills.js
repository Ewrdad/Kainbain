/***
 * MARK: skillsRoutes
 * @description Stage-skills library endpoints. Exposes the user-authored skill
 *   packages (SKILL.md + optional KB_config.json) that operators attach to pipeline
 *   stages for prompt injection:
 *
 *   GET /skills?projectId=<id>        -> merged, shadowed descriptor list
 *                                        [{ name, description, source, path, hasConfig,
 *                                           config, keywords, markdownChars, invalid?, error? }]
 *   GET /skills/:name?projectId=<id>  -> raw skill content for preview
 *                                        { name, description, source, path, config,
 *                                          keywords, markdown, invalid?, error? }
 *   POST /projects/:id/skills/import  -> import one custom skill from a `.md`
 *                                        file or a single-skill `.zip` into the
 *                                        project's overlay (`<projectRoot>/skills/`)
 *   DELETE /projects/:id/skills/:name -> remove one project-overlay skill
 *                                        (global defaults cannot be deleted)
 *
 * `projectId` is optional: when omitted only the global library is listed; when given,
 * the project overlay (`<projectRoot>/skills/`) shadows the global library by name.
 * All paths are traversal-guarded with isPathSafe against the global skills dir
 * (extra allowed root: the project's own skills dir).
 *
 * @example app.register(skillsRoutes, { deps: { projectStore, skillsRegistry } })
 ***/

import fs from "node:fs";
import path from "node:path";
import { isPathSafe } from "./files.js";
import { config as appConfig } from "../config.js";
import {
	SKILL_NAME_PATTERN,
	MAX_SKILL_MARKDOWN_CHARS,
	buildDescriptor,
} from "../skills/skillsRegistry.js";
import {
	normalizeMarkdownImport,
	normalizeZipImport,
	planInstall,
} from "../skills/skillImport.js";
import { parseZipEntries } from "../skills/zipEntries.js";

/***
 * MARK: resolveProjectForSkills
 * @description Resolves the optional project context for a skills request.
 *   Returns { project, error } — project is null (with an error message) when an
 *   explicit projectId does not exist.
 ***/
function resolveProjectForSkills(projectStore, projectId) {
	if (!projectId) return { project: null, error: null };
	const project = projectStore.getProject(projectId);
	if (!project) return { project: null, error: "Project not found" };
	return { project, error: null };
}

/***
 * MARK: overlaySkillsDir
 * @description The project-overlay skills dir (`<projectCwd>/skills/`),
 *   resolved absolutely so every import/delete join stays anchored.
 * @example overlaySkillsDir('/proj') => '/proj/skills'
 * @param {string} projectCwd
 * @returns {string}
 ***/
function overlaySkillsDir(projectCwd) {
	return path.join(path.resolve(projectCwd), "skills");
}

/***
 * MARK: declaredMimeMatches
 * @description MIME sanity check for skill uploads: the filename extension
 *   always wins, but an affirmatively contradictory declared Content-Type
 *   (e.g. `image/png` for a `.md`) is rejected instead of sniffed. Empty and
 *   generic (`application/octet-stream`) declarations are accepted — browsers
 *   and curl disagree on zip/markdown MIME labels too often to be strict.
 * @example declaredMimeMatches('guide.md', 'text/markdown') => true
 * @param {string} filename
 * @param {string} [mimetype]
 * @returns {boolean}
 ***/
export function declaredMimeMatches(filename, mimetype) {
	const declared = String(mimetype || "").toLowerCase();
	if (!declared || declared === "application/octet-stream") return true;
	const lower = String(filename || "").toLowerCase();
	if (lower.endsWith(".md")) return declared.startsWith("text/");
	if (lower.endsWith(".zip")) {
		return [
			"application/zip",
			"application/x-zip-compressed",
			"application/x-zip",
		].includes(declared);
	}
	return false;
}

/***
 * MARK: projectImportLocks
 * @description Serializes concurrent skill imports per project so two uploads
 *   racing on the same slug cannot interleave staging/rename steps. One
 *   promise chain per project id, pruned when the queue drains.
 ***/
const projectImportLocks = new Map();

/***
 * MARK: withProjectImportLock
 * @description Runs `task` after the previous import for this project settles
 *   (success or failure — the chain never wedges). Returns the task's result.
 * @example await withProjectImportLock('proj-1', () => installSkill(...))
 * @param {string} projectId
 * @param {Function} task - Async install work to serialize.
 * @returns {Promise<*>} The task's resolved value.
 ***/
function withProjectImportLock(projectId, task) {
	const key = String(projectId);
	const previous = projectImportLocks.get(key) || Promise.resolve();
	const result = previous.catch(() => {}).then(task);
	const settled = result.catch(() => {});
	projectImportLocks.set(key, settled);
	settled.finally(() => {
		if (projectImportLocks.get(key) === settled) projectImportLocks.delete(key);
	});
	return result;
}

/***
 * MARK: installSkillCandidate
 * @description Atomically installs one validated skill candidate into the
 *   project overlay: the candidate is staged under a dot-dir (invisible to
 *   registry scans), its markdown validated with `buildDescriptor` semantics,
 *   then renamed into place — an existing skill is first moved to a backup
 *   dir that is restored if the rename fails, so a crash never leaves a
 *   half-installed skill or silently loses the previous version. The
 *   KB_config is tolerant by design: invalid JSON installs anyway (flagged
 *   invalid at read time, never a 500).
 * @example installSkillCandidate('/proj/skills', { name: 'g', markdown: '...', configRaw: null })
 * @param {string} overlayDir - Absolute project overlay dir.
 * @param {Object} candidate - `{ name, markdown, configRaw }` (validated).
 * @returns {{ invalid: boolean, error: string|null }} The markdown validity verdict.
 ***/
export function installSkillCandidate(overlayDir, candidate) {
	/* eslint-disable security/detect-non-literal-fs-filename -- overlay dir + validated slug only */
	fs.mkdirSync(overlayDir, { recursive: true });
	const stagingRoot = fs.mkdtempSync(path.join(overlayDir, ".staging-"));
	try {
		const stagedDir = path.join(stagingRoot, candidate.name);
		fs.mkdirSync(stagedDir, { recursive: true });
		fs.writeFileSync(path.join(stagedDir, "SKILL.md"), candidate.markdown, "utf8");
		// Validate-before-write: the staged markdown must pass the registry's
		// own descriptor checks (name/description/caps) before anything moves.
		const verdict = buildDescriptor({
			name: candidate.name,
			skillsDir: stagingRoot,
			source: "project",
			markdown: candidate.markdown,
		});
		if (verdict.invalid) {
			return { invalid: true, error: verdict.error };
		}
		if (candidate.configRaw !== null && candidate.configRaw !== undefined) {
			fs.writeFileSync(
				path.join(stagedDir, "KB_config.json"),
				candidate.configRaw,
				"utf8",
			);
		}
		const targetDir = path.join(overlayDir, candidate.name);
		let backupDir = null;
		if (fs.existsSync(targetDir)) {
			backupDir = `${targetDir}.backup-${process.pid}-${Date.now()}`;
			fs.renameSync(targetDir, backupDir);
		}
		try {
			fs.renameSync(stagedDir, targetDir);
		} catch (err) {
			if (backupDir) fs.renameSync(backupDir, targetDir);
			throw err;
		}
		if (backupDir) {
			fs.rmSync(backupDir, { recursive: true, force: true });
		}
		return { invalid: false, error: null };
	} finally {
		fs.rmSync(stagingRoot, { recursive: true, force: true });
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: skillsRoutes
 * @description Registers the /skills read-only endpoints.
 * @param {Object} app - Fastify instance.
 * @param {Object} opts - Options including injected deps.
 * @param {Object} opts.deps - { projectStore, skillsRegistry }.
 ***/
export default async function skillsRoutes(app, { deps }) {
	const { projectStore, skillsRegistry } = deps;

	if (!skillsRegistry) {
		throw new Error("skillsRoutes requires a skillsRegistry dependency");
	}

	/***
	 * MARK: List Skills
	 * @description Lists available stage skills (global library + optional project overlay).
	 ***/
	app.get(
		"/skills",
		{
			schema: {
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				response: {
					200: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: true,
							properties: {
								name: { type: "string" },
								description: { type: "string" },
								source: { type: "string" },
								path: { type: "string" },
								hasConfig: { type: "boolean" },
								config: { type: "object", additionalProperties: true },
								keywords: { type: "object", additionalProperties: true },
								markdownChars: { type: "number" },
								invalid: { type: "boolean" },
								error: { type: ["string", "null"] },
							},
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const { project, error } = resolveProjectForSkills(
				projectStore,
				request.query?.projectId,
			);
			if (error) return reply.status(404).send({ error });

			const skills = skillsRegistry.listSkills({
				projectCwd: project?.cwd || null,
			});
			// The list endpoint never exposes raw markdown (payload size); preview
			// happens via GET /skills/:name.
			return skills.map((skill) => {
				const { body: _body, markdown: _markdown, ...rest } = skill;
				return rest;
			});
		},
	);

	/***
	 * MARK: Get Skill
	 * @description Returns one skill's full raw content (markdown + config) for preview.
	 ***/
	app.get(
		"/skills/:name",
		{
			schema: {
				params: { type: "object", properties: { name: { type: "string" } } },
				querystring: {
					type: "object",
					properties: { projectId: { type: "string" } },
				},
				response: {
					200: {
						type: "object",
						additionalProperties: true,
						properties: {
							name: { type: "string" },
							description: { type: "string" },
							source: { type: "string" },
							path: { type: "string" },
							hasConfig: { type: "boolean" },
							config: { type: "object", additionalProperties: true },
							keywords: { type: "object", additionalProperties: true },
							markdown: { type: "string" },
							invalid: { type: "boolean" },
							error: { type: ["string", "null"] },
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const name = request.params.name || "";
			const { project, error } = resolveProjectForSkills(
				projectStore,
				request.query?.projectId,
			);
			if (error) return reply.status(404).send({ error });

			// Traversal guard: the resolved SKILL.md must live inside the global
			// skills dir or the project's own skills overlay.
			const globalDir = path.resolve(skillsRegistry.skillsDir);
			const projectSkillsDir = project?.cwd
				? path.join(path.resolve(project.cwd), "skills")
				: null;
			const resolvedCandidate = projectSkillsDir
				? path.join(projectSkillsDir, name, "SKILL.md")
				: path.join(globalDir, name, "SKILL.md");
			if (!isPathSafe(globalDir, resolvedCandidate, [projectSkillsDir])) {
				return reply.status(404).send({ error: "Skill not found" });
			}

			const skill = skillsRegistry.getSkill(name, {
				projectCwd: project?.cwd || null,
			});
			if (!skill) return reply.status(404).send({ error: "Skill not found" });
			return skill;
		},
	);

	/***
	 * MARK: Import Skill
	 * @description Imports one custom skill into the project's overlay from an
	 *   uploaded `.md` file or single-skill `.zip` (multipart `file` field,
	 *   optional `name` slug override + `overwrite=true` text fields).
	 *   Validate-before-write: every normalization/plan check runs before any
	 *   filesystem write, so failures (400/409/413) leave the overlay
	 *   untouched. Success installs atomically, invalidates the registry
	 *   cache, and returns `201 { skills, warnings }`.
	 ***/
	app.post(
		"/projects/:id/skills/import",
		{
			schema: {
				params: { type: "object", properties: { id: { type: "string" } } },
				response: {
					201: {
						type: "object",
						properties: {
							skills: { type: "array", items: { type: "object", additionalProperties: true } },
							warnings: { type: "array", items: { type: "string" } },
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
					404: { type: "object", properties: { error: { type: "string" } } },
					409: {
						type: "object",
						properties: {
							error: { type: "string" },
							conflicts: { type: "array", items: { type: "string" } },
						},
					},
					413: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const { project, error } = resolveProjectForSkills(
				projectStore,
				request.params?.id,
			);
			if (error) return reply.status(404).send({ error });

			if (!request.isMultipart()) {
				return reply.status(400).send({
					error: "multipart/form-data request with a 'file' field (.md or .zip) is required",
				});
			}

			let upload = null;
			let explicitName;
			let overwrite = false;
			try {
				for await (const part of request.parts()) {
					if (part.type === "file") {
						if (part.fieldname !== "file") {
							return reply.status(400).send({
								error: `Unexpected file field '${part.fieldname}' (expected 'file')`,
							});
						}
						if (upload) {
							return reply.status(400).send({
								error: "Only one file can be imported at a time",
							});
						}
						// Consume the file stream DURING iteration: once the
						// loop advances, this part's stream is gone and a
						// later toBuffer() would hang forever.
						upload = {
							filename: part.filename,
							mimetype: part.mimetype,
							buffer: await part.toBuffer(),
						};
					} else if (part.fieldname === "name") {
						explicitName = String(part.value ?? "");
					} else if (part.fieldname === "overwrite") {
						overwrite = String(part.value ?? "").trim() === "true";
					}
				}
			} catch (err) {
				const tooLarge =
					err?.statusCode === 413 || err?.code === "FST_REQ_FILE_TOO_LARGE";
				return reply.status(tooLarge ? 413 : 400).send({
					error: tooLarge
						? `Upload exceeds the ${appConfig.skillImportMaxBytes} byte limit`
						: `Invalid multipart payload: ${err?.message || "unknown error"}`,
				});
			}
			if (!upload) {
				return reply
					.status(400)
					.send({ error: "A 'file' field (.md or .zip) is required" });
			}

			const filename = String(upload.filename || "").trim() || "upload";
			const lower = filename.toLowerCase();
			const kind = lower.endsWith(".md") ? "md" : lower.endsWith(".zip") ? "zip" : null;
			if (!kind) {
				return reply.status(400).send({
					error: `Only .md and .zip files can be imported (got '${filename}')`,
				});
			}
			if (!declaredMimeMatches(filename, upload.mimetype)) {
				return reply.status(400).send({
					error: `Declared type '${upload.mimetype}' does not match '${filename}'`,
				});
			}

			const buffer = upload.buffer;
			if (buffer.length > appConfig.skillImportMaxBytes) {
				return reply.status(413).send({
					error: `Upload is ${buffer.length} bytes (max ${appConfig.skillImportMaxBytes})`,
				});
			}

			// Normalize (pure — no writes): markdown directly, zips via the
			// capped entry adapter.
			let skills;
			let errors;
			if (kind === "md") {
				const normalized = normalizeMarkdownImport(buffer, filename, {
					explicitName,
				});
				if (normalized.error) {
					return reply.status(400).send({ error: normalized.error });
				}
				skills = [
					{
						name: normalized.name,
						markdown: normalized.markdown,
						description: normalized.description,
						configRaw: null,
						warnings: normalized.warnings,
					},
				];
				errors = [];
			} else {
				const parsed = parseZipEntries(buffer, {
					maxEntries: appConfig.skillImportZipMaxEntries,
					maxFileBytes: MAX_SKILL_MARKDOWN_CHARS,
					maxTotalBytes: appConfig.skillImportZipMaxBytes,
				});
				if (parsed.error) {
					return reply.status(400).send({ error: parsed.error });
				}
				({ skills, errors } = normalizeZipImport(parsed.entries, filename, {
					explicitName,
				}));
				if (errors.length > 0) {
					return reply.status(400).send({ error: errors.join("; ") });
				}
			}

			const installed = await withProjectImportLock(project.id, async () => {
				// Names are read INSIDE the lock so two racing imports cannot
				// both pass the 409 check for the same slug.
				const current = skillsRegistry.listSkills({ projectCwd: project.cwd });
				const plan = planInstall({
					skills,
					errors: [],
					existingNames: current
						.filter((skill) => skill.source === "project")
						.map((skill) => skill.name),
					globalNames: current
						.filter((skill) => skill.source === "global")
						.map((skill) => skill.name),
					overwrite,
				});
				if (!plan.ok) {
					return { status: plan.conflicts.length > 0 ? 409 : 400, plan };
				}
				const overlayDir = overlaySkillsDir(project.cwd);
				for (const candidate of plan.skills) {
					const verdict = installSkillCandidate(overlayDir, candidate);
					if (verdict.invalid) {
						return {
							status: 400,
							plan: { ...plan, ok: false, errors: [verdict.error] },
						};
					}
				}
				skillsRegistry.invalidate();
				return { status: 201, plan };
			});

			if (installed.status !== 201) {
				const body = { error: installed.plan.errors.join("; ") };
				if (installed.status === 409) body.conflicts = installed.plan.conflicts;
				return reply.status(installed.status).send(body);
			}

			// Fresh descriptors (post-invalidation), list-shaped (no raw markdown).
			const descriptors = installed.plan.skills.map((skill) => {
				const fresh = skillsRegistry.getSkill(skill.name, {
					projectCwd: project.cwd,
				});
				if (!fresh) return { name: skill.name, source: "project" };
				const { body: _body, markdown: _markdown, ...rest } = fresh;
				return rest;
			});
			return reply.status(201).send({
				skills: descriptors,
				warnings: installed.plan.skills.flatMap((skill) => skill.warnings),
			});
		},
	);

	/***
	 * MARK: Delete Skill
	 * @description Removes one project-overlay skill (`<projectCwd>/skills/<name>/`).
	 *   Global defaults are read-only: deleting a global-only name is a
	 *   descriptive 404, and traversal/non-slug names never resolve outside
	 *   the overlay. Invalidates the registry cache on success.
	 ***/
	app.delete(
		"/projects/:id/skills/:name",
		{
			schema: {
				params: {
					type: "object",
					properties: { id: { type: "string" }, name: { type: "string" } },
				},
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							name: { type: "string" },
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const { project, error } = resolveProjectForSkills(
				projectStore,
				request.params?.id,
			);
			if (error) return reply.status(404).send({ error });

			const name = String(request.params?.name || "");
			if (!SKILL_NAME_PATTERN.test(name)) {
				return reply.status(404).send({ error: "Skill not found" });
			}
			const overlayDir = overlaySkillsDir(project.cwd);
			const targetDir = path.join(overlayDir, name);
			if (!isPathSafe(overlayDir, targetDir, [overlayDir])) {
				return reply.status(404).send({ error: "Skill not found" });
			}
			/* eslint-disable security/detect-non-literal-fs-filename -- overlay dir + validated slug only */
			const skillFile = path.join(targetDir, "SKILL.md");
			const overlayHasSkill =
				fs.existsSync(skillFile) && fs.statSync(skillFile).isFile();
			/* eslint-enable security/detect-non-literal-fs-filename */
			if (!overlayHasSkill) {
				const globalOnly = skillsRegistry
					.listSkills({ projectCwd: project.cwd })
					.some((skill) => skill.name === name && skill.source === "global");
				return reply.status(404).send({
					error: globalOnly
						? `Skill '${name}' is a KainBain default and cannot be deleted (project-local skills only)`
						: "Skill not found",
				});
			}
			fs.rmSync(targetDir, { recursive: true, force: true });
			skillsRegistry.invalidate();
			return { status: "deleted", name };
		},
	);
}
