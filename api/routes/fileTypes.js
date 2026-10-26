import path from "node:path";

/***
 * MARK: explorer file types
 * @description Shared classification for the Repository & Files explorer: which
 *   extensions render as images, which render as markdown, and which must
 *   never be decoded as UTF-8 text. The frontend mirrors this allowlist in
 *   `frontend/src/components/explorer/fileKind.js` (kept in sync by hand so
 *   the browser bundle never imports server code).
 * @example extToKind('.png') => 'image'
 * @example extToMime('.svg') => 'image/svg+xml'
 ***/

/***
 * MARK: IMAGE_EXTENSIONS
 * @description Image extensions previewable in the explorer (lowercase, with
 *   the leading dot). Served as raw bytes so the browser decodes and caches them.
 * @example IMAGE_EXTENSIONS.includes('.png') => true
 ***/
export const IMAGE_EXTENSIONS = [
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".avif",
	".bmp",
	".ico",
	".svg",
];

/***
 * MARK: MARKDOWN_EXTENSIONS
 * @description Extensions rendered as markdown in the explorer preview pane.
 * @example MARKDOWN_EXTENSIONS.includes('.md') => true
 ***/
export const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

/***
 * MARK: BINARY_EXTENSIONS
 * @description Extensions that are never decoded as text (archives,
 *   executables, fonts, media, and binary documents). Shown with a
 *   download affordance instead of a text preview.
 * @example BINARY_EXTENSIONS.includes('.zip') => true
 ***/
export const BINARY_EXTENSIONS = [
	".zip",
	".tar",
	".gz",
	".7z",
	".rar",
	".exe",
	".dll",
	".so",
	".dylib",
	".bin",
	".dat",
	".db",
	".sqlite",
	".pdf",
	".mp3",
	".mp4",
	".avi",
	".mov",
	".wav",
	".ogg",
	".flac",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".eot",
];

/***
 * MARK: IMAGE_MIME_TYPES
 * @description Content-Type served for each previewable image extension.
 ***/
const IMAGE_MIME_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".svg": "image/svg+xml",
};

/***
 * MARK: RAW_PREVIEW_MAX_BYTES
 * @description Largest file served inline for image preview (15 MB). Larger
 *   files answer 413 so the viewer shows a download affordance instead of
 *   hanging on a huge transfer. Directory listings are never capped.
 * @example RAW_PREVIEW_MAX_BYTES => 15728640
 ***/
export const RAW_PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

/***
 * MARK: normalizeExtension
 * @description Reduces a filename, path, or bare extension to a lowercase
 *   dot-extension ("" when there is none).
 * @example normalizeExtension('PHOTO.PNG') => '.png'
 * @example normalizeExtension('docs/a/b/icon.svg') => '.svg'
 * @param {string|null} value
 * @returns {string}
 ***/
export function normalizeExtension(value) {
	if (!value || typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (/^\.[^./\\]+$/.test(trimmed)) return trimmed.toLowerCase();
	return path.extname(trimmed).toLowerCase();
}

/***
 * MARK: isImageExtension
 * @description Whether a filename or extension names a previewable image.
 * @example isImageExtension('photo.PNG') => true
 * @param {string|null} value
 * @returns {boolean}
 ***/
export function isImageExtension(value) {
	return IMAGE_EXTENSIONS.includes(normalizeExtension(value));
}

/***
 * MARK: isMarkdownExtension
 * @description Whether a filename or extension names a markdown document.
 * @example isMarkdownExtension('notes.MARKDOWN') => true
 * @param {string|null} value
 * @returns {boolean}
 ***/
export function isMarkdownExtension(value) {
	return MARKDOWN_EXTENSIONS.includes(normalizeExtension(value));
}

/***
 * MARK: extToMime
 * @description The Content-Type for an image extension, falling back to
 *   application/octet-stream for anything else.
 * @example extToMime('.svg') => 'image/svg+xml'
 * @param {string|null} value
 * @returns {string}
 ***/
export function extToMime(value) {
	return IMAGE_MIME_TYPES[normalizeExtension(value)] || "application/octet-stream";
}

/***
 * MARK: extToKind
 * @description The explorer preview kind for a filename or extension:
 *   image, markdown, unsupported-binary, or text.
 * @example extToKind('.png') => 'image'
 * @example extToKind('.zip') => 'unsupported-binary'
 * @param {string|null} value
 * @returns {string}
 ***/
export function extToKind(value) {
	const ext = normalizeExtension(value);
	if (IMAGE_EXTENSIONS.includes(ext)) return "image";
	if (MARKDOWN_EXTENSIONS.includes(ext)) return "markdown";
	if (BINARY_EXTENSIONS.includes(ext)) return "unsupported-binary";
	return "text";
}

/***
 * MARK: looksBinary
 * @description Belt-and-braces null-byte sniff over the head of a file buffer:
 *   text files never contain NUL, so a zero byte in the sampled head means
 *   the file must not be decoded as UTF-8 even when its extension is unknown.
 * @example looksBinary(Buffer.from('GIF89a\x00', 'binary')) => true
 * @param {Buffer} buffer
 * @param {number} sampleSize
 * @returns {boolean}
 ***/
export function looksBinary(buffer, sampleSize = 8192) {
	if (!buffer || buffer.length === 0) return false;
	const head = buffer.subarray(0, Math.min(buffer.length, sampleSize));
	return head.includes(0);
}
