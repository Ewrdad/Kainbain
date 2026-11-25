// Domain: The Work — task asset reference grammar (shared single owner).
// UI-safe (no node builtins): the backend re-exports this single owner so
// upload validation, serve parity, and submit-time feedback validation all
// classify extensions identically.
import { IMAGE_EXTENSIONS } from "./imageExtensions.js";

/***
 * MARK: isAllowedImageExt
 * @description Whether a filename carries an allowed image extension (png/jpg/jpeg/gif/webp), case-insensitive.
 * @example isAllowedImageExt('photo.PNG') => true
 * @example isAllowedImageExt('payload.svg') => false
 * @param {string} filename
 * @returns {boolean}
 ***/
export function isAllowedImageExt(filename) {
	// Local trailing-extension read (no `path` — this module runs in the
	// browser too): final path segment, substring after the last dot. A
	// leading dot (`.bashrc`) or a trailing dot (`a.`) carries no extension,
	// exactly like `path.extname`.
	function trailingExt(raw) {
		const base = String(raw || "")
			.replace(/\\/g, "/")
			.split("/")
			.pop();
		const dot = base.lastIndexOf(".");
		if (dot <= 0 || dot === base.length - 1) return "";
		return base.slice(dot + 1).toLowerCase();
	}
	return IMAGE_EXTENSIONS.includes(trailingExt(filename));
}
