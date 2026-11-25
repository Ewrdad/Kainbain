// Domain: The Work — image assets stored beside task.md in each task folder.
// Images live in `<projectRoot>/docs/tasks/<taskId>/assets/` and are referenced
// from task markdown with relative paths (`![alt](assets/foo.png)`), never
// base64-embedded.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { resolveDocsDirName, resolveTasksDir } from "../docsPath.js";
import {
	extractAssetRefs,
	normalizeAssetSrc,
} from "../../shared/taskAssetRefs/index.js";

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

/***
 * MARK: ATTACHMENT_EXTENSIONS
 * @description Every file extension the generalized attachment pipeline
 *   accepts (lowercase, without the dot): the five viewable images plus
 *   text/log/data files, documents, archives, audio/video, and web files
 *   that are always served as downloads (never rendered inline). A strict
 *   superset of `IMAGE_EXTENSIONS` — executables and scripts stay rejected.
 * @example ATTACHMENT_EXTENSIONS.includes('log') => true
 * @example ATTACHMENT_EXTENSIONS.includes('sh') => false
 ***/
export const ATTACHMENT_EXTENSIONS = [
	...IMAGE_EXTENSIONS,
	"txt",
	"text",
	"md",
	"markdown",
	"log",
	"json",
	"jsonl",
	"csv",
	"tsv",
	"yaml",
	"yml",
	"diff",
	"patch",
	"xml",
	"pdf",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"odt",
	"ods",
	"odp",
	"rtf",
	"zip",
	"tar",
	"gz",
	"tgz",
	"mp4",
	"mov",
	"webm",
	"mp3",
	"wav",
	"ogg",
	"m4a",
	"html",
	"htm",
	"svg",
	"xhtml",
];

/** Content-Type served for each allowed non-image attachment extension. */
const ATTACHMENT_MEDIA_TYPES = {
	txt: "text/plain",
	text: "text/plain",
	md: "text/markdown",
	markdown: "text/markdown",
	log: "text/plain",
	json: "application/json",
	jsonl: "text/plain",
	csv: "text/csv",
	tsv: "text/tab-separated-values",
	yaml: "text/yaml",
	yml: "text/yaml",
	diff: "text/plain",
	patch: "text/plain",
	xml: "application/xml",
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	odt: "application/vnd.oasis.opendocument.text",
	ods: "application/vnd.oasis.opendocument.spreadsheet",
	odp: "application/vnd.oasis.opendocument.presentation",
	rtf: "application/rtf",
	zip: "application/zip",
	tar: "application/x-tar",
	gz: "application/gzip",
	tgz: "application/gzip",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	m4a: "audio/mp4",
	html: "text/html",
	htm: "text/html",
	svg: "image/svg+xml",
	xhtml: "application/xhtml+xml",
};

/***
 * MARK: INLINE_ATTACHMENT_EXTENSIONS
 * @description Allowed attachment extensions served `inline` (browser preview):
 *   the viewable images plus plain-text-ish files and PDF. Every other
 *   allowed type — office docs, archives, media, and always html/svg — is
 *   served as a `Content-Disposition: attachment` download, so attacker-
 *   controlled markup can never render in the app's origin.
 * @example INLINE_ATTACHMENT_EXTENSIONS.includes('pdf') => true
 * @example INLINE_ATTACHMENT_EXTENSIONS.includes('svg') => false
 ***/
export const INLINE_ATTACHMENT_EXTENSIONS = [
	...IMAGE_EXTENSIONS,
	"txt",
	"text",
	"md",
	"markdown",
	"log",
	"json",
	"jsonl",
	"csv",
	"tsv",
	"yaml",
	"yml",
	"diff",
	"patch",
	"pdf",
];

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
 * MARK: isAllowedAttachmentExt
 * @description Whether a filename carries an allowed attachment extension
 *   (the image five plus text/log/data, documents, archives, media, and
 *   download-only web files), case-insensitive. A strict superset of
 *   `isAllowedImageExt`: every image passes, and executables still fail.
 * @example isAllowedAttachmentExt('server.LOG') => true
 * @example isAllowedAttachmentExt('payload.svg') => true
 * @example isAllowedAttachmentExt('run.sh') => false
 * @param {string} filename
 * @returns {boolean}
 ***/
export function isAllowedAttachmentExt(filename) {
	const ext = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
	return ATTACHMENT_EXTENSIONS.includes(ext);
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
 * MARK: attachmentMediaType
 * @description The Content-Type for an allowed attachment filename (images
 *   plus every generalized type), or null when the extension is not an
 *   allowed attachment type. Image results match `imageMediaType` exactly.
 * @example attachmentMediaType('server.log') => 'text/plain'
 * @example attachmentMediaType('run.sh') => null
 * @param {string} filename
 * @returns {string|null}
 ***/
export function attachmentMediaType(filename) {
	const ext = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
	return IMAGE_MEDIA_TYPES[ext] || ATTACHMENT_MEDIA_TYPES[ext] || null;
}

/***
 * MARK: attachmentKind
 * @description The listing kind for an attachment filename: `image` for the
 *   viewable five, `file` for every other allowed attachment type, null
 *   when the extension is not allowed at all. Drives thumbnails-vs-download
 *   rendering in the UI.
 * @example attachmentKind('shot.png') => 'image'
 * @example attachmentKind('server.log') => 'file'
 * @example attachmentKind('run.sh') => null
 * @param {string} filename
 * @returns {string|null}
 ***/
export function attachmentKind(filename) {
	if (isAllowedImageExt(filename)) return "image";
	if (isAllowedAttachmentExt(filename)) return "file";
	return null;
}

/***
 * MARK: attachmentServeHeaders
 * @description The safe serving headers for one stored attachment name: its
 *   Content-Type plus the disposition from the serving matrix (`inline`
 *   for viewable images, text-ish files, and PDF; `attachment` download
 *   for everything else — office docs, archives, media, and always
 *   html/svg — so user markup never renders in the app's origin). Null
 *   when the extension is not an allowed attachment type.
 * @example attachmentServeHeaders('shot.png') => { mediaType: 'image/png', disposition: 'inline' }
 * @example attachmentServeHeaders('page.html') => { mediaType: 'text/html', disposition: 'attachment' }
 * @param {string} filename
 * @returns {{mediaType: string, disposition: string}|null}
 ***/
export function attachmentServeHeaders(filename) {
	const mediaType = attachmentMediaType(filename);
	if (!mediaType) return null;
	const ext = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
	return {
		mediaType,
		disposition: INLINE_ATTACHMENT_EXTENSIONS.includes(ext) ? "inline" : "attachment",
	};
}

/***
 * MARK: sanitizeImageName
 * @description Reduces an uploaded filename to a safe, flat asset name: directory
 *   components (and any traversal payloads like `../../etc/passwd`) are stripped to
 *   the final segment, unsafe characters collapse to `-`, leading dots/separators are
 *   trimmed, and the result is lowercased and length-capped. Returns "" when nothing
 *   safe remains. Callers combine this with `isAllowedImageExt` before writing.
 * @example sanitizeImageName('../../etc/passwd.png') => 'passwd.png'
 * @example sanitizeImageName('My Screenshot (1).PNG') => 'my-screenshot-1.png'
 * @example sanitizeImageName('..') => ''
 * @param {string} rawName
 * @returns {string}
 ***/
export function sanitizeImageName(rawName) {
	return sanitizeAttachmentName(rawName);
}

/***
 * MARK: sanitizeAttachmentName
 * @description Reduces an uploaded filename to a safe, flat asset name: directory
 *   components (and any traversal payloads like `../../etc/passwd`) are stripped to
 *   the final segment, unsafe characters collapse to `-`, leading dots/separators are
 *   trimmed, and the result is lowercased and length-capped. Returns "" when nothing
 *   safe remains. Callers combine this with `isAllowedAttachmentExt` before writing.
 *   `sanitizeImageName` delegates here, so image sanitizing is byte-identical.
 * @example sanitizeAttachmentName('../../tmp/server.LOG') => 'server.log'
 * @example sanitizeAttachmentName('My Screenshot (1).PNG') => 'my-screenshot-1.png'
 * @example sanitizeAttachmentName('..') => ''
 * @param {string} rawName
 * @returns {string}
 ***/
export function sanitizeAttachmentName(rawName) {
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
	return dedupeAttachmentName(existingNames, name);
}

/***
 * MARK: dedupeAttachmentName
 * @description Returns a name that does not collide with the taken names: `foo.log`
 *   becomes `foo-2.log`, `foo-3.log`, … so an ingest never overwrites an existing asset.
 *   `dedupeImageName` delegates here, so image deduping is byte-identical.
 * @example dedupeAttachmentName(['a.log'], 'a.log') => 'a-2.log'
 * @param {string[]} existingNames
 * @param {string} name
 * @returns {string}
 ***/
export function dedupeAttachmentName(existingNames, name) {
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
	const safeName = sanitizeAttachmentName(name);
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
	// Image shape stays byte-identical (no `kind` key): the generalized
	// lister is filtered back down to the historical image entries.
	return listTaskAttachments(projectCwd, taskId, docsProject)
		.filter((entry) => entry.kind === "image")
		.map(({ kind, ...image }) => image);
}

/***
 * MARK: listTaskAttachments
 * @description Lists every attachment stored in a task's assets directory
 *   (images plus all generalized types), sorted by name. Each entry carries
 *   a `kind` (`image` for the viewable five, `file` otherwise) so callers
 *   can render thumbnails vs download chips. Missing directories yield an
 *   empty list (a task without attachments is normal).
 * @example listTaskAttachments('/repo', 'task-1') => [{ name: 'a.png', path: 'assets/a.png', size: 512, mtime: '...', mediaType: 'image/png', kind: 'image' }]
 * @param {string} projectCwd
 * @param {string} taskId
 * @returns {Array<{name: string, path: string, size: number, mtime: string, mediaType: string|null, kind: string}>}
 ***/
export function listTaskAttachments(projectCwd, taskId, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return [];
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(assetsDir)) return [];
		return fs
			.readdirSync(assetsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && isAllowedAttachmentExt(entry.name))
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
					mediaType: attachmentMediaType(entry.name),
					kind: attachmentKind(entry.name),
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
	return writeTaskAttachment(projectCwd, taskId, name, buffer, docsProject);
}

/***
 * MARK: writeTaskAttachment
 * @description Writes an attachment buffer into a task's assets directory (creating it when
 *   needed). The name must already be sanitized and extension-allowed — callers own that
 *   check. Returns the relative markdown-reference path. `writeTaskImage`
 *   delegates here after its own validation, so image writes are byte-identical.
 * @example writeTaskAttachment('/repo', 'task-1', 'out.log', buffer) => 'assets/out.log'
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @param {Buffer} buffer
 * @returns {string} Relative asset path (`assets/<name>`).
 ***/
export function writeTaskAttachment(projectCwd, taskId, name, buffer, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name || !Buffer.isBuffer(buffer)) {
		throw new Error("Invalid task attachment write");
	}
	/* eslint-disable security/detect-non-literal-fs-filename */
	fs.mkdirSync(assetsDir, { recursive: true });
	fs.writeFileSync(path.join(assetsDir, name), buffer);
	/* eslint-enable security/detect-non-literal-fs-filename */
	return taskAssetRelPath(name);
}

/***
 * MARK: resolveAssetRef
 * @description Resolves one markdown asset destination against a task's
 *   assets directory: literal filename match first, then the serve routes'
 *   canonicalisation (an on-disk attachment whose `sanitizeAttachmentName`
 *   equals the ref's), so drifted-but-servable refs never warn. Non-asset input
 *   (absolute/protocol URLs, non-asset paths) reads as null — never
 *   missing — so callers can only warn on genuine asset refs. Never throws:
 *   absent/unreadable directories and unusable locations read as missing.
 *   The ref is compared against directory entries, never joined into a
 *   path, so traversal is impossible by construction.
 * @example resolveAssetRef('/repo', 'task-1', 'assets/a.png') => { ref: 'assets/a.png', name: 'a.png', present: true }
 * @example resolveAssetRef('/repo', 'task-1', 'https://x/y.png') => null
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} ref - Markdown destination (prefixes/titles tolerated).
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {{ref: string, name: string, present: boolean}|null} Resolution, or null for non-asset input.
 ***/
export function resolveAssetRef(projectCwd, taskId, ref, docsProject) {
	const normalized = normalizeAssetSrc(ref);
	if (!normalized) return null;
	const name = normalized.slice("assets/".length);
	const outcome = { ref: normalized, name, present: false };
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return outcome;
	/* eslint-disable security/detect-non-literal-fs-filename */
	let files;
	try {
		files = fs
			.readdirSync(assetsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);
	} catch {
		return outcome;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	// Detection is extension-agnostic: any literally present file counts,
	// even a hand-placed file the upload endpoints would never store.
	if (files.includes(name)) return { ...outcome, present: true };
	// Serve parity (routes/taskImages.js + routes/taskAttachments.js): the
	// canonical fallback covers every allowed attachment extension — the
	// routes resolve a drifted-but-servable ref to its on-disk asset
	// instead of 404ing a file that is actually present nearby.
	const canonical = sanitizeAttachmentName(name);
	if (!canonical || !isAllowedAttachmentExt(canonical)) return outcome;
	const served = files.some(
		(entry) =>
			isAllowedAttachmentExt(entry) && sanitizeAttachmentName(entry) === canonical,
	);
	return { ...outcome, present: served };
}

/***
 * MARK: findMissingAssetRefs
 * @description The dangling asset refs in one markdown text: every
 *   `assets/<name>` destination with no bytes in the task's assets folder,
 *   each with the exact ref and the task-folder path where it was expected.
 *   Unverifiable locations (no project checkout or task id) yield [] rather
 *   than false warnings. Never throws.
 * @example findMissingAssetRefs('/repo', 'task-1', '![a](assets/gone.png)') => [{ ref: 'assets/gone.png', name: 'gone.png', expectedPath: 'docs/tasks/task-1/assets/gone.png' }]
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} markdown - Text to scan (goal plus failure/feedback text).
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {Array<{ref: string, name: string, expectedPath: string}>} Missing refs (possibly empty).
 ***/
export function findMissingAssetRefs(projectCwd, taskId, markdown, docsProject) {
	if (!projectCwd || !taskId || typeof taskId !== "string") return [];
	const refs = extractAssetRefs(markdown);
	if (refs.length === 0) return [];
	const project =
		typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject;
	const docsName = resolveDocsDirName(project);
	const missing = [];
	for (const ref of refs) {
		const resolved = resolveAssetRef(projectCwd, taskId, ref, docsProject);
		if (resolved && !resolved.present) {
			missing.push({
				ref,
				name: resolved.name,
				expectedPath: `${docsName}/tasks/${taskId}/assets/${resolved.name}`,
			});
		}
	}
	return missing;
}

/***
 * MARK: filterBranchBackedRefs
 * @description Drops missing-asset entries whose bytes sit on the task's own
 *   branch: the engine checks out task branches in the shared project
 *   checkout, and image assets are tracked files, so whatever branch is out
 *   decides which tasks' images exist on disk at curate time. Without this
 *   second look a task curated while a sibling branch is out would warn
 *   even though the agent's worktree (on the task branch) has the bytes.
 *   One `git ls-tree` call lists the branch's asset names; literal and
 *   sanitized-attachment matches both count (the same two tiers as
 *   `resolveAssetRef`). Never throws and never invents presence: bad
 *   input, an invalid branch name, a missing git/repo/branch, and timeouts
 *   all return the input unchanged (warnings kept).
 * @example filterBranchBackedRefs('/repo', 'kb/task-1', 'task-1', [{ ref: 'assets/a.png', name: 'a.png', expectedPath: 'docs/tasks/task-1/assets/a.png' }]) => [] (when a.png rides the branch)
 * @param {string} projectCwd - Checkout root to run git in.
 * @param {string} branch - Task branch name (e.g. `kb/<taskId>`).
 * @param {string} taskId
 * @param {Array} missing - `{ ref, name, expectedPath }` entries from `findMissingAssetRefs`.
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {Array} The entries with no bytes on the branch either.
 ***/
export function filterBranchBackedRefs(projectCwd, branch, taskId, missing, docsProject) {
	if (!projectCwd || !taskId || !Array.isArray(missing) || missing.length === 0) {
		return missing;
	}
	// Conservative branch shape (no shell is ever involved — argv only —
	// but a weird ref must still read as "unknown", never as present).
	if (
		typeof branch !== "string" ||
		branch.length === 0 ||
		branch.length > 250 ||
		branch.startsWith("-") ||
		branch.startsWith("/") ||
		branch.includes("..") ||
		branch.includes("@{") ||
		!/^[A-Za-z0-9._/-]+$/.test(branch)
	) {
		return missing;
	}
	const project =
		typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject;
	const assetsRel = `${resolveDocsDirName(project)}/tasks/${taskId}/assets`;
	let names;
	try {
		const out = execFileSync(
			"git",
			["-C", projectCwd, "ls-tree", "-r", "--name-only", "-z", branch, "--", assetsRel],
			{ timeout: 5000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
		names = String(out || "")
			.split(String.fromCharCode(0))
			.map((line) => line.split("/").pop())
			.filter(Boolean);
	} catch {
		return missing;
	}
	return missing.filter((entry) => {
		const name = entry?.name;
		if (!name || typeof name !== "string") return true;
		if (names.includes(name)) return false;
		const canonical = sanitizeAttachmentName(name);
		if (!canonical || !isAllowedAttachmentExt(canonical)) return true;
		return !names.some(
			(onBranch) =>
				isAllowedAttachmentExt(onBranch) && sanitizeAttachmentName(onBranch) === canonical,
		);
	});
}

/***
 * MARK: formatMissingAssetWarning
 * @description Formats the MISSING-ASSET prompt block: one line per missing
 *   file with the exact ref and its expected task-folder path, plus the
 *   fail-fast instruction (image-only blocks keep the historical visual-
 *   content wording; blocks naming other attachments use the generic
 *   file wording). Empty input yields ""
 *   (no section at all, so healthy tasks keep byte-identical prompts).
 * @example formatMissingAssetWarning([]) => ''
 * @example formatMissingAssetWarning([{ ref: 'assets/a.png', name: 'a.png', expectedPath: 'docs/tasks/t1/assets/a.png' }]) => '# Missing Task Assets\n...' (multi-line block)
 * @param {Array} [missing] - `{ ref, name, expectedPath }` entries from `findMissingAssetRefs`.
 * @returns {string} The warning block, or "" when nothing is missing.
 ***/
export function formatMissingAssetWarning(missing) {
	const entries = (Array.isArray(missing) ? missing : []).filter(
		(entry) => entry && entry.ref,
	);
	if (entries.length === 0) return "";
	const lines = entries.map((entry) => {
		const where = entry.expectedPath
			? ` — expected at \`${entry.expectedPath}\``
			: "";
		return `- \`${entry.ref}\`${where}`;
	});
	const count =
		entries.length === 1
			? "a file that is"
			: `${entries.length} files that are`;
	// Image-only warnings keep the historical visual-content instruction
	// byte-identical; a block naming non-image attachments uses the generic
	// instruction instead (a missing log is not a screenshot).
	const allImages = entries.every(
		(entry) => typeof entry?.name === "string" && isAllowedImageExt(entry.name),
	);
	const instruction = allImages
		? "Do not guess at their visual content. Proceed from source, say the screenshot was unavailable, and continue working — re-uploading the file heals the next run automatically."
		: "Do not guess at their content. Proceed from source, say the file was unavailable, and continue working — re-uploading the file heals the next run automatically.";
	return [
		"# Missing Task Assets",
		`MISSING-ASSET: the task references ${count} not in its assets folder:`,
		...lines,
		instruction,
	].join("\n");
}

/***
 * MARK: collectTaskAssetPayload
 * @description The task's on-disk attachments as base64 shipment entries for
 *   Runner claims (`[{ name, size, contentBase64 }]`), images first (vision
 *   priority) then by name for a deterministic payload. Images-only tasks
 *   ship exactly as before; unreadable files, files over `maxFileBytes`,
 *   and additions past `maxTotalBytes` are skipped. Never throws: missing
 *   tasks yield [].
 * @example collectTaskAssetPayload('/repo', 'task-1') => [{ name: 'a.png', size: 12, contentBase64: '...' }]
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @param {Object} [opts]
 * @param {number} [opts.maxFileBytes] - Per-file cap (default 10 MiB, mirroring `taskAttachmentMaxBytes`).
 * @param {number} [opts.maxTotalBytes] - Payload cap (default 10 MiB, mirroring `taskAttachmentMaxAttachBytes`).
 * @returns {Array<{name: string, size: number, contentBase64: string}>} Shipment entries.
 ***/
export function collectTaskAssetPayload(
	projectCwd,
	taskId,
	docsProject,
	{ maxFileBytes, maxTotalBytes } = {},
) {
	const perFile =
		Number.isFinite(maxFileBytes) && maxFileBytes > 0
			? Math.floor(maxFileBytes)
			: 10 * 1024 * 1024;
	const total =
		Number.isFinite(maxTotalBytes) && maxTotalBytes > 0
			? Math.floor(maxTotalBytes)
			: 10 * 1024 * 1024;
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return [];
	/* eslint-disable security/detect-non-literal-fs-filename */
	let names;
	try {
		names = fs
			.readdirSync(assetsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && isAllowedAttachmentExt(entry.name))
			.map((entry) => entry.name)
			.sort((a, b) => {
				const aImage = isAllowedImageExt(a) ? 0 : 1;
				const bImage = isAllowedImageExt(b) ? 0 : 1;
				if (aImage !== bImage) return aImage - bImage;
				return a.localeCompare(b);
			});
	} catch {
		return [];
	}
	const payload = [];
	let bytes = 0;
	for (const name of names) {
		let buffer;
		try {
			buffer = fs.readFileSync(path.join(assetsDir, name));
		} catch {
			continue;
		}
		if (buffer.length > perFile) continue;
		if (bytes + buffer.length > total) continue;
		payload.push({
			name,
			size: buffer.length,
			contentBase64: buffer.toString("base64"),
		});
		bytes += buffer.length;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	return payload;
}

/***
 * MARK: deleteTaskImage
 * @description Removes one image asset from a task's assets directory. Only
 *   allowed image extensions are removed (anything else is outside this
 *   endpoint's care and stays untouched). Returns whether a file was removed.
 * @example deleteTaskImage('/repo', 'task-1', 'a.png') => true
 * @example deleteTaskImage('/repo', 'task-1', 'notes.txt') => false
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @returns {boolean}
 ***/
export function deleteTaskImage(projectCwd, taskId, name, docsProject) {
	const safeName = sanitizeImageName(name);
	if (!safeName || !isAllowedImageExt(safeName)) return false;
	return deleteTaskAttachment(projectCwd, taskId, safeName, docsProject);
}

/***
 * MARK: deleteTaskAttachment
 * @description Removes one attachment from a task's assets directory. Only
 *   allowed attachment extensions are removed (anything else is outside
 *   this endpoint's care and stays untouched). Returns whether a file was
 *   removed. `deleteTaskImage` delegates here after its image-only guard.
 * @example deleteTaskAttachment('/repo', 'task-1', 'out.log') => true
 * @example deleteTaskAttachment('/repo', 'task-1', 'run.sh') => false
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} name
 * @returns {boolean}
 ***/
export function deleteTaskAttachment(projectCwd, taskId, name, docsProject) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name) return false;
	const safeName = sanitizeAttachmentName(name);
	if (!safeName || !isAllowedAttachmentExt(safeName)) return false;
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

/***
 * MARK: AttachmentIngestError
 * @description Structured ingest failure: `code` is one of
 *   `attachment-invalid-name` (the filename sanitized to nothing usable),
 *   `attachment-type-not-allowed` (extension outside the allowlist),
 *   `attachment-too-large` (bytes over `maxFileBytes`), or
 *   `attachment-limit-reached` (task already holds `maxPerTask` files).
 *   Carries the offending `fileName` and, for size failures, the `limit`,
 *   so routes can answer a precise 400/413 with a reason code.
 * @example new AttachmentIngestError('attachment-too-large', 'big.zip', 10485760).code => 'attachment-too-large'
 ***/
export class AttachmentIngestError extends Error {
	constructor(code, fileName, limit = null) {
		super(`${code}: ${fileName || "attachment"}`);
		this.name = "AttachmentIngestError";
		this.code = code;
		this.fileName = fileName;
		this.limit = limit;
	}
}

/***
 * MARK: ingestAttachment
 * @description Stores one file's bytes in a task's assets directory under a
 *   safe deterministic name: sanitize → extension-allowlist → caps → dedupe
 *   → write. Never overwrites (`out.log` becomes `out-2.log`). Bytes arrive
 *   either as `sourceBytes` (Buffer) or via `sourcePath` (read here, so
 *   route handlers stay thin; a `sourcePath` is size-gated from its stat
 *   BEFORE the read, so an oversized file is rejected without being
 *   loaded into memory). Throws `AttachmentIngestError` with a reason
 *   code on invalid names, disallowed types, oversized files, and full
 *   tasks; throws `Error` on unusable locations or non-buffer input.
 * @example ingestAttachment({ projectCwd: '/repo', taskId: 't1', sourceBytes: Buffer.from('x'), originalName: 'Out.LOG' }) => { name: 'out.log', relPath: 'assets/out.log', size: 1 }
 * @param {Object} opts
 * @param {string} opts.projectCwd
 * @param {string} opts.taskId
 * @param {Buffer} [opts.sourceBytes]
 * @param {string} [opts.sourcePath]
 * @param {string} opts.originalName
 * @param {Object|string} [opts.docsProject]
 * @param {number} [opts.maxFileBytes] - Per-file cap (default 10 MiB).
 * @param {number} [opts.maxPerTask] - Per-task count cap (default 20).
 * @returns {{name: string, relPath: string, size: number}}
 ***/
export function ingestAttachment({
	projectCwd,
	taskId,
	sourceBytes,
	sourcePath,
	originalName,
	docsProject,
	maxFileBytes,
	maxPerTask,
}) {
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) throw new Error("Invalid task attachment location");
	const safeName = sanitizeAttachmentName(originalName);
	if (!safeName) {
		throw new AttachmentIngestError("attachment-invalid-name", originalName);
	}
	if (!isAllowedAttachmentExt(safeName)) {
		throw new AttachmentIngestError("attachment-type-not-allowed", originalName);
	}
	const perFile =
		Number.isFinite(maxFileBytes) && maxFileBytes > 0
			? Math.floor(maxFileBytes)
			: 10 * 1024 * 1024;
	let buffer = sourceBytes;
	if (!Buffer.isBuffer(buffer) && typeof sourcePath === "string" && sourcePath) {
		/* eslint-disable security/detect-non-literal-fs-filename */
		// Size gate BEFORE reading: an oversized sourcePath is rejected
		// without pulling the whole file into memory first. An unstatable
		// path falls through to the read, which reports the real I/O error.
		let sourceSize = null;
		try {
			sourceSize = fs.statSync(sourcePath).size;
		} catch {
			sourceSize = null;
		}
		if (sourceSize !== null && sourceSize > perFile) {
			throw new AttachmentIngestError("attachment-too-large", originalName, perFile);
		}
		buffer = fs.readFileSync(sourcePath);
		/* eslint-enable security/detect-non-literal-fs-filename */
	}
	if (!Buffer.isBuffer(buffer)) throw new Error("Invalid task attachment bytes");
	if (buffer.length > perFile) {
		throw new AttachmentIngestError("attachment-too-large", originalName, perFile);
	}
	const perTask =
		Number.isFinite(maxPerTask) && maxPerTask > 0 ? Math.floor(maxPerTask) : 20;
	const existing = listTaskAttachments(projectCwd, taskId, docsProject);
	if (existing.length >= perTask) {
		throw new AttachmentIngestError("attachment-limit-reached", originalName, perTask);
	}
	const finalName = dedupeAttachmentName(
		existing.map((entry) => entry.name),
		safeName,
	);
	const relPath = writeTaskAttachment(projectCwd, taskId, finalName, buffer, docsProject);
	return { name: finalName, relPath, size: buffer.length };
}

/***
 * MARK: extractMarkdownDestinations
 * @description Collects every raw link/image destination (`[text](…)` and
 *   `![alt](…)`) from markdown text, in first-appearance order without
 *   duplicates. Unlike `extractAssetRefs` this keeps the RAW destination
 *   (angles, titles, and non-asset paths intact) so the ingest pass can
 *   classify out-of-task file references the asset grammar ignores.
 * @example extractMarkdownDestinations('See [log](/tmp/out.log) and ![a](assets/a.png)') => ['/tmp/out.log', 'assets/a.png']
 * @param {string} markdown - Text to scan.
 * @returns {string[]} Raw destinations found.
 ***/
export function extractMarkdownDestinations(markdown) {
	if (!markdown || typeof markdown !== "string") return [];
	// Same shape as the shared grammar's scan (angle form first so parens
	// inside `<...>` destinations capture whole), but raw: no normalization.
	// The angle branch additionally tolerates a trailing quoted title (the
	// shared scan stops at the first paren there); ingest-only, curation
	// keeps its own view.
	const pattern = /!?\[([^\]]*)\]\((<[^>\n]+>(?:\s+["'][^"']*["'])?|[^)]+)\)/g;
	const dests = [];
	const seen = new Set();
	let match;
	while ((match = pattern.exec(markdown)) !== null) {
		const dest = String(match[2] || "").trim();
		if (!dest || seen.has(dest)) continue;
		seen.add(dest);
		dests.push(dest);
	}
	return dests;
}

/***
 * MARK: bareMarkdownDestination
 * @description Strips CommonMark decorations from one raw link/image
 *   destination: `<...>` unwrapping, a trailing quoted title, and a stray
 *   trailing `>` — the same tolerance the shared `normalizeAssetSrc`
 *   applies, without the assets-only restriction, so ingest can compare
 *   out-of-task paths exactly.
 * @example bareMarkdownDestination('< /tmp/out.log > "run log"') => '/tmp/out.log'
 * @param {string} dest - Raw destination from inside the markdown parens.
 * @returns {string} The bare path (possibly "").
 ***/
export function bareMarkdownDestination(dest) {
	if (!dest || typeof dest !== "string") return "";
	const trimmed = dest.trim();
	if (!trimmed) return "";
	const angle = trimmed.match(/^<([^>\n]+)>(\s+["'][^"']*["']\s*)?$/);
	const withoutAngle = angle ? angle[1].trim() : trimmed.replace(/^<|>$/g, "");
	const titled = withoutAngle.match(/^(.*?)\s+["'][^"']*["']\s*$/);
	return (titled ? titled[1] : withoutAngle).trim().replace(/>$/, "");
}

/***
 * MARK: rewriteRefsToAssets
 * @description Rewrites markdown link/image destinations per `mapping`
 *   (`{ [bareDestination]: 'assets/<name>' }`): only destinations whose
 *   bare form exactly matches a key are replaced, image-vs-link markers
 *   and trailing titles survive, and everything else passes through
 *   untouched. Idempotent: rewritten `assets/…` destinations never match
 *   a mapping key, so a second pass is a no-op.
 * @example rewriteRefsToAssets('See [log](/tmp/out.log)', { '/tmp/out.log': 'assets/out.log' }) => 'See [log](assets/out.log)'
 * @param {string} markdown - Text to rewrite.
 * @param {Object} [mapping] - Bare-destination → new `assets/<name>` path.
 * @returns {string} Rewritten text (the input when nothing matches).
 ***/
export function rewriteRefsToAssets(markdown, mapping) {
	if (!markdown || typeof markdown !== "string") return markdown || "";
	if (!mapping || typeof mapping !== "object") return markdown;
	const keys = Object.keys(mapping);
	if (keys.length === 0) return markdown;
	const pattern = /(!?\[[^\]]*\]\()(<[^>\n]+>(?:\s+["'][^"']*["'])?|[^)]+)(\))/g;
	return markdown.replace(pattern, (whole, open, dest, close) => {
		const bare = bareMarkdownDestination(dest);
		const replacement = bare ? mapping[bare] : undefined;
		if (typeof replacement !== "string" || !replacement) return whole;
		// The stored name is flat and safe, so decorations are dropped and a
		// trailing quoted title is preserved verbatim when one was present.
		const trimmed = String(dest).trim();
		const angle = trimmed.match(/^<([^>\n]+)>(\s+["'][^"']*["']\s*)?$/);
		const withoutAngle = angle ? angle[1] : trimmed.replace(/^<|>$/g, "");
		const titled = withoutAngle.match(/^(.*?)\s+(["'][^"']*["'])\s*$/);
		const title = angle?.[2]?.trim() || titled?.[2] || "";
		return `${open}${replacement}${title ? ` ${title}` : ""}${close}`;
	});
}

/***
 * MARK: resolveOutOfTaskRef
 * @description Resolves one bare out-of-task file reference to an absolute
 *   source path whose bytes can be ingested, or null when the ref must be
 *   left alone. Already-asset refs (`assets/…`), absolute/protocol URLs,
 *   and query/fragment-suffixed refs read as null (never ingested);
 *   absolute paths resolve as-is, relative paths against the task folder
 *   first and the project root second. Containment is enforced on the
 *   real path (symlinks resolved): sources must live inside the project
 *   checkout or the OS temp dir and must be regular files. Refs already
 *   inside the task's own `assets/` dir still resolve here — the caller
 *   maps those directly instead of copying them.
 *   Never throws: unresolvable refs read as null.
 * @example resolveOutOfTaskRef('/repo', 't1', '/tmp/out.log') => '/tmp/out.log' (when the file exists)
 * @example resolveOutOfTaskRef('/repo', 't1', 'assets/a.png') => null
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {string} ref - Bare markdown destination (no angles/titles).
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {string|null} Absolute source path, or null.
 ***/
export function resolveOutOfTaskRef(projectCwd, taskId, ref, docsProject) {
	if (!projectCwd || !taskId || typeof ref !== "string") return null;
	const bare = ref.trim();
	if (!bare) return null;
	// Already-asset refs and URLs are never ingest candidates.
	if (normalizeAssetSrc(bare)) return null;
	if (/^(https?:)?\/\//i.test(bare) || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
	// Query/fragment suffixes would silently change meaning if rewritten.
	if (/[?#]/.test(bare)) return null;
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return null;
	const taskDir = path.dirname(assetsDir);
	const candidates = path.isAbsolute(bare)
		? [bare]
		: [path.resolve(taskDir, bare), path.resolve(projectCwd, bare)];
	let allowedRoots;
	try {
		allowedRoots = [
			fs.realpathSync(projectCwd),
			fs.realpathSync(os.tmpdir()),
		];
	} catch {
		return null;
	}
	/* eslint-disable security/detect-non-literal-fs-filename */
	for (const candidate of candidates) {
		let real;
		try {
			real = fs.realpathSync(candidate);
			const stat = fs.statSync(real);
			if (!stat.isFile()) continue;
		} catch {
			continue;
		}
		const inside = allowedRoots.some(
			(root) => real === root || real.startsWith(`${root}${path.sep}`),
		);
		if (!inside) continue;
		return real;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	return null;
}

/***
 * MARK: ingestOutOfTaskRefs
 * @description Ingests every out-of-task file referenced by markdown
 *   link/image destinations into the task's `assets/` folder and rewrites
 *   those destinations to the stored `assets/<name>` paths. Canonical
 *   `assets/…` refs and absolute URLs pass through; fuller asset path
 *   forms (`./assets/x`, task-folder prefixes, absolute paths into the
 *   assets dir) normalize to the canonical form when the bytes exist;
 *   refs resolving directly inside the task's own `assets/` dir map
 *   without a copy; unresolvable, oversized (size-gated from the stat
 *   BEFORE the file is read, so a huge ref cannot exhaust memory),
 *   disallowed, or over-cap refs keep their text and are reported in
 *   `skipped` (never silently dropped).
 *   Best-effort per ref and never throws: failures isolate to one entry.
 * @example ingestOutOfTaskRefs({ projectCwd: '/repo', taskId: 't1', markdown: 'See [l](/tmp/o.log)' }).ingested => [{ from: '/tmp/o.log', to: 'assets/o.log', name: 'o.log', size: 1 }]
 * @param {Object} opts
 * @param {string} opts.projectCwd
 * @param {string} opts.taskId
 * @param {string} opts.markdown - Text to ingest + rewrite.
 * @param {Object|string} [opts.docsProject]
 * @param {number} [opts.maxFileBytes] - Per-file cap (default 10 MiB).
 * @param {number} [opts.maxPerTask] - Per-task count cap (default 20).
 * @returns {{markdown: string, ingested: Array, skipped: Array<{ref: string, reason: string}>}}
 ***/
export function ingestOutOfTaskRefs({
	projectCwd,
	taskId,
	markdown,
	docsProject,
	maxFileBytes,
	maxPerTask,
}) {
	const outcome = { markdown: markdown || "", ingested: [], skipped: [] };
	if (!projectCwd || !taskId || !markdown || typeof markdown !== "string") {
		return outcome;
	}
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir) return outcome;
	const perFile =
		Number.isFinite(maxFileBytes) && maxFileBytes > 0
			? Math.floor(maxFileBytes)
			: 10 * 1024 * 1024;
	let assetsReal;
	try {
		assetsReal = fs.existsSync(assetsDir) ? fs.realpathSync(assetsDir) : assetsDir;
	} catch {
		assetsReal = assetsDir;
	}
	const mapping = {};
	for (const dest of extractMarkdownDestinations(markdown)) {
		const bare = bareMarkdownDestination(dest);
		if (!bare || mapping[bare]) continue;
		// Already-asset refs are not ingest candidates — except fuller path
		// forms (`./assets/x`, task-folder prefixes, absolute paths into
		// the assets dir) that normalize to an asset ref: those rewrite to
		// the portable canonical form when the bytes exist, and are left
		// untouched when they do not (never manufacture a dangling ref).
		const normalized = normalizeAssetSrc(bare);
		if (normalized) {
			if (normalized !== bare) {
				let resolved = null;
				try {
					resolved = resolveAssetRef(projectCwd, taskId, normalized, docsProject);
				} catch {
					resolved = null;
				}
				if (resolved && resolved.present) {
					mapping[bare] = normalized;
					outcome.ingested.push({
						from: bare,
						to: normalized,
						name: resolved.name,
						size: 0,
						direct: true,
					});
				}
			}
			continue;
		}
		if (/^(https?:)?\/\//i.test(bare) || /^[a-z][a-z0-9+.-]*:/i.test(bare)) continue;
		let source;
		try {
			source = resolveOutOfTaskRef(projectCwd, taskId, bare, docsProject);
		} catch {
			source = null;
		}
		if (!source) {
			outcome.skipped.push({ ref: bare, reason: "unresolvable" });
			continue;
		}
		// A ref already naming a file sitting directly in the task's own
		// assets dir maps to its `assets/<name>` form — copying would just
		// fork it into a `-2` duplicate. Deeper nesting under `assets/`
		// falls through to the copy below (flattened into the folder).
		if (path.dirname(source) === assetsReal) {
			const direct = `assets/${path.basename(source)}`;
			mapping[bare] = direct;
			outcome.ingested.push({
				from: bare,
				to: direct,
				name: path.basename(source),
				size: 0,
				direct: true,
			});
			continue;
		}
		// Size gate BEFORE reading: a failure report or goal naming a
		// multi-GB file must be skipped without loading it into memory.
		let sourceSize = null;
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			sourceSize = fs.statSync(source).size;
			/* eslint-enable security/detect-non-literal-fs-filename */
		} catch {
			sourceSize = null;
		}
		if (sourceSize !== null && sourceSize > perFile) {
			outcome.skipped.push({ ref: bare, reason: "attachment-too-large" });
			continue;
		}
		let stored;
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			const buffer = fs.readFileSync(source);
			/* eslint-enable security/detect-non-literal-fs-filename */
			stored = ingestAttachment({
				projectCwd,
				taskId,
				sourceBytes: buffer,
				originalName: path.basename(source),
				docsProject,
				maxFileBytes,
				maxPerTask,
			});
		} catch (err) {
			outcome.skipped.push({
				ref: bare,
				reason: err instanceof AttachmentIngestError ? err.code : "unreadable",
			});
			continue;
		}
		mapping[bare] = stored.relPath;
		outcome.ingested.push({
			from: bare,
			to: stored.relPath,
			name: stored.name,
			size: stored.size,
		});
	}
	if (Object.keys(mapping).length > 0) {
		outcome.markdown = rewriteRefsToAssets(markdown, mapping);
	}
	return outcome;
}

/***
 * MARK: auditTaskAttachmentRefs
 * @description Dry-run report for one markdown text: the dangling `assets/…`
 *   refs (no bytes on disk — see `findMissingAssetRefs`) plus every
 *   out-of-task file destination with whether its bytes are still
 *   resolvable on this box. Read-only: never writes, never rewrites.
 *   Powers the backfill auditor (`scripts/audit-task-attachments.mjs`).
 * @example auditTaskAttachmentRefs({ projectCwd: '/repo', taskId: 't1', markdown: '![a](assets/a.png)' }).missing => []
 * @param {Object} opts
 * @param {string} opts.projectCwd
 * @param {string} opts.taskId
 * @param {string} opts.markdown - Text to audit.
 * @param {Object|string} [opts.docsProject]
 * @returns {{missing: Array, outOfTask: Array<{ref: string, resolvable: boolean}>}}
 ***/
export function auditTaskAttachmentRefs({ projectCwd, taskId, markdown, docsProject }) {
	const missing = findMissingAssetRefs(projectCwd, taskId, markdown || "", docsProject);
	const outOfTask = [];
	if (projectCwd && taskId && typeof markdown === "string" && markdown) {
		for (const dest of extractMarkdownDestinations(markdown)) {
			const bare = bareMarkdownDestination(dest);
			if (!bare || normalizeAssetSrc(bare)) continue;
			if (/^(https?:)?\/\//i.test(bare) || /^[a-z][a-z0-9+.-]*:/i.test(bare)) continue;
			if (outOfTask.some((entry) => entry.ref === bare)) continue;
			let resolved = null;
			try {
				resolved = resolveOutOfTaskRef(projectCwd, taskId, bare, docsProject);
			} catch {
				resolved = null;
			}
			outOfTask.push({ ref: bare, resolvable: Boolean(resolved) });
		}
	}
	return { missing, outOfTask };
}