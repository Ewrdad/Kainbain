// Domain: The Work — image assets stored beside task.md in each task folder.
// Images live in `<projectRoot>/docs/tasks/<taskId>/assets/` and are referenced
// from task markdown with relative paths (`![alt](assets/foo.png)`), never
// base64-embedded.
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { resolveDocsDirName, resolveTasksDir } from "../docsPath.js";
import {
	extractAssetRefs,
	normalizeAssetSrc,
	IMAGE_EXTENSIONS,
	isAllowedImageExt,
	sanitizeImageName,
} from "../../shared/taskAssetRefs/index.js";

// Single-owner re-export: the extension allowlist, the extension check, and
// the filename sanitizer live in shared/taskAssetRefs (UI-safe, no node
// builtins) so submit-time feedback validation classifies names exactly
// like the upload endpoint and the serve route. Every existing importer
// keeps working unchanged through this re-export.
export { IMAGE_EXTENSIONS, isAllowedImageExt, sanitizeImageName };

/** Content-Type served for each allowed image extension. */
const IMAGE_MEDIA_TYPES = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

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
 * MARK: resolveAssetRef
 * @description Resolves one markdown asset destination against a task's
 *   assets directory: literal filename match first, then the serve route's
 *   canonicalisation (an on-disk image whose `sanitizeImageName` equals the
 *   ref's), so drifted-but-servable refs never warn. Non-asset input
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
	// even a hand-placed non-image the upload endpoint would never store.
	if (files.includes(name)) return { ...outcome, present: true };
	// Serve parity (routes/taskImages.js): only image extensions take part
	// in the canonical fallback — the route rejects anything else first.
	const canonical = sanitizeImageName(name);
	if (!canonical || !isAllowedImageExt(canonical)) return outcome;
	const served = files.some(
		(entry) =>
			isAllowedImageExt(entry) && sanitizeImageName(entry) === canonical,
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
 *   sanitized-image matches both count (the same two tiers as
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
		const canonical = sanitizeImageName(name);
		if (!canonical || !isAllowedImageExt(canonical)) return true;
		return !names.some(
			(onBranch) =>
				isAllowedImageExt(onBranch) && sanitizeImageName(onBranch) === canonical,
		);
	});
}

/***
 * MARK: formatMissingAssetWarning
 * @description Formats the MISSING-ASSET prompt block: one line per missing
 *   file with the exact ref and its expected task-folder path, plus the
 *   fail-fast instruction (do not guess at visual content; proceed from
 *   source and say the screenshot was unavailable). Empty input yields ""
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
	return [
		"# Missing Task Assets",
		`MISSING-ASSET: the task references ${count} not in its assets folder:`,
		...lines,
		"Do not guess at their visual content. Proceed from source, say the screenshot was unavailable, and continue working — re-uploading the file heals the next run automatically.",
	].join("\n");
}

/***
 * MARK: collectTaskAssetPayload
 * @description The task's on-disk images as base64 shipment entries for
 *   Runner claims (`[{ name, size, contentBase64 }]`), sorted by name for a
 *   deterministic payload. Images only (delivery stays image-capped);
 *   unreadable files, files over `maxFileBytes`, and additions past
 *   `maxTotalBytes` are skipped. Never throws: missing tasks yield [].
 * @example collectTaskAssetPayload('/repo', 'task-1') => [{ name: 'a.png', size: 12, contentBase64: '...' }]
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @param {Object} [opts]
 * @param {number} [opts.maxFileBytes] - Per-file cap (default 10 MiB, mirroring `taskImageMaxBytes`).
 * @param {number} [opts.maxTotalBytes] - Payload cap (default 10 MiB, mirroring `taskImageMaxAttachBytes`).
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
			.filter((entry) => entry.isFile() && isAllowedImageExt(entry.name))
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));
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
	const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
	if (!assetsDir || !name) return false;
	const safeName = sanitizeImageName(name);
	if (!safeName || !isAllowedImageExt(safeName)) return false;
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