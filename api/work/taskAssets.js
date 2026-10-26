// Domain: The Work — image assets stored beside task.md in each task folder.
// Images live in `<projectRoot>/docs/tasks/<taskId>/assets/` and are referenced
// from task markdown with relative paths (`![alt](assets/foo.png)`), never
// base64-embedded.
import path from "node:path";
import fs from "node:fs";
import { resolveTasksDir } from "../docsPath.js";

/** Allowed image file extensions (lowercase, without the dot). */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

/** Content-Type served for each allowed image extension. */
const IMAGE_MEDIA_TYPES = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

/** Maximum sanitized filename length (including extension). */
const MAX_IMAGE_NAME_LENGTH = 120;

/***
 * MARK: isAllowedImageExt
 * @description Whether a filename carries an allowed image extension (png/jpg/jpeg/gif/webp), case-insensitive.
 * @example isAllowedImageExt('photo.PNG') => true
 * @example isAllowedImageExt('payload.svg') => false
 * @param {string} filename
 * @returns {boolean}
 ***/
export function isAllowedImageExt(filename) {
	const ext = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
	return IMAGE_EXTENSIONS.includes(ext);
}

/***
 * MARK: imageMediaType
 * @description The Content-Type for an allowed image filename, or null when the extension is not an allowed image type.
 * @example imageMediaType('photo.jpeg') => 'image/jpeg'
 * @param {string} filename
 * @returns {string|null}
 ***/
export function imageMediaType(filename) {
	const ext = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
	return IMAGE_MEDIA_TYPES[ext] || null;
}

/***
 * MARK: sanitizeImageName
 * @description Reduces an uploaded filename to a safe, flat asset name: directory
 *   components (and any traversal payloads like `../../etc/passwd`) are stripped to
 *   the final segment, unsafe characters collapse to `-`, leading dots/separators are
 *   trimmed, and the result is lowercased and length-capped. Returns "" when nothing
 *   safe remains. Callers combine this with `isAllowedImageExt` before writing.
 * @example sanitizeImageName('../../etc/passwd.png') => 'passwd.png'
 * @example sanitizeImageName('My Screenshot (1).PNG') => 'my-screenshot-1-.png'
 * @example sanitizeImageName('..') => ''
 * @param {string} rawName
 * @returns {string}
 ***/
export function sanitizeImageName(rawName) {
	if (!rawName || typeof rawName !== "string") return "";
	// Normalize separators and keep only the final path segment: any traversal
	// payload (`../`, `..\`, absolute paths) collapses to the bare filename.
	const base = String(rawName).replace(/\\/g, "/").split("/").pop() || "";
	let name = base
		.normalize("NFKD")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.toLowerCase();
	// Split stem/extension so trimming and the length cap never eat the extension.
	// A degenerate trailing dot ("trailing..") is not an extension: it must trim.
	const rawExt = path.extname(name);
	const ext = /^\.[A-Za-z0-9]+$/.test(rawExt) ? rawExt.toLowerCase() : "";
	let stem = ext ? name.slice(0, name.length - rawExt.length) : name;
	stem = stem
		.replace(/-{2,}/g, "-")
		.replace(/^[.-]+/, "")
		.replace(/[.-]+$/g, "");
	name = `${stem}${ext.toLowerCase()}`;
	if (name.length > MAX_IMAGE_NAME_LENGTH) {
		name = `${stem.slice(0, MAX_IMAGE_NAME_LENGTH - ext.length)}${ext.toLowerCase()}`;
	}
	return name;
}

/***
 * MARK: dedupeImageName
 * @description Returns a name that does not collide with the taken names: `foo.png`
 *   becomes `foo-2.png`, `foo-3.png`, … so an upload never overwrites an existing asset.
 * @example dedupeImageName(['a.png'], 'a.png') => 'a-2.png'
 * @param {string[]} existingNames
 * @param {string} name
 * @returns {string}
 ***/
export function dedupeImageName(existingNames, name) {
	const taken = new Set((existingNames || []).map((n) => String(n).toLowerCase()));
	if (!taken.has(name.toLowerCase())) return name;
	const ext = path.extname(name);
	const stem = name.slice(0, name.length - ext.length) || "image";
	for (let n = 2; ; n += 1) {
		const candidate = `${stem}-${n}${ext}`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
}

/***
 * MARK: taskAssetDir
 * @description The absolute assets directory for one task: `<projectCwd>/<docsDirName>/tasks/<taskId>/assets`.
 *   The taskId is verified against traversal: the resolved folder must keep the
 *   requested taskId as its final segment. `docsDirName` is the project's
 *   custom link-folder name (or project record); absent means the `docs` default.
 * @example taskAssetDir('/repo', 'task-1') => '/repo/docs/tasks/task-1/assets'
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {string|null} Absolute path, or null when the taskId escapes the tasks root.
 ***/
export function taskAssetDir(projectCwd, taskId, docsProject) {
	if (!projectCwd || !taskId || typeof taskId !== "string") return null;
	const project =
		typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject;
	const tasksRoot = resolveTasksDir(projectCwd, project) || path.resolve(projectCwd, "docs", "tasks");
	const taskFolder = path.resolve(tasksRoot, taskId);
	if (path.basename(taskFolder) !== taskId) return null;
	if (path.relative(tasksRoot, taskFolder).startsWith("..")) return null;
	return path.join(taskFolder, "assets");
}

/***
 * MARK: resolveTaskAssetFile
 * @description The absolute file path for one sanitized asset name inside a task's
 *   assets directory, or null when the name is unsafe. The name MUST already be
 *   sanitized (flat, no directories) — traversal is impossible by construction.
 * @example resolveTaskAssetFile('/repo', 'task-1', 'a.png') => '/repo/docs/tasks/task-1/assets/a.png'
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @returns {string|null}
 ***/
export function resolveTaskAssetFile(projectCwd, taskId, name, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name) return null;
	const safeName = sanitizeImageName(name);
	if (!safeName || safeName !== name) return null;
	return path.join(assetsDir, safeName);
}

/***
 * MARK: taskAssetRelPath
 * @description The markdown-reference form for an asset name (what `![alt](…)` carries).
 * @example taskAssetRelPath('a.png') => 'assets/a.png'
 * @param {string} name
 * @returns {string}
 ***/
export function taskAssetRelPath(name) {
	return `assets/${name}`;
}

/***
 * MARK: listTaskImages
 * @description Lists the image assets stored in a task's assets directory, sorted by
 *   name. Missing directories yield an empty list (a task without images is normal).
 * @example listTaskImages('/repo', 'task-1') => [{ name: 'a.png', path: 'assets/a.png', size: 512, mtime: '...', mediaType: 'image/png' }]
 * @param {string} projectCwd
 * @param {string} taskId
 * @returns {Array<{name: string, path: string, size: number, mtime: string, mediaType: string|null}>}
 ***/
export function listTaskImages(projectCwd, taskId, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return [];
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(assetsDir)) return [];
		return fs
			.readdirSync(assetsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && isAllowedImageExt(entry.name))
			.map((entry) => {
				let size = 0;
				let mtime = "";
				try {
					const stat = fs.statSync(path.join(assetsDir, entry.name));
					size = stat.size;
					mtime = stat.mtime.toISOString();
				} catch {
					// Unreadable entry: keep it listed with empty stats.
				}
				return {
					name: entry.name,
					path: taskAssetRelPath(entry.name),
					size,
					mtime,
					mediaType: imageMediaType(entry.name),
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: collectTaskImageRefs
 * @description The capped list of relative image references for prompt injection:
 *   `assets/<name>` strings, at most `maxRefs` of them (overflow is the caller's concern).
 * @example collectTaskImageRefs('/repo', 'task-1', 10) => ['assets/a.png', 'assets/b.png']
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {number} [maxRefs=10]
 * @returns {string[]}
 ***/
export function collectTaskImageRefs(projectCwd, taskId, maxRefs = 10, docsProject) {
	const cap = Number.isFinite(maxRefs) && maxRefs > 0 ? Math.floor(maxRefs) : 10;
	return listTaskImages(projectCwd, taskId, docsProject)
		.slice(0, cap)
		.map((image) => image.path);
}

/***
 * MARK: writeTaskImage
 * @description Writes an image buffer into a task's assets directory (creating it when
 *   needed). The name must already be sanitized and extension-allowed — callers own that
 *   check. Returns the relative markdown-reference path.
 * @example writeTaskImage('/repo', 'task-1', 'a.png', buffer) => 'assets/a.png'
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @param {Buffer} buffer
 * @returns {string} Relative asset path (`assets/<name>`).
 ***/
export function writeTaskImage(projectCwd, taskId, name, buffer, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name || !Buffer.isBuffer(buffer)) {
		throw new Error("Invalid task image write");
	}
	/* eslint-disable security/detect-non-literal-fs-filename */
	fs.mkdirSync(assetsDir, { recursive: true });
	fs.writeFileSync(path.join(assetsDir, name), buffer);
	/* eslint-enable security/detect-non-literal-fs-filename */
	return taskAssetRelPath(name);
}

/***
 * MARK: deleteTaskImage
 * @description Removes one image asset from a task's assets directory. Returns whether a file was actually removed.
 * @example deleteTaskImage('/repo', 'task-1', 'a.png') => true
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @returns {boolean}
 ***/
export function deleteTaskImage(projectCwd, taskId, name, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name) return false;
	const safeName = sanitizeImageName(name);
	if (!safeName) return false;
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		const target = path.join(assetsDir, safeName);
		if (!fs.existsSync(target)) return false;
		fs.rmSync(target, { force: true });
		return true;
	} catch {
		return false;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}