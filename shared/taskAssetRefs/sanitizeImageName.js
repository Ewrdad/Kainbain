// Domain: The Work — task asset reference grammar (shared single owner).
// UI-safe (no node builtins): the backend re-exports this single owner so
// submit-time feedback validation canonicalises names exactly like the
// upload endpoint and the serve route, and drifted-but-servable refs never
// block a human.

/** Maximum sanitized filename length (including extension). */
const MAX_IMAGE_NAME_LENGTH = 120;

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
	if (!rawName || typeof rawName !== "string") return "";
	// Local raw-extension read (no `path` — this module runs in the
	// browser too): substring from the last dot, exactly like
	// `path.extname` on the slash-free names this function classifies
	// (a leading dot carries no extension; a trailing dot reads as ".").
	function rawExt(name) {
		const dot = String(name).lastIndexOf(".");
		if (dot <= 0) return "";
		return String(name).slice(dot);
	}
	// Normalize separators and keep only the final path segment: any traversal
	// payload (`../`, `..\`, absolute paths) collapses to the bare filename.
	const base = String(rawName).replace(/\\/g, "/").split("/").pop() || "";
	let name = base
		.normalize("NFKD")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.toLowerCase();
	// Split stem/extension so trimming and the length cap never eat the extension.
	// A degenerate trailing dot ("trailing..") is not an extension: it must trim.
	const rawExtension = rawExt(name);
	const ext = /^\.[A-Za-z0-9]+$/.test(rawExtension)
		? rawExtension.toLowerCase()
		: "";
	let stem = ext ? name.slice(0, name.length - rawExtension.length) : name;
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
